import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlertTriangle, CalendarClock, Download, Filter, Handshake, Megaphone, Package, TrendingUp, Wallet } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesSalesAnalytics } from '@/i18n/pagesSalesAnalytics';
import { useL10n } from '@/lib/l10n';
import type { L10n } from '@/lib/types';
import { ErrorBlock, LoadingBlock, Panel } from '@/components/admin/ui';
import { AreaChart, DeltaPill, FunnelBars, HBarList, StatCard, VIZ, type ChartSeries } from '@/components/charts';
import { useReportFormat } from '@/components/reports/types';
import { salesCsvHref, useSalesAnalytics, type DueKind, type SalesResponse, type SalesSection } from './api';

registerCopy(pagesSalesAnalytics);

/**
 * "Gəlir və satış" — the revenue & sales tab of Admin → Biznes analitikası (ADMIN+): paid revenue by month,
 * expected and overdue payments, revenue by package / service, leads by source, the lead → visa funnel and the top
 * partners, each compared with the period of the same length before. Every panel has its own CSV export.
 */

const monthLabel = (m: string) => `${m.slice(5, 7)}.${m.slice(0, 4)}`;
const bakuToday = () => new Date(Date.now() + 4 * 3600_000).toISOString().slice(0, 10);
const DUE_KINDS: DueKind[] = ['client', 'company', 'installment'];

const Th = ({ children, left }: { children: ReactNode; left?: boolean }) => <th className={clsx('px-2 py-2 font-medium whitespace-nowrap first:pl-5 last:pr-5', left ? 'text-left' : 'text-right')}>{children}</th>;
const Td = ({ children, className }: { children: ReactNode; className?: string }) => <td className={clsx('px-2 py-2 text-right tabular-nums first:pl-5 first:text-left last:pr-5', className)}>{children}</td>;

const CsvLink = ({ range, section }: { range: { from: string; to: string }; section: SalesSection }) => {
  const { t } = useTranslation();
  return (
    <a href={salesCsvHref(range, section)} download className="btn-ghost btn-sm min-h-9" aria-label={`CSV · ${t('sales.tab')}`}>
      <Download className="size-3.5" aria-hidden /> CSV
    </a>
  );
};

export const RevenueView = ({ range }: { range: { from: string; to: string } }) => {
  const { t } = useTranslation();
  const { data, isLoading, isFetching, error, refetch } = useSalesAnalytics(range);
  if (isLoading) return <LoadingBlock />;
  if (error) return <ErrorBlock error={error} onRetry={() => refetch()} />;
  if (!data) return null;
  return (
    <div className={clsx('space-y-6 transition-opacity', isFetching && 'opacity-70')}>
      <p className="text-xs text-muted">{t('sales.note', { from: data.range.prevFrom, to: data.range.prevTo })}</p>
      <Kpis data={data} />
      <RevenuePanel data={data} range={range} />
      <div className="grid gap-6 xl:grid-cols-2">
        <ExpectedPanel data={data} range={range} />
        <OverduePanel data={data} range={range} />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <ServicesPanel data={data} range={range} />
        <PartnersPanel data={data} range={range} />
      </div>
      <LeadsPanel data={data} range={range} />
      <FunnelPanel data={data} range={range} />
    </div>
  );
};

// ─── KPIs ───────────────────────────────────────────────────────────────

const Kpis = ({ data }: { data: SalesResponse }) => {
  const { t } = useTranslation();
  const f = useReportFormat();
  const s = data.summary;
  const vs = t('sales.vsPrev');
  const convDelta = s.conversion !== null && s.conversionPrev !== null ? Math.round((s.conversion - s.conversionPrev) * 10) / 10 : null;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <StatCard icon={Wallet} label={t('sales.kpi.revenue')} value={f.eur(s.revenueCents)} delta={<DeltaPill value={s.revenueDelta} title={vs} />} hint={t('sales.kpi.revenueHint', { value: f.eur(s.revenuePrevCents) })} />
      <StatCard icon={CalendarClock} label={t('sales.kpi.upcoming')} value={f.eur(s.upcomingCents)} hint={t('sales.kpi.upcomingHint')} />
      <StatCard
        icon={AlertTriangle}
        label={t('sales.kpi.overdue')}
        value={<span className={clsx(s.overdueCents > 0 && 'text-danger-fg')}>{f.eur(s.overdueCents)}</span>}
        hint={t('sales.kpi.overdueHint', { count: s.overdueCount })}
      />
      <StatCard icon={Megaphone} label={t('sales.kpi.leads')} value={f.num(s.leads)} delta={<DeltaPill value={s.leadsDelta} title={vs} />} hint={t('sales.kpi.leadsHint', { value: f.num(s.leadsPrev) })} />
      <StatCard icon={Filter} label={t('sales.kpi.conversion')} value={f.pct(s.conversion)} delta={<DeltaPill value={convDelta} unit="pp" title={vs} />} hint={t('sales.kpi.conversionHint', { value: f.pct(s.conversionPrev) })} />
    </div>
  );
};

// ─── Revenue ────────────────────────────────────────────────────────────

const RevenuePanel = ({ data, range }: { data: SalesResponse; range: { from: string; to: string } }) => {
  const { t } = useTranslation();
  const f = useReportFormat();
  const r = data.revenue;
  const series: ChartSeries[] = [
    { key: 'invoices', label: t('sales.revenue.invoices'), color: VIZ[0] },
    { key: 'payments', label: t('sales.revenue.payments'), color: VIZ[1] },
  ];
  const points = r.months.map((m, i) => ({ x: m, values: { invoices: r.invoices[i], payments: r.payments[i] } }));
  // The current month drawn at its pace when the period runs until today.
  const today = bakuToday();
  const last = r.months.at(-1);
  let partial: { factor: number; note: string } | undefined;
  if (last && range.to === today && today.startsWith(last)) {
    const [y, m, d] = today.split('-').map(Number);
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    partial = { factor: days / d, note: t('sales.revenue.partial') };
  }
  return (
    <Panel title={t('sales.revenue.title')} icon={TrendingUp} actions={<CsvLink range={range} section="revenue" />}>
      <AreaChart
        mode="stacked"
        points={points}
        series={series}
        xLabel={monthLabel}
        format={(v) => f.eur(v)}
        axisFormat={(v) => (v >= 100_000 ? `${Math.round(v / 100_000)}k` : String(Math.round(v / 100)))}
        legendValue={(k) => f.eur(k === 'invoices' ? data.summary.invoicesCents : data.summary.paymentsCents)}
        ariaLabel={t('sales.revenue.aria')}
        emptyText={t('sales.empty')}
        partial={partial}
      />
      <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>
          {t('sales.prevLabel')}: <span className="font-semibold text-ink tabular-nums">{f.eur(data.summary.revenuePrevCents)}</span>
        </span>
        <DeltaPill value={data.summary.revenueDelta} title={t('sales.vsPrev')} />
      </p>
    </Panel>
  );
};

// ─── Expected / overdue ─────────────────────────────────────────────────

const ExpectedPanel = ({ data, range }: { data: SalesResponse; range: { from: string; to: string } }) => {
  const { t } = useTranslation();
  const f = useReportFormat();
  const e = data.expected;
  const series: ChartSeries[] = DUE_KINDS.map((k, i) => ({ key: k, label: t(`sales.expected.${k}`), color: VIZ[i] }));
  const points = e.months.map((m) => ({ x: m.month, values: { client: m.client, company: m.company, installment: m.installment } }));
  return (
    <Panel title={t('sales.expected.title')} icon={CalendarClock} actions={<CsvLink range={range} section="expected" />}>
      <p className="-mt-1 mb-3 text-xs text-muted">{t('sales.expected.note')}</p>
      <AreaChart mode="stacked" points={points} series={series} xLabel={monthLabel} format={(v) => f.eur(v)} axisFormat={(v) => String(Math.round(v / 100))} ariaLabel={t('sales.expected.aria')} emptyText={t('sales.empty')} height={220} />
      {e.later.total > 0 && <p className="mt-3 text-xs text-muted">{t('sales.expected.later', { value: f.eur(e.later.total) })}</p>}
    </Panel>
  );
};

const OverduePanel = ({ data, range }: { data: SalesResponse; range: { from: string; to: string } }) => {
  const { t } = useTranslation();
  const f = useReportFormat();
  const o = data.expected.overdue;
  return (
    <Panel title={t('sales.overdue.title')} icon={AlertTriangle} actions={<CsvLink range={range} section="expected" />}>
      <div className="mb-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
        {DUE_KINDS.map((k) => (
          <span key={k}>
            {t(`sales.overdue.kind.${k}`)}: <span className="font-semibold text-ink tabular-nums">{f.eur(o.byKind[k])}</span>
          </span>
        ))}
      </div>
      {o.rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">{t('sales.overdue.none')}</p>
      ) : (
        <div className="-mx-5 overflow-x-auto sm:-mx-6">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <Th left>{t('sales.overdue.number')}</Th>
                <Th left>{t('sales.overdue.who')}</Th>
                <Th>{t('sales.overdue.due')}</Th>
                <Th>{t('sales.overdue.amount')}</Th>
                <Th>{t('sales.overdue.days')}</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {o.rows.map((r) => (
                <tr key={`${r.kind}:${r.id}`}>
                  <Td className="max-w-[12rem]">
                    <Link to={r.link} className="block truncate font-medium text-link hover:underline">
                      {r.number}
                    </Link>
                    <span className="block text-[11px] text-muted">{t(`sales.overdue.kind.${r.kind}`)}</span>
                  </Td>
                  <td className="max-w-[12rem] truncate px-2 py-2 text-left text-ink/90">{r.who || '—'}</td>
                  <Td className="text-muted">{r.dueDate.split('-').reverse().join('.')}</Td>
                  <Td className="font-semibold text-ink">{f.eur(r.cents)}</Td>
                  <Td className={clsx(r.daysOverdue > 30 ? 'font-semibold text-danger-fg' : 'text-warning-fg')}>{t('sales.overdue.daysValue', { count: r.daysOverdue })}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
};

// ─── Services ───────────────────────────────────────────────────────────

const ServicesPanel = ({ data, range }: { data: SalesResponse; range: { from: string; to: string } }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const f = useReportFormat();
  const label = (s: SalesResponse['services'][number]) =>
    s.kind === 'package' ? tr(s.title as L10n) || s.key.slice(8) : s.kind === 'category' ? t(`sales.services.category.${s.key.slice(9)}`) : t(`sales.services.${s.kind}`);
  const rows = data.services.filter((s) => s.cents > 0 || s.prevCents > 0);
  return (
    <Panel title={t('sales.services.title')} icon={Package} actions={<CsvLink range={range} section="services" />}>
      <p className="-mt-1 mb-4 text-xs text-muted">{t('sales.services.note')}</p>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">{t('sales.empty')}</p>
      ) : (
        <HBarList
          rows={rows.map((s, i) => ({ key: s.key, label: label(s), name: label(s), value: s.cents, prev: s.prevCents, color: s.kind === 'package' ? VIZ[0] : s.kind === 'employer' ? VIZ[2] : VIZ[i % 2 ? 3 : 1], extra: <DeltaPill value={s.delta} title={t('sales.vsPrev')} /> }))}
          format={(v) => f.eur(v)}
          labelWidth="sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto]"
        />
      )}
    </Panel>
  );
};

// ─── Partners ───────────────────────────────────────────────────────────

const PartnersPanel = ({ data, range }: { data: SalesResponse; range: { from: string; to: string } }) => {
  const { t } = useTranslation();
  const f = useReportFormat();
  return (
    <Panel title={t('sales.partners.title')} icon={Handshake} actions={<CsvLink range={range} section="partners" />}>
      <p className="-mt-1 mb-3 text-xs text-muted">{t('sales.partners.note')}</p>
      {data.partners.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">{t('sales.partners.none')}</p>
      ) : (
        <div className="-mx-5 overflow-x-auto sm:-mx-6">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <Th left>{t('sales.partners.name')}</Th>
                <Th>{t('sales.partners.revenue')}</Th>
                <Th>{t('sales.partners.prev')}</Th>
                <Th>{t('sales.partners.clients')}</Th>
                <Th>{t('sales.partners.commission')}</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.partners.map((p) => (
                <tr key={p.id}>
                  <Td className="max-w-[13rem]">
                    <Link to={`/admin/partners/${p.id}`} className="block truncate font-medium text-ink hover:underline">
                      {p.name ?? p.id}
                    </Link>
                    <span className="text-[11px] text-muted">
                      {t('sales.partners.share')} {f.pct(p.share)}
                    </span>
                  </Td>
                  <Td>
                    <span className="font-semibold text-ink">{f.eur(p.revenueCents)}</span>
                    <DeltaPill value={p.delta} className="ml-1.5" title={t('sales.vsPrev')} />
                  </Td>
                  <Td className="text-muted">{f.eur(p.prevRevenueCents)}</Td>
                  <Td>{p.clients}</Td>
                  <Td>{f.eur(p.commissionCents)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
};

// ─── Leads and funnel ───────────────────────────────────────────────────

const LeadsPanel = ({ data, range }: { data: SalesResponse; range: { from: string; to: string } }) => {
  const { t } = useTranslation();
  const f = useReportFormat();
  const keys = data.leads.sourceKeys;
  const series = useMemo<ChartSeries[]>(() => keys.map((k, i) => ({ key: k, label: t(`sales.leads.sources.${k}`), color: VIZ[i % VIZ.length] })), [keys, t]);
  const points = data.range.months.map((m, i) => ({ x: m, values: Object.fromEntries(keys.map((k) => [k, data.leads.monthly[k][i] ?? 0])) }));
  const colorOf = (k: string) => series.find((s) => s.key === k)?.color;
  return (
    <Panel title={t('sales.leads.title')} icon={Megaphone} actions={<CsvLink range={range} section="leads" />}>
      <p className="-mt-1 mb-4 text-xs text-muted">{t('sales.leads.note')}</p>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="space-y-5">
          <HBarList
            rows={data.leads.sources.map((s) => ({ key: s.source, label: t(`sales.leads.sources.${s.source}`), value: s.count, prev: s.prev, color: colorOf(s.source), extra: <DeltaPill value={s.delta} title={t('sales.vsPrev')} /> }))}
          />
          <div className="-mx-5 overflow-x-auto sm:-mx-6">
            <table className="w-full min-w-[420px] text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <Th left>{t('sales.leads.source')}</Th>
                  <Th>{t('sales.leads.share')}</Th>
                  <Th>{t('sales.leads.clients')}</Th>
                  <Th>{t('sales.leads.clientRate')}</Th>
                  <Th>{t('sales.leads.approved')}</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.leads.sources.map((s) => (
                  <tr key={s.source}>
                    <Td className="font-medium text-ink">{t(`sales.leads.sources.${s.source}`)}</Td>
                    <Td>{f.pct(s.share)}</Td>
                    <Td>{s.clients}</Td>
                    <Td>{f.pct(s.clientRate)}</Td>
                    <Td className="text-success-fg">{s.approved}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-muted">{t('sales.leads.trend')}</p>
          <AreaChart mode="stacked" points={points} series={series} xLabel={monthLabel} format={(v) => f.num(v)} ariaLabel={t('sales.leads.trendAria')} emptyText={t('sales.empty')} height={240} />
        </div>
      </div>
    </Panel>
  );
};

const FunnelPanel = ({ data, range }: { data: SalesResponse; range: { from: string; to: string } }) => {
  const { t } = useTranslation();
  return (
    <Panel title={t('sales.funnel.title')} icon={Filter} actions={<CsvLink range={range} section="leads" />}>
      <p className="-mt-1 mb-4 text-xs text-muted">{t('sales.funnel.note')}</p>
      {data.funnel[0]?.count || data.funnel[0]?.prev ? (
        <FunnelBars steps={data.funnel.map((s) => ({ key: s.key, label: t(`sales.funnel.steps.${s.key}`), count: s.count, prev: s.prev }))} ariaLabel={t('sales.funnel.aria')} />
      ) : (
        <p className="py-8 text-center text-sm text-muted">{t('sales.empty')}</p>
      )}
    </Panel>
  );
};
