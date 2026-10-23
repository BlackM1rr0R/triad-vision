import { useMemo, useState, type FormEvent } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Download, Filter, Globe2, Layers, LineChart as LineIcon, ShieldCheck, TrendingDown } from 'lucide-react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { dayIso, fmtDate, fmtDayShort } from '@/components/admin/labels';
import { Chip, ErrorBlock, LoadingBlock, PageHead, Panel, StatTile } from '@/components/admin/ui';
import { LineChart, SERIES_COLORS, type Series } from '@/components/admin/charts';
import { registerCopy } from '@/i18n';
import { pagesGrowth } from '@/i18n/pagesGrowth';
import { useL10n } from '@/lib/l10n';
import { usePageTitle } from '@/lib/usePageTitle';

registerCopy(pagesGrowth);

type GroupBy = 'day' | 'week' | 'month';
const PRESETS = [7, 30, 90] as const;
type Preset = (typeof PRESETS)[number] | 'custom';

interface AnalyticsResponse {
  range: { from: string; to: string; groupBy: GroupBy };
  funnel: { key: string; count: number; rate: number | null; ofFirst: number | null }[];
  totals: Record<string, number | null>;
  series: { buckets: string[]; values: Record<string, number[]> };
  sources: { source: string; count: number; share: number | null }[];
  medians: { registrationToCaseDays: number | null; registrationToCaseSamples: number; caseToApprovalDays: number | null; caseToApprovalSamples: number };
  dropoff: { step: string; reached: number; rate: number | null; stepRate: number | null; active: number; lost: number }[];
  byCategory: {
    id: string | null;
    slug: string | null;
    visaLabel: string | null;
    title: Record<string, string> | null;
    created: number;
    approved: number;
    rejected: number;
    cancelled: number;
    active: number;
    approvalRate: number | null;
  }[];
}

const DAY = 24 * 60 * 60 * 1000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const todayIso = () => iso(new Date());
const daysBack = (n: number) => iso(new Date(Date.now() - (n - 1) * DAY));

const SERIES_KEYS = ['registrations', 'casesCreated', 'approved', 'inquiries', 'bookings', 'applications', 'emailVerified', 'visits'] as const;
const DEFAULT_HIDDEN = ['visits', 'emailVerified'];

const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`);

// ─── Funnel (hand-made SVG: one trapezoid per stage, stacked into a funnel) ─────────

const FUNNEL_COLOR = '#2f7bff';

const Funnel = ({ stages }: { stages: AnalyticsResponse['funnel'] }) => {
  const { t } = useTranslation();
  const max = Math.max(1, ...stages.map((s) => s.count));
  // Square-root scale: visits are orders of magnitude above approvals; a linear scale would hide the tail.
  const width = (v: number) => (v <= 0 ? 4 : Math.max(6, Math.sqrt(v / max) * 100));
  const summary = stages.map((s) => `${t(`growth.analytics.stages.${s.key}`)} ${s.count}`).join(', ');
  return (
    <figure>
      <figcaption className="sr-only">{t('growth.analytics.funnelAria', { summary })}</figcaption>
      <ol className="space-y-0.5" aria-hidden>
        {stages.map((s, i) => {
          const top = width(s.count);
          const bottom = width(stages[i + 1]?.count ?? s.count * 0.92);
          const opacity = 1 - (i / Math.max(1, stages.length - 1)) * 0.55;
          return (
            <li key={s.key} className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_4.5rem] items-center gap-3 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_6.5rem]">
              <span className="truncate text-xs font-medium text-ink/80">{t(`growth.analytics.stages.${s.key}`)}</span>
              <span className="relative block h-9">
                <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="absolute inset-0 size-full">
                  <polygon
                    points={`${50 - top / 2},0 ${50 + top / 2},0 ${50 + bottom / 2},10 ${50 - bottom / 2},10`}
                    fill={FUNNEL_COLOR}
                    fillOpacity={opacity}
                  />
                </svg>
                <span className="absolute inset-0 grid place-items-center">
                  <span className="rounded bg-white/90 px-1.5 text-xs font-bold text-navy-900 tabular-nums">{s.count.toLocaleString()}</span>
                </span>
              </span>
              <span className="text-right text-[11px] leading-tight text-muted tabular-nums">
                {s.rate === null ? '' : (
                  <>
                    <span className="block text-xs font-semibold text-navy-900">{pct(s.rate)}</span>
                    <span className="hidden sm:inline">{t('growth.analytics.fromPrev')}</span>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="sr-only">
        <table>
          <tbody>
            {stages.map((s) => (
              <tr key={s.key}>
                <th scope="row">{t(`growth.analytics.stages.${s.key}`)}</th>
                <td>{s.count}</td>
                <td>{pct(s.rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
};

// ─── Drop-off per visa step (hand-made SVG bars) ──────────────────────────

const Dropoff = ({ rows }: { rows: AnalyticsResponse['dropoff'] }) => {
  const { t } = useTranslation();
  const max = Math.max(1, rows[0]?.reached ?? 0);
  return (
    <ul className="space-y-3">
      {rows.map((r) => {
        const w = (r.reached / max) * 100;
        const activeW = (r.active / max) * 100;
        const lostW = (r.lost / max) * 100;
        return (
          <li key={r.step}>
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="font-medium text-ink/80">{t(`growth.analytics.steps.${r.step}`)}</span>
              <span className="text-muted tabular-nums">
                <span className="font-semibold text-navy-900">{r.reached}</span> {t('growth.analytics.reached')}
                {r.stepRate !== null && <> · {pct(r.stepRate)}</>}
              </span>
            </div>
            <svg viewBox="0 0 100 4" preserveAspectRatio="none" className="mt-1 block h-3 w-full" aria-hidden>
              <rect x={0} y={0} width={100} height={4} rx={1} fill="var(--color-surface)" />
              <rect x={0} y={0} width={Math.max(0, w - activeW - lostW)} height={4} fill="#2f7bff" />
              <rect x={Math.max(0, w - activeW - lostW)} y={0} width={activeW} height={4} fill="#eda100" />
              <rect x={Math.max(0, w - lostW)} y={0} width={lostW} height={4} fill="#d92d3a" />
            </svg>
            {(r.active > 0 || r.lost > 0) && (
              <p className="mt-1 text-[11px] text-muted">
                {r.active > 0 && (
                  <span className="mr-3 inline-flex items-center gap-1">
                    <span className="size-2 rounded-sm bg-[#eda100]" aria-hidden /> {r.active} {t('growth.analytics.active')}
                  </span>
                )}
                {r.lost > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <span className="size-2 rounded-sm bg-[#d92d3a]" aria-hidden /> {r.lost} {t('growth.analytics.lost')}
                  </span>
                )}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
};

// ─── CSV export (client-side Blob, no server round trip) ─────────────────

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const exportCsv = (data: AnalyticsResponse, label: (k: string) => string) => {
  const keys = Object.keys(data.series.values);
  const lines = [['period', ...keys.map(label)].map(csvCell).join(',')];
  data.series.buckets.forEach((b, i) => lines.push([b, ...keys.map((k) => data.series.values[k][i] ?? 0)].map(csvCell).join(',')));
  // BOM so Excel opens UTF-8 (Azerbaijani / Cyrillic labels) correctly.
  const blob = new Blob(['﻿', lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `triad-vision-analytics_${data.range.from}_${data.range.to}_${data.range.groupBy}.csv`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// ─── Page ──────────────────────────────────────────────────────────────

export default function AdminAnalytics() {
  const { t } = useTranslation();
  const { tr } = useL10n();
  usePageTitle(t('growth.analytics.title'));
  const [preset, setPreset] = useState<Preset>(30);
  const [custom, setCustom] = useState({ from: daysBack(30), to: todayIso() });
  const [draft, setDraft] = useState(custom);
  const [groupBy, setGroupBy] = useState<GroupBy | null>(null);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set(DEFAULT_HIDDEN));

  const range = preset === 'custom' ? custom : { from: daysBack(preset), to: todayIso() };
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['admin-analytics', range.from, range.to, groupBy],
    queryFn: async () => (await api.get<AnalyticsResponse>('/admin/analytics', { params: { ...range, ...(groupBy ? { groupBy } : {}) } })).data,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const stageLabel = (k: string) => t(`growth.analytics.stages.${k}`);
  const series = useMemo<Series[]>(() => SERIES_KEYS.map((key, i) => ({ key, label: t(`growth.analytics.stages.${key}`), color: SERIES_COLORS[i] })), [t]);
  const points = useMemo(
    () => (data ? data.series.buckets.map((b, i) => ({ x: b, values: Object.fromEntries(Object.entries(data.series.values).map(([k, v]) => [k, v[i] ?? 0])) })) : []),
    [data],
  );
  const effectiveGroup = groupBy ?? data?.range.groupBy ?? 'day';
  const xLabel = (x: string) => (effectiveGroup === 'month' ? `${x.slice(5, 7)}.${x.slice(0, 4)}` : fmtDayShort(dayIso(x)));
  const xTitle = (x: string) => (effectiveGroup === 'month' ? `${x.slice(5, 7)}.${x.slice(0, 4)}` : fmtDate(dayIso(x)));

  const toggle = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const applyCustom = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.from || !draft.to) return;
    setCustom(draft.from <= draft.to ? draft : { from: draft.to, to: draft.from });
  };

  const days = (v: number | null) => (v === null ? '—' : t('growth.analytics.days', { value: v.toLocaleString(undefined, { maximumFractionDigits: 1 }) }));

  return (
    <div>
      <PageHead
        title={t('growth.analytics.title')}
        subtitle={t('growth.analytics.subtitle')}
        actions={
          <button type="button" className="btn-secondary btn-sm" onClick={() => data && exportCsv(data, stageLabel)} disabled={!data}>
            <Download className="size-3.5" aria-hidden /> {t('growth.analytics.exportCsv')}
          </button>
        }
      />

      <div className="mb-6 flex flex-col gap-3 rounded-xl border border-line bg-white p-3 sm:p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('growth.analytics.period')}>
          {PRESETS.map((p) => (
            <Chip key={p} active={preset === p} onClick={() => setPreset(p)}>
              {t(`growth.analytics.ranges.d${p}`)}
            </Chip>
          ))}
          <Chip active={preset === 'custom'} onClick={() => setPreset('custom')}>
            {t('growth.analytics.ranges.custom')}
          </Chip>
          {isFetching && !isLoading && <Spinner className="ml-1 size-3.5 text-brand-600" />}
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="groupBy">
          {(['day', 'week', 'month'] as const).map((g) => (
            <Chip key={g} active={effectiveGroup === g} onClick={() => setGroupBy(g)}>
              {t(`growth.analytics.groupBy.${g}`)}
            </Chip>
          ))}
        </div>
      </div>

      {preset === 'custom' && (
        <form onSubmit={applyCustom} className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-white p-3 sm:p-4">
          <label className="min-w-0 flex-1 sm:flex-none">
            <span className="label">{t('growth.analytics.from')}</span>
            <input type="date" className="input" value={draft.from} max={todayIso()} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} />
          </label>
          <label className="min-w-0 flex-1 sm:flex-none">
            <span className="label">{t('growth.analytics.to')}</span>
            <input type="date" className="input" value={draft.to} max={todayIso()} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} />
          </label>
          <button type="submit" className="btn-primary min-h-11 w-full sm:w-auto">
            <Filter className="size-4" aria-hidden /> {t('growth.analytics.apply')}
          </button>
        </form>
      )}

      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => refetch()} />
      ) : data ? (
        <div className={clsx('space-y-6 transition-opacity', isFetching && 'opacity-70')}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label={t('growth.analytics.stages.visits')} value={(data.totals.visits ?? 0).toLocaleString()} hint={t('growth.analytics.visitToApproved') + ': ' + pct(data.totals.visitToApproved)} />
            <StatTile label={t('growth.analytics.stages.registrations')} value={data.totals.registrations ?? 0} hint={t('growth.analytics.regToCase') + ': ' + pct(data.totals.registrationToCase)} />
            <StatTile
              label={t('growth.analytics.medianRegToCase')}
              value={days(data.medians.registrationToCaseDays)}
              hint={t('growth.analytics.samples', { count: data.medians.registrationToCaseSamples })}
            />
            <StatTile
              label={t('growth.analytics.medianCaseToApproval')}
              value={days(data.medians.caseToApprovalDays)}
              hint={t('growth.analytics.samples', { count: data.medians.caseToApprovalSamples })}
              tone="good"
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <Panel title={t('growth.analytics.funnel')} icon={Filter}>
              <p className="-mt-1 mb-4 text-xs text-muted">{t('growth.analytics.funnelNote')}</p>
              <Funnel stages={data.funnel} />
              <div className="mt-5 grid grid-cols-3 gap-2 border-t border-line pt-4 text-center">
                {(['inquiries', 'bookings', 'applications'] as const).map((k) => (
                  <div key={k} className="min-w-0">
                    <p className="font-display text-xl font-bold text-navy-900 tabular-nums">{data.totals[k] ?? 0}</p>
                    <p className="truncate text-[11px] text-muted">{stageLabel(k)}</p>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title={t('growth.analytics.dropoff')} icon={TrendingDown}>
              <p className="-mt-1 mb-4 text-xs text-muted">{t('growth.analytics.dropoffNote')}</p>
              {data.dropoff[0]?.reached ? <Dropoff rows={data.dropoff} /> : <p className="py-8 text-center text-sm text-muted">{t('growth.analytics.empty')}</p>}
            </Panel>
          </div>

          <Panel title={t('growth.analytics.series')} icon={LineIcon}>
            <LineChart points={points} series={series} hidden={hidden} onToggle={toggle} xLabel={xLabel} xTitle={xTitle} ariaLabel={t('growth.analytics.seriesAria')} emptyText={t('growth.analytics.empty')} />
          </Panel>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title={t('growth.analytics.sources')} icon={Globe2}>
              {data.sources.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted">{t('growth.analytics.noSources')}</p>
              ) : (
                <div className="-mx-5 overflow-x-auto sm:-mx-6">
                  <table className="w-full min-w-[320px] text-left text-sm">
                    <thead className="text-[11px] font-semibold tracking-wide text-muted uppercase">
                      <tr>
                        <th className="px-5 py-2 sm:px-6">{t('growth.analytics.source')}</th>
                        <th className="px-3 py-2 text-right">{t('growth.analytics.visits')}</th>
                        <th className="w-[38%] px-5 py-2 sm:px-6">{t('growth.analytics.share')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {data.sources.map((s) => (
                        <tr key={s.source || '(direct)'}>
                          <td className="max-w-[12rem] truncate px-5 py-2 font-medium text-navy-900 sm:px-6">{s.source || <span className="text-muted">{t('growth.analytics.direct')}</span>}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{s.count.toLocaleString()}</td>
                          <td className="px-5 py-2 sm:px-6">
                            <span className="flex items-center gap-2">
                              <svg viewBox="0 0 100 4" preserveAspectRatio="none" className="h-2 min-w-0 flex-1" aria-hidden>
                                <rect width={100} height={4} rx={2} fill="var(--color-surface)" />
                                <rect width={s.share ?? 0} height={4} rx={2} fill="#2f7bff" />
                              </svg>
                              <span className="w-12 text-right text-xs text-muted tabular-nums">{pct(s.share)}</span>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <Panel title={t('growth.analytics.byCategory')} icon={Layers}>
              {data.byCategory.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted">{t('growth.analytics.empty')}</p>
              ) : (
                <div className="-mx-5 overflow-x-auto sm:-mx-6">
                  <table className="w-full min-w-[440px] text-left text-sm">
                    <thead className="text-[11px] font-semibold tracking-wide text-muted uppercase">
                      <tr>
                        <th className="px-5 py-2 sm:px-6">{t('growth.analytics.category')}</th>
                        <th className="px-2 py-2 text-right">{t('growth.analytics.created')}</th>
                        <th className="px-2 py-2 text-right">{t('growth.analytics.activeCol')}</th>
                        <th className="px-2 py-2 text-right">{t('growth.analytics.approvedCol')}</th>
                        <th className="px-2 py-2 text-right">{t('growth.analytics.rejectedCol')}</th>
                        <th className="px-5 py-2 text-right sm:px-6">{t('growth.analytics.approvalRate')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {data.byCategory.map((c) => (
                        <tr key={c.id ?? 'none'}>
                          <td className="px-5 py-2 sm:px-6">
                            {c.title ? (
                              <>
                                <span className="font-medium text-navy-900">{tr(c.title as never)}</span>
                                {c.visaLabel && <span className="ml-1.5 font-mono text-[11px] text-muted">{c.visaLabel}</span>}
                              </>
                            ) : (
                              <span className="text-muted">{t('growth.analytics.noCategory')}</span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">{c.created}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{c.active}</td>
                          <td className="px-2 py-2 text-right text-emerald-700 tabular-nums">{c.approved}</td>
                          <td className="px-2 py-2 text-right text-danger tabular-nums">{c.rejected}</td>
                          <td className="px-5 py-2 text-right font-semibold tabular-nums sm:px-6">{pct(c.approvalRate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>

          <p className="flex items-start gap-2 text-xs text-muted">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden /> {t('growth.analytics.privacy')}
          </p>
        </div>
      ) : null}
    </div>
  );
}
