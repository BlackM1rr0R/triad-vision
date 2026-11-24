import { escapeRe, expect, seed, statusLine, test, totp } from '../fixtures';

test.describe('public site', () => {
  test('home page shows the hero', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: /Güvənilir işçi təminatı/ })).toBeVisible();
  });

  test('jobs list → vacancy detail', async ({ page }) => {
    const { vacancy } = seed();
    await page.goto('/jobs');
    await expect(page.getByRole('heading', { level: 1, name: 'Almaniyada vakansiyalar' })).toBeVisible();
    await page.getByRole('link', { name: new RegExp(escapeRe(vacancy.title)) }).first().click();
    await expect(page).toHaveURL(new RegExp(`/jobs/${escapeRe(vacancy.slug)}$`));
    await expect(page.getByRole('heading', { level: 1, name: vacancy.title })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Vakansiya haqqında' })).toBeVisible();
  });

  test('vacancy request form opens and sends', async ({ page }) => {
    await page.goto('/jobs');
    const form = page.getByTestId('vreq-form');
    await form.scrollIntoViewIfNeeded();
    await expect(form.getByRole('heading', { name: 'İstədiyiniz vakansiyanı tapmadınız?' })).toBeVisible();
    await form.getByLabel('Sahə', { exact: true }).selectOption({ label: 'Logistika' });
    await form.getByLabel('Adınız', { exact: true }).fill('Brauzer Testçi');
    await form.getByLabel('Telefon', { exact: true }).fill('+994501112233');
    await form.getByRole('checkbox', { name: /Sorğum və uyğun vakansiyalar barədə/ }).check();
    const sent = page.waitForResponse((r) => r.url().endsWith('/api/vacancy-requests') && r.request().method() === 'POST');
    await form.getByRole('button', { name: 'Sorğu göndər' }).click();
    expect((await sent).status(), 'POST /api/vacancy-requests').toBeLessThan(300);
    await expect(page.getByTestId('vreq-done')).toContainText('Sorğunuz göndərildi');
  });

  test('register: filling the form creates an account', async ({ page }) => {
    const n = `${Date.now()}`.slice(-7);
    await page.goto('/register');
    await expect(page.getByRole('heading', { level: 1, name: 'Qeydiyyat' })).toBeVisible();
    await page.locator('input[name="firstName"]').fill('Tural');
    await page.locator('input[name="lastName"]').fill('Qeydiyyatçı');
    await page.locator('input[name="birthDate"]').fill('1994-05-17');
    await page.locator('input[name="passportNumber"]').fill(`C0${n}`);
    await page.locator('input[name="email"]').fill(`register${n}@browser.test.local`);
    await page.locator('input[name="phone"]').fill(`+99450${n}`);
    await page.locator('input[name="password"]').fill('Brauzer2026x');
    await page.locator('input[name="privacy"]').check();
    await page.locator('input[name="terms"]').check();
    const created = page.waitForResponse((r) => r.url().endsWith('/api/auth/register') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Qeydiyyatdan keç', exact: true }).click();
    expect((await created).status(), 'POST /api/auth/register').toBe(201);
    await expect(page.getByRole('heading', { name: 'Poçt qutunuzu yoxlayın' })).toBeVisible();

    // The new account is signed in: no guided tour for it (its id is unknown to the seed), then the cabinet.
    await page.evaluate(async () => {
      const me = (await (await fetch('/api/auth/me', { credentials: 'include' })).json()) as { user?: { id?: string } };
      if (me.user?.id) localStorage.setItem(`tv-tour:${me.user.id}:client-stages`, 'never');
    });
    await page.getByRole('button', { name: 'Kabinetə keç' }).or(page.getByRole('link', { name: 'Kabinetə keç' })).click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(statusLine(page)).toContainText('Aktiv müraciətiniz yoxdur');
  });

  test('client login with the form', async ({ page }) => {
    const c = seed().clients.viewer;
    await page.goto('/login');
    await expect(page.getByRole('heading', { level: 1, name: 'Kabinetə daxil olun' })).toBeVisible();
    await page.locator('#email').fill(c.email);
    await page.locator('#password').fill(c.password);
    await page.getByRole('button', { name: 'Daxil ol', exact: true }).click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(statusLine(page)).toBeVisible();
  });

  test('staff login with password + authenticator code', async ({ page }) => {
    const a = seed().admin;
    await page.goto('/login');
    await page.locator('#email').fill(a.email);
    await page.locator('#password').fill(a.password);
    await page.getByRole('button', { name: 'Daxil ol', exact: true }).click();
    await expect(page).toHaveURL(/\/login\/2fa$/);
    await expect(page.getByRole('heading', { level: 1, name: 'İki faktorlu təsdiq' })).toBeVisible();
    await page.locator('#tf-code').fill(await totp(a.totpSecret));
    await page.getByRole('button', { name: 'Təsdiqlə', exact: true }).click();
    await expect(page).toHaveURL(/\/admin(\/|$)/);
    await expect(page.locator('#admin-main')).toBeVisible();
  });
});
