import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Archive, ExternalLink, Hourglass } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesExpiry } from '@/i18n/pagesExpiry';
import { useL10n } from '@/lib/l10n';
import { usePageTitle } from '@/lib/usePageTitle';
import { Chip, EmptyState, ErrorBlock, LoadingBlock, PageHead } from '@/components/admin/ui';
import { TONE_CLASS, type ExpiryTone } from '@/components/expiry/Expiry';
import { RenewalSections } from '@/components/postArrival/RenewalSections';

registerCopy(pagesExpiry);

interface Row {
  source: 'case' | 'vault';
  id: string;
  document: string;
  fileName: string;
  key: string | null;
  kind: 'passport' | 'default';
  expiresAt: string;
  daysLeft: number;
  tone: ExpiryTone;
  client: { id: string; name: string };
  case: { id: string; number: string; status: string; visaType: string } | null;
  staff: { id: string; name: string } | null;
}

interface Staff {
  id: string;
  firstName: string;
  lastName: string;
}

const PERIODS = [30, 60, 90, 180] as const;
const VISA_TYPES = ['WORK', 'AUSBILDUNG', 'WEITERBILDUNG', 'JOB_SEEKER', 'STUDY', 'FAMILY', 'TOURIST'] as const;

/** /admin/expiring — documents (case uploads and vault copies) of open cases that expire within N days. */
const Expiring = () => {
  const { t } = useTranslation();
  const { date } = useL10n();
  usePageTitle(t('expiry.page.title'));
  const [params, setParams] = useSearchParams();
  const days = PERIODS.find((p) => String(p) === params.get('days')) ?? 30;
  const staffId = params.get('staff') ?? '';
  const visaType = params.get('visa') ?? '';

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const { data: staff } = useQuery({
    queryKey: ['staff-list'],
    queryFn: async () => (await api.get<{ staff: Staff[] }>('/admin/users/staff')).data.staff,
    staleTime: 300_000,
  });
  const query = useQuery({
    queryKey: ['admin-expiring', days, staffId, visaType],
    queryFn: async () =>
      (await api.get<{ items: Row[] }>('/admin/expiring', { params: { days, staffId: staffId || undefined, visaType: visaType || undefined } })).data.items,
    placeholderData: keepPreviousData,
  });
  const rows = query.data ?? [];
  const expired = rows.filter((r) => r.tone === 'expired').length;
  const urgent = rows.filter((r) => r.tone === 'urgent').length;

  return (
    <div>
      <PageHead title={t('expiry.page.title')} subtitle={t('expiry.page.subtitle')} />

      <div className="card mb-4 flex flex-wrap items-end gap-x-6 gap-y-3 p-4">
        <div>
          <p className="label mb-1.5">{t('expiry.page.within')}</p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('expiry.page.within')}>
            {PERIODS.map((p) => (
              <Chip key={p} active={days === p} onClick={() => setParam('days', p === 30 ? '' : String(p))}>
                {t('expiry.page.withinDays', { count: p })}
              </Chip>
            ))}
          </div>
        </div>
        <label className="block min-w-[12rem]">
          <span className="label mb-1.5 block">{t('expiry.page.staff')}</span>
          <select className="input" value={staffId} onChange={(e) => setParam('staff', e.target.value)}>
            <option value="">{t('expiry.page.allStaff')}</option>
            <option value="none">{t('expiry.page.unassigned')}</option>
            {(staff ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.firstName} {s.lastName}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-[12rem]">
          <span className="label mb-1.5 block">{t('expiry.page.visaType')}</span>
          <select className="input" value={visaType} onChange={(e) => setParam('visa', e.target.value)}>
            <option value="">{t('expiry.page.allVisa')}</option>
            {VISA_TYPES.map((v) => (
              <option key={v} value={v}>
                {t(`expiry.visaTypes.${v}`)}
              </option>
            ))}
          </select>
        </label>
        {rows.length > 0 && (
          <p className="ml-auto flex flex-wrap gap-2 text-xs font-semibold">
            <span className="badge bg-surface text-navy-900">{t('expiry.page.count', { count: rows.length })}</span>
            {expired > 0 && <span className={clsx('badge', TONE_CLASS.expired)}>{t('expiry.page.expiredCount')}: {expired}</span>}
            {urgent > 0 && <span className={clsx('badge', TONE_CLASS.urgent)}>{t('expiry.page.urgentCount')}: {urgent}</span>}
          </p>
        )}
      </div>

      {query.isLoading ? (
        <LoadingBlock />
      ) : query.error ? (
        <ErrorBlock error={query.error} onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <div className="card">
          <EmptyState icon={Hourglass} title={t('expiry.page.empty')}>
            {t('expiry.page.emptyHint')}
          </EmptyState>
        </div>
      ) : (
        <div className={clsx('card overflow-x-auto', query.isFetching && 'opacity-70')}>
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="border-b border-line bg-surface/60 text-xs text-muted">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-semibold">{t('expiry.page.client')}</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">{t('expiry.page.case')}</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">{t('expiry.page.document')}</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">{t('expiry.page.expires')}</th>
                <th scope="col" className="px-4 py-2.5 text-right font-semibold">{t('expiry.page.left')}</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">{t('expiry.page.staff')}</th>
                <th scope="col" className="px-2 py-2.5">
                  <span className="sr-only">{t('expiry.page.openCase')}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={`${r.source}-${r.id}`} className="hover:bg-surface/40">
                  <td className="px-4 py-2.5 font-medium text-navy-900">{r.client.name}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {r.case ? (
                      <>
                        <span className="font-mono text-xs">{r.case.number}</span>
                        <span className="block text-[11px] text-muted">{t(`expiry.visaTypes.${r.case.visaType}`, { defaultValue: r.case.visaType })}</span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="block text-navy-900">{r.document}</span>
                    <span className="flex items-center gap-1 text-[11px] text-muted">
                      {r.source === 'vault' && (
                        <span className="badge inline-flex items-center gap-1 bg-neutral-bg text-[10px] text-neutral-fg" title={t('expiry.page.vaultHint')}>
                          <Archive className="size-3" aria-hidden />
                          {t('expiry.page.vault')}
                        </span>
                      )}
                      <span className="truncate">{r.fileName}</span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{date(r.expiresAt)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className={clsx('badge whitespace-nowrap tabular-nums', TONE_CLASS[r.tone])}>
                      {r.daysLeft <= 0 ? t('expiry.chip.expired') : t('expiry.page.daysShort', { count: r.daysLeft })}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted">{r.staff?.name ?? t('expiry.page.unassigned')}</td>
                  <td className="px-2 py-2.5">
                    {r.case && (
                      <Link
                        to={`/admin/cases/${r.case.id}`}
                        className="grid size-9 place-items-center rounded-lg text-brand-600 transition hover:bg-brand-50"
                        title={t('expiry.page.openCase')}
                        aria-label={`${t('expiry.page.openCase')}: ${r.case.number}`}
                      >
                        <ExternalLink className="size-4" aria-hidden />
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* After the visa: residence titles (renewal cases) and probation periods ending in the same period. */}
      <RenewalSections days={days} staffId={staffId} />
    </div>
  );
};

export default Expiring;
