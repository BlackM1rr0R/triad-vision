import crypto from 'node:crypto';
import type { Company, Prisma, Quote, QuoteStatus } from '@prisma/client';
import { prisma } from '../../db.js';
import { config } from '../../config.js';
import { badRequest, conflict, notFound } from '../http.js';
import { renderEmail, sendMail } from '../mailer.js';
import { notifyStaff, notifyUser } from '../notifications.js';
import { open, seal } from '../secretBox.js';
import { formatEur, formatInvoiceDate } from '../invoiceTexts.js';
import { createDraftInvoice, loadInvoiceSettings } from '../../routes/admin/invoices.js';
import { computeQuoteTotals, itemTotalCents, percentLabel, quoteItems, unitLabel, type Discount, type QuoteItem } from './math.js';
import { buildQuotePdf, defaultSalutation, quoteFileName } from './pdf.js';
import { asQuoteLocale, quoteTexts, staffQuoteTexts } from './texts.js';

/**
 * Quote lifecycle shared by the admin API, the employer portal, the public link (/angebot/:token)
 * and the expiry job: numbering, link tokens, the audit trail (QuoteEvent), sending, viewing,
 * accepting / declining, expiry and the conversion into a DRAFT invoice.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
export const OPEN_STATUSES: QuoteStatus[] = ['SENT', 'VIEWED'];
export const COMPANY_LINK = '/company/quotes';
export const adminLink = (id: string) => `/admin/quotes?id=${id}`;

export type QuoteWithCompany = Quote & { company: Company };

// ─── Tokens ────────────────────────────────────────────────────────────

export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
export const quoteUrl = (token: string) => `${config.clientUrl}/angebot/${token}`;
const newToken = () => crypto.randomBytes(32).toString('base64url');

/** The link token of a sent quote (decrypted), or null. */
export const tokenOf = (q: Pick<Quote, 'tokenSealed'>) => open(q.tokenSealed);

// ─── Small helpers ─────────────────────────────────────────────────────

export const discountOf = (q: Pick<Quote, 'discountType' | 'discountValue'>): Discount => ({ type: q.discountType, value: q.discountValue });
export const totalsOf = (q: Pick<Quote, 'items' | 'vatRate' | 'discountType' | 'discountValue'>) => computeQuoteTotals(quoteItems(q.items), q.vatRate, discountOf(q));

/** Calendar days are stored at 12:00 UTC: a quote is valid through the whole day of validUntil. */
export const isPastValidity = (q: Pick<Quote, 'validUntil'>, now = new Date()) => q.validUntil.getTime() + 12 * HOUR < now.getTime();

export const quoteDate = (q: Pick<Quote, 'sentAt' | 'createdAt'>) => q.sentAt ?? new Date();

export const loadQuote = async (id: string) => {
  const q = await prisma.quote.findUnique({ where: { id }, include: { company: true } });
  if (!q) throw notFound('QUOTE_NOT_FOUND');
  return q;
};

export interface EventMeta {
  actorId?: string | null;
  actorName?: string | null;
  note?: string | null;
  meta?: Prisma.InputJsonValue;
  ip?: string | null;
  userAgent?: string | null;
}

export const logQuoteEvent = (quoteId: string, type: string, m: EventMeta = {}) =>
  prisma.quoteEvent
    .create({
      data: {
        quoteId,
        type,
        actorId: m.actorId ?? null,
        actorName: m.actorName?.slice(0, 160) ?? null,
        note: m.note ?? null,
        meta: m.meta,
        ip: m.ip?.slice(0, 64) ?? null,
        userAgent: m.userAgent?.slice(0, 1000) ?? null,
      },
    })
    .catch((err) => console.error('[quotes] event failed', type, err));

// ─── PDF ───────────────────────────────────────────────────────────────

export const renderQuotePdf = async (q: QuoteWithCompany, settings?: Awaited<ReturnType<typeof loadInvoiceSettings>>) => {
  const s = settings ?? (await loadInvoiceSettings());
  return buildQuotePdf({
    quote: {
      number: q.status === 'DRAFT' ? null : q.number,
      status: q.status,
      date: quoteDate(q),
      validUntil: q.validUntil,
      title: q.title,
      salutation: q.salutation,
      introText: q.introText,
      closingText: q.closingText,
      items: quoteItems(q.items),
      discount: discountOf(q),
      vatRate: q.vatRate,
      totals: totalsOf(q),
      paymentTerms: q.paymentTerms,
      deliveryTerms: q.deliveryTerms,
      contactName: q.contactName,
      acceptedAt: q.acceptedAt,
      acceptedByName: q.acceptedByName,
    },
    company: q.company,
    seller: s.seller,
    invoicing: s.invoicing,
  });
};

export const pdfName = (q: Pick<Quote, 'number' | 'status'>) => quoteFileName({ number: q.status === 'DRAFT' ? null : q.number, status: q.status });

// ─── Views ─────────────────────────────────────────────────────────────

/** The document as the employer sees it (public link and portal). No internal fields. */
export const customerView = async (q: QuoteWithCompany) => {
  const { seller, invoicing } = await loadInvoiceSettings();
  const totals = totalsOf(q);
  const items = quoteItems(q.items);
  const expired = q.status === 'EXPIRED' || (OPEN_STATUSES.includes(q.status) && isPastValidity(q));
  return {
    number: q.number,
    status: expired ? ('EXPIRED' as const) : q.status,
    title: q.title,
    salutation: q.salutation?.trim() || defaultSalutation(q.contactName),
    introText: q.introText,
    closingText: q.closingText,
    contactName: q.contactName,
    items: items.map((l, i) => ({
      pos: i + 1,
      description: l.description,
      quantity: l.quantity,
      unit: l.unit,
      unitLabel: unitLabel(l.unit, l.quantity),
      unitPriceCents: l.unitPriceCents,
      totalCents: itemTotalCents(l),
      vatRate: l.vatRate ?? q.vatRate,
    })),
    discount: { type: q.discountType, value: q.discountValue, label: q.discountType === 'PERCENT' ? percentLabel(q.discountValue) : null },
    ...totals,
    currency: q.currency,
    date: quoteDate(q),
    validUntil: q.validUntil,
    paymentTerms: q.paymentTerms,
    deliveryTerms: q.deliveryTerms,
    smallBusiness: invoicing.smallBusiness && totals.vatCents === 0,
    company: { name: q.company.name, legalForm: q.company.legalForm, address: q.company.address, city: q.company.city },
    seller: { name: seller.name, street: seller.street, zipCity: seller.zipCity, email: seller.email, phone: seller.phone, website: seller.website },
    acceptedAt: q.acceptedAt,
    acceptedByName: q.acceptedByName,
    declinedAt: q.declinedAt,
    declinedReason: q.declinedReason,
    canRespond: OPEN_STATUSES.includes(q.status) && !isPastValidity(q),
  };
};

// ─── Recipients / mail ─────────────────────────────────────────────────

const companyUsers = (companyId: string) =>
  prisma.user.findMany({ where: { companyId, role: 'COMPANY', isActive: true }, select: { id: true, email: true, locale: true }, orderBy: { createdAt: 'asc' } });

/** Contact e-mail of the quote, else the company's e-mail, else its first employer account. */
export const recipientOf = async (q: QuoteWithCompany) => q.contactEmail?.trim() || q.company.email?.trim() || (await companyUsers(q.companyId))[0]?.email || '';

const mailCtx = async (q: QuoteWithCompany, locale: 'de' | 'en') => {
  const { seller } = await loadInvoiceSettings();
  return {
    number: q.number ?? '',
    title: q.title,
    company: q.company.name,
    amount: formatEur(q.grossCents),
    validUntil: formatInvoiceDate(q.validUntil, locale),
    salutation: q.salutation?.trim() || defaultSalutation(q.contactName),
    seller: seller.name || 'Triad Vision',
  };
};

const mailQuote = async (q: QuoteWithCompany, kind: 'sent' | 'reminder' | 'accepted', to: string, extra: { name?: string } = {}) => {
  if (!to) return false;
  const locale = asQuoteLocale(q.locale);
  const t = quoteTexts[locale];
  const msg = t[kind]({ ...(await mailCtx(q, locale)), ...extra });
  const token = tokenOf(q);
  const cta = token ? { label: t.cta, url: quoteUrl(token) } : { label: t.portalCta, url: `${config.clientUrl}${COMPANY_LINK}` };
  void sendMail(to, `Triad Vision · ${msg.title}`, renderEmail(msg.title, msg.body, cta), [{ filename: pdfName(q), content: await renderQuotePdf(q), contentType: 'application/pdf' }]);
  return true;
};

// ─── Numbering / sending ───────────────────────────────────────────────

/** Next number in the yearly sequence TV-AN-YYYY-NNNN (numeric maximum, not string order). */
export const nextQuoteNumber = async (tx: Prisma.TransactionClient, year: number) => {
  const prefix = `TV-AN-${year}-`;
  const rows = await tx.quote.findMany({ where: { number: { startsWith: prefix } }, select: { number: true } });
  const max = rows.reduce((m, r) => {
    const n = Number((r.number ?? '').slice(prefix.length));
    return Number.isInteger(n) && n > m ? n : m;
  }, 0);
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
};

const todayNoon = () => new Date(`${new Date().toISOString().slice(0, 10)}T12:00:00Z`);

/**
 * Sends (first time: numbers it, creates the link, SENT) or resends a quote: e-mail with the PDF and the
 * link, plus an in-app note for the company's employer accounts.
 */
export const sendQuote = async (id: string, opts: { to?: string | null; locale?: 'de' | 'en' }, actor: EventMeta) => {
  const current = await loadQuote(id);
  if (!['DRAFT', 'SENT', 'VIEWED'].includes(current.status)) throw conflict('QUOTE_CLOSED');
  if (!quoteItems(current.items).length) throw badRequest('QUOTE_EMPTY');
  if (current.validUntil.getTime() < todayNoon().getTime()) throw badRequest('VALID_UNTIL_PAST');
  const first = current.status === 'DRAFT';
  const locale = opts.locale ?? asQuoteLocale(current.locale);
  if (first) {
    const token = newToken();
    const year = new Date().getUTCFullYear();
    // Two admins sending at once can compute the same number; the unique index rejects one, which retries.
    let sent = false;
    for (let attempt = 0; attempt < 5 && !sent; attempt++) {
      try {
        await prisma.$transaction(async (tx) => {
          const number = await nextQuoteNumber(tx, year);
          const r = await tx.quote.updateMany({
            where: { id, status: 'DRAFT' },
            data: { number, status: 'SENT', sentAt: new Date(), tokenHash: sha256(token), tokenSealed: seal(token), locale, ...(opts.to ? { contactEmail: opts.to } : {}) },
          });
          if (r.count === 0) throw conflict('QUOTE_NOT_DRAFT');
        });
        sent = true;
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code !== 'P2002' && code !== 'P2034') throw err;
      }
    }
    if (!sent) throw conflict('NUMBER_CONFLICT');
  } else {
    // A resend keeps the link; only a token sealed with an old key is replaced.
    const data: Prisma.QuoteUpdateManyMutationInput = { locale, ...(opts.to ? { contactEmail: opts.to } : {}) };
    if (!tokenOf(current)) {
      const token = newToken();
      Object.assign(data, { tokenHash: sha256(token), tokenSealed: seal(token) });
    }
    await prisma.quote.updateMany({ where: { id }, data });
  }
  const q = await loadQuote(id);
  const to = await recipientOf(q);
  const emailed = await mailQuote(q, 'sent', to);
  for (const u of await companyUsers(q.companyId)) {
    await notifyUser(u.id, {
      type: 'QUOTE_SENT',
      title: `Angebot ${q.number}`,
      body: `${q.title} · ${formatEur(q.grossCents)} · gültig bis ${formatInvoiceDate(q.validUntil)}`,
      link: COMPANY_LINK,
      email: false,
    }).catch(() => undefined);
  }
  await logQuoteEvent(id, first ? 'SENT' : 'RESENT', { ...actor, meta: { to: to || null, locale, emailed } });
  return { quote: q, emailed, to };
};

// ─── Employer actions ──────────────────────────────────────────────────

/** SENT/VIEWED quotes past their validity become EXPIRED (the creator is told). Returns true when it expired now. */
export const expireIfDue = async (q: QuoteWithCompany, now = new Date()) => {
  if (!OPEN_STATUSES.includes(q.status) || !isPastValidity(q, now)) return false;
  const r = await prisma.quote.updateMany({ where: { id: q.id, status: { in: OPEN_STATUSES } }, data: { status: 'EXPIRED', expiredAt: now } });
  if (!r.count) return false;
  await logQuoteEvent(q.id, 'EXPIRED');
  const s = staffQuoteTexts.expired({ number: q.number ?? '', company: q.company.name, amount: formatEur(q.grossCents), date: formatInvoiceDate(q.validUntil) });
  if (q.createdById) await notifyUser(q.createdById, { type: 'QUOTE_EXPIRED', title: s.title, body: s.body, link: adminLink(q.id), email: false }).catch(() => undefined);
  return true;
};

/** First open by the employer: SENT → VIEWED (the creator gets an in-app note). */
export const markViewed = async (q: QuoteWithCompany, m: EventMeta) => {
  if (q.status !== 'SENT') return;
  const r = await prisma.quote.updateMany({ where: { id: q.id, status: 'SENT' }, data: { status: 'VIEWED', viewedAt: new Date() } });
  if (!r.count) return;
  await logQuoteEvent(q.id, 'VIEWED', m);
  const s = staffQuoteTexts.viewed({ number: q.number ?? '', company: q.company.name, amount: formatEur(q.grossCents) });
  if (q.createdById) await notifyUser(q.createdById, { type: 'QUOTE_VIEWED', title: s.title, body: s.body, link: adminLink(q.id), email: false, push: false }).catch(() => undefined);
};

const assertOpen = async (q: QuoteWithCompany) => {
  if (await expireIfDue(q)) throw conflict('QUOTE_EXPIRED');
  if (q.status === 'EXPIRED') throw conflict('QUOTE_EXPIRED');
  if (!OPEN_STATUSES.includes(q.status)) throw conflict('QUOTE_NOT_OPEN');
};

export const acceptQuote = async (q: QuoteWithCompany, name: string, m: EventMeta) => {
  await assertOpen(q);
  const now = new Date();
  const r = await prisma.quote.updateMany({
    where: { id: q.id, status: { in: OPEN_STATUSES } },
    data: { status: 'ACCEPTED', acceptedAt: now, acceptedByName: name, acceptedIp: m.ip?.slice(0, 64) ?? null, acceptedUa: m.userAgent?.slice(0, 1000) ?? null, viewedAt: q.viewedAt ?? now },
  });
  if (!r.count) throw conflict('QUOTE_NOT_OPEN');
  await logQuoteEvent(q.id, 'ACCEPTED', { ...m, actorName: m.actorName ?? name });
  const fresh = await loadQuote(q.id);
  const s = staffQuoteTexts.accepted({ number: fresh.number ?? '', company: fresh.company.name, amount: formatEur(fresh.grossCents), name });
  await notifyStaff(s.title, s.body, { link: adminLink(fresh.id), type: 'QUOTE_ACCEPTED' }).catch(() => undefined);
  await mailQuote(fresh, 'accepted', await recipientOf(fresh), { name });
  return fresh;
};

export const declineQuote = async (q: QuoteWithCompany, reason: string, m: EventMeta) => {
  await assertOpen(q);
  const r = await prisma.quote.updateMany({
    where: { id: q.id, status: { in: OPEN_STATUSES } },
    data: { status: 'DECLINED', declinedAt: new Date(), declinedReason: reason },
  });
  if (!r.count) throw conflict('QUOTE_NOT_OPEN');
  await logQuoteEvent(q.id, 'DECLINED', { ...m, note: reason });
  const fresh = await loadQuote(q.id);
  const s = staffQuoteTexts.declined({ number: fresh.number ?? '', company: fresh.company.name, amount: formatEur(fresh.grossCents), reason });
  await notifyStaff(s.title, s.body, { link: adminLink(fresh.id), type: 'QUOTE_DECLINED' }).catch(() => undefined);
  return fresh;
};

/** Reminder before expiry (the job claims it once per validity date). */
export const remindQuote = async (q: QuoteWithCompany) => {
  const to = await recipientOf(q);
  const sent = await mailQuote(q, 'reminder', to);
  await logQuoteEvent(q.id, 'REMINDED', { meta: { to: to || null, emailed: sent } });
  return sent;
};

// ─── Conversion into an invoice ────────────────────────────────────────

export interface ConvertLine {
  index: number;
  quantity: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Creates a DRAFT invoice from an ACCEPTED quote: all remaining quantities, or the selected lines and
 * quantities (e.g. per placed worker). The discount becomes a negative line (pro rata for an amount).
 * When nothing remains the quote is CONVERTED; otherwise it stays ACCEPTED for the next part.
 */
export const convertQuote = async (q: QuoteWithCompany, lines: ConvertLine[] | undefined, actor: EventMeta) => {
  if (q.status === 'CONVERTED') throw conflict('QUOTE_ALREADY_CONVERTED');
  if (q.status !== 'ACCEPTED') throw conflict('QUOTE_NOT_ACCEPTED');
  const items = quoteItems(q.items);
  const remaining = items.map((l) => round2(Math.max(0, l.quantity - l.convertedQty)));
  const pick = new Map<number, number>();
  if (lines?.length) {
    for (const l of lines) {
      if (l.index < 0 || l.index >= items.length) throw badRequest('INVALID_LINE');
      if (l.quantity <= 0) continue;
      if (round2(l.quantity) > remaining[l.index]) throw badRequest('QUANTITY_EXCEEDS_REMAINING');
      pick.set(l.index, round2((pick.get(l.index) ?? 0) + l.quantity));
    }
    for (const [i, qty] of pick) if (qty > remaining[i]) throw badRequest('QUANTITY_EXCEEDS_REMAINING');
  } else {
    remaining.forEach((r, i) => r > 0 && pick.set(i, r));
  }
  if (!pick.size) throw badRequest('NOTHING_TO_CONVERT');

  const chosen = [...pick.entries()].sort((a, b) => a[0] - b[0]);
  const rates = new Set(chosen.map(([i]) => items[i].vatRate ?? q.vatRate));
  if (rates.size > 1) throw conflict('MIXED_VAT_RATES');
  const vatRate = [...rates][0];

  const invoiceItems = chosen.map(([i, qty]) => ({ description: items[i].description, quantity: qty, unitPriceCents: items[i].unitPriceCents }));
  const selSub = invoiceItems.reduce((a, l) => a + itemTotalCents(l), 0);
  const totals = totalsOf(q);
  let discount = 0;
  if (q.discountType === 'PERCENT') discount = Math.round((selSub * q.discountValue) / 10000);
  else if (q.discountType === 'AMOUNT' && totals.subtotalCents > 0) {
    // The part that completes the quote takes the rest, so the parts add up to the quoted discount exactly.
    const completes = items.every((l, i) => round2(l.convertedQty + (pick.get(i) ?? 0)) >= l.quantity);
    if (completes) {
      const earlier = await prisma.quoteEvent.findMany({ where: { quoteId: q.id, type: 'CONVERTED' }, select: { meta: true } });
      const used = earlier.reduce((a, e) => a + Number((e.meta as { discountCents?: number } | null)?.discountCents ?? 0), 0);
      discount = Math.max(0, totals.discountCents - used);
    } else discount = Math.round((totals.discountCents * selSub) / totals.subtotalCents);
  }
  discount = Math.min(discount, selSub);
  if (discount > 0) {
    invoiceItems.push({
      description: q.discountType === 'PERCENT' ? `Rabatt ${percentLabel(q.discountValue)} gemäß Angebot ${q.number}` : `Rabatt gemäß Angebot ${q.number}`,
      quantity: 1,
      unitPriceCents: -discount,
    });
  }

  const note = `Leistungen gemäß Angebot ${q.number} vom ${formatInvoiceDate(quoteDate(q))}${q.acceptedAt ? `, angenommen am ${formatInvoiceDate(q.acceptedAt)}` : ''}.`;
  const invoice = await createDraftInvoice({ companyId: q.companyId, items: invoiceItems, vatRate, note });

  const nextItems: QuoteItem[] = items.map((l, i) => ({ ...l, convertedQty: round2(l.convertedQty + (pick.get(i) ?? 0)) }));
  const done = nextItems.every((l) => l.convertedQty >= l.quantity);
  const r = await prisma.quote.updateMany({
    where: { id: q.id, status: 'ACCEPTED', updatedAt: q.updatedAt },
    data: { items: nextItems as unknown as Prisma.InputJsonValue, invoiceId: invoice.id, ...(done ? { status: 'CONVERTED', convertedAt: new Date() } : {}) },
  });
  if (!r.count) {
    // Someone converted at the same time: undo our draft.
    await prisma.invoice.deleteMany({ where: { id: invoice.id, status: 'DRAFT' } });
    throw conflict('QUOTE_CHANGED');
  }
  await logQuoteEvent(q.id, 'CONVERTED', { ...actor, meta: { invoiceId: invoice.id, partial: !done, lines: chosen.map(([index, quantity]) => ({ index, quantity })), discountCents: discount, grossCents: invoice.grossCents } });
  return { invoice, quote: await loadQuote(q.id), partial: !done };
};

