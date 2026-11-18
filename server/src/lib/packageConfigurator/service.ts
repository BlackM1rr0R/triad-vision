import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { badRequest } from '../http.js';
import { audit } from '../audit.js';
import { notifyStaff } from '../notifications.js';
import { onInquiryCreated } from '../assignment/inquiry.js';
import { attachLeadContext, utmSchema, visitorIdSchema } from '../marketing/leadScoring.js';
import { PROFESSION_KEYS } from '../matching.js';
import { PROFESSION_LABELS } from '../jobAlerts/texts.js';
import { SEO_LOCALES, type SeoLocale } from '../seoCatalogue.js';
import { getQuoteSettings, CONFIGURATOR_SERVICES } from '../quotes/settings.js';
import { adminLink, logQuoteEvent } from '../quotes/service.js';
import { formatEur } from '../invoiceTexts.js';
import { loadInvoiceSettings } from '../../routes/admin/invoices.js';
import { configInput, configuratorCatalogue, priceConfiguration, type ConfigInput, type PricedConfiguration } from './pricing.js';

/**
 * Package configurator: catalogue view, live price and the "get official offer" request.
 *
 *  - Public (/for-employers, no account): the request becomes a lead (Inquiry, source `configurator`) with the
 *    configuration and the computed total in `estimate`; staff create the company and the quote from it.
 *  - Company portal (signed-in employer): additionally a DRAFT quote of the company in the quotes module
 *    (source of every price: the catalogue). Drafts are invisible to the employer; the PDF offer exists for
 *    them only after staff review and send it (lib/quotes/service.sendQuote numbers it). The quotes module has
 *    no auto-issuing, so nothing is sent automatically.
 */

const DAY = 24 * 60 * 60 * 1000;
/** Free-text "other" profession of the form (priced by the general recruitment line). */
export const OTHER_PROFESSION = 'other';
const OTHER_LABEL: Record<SeoLocale, string> = { az: 'Digər peşə', de: 'Andere Fachkraft', en: 'Other profession', ru: 'Другая профессия', tr: 'Diğer meslek', uk: 'Інша професія' };

const lngOf = (raw: unknown): SeoLocale => (typeof raw === 'string' && (SEO_LOCALES as readonly string[]).includes(raw.slice(0, 2)) ? (raw.slice(0, 2) as SeoLocale) : 'de');
export const professionName = (key: string, lng: SeoLocale) => (key === OTHER_PROFESSION ? OTHER_LABEL[lng] : (PROFESSION_LABELS[key]?.[lng] ?? PROFESSION_LABELS[key]?.en ?? key));

const professionKeys = new Set([...PROFESSION_KEYS, OTHER_PROFESSION]);

const vatOf = async () => {
  const { invoicing } = await loadInvoiceSettings();
  return { defaultRate: invoicing.defaultVatRate, smallBusiness: invoicing.smallBusiness };
};

/** What the configurator page needs: services with their catalogue options, professions, VAT. */
export const configuratorView = async (rawLng: unknown) => {
  const lng = lngOf(rawLng);
  const [settings, vat] = await Promise.all([getQuoteSettings(), vatOf()]);
  const options = configuratorCatalogue(settings.catalogue);
  return {
    services: CONFIGURATOR_SERVICES.map((service) => ({
      service,
      options: options[service].map((o) => ({ catalogueId: o.catalogueId, name: o.name, unit: o.unit, unitPriceCents: o.unitPriceCents, professions: o.professions, volumeTiers: o.volumeTiers })),
      priced: options[service].some((o) => o.unitPriceCents !== null),
    })),
    professions: [...PROFESSION_KEYS.map((key) => ({ key, label: professionName(key, lng) })).sort((a, b) => a.label.localeCompare(b.label, lng)), { key: OTHER_PROFESSION, label: professionName(OTHER_PROFESSION, lng) }],
    vat: { rate: vat.smallBusiness ? 0 : vat.defaultRate, smallBusiness: vat.smallBusiness },
    currency: 'EUR',
  };
};

export const parseConfig = (raw: unknown): ConfigInput => {
  const r = configInput.safeParse(raw);
  if (!r.success) throw badRequest('INVALID_CONFIGURATION');
  if (r.data.positions.some((p) => !professionKeys.has(p.profession))) throw badRequest('INVALID_PROFESSION');
  return { ...r.data, services: [...new Set(r.data.services)] };
};

/** Live price of a configuration (lines in German as on the offer). */
export const priceOf = async (input: ConfigInput) => {
  const [settings, vat] = await Promise.all([getQuoteSettings(), vatOf()]);
  return priceConfiguration(input, configuratorCatalogue(settings.catalogue), vat, (k) => professionName(k, 'de'));
};

export const publicRequestInput = z.object({
  config: z.unknown(),
  companyName: z.string().trim().min(2).max(160),
  contactName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(200),
  phone: z.string().trim().max(40).optional(),
  message: z.string().trim().max(3000).optional(),
  locale: z.enum(['az', 'de', 'en', 'ru', 'tr', 'uk']).catch('de'),
  // honeypot: real users never fill this hidden field
  website: z.string().max(200).optional(),
  visitorId: visitorIdSchema.optional().catch(undefined),
  utm: utmSchema.optional().catch(undefined),
});

export const companyRequestInput = z.object({
  config: z.unknown(),
  message: z.string().trim().max(3000).optional(),
});

const SERVICE_DE: Record<(typeof CONFIGURATOR_SERVICES)[number], string> = {
  RECRUITMENT: 'Personalvermittlung',
  RECOGNITION: 'Anerkennungsbegleitung',
  VISA_DOCUMENTS: 'Visa-Unterlagen (Botschaftsunterlagen)',
  RELOCATION: 'Relocation / Wohnung',
  LANGUAGE_COURSE: 'Sprachkurs',
  ONBOARDING: 'Onboarding / Betreuung',
};

/** Summary for the lead message and the staff notification (German: the team works with the German offer). */
export const summaryText = (input: ConfigInput, priced: PricedConfiguration, extra?: string | null) =>
  [
    `Fachkräfte gesamt: ${priced.workers}`,
    ...input.positions.map((p) => `• ${professionName(p.profession, 'de')}: ${p.count}`),
    `Leistungen: ${input.services.map((s) => SERVICE_DE[s]).join(', ')}`,
    input.services.includes('ONBOARDING') ? `Betreuung: ${priced.months} Monat(e)` : null,
    `Richtwert netto: ${formatEur(priced.totals.netCents)}${priced.totals.discountCents ? ` (inkl. Mengenrabatt ${formatEur(priced.totals.discountCents)})` : ''}${priced.onRequest ? ' + Positionen auf Anfrage' : ''}`,
    extra ? `\nNachricht:\n${extra}` : null,
  ]
    .filter((l): l is string => l !== null)
    .join('\n');

const estimateJson = (input: ConfigInput, priced: PricedConfiguration, quoteId: string | null) =>
  ({
    kind: 'configurator',
    config: input,
    workers: priced.workers,
    months: priced.months,
    lines: priced.lines.map((l) => ({ service: l.service, profession: l.profession, catalogueId: l.catalogueId, quantity: l.quantity, unit: l.unit, unitPriceCents: l.unitPriceCents, discountBp: l.discountBp, onRequest: l.onRequest })),
    totals: priced.totals,
    onRequest: priced.onRequest,
    quoteId,
  }) as unknown as Prisma.InputJsonValue;

/** Public request: a lead with the configuration (no quote: there is no company account yet). */
export const submitPublicRequest = async (req: Request, body: z.infer<typeof publicRequestInput>) => {
  const input = parseConfig(body.config);
  const priced = await priceOf(input);
  const inquiry = await prisma.inquiry.create({
    data: {
      kind: 'company',
      companyName: body.companyName,
      contactName: body.contactName,
      email: body.email,
      phone: body.phone || null,
      sector: 'Paketkonfigurator',
      workersNeeded: priced.workers,
      message: summaryText(input, priced, body.message),
      locale: body.locale,
      source: 'configurator',
      estimate: estimateJson(input, priced, null),
    },
  });
  void onInquiryCreated(inquiry.id);
  await notifyStaff(`Paketkonfigurator: Angebotsanfrage von ${body.companyName}`, `${body.contactName} · ${body.email}${body.phone ? ` · ${body.phone}` : ''}\n\n${summaryText(input, priced, body.message)}`, {
    link: `/admin/inquiries?open=${inquiry.id}`, // the list opens the drawer from ?open= (useDrawerParam)
  });
  await attachLeadContext(inquiry.id, { visitorId: body.visitorId, utm: body.utm });
  await audit(req, 'CONFIGURATOR_REQUEST', inquiry.id, { workers: priced.workers, services: input.services, via: 'public' });
  return { inquiryId: inquiry.id, quoteId: null, priced };
};

/** Lead source of a portal request: `configurator:portal:<companyId>` (the admin source filter "configurator" matches it). */
export const portalSource = (companyId: string) => `configurator:portal:${companyId}`;

const atNoon = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12));
const deDate = (d: Date) => new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' }).format(d);

/**
 * Portal request: lead + DRAFT quote of the company with the catalogue lines (lines without a configured price
 * stay in the draft at 0 € marked "Preis auf Anfrage", so staff price them before sending).
 */
export const submitCompanyRequest = async (req: Request, companyId: string, body: z.infer<typeof companyRequestInput>) => {
  const input = parseConfig(body.config);
  const [priced, settings, user, company] = await Promise.all([
    priceOf(input),
    getQuoteSettings(),
    prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { id: true, firstName: true, lastName: true, email: true, phone: true, locale: true } }),
    prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { id: true, name: true } }),
  ]);
  const contactName = `${user.firstName} ${user.lastName}`.trim();
  const validUntil = new Date(atNoon(new Date()).getTime() + settings.validDays * DAY);
  const fill = (text: string | undefined) =>
    text
      ? text
          .replace(/\{firma\}/g, company.name)
          .replace(/\{ansprechpartner\}/g, contactName || 'Damen und Herren')
          .replace(/\{anzahl\}/g, String(priced.workers))
          .replace(/\{gueltigBis\}/g, deDate(validUntil))
      : null;
  const items = priced.lines.map((l) => ({
    description: l.onRequest ? `${l.description || SERVICE_DE[l.service]} (Preis auf Anfrage)` : l.description,
    quantity: l.quantity,
    unit: l.unit,
    unitPriceCents: l.unitPriceCents ?? 0,
    vatRate: l.vatRate,
    catalogueId: l.catalogueId,
    convertedQty: 0,
  }));
  const discountCents = priced.totals.discountCents;
  const draft = {
    items: items as unknown as Prisma.InputJsonValue,
    vatRate: priced.vatRate,
    discountType: discountCents ? ('AMOUNT' as const) : ('NONE' as const),
    discountValue: discountCents,
  };
  // On-request lines are 0 €, so the draft's totals are the configuration's totals.
  const t = priced.totals;
  const quote = await prisma.quote.create({
    data: {
      companyId,
      contactName: contactName || null,
      contactEmail: user.email,
      locale: user.locale === 'en' ? 'en' : 'de',
      title: `Angebot: Gewinnung von ${priced.workers} ${priced.workers === 1 ? 'Fachkraft' : 'Fachkräften'}`,
      introText: fill(settings.introTemplates[0]?.text),
      closingText: fill(settings.closingTemplates[0]?.text),
      ...draft,
      subtotalCents: t.subtotalCents,
      discountCents: t.discountCents,
      netCents: t.netCents,
      vatCents: t.vatCents,
      grossCents: t.grossCents,
      validUntil,
      paymentTerms: settings.paymentTerms || null,
      deliveryTerms: settings.deliveryTerms || null,
      status: 'DRAFT',
    },
  });
  const inquiry = await prisma.inquiry.create({
    data: {
      kind: 'company',
      companyName: company.name,
      contactName: contactName || company.name,
      email: user.email,
      phone: user.phone || null,
      sector: 'Paketkonfigurator',
      workersNeeded: priced.workers,
      message: summaryText(input, priced, body.message),
      locale: user.locale ?? 'de',
      source: portalSource(companyId),
      estimate: estimateJson(input, priced, quote.id),
    },
  });
  await logQuoteEvent(quote.id, 'CREATED', { actorId: user.id, actorName: contactName, meta: { via: 'configurator', inquiryId: inquiry.id }, ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null });
  void onInquiryCreated(inquiry.id);
  await notifyStaff(
    `Paketkonfigurator: Angebotsentwurf für ${company.name} prüfen`,
    `${contactName} · ${user.email}\n\n${summaryText(input, priced, body.message)}\n\nDer Entwurf wartet unter Angebote auf Prüfung und Versand.`,
    { link: adminLink(quote.id) },
  );
  await audit(req, 'CONFIGURATOR_REQUEST', quote.id, { companyId, inquiryId: inquiry.id, workers: priced.workers, services: input.services, via: 'portal' });
  return { inquiryId: inquiry.id, quoteId: quote.id, priced };
};

/** Configurator requests of the company (portal list): status of the draft / the sent offer. */
export const companyRequests = async (companyId: string) => {
  const leads = await prisma.inquiry.findMany({ where: { source: portalSource(companyId) }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, createdAt: true, workersNeeded: true, estimate: true } });
  const quoteIds = leads.map((l) => (l.estimate as { quoteId?: string } | null)?.quoteId).filter((x): x is string => typeof x === 'string');
  const quotes = quoteIds.length ? await prisma.quote.findMany({ where: { id: { in: quoteIds }, companyId }, select: { id: true, status: true, number: true } }) : [];
  return leads.map((l) => {
    const est = (l.estimate ?? {}) as { quoteId?: string; totals?: { netCents?: number }; onRequest?: boolean; config?: { services?: string[] } };
    const q = quotes.find((x) => x.id === est.quoteId);
    return {
      id: l.id,
      createdAt: l.createdAt,
      workers: l.workersNeeded,
      services: est.config?.services ?? [],
      netCents: est.totals?.netCents ?? null,
      onRequest: !!est.onRequest,
      // A draft is "in review"; once sent, the offer is visible under Angebote (link by id).
      state: !q ? ('CLOSED' as const) : q.status === 'DRAFT' ? ('IN_REVIEW' as const) : ('OFFER' as const),
      quoteId: q && q.status !== 'DRAFT' ? q.id : null,
      quoteNumber: q && q.status !== 'DRAFT' ? q.number : null,
    };
  });
};
