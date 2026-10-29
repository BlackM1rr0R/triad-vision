import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Download, Info } from 'lucide-react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { Chip, ErrorBlock, LoadingBlock } from '@/components/admin/ui';
import { PARTNERS_KEY } from './api';

/** GET /api/admin/partners/refusals (server lib/partners/refusals.ts). */
interface Row {
  id: string | null;
  name: string | null;
  cases: number;
  active: number;
  visas: number;
  refusals: number;
  cancelled: number;
  rate: number | null;
}
interface Report {
  group: 'partner' | 'company';
  rows: Row[];
  total: Row;
}

type Group = Report['group'];

const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 1000) / 10}%`);

/** Refusal rate with a small bar (red from 30 %, amber from 10 %). */
const Rate = ({ rate }: { rate: number | null }) => (
  <span className="inline-flex items-center gap-2">
    <span className="h-1.5 w-16 overflow-hidden rounded-full bg-sunken" aria-hidden>
      <span className={clsx('block h-full rounded-full', rate === null ? '' : rate >= 0.3 ? 'bg-danger' : rate >= 0.1 ? 'bg-warning' : 'bg-success')} style={{ width: `${Math.round((rate ?? 0) * 100)}%` }} />
    </span>
    <span className="tabular-nums">{pct(rate)}</span>
  </span>
);

/**
 * Visa refusals ("Ablehnung") by referral partner or by employer company: cases, active, visas, refusals,
 * cancelled and the refusal rate, with a period (by opening or decision date) and CSV export.
 * With `partnerId` it shows that partner's clients by employer company (partner detail tab).
 */
export const RefusalReport = ({ partnerId }: { partnerId?: string }) => {
  const { t } = useTranslation();
  const [group, setGroup] = useState<Group>(partnerId ? 'company' : 'partner');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [basis, setBasis] = useState<'created' | 'decision'>('created');
  const [allCases, setAllCases] = useState(false);
  const params = {
    group,
    from: from || undefined,
    to: to || undefined,
    basis,
    partnerId: partnerId || undefined,
    withPartner: !partnerId && allCases ? '0' : undefined,
  };
  const q = useQuery({
    queryKey: [...PARTNERS_KEY, 'refusals', params],
    queryFn: async () => (await api.get<Report>('/admin/partners/refusals', { params })).data,
    placeholderData: keepPreviousData,
  });
  const csvHref = `/api/admin/partners/refusals.csv?${new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1])).toString()}`;
  const nameOf = (r: Row) => r.name ?? (group === 'partner' ? t('refPartners.refusals.noPartner') : t('refPartners.refusals.noCompany'));
  const linkOf = (r: Row) => (r.id ? (group === 'partner' ? `/admin/partners/${r.id}` : `/admin/companies?id=${encodeURIComponent(r.id)}`) : null);

  return (
    <section className="rounded-xl border border-line bg-card">
      <div className="flex flex-col gap-3 border-b border-line px-4 py-3 lg:flex-row lg:flex-wrap lg:items-end">
        {!partnerId && (
          <div className="flex gap-1.5" role="group">
            {(['partner', 'company'] as const).map((g) => (
              <Chip key={g} active={group === g} onClick={() => setGroup(g)}>
                {t(g === 'partner' ? 'refPartners.refusals.byPartner' : 'refPartners.refusals.byCompany')}
              </Chip>
            ))}
          </div>
        )}
        <label className="block">
          <span className="label">{t('refPartners.refusals.from')}</span>
          <input type="date" className="input w-auto" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">{t('refPartners.refusals.to')}</span>
          <input type="date" className="input w-auto" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">{t('refPartners.refusals.basis')}</span>
          <select className="input w-auto" value={basis} onChange={(e) => setBasis(e.target.value as 'created' | 'decision')}>
            <option value="created">{t('refPartners.refusals.basisCreated')}</option>
            <option value="decision">{t('refPartners.refusals.basisDecision')}</option>
          </select>
        </label>
        {!partnerId && (
          <label className="flex min-h-10 items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={allCases} onChange={(e) => setAllCases(e.target.checked)} /> {t('refPartners.refusals.allCases')}
          </label>
        )}
        <div className="flex items-center gap-2 lg:ml-auto">
          {q.isFetching && !q.isLoading && <Spinner className="size-4 text-link" />}
          <a href={csvHref} className="btn-secondary btn-sm" download>
            <Download className="size-3.5" aria-hidden /> {t('refPartners.refusals.csv')}
          </a>
        </div>
      </div>
      {q.isLoading ? (
        <LoadingBlock />
      ) : q.isError || !q.data ? (
        <ErrorBlock error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted">{t('refPartners.refusals.empty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-line bg-surface/70 text-xs font-medium whitespace-nowrap text-muted">
              <tr>
                <th className="px-4 py-2.5">{t(group === 'partner' ? 'refPartners.refusals.th.partner' : 'refPartners.refusals.th.company')}</th>
                {(['cases', 'active', 'visas', 'refusals', 'cancelled'] as const).map((k) => (
                  <th key={k} className="px-4 py-2.5 text-right">
                    {t(`refPartners.refusals.th.${k}`)}
                  </th>
                ))}
                <th className="px-4 py-2.5">{t('refPartners.refusals.th.rate')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {q.data.rows.map((r) => {
                const href = linkOf(r);
                return (
                  <tr key={r.id ?? 'none'}>
                    <td className="px-4 py-2.5 font-medium text-ink">
                      {href ? (
                        <Link to={href} className="hover:text-link hover:underline">
                          {nameOf(r)}
                        </Link>
                      ) : (
                        <span className="text-muted italic">{nameOf(r)}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.cases}</td>
                    <td className="px-4 py-2.5 text-right text-link tabular-nums">{r.active}</td>
                    <td className="px-4 py-2.5 text-right text-success-fg tabular-nums">{r.visas}</td>
                    <td className={clsx('px-4 py-2.5 text-right font-semibold tabular-nums', r.refusals ? 'text-danger-fg' : 'text-muted')}>{r.refusals}</td>
                    <td className="px-4 py-2.5 text-right text-muted tabular-nums">{r.cancelled}</td>
                    <td className="px-4 py-2.5">
                      <Rate rate={r.rate} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t border-line-strong bg-surface/70 font-semibold">
              <tr>
                <td className="px-4 py-2.5 text-ink">{t('refPartners.refusals.total')}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{q.data.total.cases}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{q.data.total.active}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{q.data.total.visas}</td>
                <td className="px-4 py-2.5 text-right text-danger-fg tabular-nums">{q.data.total.refusals}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{q.data.total.cancelled}</td>
                <td className="px-4 py-2.5">
                  <Rate rate={q.data.total.rate} />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="flex items-start gap-1.5 border-t border-line px-4 py-2.5 text-xs text-muted">
        <Info className="mt-px size-3.5 shrink-0" aria-hidden /> {t('refPartners.refusals.rateHint')}
      </p>
    </section>
  );
};
