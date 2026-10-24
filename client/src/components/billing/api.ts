import i18n from '@/i18n';
import { errorCode } from '@/lib/api';
import { errorMessage } from '@/components/admin/labels';
import { TONE_CLASS } from '@/components/ui/status';

/** Client billing (server lib/billing): shared types, money helpers and error text. */

export type InvoiceStatus = 'DRAFT' | 'SENT' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'CANCELLED';
export const INVOICE_STATUSES: InvoiceStatus[] = ['DRAFT', 'SENT', 'PARTIALLY_PAID', 'OVERDUE', 'PAID', 'CANCELLED'];
export const OPEN_STATUSES: InvoiceStatus[] = ['SENT', 'PARTIALLY_PAID', 'OVERDUE'];
export type LineCategory = 'SERVICE_FEE' | 'TRANSLATION' | 'APOSTILLE' | 'EMBASSY_FEE' | 'COURIER' | 'OTHER';
export const LINE_CATEGORIES: LineCategory[] = ['SERVICE_FEE', 'TRANSLATION', 'APOSTILLE', 'EMBASSY_FEE', 'COURIER', 'OTHER'];
export type PaymentMethod = 'CASH' | 'BANK' | 'CARD' | 'OTHER';
export const PAYMENT_METHODS: PaymentMethod[] = ['BANK', 'CASH', 'CARD', 'OTHER'];
export type VatMode = 'STANDARD' | 'SMALL_BUSINESS' | 'EXEMPT';

export interface ClientLine {
  description: string;
  quantity: number;
  unitPriceCents: number;
  category: LineCategory;
  servicePeriod?: { from?: string | null; to?: string | null } | null;
}

export interface ClientInvoice {
  id: string;
  number: string | null;
  clientId: string;
  caseId: string | null;
  issueDate: string;
  dueDate: string;
  currency: string;
  items: ClientLine[];
  netCents: number;
  taxableCents: number;
  passThroughCents: number;
  vatRate: number;
  vatCents: number;
  grossCents: number;
  paidCents: number;
  openCents: number;
  status: InvoiceStatus;
  sentAt: string | null;
  paidAt: string | null;
  note: string | null;
  planId: string | null;
  installmentId: string | null;
  reminderCount: number;
  clientName?: string;
  clientEmail?: string;
  caseNumber?: string | null;
}

export interface ClientPayment {
  id: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  amountCents: number;
  currency: string;
  method: PaymentMethod;
  paidAt: string;
  reference: string | null;
  note?: string | null;
}

export type InstallmentStatus = 'PENDING' | 'INVOICED' | 'PAID' | 'OVERDUE' | 'CANCELLED';
export interface Installment {
  id: string;
  planId: string;
  seq: number;
  label: string | null;
  trigger: string | null;
  dueDate: string | null;
  amountCents: number;
  invoiceId: string | null;
  status: InstallmentStatus;
}
export interface PaymentPlan {
  id: string;
  title: string;
  totalCents: number;
  currency: string;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  caseId: string | null;
  installments: Installment[];
}

export interface BillingTotals {
  invoicedCents: number;
  paidCents: number;
  openCents: number;
  overdueCents: number;
  overdueCount: number;
  draftCount: number;
}

export interface CaseBilling {
  case: { id: string; number: string };
  client: { id: string; name: string; email: string; locale: string };
  invoices: ClientInvoice[];
  payments: ClientPayment[];
  plans: PaymentPlan[];
  totals: BillingTotals;
}

type L10n = { az: string; de: string; en: string; ru: string };
export interface PlanTemplate {
  key: string;
  title: L10n;
  items: { label: L10n; percent: number; trigger: string; monthsAfterStart?: number }[];
}

export interface BillingSettings {
  vatMode: VatMode;
  vatRate: number;
  exemptionNote: string;
  paymentTermsDays: number;
  reminder1Days: number;
  reminder2Days: number;
  footer: string;
}
export interface BillingSettingsResponse {
  settings: BillingSettings;
  seller: { name: string; street: string; zipCity: string; vatId: string; taxNumber: string };
  legalMissing: string[];
  bank: { accountHolder: string; iban: string; bic: string; bank: string };
  templates: PlanTemplate[];
}

/** Case statuses a CASE_STATUS trigger can name, in workflow order. */
export const TRIGGER_STATUSES = ['DOCUMENTS_REVIEW', 'CONTRACT_SIGNED', 'EMBASSY_DOCUMENTS', 'EMBASSY_REVIEW', 'APPOINTMENT_SCHEDULED', 'DECISION_PENDING', 'APPROVED'] as const;
export const TRIGGERS = ['ON_SIGN', 'DATE', ...TRIGGER_STATUSES.map((s) => `CASE_STATUS:${s}`)] as const;

export const triggerLabel = (trigger: string | null | undefined) => {
  if (!trigger) return '—';
  if (trigger === 'DATE' || trigger === 'ON_SIGN') return i18n.t(`bill.trigger.${trigger}`);
  const status = trigger.replace(/^CASE_STATUS:/, '');
  return i18n.t('bill.trigger.CASE_STATUS', { status: i18n.t(`bill.caseStatus.${status}`, { defaultValue: status }) });
};

const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
export const fmtEur = (cents: number) => eur.format(cents / 100);
const eurWhole = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
/** Whole euros for stat tiles. */
export const fmtEurShort = (cents: number) => eurWhole.format(Math.round(cents / 100));

/** "1.234,56" / "1234.56" / "1234,5" → cents (NaN when not a number). */
export const parseEuro = (s: string) => {
  const raw = s.replace(/[\s€]/g, '');
  if (!raw) return NaN;
  const normalised = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  if (!/^-?\d+(\.\d{0,2})?$/.test(normalised)) return NaN;
  return Math.round(Number(normalised) * 100);
};
export const parseQty = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) && n > 0 && Math.round(n * 100) === n * 100 ? n : NaN;
};
export const centsToInput = (c: number) => (c / 100).toFixed(2).replace('.', ',');
export const isoDay = (d: Date) => d.toISOString().slice(0, 10);
export const addDaysIso = (iso: string, n: number) => isoDay(new Date(new Date(`${iso}T12:00:00Z`).getTime() + n * 86400000));

/** Same totals rule as the server: VAT only on taxable lines, embassy fees passed through. */
export const totalsOf = (lines: { quantity: number; unitPriceCents: number; category: LineCategory }[], rate: number) => {
  let taxable = 0;
  let pass = 0;
  for (const l of lines) {
    if (!Number.isFinite(l.quantity) || !Number.isFinite(l.unitPriceCents)) continue;
    const total = Math.round(l.quantity * l.unitPriceCents);
    if (l.category === 'EMBASSY_FEE') pass += total;
    else taxable += total;
  }
  const vat = Math.round((taxable * rate) / 100);
  return { taxable, pass, vat, gross: taxable + pass + vat };
};

export const billingErrText = (err: unknown) => {
  const code = errorCode(err);
  return i18n.exists(`bill.admin.errors.${code}`) ? i18n.t(`bill.admin.errors.${code}`) : errorMessage(err, i18n.t('bill.admin.errors.default'));
};

/** Badge classes (use with the `badge` class). */
export const STATUS_BADGE: Record<InvoiceStatus, string> = {
  DRAFT: TONE_CLASS.neutral,
  SENT: TONE_CLASS.info,
  PARTIALLY_PAID: TONE_CLASS.warning,
  PAID: TONE_CLASS.success,
  OVERDUE: TONE_CLASS.danger,
  CANCELLED: `${TONE_CLASS.neutral} line-through`,
};

export const INSTALLMENT_BADGE: Record<InstallmentStatus, string> = {
  PENDING: TONE_CLASS.neutral,
  INVOICED: TONE_CLASS.info,
  PAID: TONE_CLASS.success,
  OVERDUE: TONE_CLASS.danger,
  CANCELLED: `${TONE_CLASS.neutral} line-through`,
};

export const BILLING_KEY = ['client-billing'] as const;
