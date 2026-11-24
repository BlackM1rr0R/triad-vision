import type { Page } from '@playwright/test';
import {
  escapeRe,
  expect,
  expectNotCovered,
  expectStatusConsistent,
  maxScrollOver,
  openCase,
  scrollTo,
  seed,
  signIn,
  statusLine,
  stickyNextBar,
  test,
} from '../fixtures';

/** The upload input of a requirement card (the drop zone; not the "images → PDF" or rejected-row inputs). */
const requirementCard = (page: Page, title: string) =>
  page.locator('#docs-initial li').filter({ has: page.getByRole('heading', { level: 4, name: title, exact: true }) }).first();
const dropInput = (page: Page, title: string) => requirementCard(page, title).locator('input[type="file"][accept*=".pdf"]:not([multiple])').first();
const isUpload = (caseId: string) => (r: { url: () => string; request: () => { method: () => string } }) =>
  r.request().method() === 'POST' && r.url().endsWith(`/api/cases/${caseId}/documents`);

test.describe('client cabinet', () => {
  test('status line agrees with the current-step card and the sticky bar', async ({ context, page }) => {
    const c = seed().clients.viewer; // documents handed in, waiting for review
    await signIn(context, c);
    await openCase(page, c);
    await expect(statusLine(page)).toContainText('Sənədləriniz yoxlanılır');
    await expect(page.locator('#current-step-title')).toHaveText('Sənədlər yoxlanılır');
    await expectStatusConsistent(page);
    // The team has the ball: the sticky bar must not ask the client for anything.
    await expect(stickyNextBar(page)).toContainText('Hazırda bizdəyik');
    await expect(stickyNextBar(page)).not.toContainText('Sizdən gözlənilən');
  });

  test('journey card sits right below the current step, near the top', async ({ context, page }) => {
    const c = seed().clients.viewer;
    await signIn(context, c);
    await openCase(page, c);
    const journey = page.locator('#journey-map-title');
    await expect(journey).toBeVisible();
    const geo = await page.evaluate(() => {
      const top = (sel: string) => {
        const el = document.querySelector(sel)?.closest('section');
        return el ? el.getBoundingClientRect().top + window.scrollY : null;
      };
      const step = document.querySelector('#current-step')?.getBoundingClientRect();
      return { journey: top('#journey-map-title'), stepBottom: step ? step.bottom + window.scrollY : null, vh: window.innerHeight };
    });
    expect(geo.journey, 'journey card position').not.toBeNull();
    expect(geo.journey!, 'journey card starts within the first 1.5 screens').toBeLessThan(geo.vh * 1.5);
    if (geo.stepBottom !== null) expect(geo.journey! - geo.stepBottom, 'gap between current step and journey card').toBeLessThan(120);
  });

  test('page does not jump to the footer after load or reload', async ({ context, page }) => {
    const c = seed().clients.viewer;
    await signIn(context, c);
    await openCase(page, c, 'docs');
    await expect(page.locator('#docs-initial')).toBeVisible();
    const anchor = '#docs-initial';
    const first = await maxScrollOver(page, anchor, 1500);
    expect(first.max, 'scroll position right after opening the page').toBeLessThan(80);

    const target = Math.min(300, Math.max(0, first.height - first.client - 50));
    const reached = await scrollTo(page, anchor, target);
    await page.reload();
    await expect(page.locator('#docs-initial')).toBeVisible();
    const after = await maxScrollOver(page, anchor, 1500);
    const bottom = after.height - after.client;
    expect(after.max, 'scroll after reload stays where the reader was (or the top)').toBeLessThanOrEqual(reached + 80);
    if (bottom > 400) expect(after.last, 'scrolled to the very bottom (footer) after reload').toBeLessThan(bottom - 100);
  });

  test('documents: a file uploads to its requirement', async ({ context, page }) => {
    const s = seed();
    const c = s.clients.docs; // DOCUMENTS_PENDING, nothing uploaded
    await signIn(context, c);
    await openCase(page, c, 'docs');
    const card = requirementCard(page, c.requirementTitle);
    await expect(card).toContainText('Yüklənməyi gözləyir');
    const uploaded = page.waitForResponse(isUpload(c.caseId));
    await dropInput(page, c.requirementTitle).setInputFiles(s.samplePdf);
    expect((await uploaded).status(), 'POST documents').toBe(201);
    await expect(card).toContainText('Yoxlanılır');
    await expect(card).toContainText('pasport-surəti.pdf');
  });

  test('documents: re-uploading a rejected document is staged, nothing is sent before "Göndər"', async ({ context, page }) => {
    const s = seed();
    const c = s.clients.replace; // handed in, one document rejected
    await signIn(context, c);
    let uploads = 0;
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().endsWith(`/api/cases/${c.caseId}/documents`)) uploads++;
    });
    await openCase(page, c, 'docs');
    await expect(statusLine(page)).toContainText('rədd edildi');
    const card = requirementCard(page, c.requirementTitle);
    await expect(card).toContainText('Qəbul edilmədi');

    const staged = page.getByRole('group', { name: 'Seçilmiş fayl — yoxlayın, sonra göndərin' });
    await dropInput(page, c.requirementTitle).setInputFiles(s.samplePdf);
    await expect(staged).toBeVisible();
    await expect(staged).toContainText('pasport-surəti.pdf');
    await expect(staged.getByRole('button', { name: 'Göndər', exact: true })).toBeVisible();
    await expect(staged.getByRole('button', { name: 'Dəyiş', exact: true })).toBeVisible();

    // "Dəyiş" drops the staged file; still nothing sent.
    await staged.getByRole('button', { name: 'Dəyiş', exact: true }).click();
    await expect(staged).toBeHidden();
    expect(uploads, 'uploads before "Göndər"').toBe(0);

    await dropInput(page, c.requirementTitle).setInputFiles(s.samplePdf);
    await expect(staged).toBeVisible();
    expect(uploads, 'uploads before "Göndər"').toBe(0);
    const uploaded = page.waitForResponse(isUpload(c.caseId));
    await staged.getByRole('button', { name: 'Göndər', exact: true }).click();
    expect((await uploaded).status(), 'POST documents').toBe(201);
    await expect(staged).toBeHidden();
    expect(uploads).toBe(1);
    await expect(card).toContainText('Yoxlanılır');
  });

  test('sticky "Yoxlamaya göndər" opens the confirm dialog and hands the documents in', async ({ context, page }) => {
    const c = seed().clients.submit; // every required document uploaded, not handed in
    await signIn(context, c);
    await openCase(page, c, 'docs');
    await expect(statusLine(page)).toContainText('Bütün sənədlər yüklənib');
    await stickyNextBar(page).getByRole('link', { name: 'Yoxlamaya göndər' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Sənədləri yoxlamaya göndərmək istəyirsiniz?');
    expect(page.url(), 'the sticky button stays on the page').toContain('tab=docs');

    const submitted = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith(`/api/cases/${c.caseId}/submit`));
    await dialog.getByRole('button', { name: 'Yoxlamaya göndər' }).click();
    expect((await submitted).status(), 'POST submit').toBe(200);
    await expect(dialog).toBeHidden();
    await expect(statusLine(page)).toContainText('Sənədləriniz yoxlanılır');
    await expect(stickyNextBar(page)).toContainText('Hazırda bizdəyik');

    await page.getByRole('tab', { name: /Mənim işim/ }).click();
    await expect(page.locator('#current-step-title')).toHaveText('Sənədlər yoxlanılır');
    await expectStatusConsistent(page);
  });

  test('messages: the client sends a message', async ({ context, page }) => {
    const c = seed().clients.messages;
    await signIn(context, c);
    await openCase(page, c, 'messages');
    const box = page.locator('#messages');
    await expect(box).toContainText(c.staffMessage);
    const text = `Salam, sabah yükləyəcəm (${Date.now()})`;
    await box.getByPlaceholder('Mesajınızı yazın...').fill(text);
    const sent = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith(`/api/cases/${c.caseId}/messages`));
    await box.getByRole('button', { name: 'Göndər', exact: true }).click();
    expect((await sent).status(), 'POST messages').toBe(201);
    await expect(box).toContainText(text);
    await expect(box.getByPlaceholder('Mesajınızı yazın...')).toHaveValue('');
  });

  test('messages tab: the sticky next-step button opens the documents tab', async ({ context, page }) => {
    const c = seed().clients.messages; // DOCUMENTS_PENDING with missing documents
    await signIn(context, c);
    await openCase(page, c, 'messages');
    const bar = stickyNextBar(page);
    await expect(bar).toContainText('Sizdən gözlənilən');
    await bar.getByRole('link', { name: 'Sənədləri yüklə' }).click();
    await expect(page).toHaveURL(/[?&]tab=docs/);
    await expect(page.getByRole('tab', { name: /Sənədlər/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#docs-initial')).toBeVisible();
  });

  test('notification dropdown is not covered by the sticky bar', async ({ context, page }) => {
    const c = seed().clients.messages;
    await signIn(context, c);
    await openCase(page, c);
    await expect(stickyNextBar(page)).toBeVisible();
    await page.locator('[data-tour="notification-bell"]').click();
    const panel = page.getByRole('dialog', { name: 'Bildirişlər' });
    await expect(panel).toBeVisible();
    await expect(panel.getByText('Yeni mesaj').first()).toBeVisible();
    await expectNotCovered(panel, 'notification dropdown');

    // Also after scrolling (the sticky bar then sits right under the header).
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await scrollTo(page, '#current-step', 400);
    await page.locator('[data-tour="notification-bell"]').click();
    await expect(panel).toBeVisible();
    await expectNotCovered(panel, 'notification dropdown (scrolled)');
  });

  test('clicking a "Yeni mesaj" notification opens the messages tab', async ({ context, page }) => {
    const c = seed().clients.messages;
    await signIn(context, c);
    await openCase(page, c); // overview tab
    await page.locator('[data-tour="notification-bell"]').click();
    const panel = page.getByRole('dialog', { name: 'Bildirişlər' });
    await expect(panel).toBeVisible();
    // The row's main button ("Oxunmamış: Yeni mesaj …"), not its "Oxunmuş et: Yeni mesaj" toggle.
    await panel.getByRole('button', { name: /^(Oxunmamış: )?Yeni mesaj/ }).first().click();
    await expect(page).toHaveURL(new RegExp(`/account/cases/${escapeRe(c.caseId)}\\?tab=messages`));
    await expect(page.getByRole('tab', { name: /Mesajlar/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#messages')).toContainText(c.staffMessage);
  });
});
