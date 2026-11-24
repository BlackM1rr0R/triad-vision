import fs from 'node:fs';
import { test as base, expect, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { SEED_FILE, WEB_URL } from './env';
import { isAllowedConsoleError } from './allowlist';

// ─── Seed data (written by server/tests/browser/seed.ts) ───────────────────────────────────────

export interface SeedUser {
  id: string;
  email: string;
  password: string;
  token: string;
  firstName: string;
  lastName: string;
}
export interface SeedClient extends SeedUser {
  caseId: string;
  caseNumber: string;
}
export interface Seed {
  samplePdf: string;
  admin: SeedUser & { totpSecret: string };
  vacancy: { id: string; slug: string; title: string };
  clients: {
    viewer: SeedClient;
    docs: SeedClient & { requirementTitle: string };
    submit: SeedClient;
    replace: SeedClient & { requirementTitle: string; rejectedFile: string };
    messages: SeedClient & { staffMessage: string };
    review: SeedClient & { clientMessage: string };
  };
  drive: { clientFolderId: string; clientFolderName: string; parentId: string };
  mail: { accountId: string; folderId: string; messageId: string; subject: string; vhMessageId: string; vhSubject: string };
}

let cached: Seed | null = null;
/** Read lazily: the file is written by the web server start-up, after the config was loaded. */
export const seed = (): Seed => (cached ??= JSON.parse(fs.readFileSync(SEED_FILE, 'utf8')) as Seed);

export const allSeedUserIds = (s: Seed) => [s.admin.id, ...Object.values(s.clients).map((c) => c.id)];

// ─── Errors seen by the page ───────────────────────────────────────────────────────────────────

export interface BrowserErrors {
  /** Errors collected since the last drain (and clears them). */
  drain: () => string[];
}

const collectErrors = (page: Page) => {
  let list: string[] = [];
  const origin = new URL(WEB_URL).origin;
  page.on('pageerror', (err) => list.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (!isAllowedConsoleError(text)) list.push(`console.error: ${text} (${page.url()})`);
  });
  // 4xx answers are part of normal flows (401 before login, 404 for optional data); 5xx never are.
  page.on('response', (res) => {
    if (res.status() >= 500 && res.url().startsWith(origin)) list.push(`HTTP ${res.status()}: ${res.request().method()} ${res.url()}`);
  });
  return { drain: () => [...list.splice(0, list.length)], all: () => list, reset: () => (list = []) };
};

// ─── Browser context set-up ───────────────────────────────────────────────────────────────────

/** Language, cookie consent, no guided tours / "what's new" modal for the seeded users. */
const prepareContext = async (context: BrowserContext) => {
  const s = seed();
  await context.addInitScript(
    ({ ids }) => {
      try {
        localStorage.setItem('tv_lang', 'az');
        if (!localStorage.getItem('tv.consent')) {
          localStorage.setItem('tv.consent', JSON.stringify({ analytics: false, marketing: false, v: '1', at: new Date().toISOString() }));
        }
        for (const id of ids) {
          for (const tour of ['admin', 'staff', 'client-stages']) localStorage.setItem(`tv-tour:${id}:${tour}`, 'never');
          sessionStorage.setItem(`tv-whats-new-modal:${id}`, '1');
        }
      } catch {
        // storage blocked (opaque origin, e.g. a sandboxed frame): nothing to prepare there
      }
    },
    { ids: allSeedUserIds(s) },
  );
  // Only our own origin: fonts / maps / analytics from elsewhere would make runs depend on the internet.
  await context.route(
    (url) => !/^(localhost|127\.0\.0\.1)$/.test(url.hostname),
    (route) => route.abort('blockedbyclient'),
  );
};

/** Opens a session for a seeded user (token issued by the seed): no login form, no rate limit. */
export const signIn = async (context: BrowserContext, user: SeedUser) => {
  await context.addCookies([{ name: 'tv_session', value: user.token, url: WEB_URL, httpOnly: true, sameSite: 'Lax' }]);
};

/** The cookie banner, if a cookie-policy version other than the pre-set one is published, is dismissed when it shows. */
const dismissOverlays = async (page: Page) => {
  await page.addLocatorHandler(page.locator('[data-cookie-banner]'), async () => {
    await page.locator('[data-cookie-banner]').getByRole('button', { name: 'Yalnız zəruri' }).click();
  });
};

export const test = base.extend<{ errors: BrowserErrors }>({
  context: async ({ context }, use) => {
    await prepareContext(context);
    await use(context);
  },
  page: async ({ page }, use) => {
    await dismissOverlays(page);
    await use(page);
  },
  // Every test fails on uncaught page errors, console.error (minus allowlist.ts) and 5xx answers.
  errors: [
    async ({ page }, use, testInfo) => {
      const c = collectErrors(page);
      await use({ drain: c.drain });
      const left = c.all();
      if (left.length) await testInfo.attach('browser-errors.txt', { body: left.join('\n'), contentType: 'text/plain' });
      expect(left, 'uncaught page errors / console.error / HTTP 5xx during the test').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

// ─── Helpers ──────────────────────────────────────────────────────────────────────────────────

export const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** RFC 6238 TOTP (HMAC-SHA1, 30 s, 6 digits): what an authenticator app shows for the seeded secret. */
export const totp = async (secretB32: string, atMs = Date.now()) => {
  const crypto = await import('node:crypto');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of secretB32.toUpperCase().replace(/[\s=-]/g, '')) {
    value = (value << 5) | alphabet.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(atMs / 30_000)));
  const mac = crypto.createHmac('sha1', Buffer.from(bytes)).update(msg).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
};

/** The element that scrolls the page content: window (document.scrollingElement) or the app's own scroll pane. */
export const scrollState = (page: Page, anchor: string) =>
  page.evaluate((sel) => {
    const start = document.querySelector(sel);
    let el: Element | null = start;
    while (el && el !== document.body) {
      const st = getComputedStyle(el);
      if (/(auto|scroll)/.test(st.overflowY) && el.scrollHeight > el.clientHeight + 1) break;
      el = el.parentElement;
    }
    const scroller = el && el !== document.body ? el : (document.scrollingElement as Element);
    return { top: scroller.scrollTop, height: scroller.scrollHeight, client: scroller.clientHeight, window: scroller === document.scrollingElement };
  }, anchor);

/** Scrolls the content scroller of `anchor` to `top`; returns the position actually reached. */
export const scrollTo = (page: Page, anchor: string, top: number) =>
  page.evaluate(
    ({ sel, y }) => {
      let el: Element | null = document.querySelector(sel);
      while (el && el !== document.body) {
        const st = getComputedStyle(el);
        if (/(auto|scroll)/.test(st.overflowY) && el.scrollHeight > el.clientHeight + 1) break;
        el = el.parentElement;
      }
      const scroller = el && el !== document.body ? el : (document.scrollingElement as Element);
      scroller.scrollTop = y;
      return scroller.scrollTop;
    },
    { sel: anchor, y: top },
  );

/**
 * Highest scroll position of the content scroller over `ms` (sampled every animation frame): catches a page that
 * jumps down after it rendered. Sampling over a fixed window is the measurement itself, not a wait for a state.
 */
export const maxScrollOver = (page: Page, anchor: string, ms: number) =>
  page.evaluate(
    ({ sel, ms: duration }) =>
      new Promise<{ max: number; last: number; height: number; client: number }>((resolve) => {
        const find = () => {
          let el: Element | null = document.querySelector(sel);
          while (el && el !== document.body) {
            const st = getComputedStyle(el);
            if (/(auto|scroll)/.test(st.overflowY) && el.scrollHeight > el.clientHeight + 1) break;
            el = el.parentElement;
          }
          return el && el !== document.body ? el : (document.scrollingElement as Element);
        };
        let max = 0;
        const end = performance.now() + duration;
        const tick = () => {
          const s = find();
          max = Math.max(max, s.scrollTop);
          if (performance.now() < end) requestAnimationFrame(tick);
          else resolve({ max, last: s.scrollTop, height: s.scrollHeight, client: s.clientHeight });
        };
        tick();
      }),
    { sel: anchor, ms },
  );

/** Asserts that the element painted at several points of `box` is inside it (nothing covers it). */
export const expectNotCovered = async (target: Locator, label: string) => {
  const result = await target.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const top = Math.max(r.top, 0);
    const bottom = Math.min(r.bottom, window.innerHeight);
    const xs = [r.left + r.width / 2, r.left + 12, r.right - 12];
    const ys = [0.1, 0.3, 0.5, 0.7, 0.9].map((f) => top + (bottom - top) * f);
    const covered: string[] = [];
    for (const x of xs) {
      for (const y of ys) {
        const hit = document.elementFromPoint(x, y);
        if (!hit || !el.contains(hit)) {
          const h = hit as HTMLElement | null;
          covered.push(`(${Math.round(x)},${Math.round(y)}) → ${h ? `${h.tagName.toLowerCase()}${h.id ? `#${h.id}` : ''}.${String(h.className).slice(0, 60)}` : 'nothing'}`);
        }
      }
    }
    return covered;
  });
  expect(result, `${label} is covered by another element at`).toEqual([]);
};

// ─── Client cabinet ───────────────────────────────────────────────────────────────────────────

export const statusLine = (page: Page) => page.getByTestId('cabinet-status-line');
export const stickyNextBar = (page: Page) => page.locator('section[aria-labelledby="next-up-compact"]');

/** Opens the client's case page (optionally a tab) and waits until the case and the status line are rendered. */
export const openCase = async (page: Page, client: SeedClient, tab?: 'docs' | 'messages' | 'family' | 'other') => {
  await page.goto(`/account/cases/${client.caseId}${tab ? `?tab=${tab}` : ''}`);
  await expect(page.getByRole('heading', { level: 1, name: new RegExp(escapeRe(client.caseNumber)) })).toBeVisible();
  await expect(statusLine(page)).toBeVisible();
};

/**
 * Status texts that may stand next to each other: the current-step card title (from Case.status) and the stage
 * the status line reports (server lib/account/statusLine.ts). Anything else contradicts the card — e.g. "İş yeri
 * axtarılır" while the card says the documents are being checked.
 */
const LINE_FOR_CARD: Record<string, RegExp[]> = {
  'Sənədlərin yüklənməsi': [/Sənədlərinizi yükləməyiniz tələb olunur/, /Bütün sənədlər yüklənib/, /rədd edildi — yenidən yükləyin/],
  'Sənədlər yoxlanılır': [/Sənədləriniz yoxlanılır/, /Əmək müqaviləsi hazırlanır/, /rədd edildi — yenidən yükləyin/],
  'Sənədləriniz qəbul edildi': [/Əmək müqaviləsi hazırlanır/, /rədd edildi — yenidən yükləyin/],
  'Müqavilə imzalanmalıdır': [/Əmək müqaviləsini imzalamağınız tələb olunur/, /Əmək müqaviləsi Triad Vision tərəfindən yoxlanılır/, /rədd edildi/],
  'Səfirlik sənədlərinin yüklənməsi': [/Səfirlik sənədlərini yükləməyiniz/, /Səfirlik sənədləri yüklənib/, /rədd edildi/],
  'Səfirlik sənədləri yoxlanılır': [/Səfirlik sənədləriniz yoxlanılır/, /rədd edildi/],
};

/** On the overview tab: the status line agrees with the current-step card (and never says "İş yeri axtarılır" then). */
export const expectStatusConsistent = async (page: Page) => {
  const card = page.locator('#current-step-title');
  await expect(card).toBeVisible();
  const cardText = (await card.innerText()).trim();
  const line = (await statusLine(page).innerText()).trim();
  const allowed = LINE_FOR_CARD[cardText];
  if (allowed) {
    expect(
      allowed.some((re) => re.test(line)),
      `status line "${line}" contradicts the current-step card "${cardText}"`,
    ).toBe(true);
  }
  if (/sənəd/i.test(cardText)) expect(line, 'job search while the documents step is open').not.toContain('İş yeri axtarılır');
};
