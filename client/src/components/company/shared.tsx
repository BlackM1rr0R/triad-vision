import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { TONE_CLASS } from '@/components/ui/status';
import { EmptyState as UiEmptyState } from '@/components/ui/EmptyState';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import type { Company } from '@/components/jobs/types';

export const useCompany = () =>
  useQuery({
    queryKey: ['company-me'],
    queryFn: async () => (await api.get<{ company: Company }>('/company/me')).data.company,
    staleTime: 60_000,
  });

/** White section card used throughout the employer portal. */
export const Section = ({
  title,
  icon: Icon,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) => (
  <section className={clsx('card min-w-0 p-5 sm:p-6', className)}>
    {(title || actions) && (
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        {title && (
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-navy-900">
            {Icon && <Icon className="size-5 text-brand-600" aria-hidden />} {title}
          </h2>
        )}
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
    )}
    {children}
  </section>
);

/** Employer-portal empty state: the design-system EmptyState with the brand-tinted icon; `children` is the action. */
export const Empty = ({ icon, title, text, children }: { icon: LucideIcon; title: string; text?: string; children?: ReactNode }) => (
  <UiEmptyState icon={icon} title={title} text={text} action={children} tone="brand" />
);

export const Kpi = ({ label, value, hint, icon: Icon, tone }: { label: string; value: ReactNode; hint?: string; icon: LucideIcon; tone?: 'brand' | 'good' | 'warn' | 'violet' }) => (
  <div className="card flex items-start justify-between gap-3 p-4 sm:p-5">
    <div className="min-w-0">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-extrabold text-navy-900 tabular-nums sm:text-3xl">{typeof value === 'number' ? <AnimatedNumber value={value} /> : value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
    </div>
    <span
      className={clsx(
        'grid size-10 shrink-0 place-items-center rounded-xl',
        TONE_CLASS[tone === 'good' ? 'success' : tone === 'warn' ? 'warning' : tone === 'violet' ? 'accent' : 'brand'],
      )}
    >
      <Icon className="size-5" aria-hidden />
    </span>
  </div>
);

export const Loading = () => (
  <div className="grid min-h-[30vh] place-items-center">
    <span className="size-8 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-600" />
  </div>
);
