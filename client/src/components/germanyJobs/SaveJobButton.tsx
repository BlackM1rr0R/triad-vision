import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Heart } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesGermanyJobAlerts } from '@/i18n/pagesGermanyJobAlerts';
import { errorCode } from '@/lib/api';
import type { SavedGermanyJob } from '@/lib/germanyJobs';
import { useSavedJobs } from './savedJobs';

registerCopy(pagesGermanyJobAlerts);

/**
 * "Heart" of a Germany job listing (search card, apply dialog): a toggle button (aria-pressed). Visitors save in
 * the browser, signed-in clients in their account (components/germanyJobs/savedJobs.ts).
 */
export const SaveJobButton = ({ job, className, withLabel = false }: { job: SavedGermanyJob; className?: string; withLabel?: boolean }) => {
  const { t } = useTranslation();
  const saved = useSavedJobs();
  const [busy, setBusy] = useState(false);
  const on = saved.isSaved(job.id);

  const click = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const ok = await saved.toggle(job);
      if (!ok) toast.message(t('gjSaved.full'));
      else if (!on) toast.success(saved.account ? t('gjSaved.savedAccount') : t('gjSaved.savedLocal'));
    } catch (err) {
      toast.error(errorCode(err) === 'TOO_MANY_SAVED' ? t('gjSaved.full') : t('gjSaved.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void click()}
      aria-pressed={on}
      disabled={busy}
      title={on ? t('gjSaved.unsave') : t('gjSaved.save')}
      className={clsx(
        'inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-full border text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card focus-visible:outline-none disabled:opacity-60',
        withLabel ? 'px-3.5' : 'size-10',
        on ? 'border-danger-border bg-danger-bg text-danger-fg' : 'border-line-strong bg-card text-ink hover:bg-sunken',
        className,
      )}
    >
      <Heart className={clsx('size-4', on && 'fill-current')} aria-hidden />
      {withLabel ? <span>{on ? t('gjSaved.saved') : t('gjSaved.save')}</span> : <span className="sr-only">{on ? t('gjSaved.unsave') : t('gjSaved.save')}</span>}
      <span className="sr-only">: {job.title}</span>
    </button>
  );
};
