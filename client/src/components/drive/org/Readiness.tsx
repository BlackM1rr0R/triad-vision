import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlertCircle, CheckCircle2, Clock, FileQuestion } from 'lucide-react';
import { fetchReadiness, l10nText, orgKeys, type Readiness } from './api';

const ICON = { missing: FileQuestion, rejected: AlertCircle, pending: Clock, ready: CheckCircle2 } as const;
const TONE = { missing: 'text-muted', rejected: 'text-danger', pending: 'text-amber-600', ready: 'text-emerald-600' } as const;

/**
 * "12/15 sənəd hazır" in the client folder header: progress of the case's required documents (all stages),
 * with a popover listing what is missing, rejected or waiting for review — each links to the case page.
 */
export const ReadinessIndicator = ({ caseId }: { caseId: string }) => {
  const { t, i18n } = useTranslation();
  const q = useQuery({ queryKey: orgKeys.readiness(caseId), queryFn: () => fetchReadiness(caseId), staleTime: 30_000 });
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const r: Readiness | undefined = q.data;
  if (!r || r.total === 0) return null;
  const pct = Math.round((r.ready / r.total) * 100);
  const open_ = r.items.filter((i) => i.status !== 'ready');
  const order = { rejected: 0, missing: 1, pending: 2, ready: 3 } as const;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-md px-1.5 py-0.5 font-semibold hover:bg-white/60 dark:hover:bg-white/10"
        title={t('driveOrg.readiness.hint')}
      >
        <span className="h-1.5 w-20 overflow-hidden rounded-full bg-violet-200 dark:bg-violet-900/60" aria-hidden>
          <span className={clsx('block h-full rounded-full', pct === 100 ? 'bg-emerald-500' : 'bg-violet-600')} style={{ width: `${pct}%` }} />
        </span>
        {t('driveOrg.readiness.label', { ready: r.ready, total: r.total })}
      </button>
      {open && (
        <div className="absolute top-full left-0 z-30 mt-1 w-80 max-w-[90vw] rounded-xl border border-line bg-card p-3 text-xs text-ink shadow-xl">
          <p className="font-bold">{t('driveOrg.readiness.title', { number: r.caseNumber })}</p>
          <p className="mt-0.5 text-muted">{t('driveOrg.readiness.summary', { missing: r.missing, rejected: r.rejected, pending: r.pending })}</p>
          {open_.length ? (
            <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto">
              {[...open_]
                .sort((a, b) => order[a.status] - order[b.status])
                .map((i) => {
                  const Icon = ICON[i.status];
                  return (
                    <li key={i.id}>
                      <Link to={r.link} className="flex items-start gap-2 rounded-md px-1.5 py-1 hover:bg-surface">
                        <Icon className={clsx('mt-px size-3.5 shrink-0', TONE[i.status])} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{l10nText(i.title, i18n.language)}</span>
                          <span className={clsx('block', TONE[i.status])}>
                            {t(`driveOrg.readiness.${i.status}`)} · {t(`driveOrg.readiness.stage.${i.stage}`, { defaultValue: i.stage })}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
            </ul>
          ) : (
            <p className="mt-2 font-semibold text-emerald-600">{t('driveOrg.readiness.allReady')}</p>
          )}
          <Link to={r.link} className="mt-2 inline-block font-semibold text-brand-700 hover:underline dark:text-brand-300">
            {t('driveOrg.readiness.openCase')}
          </Link>
        </div>
      )}
    </div>
  );
};
