import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ClipboardCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesStaffTools } from '@/i18n/pagesStaffTools';
import { EmptyState, ErrorBlock, ListSkeleton, PageHead, StatTile } from '@/components/admin/ui';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { TONE_CLASS } from '@/components/ui/status';
import type { CaseStatus } from '@/lib/types';

registerCopy(pagesStaffTools);

const VISA_TYPES = ['WORK', 'AUSBILDUNG', 'WEITERBILDUNG', 'JOB_SEEKER', 'STUDY', 'FAMILY', 'TOURIST'] as const;

// GET /api/admin/data-quality (server lib/dataQuality/service.ts)
interface Row {
  caseId: string;
  number: string;
  status: string;
  visaType: string;
  client: { id: string; name: string };
  staff: { id: string; name: string } | null;
  score: number;
  grade: 'good' | 'fair' | 'poor';
  issues: { key: string; count: number; penalty: number }[];
  missingProfile: string[];
}
interface Data {
  items: Row[];
  total: number;
  truncated: boolean;
  summary: { average: number | null; poor: number; fair: number; good: number };
  staffOptions: { id: string; name: string }[];
}

const GRADE_TONE = { good: 'success', fair: 'warning', poor: 'danger' } as const;

/** /admin/data-quality — active cases with missing data, scored 0–100, worst first; filters by staff / visa type. */
export default function AdminDataQuality() {
  const { t } = useTranslation();
  const d = (k: string, o?: Record<string, unknown>) => String(t(`staffTools.dq.${k}`, o));
  usePageTitle(d('title'));
  const [params, setParams] = useSearchParams();
  const staff = params.get('staff') ?? '';
  const visaType = params.get('visaType') ?? '';
  const onlyPoor = params.get('poor') === '1';
  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };
  const query = { ...(staff ? { staff } : {}), ...(visaType ? { visaType } : {}), ...(onlyPoor ? { maxScore: 84 } : {}) };
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['admin-data-quality', query],
    queryFn: async () => (await api.get<Data>('/admin/data-quality', { params: query })).data,
    placeholderData: keepPreviousData,
  });

  const issueText = (r: Row) =>
    r.issues.map((i) =>
      i.key === 'PROFILE' ? `${d('issues.PROFILE', { count: i.count })} (${r.missingProfile.map((f) => d(`fields.${f}`, { defaultValue: f })).join(', ')})` : d(`issues.${i.key}`, { count: i.count }),
    );

  return (
    <div>
      <PageHead title={d('title')} subtitle={d('subtitle')} />
      {data && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:max-w-3xl">
          <StatTile label={d('average')} value={data.summary.average ?? '—'} />
          <StatTile label={d('poor')} value={data.summary.poor} tone={data.summary.poor ? 'danger' : undefined} />
          <StatTile label={d('fair')} value={data.summary.fair} />
          <StatTile label={d('good')} value={data.summary.good} />
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select className="input w-auto py-1.5 text-xs" aria-label={d('allStaff')} value={staff} onChange={(e) => setParam('staff', e.target.value)}>
          <option value="">{d('allStaff')}</option>
          <option value="me">{d('me')}</option>
          <option value="none">{d('unassigned')}</option>
          {(data?.staffOptions ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select className="input w-auto py-1.5 text-xs" aria-label={d('allVisa')} value={visaType} onChange={(e) => setParam('visaType', e.target.value)}>
          <option value="">{d('allVisa')}</option>
          {VISA_TYPES.map((v) => (
            <option key={v} value={v}>
              {t(`staffTools.visa.${v}`)}
            </option>
          ))}
        </select>
        <label className="flex min-h-9 items-center gap-2 text-xs text-ink">
          <input type="checkbox" checked={onlyPoor} onChange={(e) => setParam('poor', e.target.checked ? '1' : '')} /> {d('onlyPoor')}
        </label>
      </div>
      {data?.truncated && <p className="mb-3 text-xs text-warning-fg">{d('truncated', { shown: 500, total: data.total })}</p>}
      {isLoading ? (
        <ListSkeleton rows={8} cols={4} />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => refetch()} />
      ) : !data?.items.length ? (
        <div className="rounded-xl border border-line bg-card">
          <EmptyState icon={ClipboardCheck} title={d('empty')} />
        </div>
      ) : (
        <ul className={clsx('divide-y divide-line rounded-xl border border-line bg-card', isFetching && 'opacity-70')}>
          {data.items.map((r) => (
            <li key={r.caseId} className="grid gap-2 px-4 py-3 text-sm lg:grid-cols-[4.5rem_minmax(0,14rem)_minmax(0,1fr)] lg:items-start">
              <div>
                <span className={clsx('badge text-base font-bold tabular-nums', TONE_CLASS[GRADE_TONE[r.grade]])} aria-label={`${d('score')} ${r.score}`}>
                  {r.score}
                </span>
              </div>
              <div className="min-w-0">
                <Link to={`/admin/cases/${r.caseId}#case-docs-initial`} className="font-semibold text-link hover:underline">
                  {r.number}
                </Link>
                <p className="truncate text-xs text-muted">
                  {r.client.name} · {r.staff?.name ?? d('noStaff')}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-1.5">
                  <StatusBadge status={r.status as CaseStatus} />
                  <span className="badge bg-sunken text-ink/80">{t(`staffTools.visa.${r.visaType}`, { defaultValue: r.visaType })}</span>
                </p>
              </div>
              <ul className="space-y-0.5 text-xs text-ink/85">
                {issueText(r).map((line) => (
                  <li key={line}>• {line}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
