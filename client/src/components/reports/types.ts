import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useL10n } from '@/lib/l10n';

/** Shapes of /api/admin/reports and value formatting shared by the builder and the profitability page. */

export type Lang = 'az' | 'de' | 'en' | 'ru';
export type L10n = Record<Lang, string>;
export type ColType = 'string' | 'number' | 'money' | 'date' | 'enum' | 'boolean' | 'user';
export type FilterOp = 'eq' | 'neq' | 'contains' | 'gt' | 'gte' | 'lt' | 'lte' | 'between' | 'in' | 'notIn' | 'empty' | 'notEmpty' | 'before' | 'after' | 'relative' | 'is';
export type AggFn = 'count' | 'sum' | 'avg' | 'min' | 'max';
export type Granularity = 'day' | 'week' | 'month' | 'quarter' | 'year';
export type ChartType = 'bar' | 'line' | 'pie';

export interface DatasetColumn {
  key: string;
  label: L10n;
  type: ColType;
  default: boolean;
  enumValues: string[] | null;
  enumLabels: Record<string, L10n> | null;
  ops: FilterOp[];
  groupable: boolean;
  aggregatable: AggFn[];
  sensitive: boolean;
  masked: boolean;
}

export interface Dataset {
  key: string;
  label: L10n;
  description: L10n;
  category: 'operations' | 'finance';
  dateColumn: string | null;
  defaultSort: { column: string; dir: 'asc' | 'desc' };
  columns: DatasetColumn[];
}

export interface DatasetsResponse {
  datasets: Dataset[];
  relativeRanges: string[];
  aggregations: { fn: AggFn; label: L10n }[];
  granularities: Granularity[];
  limits: { previewRows: number; exportRows: number };
}

export interface ReportFilter {
  column: string;
  op: FilterOp;
  value?: unknown;
}

export interface ReportConfig {
  columns: string[];
  filters: ReportFilter[];
  groupBy: { column: string; granularity?: Granularity }[];
  aggregations: { column: string; fn: AggFn }[];
  sort?: { column: string; dir: 'asc' | 'desc' } | null;
  chart?: { type: ChartType; metric?: string } | null;
}

export interface OutColumn {
  key: string;
  label: L10n;
  type: ColType | 'period';
  column?: string;
  fn?: AggFn;
  enumLabels?: Record<string, L10n>;
  masked?: boolean;
}

export interface ReportResult {
  dataset: string;
  grouped: boolean;
  columns: OutColumn[];
  rows: Record<string, unknown>[];
  total: number;
  records: number;
  truncated: boolean;
  totals: Record<string, unknown> | null;
  masked: string[];
  previewRows: number;
}

export interface SavedReport {
  id: string;
  name: string;
  dataset: string;
  config: ReportConfig;
  shared: boolean;
  ownerId: string | null;
  ownerName: string | null;
  canEdit: boolean;
  schedules: number;
  createdAt: string;
  updatedAt: string;
}

export interface Schedule {
  id: string;
  reportId: string;
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  weekday: number | null;
  monthDay: number | null;
  time: string;
  recipientUserIds: string[];
  externalEmails: string[];
  active: boolean;
  createdById: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastDelivery: { status: string; createdAt: string; periodKey: string; error: string | null } | null;
}

export interface Delivery {
  id: string;
  periodKey: string;
  status: 'SENT' | 'FAILED' | 'PENDING';
  rows: number;
  recipients: string[];
  error: string | null;
  createdAt: string;
}

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export const emptyConfig = (): ReportConfig => ({ columns: [], filters: [], groupBy: [], aggregations: [], sort: null, chart: null });

const NUM_LOCALE = { az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' } as const;

/** Formats report values in the UI language (money arrives in cents). */
export const useReportFormat = () => {
  const { locale } = useL10n();
  const { t } = useTranslation();
  return useMemo(() => {
    const tag = NUM_LOCALE[locale as Lang] ?? 'en-GB';
    const money = new Intl.NumberFormat(tag, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const eur = new Intl.NumberFormat(tag, { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const azn = new Intl.NumberFormat(tag, { style: 'currency', currency: 'AZN', minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const num = new Intl.NumberFormat(tag, { maximumFractionDigits: 2 });
    const date = new Intl.DateTimeFormat(tag, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Baku' });
    const dateTime = new Intl.DateTimeFormat(tag, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Baku' });
    const tr = (l: L10n | undefined | null) => (l ? (l[locale as Lang] ?? l.en) : '');
    const cell = (c: Pick<OutColumn, 'type' | 'enumLabels' | 'column' | 'fn'>, v: unknown): string => {
      if (v === null || v === undefined || v === '') return c.column && !c.fn ? t('reports.none') : '—';
      switch (c.type) {
        case 'money':
          return money.format(Number(v) / 100);
        case 'number':
          return num.format(Number(v));
        case 'boolean':
          return v ? t('reports.bool.yes') : t('reports.bool.no');
        case 'date': {
          const s = String(v);
          const d = new Date(s);
          return Number.isNaN(d.getTime()) ? s : date.format(d);
        }
        case 'enum':
          return c.enumLabels?.[String(v)] ? tr(c.enumLabels[String(v)]) : String(v);
        default:
          return String(v);
      }
    };
    return {
      locale: locale as Lang,
      tr,
      cell,
      eur: (cents: number | null | undefined) => (cents == null ? '—' : eur.format(cents / 100)),
      azn: (cents: number | null | undefined, rate: number) => (cents == null ? '—' : azn.format((cents / 100) * rate)),
      pct: (v: number | null | undefined) => (v == null ? '—' : `${num.format(v)}%`),
      num: (v: number) => num.format(v),
      dateTime: (iso: string) => dateTime.format(new Date(iso)),
      date: (iso: string) => date.format(new Date(iso)),
    };
  }, [locale, t]);
};

export const reportErrorKey = (code: string) => `reports.errors.${code}`;
