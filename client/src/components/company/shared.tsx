import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { api } from '@/lib/api';
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

export const Empty = ({ icon: Icon, title, text, children }: { icon: LucideIcon; title: string; text?: string; children?: ReactNode }) => (
  <div className="flex flex-col items-center px-4 py-10 text-center">
    <span className="grid size-12 place-items-center rounded-full bg-brand-50 text-brand-600">
      <Icon className="size-5" aria-hidden />
    </span>
    <p className="mt-3 font-semibold text-navy-900">{title}</p>
    {text && <p className="mt-1 max-w-md text-sm text-muted">{text}</p>}
    {children && <div className="mt-4">{children}</div>}
  </div>
);

export const Kpi = ({ label, value, hint, icon: Icon, tone }: { label: string; value: ReactNode; hint?: string; icon: LucideIcon; tone?: 'brand' | 'good' | 'warn' | 'violet' }) => (
  <div className="card flex items-start justify-between gap-3 p-4 sm:p-5">
    <div className="min-w-0">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-extrabold text-navy-900 tabular-nums sm:text-3xl">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
    </div>
    <span
      className={clsx(
        'grid size-10 shrink-0 place-items-center rounded-xl',
        tone === 'good' ? 'bg-emerald-100 text-emerald-700' : tone === 'warn' ? 'bg-amber-100 text-amber-700' : tone === 'violet' ? 'bg-violet-100 text-violet-700' : 'bg-brand-100 text-brand-700',
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
