import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import i18n from 'i18next';
import { ArrowDown, ArrowUp, Download, Eye, Mail, MousePointerClick, Percent, UserPlus } from 'lucide-react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesToolConversion } from '@/i18n/pagesToolConversion';
import { pagesAudience } from '@/i18n/pagesAudience';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState, ErrorBlock, KpiCell, KpiStrip, ListSkeleton, Panel } from '@/components/admin/ui';
import { TOOLS } from '@/components/audience/tools';
import { FeaturedToolsEditor } from '@/components/tools/hub/FeaturedToolsEditor';

registerCopy(pagesToolConversion);
registerCopy(pagesAudience);

interface Counts {
  views: number;
  uses: number;
  leads: number;
  registrations: number;
  inquiries: number;
  embedViews: number;
}
interface Row extends Counts {
  slug: string;
  conversions: number;
  useRate: number | null;
  conversionRate: number | null;
  prev: Counts & { conversions: number; conversionRate: number | null };
  viewsTrend: number | null;
  daily: number[];
}
/** GET /api/admin/tool-analytics (server lib/toolAnalytics). */
interface Report {
  days: number;
  from: string;
  to: string;
  totals: Counts & { conversions: number; conversionRate: number | null; prevViews: number; prevConversions: number };
  series: { day: string; views: number; uses: number; conversions: number }[];
  items: Row[];
}

type SortKey = 'slug' | 'views' | 'uses' | 'leads' | 'registrations' | 'inquiries' | 'embedViews' | 'conversionRate' | 'viewsTrend';
const PERIODS = [7, 30, 90] as const;
const TOOL_KEY = new Map(TOOLS.map((x) => [x.to.replace(/^\//, ''), x.key]));

/** Single-series sparkline of daily views (the table is the accessible view of the same numbers). */
const Sparkline = ({ values, label }: { values: number[]; label: string }) => {
  const w = 96;
  const h = 24;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="text-primary" role="img" aria-label={label}>
      <title>{label}</title>
      <line x1="0" x2={w} y1={h - 1} y2={h - 1} stroke="var(--color-line)" strokeWidth="1" />
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
};

const fmtPct = (v: number | null) => (v === null ? '—' : `${v.toLocaleString(i18n.language, { maximumFractionDigits: 1 })} %`);

export default function ToolAnalytics() {
  const { t } = useTranslation();
  usePageTitle(t('toolConv.admin.title'));
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'views', dir: -1 });
  const [q, setQ] = useState('');
  const [hideEmpty, setHideEmpty] = useState(true);
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ['admin-tool-analytics', days],
    queryFn: async () => (await api.get<Report>('/admin/tool-analytics', { params: { days } })).data,
  });

  const nameOf = (slug: string) => {
    const key = TOOL_KEY.get(slug);
    return key ? (t(`toolsPage.items.${key}.title`, { defaultValue: slug }) as string) : slug;
  };

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = (data?.items ?? []).filter((r) => (!hideEmpty || r.views + r.uses + r.conversions + r.embedViews > 0) && (!s || r.slug.includes(s) || nameOf(r.slug).toLowerCase().includes(s)));
    const val = (r: Row) => (sort.key === 'slug' ? nameOf(r.slug) : (r[sort.key] ?? -Infinity));
    return [...list].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number)) * sort.dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, q, hideEmpty, sort]);

  const csv = () => {
    const head = ['tool', 'views', 'interactions', 'emails', 'signups', 'inquiries', 'widget_views', 'conversion_pct', 'views_trend_pct'];
    const lines = rows.map((r) => [r.slug, r.views, r.uses, r.leads, r.registrations, r.inquiries, r.embedViews, r.conversionRate ?? '', r.viewsTrend ?? ''].join(','));
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tool-analytics-${data?.from}-${data?.to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const Th = ({ k, label, right = true }: { k: SortKey; label: string; right?: boolean }) => {
    const active = sort.key === k;
    return (
      <th scope="col" aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'} className={clsx('px-3 py-2 font-semibold whitespace-nowrap', right ? 'text-right' : 'text-left')}>
        <button type="button" className="inline-flex items-center gap-1 hover:text-ink" onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? (s.dir === 1 ? -1 : 1) : k === 'slug' ? 1 : -1 }))}>
          {label}
          {active && (sort.dir === 1 ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />)}
        </button>
      </th>
    );
  };

  const trend = (v: number | null) =>
    v === null ? <span className="text-muted">—</span> : <span className={clsx('num', v > 0 ? 'text-success-fg' : v < 0 ? 'text-danger-fg' : 'text-muted')}>{`${v > 0 ? '+' : ''}${v.toLocaleString(i18n.language, { maximumFractionDigits: 1 })} %`}</span>;

  return (
    <div>
      <PageHeader
        title={t('toolConv.admin.title')}
        subtitle={t('toolConv.admin.subtitle')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label={t('toolConv.admin.period')} className="inline-flex rounded-xl border border-line bg-sunken p-1">
              {PERIODS.map((d) => (
                <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)} className={clsx('min-h-9 rounded-lg px-3 text-sm font-semibold', days === d ? 'bg-card text-ink shadow-[var(--tv-shadow-card)]' : 'text-muted hover:text-ink')}>
                  {t('toolConv.admin.days', { n: d })}
                </button>
              ))}
            </div>
            <button type="button" onClick={csv} disabled={!rows.length} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-semibold text-ink hover:bg-sunken disabled:opacity-50">
              <Download className="size-4" aria-hidden /> {t('toolConv.admin.csv')}
            </button>
          </div>
        }
      />
      {isLoading && <ListSkeleton stats={4} cols={8} />}
      {error && <ErrorBlock error={error} onRetry={() => void refetch()} />}
      {data && (
        <div className="space-y-6">
          <KpiStrip cols={5}>
            <KpiCell icon={Eye} label={t('toolConv.admin.views')} value={data.totals.views.toLocaleString(i18n.language)} aside={trend(data.totals.prevViews ? Math.round(((data.totals.views - data.totals.prevViews) / data.totals.prevViews) * 1000) / 10 : null)} hint={t('toolConv.admin.vsPrev')} />
            <KpiCell icon={MousePointerClick} label={t('toolConv.admin.uses')} value={data.totals.uses.toLocaleString(i18n.language)} />
            <KpiCell icon={Mail} label={t('toolConv.admin.leads')} value={data.totals.leads.toLocaleString(i18n.language)} to="/admin/inquiries?source=tool" hint={t('toolConv.admin.leadsLink')} />
            <KpiCell icon={UserPlus} label={`${t('toolConv.admin.registrations')} / ${t('toolConv.admin.inquiries')}`} value={`${data.totals.registrations} / ${data.totals.inquiries}`} />
            <KpiCell icon={Percent} label={t('toolConv.admin.conversion')} value={fmtPct(data.totals.conversionRate)} />
          </KpiStrip>

          <Panel
            title={`${data.from} – ${data.to}`}
            actions={
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2 text-xs text-muted">
                  <input type="checkbox" className="accent-primary" checked={hideEmpty} onChange={(e) => setHideEmpty(e.target.checked)} /> {t('toolConv.admin.hideEmpty')}
                </label>
                <input type="search" className="input h-9 w-48" placeholder={t('toolConv.admin.search')} aria-label={t('toolConv.admin.search')} value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
            }
            bodyClassName="p-0 sm:p-0"
          >
            {rows.length === 0 ? (
              <EmptyState text={t('toolConv.admin.empty')} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[56rem] text-sm">
                  <thead className="border-b border-line text-xs text-muted">
                    <tr>
                      <Th k="slug" label={t('toolConv.admin.tool')} right={false} />
                      <Th k="views" label={t('toolConv.admin.views')} />
                      <Th k="uses" label={t('toolConv.admin.uses')} />
                      <Th k="leads" label={t('toolConv.admin.leads')} />
                      <Th k="registrations" label={t('toolConv.admin.registrations')} />
                      <Th k="inquiries" label={t('toolConv.admin.inquiries')} />
                      <Th k="embedViews" label={t('toolConv.admin.embeds')} />
                      <Th k="conversionRate" label={t('toolConv.admin.conversion')} />
                      <Th k="viewsTrend" label={t('toolConv.admin.trend')} />
                      <th scope="col" className="px-3 py-2 text-left font-semibold">
                        {t('toolConv.admin.daily')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {rows.map((r) => (
                      <tr key={r.slug} className="hover:bg-sunken/50">
                        <td className="px-3 py-2">
                          <a href={`/${r.slug}`} target="_blank" rel="noreferrer" className="font-medium text-ink hover:underline">
                            {nameOf(r.slug)}
                          </a>
                          <span className="block text-[11px] text-muted">/{r.slug}</span>
                        </td>
                        <td className="num px-3 py-2 text-right">{r.views.toLocaleString(i18n.language)}</td>
                        <td className="num px-3 py-2 text-right">
                          {r.uses.toLocaleString(i18n.language)} <span className="text-[11px] text-muted">{r.useRate !== null ? `(${fmtPct(r.useRate)})` : ''}</span>
                        </td>
                        <td className="num px-3 py-2 text-right">
                          {r.leads > 0 ? (
                            <Link to={`/admin/inquiries?source=tool&q=${encodeURIComponent(`/${r.slug})`)}`} className="text-link hover:underline">
                              {r.leads}
                            </Link>
                          ) : (
                            0
                          )}
                        </td>
                        <td className="num px-3 py-2 text-right">{r.registrations}</td>
                        <td className="num px-3 py-2 text-right">{r.inquiries}</td>
                        <td className="num px-3 py-2 text-right">{r.embedViews}</td>
                        <td className="num px-3 py-2 text-right font-semibold">{fmtPct(r.conversionRate)}</td>
                        <td className="px-3 py-2 text-right">{trend(r.viewsTrend)}</td>
                        <td className="px-3 py-2">
                          <Sparkline values={r.daily} label={`${nameOf(r.slug)}: ${r.daily.join(', ')}`} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
          <p className="text-xs leading-relaxed text-muted">{t('toolConv.admin.note')}</p>
          {/* "Most useful" row of /tools and the header tools menu; "suggest" uses this period's most viewed tools. */}
          <FeaturedToolsEditor topSlugs={[...data.items].filter((r) => r.views > 0).sort((a, b) => b.views - a.views).map((r) => r.slug)} />
        </div>
      )}
    </div>
  );
}
