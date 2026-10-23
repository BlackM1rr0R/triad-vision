import { useState } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CalendarClock, X } from 'lucide-react';
import { api } from '@/lib/api';
import { STATUS_TONES, toneClasses } from '@/components/ui/status';
import { registerCopy } from '@/i18n';
import { pagesExpiry } from '@/i18n/pagesExpiry';
import { useL10n } from '@/lib/l10n';

registerCopy(pagesExpiry);

/**
 * Document validity chip (green / amber / red) and the staff date editor. The colour thresholds follow
 * the server's warning windows (server/src/lib/expiry/rules.ts): passports turn amber 6 months and red
 * 1 month before the date, other documents 60 and 7 days before.
 */

export type ExpiryTone = 'ok' | 'soon' | 'urgent' | 'expired';

const WINDOWS: Record<'passport' | 'default', { soon: number; urgent: number }> = {
  passport: { soon: 180, urgent: 30 },
  default: { soon: 60, urgent: 7 },
};

const DAY = 24 * 60 * 60 * 1000;

export const expiryState = (expiresAt: string, key?: string | null, now = Date.now()) => {
  const days = Math.ceil((new Date(expiresAt).getTime() - now) / DAY);
  const w = WINDOWS[key === 'PASSPORT' ? 'passport' : 'default'];
  const tone: ExpiryTone = days <= 0 ? 'expired' : days <= w.urgent ? 'urgent' : days <= w.soon ? 'soon' : 'ok';
  return { days, tone };
};

export const TONE_CLASS: Record<ExpiryTone, string> = { ...toneClasses(STATUS_TONES.expiry), expired: 'bg-danger text-white' };

/** "valid until 12 Mar 2027 · 40 days left" with the tone colour; nothing when there is no date. */
export const ExpiryChip = ({ expiresAt, requirementKey, className }: { expiresAt?: string | null; requirementKey?: string | null; className?: string }) => {
  const { t } = useTranslation();
  const { date } = useL10n();
  if (!expiresAt) return null;
  const { days, tone } = expiryState(expiresAt, requirementKey);
  const label = tone === 'expired' ? t('expiry.chip.expired') : tone === 'ok' ? t('expiry.chip.until', { date: date(expiresAt) }) : t('expiry.chip.daysLeft', { count: days });
  return (
    <span className={clsx('badge inline-flex items-center gap-1 whitespace-nowrap', TONE_CLASS[tone], className)} title={`${t('expiry.chip.title')}: ${date(expiresAt)}`}>
      <CalendarClock className="size-3" aria-hidden />
      {label}
    </span>
  );
};

/** Short hint for the client under a document that expires soon or expired. */
export const ExpiryHint = ({ expiresAt, requirementKey }: { expiresAt?: string | null; requirementKey?: string | null }) => {
  const { t } = useTranslation();
  if (!expiresAt) return null;
  const { tone } = expiryState(expiresAt, requirementKey);
  if (tone === 'ok') return null;
  return (
    <p className={clsx('mt-1 text-xs', tone === 'soon' ? 'text-amber-700' : 'text-danger')}>{tone === 'expired' ? t('expiry.hint.expired') : t('expiry.hint.soon')}</p>
  );
};

/** Staff: chip + inline date picker to set or clear the validity date of a case document. */
export const ExpiryEditor = ({
  caseId,
  docId,
  expiresAt,
  requirementKey,
  onSaved,
}: {
  caseId: string;
  docId: string;
  expiresAt?: string | null;
  requirementKey?: string | null;
  onSaved: () => Promise<unknown> | void;
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(expiresAt ? expiresAt.slice(0, 10) : '');
  const [busy, setBusy] = useState(false);

  const save = async (next: string | null) => {
    setBusy(true);
    try {
      await api.patch(`/admin/cases/${caseId}/documents/${docId}/expiry`, { expiresAt: next });
      await onSaved();
      toast.success(next ? t('expiry.editor.saved') : t('expiry.editor.cleared'));
      setOpen(false);
    } catch (err) {
      const code = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(code ?? String(err));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    const label = expiresAt ? t('expiry.editor.edit') : t('expiry.editor.set');
    return (
      <span className="inline-flex items-center gap-0.5">
        <ExpiryChip expiresAt={expiresAt} requirementKey={requirementKey} />
        <button
          type="button"
          onClick={() => {
            setValue(expiresAt ? expiresAt.slice(0, 10) : '');
            setOpen(true);
          }}
          className="inline-flex min-h-8 items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold text-muted transition hover:bg-brand-50 hover:text-brand-700"
          title={label}
          aria-label={label}
        >
          <CalendarClock className="size-3.5" aria-hidden />
          {!expiresAt && label}
        </button>
      </span>
    );
  }

  return (
    <form
      className="inline-flex flex-wrap items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (value) void save(value);
      }}
    >
      <label className="sr-only" htmlFor={`exp-${docId}`}>
        {t('expiry.editor.label')}
      </label>
      <input id={`exp-${docId}`} type="date" className="input h-8 w-auto px-2 py-0 text-xs" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
      <button type="submit" className="btn-primary btn-sm" disabled={!value || busy}>
        {t('expiry.editor.save')}
      </button>
      {expiresAt && (
        <button type="button" className="btn-secondary btn-sm text-danger" disabled={busy} onClick={() => void save(null)}>
          {t('expiry.editor.clear')}
        </button>
      )}
      <button type="button" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface" onClick={() => setOpen(false)} aria-label={t('expiry.editor.cancel')}>
        <X className="size-3.5" />
      </button>
    </form>
  );
};
