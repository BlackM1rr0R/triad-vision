import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Compass } from 'lucide-react';
import { ruleText, TONE_STYLE, type NextStepSummary } from './api';

/** Compact "Next step" of a cases-list row (server rules only). */
export const NextStepChip = ({ step, className }: { step: NextStepSummary | null | undefined; className?: string }) => {
  const { t } = useTranslation();
  if (!step) return <span className={clsx('text-xs text-muted', className)}>—</span>;
  const text = ruleText(t, step);
  return (
    <span className={clsx('inline-flex max-w-full items-start gap-1 rounded-md px-1.5 py-1 text-[11px] leading-snug font-semibold ring-1', TONE_STYLE[step.tone], className)} title={text}>
      <Compass className="mt-px size-3 shrink-0" aria-hidden />
      <span className="line-clamp-2 min-w-0">{text}</span>
      {step.more > 0 && <span className="shrink-0 opacity-70">{t('caseNext.chip.more', { count: step.more })}</span>}
    </span>
  );
};
