import { useTranslation } from 'react-i18next';
import type { RequestProgress } from './types';

/** Stacked bar: accepted / interview / proposed against the requested quantity. */
export const RequestProgressBar = ({ progress, compact = false }: { progress: RequestProgress | null | undefined; compact?: boolean }) => {
  const { t } = useTranslation();
  if (!progress) return null;
  const q = Math.max(1, progress.quantity);
  const pct = (n: number) => `${Math.min(100, (n / q) * 100)}%`;
  const acc = Math.min(progress.accepted, q);
  const inter = Math.min(progress.interviewing, q - acc);
  const prop = Math.min(progress.proposed, q - acc - inter);
  return (
    <div className="min-w-0">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface ring-1 ring-line" role="img" aria-label={t('requests.progress.of', { accepted: progress.accepted, quantity: progress.quantity })}>
        <span className="h-full bg-emerald-500" style={{ width: pct(acc) }} />
        <span className="h-full bg-amber-400" style={{ width: pct(inter) }} />
        <span className="h-full bg-violet-400" style={{ width: pct(prop) }} />
      </div>
      {!compact && (
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
          <span className="font-semibold text-ink">{t('requests.progress.of', { accepted: progress.accepted, quantity: progress.quantity })}</span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full bg-amber-400" aria-hidden /> {t('requests.progress.interviewing')}: {progress.interviewing}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full bg-violet-400" aria-hidden /> {t('requests.progress.proposed')}: {progress.proposed}
          </span>
        </div>
      )}
    </div>
  );
};
