// Read-only QA crawl of the live site (https://triad-vision.de) with Playwright.
//
//   cd scripts/qa && npm install && npx playwright install chromium     (once; isolated from the app dependencies)
//   QA_CLIENT_EMAIL=... QA_CLIENT_PASSWORD=... node live-crawl.mjs        (credentials only from the environment)
//
// Public pages, 1366 px desktop + 390 px mobile, light + dark; then the cabinet of the test client. Navigation and
// opening tabs / dropdowns only: every write request (POST / PUT / PATCH / DELETE, except the login itself) is aborted
// by a route guard, nothing is submitted, uploaded or sent. Output (gitignored): scripts/qa/output/*.png,
// results.json (all raw findings) and summary.txt (grouped, deduplicated).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const BASE = process.env.QA_BASE_URL || 'https://triad-vision.de';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'output');
fs.mkdirSync(OUT, { recursive: true });
const EMAIL = process.env.QA_CLIENT_EMAIL;
const PASSWORD = process.env.QA_CLIENT_PASSWORD;

const VIEWPORTS = {
  desktop: { viewport: { width: 1366, height: 850 }, deviceScaleFactor: 1 },
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const THEMES = ['light', 'dark'];
const SLOW_MS = 5000;
const MAX_SHOT_HEIGHT = 9000;

const PUBLIC_PAGES = [
  '/', '/jobs', '/visas', '/visas/lkw-fahrer', '/calculator', '/salary-calculator', '/cost-calculator',
  '/tax-refund-calculator', '/guides/almaniya-is-vizasi', '/guides/almaniya-mavi-kart-blaue-karte', '/register', '/login', '/contact', '/faq',
  '/for-workers', '/services', '/eligibility', '/tools',
];

/** Home page in the other languages: own context per language, so the stored language never leaks into other pages. */
const LANG_PAGES = ['/de', '/en', '/ru'];
const results = [];
const blockedWrites = new Set();

const isWrite = (m) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(m);
const allowedWrite = (url) => /\/api\/auth\/(login|refresh|csrf)/.test(url);
const slug = (s) => s.replace(/^\//, '').replace(/[^A-Za-z0-9]+/g, '_').slice(0, 60) || 'home';
const trunc = (s, n = 220) => (s.length > n ? `${s.slice(0, n)}...` : s);

const guard = async (context) => {
  await context.route('**/*', (route) => {
    const req = route.request();
    if (isWrite(req.method()) && !allowedWrite(req.url())) {
      blockedWrites.add(`${req.method()} ${new URL(req.url()).pathname}`);
      return route.fulfill({ status: 204, body: '' });
    }
    return route.continue();
  });
};

/** Runs inside the page: layout, image and text-overflow checks. */
const analyse = () => {
  const out = { overflowX: null, offenders: [], covered: [], textOverflow: [], brokenImages: [], missingAlt: [] };
  const vw = window.innerWidth;
  const doc = document.documentElement;
  if (doc.scrollWidth > vw + 1) out.overflowX = { scrollWidth: doc.scrollWidth, innerWidth: vw };
  const desc = (el) => {
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls ? `.${cls}` : ''}`.slice(0, 90);
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0;
  };
  const insideClipped = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p);
      if (/(hidden|auto|scroll|clip)/.test(o.overflowX) && p.scrollWidth <= p.clientWidth + 1) {
        const r = p.getBoundingClientRect();
        const er = el.getBoundingClientRect();
        if (er.right > r.right + 1 || er.left < r.left - 1) return true;
      }
    }
    return false;
  };
  if (out.overflowX) {
    const seen = new Set();
    for (const el of document.body.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.right <= vw + 1) continue;
      if (!visible(el) || insideClipped(el)) continue;
      const d = `${desc(el)} (right ${Math.round(r.right)})`;
      if (!seen.has(d) && out.offenders.length < 6) {
        seen.add(d);
        out.offenders.push(d);
      }
    }
  }
  // Sticky / fixed bars at the top or bottom, and whether they hide content in the initial viewport.
  const bars = [...document.querySelectorAll('header, nav, [role="banner"], div, aside')].filter((el) => {
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'sticky') return false;
    const r = el.getBoundingClientRect();
    return r.width > vw * 0.5 && r.height > 20 && r.height < 200 && visible(el) && (r.top <= 4 || r.bottom >= window.innerHeight - 4);
  });
  const barTop = Math.max(0, ...bars.filter((b) => b.getBoundingClientRect().top <= 4).map((b) => b.getBoundingClientRect().bottom));
  const targets = [...document.querySelectorAll('h1, h2, main a[href], main button, main input, main select, main textarea')].filter(visible);
  for (const el of targets) {
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight || r.width < 2) continue;
    const x = Math.min(Math.max(r.left + r.width / 2, 1), vw - 1);
    const y = Math.min(Math.max(r.top + Math.min(r.height / 2, 12), 1), window.innerHeight - 1);
    const top = document.elementFromPoint(x, y);
    if (top && top !== el && !el.contains(top) && !top.contains(el)) {
      const topCs = getComputedStyle(top.closest('*') || top);
      let fixedAncestor = null;
      for (let p = top; p; p = p.parentElement) {
        const pos = getComputedStyle(p).position;
        if (pos === 'fixed' || pos === 'sticky') {
          fixedAncestor = p;
          break;
        }
      }
      if (fixedAncestor && topCs && out.covered.length < 6) out.covered.push(`${desc(el)} "${(el.textContent || '').trim().slice(0, 40)}" covered by ${desc(fixedAncestor)}`);
    }
  }
  out.stickyTopHeight = Math.round(barTop);
  for (const el of document.querySelectorAll('button, a.btn, [class*="btn"], [role="button"], [role="tab"], .badge, [class*="chip"]')) {
    if (!visible(el)) continue;
    if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== 'visible' && !/ellipsis/.test(getComputedStyle(el).textOverflow)) {
      if (out.textOverflow.length < 8) out.textOverflow.push(`${desc(el)} "${(el.textContent || '').trim().slice(0, 40)}" (${el.scrollWidth}>${el.clientWidth})`);
    } else if (el.scrollHeight > el.clientHeight + 4 && el.clientHeight > 0 && getComputedStyle(el).overflow !== 'visible') {
      if (out.textOverflow.length < 8) out.textOverflow.push(`${desc(el)} "${(el.textContent || '').trim().slice(0, 40)}" (height ${el.scrollHeight}>${el.clientHeight})`);
    }
  }
  for (const img of document.querySelectorAll('img')) {
    const src = (img.currentSrc || img.src || '').slice(0, 120);
    if (img.complete && img.naturalWidth === 0 && src && !img.closest('picture source')) out.brokenImages.push(src);
    const decorative = img.getAttribute('role') === 'presentation' || img.getAttribute('aria-hidden') === 'true';
    if (!img.hasAttribute('alt') && !decorative && src) out.missingAlt.push(src);
  }
  return out;
};

/** "Only necessary" in the cookie banner: local choice only (the consent log request is blocked by the guard), so the banner does not hide the page. */
const dismissCookies = async (page) => {
  const btn = page.getByRole('button', { name: /Yalnız zəruri|Only necessary|Necessary only|Nur notwendige|Только необходимые|Yalnızca gerekli|Лише необхідні/i });
  if (await btn.count()) {
    await btn.first().click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(400);
  }
};

const autoScroll = async (page) => {
  await page.evaluate(async () => {
    const step = Math.max(300, window.innerHeight * 0.8);
    for (let y = 0; y < Math.min(document.body.scrollHeight, 14000); y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  });
};

const visit = async (context, key, urlPath, { vp, theme, area, after }) => {
  const page = await context.newPage();
  const rec = { key, url: urlPath, viewport: vp, theme, area, consoleErrors: [], consoleWarnings: [], pageErrors: [], failedRequests: [], loadMs: null, status: null, final: null };
  page.on('console', (m) => {
    const t = m.type();
    if (t === 'error') rec.consoleErrors.push(trunc(`${m.text()} @ ${(m.location().url || '').replace(BASE, '').split('?')[0]}`));
    else if (t === 'warning') rec.consoleWarnings.push(trunc(m.text()));
  });
  page.on('pageerror', (e) => rec.pageErrors.push(trunc(e.message)));
  page.on('response', (r) => {
    const s = r.status();
    if (s >= 400 && s !== 401) rec.failedRequests.push(`${s} ${r.request().method()} ${trunc(r.url().replace(BASE, '').split('?')[0], 140)}`);
  });
  page.on('requestfailed', (r) => {
    const f = r.failure()?.errorText ?? '';
    if (/ERR_ABORTED/.test(f)) return;
    rec.failedRequests.push(`FAILED ${r.method()} ${trunc(r.url().replace(BASE, '').split('?')[0], 140)} ${f}`);
  });
  try {
    const t0 = Date.now();
    const res = await page.goto(BASE + urlPath, { waitUntil: 'load', timeout: 45_000 });
    await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
    rec.loadMs = Date.now() - t0;
    rec.status = res?.status() ?? null;
    rec.final = page.url().replace(BASE, '');
    if (rec.loadMs > SLOW_MS) rec.slow = true;
    await dismissCookies(page);
    if (after) await after(page, rec);
    await autoScroll(page);
    rec.layout = await page.evaluate(analyse);
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    rec.pageHeight = height;
    await page.screenshot({
      path: path.join(OUT, `${key}.png`),
      fullPage: height <= MAX_SHOT_HEIGHT,
      ...(height > MAX_SHOT_HEIGHT ? {} : {}),
    }).catch(async () => {
      await page.screenshot({ path: path.join(OUT, `${key}.png`) }).catch(() => {});
    });
  } catch (e) {
    rec.fatal = trunc(String(e.message ?? e), 300);
  } finally {
    await page.close().catch(() => {});
  }
  results.push(rec);
  // Partial results survive an interrupted run.
  fs.writeFileSync(path.join(OUT, 'results.partial.json'), JSON.stringify({ blockedWrites: [...blockedWrites], results }));
  const flags = [rec.fatal && 'FATAL', rec.consoleErrors.length && `console:${rec.consoleErrors.length}`, rec.pageErrors.length && `pageerr:${rec.pageErrors.length}`, rec.failedRequests.length && `req:${rec.failedRequests.length}`, rec.layout?.overflowX && 'overflowX', rec.slow && 'slow'].filter(Boolean);
  console.log(`${area} ${vp}/${theme} ${urlPath} ${rec.status ?? '-'} ${rec.loadMs ?? '-'}ms ${flags.join(' ')}`);
  return rec;
};

const newContext = (browser, vp, theme, storageState) =>
  browser.newContext({ ...VIEWPORTS[vp], colorScheme: theme, locale: 'az-AZ', ignoreHTTPSErrors: false, ...(storageState ? { storageState } : {}) });

const discoverVacancies = async (browser) => {
  const context = await newContext(browser, 'desktop', 'light');
  const page = await context.newPage();
  await page.goto(`${BASE}/jobs`, { waitUntil: 'load', timeout: 45_000 });
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  const hrefs = await page.$$eval('a[href^="/jobs/"]', (as) => [...new Set(as.map((a) => a.getAttribute('href')).filter(Boolean))]);
  await context.close();
  const details = hrefs.filter((h) => !/^\/jobs\/(germany|in\/)/.test(h) && h !== '/jobs/').slice(0, 2);
  return details.length ? details : ['/jobs/aaa-bak'];
};

const run = async () => {
  const browser = await chromium.launch();
  const vacancies = await discoverVacancies(browser);
  console.log('vacancy details:', vacancies.join(', '));
  const pages = [...PUBLIC_PAGES, ...vacancies];

  // Public, anonymous: 2 viewports x 2 themes, the four combinations run in parallel (pages sequential in each).
  await Promise.all(
    Object.keys(VIEWPORTS).flatMap((vp) =>
      THEMES.map(async (theme) => {
        const context = await newContext(browser, vp, theme);
        await guard(context);
        for (const p of pages) await visit(context, `pub_${vp}_${theme}_${slug(p)}`, p, { vp, theme, area: 'public' });
        await context.close();
      }),
    ),
  );
  for (const vp of Object.keys(VIEWPORTS)) {
    for (const theme of THEMES) {
      for (const p of LANG_PAGES) {
        const context = await newContext(browser, vp, theme);
        await guard(context);
        await visit(context, `pub_${vp}_${theme}_${slug(p)}`, p, { vp, theme, area: 'public' });
        await context.close();
      }
    }
  }

  // Cabinet of the test client.
  if (!EMAIL || !PASSWORD) {
    console.log('QA_CLIENT_EMAIL / QA_CLIENT_PASSWORD not set: cabinet pages skipped');
  } else {
    const loginCtx = await newContext(browser, 'desktop', 'light');
    await guard(loginCtx);
    const lp = await loginCtx.newPage();
    await lp.goto(`${BASE}/login`, { waitUntil: 'load', timeout: 45_000 });
    await lp.locator('input[type="email"], input[name="email"]').first().fill(EMAIL);
    await lp.locator('input[type="password"]').first().fill(PASSWORD);
    await dismissCookies(lp);
    await lp.locator('form button[type="submit"]').first().click();
    await lp.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 20_000 }).catch(() => {});
    const landed = new URL(lp.url()).pathname;
    console.log('login landed on', landed);
    const state = await loginCtx.storageState();
    await loginCtx.close();
    if (/\/login/.test(landed)) {
      console.log('login failed: cabinet pages skipped');
      results.push({ key: 'login', url: '/login', area: 'cabinet', fatal: 'login did not leave /login (wrong credentials, 2FA or rate limit)' });
    } else {
      // first case id
      const c0 = await newContext(browser, 'desktop', 'light', state);
      await guard(c0);
      const p0 = await c0.newPage();
      await p0.goto(`${BASE}/account/cases`, { waitUntil: 'load', timeout: 45_000 });
      await p0.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      const caseHref = await p0.$$eval('a[href^="/account/cases/"]', (as) => as.map((a) => a.getAttribute('href')).find((h) => /^\/account\/cases\/[^/]+$/.test(h || '')) ?? null);
      await c0.close();
      console.log('case:', caseHref ? caseHref.replace(/[^/]+$/, ':id') : 'none');

      const clickTab = (index) => async (page) => {
        const tabs = page.getByRole('tab');
        if ((await tabs.count()) > index) await tabs.nth(index).click({ timeout: 5000 }).catch(() => {});
        await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
      };
      const openBell = async (page) => {
        const bell = page.locator('header button[aria-label*="ildiri" i], header button[aria-label*="otif" i], header button[aria-label*="enachricht" i], header button[aria-label*="ведомл" i]').first();
        if (await bell.count()) {
          await bell.click({ timeout: 5000 }).catch(() => {});
          await page.waitForTimeout(600);
        }
      };
      const cabinet = [
        ['/account', 'home'],
        ['/account/cases', 'cases'],
        ...(caseHref ? [[caseHref, 'case_overview'], [caseHref, 'case_docs', clickTab(1)], [caseHref, 'case_messages', clickTab(2)]] : []),
        ['/account/vault', 'documents'],
        ['/account', 'notifications_dropdown', openBell],
        ['/account/notifications', 'notifications'],
        ['/account/profile', 'profile'],
        ['/account/applications', 'applications'],
        ['/account/saved-jobs', 'saved_jobs'],
        ['/account/job-applications', 'job_applications'],
      ];
      for (const vp of Object.keys(VIEWPORTS)) {
        for (const theme of THEMES) {
          const context = await newContext(browser, vp, theme, state);
          await guard(context);
          for (const [p, name, after] of cabinet) await visit(context, `acc_${vp}_${theme}_${name}`, p, { vp, theme, area: 'cabinet', after });
          await context.close();
        }
      }
    }
  }
  await browser.close();

  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ base: BASE, at: new Date().toISOString(), blockedWrites: [...blockedWrites], results }, null, 1));
  fs.writeFileSync(path.join(OUT, 'summary.txt'), summarise());
  console.log(`done: ${results.length} page visits; summary in scripts/qa/output/summary.txt`);
};

const summarise = () => {
  const groups = new Map();
  const add = (type, text, rec) => {
    const k = `${type} | ${text}`;
    if (!groups.has(k)) groups.set(k, new Set());
    groups.get(k).add(`${rec.viewport}/${rec.theme} ${rec.url}`);
  };
  for (const r of results) {
    if (r.fatal) add('FATAL', r.fatal, r);
    if (r.status && r.status >= 400) add('HTTP', String(r.status), r);
    for (const m of r.consoleErrors ?? []) add('console.error', m, r);
    for (const m of r.consoleWarnings ?? []) add('console.warn', m, r);
    for (const m of r.pageErrors ?? []) add('pageerror', m, r);
    for (const m of r.failedRequests ?? []) add('request', m, r);
    if (r.slow) add('slow', `${r.loadMs} ms`, r);
    const l = r.layout;
    if (!l) continue;
    if (l.overflowX) add('overflowX', `${l.overflowX.scrollWidth}>${l.overflowX.innerWidth}: ${l.offenders.join(' ; ')}`, r);
    for (const m of l.covered) add('covered', m, r);
    for (const m of l.textOverflow) add('textOverflow', m, r);
    for (const m of l.brokenImages) add('brokenImage', m, r);
    for (const m of l.missingAlt) add('missingAlt', m, r);
  }
  const lines = [`blocked write requests (aborted by the guard): ${[...blockedWrites].join(', ') || 'none'}`, ''];
  for (const [k, set] of [...groups.entries()].sort()) {
    const where = [...set];
    lines.push(`${k}\n    on ${where.length}: ${where.slice(0, 6).join(', ')}${where.length > 6 ? ', ...' : ''}`);
  }
  return lines.join('\n');
};

run().catch((e) => {
  console.error('crawl failed:', e.message);
  process.exit(1);
});
