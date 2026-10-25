import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { audit } from '../../lib/audit.js';
import { clearCache } from '../../lib/cache.js';
import { badRequest, notFound, parse } from '../../lib/http.js';
import {
  BRAND_LANGUAGES,
  BRAND_SETTING_KEY,
  brandEnv,
  brandSettingSchema,
  getBrand,
  publicBrand,
  readBrandSetting,
  refreshBrand,
  type BrandSetting,
} from '../../lib/brand/index.js';
import { BRAND_IMAGE_MAX_BYTES, storeIconSet, storeLogo } from '../../lib/brand/assets.js';
import { writeSetting } from '../../lib/growth/settings.js';
import { activeStaffCount, getLicense, licenseSummary, refreshLicense } from '../../lib/license/index.js';
import { getStoredModules, licensedModules } from '../../lib/navModules.js';
import {
  CURRENCIES,
  CUSTOMER_STATUSES,
  createCustomer,
  customerInputSchema,
  deleteCustomer,
  describeToken,
  mrr,
  readCustomers,
  updateCustomer,
} from '../../lib/whitelabel/customers.js';

/**
 * White-label administration (mounted under /api/admin, SUPER_ADMIN only — see routes/admin/index.ts):
 *   GET    /brand                      resolved brand + stored setting + BRAND_* env defaults
 *   PUT    /brand                      { name?, shortName?, tagline?, … }  (empty string = back to the default)
 *   POST   /brand/images/:kind         multipart `file`; kind = logoLight | logoDark | icon (icon → PWA icon set)
 *   DELETE /brand/images/:kind         back to the built-in image
 *   DELETE /brand                      every brand field back to the environment default
 *   GET    /license                    licence status, plan, seats in use, modules
 *   GET    /whitelabel/customers       owner instance only: customers + MRR
 *   POST   /whitelabel/customers       PATCH/DELETE /whitelabel/customers/:id, POST /:id/company, POST /whitelabel/verify-token
 */

// ─── Brand ────────────────────────────────────────────────────────────

export const adminBrandRouter = Router();

const brandView = async () => {
  const [brand, setting] = await Promise.all([getBrand(), readBrandSetting()]);
  return { brand: publicBrand(brand), emailFrom: brand.emailFrom, setting, env: brandEnv(), languages: BRAND_LANGUAGES };
};

const afterBrandChange = async () => {
  await refreshBrand();
  clearCache(); // SEO data / public content caches carry brand texts
};

adminBrandRouter.get('/', async (_req, res) => {
  res.json(await brandView());
});

/** Image fields are only set by the upload endpoint (they must point at files this instance stored). */
const brandUpdateSchema = brandSettingSchema.omit({ logoLight: true, logoDark: true, iconSet: true }).strict();

adminBrandRouter.put('/', async (req, res) => {
  const patch = parse(brandUpdateSchema, req.body ?? {});
  const current = await readBrandSetting();
  const next: BrandSetting = { ...current, ...patch };
  // Empty values mean "use the default": they are dropped instead of stored.
  for (const [k, v] of Object.entries(next)) if (v === '' || (Array.isArray(v) && v.length === 0)) delete (next as Record<string, unknown>)[k];
  await writeSetting(BRAND_SETTING_KEY, brandSettingSchema.parse(next));
  await audit(req, 'BRAND_UPDATED', `setting:${BRAND_SETTING_KEY}`, patch);
  await afterBrandChange();
  res.json(await brandView());
});

adminBrandRouter.delete('/', async (req, res) => {
  await prisma.setting.deleteMany({ where: { key: BRAND_SETTING_KEY } });
  await audit(req, 'BRAND_RESET', `setting:${BRAND_SETTING_KEY}`);
  await afterBrandChange();
  res.json(await brandView());
});

const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: BRAND_IMAGE_MAX_BYTES, files: 1 } });
const singleImage = (req: Request, res: Response, next: NextFunction) =>
  imageUpload.single('file')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) return next(badRequest(err.code === 'LIMIT_FILE_SIZE' ? 'BRAND_IMAGE_TOO_LARGE' : 'BRAND_IMAGE_INVALID'));
    next(err as Error | undefined);
  });
const imageKind = z.enum(['logoLight', 'logoDark', 'icon']);

adminBrandRouter.post('/images/:kind', singleImage, async (req, res) => {
  const kind = parse(imageKind, req.params.kind);
  if (!req.file) throw badRequest('FILE_REQUIRED');
  const current = await readBrandSetting();
  const next: BrandSetting = { ...current };
  if (kind === 'icon') next.iconSet = await storeIconSet(req.file.buffer, (await getBrand()).primaryColor);
  else next[kind] = await storeLogo(req.file.buffer, kind === 'logoLight' ? 'light' : 'dark');
  await writeSetting(BRAND_SETTING_KEY, brandSettingSchema.parse(next));
  await audit(req, 'BRAND_IMAGE_UPDATED', `setting:${BRAND_SETTING_KEY}`, { kind });
  await afterBrandChange();
  res.status(201).json(await brandView());
});

adminBrandRouter.delete('/images/:kind', async (req, res) => {
  const kind = parse(imageKind, req.params.kind);
  const next: BrandSetting = { ...(await readBrandSetting()) };
  delete next[kind === 'icon' ? 'iconSet' : kind];
  await writeSetting(BRAND_SETTING_KEY, brandSettingSchema.parse(next));
  await audit(req, 'BRAND_IMAGE_RESET', `setting:${BRAND_SETTING_KEY}`, { kind });
  await afterBrandChange();
  res.json(await brandView());
});

// ─── Licence ──────────────────────────────────────────────────────────

export const adminLicenseRouter = Router();

adminLicenseRouter.get('/', async (_req, res) => {
  const license = refreshLicense();
  const [staffSeatsUsed, stored] = await Promise.all([activeStaffCount(), getStoredModules()]);
  res.json({ ...licenseSummary(license), staffSeatsUsed, licensedModules: licensedModules(license), storedModules: stored });
});

// ─── Owner: customers / instances ─────────────────────────────────────

export const adminWhitelabelRouter = Router();

/** Only the owner's own instance keeps the customer list; on customer instances the pages do not exist. */
adminWhitelabelRouter.use((_req, _res, next) => {
  if (getLicense().role !== 'owner') return next(notFound('NOT_OWNER_INSTANCE'));
  next();
});

const withToken = <T extends { licenseToken: string }>(c: T) => ({ ...c, token: describeToken(c.licenseToken) });

adminWhitelabelRouter.get('/customers', async (_req, res) => {
  const items = await readCustomers();
  const companyIds = items.map((c) => c.companyId).filter(Boolean);
  const companies = companyIds.length ? await prisma.company.findMany({ where: { id: { in: companyIds } }, select: { id: true, name: true } }) : [];
  res.json({ items: items.map(withToken), companies, mrr: mrr(items), statuses: CUSTOMER_STATUSES, currencies: CURRENCIES });
});

adminWhitelabelRouter.post('/customers', async (req, res) => {
  const input = parse(customerInputSchema, req.body ?? {});
  const customer = await createCustomer(input);
  await audit(req, 'WHITELABEL_CUSTOMER_CREATED', `whitelabel:${customer.id}`, { name: customer.name, domain: customer.domain });
  res.status(201).json({ customer: withToken(customer) });
});

adminWhitelabelRouter.patch('/customers/:id', async (req, res) => {
  const patch = parse(customerInputSchema.partial().strict(), req.body ?? {});
  const customer = await updateCustomer(String(req.params.id), patch);
  if (!customer) throw notFound('CUSTOMER_NOT_FOUND');
  await audit(req, 'WHITELABEL_CUSTOMER_UPDATED', `whitelabel:${customer.id}`, { fields: Object.keys(patch) });
  res.json({ customer: withToken(customer) });
});

adminWhitelabelRouter.delete('/customers/:id', async (req, res) => {
  if (!(await deleteCustomer(String(req.params.id)))) throw notFound('CUSTOMER_NOT_FOUND');
  await audit(req, 'WHITELABEL_CUSTOMER_DELETED', `whitelabel:${String(req.params.id)}`);
  res.json({ ok: true });
});

/** Creates (or re-links) the Company record used for the monthly subscription invoices. */
adminWhitelabelRouter.post('/customers/:id/company', async (req, res) => {
  const id = String(req.params.id);
  const customer = (await readCustomers()).find((c) => c.id === id);
  if (!customer) throw notFound('CUSTOMER_NOT_FOUND');
  if (customer.companyId && (await prisma.company.findUnique({ where: { id: customer.companyId }, select: { id: true } }))) {
    res.json({ customer: withToken(customer), companyId: customer.companyId, created: false });
    return;
  }
  const company = await prisma.company.create({
    data: {
      name: customer.name,
      sector: 'other',
      website: customer.domain ? `https://${customer.domain}` : null,
      contactName: customer.contactName || null,
      email: customer.contactEmail || null,
      phone: customer.contactPhone || null,
      status: 'ACTIVE',
      note: 'White-label customer (System → Customers)',
    },
    select: { id: true },
  });
  const updated = await updateCustomer(id, { companyId: company.id });
  await audit(req, 'WHITELABEL_CUSTOMER_COMPANY', `whitelabel:${id}`, { companyId: company.id });
  res.status(201).json({ customer: updated ? withToken(updated) : null, companyId: company.id, created: true });
});

adminWhitelabelRouter.post('/verify-token', async (req, res) => {
  const { token } = parse(z.object({ token: z.string().trim().min(1).max(4000) }), req.body ?? {});
  res.json({ token: describeToken(token) });
});
