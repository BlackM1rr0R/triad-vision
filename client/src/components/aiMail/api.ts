import { useQuery } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { STATUS_TONES, toneClasses } from '@/components/ui/status';
import type { TFunction } from 'i18next';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesAiMail } from '@/i18n/pagesAiMail';

registerCopy(pagesAiMail);

export type TriageCategory = 'CANDIDATE' | 'EMPLOYER' | 'PARTNER' | 'EXISTING_CLIENT' | 'SUPPLIER' | 'SPAM' | 'OTHER';
export type TriageUrgency = 'URGENT' | 'NORMAL' | 'LOW';
export type TriageStatus = 'PENDING' | 'NEW' | 'ACTIONED' | 'DISMISSED' | 'SKIPPED' | 'FAILED';
export const TRIAGE_CATEGORIES: TriageCategory[] = ['CANDIDATE', 'EMPLOYER', 'PARTNER', 'EXISTING_CLIENT', 'SUPPLIER', 'SPAM', 'OTHER'];

export type AiFilter = 'urgent' | 'open' | 'candidate' | 'employer' | 'partner' | 'client' | 'spam';
export const AI_FILTERS: AiFilter[] = ['urgent', 'candidate', 'employer', 'partner', 'client', 'spam', 'open'];

/** Chip data on every mail list row (null: never analysed). */
export interface TriageChip {
  status: TriageStatus;
  category: TriageCategory | null;
  urgency: TriageUrgency | null;
}

export interface Triage {
  id: string;
  messageId: string;
  status: TriageStatus;
  category: TriageCategory | null;
  urgency: TriageUrgency | null;
  language: string | null;
  summary: { lang: string | null; text: string; en: string; shown: string } | null;
  contact: { name?: string; email?: string; phone?: string; company?: string; country?: string } | null;
  intent: string | null;
  visaCategory: { slug: string; title: string | null; label: string } | null;
  assigneeRole: string | null;
  existingClient: { userId: string; name: string; role: string; caseId: string | null; caseNumber: string | null; companyName: string | null; matchedBy: 'email' | 'phone' } | null;
  suggestedAssignee: { id: string; name: string } | null;
  assignedTo: { id: string; name: string } | null;
  replyDraft: { language: string; subject: string; body: string } | null;
  lead: { id: string; status: string } | null;
  skipReason: 'AUTO_REPLY' | 'BOUNCE' | 'NO_REPLY' | 'OWN_MESSAGE' | null;
  error: string | null;
  errorMessage: string | null;
  model: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TriageStatusInfo {
  enabled: boolean;
  available: boolean;
  reason: string | null;
  message: string | null;
  canConfigure: boolean;
  mailboxes: { accountId: string; email: string; auto: boolean }[];
}

export interface InboxToday {
  enabled: boolean;
  mailboxes: string[];
  since: string;
  total: number;
  analysed: number;
  open: number;
  urgent: number;
  byCategory: Partial<Record<TriageCategory, number>>;
}

export interface StaffOption {
  id: string;
  name: string;
  role: string;
}

export const aiMailKeys = {
  status: ['ai-mail', 'status'] as const,
  triage: (messageId: string) => ['ai-mail', 'triage', messageId] as const,
  today: ['ai-mail', 'today'] as const,
  staff: ['ai-mail', 'staff'] as const,
  settings: ['ai-mail', 'settings'] as const,
};

export const useTriageStatus = (enabled = true) =>
  useQuery({ queryKey: aiMailKeys.status, queryFn: async () => (await api.get<TriageStatusInfo>('/ai-mail/status')).data, staleTime: 60_000, enabled });

export const useTriage = (messageId: string | null | undefined) =>
  useQuery({
    queryKey: aiMailKeys.triage(messageId ?? ''),
    queryFn: async () => (await api.get<{ triage: Triage | null; autoMailbox: boolean }>(`/ai-mail/messages/${encodeURIComponent(messageId!)}`)).data,
    enabled: !!messageId,
    staleTime: 15_000,
    retry: false,
    // A running analysis finishes within seconds; poll until it is stored.
    refetchInterval: (q) => (q.state.data?.triage?.status === 'PENDING' ? 3000 : false),
  });

export const useInboxToday = () =>
  useQuery({
    queryKey: aiMailKeys.today,
    queryFn: async () => (await api.get<InboxToday>('/ai-mail/today', { params: { tz: new Date().getTimezoneOffset() } })).data,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    retry: false,
  });

export const useStaffOptions = (enabled: boolean) =>
  useQuery({ queryKey: aiMailKeys.staff, queryFn: async () => (await api.get<{ staff: StaffOption[] }>('/ai-mail/staff')).data.staff, staleTime: 5 * 60_000, enabled });

/** Error text for a failed AI call: the server's own limit message, else our copy by reason. */
export const aiMailError = (t: TFunction, err: unknown) => {
  if (err instanceof AxiosError) {
    const data = err.response?.data as { reason?: string; message?: string } | undefined;
    if (data?.message) return data.message;
    if (data?.reason && ['FEATURE_OFF', 'TIMEOUT', 'UPSTREAM', 'BAD_OUTPUT'].includes(data.reason)) return t(`aiMail.errors.${data.reason}`);
  }
  return t('aiMail.errors.generic');
};

export const CATEGORY_TONE: Record<TriageCategory, string> = {
  CANDIDATE: 'bg-primary/10 text-link',
  EMPLOYER: 'bg-accent-bg text-accent-fg',
  PARTNER: 'bg-info-bg text-info-fg',
  EXISTING_CLIENT: 'bg-success-bg text-success-fg',
  SUPPLIER: 'bg-sunken text-muted',
  SPAM: 'bg-sunken text-muted',
  OTHER: 'bg-sunken text-muted',
};

export const URGENCY_TONE: Record<TriageUrgency, string> = toneClasses(STATUS_TONES.urgency);

/** Plain text → minimal html for the editor (paragraphs, escaped). */
export const draftToHtml = (text: string) =>
  text
    .replace(/\r/g, '')
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!).replace(/\n/g, '<br>')}</p>`)
    .join('');
