import JSZip from 'jszip';
import { prisma } from '../../db.js';
import { badRequest } from '../http.js';
import { clientLines, isPassThrough, lineTotal } from '../billing/math.js';
import { getClientBillingSettings } from '../billing/settings.js';
import { entityOfInvoice, getBillingEntities } from '../billing/entities.js';
import { convertToEur, getExchangeRates, type ExchangeRates } from '../billing/currency.js';
import { readInvoicing } from '../invoicePdf.js';
import { encodeCp1252 } from './cp1252.js';
import {
  DATEV_DEFAULTS,
  DATEV_KEY,
  accountOf,
  buKeyFor,
  buildBuchungsstapel,
  datevSettingsSchema,
  fiscalYearStart,
  revenueAccount,
  splitByAccount,
  type DatevRow,
  type DatevSettings,
  type LineCat,
} from './datevFormat.js';

/**
 * DATEV export of a period (Admin › Accounting): issued company invoices (TV-RE) and client invoices of the
 * German entity (TV-KR) by issue date, cancellations by cancellation day, and — optionally — client payments
 * (by payment date) and paid company invoices (by paid date). Client invoices of the Baku entity (TV-AZ) are not
 * German bookkeeping and are left out (counted in the warnings). The result is the CP1252 EXTF file, or a ZIP with
 * the file and the invoice PDFs (Belege/…).
 */

export const DEBTORS_KEY = 'datevDebtors';

export const getDatevSettings = async (): Promise<DatevSettings> => {
  const row = await prisma.setting.findUnique({ where: { key: DATEV_KEY } });
  const parsed = datevSettingsSchema.safeParse(row?.value ?? {});
  return parsed.success ? parsed.data : DATEV_DEFAULTS;
};

export const saveDatevSettings = async (input: unknown) => {
  const parsed = datevSettingsSchema.safeParse(input);
  if (!parsed.success) throw badRequest('VALIDATION_ERROR', parsed.error.issues[0]?.message);
  const value = parsed.data;
  await prisma.setting.upsert({ where: { key: DATEV_KEY }, create: { key: DATEV_KEY, value }, update: { value } });
  return value;
};

/** Stable Debitor numbers: "C:<clientId>" / "K:<companyId>" → number, assigned once from debtorStart. */
const debtorBook = async (s: DatevSettings) => {
  const row = await prisma.setting.findUnique({ where: { key: DEBTORS_KEY } });
  const map = { ...((row?.value && typeof row.value === 'object' && !Array.isArray(row.value) ? row.value : {}) as Record<string, number>) };
  let dirty = false;
  const of = (key: string) => {
    if (s.debtorMode === 'COLLECTIVE') return String(key.startsWith('K:') ? s.collectiveCompanyDebtor : s.collectiveClientDebtor);
    if (!map[key]) {
      const max = Object.values(map).reduce((m, n) => (n > m ? n : m), s.debtorStart - 1);
      map[key] = Math.max(max + 1, s.debtorStart);
      dirty = true;
    }
    return String(map[key]);
  };
  const save = async () => {
    if (dirty) await prisma.setting.upsert({ where: { key: DEBTORS_KEY }, create: { key: DEBTORS_KEY, value: map }, update: { value: map } });
  };
  return { of, save, map };
};

const dayStart = (iso: string) => new Date(`${iso}T00:00:00Z`);
const dayEnd = (iso: string) => new Date(`${iso}T23:59:59.999Z`);

export interface DatevExportResult {
  rows: DatevRow[];
  text: string;
  file: Buffer;
  fileName: string;
  warnings: { code: string; ref: string }[];
  counts: { companyInvoices: number; clientInvoices: number; payments: number; cancellations: number; skipped: number };
  invoiceIds: { company: string[]; client: string[] };
}

const fx = (cents: number, currency: string, rates: ExchangeRates) => {
  if (currency === 'EUR') return { ok: true as const, extra: {} };
  const base = convertToEur(cents, currency, rates);
  const rate = rates.rates[currency as 'AZN' | 'TRY'];
  if (base === null || !rate) return { ok: false as const, extra: {} };
  return { ok: true as const, extra: { currency, rate, baseCents: base } };
};

export const buildDatevExport = async (q: { from: string; to: string; includePayments?: boolean }): Promise<DatevExportResult> => {
  const s = await getDatevSettings();
  if (!s.consultantNumber || s.consultantNumber < 1001 || !s.clientNumber) throw badRequest('DATEV_NOT_CONFIGURED');
  if (q.to < q.from) throw badRequest('INVALID_PERIOD');
  const from = dayStart(q.from);
  const to = dayEnd(q.to);
  if (fiscalYearStart(from, s.fiscalYearStartMonth).getTime() !== fiscalYearStart(to, s.fiscalYearStartMonth).getTime()) throw badRequest('PERIOD_CROSSES_FISCAL_YEAR');
  const includePayments = q.includePayments ?? s.includePayments;
  const [rates, entities, billing, invoicingRow] = await Promise.all([getExchangeRates(), getBillingEntities(), getClientBillingSettings(), prisma.setting.findUnique({ where: { key: 'invoicing' } })]);
  const invoicing = readInvoicing(invoicingRow?.value);
  const debtors = await debtorBook(s);
  const warnings: DatevExportResult['warnings'] = [];
  const rows: DatevRow[] = [];
  const counts = { companyInvoices: 0, clientInvoices: 0, payments: 0, cancellations: 0, skipped: 0 };
  const ids = { company: [] as string[], client: [] as string[] };
  const period = { gte: from, lte: to };

  // ── Company invoices (always the German entity) ──
  const companyInvoices = await prisma.invoice.findMany({
    where: { status: { not: 'DRAFT' }, OR: [{ issueDate: period }, { status: 'CANCELLED', updatedAt: period }, ...(includePayments ? [{ status: 'PAID' as const, paidAt: period }] : [])] },
    include: { company: { select: { id: true, name: true } } },
    orderBy: [{ issueDate: 'asc' }, { number: 'asc' }],
  });
  const companyAccount = s.accounts.companyInvoices || '';
  for (const inv of companyInvoices) {
    const debtor = debtors.of(`K:${inv.companyId}`);
    const vatRate = inv.vatRate;
    const account = companyAccount || (vatRate >= 19 ? accountOf(s, 'revenue19') : vatRate > 0 ? accountOf(s, 'revenue7') : invoicing.smallBusiness ? accountOf(s, 'revenueSmallBusiness') : accountOf(s, 'revenueTaxFree'));
    const conv = fx(inv.grossCents, inv.currency, rates);
    if (!conv.ok) {
      warnings.push({ code: 'NO_EXCHANGE_RATE', ref: inv.number });
      counts.skipped++;
      continue;
    }
    const base = { account: debtor, contraAccount: account, buKey: buKeyFor(s, vatRate, account), beleg1: inv.number, partnerName: inv.company.name };
    if (inv.issueDate >= from && inv.issueDate <= to) {
      rows.push({ ...base, amountCents: inv.grossCents, side: 'S', date: inv.issueDate, text: `Rechnung ${inv.number} ${inv.company.name}`, ...conv.extra });
      counts.companyInvoices++;
      ids.company.push(inv.id);
    }
    if (inv.status === 'CANCELLED' && inv.updatedAt >= from && inv.updatedAt <= to) {
      rows.push({ ...base, amountCents: inv.grossCents, side: 'H', date: inv.updatedAt, text: `Storno ${inv.number} ${inv.company.name}`, ...conv.extra });
      counts.cancellations++;
    }
    if (includePayments && inv.status === 'PAID' && inv.paidAt && inv.paidAt >= from && inv.paidAt <= to) {
      rows.push({ amountCents: inv.grossCents, side: 'S', account: accountOf(s, 'bank'), contraAccount: debtor, date: inv.paidAt, beleg1: inv.number, text: `Zahlung ${inv.number} ${inv.company.name}`, partnerName: inv.company.name, ...conv.extra });
      counts.payments++;
    }
  }

  // ── Client invoices (German entity only) ──
  const clientInvoices = await prisma.clientInvoice.findMany({
    where: { status: { not: 'DRAFT' }, OR: [{ issueDate: period }, { status: 'CANCELLED', updatedAt: period }] },
    orderBy: [{ issueDate: 'asc' }, { number: 'asc' }],
  });
  const clientIds = [...new Set(clientInvoices.map((i) => i.clientId))];
  const payments = includePayments ? await prisma.clientPayment.findMany({ where: { paidAt: period }, orderBy: { paidAt: 'asc' } }) : [];
  const paymentInvoiceIds = [...new Set(payments.map((p) => p.invoiceId).filter((x): x is string => !!x))];
  const extraInvoices = paymentInvoiceIds.length ? await prisma.clientInvoice.findMany({ where: { id: { in: paymentInvoiceIds.filter((id) => !clientInvoices.some((i) => i.id === id)) } } }) : [];
  const allInvoices = new Map([...clientInvoices, ...extraInvoices].map((i) => [i.id, i]));
  const users = await prisma.user.findMany({ where: { id: { in: [...new Set([...clientIds, ...payments.map((p) => p.clientId)])] } }, select: { id: true, firstName: true, lastName: true } });
  const nameOf = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
  const smallBusiness = billing.vatMode === 'SMALL_BUSINESS';

  for (const inv of clientInvoices) {
    if (entityOfInvoice(inv, entities) !== 'DE') {
      warnings.push({ code: 'OTHER_ENTITY', ref: inv.number });
      counts.skipped++;
      continue;
    }
    const debtor = debtors.of(`C:${inv.clientId}`);
    const name = nameOf.get(inv.clientId) ?? '';
    const lines = clientLines(inv.items).map((l) => ({ category: l.category as LineCat, netCents: lineTotal(l) }));
    const groups = splitByAccount(lines, inv.vatCents, (l) => revenueAccount(s, l, { rate: inv.vatRate, smallBusiness }), (l) => !isPassThrough(l.category));
    const conv = fx(inv.grossCents, inv.currency, rates);
    if (!conv.ok) {
      warnings.push({ code: 'NO_EXCHANGE_RATE', ref: inv.number });
      counts.skipped++;
      continue;
    }
    const service = clientLines(inv.items).find((l) => l.servicePeriod)?.servicePeriod;
    const serviceDate = service?.to ? new Date(`${service.to}T12:00:00Z`) : null;
    const rowsFor = (side: 'S' | 'H', date: Date, prefix: string) =>
      groups
        .filter((g) => g.grossCents !== 0)
        .map((g) => {
          const c = fx(g.grossCents, inv.currency, rates);
          return {
            amountCents: g.grossCents,
            side,
            account: debtor,
            contraAccount: g.account,
            buKey: buKeyFor(s, g.vatCents ? inv.vatRate : 0, g.account),
            date,
            beleg1: inv.number,
            text: `${prefix} ${inv.number} ${name}`,
            partnerName: name,
            serviceDate,
            ...(c.ok ? c.extra : {}),
          } satisfies DatevRow;
        });
    if (inv.issueDate >= from && inv.issueDate <= to) {
      rows.push(...rowsFor('S', inv.issueDate, 'Rechnung'));
      counts.clientInvoices++;
      ids.client.push(inv.id);
    }
    if (inv.status === 'CANCELLED' && inv.updatedAt >= from && inv.updatedAt <= to) {
      rows.push(...rowsFor('H', inv.updatedAt, 'Storno'));
      counts.cancellations++;
    }
  }

  for (const p of payments) {
    const inv = p.invoiceId ? allInvoices.get(p.invoiceId) : undefined;
    if (inv && entityOfInvoice(inv, entities) !== 'DE') continue; // counted with the invoice
    const conv = fx(p.amountCents, p.currency, rates);
    if (!conv.ok) {
      warnings.push({ code: 'NO_EXCHANGE_RATE', ref: inv?.number ?? p.id });
      counts.skipped++;
      continue;
    }
    const name = nameOf.get(p.clientId) ?? '';
    rows.push({
      amountCents: p.amountCents,
      side: 'S',
      account: p.method === 'CASH' ? accountOf(s, 'cash') : accountOf(s, 'bank'),
      contraAccount: debtors.of(`C:${p.clientId}`),
      date: p.paidAt,
      beleg1: inv?.number ?? `Z-${p.id.slice(-8).toUpperCase()}`,
      beleg2: p.reference ?? undefined,
      text: `Zahlung ${inv?.number ?? ''} ${name}`.replace(/\s+/g, ' '),
      partnerName: name,
      ...conv.extra,
    });
    counts.payments++;
  }

  rows.sort((a, b) => a.date.getTime() - b.date.getTime());
  await debtors.save();
  const label = `Triad Vision ${q.from.slice(0, 7)}`;
  const text = buildBuchungsstapel(s, rows, { from, to, label });
  const fileName = `EXTF_Buchungsstapel_${q.from.replace(/-/g, '')}-${q.to.replace(/-/g, '')}.csv`;
  return { rows, text, file: encodeCp1252(text), fileName, warnings, counts, invoiceIds: ids };
};

/** ZIP: the EXTF file + the PDFs of the exported invoices under Belege/ (renderers passed in by the route). */
export const datevZip = async (
  result: DatevExportResult,
  pdfs: { company: (id: string) => Promise<{ name: string; pdf: Buffer }>; client: (id: string) => Promise<{ name: string; pdf: Buffer }> },
) => {
  const zip = new JSZip();
  zip.file(result.fileName, result.file);
  for (const id of result.invoiceIds.company) {
    const f = await pdfs.company(id);
    zip.file(`Belege/${f.name}`, f.pdf);
  }
  for (const id of result.invoiceIds.client) {
    const f = await pdfs.client(id);
    zip.file(`Belege/${f.name}`, f.pdf);
  }
  if (result.warnings.length) zip.file('Hinweise.txt', result.warnings.map((w) => `${w.code}: ${w.ref}`).join('\r\n'));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
};
