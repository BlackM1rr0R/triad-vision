import { useRef, useState } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Camera, CheckCircle2, Circle, RefreshCw, ScanFace, X, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesOfficialForms } from '@/i18n/pagesOfficialForms';
import { TONE_CLASS } from '@/components/ui/status';
import { Spinner } from '@/components/ui/Spinner';

registerCopy(pagesOfficialForms);

/** Biometric passport photo check (server lib/photoCheck), stored on Document.photoCheck. */
export interface PhotoCheckItem {
  key: string;
  ok: boolean;
  value: string | number | null;
  expected: string;
  severity: 'error' | 'warning' | 'info';
  approximate?: boolean;
}
export interface PhotoCheck {
  ok: boolean;
  level: 'OK' | 'WARN' | 'BAD';
  checks: PhotoCheckItem[];
  width: number | null;
  height: number | null;
  checkedAt: string;
}

export const PHOTO_KEYS = ['PHOTO', 'PHOTO_2'];

/** The photo check of an upload response / document, or null. */
export const photoCheckOf = (v: unknown): PhotoCheck | null => {
  const o = (v as { photoCheck?: unknown } | null)?.photoCheck ?? v;
  return o && typeof o === 'object' && Array.isArray((o as PhotoCheck).checks) ? (o as PhotoCheck) : null;
};

const TONE = { OK: 'success', WARN: 'warning', BAD: 'danger' } as const;

/**
 * Checklist shown to the client right after a biometric photo upload (next to the scan-quality notice): every
 * rule with ✓ / ⚠ / ✗, the measured value and a tip for each failed rule, plus "Choose another photo".
 */
export const PhotoCheckNotice = ({ check, onRetake, onDismiss, className, compact }: { check: PhotoCheck | null; onRetake?: (file: File) => void; onDismiss?: () => void; className?: string; compact?: boolean }) => {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState(!compact);
  if (!check) return null;
  const failed = check.checks.filter((c) => !c.ok);
  const Icon = check.level === 'OK' ? CheckCircle2 : check.level === 'WARN' ? AlertTriangle : XCircle;
  return (
    <div role="status" className={clsx('rounded-lg border px-3 py-2.5 text-sm', check.level === 'OK' ? 'border-green-200 bg-green-50/60' : check.level === 'WARN' ? 'border-amber-200 bg-amber-50' : 'border-red-200 bg-red-50', className)}>
      <div className="flex items-start gap-2">
        <Icon className={clsx('mt-0.5 size-4 shrink-0', check.level === 'OK' ? 'text-success' : check.level === 'WARN' ? 'text-amber-600' : 'text-danger')} aria-hidden />
        <div className="min-w-0 flex-1">
          <button type="button" className="text-left font-semibold text-navy-900" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
            {t(`photoCheck.title.${check.level}`)}
          </button>
          {expanded && (
            <>
              <p className="mt-1 text-xs text-muted">{t('photoCheck.intro')}</p>
              <ul className="mt-1.5 space-y-1 text-xs">
                {check.checks.map((c) => {
                  const ItemIcon = c.ok ? CheckCircle2 : c.severity === 'error' ? XCircle : c.severity === 'warning' ? AlertTriangle : Circle;
                  return (
                    <li key={c.key} className="flex gap-1.5">
                      <ItemIcon className={clsx('mt-0.5 size-3.5 shrink-0', c.ok ? 'text-success' : c.severity === 'error' ? 'text-danger' : 'text-amber-600')} aria-hidden />
                      <div className="min-w-0">
                        <span className={clsx(!c.ok && 'font-medium text-navy-900')}>{t(`photoCheck.keys.${c.key}`, { defaultValue: c.key })}</span>
                        {c.approximate && <span className="ml-1 text-[10px] text-muted uppercase">({t('photoCheck.approximate')})</span>}
                        {!c.ok && (
                          <>
                            <p className="text-muted">{t(`photoCheck.tips.${c.key}`, { defaultValue: '' })}</p>
                            {c.value !== null && <p className="text-[11px] text-muted">{t('photoCheck.value', { value: c.value, expected: c.expected })}</p>}
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {check.checks.some((c) => c.approximate) && <p className="mt-1.5 text-[11px] text-muted">{t('photoCheck.approxNote')}</p>}
            </>
          )}
          {onRetake && failed.length > 0 && (
            <div className="mt-2">
              <input
                ref={input}
                type="file"
                accept="image/jpeg,image/png"
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) onRetake(f);
                }}
              />
              <button type="button" className="btn-secondary btn-sm" onClick={() => input.current?.click()}>
                <Camera className="size-4" aria-hidden />
                {t('photoCheck.retake')}
              </button>
            </div>
          )}
        </div>
        {onDismiss && (
          <button type="button" onClick={onDismiss} className="grid size-8 shrink-0 place-items-center rounded-md opacity-70 hover:opacity-100" aria-label={t('photoCheck.dismiss')} title={t('photoCheck.dismiss')}>
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
};

/** Staff: compact badge in document review (tooltip lists the failed rules) with "check again". */
export const PhotoCheckBadge = ({ check, caseId, docId, onChecked }: { check: PhotoCheck | null; caseId?: string; docId?: string; onChecked?: (c: PhotoCheck) => void }) => {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState<PhotoCheck | null>(check);
  const c = current ?? check;
  const rerun = async () => {
    if (!caseId || !docId) return;
    setBusy(true);
    try {
      const { data } = await api.post<{ photoCheck: PhotoCheck }>(`/admin/cases/${caseId}/documents/${docId}/photo-check`);
      setCurrent(data.photoCheck);
      onChecked?.(data.photoCheck);
    } catch {
      /* the badge stays as it was */
    } finally {
      setBusy(false);
    }
  };
  const failed = c?.checks.filter((x) => !x.ok).map((x) => t(`photoCheck.keys.${x.key}`, { defaultValue: x.key })) ?? [];
  return (
    <span className="inline-flex items-center gap-1">
      {c ? (
        <span className={clsx('badge whitespace-nowrap', TONE_CLASS[TONE[c.level]])} title={failed.join(' · ') || t(`photoCheck.title.${c.level}`)}>
          <ScanFace className="mr-1 inline size-3" aria-hidden />
          {t(`photoCheck.badge.${c.level}`)}
        </span>
      ) : null}
      {caseId && docId && (
        <button type="button" className="grid size-7 place-items-center rounded-md text-brand-600 hover:bg-brand-50" onClick={() => void rerun()} disabled={busy} aria-label={c ? t('photoCheck.recheck') : t('photoCheck.check')} title={c ? t('photoCheck.recheck') : t('photoCheck.check')}>
          {busy ? <Spinner className="size-3.5" /> : c ? <RefreshCw className="size-3.5" aria-hidden /> : <ScanFace className="size-3.5" aria-hidden />}
        </button>
      )}
    </span>
  );
};
