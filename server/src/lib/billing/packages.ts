import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Prisma, type Locale, type PackageOrder, type ServicePackage, type VisaType } from '@prisma/client';
import type { Request } from 'express';
import { prisma } from '../../db.js';
import { config } from '../../config.js';
import { badRequest, conflict, notFound, parse } from '../http.js';
import { renderEmail, sendMail } from '../mailer.js';
import { notifyStaff } from '../notifications.js';
import { currencySchema, formatMoney } from './currency.js';
import { getPackagePrices, packagePricesSchema, priceFor, pricesOf, removePackagePrices, setPackagePrices, visitorCurrency } from './packagePrices.js';
import { awaitingCountersign, withCountersigner } from '../esign/countersign.js';
import { recordConsent } from '../privacy/consents.js';
import { currentRef } from '../legal/documents.js';
import { onInquiryCreated } from '../assignment/inquiry.js';
import { attachLeadContext, utmSchema, visitorIdSchema } from '../marketing/leadScoring.js';
import { createCase, FINAL_STATUSES } from '../caseFlow.js';
import { renderContract } from '../contracts/render.js';
import { renderContractPdf } from '../contracts/pdf.js';
import { VISA_TYPE, asContractLang, fmtContractDate, triadParty, type ContractLang } from '../contracts/values.js';
import { cancelRequest, createRequest, readStored, remindRequest, sendRequest, storedPath, type Actor } from '../esign/service.js';
import { markClientsExcelDirty } from '../clientsExcel.js';
import { fromTemplate, createPlan, fireOnSign } from './plans.js';
import { isValidTrigger } from './math.js';
import { asBillingLocale, billingTexts, staffBillingTexts } from './texts.js';

/**
 * Service packages (Basic / Standard / Premium) and the online order:
 *   public form → PackageOrder (STARTED) + Inquiry (lead score) + AGB / privacy consent log → service contract
 *   generated from the package's contract template with the client's data → e-signature request (lib/esign,
 *   e-mail link with a one-time code) → on completion (esign afterCompletion hook, retried by the hourly job):
 *   client account (invite e-mail to set a password when new) → case (createCase) with the visa type → payment
 *   plan from the package's instalment template → ON_SIGN invoices → staff notified → ACTIVE.
 * The status page is reached with a token the browser generates (only its SHA-256 is stored), which also makes
 * a double submit idempotent: the same token returns the same order.
 */

const VISA_TYPES = ['WORK', 'AUSBILDUNG', 'WEITERBILDUNG', 'JOB_SEEKER', 'STUDY', 'FAMILY', 'TOURIST'] as const;
export const TIERS = ['BASIC', 'STANDARD', 'PREMIUM'] as const;
const SITE_LOCALES = ['az', 'de', 'en', 'ru', 'tr', 'uk'] as const;
type ContentLocale = 'az' | 'de' | 'en' | 'ru';

const l10n = (max: number) => z.object({ az: z.string().trim().max(max).default(''), de: z.string().trim().max(max).default(''), en: z.string().trim().max(max).default(''), ru: z.string().trim().max(max).default('') });
const l10nList = z.object({
  az: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
  de: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
  en: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
  ru: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
});

export const packageSchema = z
  .object({
    slug: z.string().trim().toLowerCase().min(2).max(120).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'INVALID_SLUG'),
    tier: z.enum(TIERS),
    visaTypes: z.array(z.enum(VISA_TYPES)).max(VISA_TYPES.length).nullable().default(null),
    title: l10n(160).refine((t) => !!(t.az || t.de || t.en || t.ru), 'TITLE_REQUIRED'),
    summary: l10n(600),
    features: l10nList,
    priceCents: z.coerce.number().int().min(100).max(100_000_000),
    /** Base currency of priceCents (EUR by default). */
    currency: currencySchema.default('EUR'),
    /** Optional fixed prices in the other currencies (packagePrices.ts). */
    prices: packagePricesSchema.optional(),
    installments: z
      .array(z.object({ label: l10n(160), percent: z.coerce.number().min(1).max(100), trigger: z.string().trim().max(40).refine((t) => isValidTrigger(t) && t !== 'DATE', 'INVALID_TRIGGER') }))
      .max(12)
      .nullable()
      .default(null)
      .refine((list) => !list || !list.length || Math.round(list.reduce((a, i) => a + i.percent, 0)) === 100, 'PERCENT_SUM'),
    contractTemplateId: z.string().trim().max(40).nullable().default(null),
    highlight: z.boolean().default(false),
    published: z.boolean().default(false),
    sortOrder: z.coerce.number().int().min(-1000).max(1000).default(0),
  })
  .strip();
export type PackageInput = z.input<typeof packageSchema>;

type L10nObj = Record<ContentLocale, string>;
type InstallmentTpl = { label: L10nObj; percent: number; trigger: string };

const asL10n = (v: unknown): L10nObj => {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return { az: String(o.az ?? ''), de: String(o.de ?? ''), en: String(o.en ?? ''), ru: String(o.ru ?? '') };
};
const pickL = (v: unknown, lang: ContentLocale) => {
  const o = asL10n(v);
  return o[lang] || o.de || o.en || o.az || o.ru;
};
const installmentsOf = (p: Pick<ServicePackage, 'installments'>): InstallmentTpl[] =>
  Array.isArray(p.installments)
    ? (p.installments as unknown[])
        .filter((i): i is Record<string, unknown> => !!i && typeof i === 'object')
        .map((i) => ({ label: asL10n(i.label), percent: Number(i.percent) || 0, trigger: String(i.trigger ?? 'ON_SIGN') }))
        .filter((i) => i.percent > 0 && isValidTrigger(i.trigger))
    : [];
const visaTypesOf = (p: Pick<ServicePackage, 'visaTypes'>): VisaType[] | null => (Array.isArray(p.visaTypes) ? (p.visaTypes as VisaType[]) : null);

export const contentLocale = (l: string): ContentLocale => (l === 'de' || l === 'en' || l === 'ru' || l === 'az' ? l : l === 'tr' || l === 'uk' ? 'en' : 'az');
/** Account / staff language for a site language: Turkish visitors are served by the Azerbaijani team, Ukrainian by the Russian one. */
export const accountLocale = (l: string): Locale => (l === 'de' || l === 'en' || l === 'ru' || l === 'az' ? l : l === 'uk' ? 'ru' : 'az');

type PriceStore = Awaited<ReturnType<typeof getPackagePrices>>;

export const adminPackageView = (p: ServicePackage, prices: PriceStore = {}) => ({ ...p, visaTypes: visaTypesOf(p), installments: installmentsOf(p), prices: pricesOf(p, prices) });

export const publicPackageView = (p: ServicePackage, prices: PriceStore = {}) => ({
  id: p.id,
  slug: p.slug,
  tier: p.tier,
  visaTypes: visaTypesOf(p),
  title: asL10n(p.title),
  summary: asL10n(p.summary),
  features: p.features,
  priceCents: p.priceCents,
  currency: p.currency,
  /** Price per currency (base + the extra fixed prices); the page shows the visitor's currency where defined. */
  prices: pricesOf(p, prices),
  installments: installmentsOf(p),
  highlight: p.highlight,
  sortOrder: p.sortOrder,
  updatedAt: p.updatedAt,
});

export const publishedPackages = () => prisma.servicePackage.findMany({ where: { published: true }, orderBy: [{ sortOrder: 'asc' }, { priceCents: 'asc' }] });

// ─── Admin CRUD ──────────────────────────────────────────────────────

const checkTemplate = async (id: string | null) => {
  if (!id) return;
  const t = await prisma.contractTemplate.findUnique({ where: { id }, select: { kind: true } });
  if (!t) throw badRequest('TEMPLATE_NOT_FOUND');
  if (t.kind !== 'SERVICE') throw badRequest('TEMPLATE_NOT_SERVICE');
};

const toData = (b: z.infer<typeof packageSchema>) => ({
  slug: b.slug,
  tier: b.tier,
  visaTypes: (b.visaTypes && b.visaTypes.length ? b.visaTypes : null) as Prisma.InputJsonValue | undefined,
  title: b.title,
  summary: b.summary,
  features: b.features,
  priceCents: b.priceCents,
  currency: b.currency,
  installments: (b.installments && b.installments.length ? b.installments : null) as Prisma.InputJsonValue | undefined,
  contractTemplateId: b.contractTemplateId,
  highlight: b.highlight,
  published: b.published,
  sortOrder: b.sortOrder,
});

export const createPackage = async (input: PackageInput) => {
  const b = parse(packageSchema, input);
  await checkTemplate(b.contractTemplateId);
  const d = toData(b);
  try {
    const created = await prisma.servicePackage.create({ data: { ...d, visaTypes: d.visaTypes ?? undefined, installments: d.installments ?? undefined } });
    await setPackagePrices(created.id, created.currency, b.prices);
    return created;
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') throw conflict('SLUG_TAKEN');
    throw err;
  }
};

export const updatePackage = async (id: string, input: PackageInput) => {
  const existing = await prisma.servicePackage.findUnique({ where: { id } });
  if (!existing) throw notFound('PACKAGE_NOT_FOUND');
  const b = parse(packageSchema, input);
  await checkTemplate(b.contractTemplateId);
  const d = toData(b);
  try {
    const updated = await prisma.servicePackage.update({
      where: { id },
      data: { ...d, visaTypes: d.visaTypes ?? Prisma.DbNull, installments: d.installments ?? Prisma.DbNull },
    });
    // Leaving `prices` out keeps the stored extra prices; sending it ({} = none) replaces them.
    if (b.prices !== undefined) await setPackagePrices(updated.id, updated.currency, b.prices);
    return updated;
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') throw conflict('SLUG_TAKEN');
    throw err;
  }
};

export const deletePackage = async (id: string) => {
  const orders = await prisma.packageOrder.count({ where: { packageId: id } });
  if (orders) throw conflict('PACKAGE_HAS_ORDERS');
  await prisma.servicePackage.delete({ where: { id } }).catch(() => {
    throw notFound('PACKAGE_NOT_FOUND');
  });
  await removePackagePrices(id);
};

// ─── Order ───────────────────────────────────────────────────────────

export const TOKEN_RE = /^[A-Za-z0-9_-]{32,64}$/;
export const tokenHash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

export const orderSchema = z.object({
  packageId: z.string().trim().min(1).max(40),
  name: z.string().trim().min(3).max(160).refine((s) => s.split(/\s+/).filter(Boolean).length >= 2, 'FULL_NAME_REQUIRED'),
  email: z.string().trim().toLowerCase().email().max(190),
  phone: z.string().trim().max(40).optional().nullable().transform((v) => (v ? v.replace(/[\s\-.()]/g, '') : null)).refine((v) => !v || /^\+\d{8,15}$/.test(v), 'INVALID_PHONE'),
  visaType: z.enum(VISA_TYPES).optional().nullable(),
  profession: z.string().trim().max(120).optional().nullable(),
  locale: z.enum(SITE_LOCALES).default('az'),
  /** Currency the price was shown in (default: the visitor's currency by site language; base price when the package has none). */
  currency: currencySchema.optional(),
  acceptTerms: z.literal(true),
  acceptPrivacy: z.literal(true),
  token: z.string().regex(TOKEN_RE),
  website: z.string().max(200).optional(),
  visitorId: visitorIdSchema.optional().catch(undefined),
  utm: utmSchema.optional().catch(undefined),
});

/** Acting staff member for documents created by the public flow (the e-signature request needs a creator). */
export const systemActor = async (): Promise<Actor> => {
  const u =
    (await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN', isActive: true }, orderBy: { createdAt: 'asc' } })) ??
    (await prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true }, orderBy: { createdAt: 'asc' } }));
  if (!u) throw conflict('NO_STAFF_ACCOUNT');
  return { id: u.id, role: u.role, firstName: u.firstName, lastName: u.lastName };
};

const splitName = (name: string) => {
  const parts = name.trim().split(/\s+/);
  return { firstName: parts[0].slice(0, 80), lastName: (parts.slice(1).join(' ') || '-').slice(0, 80) };
};

const FALLBACK_CONTRACT = `# Dienstleistungsvertrag

## § 1 Vertragsparteien
Auftragnehmer: {{triad.name}}, {{triad.address}}
Auftraggeber/in: {{client.fullName}}, E-Mail {{client.email}}, Telefon {{client.phone}}

## § 2 Gegenstand
Der Auftragnehmer begleitet den/die Auftraggeber/in im Visumverfahren ({{case.visaType}}) gemäß dem unten beschriebenen Leistungspaket. Der Auftragnehmer schuldet die sorgfältige Unterstützung, nicht die Erteilung des Visums; die Entscheidung trifft allein die zuständige Behörde.

## § 3 Vergütung
Die Vergütung und die Zahlungsraten ergeben sich aus dem Leistungspaket. Botschafts- und Behördengebühren sind nicht enthalten und werden gesondert als durchlaufende Posten berechnet.

## § 4 Allgemeine Geschäftsbedingungen
Es gelten die Allgemeinen Geschäftsbedingungen des Auftragnehmers in der bei Vertragsschluss gültigen Fassung.

{{today}}`;

const PKG_HEAD: Record<ContractLang, { pkg: string; price: string; features: string; schedule: string; terms: string; trigger: Record<string, string> }> = {
  de: { pkg: 'Leistungspaket', price: 'Preis (inkl. USt.)', features: 'Leistungsumfang', schedule: 'Zahlungsplan', terms: 'AGB-Version', trigger: { ON_SIGN: 'bei Vertragsunterzeichnung', EMBASSY_DOCUMENTS: 'bei Beginn der Botschaftsunterlagen', APPROVED: 'bei Visumzusage' } },
  en: { pkg: 'Service package', price: 'Price (VAT incl.)', features: 'Scope of services', schedule: 'Payment schedule', terms: 'Terms version', trigger: { ON_SIGN: 'on signing', EMBASSY_DOCUMENTS: 'when the embassy documents stage starts', APPROVED: 'on visa approval' } },
  az: { pkg: 'Xidmət paketi', price: 'Qiymət (ƏDV daxil)', features: 'Xidmətlərin həcmi', schedule: 'Ödəniş cədvəli', terms: 'Şərtlərin versiyası', trigger: { ON_SIGN: 'müqavilə imzalananda', EMBASSY_DOCUMENTS: 'səfirlik sənədləri mərhələsində', APPROVED: 'viza təsdiqləndikdə' } },
  ru: { pkg: 'Пакет услуг', price: 'Цена (с НДС)', features: 'Объём услуг', schedule: 'График платежей', terms: 'Версия условий', trigger: { ON_SIGN: 'при подписании', EMBASSY_DOCUMENTS: 'на этапе документов для посольства', APPROVED: 'при одобрении визы' } },
};

const triggerText = (lang: ContractLang, trigger: string) => {
  const h = PKG_HEAD[lang].trigger;
  if (trigger === 'ON_SIGN') return h.ON_SIGN;
  const status = trigger.replace(/^CASE_STATUS:/, '');
  return h[status] ?? status;
};

/** Contract text + PDF for an order: the package's template (or the default SERVICE template) with the order's data. */
export const buildOrderContract = async (order: PackageOrder, pkg: ServicePackage, termsVersion: string) => {
  const site = order.locale;
  const wanted = asContractLang(contentLocale(site));
  const tpl =
    (pkg.contractTemplateId ? await prisma.contractTemplate.findFirst({ where: { id: pkg.contractTemplateId, active: true } }) : null) ??
    (await prisma.contractTemplate.findFirst({ where: { kind: 'SERVICE', active: true, isDefault: true, language: wanted } })) ??
    (await prisma.contractTemplate.findFirst({ where: { kind: 'SERVICE', active: true, isDefault: true }, orderBy: { updatedAt: 'desc' } })) ??
    (await prisma.contractTemplate.findFirst({ where: { kind: 'SERVICE', active: true }, orderBy: { updatedAt: 'desc' } }));
  const lang = tpl ? asContractLang(tpl.language) : 'de';
  const triad = await triadParty();
  const { firstName, lastName } = splitName(order.name);
  const values: Record<string, string> = {
    'client.fullName': order.name,
    'client.firstName': firstName,
    'client.lastName': lastName === '-' ? '' : lastName,
    'client.email': order.email,
    'client.phone': order.phone ?? '',
    'case.visaType': order.visaType ? VISA_TYPE[lang][order.visaType as VisaType] ?? order.visaType : '',
    'triad.name': triad.name,
    'triad.address': triad.address,
    today: fmtContractDate(new Date(), lang),
  };
  const rendered = renderContract(tpl?.body ?? FALLBACK_CONTRACT, values);
  const h = PKG_HEAD[lang];
  const cl = lang as ContentLocale;
  const features = (() => {
    const f = (pkg.features ?? {}) as Record<string, unknown>;
    const list = f[cl] ?? f.de ?? f.en ?? f.az;
    return Array.isArray(list) ? (list as string[]) : [];
  })();
  const plan = installmentsOf(pkg);
  const amounts = fromTemplate({ items: plan.length ? plan.map((i) => ({ label: i.label, percent: i.percent, trigger: i.trigger })) : [{ label: { az: '', de: '', en: '', ru: '' }, percent: 100, trigger: 'ON_SIGN' }] }, order.priceCents, cl);
  const section = [
    '',
    `## ${h.pkg}: ${pickL(pkg.title, cl)}`,
    pickL(pkg.summary, cl),
    '',
    `${h.price}: ${formatMoney(order.priceCents, order.currency, { pdf: 'dejavu' })}`,
    '',
    ...(features.length ? [`## ${h.features}`, ...features.map((f) => `- ${f}`), ''] : []),
    `## ${h.schedule}`,
    ...amounts.map((a, i) => `- ${i + 1}. ${a.label ? `${a.label}: ` : ''}${formatMoney(a.amountCents, order.currency, { pdf: 'dejavu' })} — ${triggerText(lang, a.trigger)}`),
    '',
    `${h.terms}: ${termsVersion}`,
  ].join('\n');
  const text = `${rendered.text}\n${section}`;
  const title = tpl?.name ?? 'Dienstleistungsvertrag';
  const pdf = await renderContractPdf({ title, text, kind: 'SERVICE', language: lang, parties: [triad.name, order.name] });
  return { pdf, title, lang, missing: rendered.missing };
};

const statusUrl = (token: string, locale: string) => `${config.clientUrl}${locale === 'az' || !SITE_LOCALES.includes(locale as never) ? '' : `/${locale}`}/packages/order/${token}`;

const locks = new Map<string, Promise<unknown>>();
/** Runs `fn` for one order at a time in this process (the DB conditions protect across processes). */
const withLock = async <T>(key: string, fn: () => Promise<T>): Promise<T> => {
  while (locks.has(key)) await locks.get(key)!.catch(() => undefined);
  const p = fn();
  locks.set(key, p);
  try {
    return await p;
  } finally {
    locks.delete(key);
  }
};

/** Generates the contract and sends it for signature (once per order). */
const sendContract = async (orderId: string) =>
  withLock(`order:${orderId}`, async () => {
    const order = await prisma.packageOrder.findUniqueOrThrow({ where: { id: orderId } });
    if (order.signatureRequestId || order.status !== 'STARTED') return order;
    const pkg = await prisma.servicePackage.findUniqueOrThrow({ where: { id: order.packageId } });
    const terms = await currentRef('TERMS');
    const contract = await buildOrderContract(order, pkg, terms.version);
    const actor = await systemActor();
    const created = await createRequest(
      {
        title: `${contract.title} · ${pickL(pkg.title, 'de')}`.slice(0, 200),
        order: 'SEQUENTIAL',
        message: null,
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        // Client first, then (when configured) the authorised Triad Vision signatory countersigns (esign/countersign.ts).
        signers: await withCountersigner([{ role: 'CANDIDATE', name: order.name, email: order.email, phone: order.phone, locale: accountLocale(order.locale), order: 1 }], 'PACKAGE'),
        pdf: contract.pdf,
        fileName: `Dienstleistungsvertrag-${pkg.slug}.pdf`,
      },
      actor,
      { actorId: actor.id },
    );
    try {
      await sendRequest(created.id, actor, { actorId: actor.id });
    } catch (err) {
      await prisma.signatureRequest.delete({ where: { id: created.id } }).catch(() => undefined);
      await fs.unlink(storedPath(created.originalKey)).catch(() => undefined);
      throw err;
    }
    return prisma.packageOrder.update({ where: { id: order.id }, data: { signatureRequestId: created.id } });
  });

/** POST /api/packages/orders. Idempotent per browser token; returns the order's status view. */
export const createOrder = async (input: unknown, req: Pick<Request, 'ip' | 'get'>) => {
  const body = parse(orderSchema, input);
  const hash = tokenHash(body.token);
  const existing = await prisma.packageOrder.findUnique({ where: { tokenHash: hash } });
  if (existing) {
    if (existing.email !== body.email) throw conflict('TOKEN_IN_USE');
    if (existing.status === 'STARTED' && !existing.signatureRequestId) await sendContract(existing.id);
    return orderStatus(body.token);
  }
  const pkg = await prisma.servicePackage.findUnique({ where: { id: body.packageId } });
  if (!pkg || !pkg.published) throw notFound('PACKAGE_NOT_FOUND');
  const allowed = visaTypesOf(pkg);
  if (body.visaType && allowed && !allowed.includes(body.visaType)) throw badRequest('VISA_TYPE_NOT_IN_PACKAGE');
  const visaType = body.visaType ?? (allowed?.length === 1 ? allowed[0] : null);
  const user = await prisma.user.findUnique({ where: { email: body.email }, select: { id: true, role: true, isActive: true } });
  if (user && user.role !== 'CLIENT') throw conflict('EMAIL_NOT_CLIENT');
  await systemActor(); // fail early when nobody could own the signature request

  const title = pickL(pkg.title, contentLocale(body.locale));
  const price = priceFor(pkg, await getPackagePrices(), body.currency ?? visitorCurrency(body.locale));
  let order: PackageOrder;
  try {
    order = await prisma.packageOrder.create({
      data: {
        packageId: pkg.id,
        clientId: user?.isActive ? user.id : null,
        email: body.email,
        name: body.name,
        phone: body.phone,
        locale: body.locale,
        visaType,
        priceCents: price.priceCents,
        currency: price.currency,
        status: 'STARTED',
        tokenHash: hash,
      },
    });
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') return orderStatus(body.token); // a parallel double submit won
    throw err;
  }

  // Lead + consent log (never block the order on these).
  try {
    const inquiry = await prisma.inquiry.create({
      data: {
        kind: 'contact',
        source: `package:${pkg.slug}`.slice(0, 80),
        contactName: body.name,
        email: body.email,
        phone: body.phone,
        sector: body.profession || null,
        message: [`Paket sifarişi: ${title} (${pkg.tier}) · ${formatMoney(price.priceCents, price.currency)}`, visaType ? `Viza növü: ${visaType}` : null, body.profession ? `Peşə: ${body.profession}` : null].filter(Boolean).join('\n'),
        locale: accountLocale(body.locale),
        status: 'IN_PROGRESS',
      },
    });
    await prisma.packageOrder.update({ where: { id: order.id }, data: { inquiryId: inquiry.id } });
    void onInquiryCreated(inquiry.id);
    await attachLeadContext(inquiry.id, { visitorId: body.visitorId, utm: body.utm });
  } catch (err) {
    console.error('[packages] inquiry failed', order.id, err);
  }
  await recordConsent({ userId: order.clientId, email: body.email, type: 'TERMS', granted: true, source: 'PACKAGE_ORDER', req });
  await recordConsent({ userId: order.clientId, email: body.email, type: 'PRIVACY_POLICY', granted: true, source: 'PACKAGE_ORDER', req });

  await sendContract(order.id);

  const t = billingTexts[asBillingLocale(accountLocale(body.locale))];
  const msg = t.orderReceived({ name: splitName(body.name).firstName, pkg: title, price: formatMoney(price.priceCents, price.currency), email: body.email });
  void sendMail(body.email, `Triad Vision · ${msg.title}`, renderEmail(msg.title, msg.body, { label: t.orderCta, url: statusUrl(body.token, body.locale) }));
  const s = staffBillingTexts.orderNew({ name: body.name, pkg: pickL(pkg.title, 'az'), price: formatMoney(price.priceCents, price.currency), email: body.email });
  await notifyStaff(s.title, s.body, { link: '/admin/packages?tab=orders', type: 'PACKAGE_ORDER' });
  return orderStatus(body.token);
};

/** Public status view of an order (by token). */
export const orderStatus = async (token: string) => {
  if (!TOKEN_RE.test(token)) throw notFound('ORDER_NOT_FOUND');
  const order = await prisma.packageOrder.findUnique({ where: { tokenHash: tokenHash(token) } });
  if (!order) throw notFound('ORDER_NOT_FOUND');
  const [pkg, request, kase, invoice] = await Promise.all([
    prisma.servicePackage.findUnique({ where: { id: order.packageId } }),
    order.signatureRequestId ? prisma.signatureRequest.findUnique({ where: { id: order.signatureRequestId }, select: { status: true, sentAt: true, completedAt: true, expiresAt: true, signers: { select: { role: true, status: true } } } }) : null,
    order.caseId ? prisma.case.findUnique({ where: { id: order.caseId }, select: { number: true } }) : null,
    order.planId ? prisma.clientInvoice.findFirst({ where: { orderId: order.id, status: { not: 'DRAFT' } }, orderBy: { createdAt: 'asc' }, select: { number: true, grossCents: true, status: true } }) : null,
  ]);
  const at = order.email.indexOf('@');
  return {
    status: order.status,
    createdAt: order.createdAt,
    firstName: splitName(order.name).firstName,
    email: at > 1 ? `${order.email[0]}***${order.email.slice(at)}` : order.email,
    locale: order.locale,
    visaType: order.visaType,
    priceCents: order.priceCents,
    currency: order.currency,
    package: pkg ? { slug: pkg.slug, tier: pkg.tier, title: asL10n(pkg.title), installments: installmentsOf(pkg) } : null,
    signature: request
      ? { status: request.status, sentAt: request.sentAt, completedAt: request.completedAt, expiresAt: request.expiresAt, countersignPending: request.status === 'SENT' && awaitingCountersign(request.signers) }
      : null,
    caseNumber: kase?.number ?? null,
    firstInvoice: invoice,
  };
};

/** New signing link for the order's contract (public "resend" button). */
export const resendOrderLink = async (token: string) => {
  if (!TOKEN_RE.test(token)) throw notFound('ORDER_NOT_FOUND');
  const order = await prisma.packageOrder.findUnique({ where: { tokenHash: tokenHash(token) } });
  if (!order) throw notFound('ORDER_NOT_FOUND');
  if (order.status !== 'STARTED') throw conflict('ORDER_NOT_OPEN');
  if (!order.signatureRequestId) {
    await sendContract(order.id);
    return { reminded: 1 };
  }
  const actor = await systemActor();
  return remindRequest(order.signatureRequestId, actor, null, { actorId: actor.id });
};

// ─── Activation after signature ──────────────────────────────────────

const INVITE_DAYS = 7;

const createClientAccount = async (order: PackageOrder) => {
  const { firstName, lastName } = splitName(order.name);
  const locale = accountLocale(order.locale);
  const user = await prisma.user.create({
    data: {
      email: order.email,
      passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10),
      role: 'CLIENT',
      firstName,
      lastName,
      phone: order.phone,
      locale,
      // The e-mail address was proven by the signing link / one-time code.
      emailVerifiedAt: new Date(),
    },
  });
  const token = crypto.randomBytes(32).toString('hex');
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: crypto.createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000) },
  });
  const t = billingTexts[asBillingLocale(locale)];
  const msg = t.invite({ name: firstName, pkg: '', price: '' });
  void sendMail(user.email, `Triad Vision · ${msg.title}`, renderEmail(msg.title, msg.body, { label: t.inviteCta, url: `${config.clientUrl}/reset-password?token=${token}` }));
  await recordConsent({ userId: user.id, email: user.email, type: 'TERMS', granted: true, source: 'PACKAGE_ORDER' });
  await recordConsent({ userId: user.id, email: user.email, type: 'PRIVACY_POLICY', granted: true, source: 'PACKAGE_ORDER' });
  markClientsExcelDirty();
  return user;
};

/** The signed contract as a case Document (stage CONTRACT_SIGNED) + the request linked to the case. */
const fileContractOnCase = async (requestId: string, caseId: string, clientId: string) => {
  const r = await prisma.signatureRequest.findUnique({ where: { id: requestId }, select: { finalKey: true, finalSize: true, finalDocumentId: true, caseId: true } });
  if (!r) return;
  if (!r.caseId) await prisma.signatureRequest.update({ where: { id: requestId }, data: { caseId } });
  if (!r.finalKey || r.finalDocumentId) return;
  const c = await prisma.case.findUniqueOrThrow({ where: { id: caseId }, select: { number: true } });
  const storedName = `${Date.now()}-esign-case-${crypto.randomBytes(12).toString('hex')}.pdf`;
  const bytes = await readStored(r.finalKey);
  await fs.writeFile(storedPath(storedName), bytes);
  const doc = await prisma.document.create({
    data: { caseId, stage: 'CONTRACT_SIGNED', originalName: `${c.number}-service-contract-signed.pdf`, storedName, mimeType: 'application/pdf', size: bytes.length, status: 'ACCEPTED', uploadedById: clientId },
  });
  await prisma.signatureRequest.update({ where: { id: requestId }, data: { finalDocumentId: doc.id } });
};

/**
 * Account → case → plan → ON_SIGN invoices → ACTIVE. Every step stores its result on the order, so a failed
 * run continues where it stopped (hourly job / admin "retry").
 */
export const activateOrder = async (orderId: string) =>
  withLock(`order:${orderId}`, async () => {
    let order = await prisma.packageOrder.findUnique({ where: { id: orderId } });
    if (!order || order.status === 'ACTIVE' || order.status === 'CANCELLED') return order;
    if (order.status === 'STARTED') {
      const r = order.signatureRequestId ? await prisma.signatureRequest.findUnique({ where: { id: order.signatureRequestId }, select: { status: true, signers: { select: { role: true, status: true } } } }) : null;
      // Activation at the client's signature: a contract still waiting for the Triad Vision countersignature
      // ("pending countersignature") already activates the order; the final PDF follows the countersignature.
      if (!r || (r.status !== 'COMPLETED' && !(r.status === 'SENT' && awaitingCountersign(r.signers)))) return order;
      await prisma.packageOrder.updateMany({ where: { id: order.id, status: 'STARTED' }, data: { status: 'SIGNED' } });
      order = await prisma.packageOrder.findUniqueOrThrow({ where: { id: order.id } });
    }
    const pkg = await prisma.servicePackage.findUniqueOrThrow({ where: { id: order.packageId } });
    const lang = contentLocale(order.locale);
    try {
      // 1. Account
      let clientId = order.clientId;
      let created = false;
      if (!clientId) {
        const u = await prisma.user.findUnique({ where: { email: order.email }, select: { id: true, role: true } });
        if (u && u.role !== 'CLIENT') throw conflict('EMAIL_NOT_CLIENT');
        clientId = u?.id ?? (await createClientAccount(order)).id;
        created = !u;
        order = await prisma.packageOrder.update({ where: { id: order.id }, data: { clientId } });
      }
      // 2. Case (an open main case of the client is used instead of a second one)
      let caseId = order.caseId;
      if (!caseId) {
        const open = await prisma.case.findFirst({ where: { clientId, parentCaseId: null, status: { notIn: FINAL_STATUSES } }, orderBy: { createdAt: 'desc' }, select: { id: true } });
        const inquiry = order.inquiryId ? await prisma.inquiry.findUnique({ where: { id: order.inquiryId }, select: { sector: true } }) : null;
        caseId =
          open?.id ??
          (
            await createCase(clientId, {
              profession: (inquiry?.sector || pickL(pkg.title, 'az') || 'Paket').slice(0, 120),
              visaType: (order.visaType as VisaType | null) ?? undefined,
            })
          ).id;
        order = await prisma.packageOrder.update({ where: { id: order.id }, data: { caseId } });
      }
      if (order.signatureRequestId) await fileContractOnCase(order.signatureRequestId, caseId, clientId).catch((err) => console.error('[packages] filing contract failed', order!.id, err));
      // 3. Plan from the package's instalment template (gross amounts of the price)
      let planId = order.planId;
      if (!planId) {
        const tpl = installmentsOf(pkg);
        const items = fromTemplate({ items: tpl.length ? tpl : [{ label: { az: 'Xidmət haqqı', de: 'Servicegebühr', en: 'Service fee', ru: 'Сервисный сбор' }, percent: 100, trigger: 'ON_SIGN' }] }, order.priceCents, lang);
        const { plan } = await createPlan({ clientId, caseId, title: `${pickL(pkg.title, 'de') || pkg.slug} (${pkg.tier})`, installments: items, currency: currencySchema.catch('EUR').parse(order.currency) }, null, { orderId: order.id, catchUp: false });
        planId = plan.id;
        order = await prisma.packageOrder.update({ where: { id: order.id }, data: { planId } });
      }
      // 4. First invoice(s)
      await fireOnSign(planId);
      // 5. Done
      const done = await prisma.packageOrder.updateMany({ where: { id: order.id, status: 'SIGNED' }, data: { status: 'ACTIVE' } });
      if (done.count) {
        if (order.inquiryId) await prisma.inquiry.update({ where: { id: order.inquiryId }, data: { status: 'DONE' } }).catch(() => undefined);
        const kase = await prisma.case.findUniqueOrThrow({ where: { id: caseId }, select: { number: true } });
        const s = staffBillingTexts.orderActive({ name: order.name, pkg: pickL(pkg.title, 'az'), caseNumber: kase.number });
        await notifyStaff(s.title, s.body, { caseId, link: `/admin/cases/${caseId}?tab=finance`, type: 'PACKAGE_ORDER_ACTIVE' });
        const u = await prisma.user.findUniqueOrThrow({ where: { id: clientId }, select: { locale: true, email: true, firstName: true } });
        const t = billingTexts[asBillingLocale(u.locale)];
        const msg = t.orderActive({ name: u.firstName, pkg: pickL(pkg.title, lang), price: formatMoney(order.priceCents, order.currency), caseNumber: kase.number });
        void sendMail(u.email, `Triad Vision · ${msg.title}`, renderEmail(msg.title, msg.body, { label: t.portalCta, url: `${config.clientUrl}${created ? '/login' : '/account/payments'}` }));
      }
      return prisma.packageOrder.findUnique({ where: { id: order.id } });
    } catch (err) {
      console.error('[packages] activation failed', order.id, err);
      const key = `pkg-activate-failed:${order.id}`;
      const first = await prisma.reminderLog.create({ data: { key } }).then(() => true).catch(() => false);
      if (first) {
        const s = staffBillingTexts.orderFailed({ name: order.name, pkg: pickL(pkg.title, 'az'), error: (err as { code?: string; message?: string }).code ?? (err as Error).message ?? 'error' });
        await notifyStaff(s.title, s.body, { link: '/admin/packages?tab=orders', type: 'PACKAGE_ORDER_FAILED' });
      }
      throw err;
    }
  });

/**
 * esign hook: a completed signature request — or one where the client has signed and only the Triad Vision
 * countersignature is missing — may be a package contract. Never throws.
 */
export const onSignatureCompleted = async (requestId: string) => {
  try {
    const order = await prisma.packageOrder.findFirst({ where: { signatureRequestId: requestId } });
    if (order && (order.status === 'STARTED' || order.status === 'SIGNED')) await activateOrder(order.id);
  } catch (err) {
    console.error('[packages] signature hook failed', requestId, err);
  }
};

/**
 * Hourly: orders whose contract was signed but not activated yet (hook failed / server restart) are activated;
 * orders whose signature request was declined, cancelled or expired are cancelled.
 */
export const runPackageOrderJobs = async () => {
  const result = { activated: 0, cancelled: 0 };
  const open = await prisma.packageOrder.findMany({ where: { status: { in: ['STARTED', 'SIGNED'] }, signatureRequestId: { not: null } }, take: 200 });
  for (const o of open) {
    const r = await prisma.signatureRequest.findUnique({ where: { id: o.signatureRequestId! }, select: { status: true, expiresAt: true, signers: { select: { role: true, status: true } } } });
    if (!r) continue;
    if (r.status === 'COMPLETED' || o.status === 'SIGNED' || (r.status === 'SENT' && awaitingCountersign(r.signers))) {
      try {
        const after = await activateOrder(o.id);
        if (after?.status === 'ACTIVE') result.activated++;
      } catch {
        // reported to staff once by activateOrder
      }
    } else if (r.status === 'DECLINED' || r.status === 'CANCELLED' || r.status === 'EXPIRED' || (r.status === 'SENT' && r.expiresAt && r.expiresAt < new Date())) {
      const c = await prisma.packageOrder.updateMany({ where: { id: o.id, status: 'STARTED' }, data: { status: 'CANCELLED' } });
      result.cancelled += c.count;
    }
  }
  return result;
};

/** Admin: cancel an order that has not been signed yet (the signature request is cancelled too). */
export const cancelOrder = async (id: string, actor: Actor) => {
  const order = await prisma.packageOrder.findUnique({ where: { id } });
  if (!order) throw notFound('ORDER_NOT_FOUND');
  if (order.status !== 'STARTED') throw conflict('ORDER_NOT_OPEN');
  if (order.signatureRequestId) await cancelRequest(order.signatureRequestId, actor, 'Package order cancelled').catch(() => undefined);
  await prisma.packageOrder.update({ where: { id }, data: { status: 'CANCELLED' } });
  return prisma.packageOrder.findUniqueOrThrow({ where: { id } });
};

/** Admin list of orders with package, signature and case details. */
export const listOrders = async (q: { status?: string; q?: string }) => {
  const where: Prisma.PackageOrderWhereInput = {
    ...(q.status ? { status: q.status } : {}),
    ...(q.q ? { OR: [{ email: { contains: q.q } }, { name: { contains: q.q } }] } : {}),
  };
  const orders = await prisma.packageOrder.findMany({ where, orderBy: { createdAt: 'desc' }, take: 500 });
  const [pkgs, requests, cases] = await Promise.all([
    prisma.servicePackage.findMany({ where: { id: { in: [...new Set(orders.map((o) => o.packageId))] } }, select: { id: true, slug: true, tier: true, title: true } }),
    prisma.signatureRequest.findMany({ where: { id: { in: orders.map((o) => o.signatureRequestId).filter((x): x is string => !!x) } }, select: { id: true, status: true, signers: { select: { role: true, status: true } } } }),
    prisma.case.findMany({ where: { id: { in: orders.map((o) => o.caseId).filter((x): x is string => !!x) } }, select: { id: true, number: true } }),
  ]);
  const pMap = new Map(pkgs.map((p) => [p.id, p]));
  const rMap = new Map(requests.map((r) => [r.id, r.status]));
  const csMap = new Map(requests.map((r) => [r.id, r.status === 'SENT' && awaitingCountersign(r.signers)]));
  const cMap = new Map(cases.map((c) => [c.id, c.number]));
  const counts = await prisma.packageOrder.groupBy({ by: ['status'], _count: { _all: true } });
  return {
    orders: orders.map(({ tokenHash: _t, ...o }) => ({
      ...o,
      package: pMap.get(o.packageId) ?? null,
      signatureStatus: o.signatureRequestId ? (rMap.get(o.signatureRequestId) ?? null) : null,
      countersignPending: o.signatureRequestId ? (csMap.get(o.signatureRequestId) ?? false) : false,
      caseNumber: o.caseId ? (cMap.get(o.caseId) ?? null) : null,
    })),
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
  };
};
