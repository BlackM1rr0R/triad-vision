import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import type { AgentStatus, CommissionStatus, CommissionType, PayoutEvent, Stage } from './types';

export interface AgentMe {
  agent: {
    code: string;
    region: string | null;
    company: string | null;
    status: AgentStatus;
    commissionType: CommissionType;
    commissionValue: number;
    currency: string;
    payoutEvents: PayoutEvent[];
    iban: string | null;
    createdAt: string;
  };
  user: { firstName: string; lastName: string; email: string; phone: string | null; locale: string };
  shareLink: string;
}

export interface AgentDashboard {
  status: AgentStatus;
  currency: string;
  counts: { referrals: number; registeredThisMonth: number; activeCases: number; approvedVisas: number };
  earnings: { pendingCents: number; approvedCents: number; paidCents: number };
  series: { month: string; referrals: number; earningsCents: number }[];
}

export interface AgentReferralRow {
  key: string;
  name: string;
  registeredAt: string;
  stage: Stage;
  earnedCents: number;
}

export interface AgentCommissionRow {
  id: string;
  createdAt: string;
  event: string;
  amountCents: number;
  currency: string;
  status: CommissionStatus;
  approvedAt: string | null;
  paidAt: string | null;
  payoutRef: string | null;
  note: string | null;
  client: string | null;
}

export const useAgentMe = () =>
  useQuery({ queryKey: ['agent-me'], queryFn: async () => (await api.get<AgentMe>('/agent/me')).data, staleTime: 60_000, retry: false });

/** Card section of the agent portal. */
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
    <div className="grid min-h-[30vh] place-items-center text-primary" role="status" aria-label={t('agents.common.loading')}>
      <Spinner className="size-8 border-[3px]" />
    </div>
  );
};

export const ErrorRetry = ({ onRetry }: { onRetry: () => void }) => {
  const { t } = useTranslation();
  return (
    <Section>
      <p className="text-sm text-muted">{t('agents.common.error')}</p>
      <button type="button" className="btn-ghost btn-sm mt-4" onClick={onRetry}>
        {t('agents.common.retry')}
      </button>
    </Section>
  );
};

export const Pager = ({ page, total, pageSize, onPage }: { page: number; total: number; pageSize: number; onPage: (p: number) => void }) => {
  const { t } = useTranslation();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-end gap-2 text-sm">
      <button type="button" className="grid size-11 place-items-center rounded-xl border border-line-strong bg-card text-ink transition-colors hover:bg-sunken disabled:opacity-40 sm:size-10" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={t('agents.common.prev')}>
        <ChevronLeft className="size-4" />
      </button>
      <span className="num text-muted">{t('agents.common.page', { page, pages })}</span>
      <button type="button" className="grid size-11 place-items-center rounded-xl border border-line-strong bg-card text-ink transition-colors hover:bg-sunken disabled:opacity-40 sm:size-10" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label={t('agents.common.next')}>
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
};
