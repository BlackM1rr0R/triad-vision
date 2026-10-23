import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlertCircle, CalendarClock, ChevronRight, Gavel, Search, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { day } from '@/components/agents/format';
import type { PartnerCaseRow } from '@/components/partnerPortal/api';
import { ErrorRetry, Loading, Section, StatusPill, StepBar } from '@/components/partnerPortal/ui';
import { EmptyState } from '@/components/ui/EmptyState';

type Filter = 'all' | 'active' | 'closed';

export default function PartnerClientsPage() {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  useEffect(() => {
    const id = window.setTimeout(() => setSearch(input.trim()), 300);
    return () => window.clearTimeout(id);
  }, [input]);
  const q = useQuery({
    queryKey: ['partner-portal', 'cases', { search, filter }],
    queryFn: async () => (await api.get<{ items: PartnerCaseRow[] }>('/partner/cases', { params: { search: search || undefined, filter } })).data.items,
    placeholderData: keepPreviousData,
  });

  return (
    <Section title={t('partnerPortal.clients.title')} icon={Users}>
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <span className="sr-only">{t('partnerPortal.clients.searchPh')}</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input type="search" className="input pl-9" placeholder={t('partnerPortal.clients.searchPh')} value={input} onChange={(e) => setInput(e.target.value)} />
        </label>
        <div className="flex gap-1.5" role="group">
          {(['all', 'active', 'closed'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={clsx('min-h-10 rounded-full border px-3.5 text-sm font-semibold transition', filter === f ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-card text-ink hover:border-brand-400')}
            >
              {t(`partnerPortal.clients.filter.${f}`)}
            </button>
          ))}
        </div>
      </div>

      {q.isLoading ? (
        <Loading />
      ) : q.isError || !q.data ? (
        <ErrorRetry onRetry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <EmptyState
          title={search || filter !== 'all' ? t('partnerPortal.clients.notFound') : t('partnerPortal.clients.empty')}
          text={!search && filter === 'all' ? t('partnerPortal.clients.emptyHint') : undefined}
        />
      ) : (
        <ul className="space-y-3">
          {q.data.map((c) => (
            <li key={c.id}>
              <Link to={`/partner/clients/${c.id}`} className="group block rounded-2xl border border-line bg-card p-4 transition hover:border-brand-400/70 hover:shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink group-hover:text-brand-700">
                      {c.client.firstName} {c.client.lastName}
                    </p>
                    <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted">
                      <span className="font-mono">{c.number}</span>
                      {c.client.passport && (
                        <span>
                          {t('partnerPortal.clients.passport')}: <span className="font-mono">{c.client.passport}</span>
                        </span>
                      )}
                      <span>
                        {t(`partnerPortal.types.${c.visaType}`, { defaultValue: c.visaType })}
                        {c.visaCategory && ` · ${tr(c.visaCategory.title)} (${c.visaCategory.visaLabel})`}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill status={c.status} />
                    <ChevronRight className="size-4 text-muted" aria-hidden />
                  </div>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,14rem)_1fr] sm:items-end">
                  <StepBar step={c.step} status={c.status} />
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted sm:justify-end">
                    {c.appointmentAt && (
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="size-3.5" aria-hidden /> {t('partnerPortal.clients.appointment')}: {day(c.appointmentAt)}
                      </span>
                    )}
                    {c.decisionAt && (
                      <span className="inline-flex items-center gap-1">
                        <Gavel className="size-3.5" aria-hidden /> {t('partnerPortal.clients.decision')}: {day(c.decisionAt)}
                      </span>
                    )}
                  </div>
                </div>
                {c.nextAction !== 'NONE' && (
                  <p className={clsx('mt-3 flex items-start gap-1.5 rounded-lg px-3 py-2 text-xs font-medium', c.nextAction === 'UPLOAD_DOCUMENTS' ? 'bg-amber-50 text-amber-900' : 'bg-surface text-ink/80')}>
                    <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
                    <span>
                      {t('partnerPortal.clients.next')}: {t(`partnerPortal.nextAction.${c.nextAction}`)}
                      {c.missingDocuments > 0 && ` · ${t('partnerPortal.clients.missing', { count: c.missingDocuments })}`}
                    </span>
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
