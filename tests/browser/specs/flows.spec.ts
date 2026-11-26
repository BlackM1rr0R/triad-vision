import type { Page } from '@playwright/test';
import { expect, openCase, seed, signIn, test } from '../fixtures';

/**
 * Newer flows end to end in the browser: the two-step case contract (Əmək müqaviləsi: client signs first, then Triad
 * Vision), shared documents (one upload fills the initial and the embassy list) and a listing elsewhere (the candidate
 * applies to the employer directly: "Elanı aç və müraciət et"). Every case scenario has its own seeded client
 * (server/tests/browser/seed.ts).
 */

/** A requirement card of one document list (`#docs-initial` / `#docs-embassy`), found by its az title. */
const requirementCard = (page: Page, list: 'initial' | 'embassy', title: string) =>
  page.locator(`#docs-${list} li`).filter({ has: page.getByRole('heading', { level: 4, name: title, exact: true }) }).first();

test.describe('contract: Əmək müqaviləsi (V2)', () => {
  test('client signs first, then staff see the client PDF, sign for Triad Vision and the next step moves on', async ({ context, page }) => {
    const c = seed().clients.contract; // initial documents accepted, Əmək müqaviləsi sent with signature places

    await test.step('client: the contract card asks for the signature; a drawn signature signs it', async () => {
      await signIn(context, c);
      await openCase(page, c, 'docs');
      const card = page.locator('#contract');
      await expect(card).toContainText('1. Əmək müqaviləsi');
      await expect(card).toContainText('İmzanızı gözləyir');
      await card.getByRole('link', { name: 'İndi imzala' }).click();
      await expect(page).toHaveURL(/\/account\/signatures\/[^/?#]+/);

      const canvas = page.locator('canvas').first();
      await expect(canvas).toBeVisible();
      await canvas.scrollIntoViewIfNeeded();
      const box = await canvas.boundingBox();
      expect(box, 'signature canvas has a size').not.toBeNull();
      const y = box!.y + box!.height / 2;
      await page.mouse.move(box!.x + 30, y);
      await page.mouse.down();
      await page.mouse.move(box!.x + 80, y - 20, { steps: 8 });
      await page.mouse.move(box!.x + 140, y + 20, { steps: 8 });
      await page.mouse.move(box!.x + 200, y - 10, { steps: 8 });
      await page.mouse.up();

      await page.getByLabel(/Sənədi oxudum və onunla razıyam/).check();
      const signed = page.waitForResponse((r) => r.request().method() === 'POST' && /\/api\/signatures\/my\/[^/]+\/sign$/.test(r.url()));
      const submit = page.getByRole('button', { name: 'Sənədi imzala', exact: true });
      await expect(submit).toBeEnabled();
      await submit.click();
      expect((await signed).status(), 'POST sign').toBe(200);
      await expect(page.getByText('Bu sənədi imzaladınız')).toBeVisible();
    });

    await test.step('staff: the client-signed PDF and the "sign for Triad Vision" next step', async () => {
      await signIn(context, seed().admin);
      await page.goto(`/admin/cases/${c.caseId}?tab=documents`);
      // First admin page of this context: the admin chunks download now (cold cache) — allow more than the default.
      await expect(page.getByRole('heading', { level: 1, name: c.caseNumber })).toBeVisible({ timeout: 30_000 });
      const step = page.getByRole('article', { name: 'Əmək müqaviləsi', exact: true });
      await expect(step.getByRole('link', { name: 'Müştərinin imzaladığı PDF-ə bax' }).first()).toBeVisible();
      await expect(page.locator('#case-next-step')).toContainText('Müştəri Əmək müqaviləsini imzaladı — Triad Vision adından imzalayın');

      await step.getByRole('button', { name: 'Razıyam, imzala' }).click();
      const dialog = page.getByRole('dialog', { name: /Triad Vision adından imzala/ });
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: 'Adı yaz' }).click();
      await expect(dialog.getByLabel('Ad və soyad')).not.toHaveValue('');
      await dialog.getByRole('checkbox').check();
      const signed = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith(`/api/admin/case-contracts/cases/${c.caseId}/triad-sign`));
      await dialog.getByRole('button', { name: 'İmzala', exact: true }).click();
      expect((await signed).status(), 'POST triad-sign').toBe(200);
      await expect(dialog).toBeHidden();
    });

    await test.step('staff: the contract is approved and the next step is preparing the German documents', async () => {
      const next = page.locator('#case-next-step');
      const workStep = next.getByText(/ödənişdən sonra alman sənədlərini/);
      // The card follows the case on its own; one reload is the fallback when that refresh was missed.
      await expect(async () => {
        if (!(await workStep.isVisible())) await page.reload();
        await expect(workStep).toBeVisible({ timeout: 5_000 });
      }).toPass({ timeout: 30_000 });
      await expect(next).not.toContainText('Triad Vision adından imzalayın');
      await expect(page.getByRole('article', { name: 'Əmək müqaviləsi', exact: true })).toContainText('Təsdiqləndi');
    });
  });
});

test.describe('shared documents (initial ↔ embassy)', () => {
  test('a passport uploaded for the initial documents appears in the embassy list with the automatic chip', async ({ context, page }) => {
    const s = seed();
    const c = s.clients.docLink; // the embassy list already holds a passport requirement
    await signIn(context, c);
    await openCase(page, c, 'docs');

    const embassy = requirementCard(page, 'embassy', c.embassyRequirementTitle);
    await expect(embassy).toBeVisible();
    await expect(embassy).not.toContainText('Avtomatik əlavə olundu');

    const initial = requirementCard(page, 'initial', c.initialRequirementTitle);
    const uploaded = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith(`/api/cases/${c.caseId}/documents`));
    await initial.locator('input[type="file"][accept*=".pdf"]:not([multiple])').first().setInputFiles(s.samplePdf);
    expect((await uploaded).status(), 'POST documents').toBe(201);
    await expect(initial).toContainText('pasport-surəti.pdf');

    await expect(embassy.getByText('Avtomatik əlavə olundu: İlkin sənədlərdən')).toBeVisible();
    await expect(embassy).toContainText('pasport-surəti.pdf');
  });
});

test.describe('external listing: the candidate applies directly', () => {
  test('a job-alert link shows the listing with "Elanı aç və müraciət et" (new tab, no referrer) and the note', async ({ page }) => {
    // No job source in the browser tests: the page must not search (the listing card comes from the link alone).
    await page.route('**/api/germany-jobs/config', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ search: false, sources: [], apply: false }) }));
    const url = 'https://jobs.example.test/stellen/berufskraftfahrer-ce';
    const q = new URLSearchParams({ apply: 'arbeitnow:fahrer-ce', at: 'Berufskraftfahrer CE (brauzer testi)', ac: 'Nord Logistik GmbH', al: 'Hamburg', au: url });
    await page.goto(`/jobs/germany/search?${q.toString()}`);
    const card = page.locator('section[aria-labelledby="gj-mail-listing-h"]');
    await expect(card.getByRole('heading', { name: 'Berufskraftfahrer CE (brauzer testi)' })).toBeVisible();
    const open = card.getByRole('link', { name: /Elanı aç və müraciət et/ });
    await expect(open).toHaveAttribute('href', url);
    await expect(open).toHaveAttribute('target', '_blank');
    await expect(open).toHaveAttribute('rel', /noopener/);
    await expect(open).toHaveAttribute('rel', /noreferrer/);
    await expect(open).toHaveAttribute('rel', /nofollow/);
    await expect(card).toContainText('Triad Vision bu elanlarda vasitəçi deyil');
    // Guests: the way to the free Lebenslauf / Anschreiben helpers; no "apply via Triad Vision" anywhere.
    await expect(card.getByRole('link', { name: 'Qeydiyyatdan keç' })).toBeVisible();
    await expect(page.getByText('Triad Vision ilə müraciət et')).toHaveCount(0);
  });
});
