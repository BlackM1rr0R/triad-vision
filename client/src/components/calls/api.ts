import { useQuery } from '@tanstack/react-query';
import { api, errorCode } from '@/lib/api';
import type { TFunction } from 'i18next';

/** Shapes of /api/calls, /api/callback and /api/livechat (server/src/routes/calls.ts, callback.ts, livechat.ts). */

export type CallStatus = 'QUEUED' | 'RINGING_STAFF' | 'RINGING' | 'IN_PROGRESS' | 'COMPLETED' | 'BUSY' | 'NO_ANSWER' | 'FAILED' | 'CANCELED';
export type CallOutcome = 'REACHED' | 'NO_ANSWER' | 'WRONG_NUMBER' | 'CALL_BACK';
export const OUTCOMES: CallOutcome[] = ['REACHED', 'NO_ANSWER', 'WRONG_NUMBER', 'CALL_BACK'];
export const FINAL: CallStatus[] = ['COMPLETED', 'BUSY', 'NO_ANSWER', 'FAILED', 'CANCELED'];

interface Person {
  id: string;
  firstName: string;
  lastName: string;
}

export interface Call {
  id: string;
  provider: string;
  direction: 'OUTBOUND' | 'INBOUND';
  from: string;
  to: string;
  status: CallStatus;
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  durationSec: number | null;
  recorded: boolean;
  hasRecording: boolean;
  transcript: string | null;
  summary: string | null;
  followUps: { title: string; dueInDays: number | null }[];
  outcome: CallOutcome | null;
  note: string | null;
  staff: Person | null;
  client: Person | null;
  case: { id: string; number: string } | null;
  inquiry: { id: string; contactName: string } | null;
  callbackId: string | null;
  liveChatId: string | null;
}

export interface CallsStatus {
  configured: boolean;
  provider: 'none' | 'twilio' | 'sipgate' | 'fake';
  recording: boolean;
  recordingNotice: Record<'az' | 'de' | 'en' | 'ru', string>;
  staffPhone: string | null;
  canConfigure: boolean;
}

export interface CallTarget {
  clientId?: string;
  caseId?: string;
  inquiryId?: string;
  callbackId?: string;
  liveChatId?: string;
  phone?: string;
}

export const useCallsStatus = (enabled = true) =>
  useQuery({
    queryKey: ['calls', 'status'],
    queryFn: async () => (await api.get<CallsStatus>('/calls/status')).data,
    staleTime: 60_000,
    enabled,
    retry: false,
  });

export const callsKey = (filter: Record<string, string | undefined>) => ['calls', 'list', filter] as const;

export const useCalls = (filter: { clientId?: string; caseId?: string; inquiryId?: string; mine?: boolean }, enabled = true) => {
  const params = { clientId: filter.clientId, caseId: filter.caseId, inquiryId: filter.inquiryId, mine: filter.mine ? '1' : undefined };
  return useQuery({
    queryKey: callsKey(params),
    queryFn: async () => (await api.get<{ calls: Call[] }>('/calls', { params })).data.calls,
    enabled,
  });
};

export const callError = (t: TFunction, err: unknown) => {
  const code = errorCode(err);
  const key = `calls.errors.${code}`;
  const msg = t(key);
  return msg === key ? t('calls.error') : msg;
};

export const fmtDuration = (t: TFunction, sec: number | null) => (sec === null ? '' : t('calls.log.duration', { min: Math.floor(sec / 60), sec: sec % 60 }));

export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;

// ─── Callback slots ────────────────────────────────────────────────────

export interface Slots {
  timezone: string;
  open: boolean;
  nextOpening: string | null;
  days: { label: 'today' | 'tomorrow'; date: string; windows: { start: string; end: string }[] }[];
}

export const useCallbackSlots = (enabled = true) =>
  useQuery({
    queryKey: ['callback', 'slots'],
    queryFn: async () => (await api.get<Slots>('/callback/slots')).data,
    staleTime: 60_000,
    enabled,
  });

/** "14:00" in Baku time. */
export const bakuTime = (iso: string, locale: string) => new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Baku' }).format(new Date(iso));
export const bakuDateTime = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Baku' }).format(new Date(iso));
