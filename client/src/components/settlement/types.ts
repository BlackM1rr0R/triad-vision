export type Currency = 'AZN' | 'EUR';
export type Stage = 'NEW' | 'IN_PROGRESS' | 'VISA' | 'REFUSED' | 'CANCELLED';
export const STAGES: Stage[] = ['NEW', 'IN_PROGRESS', 'VISA', 'REFUSED', 'CANCELLED'];
export type Rule = 'THIRD_OF_NET' | 'PERCENT_OF_NET' | 'FIXED' | 'REMAINDER';
export const RULES: Rule[] = ['THIRD_OF_NET', 'PERCENT_OF_NET', 'FIXED', 'REMAINDER'];
export const PARTNER_KEY = '_partner';

export interface Share {
  cents: number;
  currency: Currency;
  status: 'PENDING' | 'PAID' | 'NONE';
  text?: string;
  manual?: boolean;
  paidAt?: string | null;
}

export interface Row {
  id: string;
  project: string;
  caseId: string | null;
  case: { id: string; number: string; status: string; clientName: string } | null;
  partnerId: string | null;
  clientName: string;
  licence: string | null;
  employer: string | null;
  tlsDate: string | null;
  visaDate: string | null;
  stage: Stage;
  stageAuto: boolean;
  amountCents: number | null;
  currency: Currency;
  payAfterVisa: boolean;
  paidCents: number;
  partnerShareCents: number | null;
  partnerShareCurrency: Currency;
  partnerPaid: boolean;
  expensesCents: number | null;
  note: string | null;
  sortOrder: number;
  shares: Record<string, Share | null>;
  netCents: number | null;
  roundingCents: number;
  month: string;
  updatedAt: string;
}

export interface Beneficiary {
  id: string;
  name: string;
  rule: Rule;
  value: number;
  currency: Currency | null;
  active: boolean;
  sortOrder: number;
  userId: string | null;
}

export interface Partner {
  id: string;
  name: string;
  active: boolean;
}

export interface ListResponse {
  rows: Row[];
  beneficiaries: Beneficiary[];
  projects: { name: string; count: number }[];
  partners: Partner[];
  settings: { eurAzn: number };
  canManage: boolean;
}

export type Bag = Partial<Record<Currency, number>>;

export interface Summary {
  month: string;
  rows: number;
  beneficiaries: { id: string; name: string; rule: Rule; month: { pending: Bag; paid: Bag }; overall: { pending: Bag; paid: Bag } }[];
  partners: { id: string; name: string; clients: number; pending: Bag; paid: Bag; month: Bag }[];
  stages: Record<Stage, number>;
  stagesMonth: Record<Stage, number>;
  revenue: { agreed: Bag; received: Bag; monthAgreed: Bag; monthReceived: Bag; expenses: Bag };
}

export type CellValue = string | number | boolean | null;
export interface Change {
  id: string;
  field: string;
  value: CellValue;
}

export type Tab = { kind: 'all' } | { kind: 'unpaid' } | { kind: 'project'; name: string } | { kind: 'partner'; id: string };
