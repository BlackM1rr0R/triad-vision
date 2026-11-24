import type { Page } from '@playwright/test';
import { escapeRe, expect, scrollState, scrollTo, seed, signIn, test } from '../fixtures';

test.describe('admin', () => {
  test.beforeEach(async ({ context }) => {
    await signIn(context, seed().admin);
  });

  test('case page: accepting a document in the review drawer needs no reload and keeps the scroll position', async ({ page }) => {
    const c = seed().clients.review; // handed in, documents PENDING
    await page.goto(`/admin/cases/${c.caseId}`);
    await expect(page.getByRole('heading', { level: 1, name: c.caseNumber })).toBeVisible();
    const reviewNow = page.getByRole('button', { name: 'İndi yoxla' }).first();
    await expect(reviewNow).toBeVisible();

    // A marker on window survives only as long as the page is not reloaded.
    await page.evaluate(() => ((window as unknown as { __noReload: number }).__noReload = 42));
    const anchor = 'h1';
    await scrollTo(page, anchor, 250);
    const before = await scrollState(page, anchor);
    const url = page.url();

    await reviewNow.click();
    const drawer = page.getByRole('dialog', { name: 'Yoxlanılmalı sənədlər' });
    await expect(drawer).toBeVisible();
    const reviewed = page.waitForResponse((r) => r.request().method() === 'POST' && /\/documents\/[^/]+\/review$/.test(r.url()));
    await drawer.getByRole('button', { name: 'Qəbul et', exact: true }).first().click();
    expect((await reviewed).status(), 'POST review').toBe(200);
    await expect(drawer.getByText('Qəbul edildi').first()).toBeVisible();

    expect(await page.evaluate(() => (window as unknown as { __noReload?: number }).__noReload), 'page was reloaded').toBe(42);
    expect(page.url()).toBe(url);
    expect((await scrollState(page, anchor)).top, 'scroll position while the drawer is open').toBeLessThanOrEqual(before.top + 4);
    expect((await scrollState(page, anchor)).top).toBeGreaterThanOrEqual(before.top - 4);

    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    expect(await page.evaluate(() => (window as unknown as { __noReload?: number }).__noReload), 'page was reloaded').toBe(42);
    const after = await scrollState(page, anchor);
    expect(Math.abs(after.top - before.top), 'scroll position after closing the drawer').toBeLessThanOrEqual(40);
  });

  test('inbox: a conversation opens with the client profile beside it', async ({ page }) => {
    const c = seed().clients.review;
    const name = `${c.firstName} ${c.lastName}`;
    await page.goto('/admin/inbox');
    const list = page.getByRole('region', { name: 'Yazışmalar' });
    await expect(list).toBeVisible();
    await list.getByRole('button', { name: new RegExp(escapeRe(name)) }).first().click();
    await expect(page).toHaveURL(new RegExp(`[?&]case=${escapeRe(c.caseId)}`));
    const profile = page.getByRole('complementary', { name: 'Müştəri profili' });
    await expect(profile).toBeVisible();
    await expect(profile.getByRole('heading', { level: 2 }).first()).toHaveText(name);
    await expect(page.getByRole('region', { name: 'Cavab yaz' })).toContainText(c.clientMessage);
  });

  test('drive: Anträge, the client folder and the "Partnyor" button', async ({ page }) => {
    const { drive, clients } = seed();
    await page.goto('/workspace/drive/cases');
    await expect(page.getByText('Arbeitsvisum', { exact: true }).first()).toBeVisible();

    await page.goto(`/workspace/drive/f/${drive.parentId}`);
    const folder = page.getByText(drive.clientFolderName, { exact: true }).first();
    await expect(folder).toBeVisible();
    await expect(page.getByRole('button', { name: 'Partnyor', exact: true })).toHaveCount(0);
    await folder.click(); // single click selects
    await expect(page.getByRole('button', { name: 'Partnyor', exact: true })).toBeVisible();
    expect(drive.clientFolderName).toContain(clients.review.lastName);
  });

  test('signatures list loads', async ({ page }) => {
    await page.goto('/admin/signatures');
    await expect(page.getByRole('heading', { level: 1, name: 'İmzalar' })).toBeVisible();
    await expect(page.getByText('Hələ imza tələbi yoxdur.')).toBeVisible();
  });

  test('mail reader: a long HTML message gets a stable iframe height', async ({ page }) => {
    const { mail } = seed();
    await expectStableMailFrame(page, mail.accountId, mail.folderId, mail.messageId, mail.subject);
  });

  test('mail reader: a viewport-high (min-height:100vh) message does not grow the frame', async ({ page }) => {
    // Known bug (found while writing these tests): inside the frame 100vh is the frame's own height, so the body box
    // that MailBody measures grows with every resize (+4 px a round) until the 20000 px cap. Remove the fixme once
    // client/src/components/mail/MailBody.tsx neutralises vh-sized blocks.
    const { mail } = seed();
    await expectStableMailFrame(page, mail.accountId, mail.folderId, mail.vhMessageId, mail.vhSubject);
  });
});

/** Opens a mail and checks that the reading-pane iframe fits its content and stops changing height. */
const expectStableMailFrame = async (page: Page, accountId: string, folderId: string, messageId: string, subject: string) => {
  await page.goto(`/workspace/mail/${accountId}/f-${folderId}/${messageId}`);
  await expect(page.getByRole('heading', { level: 1, name: subject })).toBeVisible();
  const frame = page.locator('iframe[title="message"]');
  await expect(frame).toBeVisible();
  await expect(page.frameLocator('iframe[title="message"]').getByText('Absatz 120:')).toBeAttached();

  const height = () => frame.evaluate((el) => el.getBoundingClientRect().height);
  // Sized to the content: 120 paragraphs are far taller than the 120 px start height.
  await expect.poll(height, { message: 'iframe sized to the message' }).toBeGreaterThan(1500);
  // The reader re-measures after 300 ms and 1200 ms (late images): measure after those, twice, 1 s apart.
  await page.waitForTimeout(1500);
  const h1 = await height();
  await page.waitForTimeout(1000);
  const h2 = await height();
  expect(Math.abs(h2 - h1), `iframe height keeps changing (${h1} → ${h2})`).toBeLessThanOrEqual(2);
  expect(h2, 'iframe height reached the 20000 px cap (runaway growth)').toBeLessThan(19_000);

  // Not clipped, and not much taller than the content (the last paragraph's bottom inside the frame).
  const content = await frame.evaluate((el) => {
    const doc = (el as HTMLIFrameElement).contentDocument;
    const last = doc ? Array.from(doc.querySelectorAll('p')).pop() : null;
    return last ? last.getBoundingClientRect().bottom : 0;
  });
  expect(content, 'content measured').toBeGreaterThan(1000);
  expect(h2, 'iframe shorter than its content').toBeGreaterThanOrEqual(content - 10);
  expect(h2, 'iframe much taller than its content').toBeLessThan(content + 400);
};
