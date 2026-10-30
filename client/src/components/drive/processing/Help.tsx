import { useTranslation } from 'react-i18next';
import clsx from 'clsx';

/** The short help panel of the group (German stage names stay as labels). */
export const WorkflowHelp = ({ className }: { className?: string }) => {
  const { t } = useTranslation();
  const steps = t('driveProcessing.help.steps', { returnObjects: true }) as unknown;
  return (
    <div className={clsx('rounded-lg bg-sunken px-3 py-2 text-[11px] leading-snug text-ink/80', className)}>
      <p className="mb-1 font-semibold text-ink">{t('driveProcessing.help.title')}</p>
      <ol className="list-decimal space-y-0.5 pl-4">{Array.isArray(steps) && steps.map((s, i) => <li key={i}>{String(s)}</li>)}</ol>
      <p className="mt-1 text-muted">{t('driveProcessing.help.dnd')}</p>
    </div>
  );
};
