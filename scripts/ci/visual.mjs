#!/usr/bin/env node
// Visual regression test: serves the built client (client/dist), screenshots key pages in headless Chrome
// and compares them pixel by pixel (pixelmatch) with the committed baselines in tests/visual/baseline/.
// See tests/visual/README.md for how to update baselines and read diffs.
//
//   node scripts/ci/visual.mjs [--dir client/dist] [--update] [--only home,login] [--max-diff 0.05]
//                              [--threshold 0.1] [--concurrency 4] [--log-api] [--verbose]
//                              [--baseline tests/visual/baseline] [--out tests/visual/output]
//
// --update     writes the screenshots as the new baselines. Only on CI's platform (Linux runner): fonts
//              render differently on Windows/macOS. In CI: Actions -> "Visual baselines" -> Run workflow.
// --max-diff   percent of a shot's pixels that may differ before it fails (default 0.05; env VISUAL_MAX_DIFF).
// --threshold  pixelmatch per-pixel colour distance 0..1 (default 0.1; anti-aliased pixels are ignored).
// --only       comma-separated substrings of shot names to run.
// --log-api    prints every /api request the pages make, marking the ones without a fixture.
// --verbose    prints page errors with their stack.
// --baseline   baseline folder (default tests/visual/baseline; local experiments use a scratch folder).
// --out        where diffs / actual screenshots / bootstrap baselines go (default tests/visual/output).
//
// Bootstrap: a shot without a baseline never fails. Its screenshot is written to <out>/new-baselines/
// (uploaded as a CI artifact) with a notice, so the first run after adding shots does not block deploys.
//
// Determinism: the API is never called. /api requests are answered from scripts/ci/visual-fixtures/
// (fixtures.mjs; unknown ones get 404), every other origin is blocked. Fresh browser context per shot,
// fixed viewport and device scale, frozen Date (2026-01-15 10:00 UTC), seeded Math.random, Europe/Berlin
// timezone, reduced motion + animations/transitions/caret off, fonts and images awaited, network idle,
// and the screenshot is taken only once two consecutive captures are identical.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { startStaticServer } from './static-server.mjs';
import { resolveFixture, USERS } from './visual-fixtures/fixtures.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);

const UPDATE = flag('update');
const LOG_API = flag('log-api');
const VERBOSE = flag('verbose');
const MAX_DIFF = Number(arg('max-diff', process.env.VISUAL_MAX_DIFF ?? '0.05')); // percent of pixels
const THRESHOLD = Number(arg('threshold', '0.1'));
const CONCURRENCY = Number(arg('concurrency', '4'));
const MAX_HEIGHT = 4000; // full-page shots are cut here
const BASELINE_DIR = path.resolve(arg('baseline', path.join(root, 'tests', 'visual', 'baseline')));
const OUTPUT_DIR = path.resolve(arg('out', path.join(root, 'tests', 'visual', 'output')));
const NEW_DIR = path.join(OUTPUT_DIR, 'new-baselines');
const CHROME_FILE = path.join(BASELINE_DIR, 'chrome-version.txt');
const FROZEN_NOW = Date.parse('2026-01-15T10:00:00Z');

const VIEWPORTS = { desktop: { width: 1366, height: 900 }, mobile: { width: 390, height: 844 } };

// name: <page>-<viewport>-<theme>. user: null (visitor) | key of USERS in fixtures.mjs.
// full: whole page (up to MAX_HEIGHT) instead of the viewport (app screens scroll inside their own panes).
const SHOTS = [
  { page: 'home', route: '/', vp: 'desktop', theme: 'light', full: true },
  { page: 'home', route: '/', vp: 'desktop', theme: 'dark', full: true },
  { page: 'home', route: '/', vp: 'mobile', theme: 'light', full: true },
  { page: 'login', route: '/login', vp: 'desktop', theme: 'light' },
  { page: 'login', route: '/login', vp: 'mobile', theme: 'dark' },
  { page: 'register', route: '/register', vp: 'desktop', theme: 'light', full: true },
  { page: 'register', route: '/register', vp: 'mobile', theme: 'light', full: true },
  { page: 'jobs', route: '/jobs', vp: 'desktop', theme: 'light', full: true },
  { page: 'jobs', route: '/jobs', vp: 'mobile', theme: 'dark', full: true },
  { page: 'portal', route: '/account', vp: 'desktop', theme: 'light', user: 'client', full: true },
  { page: 'portal', route: '/account', vp: 'mobile', theme: 'dark', user: 'client', full: true },
  { page: 'admin-cases', route: '/admin/cases', vp: 'desktop', theme: 'light', user: 'admin' },
  { page: 'admin-cases', route: '/admin/cases', vp: 'desktop', theme: 'dark', user: 'admin' },
  { page: 'admin-case', route: '/admin/cases/case-1', vp: 'desktop', theme: 'light', user: 'admin' },
  { page: 'drive', route: '/workspace/drive/f/drv-shared', vp: 'desktop', theme: 'light', user: 'admin' },
  { page: 'drive', route: '/workspace/drive/f/drv-shared', vp: 'desktop', theme: 'dark', user: 'admin' },
].map((s) => ({ user: null, full: false, lang: 'az', ...s, name: `${s.page}-${s.vp}-${s.theme}` }));

const only = (arg('only', '') ?? '').split(',').filter(Boolean);
const selected = only.length ? SHOTS.filter((s) => only.some((o) => s.name.includes(o))) : SHOTS;

// Hidden in every shot: things that depend on time, chance or idle timing rather than on the design.
const MASK = ['[data-visual-mask]', '[data-sonner-toaster]', 'iframe', 'video'];
const STYLE = `
*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}
${MASK.join(',')}{visibility:hidden!important}
html,body{scrollbar-width:none!important}
::-webkit-scrollbar{display:none!important}
`;

const findChrome = () => {
  const candidates = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  const hit = candidates.find((c) => c && fs.existsSync(c));
  if (!hit) throw new Error('Chrome not found: set CHROME_PATH');
  return hit;
};

/** Runs in the page before any of its scripts. */
function preparePage({ theme, lang, now, userId }) {
  // Frozen clock: Date.now() / new Date() always return the same instant (timers still run normally).
  const RealDate = Date;
  class FrozenDate extends RealDate {
    constructor(...a) {
      if (a.length === 0) super(now);
      else super(...a);
    }
    static now() {
      return now;
    }
  }
  globalThis.Date = FrozenDate;
  // performance.now() drives some JS animations: keep it, but Math.random is seeded (mulberry32).
  let seed = 0x2f6b9a1d;
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  try {
    sessionStorage.setItem('tv_intro', '1');
    localStorage.setItem('tv_prefs', JSON.stringify({ theme, noMotion: true }));
    localStorage.setItem('tv_lang', lang);
    // Guided tours would start (and navigate) on a user's first visit.
    if (userId) for (const tour of ['client', 'staff']) localStorage.setItem(`tv-tour:${userId}:${tour}`, 'never');
    localStorage.setItem('tv.consent', JSON.stringify({ analytics: false, marketing: false, v: '1', at: new RealDate(now).toISOString() }));
  } catch {
    /* storage unavailable */
  }
}

const apiSeen = new Map();

let browser;
const launch = () =>
  puppeteer.launch({
    executablePath: findChrome(),
    headless: true,
    protocolTimeout: 90_000,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--hide-scrollbars',
      '--font-render-hinting=none',
      '--disable-lcd-text',
      '--force-color-profile=srgb',
      '--disable-skia-runtime-opts',
      '--disable-partial-raster',
      '--disable-gpu',
      // Several tabs render in parallel: keep timers and requestAnimationFrame running in all of them.
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
    ],
  });

/** Takes one screenshot; returns { png, errors }. */
const capture = async (base, shot) => {
  const context = await browser.createBrowserContext();
  try {
    const page = await context.newPage();
    const vp = VIEWPORTS[shot.vp];
    const mobile = shot.vp === 'mobile';
    await page.setViewport({ ...vp, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
    await page.setBypassServiceWorker(true);
    await page.emulateMediaFeatures([
      { name: 'prefers-reduced-motion', value: 'reduce' },
      { name: 'prefers-color-scheme', value: shot.theme },
    ]);
    await page.emulateTimezone('Europe/Berlin');
    const user = shot.user ? USERS[shot.user] : null;
    await page.evaluateOnNewDocument(preparePage, { theme: shot.theme, lang: shot.lang, now: FROZEN_NOW, userId: user?.id ?? null });
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = new URL(req.url());
      if (url.origin !== base) return void req.abort('blockedbyclient');
      if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) {
        const hit = resolveFixture({ method: req.method(), path: url.pathname, query: url.searchParams, user, shot });
        if (LOG_API) {
          const key = `${hit ? '   ' : '404'} ${req.method()} ${url.pathname}${url.search}`;
          apiSeen.set(key, (apiSeen.get(key) ?? 0) + 1);
        }
        if (hit) {
          const body = typeof hit.body === 'string' || Buffer.isBuffer(hit.body) ? hit.body : JSON.stringify(hit.body);
          return void req.respond({ status: hit.status ?? 200, contentType: hit.contentType ?? 'application/json', body });
        }
        return void req.respond({ status: 404, contentType: 'application/json', body: '{"error":"NOT_FOUND"}' });
      }
      req.continue();
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(VERBOSE ? String(e.stack ?? e) : String(e)));
    await page.goto(`${base}${shot.route}`, { waitUntil: 'load', timeout: 60_000 });
    await page.addStyleTag({ content: STYLE });
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 15_000 }).catch(() => undefined);
    if (shot.full) {
      // Walk down the page so scroll-triggered reveals and lazy sections happen, then back to the top.
      await page.evaluate(async (maxH) => {
        const step = Math.max(300, Math.floor(window.innerHeight * 0.8));
        const end = Math.min(document.documentElement.scrollHeight, maxH + window.innerHeight);
        for (let y = 0; y < end; y += step) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 80));
        }
        window.scrollTo(0, 0);
      }, MAX_HEIGHT);
      await page.waitForNetworkIdle({ idleTime: 500, timeout: 15_000 }).catch(() => undefined);
    }
    const settle = () =>
      page.evaluate(async () => {
        for (const a of document.getAnimations()) {
          try {
            a.finish();
          } catch {
            a.cancel(); // infinite animation
          }
        }
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        // Lazy images below the fold may never load: bounded wait.
        const pending = [...document.images].filter((i) => !i.complete && i.loading !== 'lazy');
        await Promise.race([
          Promise.all([document.fonts.ready, ...pending.map((i) => new Promise((r) => ((i.onload = r), (i.onerror = r))))]),
          new Promise((r) => setTimeout(r, 3000)),
        ]);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      });
    await page.mouse.move(0, 0);
    await settle();
    await new Promise((r) => setTimeout(r, 400));
    await settle();
    // Stable when two consecutive screenshots are identical (JS-driven animations, late layout shifts).
    const shoot = async () => {
      const height = shot.full ? await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight)) : vp.height;
      const buf = await page.screenshot({
        type: 'png',
        clip: { x: 0, y: 0, width: vp.width, height: Math.min(Math.max(height, vp.height), MAX_HEIGHT) },
        captureBeyondViewport: shot.full,
      });
      return Buffer.from(buf);
    };
    let png = await shoot();
    let stable = false;
    for (let i = 0; i < 8 && !stable; i++) {
      await new Promise((r) => setTimeout(r, 300));
      await settle();
      const next = await shoot();
      stable = next.equals(png);
      png = next;
    }
    if (!stable) errors.push('page did not settle (consecutive screenshots differ)');
    return { png, errors, path: new URL(page.url()).pathname };
  } finally {
    await context.close().catch(() => undefined);
  }
};

/** Copies a PNG onto a w x h canvas (missing area: opaque magenta, so it always counts as changed). */
const padTo = (img, w, h) => {
  if (img.width === w && img.height === h) return img;
  const out = new PNG({ width: w, height: h });
  for (let i = 0; i < out.data.length; i += 4) out.data.set([255, 0, 255, 255], i);
  PNG.bitblt(img, out, 0, 0, img.width, img.height, 0, 0);
  return out;
};

const compare = (actual, expected) => {
  let a = PNG.sync.read(actual);
  let e = PNG.sync.read(expected);
  // A changed page height (full-page shots) is compared on the larger canvas, so the diff still shows where.
  const note = a.width !== e.width || a.height !== e.height ? `size ${a.width}x${a.height} vs baseline ${e.width}x${e.height}` : undefined;
  const w = Math.max(a.width, e.width);
  const h = Math.max(a.height, e.height);
  a = padTo(a, w, h);
  e = padTo(e, w, h);
  const diff = new PNG({ width: w, height: h });
  const n = pixelmatch(a.data, e.data, diff.data, w, h, { threshold: THRESHOLD, alpha: 0.2 });
  return { ratio: n / (w * h), pixels: n, note, diff: PNG.sync.write(diff) };
};

const started = Date.now();
fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUTPUT_DIR, { recursive: true });
if (UPDATE) fs.mkdirSync(BASELINE_DIR, { recursive: true });

const { url: base, close } = await startStaticServer({ dir: arg('dir', path.join(root, 'client', 'dist')) });
browser = await launch();
const chromeVersion = await browser.version();
const baselineChrome = fs.existsSync(CHROME_FILE) ? fs.readFileSync(CHROME_FILE, 'utf8').trim() : null;
console.log(`${chromeVersion} on ${process.platform}; ${selected.length} shot(s); max diff ${MAX_DIFF}% of pixels`);
if (process.platform !== 'linux' && UPDATE) {
  console.log('::warning::Baselines written on a non-Linux machine are for local use only; CI renders fonts differently.');
}
if (!UPDATE && baselineChrome && baselineChrome !== chromeVersion) {
  console.log(`::warning::Baselines were made with ${baselineChrome}, this run uses ${chromeVersion}. Rendering may differ slightly; re-run "Visual baselines" if only anti-aliasing changed.`);
}
const results = [];
try {
  const queue = [...selected];
  const worker = async () => {
    for (let shot = queue.shift(); shot; shot = queue.shift()) {
      let res;
      try {
        res = await capture(base, shot);
      } catch (err) {
        console.log(`     (retrying ${shot.name} after: ${String(err).split('\n')[0]})`);
        if (!browser.connected) browser = await launch();
        res = await capture(base, shot);
      }
      const file = path.join(BASELINE_DIR, `${shot.name}.png`);
      const r = { name: shot.name, errors: res.errors };
      // A redirect (e.g. to /login because the fixture user was rejected) is a broken shot, not a design.
      if (res.path !== new URL(shot.route, base).pathname) r.errors.push(`ended on ${res.path} instead of ${shot.route}`);
      if (UPDATE) {
        fs.writeFileSync(file, res.png);
        r.status = 'updated';
      } else if (!fs.existsSync(file)) {
        fs.mkdirSync(NEW_DIR, { recursive: true });
        fs.writeFileSync(path.join(NEW_DIR, `${shot.name}.png`), res.png);
        r.status = 'new';
      } else {
        const c = compare(res.png, fs.readFileSync(file));
        r.ratio = c.ratio;
        r.note = c.note;
        r.status = c.ratio * 100 > MAX_DIFF || c.note ? 'FAIL' : 'ok';
        if (c.ratio > 0) {
          fs.writeFileSync(path.join(OUTPUT_DIR, `${shot.name}.actual.png`), res.png);
          fs.copyFileSync(file, path.join(OUTPUT_DIR, `${shot.name}.expected.png`));
          if (c.diff) fs.writeFileSync(path.join(OUTPUT_DIR, `${shot.name}.diff.png`), c.diff);
        }
      }
      results.push(r);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, CONCURRENCY) }, worker));
} finally {
  await browser.close().catch(() => undefined);
  await close();
}

results.sort((a, b) => a.name.localeCompare(b.name));
const w = Math.max(...results.map((r) => r.name.length));
console.log(`\n${'shot'.padEnd(w)}  status   diff`);
for (const r of results) {
  const pct = r.ratio === undefined ? '' : `${(r.ratio * 100).toFixed(3)}%`;
  console.log(`${r.name.padEnd(w)}  ${r.status.padEnd(7)}  ${pct}${r.note ? `  (${r.note})` : ''}`);
  for (const e of r.errors) console.log(`${' '.repeat(w)}  page error: ${VERBOSE ? e : e.split('\n')[0]}`);
}
if (LOG_API) {
  console.log('\n/api requests (404 = no fixture):');
  for (const [k, n] of [...apiSeen].sort()) console.log(`  ${String(n).padStart(3)}x ${k}`);
}
const secs = ((Date.now() - started) / 1000).toFixed(1);
const failed = results.filter((r) => r.status === 'FAIL');
const fresh = results.filter((r) => r.status === 'new');
const withErrors = results.filter((r) => r.errors.length);
if (withErrors.length) {
  console.log(`::warning title=Visual test page errors::${withErrors.map((r) => r.name).join(', ')}: page errors or a redirect (see the table). Check fixtures in scripts/ci/visual-fixtures/ before accepting such screenshots as baselines.`);
}
if (UPDATE) {
  fs.writeFileSync(CHROME_FILE, `${chromeVersion}\n`);
  console.log(`\n${results.length} baseline(s) written to ${path.relative(root, BASELINE_DIR) || '.'} in ${secs}s.`);
  process.exit(0);
}
if (fresh.length) {
  fs.writeFileSync(path.join(NEW_DIR, 'chrome-version.txt'), `${chromeVersion}\n`);
  console.log(
    `::notice title=Visual baselines missing::BOOTSTRAP: ${fresh.length} shot(s) have no baseline yet and were NOT compared (${fresh
      .map((r) => r.name)
      .join(', ')}). ` +
      'Their screenshots are in the "visual-regression" artifact (new-baselines/). Run Actions -> "Visual baselines" and commit tests/visual/baseline/ (see tests/visual/README.md).',
  );
}
if (failed.length) {
  console.error(
    `\n${failed.length} of ${results.length} shot(s) differ by more than ${MAX_DIFF}% of pixels (${secs}s).\n` +
      'See the "visual-regression" artifact: <shot>.diff.png (red = changed pixels), <shot>.actual.png, <shot>.expected.png.\n' +
      'Intended change? Run Actions -> "Visual baselines" on your branch and commit the new baselines.',
  );
  process.exit(1);
}
console.log(`\n${results.length - fresh.length} shot(s) match their baselines, ${fresh.length} new (${secs}s).`);
