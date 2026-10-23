import { useMemo, useState } from 'react';
import { scoreTone as scoreToneOf, TONE_CLASS, TONE_TEXT } from '@/components/ui/status';
import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { MessageSquareText, Send, Smile, Star, TrendingUp, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';
import { currentLocale, registerCopy } from '@/i18n';
import { pagesSurvey } from '@/i18n/pagesSurvey';
import { usePageTitle } from '@/lib/usePageTitle';
import { EmptyState, ErrorBlock, LoadingBlock, PageHead, Panel } from '@/components/admin/ui';
import { LineChart, SERIES_COLORS } from '@/components/admin/charts';
import { fmtDate, fullName, toastError } from '@/components/admin/labels';
import { Spinner } from '@/components/ui/Spinner';
import { NpsGauge } from '@/components/surveys/NpsGauge';

registerCopy(pagesSurvey);

const RATING_KEYS = ['communication', 'speed', 'clarity', 'support'] as const;
type RatingKey = (typeof RATING_KEYS)[number];
type Ratings = Record<RatingKey, number | null>;
interface Nps {
  total: number;
  promoters: number;
  passives: number;
  detractors: number;
  score: number | null;
}
interface Summary {
  from: string;
  to: string;
  sent: number;
  answered: number;
  responseRate: number | null;
  nps: Nps;
  ratings: Ratings;
  trend: { month: string; sent: number; answered: number; nps: number | null }[];
  staff: { staffId: string; firstName: string; lastName: string; sent: number; answered: number; responseRate: number | null; nps: Nps; ratings: Ratings }[];
  canSeeAll: boolean;
}
interface Item {
  id: string;
  case: { id: string; number: string };
  client: { id: string; firstName: string; lastName: string };
  staff: { id: string; firstName: string; lastName: string } | null;
  trigger: 'VISA_APPROVED' | 'CASE_CLOSED';
  score: number | null;
  ratings: Partial<Record<RatingKey, number>>;
  comment: string | null;
  sentAt: string;
  remindedAt: string | null;
  answeredAt: string | null;
  expired: boolean;
}

const PAGE_SIZE = 20;
const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)} %`);
const npsText = (v: number | null) => (v === null ? '—' : v > 0 ? `+${v}` : String(v));
const npsTone = (v: number | null) => (v === null ? 'text-muted' : TONE_TEXT[scoreToneOf(v, 30, 0)]);
const scoreTone = (s: number) => TONE_CLASS[scoreToneOf(s, 9, 7)];
const monthLabel = (m: string, long = false) =>
  new Intl.DateTimeFormat(currentLocale() === 'az' ? 'az-Latn-AZ' : currentLocale(), { month: long ? 'long' : 'short', year: long ? 'numeric' : '2-digit', timeZone: 'UTC' }).format(new Date(`${m}-01T00:00:00Z`));

const RatingBars = ({ ratings, compact }: { ratings: Partial<Record<RatingKey, number | null>>; compact?: boolean }) => {
  const { t } = useTranslation();
  return (
    <ul className={clsx('grid gap-2', compact ? 'text-xs' : 'text-sm')}>
      {RATING_KEYS.map((k) => {
        const v = ratings[k] ?? null;
        return (
          <li key={k} className="grid grid-cols-[minmax(0,7rem)_1fr_2.5rem] items-center gap-2">
            <span className="truncate text-muted">{t(`surveyPage.ratings.${k}`)}</span>
            <span className="h-2 overflow-hidden rounded-full bg-surface" aria-hidden>
              <span className="block h-full rounded-full bg-amber-400" style={{ width: `${v ? (v / 5) * 100 : 0}%` }} />
            </span>
            <span className="text-right font-semibold text-ink tabular-nums">{v === null ? '—' : v.toFixed(1)}</span>
          </li>
        );
      })}
    </ul>
  );
};

/** Diverging month bars for NPS (−100 … 100 around a zero line), with the value as text for every month. */
const NpsMonths = ({ trend }: { trend: Summary['trend'] }) => {
  const { t } = useTranslation();
  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-muted">{t('surveyAdmin.trendNps')}</p>
      <ol className="flex items-stretch gap-1 overflow-x-auto pb-1" aria-label={t('surveyAdmin.trendNps')}>
        {trend.map((m) => (
          <li key={m.month} className="flex min-w-9 flex-1 flex-col items-center gap-1" title={`${monthLabel(m.month, true)}: ${npsText(m.nps)}`}>
            <span className={clsx('text-[10px] font-semibold tabular-nums', npsTone(m.nps))}>{npsText(m.nps)}</span>
            <span className="relative h-16 w-full max-w-6 rounded bg-surface" aria-hidden>
              <span className="absolute inset-x-0 top-1/2 h-px bg-line" />
              {m.nps !== null && (
                <span
                  className={clsx('absolute inset-x-0 rounded-sm', m.nps >= 0 ? 'bottom-1/2 bg-emerald-500' : 'top-1/2 bg-red-500')}
                  style={{ height: `${Math.max(2, (Math.abs(m.nps) / 100) * 50)}%` }}
                />
              )}
            </span>
            <span className="text-[10px] whitespace-nowrap text-muted">{monthLabel(m.month)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
};

export default function AdminSurveys() {
  const { t } = useTranslation();
  usePageTitle(t('surveyAdmin.title'));
  const { user } = useAuth();
  const isAdmin = hasMinRole(user?.role, 'ADMIN');
  const qc = useQueryClient();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState({ staffId: '', trigger: '', band: '', state: '', hasComment: false });
  const [page, setPage] = useState(1);

  const range = useMemo(() => ({ ...(from ? { from } : {}), ...(to ? { to } : {}) }), [from, to]);
  const summary = useQuery({
    queryKey: ['admin-surveys-summary', range],
    queryFn: async () => (await api.get<Summary>('/admin/surveys/summary', { params: range })).data,
  });

  const listParams = useMemo(() => {
    const band = filters.band === 'promoters' ? { minScore: 9 } : filters.band === 'passives' ? { minScore: 7, maxScore: 8 } : filters.band === 'detractors' ? { maxScore: 6 } : {};
    return {
      ...range,
      ...band,
      ...(filters.staffId ? { staffId: filters.staffId } : {}),
      ...(filters.trigger ? { trigger: filters.trigger } : {}),
      ...(filters.state ? { answered: filters.state === 'answered' ? 'true' : 'false' } : {}),
      ...(filters.hasComment ? { hasComment: 'true' } : {}),
      page,
      pageSize: PAGE_SIZE,
    };
  }, [filters, range, page]);
  const list = useQuery({
    queryKey: ['admin-surveys', listParams],
    queryFn: async () => (await api.get<{ items: Item[]; total: number }>('/admin/surveys', { params: listParams })).data,
    placeholderData: keepPreviousData,
  });

  const resend = useMutation({
    mutationFn: (id: string) => api.post(`/admin/surveys/${id}/resend`),
    onSuccess: () => {
      toast.success(t('surveyAdmin.resent'));
      void qc.invalidateQueries({ queryKey: ['admin-surveys'] });
    },
    onError: (err) => toastError(err),
  });

  const setFilter = <K extends keyof typeof filters>(k: K, v: (typeof filters)[K]) => {
    setFilters((f) => ({ ...f, [k]: v }));
    setPage(1);
  };

  const s = summary.data;
  const pages = Math.max(1, Math.ceil((list.data?.total ?? 0) / PAGE_SIZE));

  return (
    <div>
      <PageHead
        title={t('surveyAdmin.title')}
        subtitle={t('surveyAdmin.subtitle')}
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-muted">
              <span className="mb-1 block">{t('surveyAdmin.from')}</span>
              <input type="date" className="input h-10 py-1" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="text-xs text-muted">
              <span className="mb-1 block">{t('surveyAdmin.to')}</span>
              <input type="date" className="input h-10 py-1" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
        }
      />

      {summary.isLoading ? (
        <LoadingBlock />
      ) : summary.error || !s ? (
        <ErrorBlock error={summary.error} onRetry={() => void summary.refetch()} />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <section className="flex items-center gap-4 rounded-xl border border-line bg-card p-4">
              <NpsGauge value={s.nps.score} label={`${t('surveyAdmin.kpi.nps')}: ${npsText(s.nps.score)}`} />
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted">{t('surveyAdmin.kpi.nps')}</p>
                <p className={clsx('mt-1 font-display text-3xl font-bold tabular-nums', npsTone(s.nps.score))}>{npsText(s.nps.score)}</p>
                <p className="mt-1 text-[11px] leading-snug text-muted">{t('surveyAdmin.kpi.npsHint', { ...s.nps })}</p>
              </div>
            </section>
            <section className="rounded-xl border border-line bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-muted">{t('surveyAdmin.kpi.response')}</p>
                  <p className="mt-1 font-display text-3xl font-bold text-ink tabular-nums">{pct(s.responseRate)}</p>
                  <p className="mt-1 text-[11px] text-muted">{t('surveyAdmin.kpi.responseHint', { answered: s.answered, sent: s.sent })}</p>
                </div>
                <span className="grid size-9 place-items-center rounded-lg bg-brand-100 text-brand-700">
                  <MessageSquareText className="size-[18px]" aria-hidden />
                </span>
              </div>
              {s.nps.total > 0 && (
                <div className="mt-4">
                  <div className="flex h-2.5 overflow-hidden rounded-full bg-surface" aria-hidden>
                    <span className="bg-emerald-500" style={{ width: `${(s.nps.promoters / s.nps.total) * 100}%` }} />
                    <span className="bg-amber-400" style={{ width: `${(s.nps.passives / s.nps.total) * 100}%` }} />
                    <span className="bg-red-500" style={{ width: `${(s.nps.detractors / s.nps.total) * 100}%` }} />
                  </div>
                  <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
                    {(['promoters', 'passives', 'detractors'] as const).map((k) => (
                      <li key={k} className="inline-flex items-center gap-1">
                        <span className={clsx('size-2 rounded-full', k === 'promoters' ? 'bg-emerald-500' : k === 'passives' ? 'bg-amber-400' : 'bg-red-500')} />
                        {t(`surveyAdmin.npsBands.${k}`)}: <span className="font-semibold text-ink tabular-nums">{s.nps[k]}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
            <section className="rounded-xl border border-line bg-card p-4">
              <p className="mb-3 flex items-center gap-1.5 text-xs font-medium text-muted">
                <Star className="size-3.5 text-amber-500" aria-hidden /> {t('surveyAdmin.kpi.ratings')}
              </p>
              <RatingBars ratings={s.ratings} />
            </section>
          </div>

          <Panel title={t('surveyAdmin.trend')} icon={TrendingUp} className="mt-4" bodyClassName="grid gap-6 p-5 sm:p-6">
            {s.sent === 0 ? (
              <EmptyState icon={Smile} title={t('surveyAdmin.noData')} />
            ) : (
              <>
                <LineChart
                  points={s.trend.map((m) => ({ x: m.month, values: { sent: m.sent, answered: m.answered } }))}
                  series={[
                    { key: 'sent', label: t('surveyAdmin.trendSent'), color: SERIES_COLORS[0] },
                    { key: 'answered', label: t('surveyAdmin.trendAnswered'), color: SERIES_COLORS[2] },
                  ]}
                  hidden={hidden}
                  onToggle={(k) =>
                    setHidden((h) => {
                      const n = new Set(h);
                      if (n.has(k)) n.delete(k);
                      else n.add(k);
                      return n;
                    })
                  }
                  xLabel={(x) => monthLabel(x)}
                  xTitle={(x) => monthLabel(x, true)}
                  ariaLabel={t('surveyAdmin.trend')}
                  height={220}
                />
                <NpsMonths trend={s.trend} />
              </>
            )}
          </Panel>

          <Panel title={t('surveyAdmin.staffTitle')} icon={Users} className="mt-4" bodyClassName="p-0">
            {!s.canSeeAll && <p className="border-b border-line px-5 py-2 text-xs text-muted sm:px-6">{t('surveyAdmin.staffOwn')}</p>}
            {s.staff.length === 0 ? (
              <EmptyState icon={Users} title={t('surveyAdmin.noData')} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] text-sm">
                  <thead className="bg-surface text-left text-xs text-muted">
                    <tr>
                      <th className="px-5 py-2.5 font-medium sm:px-6">{t('surveyAdmin.cols.staff')}</th>
                      <th className="px-3 py-2.5 text-right font-medium">{t('surveyAdmin.cols.sent')}</th>
                      <th className="px-3 py-2.5 text-right font-medium">{t('surveyAdmin.cols.answered')}</th>
                      <th className="px-3 py-2.5 text-right font-medium">{t('surveyAdmin.cols.nps')}</th>
                      <th className="px-5 py-2.5 font-medium sm:px-6">{t('surveyAdmin.kpi.ratings')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {s.staff.map((r) => (
                      <tr key={r.staffId}>
                        <td className="px-5 py-3 font-medium text-ink sm:px-6">
                          <button type="button" className="text-left hover:text-brand-700 hover:underline" onClick={() => setFilter('staffId', r.staffId)}>
                            {fullName(r)}
                          </button>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">{r.sent}</td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {r.answered} <span className="text-xs text-muted">({pct(r.responseRate)})</span>
                        </td>
                        <td className={clsx('px-3 py-3 text-right font-bold tabular-nums', npsTone(r.nps.score))}>{npsText(r.nps.score)}</td>
                        <td className="w-72 px-5 py-3 sm:px-6">
                          <RatingBars ratings={r.ratings} compact />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}

      <Panel title={t('surveyAdmin.commentsTitle')} icon={MessageSquareText} className="mt-4" bodyClassName="p-0">
        <div className="grid gap-2 border-b border-line px-5 py-3 sm:grid-cols-2 sm:px-6 lg:grid-cols-5">
          <select className="input h-10 py-1" value={filters.staffId} onChange={(e) => setFilter('staffId', e.target.value)} aria-label={t('surveyAdmin.cols.staff')}>
            <option value="">{t('surveyAdmin.filters.allStaff')}</option>
            {(s?.staff ?? []).map((r) => (
              <option key={r.staffId} value={r.staffId}>
                {fullName(r)}
              </option>
            ))}
          </select>
          <select className="input h-10 py-1" value={filters.trigger} onChange={(e) => setFilter('trigger', e.target.value)} aria-label={t('surveyAdmin.filters.allTriggers')}>
            <option value="">{t('surveyAdmin.filters.allTriggers')}</option>
            <option value="VISA_APPROVED">{t('surveyAdmin.trigger.VISA_APPROVED')}</option>
            <option value="CASE_CLOSED">{t('surveyAdmin.trigger.CASE_CLOSED')}</option>
          </select>
          <select className="input h-10 py-1" value={filters.band} onChange={(e) => setFilter('band', e.target.value)} aria-label={t('surveyAdmin.cols.score')}>
            <option value="">{t('surveyAdmin.filters.allScores')}</option>
            <option value="promoters">{t('surveyAdmin.filters.promoters')}</option>
            <option value="passives">{t('surveyAdmin.filters.passives')}</option>
            <option value="detractors">{t('surveyAdmin.filters.detractors')}</option>
          </select>
          <select className="input h-10 py-1" value={filters.state} onChange={(e) => setFilter('state', e.target.value)} aria-label={t('surveyAdmin.cols.state')}>
            <option value="">{t('surveyAdmin.filters.allStates')}</option>
            <option value="answered">{t('surveyAdmin.filters.answered')}</option>
            <option value="open">{t('surveyAdmin.filters.open')}</option>
          </select>
          <label className="inline-flex min-h-10 items-center gap-2 text-sm text-ink">
            <input type="checkbox" className="size-4 accent-brand-600" checked={filters.hasComment} onChange={(e) => setFilter('hasComment', e.target.checked)} />
            {t('surveyAdmin.filters.withComment')}
          </label>
        </div>

        {list.isLoading ? (
          <LoadingBlock className="min-h-[20vh]" />
        ) : list.error ? (
          <div className="p-5">
            <ErrorBlock error={list.error} onRetry={() => void list.refetch()} />
          </div>
        ) : !list.data?.items.length ? (
          <EmptyState icon={MessageSquareText} title={t('surveyAdmin.empty')} />
        ) : (
          <ul className="divide-y divide-line">
            {list.data.items.map((it) => {
              const state = it.answeredAt ? 'answered' : it.expired ? 'expired' : 'open';
              return (
                <li key={it.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-5 py-4 sm:px-6">
                  <span
                    className={clsx('grid size-11 shrink-0 place-items-center rounded-xl text-lg font-bold tabular-nums', it.score === null ? 'bg-surface text-muted' : scoreTone(it.score))}
                    aria-label={`${t('surveyAdmin.cols.score')}: ${it.score ?? '—'}`}
                  >
                    {it.score ?? '–'}
                  </span>
                  <div className="min-w-0 flex-[1_1_16rem]">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                      <Link to={`/admin/cases/${it.case.id}`} className="font-mono font-semibold text-ink hover:text-brand-700 hover:underline">
                        {it.case.number}
                      </Link>
                      <span>·</span>
                      <span className="text-ink/80">{fullName(it.client)}</span>
                      {it.staff && (
                        <>
                          <span>·</span>
                          <span>{fullName(it.staff)}</span>
                        </>
                      )}
                      <span className="badge bg-surface text-muted">{t(`surveyAdmin.trigger.${it.trigger}`)}</span>
                      <span
                        className={clsx(
                          'badge',
                          state === 'answered' ? 'bg-emerald-100 text-emerald-800' : state === 'expired' ? 'bg-surface text-muted' : 'bg-amber-100 text-amber-800',
                        )}
                      >
                        {t(`surveyAdmin.state.${state}`)}
                      </span>
                      {!it.answeredAt && it.remindedAt && <span className="badge bg-surface text-muted">{t('surveyAdmin.state.reminded')}</span>}
                    </div>
                    <p className={clsx('mt-1.5 text-sm break-words whitespace-pre-line', it.comment ? 'text-ink' : 'text-muted italic')}>
                      {it.comment || (it.answeredAt ? t('surveyAdmin.noComment') : '')}
                    </p>
                    {it.answeredAt && Object.keys(it.ratings).length > 0 && (
                      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                        {RATING_KEYS.filter((k) => it.ratings[k]).map((k) => (
                          <li key={k} className="inline-flex items-center gap-1">
                            {t(`surveyPage.ratings.${k}`)}
                            <span className="inline-flex items-center gap-0.5 font-semibold text-ink">
                              <Star className="size-3 fill-amber-400 text-amber-400" aria-hidden />
                              {it.ratings[k]}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="ml-auto flex flex-col items-end gap-2 text-xs text-muted">
                    <span>{fmtDate(it.answeredAt ?? it.sentAt)}</span>
                    {isAdmin && state === 'open' && (
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        disabled={resend.isPending && resend.variables === it.id}
                        onClick={() => resend.mutate(it.id)}
                      >
                        {resend.isPending && resend.variables === it.id ? <Spinner className="size-3.5" /> : <Send className="size-3.5" />} {t('surveyAdmin.resend')}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {(list.data?.total ?? 0) > 0 && (
          <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3 text-xs text-muted sm:px-6">
            <span>{t('surveyAdmin.total', { count: list.data?.total ?? 0 })}</span>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                {t('surveyAdmin.prev')}
              </button>
              <span className="self-center tabular-nums">
                {page} / {pages}
              </span>
              <button type="button" className="btn-secondary btn-sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                {t('surveyAdmin.next')}
              </button>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
