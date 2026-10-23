import { AxiosError } from 'axios';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import i18n from '@/i18n';
import { api, errorCode } from '@/lib/api';
import { errorMessage } from '@/components/admin/labels';
import type { CaseStatus, Role } from '@/lib/types';

export type Lang = 'az' | 'de' | 'en' | 'ru';
export const LANGS: Lang[] = ['az', 'de', 'en', 'ru'];
export type Channel = 'EMAIL' | 'SMS' | 'IN_APP';
export const CHANNELS: Channel[] = ['EMAIL', 'IN_APP', 'SMS'];
export type CampaignKind = 'SERVICE' | 'MARKETING';
export type CampaignStatus = 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
export type RecipientStatus = 'QUEUED' | 'SENDING' | 'SENT' | 'FAILED' | 'SKIPPED' | 'BOUNCED';
export const VISA_TYPES = ['WORK', 'AUSBILDUNG', 'WEITERBILDUNG', 'JOB_SEEKER', 'STUDY', 'FAMILY', 'TOURIST'] as const;
export const APP_STATUSES = ['NEW', 'SHORTLISTED', 'PROPOSED', 'INTERVIEW', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'] as const;

// ─── Segments ──────────────────────────────────────────────────────────

export type Condition =
  | { field: 'role'; values: ('CLIENT' | 'COMPANY')[] }
  | { field: 'caseStatus'; values: CaseStatus[] }
  | { field: 'visaType'; values: string[] }
  | { field: 'visaCategory'; values: string[] }
  | { field: 'caseState'; value: 'ACTIVE' | 'CLOSED' | 'NONE' }
  | { field: 'registered'; from?: string; to?: string }
  | { field: 'lastActivity'; op: 'before' | 'after'; date: string }
  | { field: 'locale'; values: Lang[] }
  | { field: 'city'; values: string[] }
  | { field: 'country'; values: string[] }
  | { field: 'passportExpiresWithin'; months: number }
  | { field: 'appointmentWithin'; days: number }
  | { field: 'applicationStatus'; vacancyId: string; values: string[] }
  | { field: 'company'; values: string[] }
  | { field: 'unpaidInvoice' }
  | { field: 'marketingOptIn'; value: boolean };
export type Field = Condition['field'];
export const FIELDS: Field[] = [
  'role',
  'caseStatus',
  'caseState',
  'visaType',
  'visaCategory',
  'appointmentWithin',
  'passportExpiresWithin',
  'registered',
  'lastActivity',
  'locale',
  'city',
  'country',
  'applicationStatus',
  'company',
  'unpaidInvoice',
  'marketingOptIn',
];

export interface Group {
  op: 'AND' | 'OR';
  conditions: Condition[];
}
export interface Definition {
  op: 'AND' | 'OR';
  groups: Group[];
}

const today = () => new Date().toISOString().slice(0, 10);

/** A new condition of the given field with sensible defaults. */
export const blankCondition = (field: Field): Condition => {
  switch (field) {
    case 'role':
      return { field, values: ['CLIENT'] };
    case 'caseStatus':
      return { field, values: ['DOCUMENTS_PENDING'] };
    case 'visaType':
      return { field, values: ['WORK'] };
    case 'caseState':
      return { field, value: 'ACTIVE' };
    case 'registered':
      return { field, from: today() };
    case 'lastActivity':
      return { field, op: 'before', date: today() };
    case 'locale':
      return { field, values: ['az'] };
    case 'passportExpiresWithin':
      return { field, months: 6 };
    case 'appointmentWithin':
      return { field, days: 14 };
    case 'applicationStatus':
      return { field, vacancyId: '', values: [] };
    case 'unpaidInvoice':
      return { field };
    case 'marketingOptIn':
      return { field, value: true };
    default:
      return { field, values: [] } as Condition;
  }
};

export interface SegmentSampleRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  role: Role;
  locale: Lang;
  city: string | null;
  marketingOptIn: boolean;
  emailNotifications: boolean;
  smsNotifications: boolean;
  company: { name: string } | null;
}
export interface SegmentPreview {
  count: number;
  marketingOptedIn: number;
  sample: SegmentSampleRow[];
}
export interface Segment {
  id: string;
  name: string;
  description: string | null;
  definition: Definition;
  createdAt: string;
  updatedAt: string;
  createdBy: { firstName: string; lastName: string } | null;
  _count?: { campaigns: number };
}
export interface SegmentOptions {
  visaCategories: { id: string; slug: string; title: Record<Lang, string> }[];
  companies: { id: string; name: string }[];
  vacancies: { id: string; title: Record<Lang, string> | string; status: string; company: string | null }[];
  cities: string[];
  countries: string[];
  placeholders: string[];
  allowedHosts: string[];
}

export const useSegments = () =>
  useQuery({ queryKey: ['campaign-segments'], queryFn: async () => (await api.get<{ items: Segment[] }>('/admin/campaigns/segments')).data.items });

export const useSegmentOptions = () =>
  useQuery({ queryKey: ['campaign-segment-options'], queryFn: async () => (await api.get<SegmentOptions>('/admin/campaigns/segments/options')).data, staleTime: 5 * 60_000 });

export const previewSegment = async (definition: Definition) => (await api.post<SegmentPreview>('/admin/campaigns/segments/preview', { definition })).data;

// ─── Campaigns ─────────────────────────────────────────────────────────

export interface LocaleContent {
  subject: string;
  body: string;
  sms: string;
}
export type Content = Record<Lang, LocaleContent>;
export const emptyContent = (): Content => ({
  az: { subject: '', body: '', sms: '' },
  de: { subject: '', body: '', sms: '' },
  en: { subject: '', body: '', sms: '' },
  ru: { subject: '', body: '', sms: '' },
});

export interface Stats {
  total: number;
  queued: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  failed: number;
  bounced: number;
  skipped: number;
  unsubscribed: number;
  inAppRead: number;
  byChannel: Record<string, Record<string, number>>;
}
export interface CampaignListItem {
  id: string;
  name: string;
  kind: CampaignKind;
  status: CampaignStatus;
  channels: Channel[];
  segment: { id: string; name: string } | null;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  createdBy: { firstName: string; lastName: string } | null;
  stats: Stats;
}
export interface Campaign extends CampaignListItem {
  segmentId: string | null;
  content: Content;
  emailsPerMinute: number;
  smsPerMinute: number;
  quietHours: boolean;
  segment: (Segment & { definition: Definition }) | null;
}
export interface Recipient {
  id: string;
  userId: string;
  channel: Channel;
  locale: Lang;
  status: RecipientStatus;
  skipReason: string | null;
  address: string | null;
  attempts: number;
  sentAt: string | null;
  deliveredAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  clicks: number;
  unsubscribedAt: string | null;
  readAt: string | null;
  error: string | null;
  user: { firstName: string; lastName: string; email: string; role: Role };
}

export const useCampaigns = () =>
  useQuery({
    queryKey: ['campaigns'],
    queryFn: async () => (await api.get<{ items: CampaignListItem[] }>('/admin/campaigns')).data.items,
    // Running campaigns update their numbers while the page is open.
    refetchInterval: (q) => ((q.state.data ?? []).some((c) => c.status === 'SENDING') ? 10_000 : false),
  });

export const useCampaign = (id: string | undefined) =>
  useQuery({
    queryKey: ['campaign', id],
    enabled: !!id,
    queryFn: async () => (await api.get<{ item: Campaign }>(`/admin/campaigns/${id}`)).data.item,
    refetchInterval: (q) => (q.state.data?.status === 'SENDING' ? 10_000 : false),
  });

/** Error toast with the campaign-specific messages first (wizard.errors.CODE), then the admin ones. */
export const campaignError = (err: unknown) => {
  const code = errorCode(err);
  const key = `campaigns.wizard.errors.${code}`;
  if (i18n.exists(key)) {
    const message = err instanceof AxiosError ? ((err.response?.data as { message?: string } | undefined)?.message ?? '') : '';
    toast.error(String(i18n.t(key, { message })));
  } else toast.error(errorMessage(err));
};

export const STATUS_TONE: Record<CampaignStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  SCHEDULED: 'bg-sky-100 text-sky-800',
  SENDING: 'bg-amber-100 text-amber-800',
  PAUSED: 'bg-orange-100 text-orange-800',
  COMPLETED: 'bg-emerald-100 text-emerald-800',
  CANCELLED: 'bg-red-100 text-red-700',
};

export const RECIPIENT_TONE: Record<RecipientStatus, string> = {
  QUEUED: 'bg-slate-100 text-slate-700',
  SENDING: 'bg-amber-100 text-amber-800',
  SENT: 'bg-emerald-100 text-emerald-800',
  FAILED: 'bg-red-100 text-red-700',
  SKIPPED: 'bg-slate-100 text-slate-600',
  BOUNCED: 'bg-red-100 text-red-700',
};
