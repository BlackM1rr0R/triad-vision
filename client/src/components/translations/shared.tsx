import { useCallback } from 'react';
import { STATUS_TONES, toneClasses } from '@/components/ui/status';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Check, Download, FileText, FolderOpen, Image as ImageIcon, Trash2 } from 'lucide-react';
import { errorCode, formatBytes } from '@/lib/api';

// ─── Types (mirror server/src/lib/translations/core.ts) ───────────────────

export type TrService = 'TRANSLATION' | 'APOSTILLE' | 'TRANSLATION_APOSTILLE' | 'NOTARY';
export type TrStatus = 'NEW' | 'QUOTED' | 'ACCEPTED' | 'IN_PROGRESS' | 'READY' | 'DELIVERED' | 'CANCELLED';
export type TrUrgency = 'STANDARD' | 'EXPRESS';
export type TrDelivery = 'DIGITAL' | 'PICKUP' | 'COURIER';

export const SERVICES: TrService[] = ['TRANSLATION', 'TRANSLATION_APOSTILLE', 'APOSTILLE', 'NOTARY'];
export const STATUSES: TrStatus[] = ['NEW', 'QUOTED', 'ACCEPTED', 'IN_PROGRESS', 'READY', 'DELIVERED', 'CANCELLED'];
export const FLOW: TrStatus[] = ['NEW', 'QUOTED', 'ACCEPTED', 'IN_PROGRESS', 'READY', 'DELIVERED'];
export const DELIVERIES: TrDelivery[] = ['DIGITAL', 'PICKUP', 'COURIER'];

export interface TrPricing {
  currency: string;
  perPage: Record<TrService, number>;
  expressSurchargePct: number;
  languages: string[];
  documentTypes: string[];
}

export interface TrFile {
  id: string;
  kind: 'SOURCE' | 'RESULT';
  filename: string;
  mimeType: string;
  size: number;
  fromCase: boolean;
  documentId: string | null;
  createdAt: string;
}

export interface TrOrderBase {
  id: string;
  number: number;
  key: string;
  caseId: string | null;
  service: TrService;
  sourceLang: string;
  targetLang: string;
  documentTypes: string[];
  pages: number;
  urgency: TrUrgency;
  status: TrStatus;
  priceCents: number | null;
  currency: string;
  quoteNote: string | null;
  dueAt: string | null;
  deliveryMethod: TrDelivery;
  deliveryAddress: string | null;
  trackingNumber: string | null;
  clientNote: string | null;
  acceptedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  overdue: boolean;
  case: { id: string; number: string } | null;
  files: TrFile[];
}

export interface TrClientOrder extends TrOrderBase {
  events: { id: string; status: TrStatus | null; note: string | null; createdAt: string; byStaff: boolean }[];
}

export interface TrPerson {
  id: string;
  firstName: string;
  lastName: string;
}

export interface TrStaffOrder extends TrOrderBase {
  staffNote: string | null;
  client: TrPerson & { email: string; phone: string | null; locale: string };
  assignedStaff: TrPerson | null;
  events: {
    id: string;
    status: TrStatus | null;
    note: string | null;
    visibleToClient: boolean;
    createdAt: string;
    actor: (TrPerson & { role: string }) | null;
  }[];
}

export const fileUrl = (id: string, download = false) => `/api/translations/files/${id}${download ? '?download=1' : ''}`;

// ─── Formatting ───────────────────────────────────────────────────────────

const INTL: Record<string, string> = { az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' };

export const useTrFormat = () => {
  const { t, i18n } = useTranslation();
  const lng = (i18n.resolvedLanguage ?? 'az').slice(0, 2);
  const intl = INTL[lng] ?? 'en-GB';

  const money = useCallback(
    (cents: number, currency: string) => {
      try {
        return new Intl.NumberFormat(intl, { style: 'currency', currency }).format(cents / 100);
      } catch {
        return `${(cents / 100).toFixed(2)} ${currency}`;
      }
    },
    [intl],
  );
  const day = useCallback((iso: string | null | undefined) => (iso ? new Intl.DateTimeFormat(intl, { dateStyle: 'medium' }).format(new Date(iso)) : '—'), [intl]);
  const dateTime = useCallback(
    (iso: string) => new Intl.DateTimeFormat(intl, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)),
    [intl],
  );
  const lang = useCallback(
    (code: string) => {
      try {
        const name = new Intl.DisplayNames([intl], { type: 'language' }).of(code);
        return name ? name.charAt(0).toLocaleUpperCase(intl) + name.slice(1) : code.toUpperCase();
      } catch {
        return code.toUpperCase();
      }
    },
    [intl],
  );
  const docType = useCallback((code: string) => (i18n.exists(`trOrders.docTypes.${code}`) ? t(`trOrders.docTypes.${code}`) : code), [t, i18n]);
  return { money, day, dateTime, lang, docType };
};

/** Toast with the translated server error (trOrders.errors.CODE, then portal.errors.CODE). */
export const useTrError = () => {
  const { t, i18n } = useTranslation();
  return useCallback(
    (err: unknown) => {
      const code = errorCode(err);
      const key = [`trOrders.errors.${code}`, `portal.errors.${code}`].find((k) => i18n.exists(k));
      toast.error(key ? t(key) : t('common.error'));
    },
    [t, i18n],
  );
};

// ─── Status pill and stepper ──────────────────────────────────────────────

export const STATUS_TONE: Record<TrStatus, string> = { ...toneClasses(STATUS_TONES.translation), DELIVERED: 'bg-success text-white' };

export const TrStatusPill = ({ status, className }: { status: TrStatus; className?: string }) => {
  const { t } = useTranslation();
  return (
    <span className={clsx('badge whitespace-nowrap', STATUS_TONE[status], className)}>
      <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden />
      {t(`trOrders.status.${status}`)}
    </span>
  );
};

/** Horizontal progress through NEW → … → DELIVERED (cancelled orders show where they stopped). */
export const TrStepper = ({ status, compact, reached }: { status: TrStatus; compact?: boolean; reached?: TrStatus[] }) => {
  const { t } = useTranslation();
  const idx = status === 'CANCELLED' ? Math.max(...(reached ?? ['NEW']).map((s) => FLOW.indexOf(s))) : FLOW.indexOf(status);
  return (
    <ol className={clsx('flex w-full items-start', compact ? 'gap-1' : 'gap-1.5')} aria-label={t(`trOrders.status.${status}`)}>
      {FLOW.map((s, i) => {
        const done = i < idx || (i === idx && status === 'DELIVERED');
        const current = i === idx && status !== 'DELIVERED' && status !== 'CANCELLED';
        return (
          <li key={s} className="flex min-w-0 flex-1 flex-col gap-1.5" aria-current={current ? 'step' : undefined}>
            <span
              className={clsx(
                'h-1.5 rounded-full transition-colors',
                done ? 'bg-brand-600' : current ? 'bg-brand-400' : status === 'CANCELLED' && i <= idx ? 'bg-slate-400' : 'bg-line',
              )}
            />
            {!compact && (
              <span className={clsx('hidden truncate text-[11px] font-semibold sm:block', done || current ? 'text-ink' : 'text-muted')}>
                {done && <Check className="mr-0.5 inline size-3 text-brand-600" aria-hidden />}
                {t(`trOrders.status.${s}`)}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
};

// ─── File rows ────────────────────────────────────────────────────────────

export const TrFileRow = ({ file, onRemove, busy }: { file: TrFile; onRemove?: () => void; busy?: boolean }) => {
  const { t } = useTranslation();
  const Icon = file.mimeType.startsWith('image/') ? ImageIcon : FileText;
  return (
    <li className="flex items-center gap-3 rounded-xl border border-line bg-surface/60 px-3 py-2.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-100 text-brand-600">
        <Icon className="size-4.5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <a href={fileUrl(file.id)} target="_blank" rel="noreferrer" className="block truncate text-sm font-semibold text-ink hover:text-brand-700">
          {file.filename}
        </a>
        <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
          {formatBytes(file.size)}
          {file.fromCase && (
            <span className="inline-flex items-center gap-1 text-brand-700">
              <FolderOpen className="size-3" aria-hidden /> {t('trOrders.detail.fromCaseBadge')}
            </span>
          )}
        </span>
      </span>
      <a href={fileUrl(file.id, true)} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-card hover:text-brand-700" aria-label={`${t('trOrders.detail.download')}: ${file.filename}`}>
        <Download className="size-4" aria-hidden />
      </a>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          className="grid size-9 place-items-center rounded-lg text-muted hover:bg-red-50 hover:text-danger disabled:opacity-50"
          aria-label={`${t('trOrders.detail.remove')}: ${file.filename}`}
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      )}
    </li>
  );
};
