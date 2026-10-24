import i18n, { registerCopy } from '@/i18n';
import { errorCode } from '@/lib/api';
import { errorMessage } from '@/components/admin/labels';
import { pagesAccounting } from '@/i18n/pagesAccounting';

registerCopy(pagesAccounting);

/** Accounting (server routes/admin/accounting.ts) and countersignature (routes/admin/countersign.ts): shapes + error text. */

export const acctErrText = (err: unknown) => {
  const code = errorCode(err);
  if (code && i18n.exists(`acct.errors.${code}`)) return i18n.t(`acct.errors.${code}`);
  // zod messages from the server (e.g. INVALID_LEITWEG_ID) arrive as the error message.
  const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
  if (msg && i18n.exists(`acct.errors.${msg}`)) return i18n.t(`acct.errors.${msg}`);
  return errorMessage(err, i18n.t('acct.errors.default'));
};

export type Chart = 'SKR03' | 'SKR04';
export type AccountKey = 'revenue19' | 'revenue7' | 'revenueTaxFree' | 'revenueSmallBusiness' | 'passThrough' | 'bank' | 'cash' | 'companyInvoices';
export type CategoryKey = 'SERVICE_FEE' | 'TRANSLATION' | 'APOSTILLE' | 'COURIER' | 'OTHER';

export interface DatevSettings {
  consultantNumber: number;
  clientNumber: number;
  chart: Chart;
  fiscalYearStartMonth: number;
  accountLength: number;
  accounts: Record<AccountKey, string>;
  categoryAccounts: Record<CategoryKey, string>;
  useBuKeys: boolean;
  buKeys: { vat19: string; vat7: string };
  debtorMode: 'PER_PARTY' | 'COLLECTIVE';
  debtorStart: number;
  collectiveClientDebtor: number;
  collectiveCompanyDebtor: number;
  includePayments: boolean;
  dictationCode: string;
}
export interface DatevSettingsResponse {
  settings: DatevSettings;
  chartDefaults: Record<Chart, Record<Exclude<AccountKey, 'companyInvoices'>, string>>;
}

export interface DatevPreview {
  fileName: string;
  counts: { companyInvoices: number; clientInvoices: number; cancellations: number; payments: number; skipped: number };
  warnings: { code: 'OTHER_ENTITY' | 'NO_EXCHANGE_RATE'; ref: string }[];
  total: number;
  rows: { amount: string; side: 'S' | 'H'; currency: string; account: string; contraAccount: string; buKey: string; date: string; beleg1: string; text: string }[];
}

export type Entity = 'DE' | 'AZ';
export interface AzEntity {
  enabled: boolean;
  name: string;
  street: string;
  zipCity: string;
  country: string;
  taxNumber: string;
  vatId: string;
  register: string;
  managingDirector: string;
  email: string;
  phone: string;
  website: string;
  vatMode: 'STANDARD' | 'NONE';
  vatRate: number;
  exemptionNote: string;
  bank: { accountHolder: string; iban: string; bic: string; bank: string };
}
export interface CurrenciesResponse {
  currencies: ('EUR' | 'AZN' | 'TRY')[];
  entities: { az: AzEntity; byCurrency: Record<'EUR' | 'AZN' | 'TRY', Entity>; defaultCurrency: 'EUR' | 'AZN' | 'TRY' };
  rates: { rates: { AZN: number | null; TRY: number | null }; date: string | null; note: string };
}

export interface CountersignItem {
  requestId: string;
  signerId: string;
  title: string;
  kind: 'PACKAGE' | 'CASE_CONTRACT' | 'OTHER';
  packageOrderId: string | null;
  packageOrderStatus: string | null;
  case: { id: string; number: string } | null;
  clientSigners: { name: string; role: string; signedAt: string | null }[];
  assignedTo: { userId: string | null; name: string };
  mine: boolean;
  canSign: boolean;
  since: string;
  waitingDays: number;
  overdue: boolean;
  expiresAt: string | null;
}
export interface CountersignSettings {
  enabled: boolean;
  signatoryIds: string[];
  defaultSignerId: string | null;
  packageOrders: boolean;
  caseContracts: boolean;
  reminderDays: number;
}
export interface SignatoryCandidate {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}
