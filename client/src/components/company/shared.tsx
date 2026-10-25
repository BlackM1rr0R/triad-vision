import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { EmptyState as UiEmptyState } from '@/components/ui/EmptyState';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import type { Company } from '@/components/jobs/types';

export const useCompany = () =>
  useQuery({
    queryKey: ['company-me'],
    queryFn: async () => (await api.get<{ company: Company }>('/company/me')).data.company,
    staleTime: 60_000,
  });

/** Section card used throughout the employer portal. */
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

/** Employer-portal empty state: the design-system EmptyState (optional illustration replaces the icon); `children` is the action. */
export const Empty = ({ icon, illustration, title, text, children }: { icon: LucideIcon; illustration?: ReactNode; title: string; text?: string; children?: ReactNode }) => (
  <UiEmptyState icon={icon} illustration={illustration} title={title} text={text} action={children} tone="brand" />
);

const KPI_CHIP = { brand: 'chip-sky', good: 'chip-sage', warn: 'chip-peach', violet: 'chip-soft' } as const;

/** KPI tile (same look as the design-system StatTile, with a soft icon chip). */
export const Kpi = ({ label, value, hint, icon: Icon, tone }: { label: string; value: ReactNode; hint?: string; icon: LucideIcon; tone?: 'brand' | 'good' | 'warn' | 'violet' }) => (
  <div className="flex h-full items-start justify-between gap-3 rounded-2xl border border-line bg-card p-4 shadow-[var(--tv-shadow-card)] sm:p-5">
    <div className="min-w-0">
      <p className="text-xs leading-snug font-medium text-muted">{label}</p>
      <p className="num mt-1.5 text-2xl leading-tight font-semibold tracking-[-0.02em] text-ink sm:text-[1.75rem]">{typeof value === 'number' ? <AnimatedNumber value={value} /> : value}</p>
      {hint && <p className="mt-1 text-xs leading-snug text-muted">{hint}</p>}
    </div>
    <span className={clsx('grid size-10 shrink-0 place-items-center rounded-xl text-ink', KPI_CHIP[tone ?? 'brand'])}>
      <Icon className="size-5" aria-hidden />
    </span>
  </div>
);

export const Loading = () => (
  <div className="grid min-h-[30vh] place-items-center">
    <span className="size-8 animate-spin rounded-full border-[3px] border-line-strong border-t-primary" />
  </div>
);
