import type { TFunction } from 'i18next';
import { api } from '@/lib/api';
import { currentLocale, registerCopy } from '@/i18n';
import { pagesAiCase } from '@/i18n/pagesAiCase';
import { optimizeImage } from '@/lib/imageCompress';

registerCopy(pagesAiCase);

/** Shapes of /api/admin/cases/:id/ai/* (server: routes/admin/caseAi.ts, lib/ai/features/caseAi). */

export type Kind = 'CONSISTENCY' | 'CONTRACT' | 'VIDEX';
export type Severity = 'BLOCKER' | 'WARNING' | 'INFO';
export type L10n = { az: string; de: string; en: string; ru: string };
export type FindingStatus = 'OK' | 'FIXED' | 'IGNORED';

export interface Evidence {
  documentId: string | null;
  documentName: string;
  value: string;
}

export interface Finding {
  key: string;
  source: 'rule' | 'ai';
  code: string;
  severity: Severity;
  field: string;
  message: L10n;
  evidence: Evidence[];
  suggestedFix?: { kind: 'PROFILE_FIELD' | 'REQUEST_DOCUMENT' | 'TASK'; field?: string; value?: string; requirementId?: string; requirementKey?: string; title?: L10n };
}

export interface AiMeta {
  status: 'done' | 'skipped';
  reason?: string;
  model?: string;
  costUsd?: number;
}

export interface ConsistencyResult {
  findings: Finding[];
  plannedEntry: { date: string; source: 'flight' | 'appointment' | 'estimate' };
  documentsRead: number;
  filesSent: number;
  purged: boolean;
  ai: AiMeta;
  generatedAt: string;
}

export interface ContractIssue {
  code: string;
  severity: Severity;
  field: string;
  message: L10n;
  quote: string | null;
  quoteVerified: boolean;
}

export interface ContractTerms {
  employer: { name: string | null; address: string | null };
  employee: { name: string | null; address: string | null };
  position: string | null;
  startDate: string | null;
  endDate: string | null;
  contractType: 'permanent' | 'fixed_term' | null;
  grossMonthlySalary: number | null;
  hourlyWage: number | null;
  weeklyHours: number | null;
  probationMonths: number | null;
  vacationDays: number | null;
  placeOfWork: string | null;
  noticePeriod: string | null;
  collectiveAgreement: string | null;
}

export interface ContractResult {
  file: { name: string; documentId: string | null; nodeId: string | null; pages: number; textLayer: boolean };
  terms: ContractTerms;
  issues: ContractIssue[];
  light: 'GREEN' | 'YELLOW' | 'RED';
  email: { to: string | null; subject: string; body: string };
  ai: AiMeta;
  generatedAt: string;
}

export type VidexSource = 'passport' | 'profile' | 'case' | 'employer' | 'contract' | 'document' | 'ai' | 'default' | 'manual';
export type Section = 'person' | 'passport' | 'contact' | 'occupation' | 'stay' | 'employer' | 'history';

export interface VidexField {
  key: string;
  section: Section;
  label: L10n;
  value: string;
  source: VidexSource | null;
  confidence: 'high' | 'medium' | 'low' | null;
  documentId: string | null;
  required: boolean;
  askClient: boolean;
  editedAt?: string;
}

export interface ChecklistEntry {
  key: string;
  label: L10n;
  requirementKey: string | null;
  status: 'present' | 'missing' | 'manual';
  documentIds: string[];
}

export interface VidexResult {
  fields: VidexField[];
  checklist: ChecklistEntry[];
  checklistNote: L10n;
  visaType: string;
  ai: AiMeta & { filled?: string[] };
  generatedAt: string;
}

export interface Run<T> {
  id: string;
  kind: Kind;
  result: T;
  model: string | null;
  costUsd: number;
  createdAt: string;
  updatedAt: string;
  subjectId: string | null;
}

export interface FindingState {
  kind: Kind;
  key: string;
  status: FindingStatus;
  note: string | null;
  at: string;
}

export interface Overview {
  ai: { available: boolean; reason: string | null; enabled: boolean };
  runs: { CONSISTENCY: Run<ConsistencyResult> | null; CONTRACT: Run<ContractResult> | null; VIDEX: Run<VidexResult> | null };
  states: FindingState[];
  contracts: { id: string; name: string; stage: string; createdAt: string; current: boolean }[];
  estimatesUsd: Record<Kind, number>;
  canEditSettings: boolean;
}

export type RunResponse<T> = { run: Run<T>; states: FindingState[] };
export type ContractResponse = { run: Run<ContractResult> | null; reason?: string; states?: FindingState[] };

export const overviewKey = (caseId: string) => ['case-ai', caseId] as const;

export const fetchOverview = async (caseId: string) => (await api.get<Overview>(`/admin/cases/${caseId}/ai`)).data;

export type ContractSource = { documentId?: string; nodeId?: string; file?: File };

export const runContract = async (caseId: string, src: ContractSource = {}) => {
  if (src.file) {
    const fd = new FormData();
    fd.append('file', await optimizeImage(src.file));
    return (await api.post<ContractResponse>(`/admin/cases/${caseId}/ai/contract`, fd)).data;
  }
  return (await api.post<ContractResponse>(`/admin/cases/${caseId}/ai/contract`, { documentId: src.documentId, nodeId: src.nodeId })).data;
};

export const lang = () => currentLocale() as keyof L10n;
export const l10n = (v: L10n | null | undefined) => (v ? v[lang()] || v.de || v.en || '' : '');

const KNOWN = ['NO_API_KEY', 'DISABLED', 'CASE_AI_DISABLED', 'MONTHLY_BUDGET', 'DAILY_COST', 'DAILY_MESSAGES', 'KEY_CREDIT', 'TIMEOUT', 'UPSTREAM', 'BAD_OUTPUT', 'UNREADABLE', 'TOO_LARGE', 'NOTHING_TO_DO'];
export const reasonText = (t: TFunction, r: string | null | undefined) => t(`aiCase.reasons.${r && KNOWN.includes(r) ? r : 'generic'}`);

export const usd = (n: number) => (n < 0.01 ? n.toFixed(3) : n.toFixed(2));

export const fmtDay = (iso: string | null | undefined) => {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
};

export const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

export const SEVERITY_STYLE: Record<Severity, string> = {
  BLOCKER: 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300',
  WARNING: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300',
  INFO: 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-300',
};
