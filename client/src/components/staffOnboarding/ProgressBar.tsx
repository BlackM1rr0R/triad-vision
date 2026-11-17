import clsx from 'clsx';

/** Thin progress bar (training / setup checklists). */
export const ProgressBar = ({ percent, label }: { percent: number; label: string }) => (
  <div className="h-2 w-full overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={label}>
    <div className={clsx('h-full rounded-full transition-all', percent >= 100 ? 'bg-success-fg' : 'bg-primary')} style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
  </div>
);
