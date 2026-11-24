import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { CRAWL_DIR } from '../env';
import { expect, expectStatusConsistent, seed, signIn, test, type BrowserErrors } from '../fixtures';

/**
 * Visits the key screens of every role, saves a full-page screenshot of each (artifact "browser-crawl", never
 * compared) and reports console errors / 5xx per route. Failures are soft: one broken route does not hide the others.
 */
const shoot = async (page: Page, errors: BrowserErrors, name: string, route: string) => {
  await test.step(`${name}: ${route}`, async () => {
    const res = await page.goto(route);
    expect.soft(res?.status() ?? 0, `${route} HTTP status`).toBeLessThan(400);
    await expect.soft(page.locator('main, #admin-main, [role="main"]').first(), `${route} has its main content`).toBeVisible();
    // Loading placeholders gone (best effort: some screens keep a spinner for live data).
    await expect
      .poll(() => page.locator('[aria-busy="true"]').count(), { timeout: 8_000, message: `${route} still loading` })
      .toBe(0)
      .catch(() => undefined);
    fs.mkdirSync(CRAWL_DIR, { recursive: true });
    await page.screenshot({ path: path.join(CRAWL_DIR, `${name}.png`), fullPage: true });
    expect.soft(errors.drain(), `${route}: console errors / page errors / HTTP 5xx`).toEqual([]);
  });
};

test.describe('crawl', () => {
  test('public pages', async ({ page, errors }) => {
    const { vacancy } = seed();
    const routes: [string, string][] = [
      ['public-home', '/'],
      ['public-jobs', '/jobs'],
      ['public-job-detail', `/jobs/${vacancy.slug}`],
      ['public-visas', '/visas'],
      ['public-services', '/services'],
      ['public-faq', '/faq'],
      ['public-contact', '/contact'],
      ['public-login', '/login'],
      ['public-register', '/register'],
      ['public-de-home', '/de'],
    ];
    for (const [name, route] of routes) await shoot(page, errors, name, route);
  });

  test('client cabinet', async ({ context, page, errors }) => {
    // 10 routes plus a status check per seeded client (9 since the flow specs): ~2–5 s each on a CI runner.
    test.setTimeout(150_000);
    const s = seed();
    const c = s.clients.viewer;
    await signIn(context, c);
    const routes: [string, string][] = [
      ['client-home', '/account'],
      ['client-cases', '/account/cases'],
      ['client-case-overview', `/account/cases/${c.caseId}`],
      ['client-case-docs', `/account/cases/${c.caseId}?tab=docs`],
      ['client-case-messages', `/account/cases/${c.caseId}?tab=messages`],
      ['client-case-other', `/account/cases/${c.caseId}?tab=other`],
      ['client-notifications', '/account/notifications'],
      ['client-signatures', '/account/signatures'],
      ['client-payments', '/account/payments'],
      ['client-profile', '/account/profile'],
    ];
    for (const [name, route] of routes) await shoot(page, errors, name, route);

    // Status texts agree on every seeded client's case (whatever the other tests did to it meanwhile).
    for (const [key, client] of Object.entries(s.clients)) {
      await test.step(`status consistency: ${key}`, async () => {
        await context.clearCookies();
        await signIn(context, client);
        await page.goto(`/account/cases/${client.caseId}`);
        await expectStatusConsistent(page);
      });
    }
  });

  test('admin and workspace', async ({ context, page, errors }) => {
    const s = seed();
    const c = s.clients.review;
    await signIn(context, s.admin);
    const routes: [string, string][] = [
      ['admin-dashboard', '/admin'],
      ['admin-today', '/admin/today'],
      ['admin-cases', '/admin/cases'],
      ['admin-case', `/admin/cases/${c.caseId}`],
      ['admin-case-documents', `/admin/cases/${c.caseId}?tab=documents`],
      ['admin-case-communication', `/admin/cases/${c.caseId}?tab=communication`],
      ['admin-inbox', '/admin/inbox'],
      ['admin-vacancies', '/admin/vacancies'],
      ['admin-signatures', '/admin/signatures'],
      ['admin-access', '/admin/access'],
      ['workspace-drive', '/workspace/drive'],
      ['workspace-drive-cases', '/workspace/drive/cases'],
      ['workspace-mail', '/workspace/mail'],
    ];
    for (const [name, route] of routes) await shoot(page, errors, name, route);
  });
});
