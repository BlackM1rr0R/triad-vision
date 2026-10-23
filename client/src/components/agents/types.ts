import { STATUS_TONES, toneClasses } from '@/components/ui/status';

export type PayoutEvent = 'CASE_CREATED' | 'CONTRACT_SIGNED' | 'VISA_APPROVED' | 'INVOICE_PAID';
export const PAYOUT_EVENTS: PayoutEvent[] = ['CASE_CREATED', 'CONTRACT_SIGNED', 'VISA_APPROVED', 'INVOICE_PAID'];
export type CommissionStatus = 'PENDING' | 'APPROVED' | 'PAID' | 'CANCELLED';
export const COMMISSION_STATUSES: CommissionStatus[] = ['PENDING', 'APPROVED', 'PAID', 'CANCELLED'];
export type AgentStatus = 'ACTIVE' | 'PAUSED';
export type CommissionType = 'FIXED' | 'PERCENT';
export type Stage = 'REGISTERED' | 'DOCUMENTS' | 'CONTRACT' | 'EMBASSY' | 'APPROVED' | 'CLOSED';

export interface AgentStats {
  referrals: number;
  activeCases: number;
  approvedVisas: number;
  pendingCents: number;
  approvedCents: number;
  paidCents: number;
}

export interface AdminAgent {
  id: string;
  userId: string;
  code: string;
  region: string | null;
  company: string | null;
  status: AgentStatus;
  commissionType: CommissionType;
  commissionValue: number;
  currency: string;
  payoutEvents: PayoutEvent[];
  iban: string | null;
  notes: string | null;
  createdAt: string;
  shareLink: string;
  stats?: AgentStats;
  user: { id: string; firstName: string; lastName: string; email: string; phone: string | null; locale: string; isActive: boolean; createdAt: string };
}

export interface AdminCommission {
  id: string;
  event: string;
  amountCents: number;
  currency: string;
  status: CommissionStatus;
  note: string | null;
  payoutRef: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  createdAt: string;
  agent: { id: string; code: string; user: { firstName: string; lastName: string } };
  client: { id: string; firstName: string; lastName: string; email: string } | null;
  case: { id: string; number: string; status: string } | null;
}

export interface AdminReferral {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  createdAt: string;
  referredAt: string | null;
  case: { id: string; number: string; status: string } | null;
}

export const STATUS_TONE: Record<CommissionStatus, string> = toneClasses(STATUS_TONES.commission);

export const STAGE_TONE: Record<Stage, string> = toneClasses(STATUS_TONES.agentStage);

/** Translated API error for agent pages. */
export const agentError = (t: (k: string) => string, code: string) => {
  const key = `agents.errors.${code}`;
  const msg = t(key);
  return msg === key ? t('agents.errors.generic') : msg;
};
