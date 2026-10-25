import type { ReactNode } from 'react';
import { STATUS_TONES, TONE_CLASS, toneClasses } from '@/components/ui/status';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import type { CaseStatus } from '@/lib/types';
import { STEPS, type CommissionStatus, type PortalStep } from './api';

/** Building blocks of the referral-partner portal (same look as the agent portal). */

export const Section = ({ title, icon: Icon, actions, children, className }: { title?: ReactNode; icon?: LucideIcon; actions?: ReactNode; children: ReactNode; className?: string }) => (
  <section className={clsx('card min-w-0 p-5 sm:p-6', className)}>
    {(title || actions) && (
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        {title && (
          <h2 className="type-section-title flex items-center gap-2 text-ink">
            {Icon && <Icon className="size-5 text-primary" aria-hidden />} {title}
          </h2>
        )}
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
    )}
    {children}
  </section>
);

export const Loading = () => {
  const { t } = useTranslation();
  return (
    <div className="grid min-h-[30vh] place-items-center text-primary" role="status" aria-label={t('partnerPortal.common.loading')}>
      <Spinner className="size-8 border-[3px]" />
    </div>
  );
};

export const ErrorRetry = ({ onRetry }: { onRetry: () => void }) => {
  const { t } = useTranslation();
  return (
    <Section>
      <p className="text-sm text-muted">{t('partnerPortal.common.error')}</p>
      <button type="button" className="btn-ghost btn-sm mt-4" onClick={onRetry}>
        {t('partnerPortal.common.retry')}
      </button>
    </Section>
  );
};

/** KPI tile (same look as the design-system StatTile); `tone` colours the icon chip. */
export const Kpi = ({ label, value, icon: Icon, tone = 'chip-sky text-ink', hint }: { label: string; value: ReactNode; icon: LucideIcon; tone?: string; hint?: ReactNode }) => (
  <div className="flex h-full items-start justify-between gap-3 rounded-2xl border border-line bg-card p-4 shadow-[var(--tv-shadow-card)] sm:p-5">
    <div className="min-w-0">
      <p className="text-xs leading-snug font-medium text-muted">{label}</p>
      <p className="num mt-1.5 truncate text-xl leading-tight font-semibold tracking-[-0.02em] text-ink sm:text-2xl">{typeof value === 'number' ? <AnimatedNumber value={value} /> : value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
    <span className={clsx('grid size-10 shrink-0 place-items-center rounded-xl', tone)}>
      <Icon className="size-5" aria-hidden />
    </span>
  </div>
);

const STATUS_TONE: Record<CaseStatus, string> = toneClasses(STATUS_TONES.case);

export const StatusPill = ({ status }: { status: CaseStatus }) => {
  const { t } = useTranslation();
  return <span className={clsx('badge whitespace-nowrap', STATUS_TONE[status])}>{t(`partnerPortal.status.${status}`)}</span>;
};

const COMMISSION_TONE: Record<CommissionStatus, string> = { ...toneClasses(STATUS_TONES.commission), CANCELLED: `${TONE_CLASS.danger} line-through` };

export const CommissionPill = ({ status }: { status: CommissionStatus }) => {
  const { t } = useTranslation();
  return <span className={clsx('badge whitespace-nowrap', COMMISSION_TONE[status])}>{t(`partnerPortal.commissions.statusLabel.${status}`)}</span>;
};

/** Five dots for the journey (documents → contract → embassy → appointment → decision). */
export const StepBar = ({ step, status }: { step: PortalStep; status: CaseStatus }) => {
  const { t } = useTranslation();
  const idx = step === 'DONE' ? STEPS.length : STEPS.indexOf(step);
  const failed = status === 'REJECTED' || status === 'CANCELLED';
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1" aria-hidden>
        {STEPS.map((s, i) => (
          <span
            key={s}
            className={clsx(
              'h-1.5 flex-1 rounded-full',
              i < idx ? (failed && step === 'DONE' ? 'bg-muted/40' : 'bg-success') : i === idx ? 'bg-primary' : 'bg-line',
            )}
          />
        ))}
      </div>
      <p className="mt-1 text-[11px] text-muted">
        {step === 'DONE' ? t('partnerPortal.step.DONE') : `${t('partnerPortal.stepOf', { n: idx + 1 })} · ${t(`partnerPortal.step.${step}`)}`}
      </p>
    </div>
  );
};
