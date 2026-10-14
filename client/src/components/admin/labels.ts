import { toast } from 'sonner';
import i18n, { currentLocale, type Locale } from '@/i18n';
import { errorCode } from '@/lib/api';
import type { CaseStatus, DocAccess, DocEffectiveAccess, DocStage, DocStatus, Role } from '@/lib/types';

/**
 * Admin labels, error messages and formatting, all bound to the current UI language. The text lives in
 * i18n/admin.ts (registered by AdminLayout). These are plain functions reading the shared i18n instance,
 * so they can be called from hooks, mutations and event handlers; components that render them also call
 * useTranslation() so they re-render on a language switch.
 */
const t = (key: string, opts?: Record<string, unknown>): string => String(i18n.t(key, opts));
const has = (key: string) => i18n.exists(key);

// ─── Case status ────────────────────────────────────────────────────────

export const ALL_STATUSES: CaseStatus[] = [
  'DOCUMENTS_PENDING',
  'DOCUMENTS_REVIEW',
  'CONTRACT_SENT',
  'CONTRACT_SIGNED',
  'EMBASSY_DOCUMENTS',
  'EMBASSY_REVIEW',
  'APPOINTMENT_SCHEDULED',
  'DECISION_PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
];

export const statusLabel = (status: CaseStatus) => t(`admin.labels.status.${status}`);

export const stepLabel = (key: string) => t(`admin.labels.step.${key}`);

export const stageLabel = (stage: DocStage) => t(`admin.labels.stage.${stage}`);

export const docStatusLabel = (status: DocStatus) => t(`admin.labels.docStatus.${status}`);

export const DOC_STATUS_TONE: Record<DocStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  ACCEPTED: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-red-100 text-red-700',
};

export const roleLabel = (role: Role) => t(`admin.labels.role.${role}`);

export const ROLE_TONE: Record<Role, string> = {
  CLIENT: 'bg-slate-100 text-slate-700',
  STAFF: 'bg-brand-100 text-brand-700',
  ADMIN: 'bg-violet-100 text-violet-800',
  SUPER_ADMIN: 'bg-amber-100 text-amber-800',
};

// ─── Document workspaces ────────────────────────────────────────────────

export const docAccessLabel = (access: DocEffectiveAccess) => t(`admin.labels.docAccess.${access}`);

export const DOC_ACCESS_TONE: Record<DocEffectiveAccess, string> = {
  VIEW: 'bg-slate-100 text-slate-700',
  DOWNLOAD: 'bg-brand-100 text-brand-700',
  EDIT: 'bg-emerald-100 text-emerald-800',
  OWNER: 'bg-amber-100 text-amber-800',
};

/** Options for the grant select (null = no access). */
export const docGrantOptions = (): { value: DocAccess | ''; label: string }[] => [
  { value: '', label: t('admin.labels.noAccess') },
  { value: 'VIEW', label: docAccessLabel('VIEW') },
  { value: 'DOWNLOAD', label: docAccessLabel('DOWNLOAD') },
  { value: 'EDIT', label: docAccessLabel('EDIT') },
];

export const AUDIT_ACTIONS = [
  'LOGIN_FAILED',
  'PASSWORD_CHANGED',
  'PASSWORD_RESET',
  'SESSIONS_REVOKED',
  'USER_CREATED',
  'USER_UPDATED',
  'DOC_FILE_UPLOADED',
  'DOC_FILE_REPLACED',
  'DOC_FILE_MOVED',
  'DOC_FILE_DELETED',
  'DOC_DIR_RENAMED',
  'DOC_DIR_DELETED',
  'DOC_COMPANY_CREATED',
  'DOC_FOLDER_EXPORTED',
  'DOC_GRANT_CHANGED',
] as const;

export const auditActionLabel = (action: string) => (has(`admin.labels.audit.${action}`) ? t(`admin.labels.audit.${action}`) : action);

export type InquiryStatus = 'NEW' | 'IN_PROGRESS' | 'DONE' | 'ARCHIVED';

export const INQUIRY_STATUSES: InquiryStatus[] = ['NEW', 'IN_PROGRESS', 'DONE', 'ARCHIVED'];

export const inquiryStatusLabel = (status: InquiryStatus) => t(`admin.labels.inquiryStatus.${status}`);

export const INQUIRY_STATUS_TONE: Record<InquiryStatus, string> = {
  NEW: 'bg-brand-100 text-brand-700',
  IN_PROGRESS: 'bg-amber-100 text-amber-800',
  DONE: 'bg-emerald-100 text-emerald-800',
  ARCHIVED: 'bg-slate-200 text-slate-600',
};

export const INQUIRY_KINDS = ['company', 'contact'] as const;

export const inquiryKindLabel = (kind: string) => (has(`admin.labels.inquiryKind.${kind}`) ? t(`admin.labels.inquiryKind.${kind}`) : kind);

export const eventLabel = (type: string) => (has(`admin.labels.event.${type}`) ? t(`admin.labels.event.${type}`) : type);

// ─── Errors ─────────────────────────────────────────────────────────────

/** Translated message for an API error code; `fallback` (or a generic message) when the code is unknown. */
export const errorMessage = (err: unknown, fallback?: string) => {
  const code = errorCode(err);
  if (code && has(`admin.errors.${code}`)) return t(`admin.errors.${code}`);
  return fallback ?? t('admin.common.opFailed');
};

export const toastError = (err: unknown, fallback?: string) => {
  toast.error(errorMessage(err, fallback));
};

// ─── Formatting ─────────────────────────────────────────────────────────

/** Browsers ship incomplete Azerbaijani month data (Chrome prints "M10"), so Azerbaijani month names are our own. */
const AZ_MONTHS = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avq', 'sen', 'okt', 'noy', 'dek'];
const pad2 = (n: number) => String(n).padStart(2, '0');
const azDayMonth = (d: Date) => `${pad2(d.getDate())} ${AZ_MONTHS[d.getMonth()]}`;

const INTL_LOCALE: Record<Exclude<Locale, 'az'>, string> = { de: 'de-DE', en: 'en-GB', ru: 'ru-RU' };
const formatters = new Map<string, Intl.DateTimeFormat>();
const intl = (locale: Exclude<Locale, 'az'>, kind: 'date' | 'dateTime' | 'dayShort') => {
  const key = `${locale}:${kind}`;
  let f = formatters.get(key);
  if (!f) {
    const opts: Intl.DateTimeFormatOptions =
      kind === 'dayShort'
        ? { day: 'numeric', month: 'short' }
        : kind === 'date'
          ? { day: '2-digit', month: 'short', year: 'numeric' }
          : { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false };
    f = new Intl.DateTimeFormat(INTL_LOCALE[locale], opts);
    formatters.set(key, f);
  }
  return f;
};

export const fmtDate = (iso: string | Date | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const l = currentLocale();
  if (l === 'az') return `${azDayMonth(d)} ${d.getFullYear()}`;
  return intl(l, 'date').format(d);
};

export const fmtDateTime = (iso: string | Date | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const l = currentLocale();
  if (l === 'az') return `${azDayMonth(d)} ${d.getFullYear()}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return intl(l, 'dateTime').format(d);
};

export const fmtRelative = (iso: string | Date) => {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return t('admin.labels.relative.now');
  if (diff < 3600) return t('admin.labels.relative.minutes', { count: Math.floor(diff / 60) });
  if (diff < 86400) return t('admin.labels.relative.hours', { count: Math.floor(diff / 3600) });
  if (diff < 7 * 86400) return t('admin.labels.relative.days', { count: Math.floor(diff / 86400) });
  return fmtDate(iso);
};

/** Minutes → "3s 20d" / "3h 20m" (hours / minutes); under an hour just the minutes. */
export const fmtMinutes = (min: number | null | undefined) => {
  if (min == null) return '—';
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return t('admin.labels.minutes.m', { m: r });
  return r === 0 ? t('admin.labels.minutes.h', { h }) : t('admin.labels.minutes.hm', { h, m: r });
};

/** Days (possibly fractional) → "12 gün" / "0.5 days". */
export const fmtDays = (d: number | null | undefined) =>
  d == null ? '—' : t('admin.labels.daysCount', { count: Number.isInteger(d) ? d : Math.round(d * 10) / 10 });

/** 'YYYY-MM-DD' (a UTC calendar day from the API) → ISO at noon UTC, so the local calendar day never shifts. */
export const dayIso = (d: string) => `${d}T12:00:00Z`;

/** Short day label for chart axes ("14 okt" / "14 Oct"). */
export const fmtDayShort = (iso: string | Date) => {
  const d = new Date(iso);
  const l = currentLocale();
  if (l === 'az') return `${d.getDate()} ${AZ_MONTHS[d.getMonth()]}`;
  return intl(l, 'dayShort').format(d);
};

/** Who acted, by role, for list rows ("Müştəri" / "Əməkdaş" / "Sistem"). */
export const actorSideLabel = (role: Role | null | undefined) =>
  t(`admin.labels.actor.${!role ? 'system' : role === 'CLIENT' ? 'client' : 'staff'}`);

export const sessionClientLabel = (client: 'web' | 'mobile') => t(`admin.labels.sessionClient.${client}`);

/** "Mozilla/5.0 (Windows NT 10.0; …) Chrome/120 …" → "Chrome · Windows". */
export const shortUserAgent = (ua: string | null | undefined) => {
  if (!ua) return '—';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : /okhttp|Expo|ReactNative/i.test(ua)
              ? t('admin.labels.app')
              : null;
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad|iOS/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : null;
  const parts = [browser, os].filter(Boolean);
  return parts.length ? parts.join(' · ') : ua.length > 40 ? `${ua.slice(0, 40)}…` : ua;
};

export const waLink = (phone: string) => `https://wa.me/${phone.replace(/\D/g, '')}`;

export const fullName = (p: { firstName: string; lastName: string } | null | undefined) =>
  p ? `${p.firstName} ${p.lastName}`.trim() : '—';

/** ISO string → value for <input type="datetime-local"> in the browser's local time. */
export const toLocalInput = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** ISO string → value for <input type="date">. */
export const toDateInput = (iso: string | null | undefined) => toLocalInput(iso).slice(0, 10);
