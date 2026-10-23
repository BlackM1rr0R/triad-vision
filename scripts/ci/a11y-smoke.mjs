#!/usr/bin/env node
// Accessibility smoke test: serves the built client (client/dist) and runs axe-core (WCAG 2.2 A/AA rules)
// in headless Chrome on a few public pages, in the light and the dark theme. Fails on "serious" or
// "critical" violations; "moderate"/"minor" ones are printed as warnings.
//
//   node scripts/ci/a11y-smoke.mjs [--dir client/dist] [--api http://localhost:4000] [--pages /,/login]
//                                  [--themes light,dark] [--report] [--json out.json] [--auth <cookie value>]
//
// Chrome: $CHROME_PATH, else google-chrome / chromium on Linux, the default install path on Windows/macOS.
// Without --api the pages render without content from the API (as on a cold, offline start); the site
// shell, forms and error states are still checked. --report never fails (prints everything).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { startStaticServer } from './static-server.mjs';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);

const PAGES = (arg('pages', '/,/visas,/register,/login,/contact,/accessibility') ?? '').split(',').filter(Boolean);
const THEMES = (arg('themes', 'light,dark') ?? '').split(',').filter(Boolean);
const FAIL_ON = new Set(['serious', 'critical']);
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

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

const { url: base, close } = await startStaticServer({ dir: arg('dir', path.join(root, 'client', 'dist')), api: arg('api') });
const launch = () =>
  puppeteer.launch({
    executablePath: findChrome(),
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--no-first-run'],
  });
let browser = await launch();
const axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const auth = arg('auth');

/** Loads one page in a fresh tab and returns axe's violations (plus uncaught page errors). */
const audit = async (route, theme) => {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1280, height: 900 });
    // Animations skipped (axe would otherwise see half-faded text), intro preloader skipped, theme fixed.
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.evaluateOnNewDocument((t) => {
      try {
        sessionStorage.setItem('tv_intro', '1');
        localStorage.setItem('tv_prefs', JSON.stringify({ theme: t }));
        localStorage.setItem('tv_lang', 'az');
      } catch {
        /* storage unavailable */
      }
    }, theme);
    if (auth) await page.setCookie({ name: 'tv_session', value: auth, url: base });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${base}${route}`, { waitUntil: 'load', timeout: 60_000 });
    // Pages with polling or live connections (portal, admin) never go fully idle: wait up to 15 s.
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 15_000 }).catch(() => undefined);
    // Scroll through the page once so scroll-triggered reveals reach their final state, then back to the
    // top; let idle-time work (late chunks, the cookie notice) settle.
    await page.evaluate(async () => {
      const step = Math.max(200, Math.floor(window.innerHeight * 0.7));
      for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      window.scrollTo(0, 0);
    });
    await new Promise((r) => setTimeout(r, 3000));
    await page.evaluate(axeSource);
    const result = await page.evaluate(
      (tags) =>
        // eslint-disable-next-line no-undef
        axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] }),
      TAGS,
    );
    const violations = result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.map((n) => ({ target: n.target.join(' '), html: n.html.slice(0, 240), summary: n.failureSummary?.split('\n').slice(0, 3).join(' ') })),
    }));
    return { violations, errors };
  } finally {
    await page.close().catch(() => undefined);
  }
};

let failures = 0;
const report = [];
try {
  for (const theme of THEMES) {
    for (const route of PAGES) {
      let res;
      try {
        res = await audit(route, theme);
      } catch (err) {
        // A crashed / disconnected browser is an infrastructure hiccup, not a finding: relaunch, retry once.
        console.log(`     (retrying ${route} after: ${String(err).split('\n')[0]})`);
        await browser.close().catch(() => undefined);
        browser = await launch();
        res = await audit(route, theme);
      }
      const { violations, errors } = res;
      report.push({ route, theme, violations, errors });
      const blocking = violations.filter((v) => FAIL_ON.has(v.impact));
      failures += blocking.length;
      const tag = blocking.length ? 'FAIL' : 'ok  ';
      console.log(`${tag} ${theme.padEnd(5)} ${route}  (${violations.length} rule(s) violated, ${blocking.length} serious/critical)`);
      for (const v of violations) {
        console.log(`     ${FAIL_ON.has(v.impact) ? '✗' : '!'} [${v.impact}] ${v.id}: ${v.help} — ${v.nodes.length} node(s)`);
        for (const n of v.nodes.slice(0, 4)) console.log(`         ${n.target}  ${n.html}${n.summary ? `\n           → ${n.summary}` : ''}`);
      }
      for (const e of errors) console.log(`     page error: ${e}`);
    }
  }
} finally {
  await browser.close().catch(() => undefined);
  await close();
}

const out = arg('json');
if (out) fs.writeFileSync(out, JSON.stringify(report, null, 2));
if (failures && !flag('report')) {
  console.error(`\n${failures} serious/critical accessibility violation(s). See the list above (rules: https://dequeuniversity.com/rules/axe/).`);
  process.exit(1);
}
console.log(failures ? `\n${failures} serious/critical violation(s) (report mode, not failing).` : '\nNo serious/critical accessibility violations.');
