import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import i18n from '@/i18n';
import { api, errorCode } from '@/lib/api';
import type { CaseStatus, L10n, Role } from '@/lib/types';
import { fmtDate, fmtDateTime, roleLabel, statusLabel } from '@/components/admin/labels';

/** Field history (server: lib/history, GET /api/admin/history). */
export type HistoryEntity = 'CASE' | 'USER' | 'COMPANY';
export const HISTORY_ENTITIES: HistoryEntity[] = ['CASE', 'USER', 'COMPANY'];
export type ChangeSource = 'admin' | 'client' | 'system' | 'ai' | 'automation' | 'revert';
export const CHANGE_SOURCES: ChangeSource[] = ['admin', 'client', 'system', 'ai', 'automation', 'revert'];

export type FieldKind = 'text' | 'date' | 'bool' | 'number' | 'enum' | 'json' | 'user' | 'company' | 'vacancy' | 'visaCategory' | 'case' | 'partner' | 'agent';

export interface HistoryItem {
  id: string;
  entity: HistoryEntity;
  entityId: string;
  entityLabel: string | null;
  entityRole: Role | null;
  field: string;
  kind: FieldKind;
  enumName: string | null;
  oldValue: unknown;
  newValue: unknown;
  oldLabel: string | L10n | null;
  newLabel: string | L10n | null;
  sensitive: boolean;
  masked: boolean;
  actor: { id: string; name: string | null; role: Role | null } | null;
  source: ChangeSource;
  requestId: string | null;
  revertOfId: string | null;
  revertedById: string | null;
  revertedAt: string | null;
  createdAt: string;
  canRevert: boolean;
}

export interface HistoryPage {
  items: HistoryItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface HistoryFilters {
  entity?: HistoryEntity;
  entityId?: string;
  actorId?: string;
  field?: string;
  source?: ChangeSource;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export const historyKey = (f: HistoryFilters = {}) => ['admin-history', f] as const;

export const useHistory = (f: HistoryFilters, enabled = true) =>
  useQuery({
    queryKey: historyKey(f),
    queryFn: async () => {
      const params = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined && v !== ''));
      return (await api.get<HistoryPage>('/admin/history', { params })).data;
    },
    placeholderData: keepPreviousData,
    enabled,
  });

/** Tracked fields per record type (filter options; mirrors server/src/lib/history/fields.ts). */
export const ENTITY_FIELDS: Record<HistoryEntity, string[]> = {
  CASE: ['status', 'assignedStaffId', 'profession', 'visaType', 'visaCategoryId', 'staffNote', 'appointmentAt', 'appointmentPlace', 'decisionAt', 'decisionReason', 'visaValidFrom', 'visaValidTo', 'cancelReason', 'companyId', 'vacancyId', 'partnerId', 'parentCaseId', 'relation', 'clientId'],
  USER: ['firstName', 'lastName', 'email', 'phone', 'role', 'isActive', 'locale', 'birthDate', 'nationality', 'city', 'address', 'profession', 'experienceYears', 'germanLevel', 'education', 'drivingLicence', 'about', 'passportNumber', 'passportExpiry', 'companyId', 'referredByAgentId', 'emailNotifications', 'pushNotifications', 'whatsappOptIn', 'smsNotifications'],
  COMPANY: ['name', 'status', 'legalForm', 'sector', 'city', 'address', 'vatId', 'website', 'contactName', 'phone', 'email', 'note'],
};

const t = (key: string, opts?: Record<string, unknown>) => String(i18n.t(key, opts));

export const fieldLabel = (field: string) => {
  if (field.startsWith('registerData.')) return t('history.fields.registerData', { key: field.slice('registerData.'.length) });
  return i18n.exists(`history.fields.${field}`) ? t(`history.fields.${field}`) : field;
};

export const entityLabel = (e: string) => (i18n.exists(`history.entities.${e}`) ? t(`history.entities.${e}`) : e);
export const sourceLabel = (s: string) => (i18n.exists(`history.sources.${s}`) ? t(`history.sources.${s}`) : s);

export const SOURCE_TONE: Record<string, string> = {
  admin: 'bg-primary/10 text-link',
  client: 'bg-sunken text-muted',
  system: 'bg-sunken text-muted',
  ai: 'bg-accent-bg text-accent-fg',
  automation: 'bg-info-bg text-info-fg',
  revert: 'bg-warning-bg text-warning-fg',
};

const pickL10n = (v: L10n) => {
  const l = (i18n.resolvedLanguage ?? 'az').slice(0, 2) as keyof L10n;
  return v[l] || v.az || v.en || '';
};

const enumLabel = (enumName: string | null, v: string) => {
  switch (enumName) {
    case 'CaseStatus':
      return statusLabel(v as CaseStatus);
    case 'Role':
      return roleLabel(v as Role);
    case 'VisaType':
      return i18n.exists(`history.visaTypes.${v}`) ? t(`history.visaTypes.${v}`) : v;
    case 'CompanyStatus':
      return i18n.exists(`history.companyStatus.${v}`) ? t(`history.companyStatus.${v}`) : v;
    case 'Locale':
      return i18n.exists(`history.locales.${v}`) ? t(`history.locales.${v}`) : v;
    default:
      return v;
  }
};

const ID_KINDS: FieldKind[] = ['user', 'company', 'vacancy', 'visaCategory', 'case', 'partner', 'agent'];

/** A stored value as people read it: dates formatted, enums translated, ids replaced by names. */
export const formatValue = (meta: { kind: FieldKind; enumName: string | null; masked?: boolean }, v: unknown, label?: string | L10n | null): string => {
  if (v === null || v === undefined || v === '') return t('history.empty_value');
  if (meta.masked) return String(v);
  if (ID_KINDS.includes(meta.kind)) {
    if (label) return typeof label === 'string' ? label : pickL10n(label);
    return `#${String(v).slice(-6)}`;
  }
  switch (meta.kind) {
    case 'date': {
      const s = String(v);
      return /T00:00:00(\.000)?Z$/.test(s) ? fmtDate(s) : fmtDateTime(s);
    }
    case 'bool':
      return v ? t('history.yes') : t('history.no');
    case 'enum':
      return enumLabel(meta.enumName, String(v));
    case 'json':
      return JSON.stringify(v);
    default: {
      const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
      return s.length > 160 ? `${s.slice(0, 157)}…` : s;
    }
  }
};

/** Consecutive changes of one request form one group ("who did what in one action"). */
export interface HistoryGroup {
  key: string;
  requestId: string | null;
  items: HistoryItem[];
}

export const groupByRequest = (items: HistoryItem[]): HistoryGroup[] => {
  const groups: HistoryGroup[] = [];
  for (const it of items) {
    const last = groups[groups.length - 1];
    if (last && it.requestId && last.requestId === it.requestId) last.items.push(it);
    else groups.push({ key: it.id, requestId: it.requestId, items: [it] });
  }
  return groups;
};

/** Body of an API error (the revert endpoints put details next to the code). */
export const errorBody = (err: unknown): Record<string, unknown> & { error?: string } =>
  err instanceof AxiosError ? ((err.response?.data as Record<string, unknown>) ?? {}) : {};

/** Translated revert error; `fmt` formats the "current value" it may mention. */
export const revertErrorMessage = (code: string | undefined, details: Record<string, unknown>, fmt: (v: unknown) => string) => {
  if (!code) return t('history.errors.generic');
  if (code === 'TRANSITION_NOT_ALLOWED' && typeof details.reason === 'string' && i18n.exists(`history.errors.${details.reason}`)) {
    return t(`history.errors.${details.reason}`, {
      from: details.from ? statusLabel(details.from as CaseStatus) : '',
      to: details.to ? statusLabel(details.to as CaseStatus) : '',
    });
  }
  if (code === 'CHANGED_SINCE' && details.canForce === false) return t('history.errors.CHANGED_SINCE_STATUS', { current: statusLabel(details.current as CaseStatus) });
  if (i18n.exists(`history.errors.${code}`)) return t(`history.errors.${code}`, { current: fmt(details.current) });
  return t('history.errors.generic');
};

export const apiErrorCode = errorCode;
