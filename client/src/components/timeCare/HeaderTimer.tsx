import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Square, Timer } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { isStaffRole } from '@/lib/types';
import { fmtDuration, useCurrentTimer, useStopTimer } from './api';

const safeGet = (k: string) => {
  try {
    return sessionStorage.getItem(k);
  } catch {
    return null;
  }
};
const safeSet = (k: string) => {
  try {
    sessionStorage.setItem(k, '1');
  } catch {
    /* private mode */
  }
};

/** Elapsed minutes since `iso`, refreshed every 20 s. */
const useElapsed = (iso: string | undefined) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!iso) return;
    const id = window.setInterval(() => setNow(Date.now()), 20_000);
    return () => window.clearInterval(id);
  }, [iso]);
  return iso ? Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000)) : 0;
};

/**
 * Admin / workspace header: the running timer (case number, elapsed time, stop button). Lives in the
 * database, so it survives reloads and shows on every device. After 10 hours it asks "still working?".
 */
export function HeaderTimer() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const q = useCurrentTimer(isStaffRole(user?.role));
  const stop = useStopTimer();
  const run = q.data?.running ?? null;
  const elapsed = useElapsed(run?.startedAt);
  const [dismissed, setDismissed] = useState(false);

  // A timer the server stopped at 12 h: tell the user once per session.
  const auto = q.data?.autoStopped;
  useEffect(() => {
    if (auto && !safeGet(`tv_timer_auto_${auto.id}`)) {
      safeSet(`tv_timer_auto_${auto.id}`);
      toast.warning(t('time.autoStoppedToast'));
    }
  }, [auto, t]);

  if (!run) return null;
  const label = run.caseNumber ?? run.task?.key ?? t('time.noCase');
  const dur = fmtDuration(t, elapsed);
  const askIdle = run.idleWarning && !dismissed && !safeGet(`tv_timer_idle_${run.id}`);

  return (
    <div className="relative">
      <div className="flex min-h-9 items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 py-0.5 pr-0.5 pl-2.5 text-xs font-semibold text-emerald-800" role="status" aria-label={t('time.headerAria', { case: label, dur })}>
        <span className="relative mr-0.5 flex size-2" aria-hidden>
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:animate-none" />
          <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
        </span>
        <Timer className="hidden size-3.5 sm:block" aria-hidden />
        {run.caseId ? (
          <Link to={`/admin/cases/${run.caseId}`} className="max-w-[7rem] truncate hover:underline sm:max-w-[10rem]">
            {label}
          </Link>
        ) : (
          <span className="max-w-[7rem] truncate sm:max-w-[10rem]">{label}</span>
        )}
        <span className="tabular-nums whitespace-nowrap">{dur}</span>
        <button
          type="button"
          onClick={() => stop.mutate({})}
          disabled={stop.isPending}
          className="ml-0.5 grid size-8 place-items-center rounded-full bg-emerald-600 text-white transition hover:bg-emerald-700 disabled:opacity-60"
          aria-label={t('time.stop')}
          title={t('time.stop')}
        >
          <Square className="size-3 fill-current" aria-hidden />
        </button>
      </div>
      {askIdle && (
        <div role="alertdialog" aria-label={t('time.idle.title')} className="absolute top-full right-0 z-50 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-amber-300 bg-card p-3 text-left shadow-lg">
          <p className="text-sm font-bold text-ink">{t('time.idle.title')}</p>
          <p className="mt-1 text-xs text-muted">{t('time.idle.text', { hours: Math.floor(elapsed / 60) })}</p>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => {
                safeSet(`tv_timer_idle_${run.id}`);
                setDismissed(true);
              }}
            >
              {t('time.idle.keep')}
            </button>
            <button type="button" className="btn-primary btn-sm" onClick={() => stop.mutate({})}>
              {t('time.idle.stop')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default HeaderTimer;
