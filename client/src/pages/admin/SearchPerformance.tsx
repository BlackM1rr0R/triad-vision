import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ChartNoAxesCombined, Eye, MousePointerClick, Percent, RefreshCw, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesSearchConsole } from '@/i18n/pagesSearchConsole';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Table } from '@/components/ui/Table';
import { EmptyState, ErrorBlock, KpiCell, KpiStrip, ListSkeleton, Panel } from '@/components/admin/ui';

registerCopy(pagesSearchConsole);

interface Row {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

/** GET /api/admin/search-console (server lib/searchConsole.ts). */
type Result =
  | { configured: false; reason: 'MISSING_CREDENTIALS' | 'MISSING_SITE' | 'INVALID_CREDENTIALS'; siteUrl: string | null; serviceAccountEmail: string | null }
  | {
      configured: true;
      siteUrl: string;
      serviceAccountEmail: string;
      cached: boolean;
      error: { code: 'AUTH_FAILED' | 'NO_ACCESS' | 'API_ERROR'; message: string } | null;
      report: { startDate: string; endDate: string; totals: Omit<Row, 'key'>; queries: Row[]; pages: Row[]; days: Row[]; fetchedAt: string } | null;
    };

const KEY = ['admin', 'search-console'];

/** Setup steps when GSC_SERVICE_ACCOUNT_JSON / GSC_SITE_URL are missing or unreadable. */
const Setup = ({ result }: { result: Extract<Result, { configured: false }> }) => {
  const { t } = useTranslation();
  const steps = t('gsc.setup.steps', { returnObjects: true }) as string[];
  return (
    <Panel>
      <EmptyState icon={ChartNoAxesCombined} title={t('gsc.setup.title')} text={t('gsc.setup.text')} padding="sm" />
      <ol className="mx-auto mt-2 max-w-2xl list-decimal space-y-2 pl-5 text-sm leading-relaxed text-ink marker:font-semibold marker:text-muted">
        {steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <div className="mx-auto mt-5 max-w-2xl space-y-2 rounded-xl bg-sunken p-4 text-sm">
        <p className="flex items-start gap-2 text-ink">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-fg" aria-hidden /> {t(`gsc.setup.reason.${result.reason}`)}
        </p>
        {result.serviceAccountEmail && <p className="break-all text-muted">{t('gsc.setup.account', { email: result.serviceAccountEmail })}</p>}
      </div>
    </Panel>
  );
};

/**
 * Admin → Sayt → Google axtarış nəticələri (/admin/search-performance, ADMIN+): Search Console totals, top
 * queries and top pages of the last 28 days (cached 6 h on the server), or the setup steps.
 */
export default function SearchPerformance() {
  const { t, i18n } = useTranslation();
  usePageTitle(t('gsc.title'));
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: KEY, queryFn: async () => (await api.get<Result>('/admin/search-console')).data });

  const refresh = async () => {
    setRefreshing(true);
    try {
      qc.setQueryData(KEY, (await api.get<Result>('/admin/search-console', { params: { refresh: '1' } })).data);
    } finally {
      setRefreshing(false);
    }
  };

  const num = (n: number) => n.toLocaleString(i18n.language);
  const pct = (n: number) => `${(n * 100).toLocaleString(i18n.language, { maximumFractionDigits: 1 })}%`;
  const pos = (n: number) => n.toLocaleString(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const columns = (first: string, render: (r: Row) => ReactNode) => [
    { key: 'key', header: first, primary: true, cell: (r: Row) => render(r) },
    { key: 'clicks', header: t('gsc.clicks'), numeric: true, cell: (r: Row) => num(r.clicks) },
    { key: 'impressions', header: t('gsc.impressions'), numeric: true, cell: (r: Row) => num(r.impressions) },
    { key: 'ctr', header: t('gsc.ctr'), numeric: true, hideBelow: 'sm' as const, cell: (r: Row) => pct(r.ctr) },
    { key: 'position', header: t('gsc.position'), numeric: true, hideBelow: 'sm' as const, cell: (r: Row) => pos(r.position) },
  ];

  const report = data?.configured ? data.report : null;
  return (
    <div>
      <PageHeader
        title={t('gsc.title')}
        subtitle={report && data?.configured ? t('gsc.subtitle', { from: report.startDate, to: report.endDate, site: data.siteUrl }) : undefined}
        actions={
          data?.configured ? (
            <Button variant="secondary" size="sm" icon={RefreshCw} loading={refreshing} onClick={() => void refresh()}>
              {t('gsc.refresh')}
            </Button>
          ) : undefined
        }
      />
      {isLoading ? (
        <ListSkeleton stats={4} />
      ) : error || !data ? (
        <ErrorBlock error={error} onRetry={() => void refetch()} />
      ) : !data.configured ? (
        <Setup result={data} />
      ) : (
        <div className="space-y-6">
          {data.error && (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-line bg-card p-4 text-sm text-ink">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-fg" aria-hidden />
              <span>
                {t(`gsc.error.${data.error.code}`)} <span className="text-muted">({data.error.message})</span>
                {data.error.code === 'NO_ACCESS' && <span className="mt-1 block break-all text-muted">{t('gsc.setup.account', { email: data.serviceAccountEmail })}</span>}
              </span>
            </div>
          )}
          {report && (
            <>
              <KpiStrip cols={4}>
                <KpiCell label={t('gsc.clicks')} icon={MousePointerClick} value={num(report.totals.clicks)} />
                <KpiCell label={t('gsc.impressions')} icon={Eye} value={num(report.totals.impressions)} />
                <KpiCell label={t('gsc.ctr')} icon={Percent} value={pct(report.totals.ctr)} />
                <KpiCell label={t('gsc.position')} icon={Search} value={pos(report.totals.position)} />
              </KpiStrip>
              <p className="text-xs text-muted">{t('gsc.cachedAt', { time: new Date(report.fetchedAt).toLocaleString(i18n.language) })}</p>
              <div className="grid gap-6 xl:grid-cols-2">
                <Panel title={t('gsc.queries')} bodyClassName="p-0 sm:p-0">
                  <Table
                    rows={report.queries}
                    rowKey={(r) => r.key}
                    stackOnMobile
                    dense
                    empty={<EmptyState compact title={t('gsc.noRows')} />}
                    columns={columns(t('gsc.query'), (r) => <span className="break-words">{r.key}</span>)}
                  />
                </Panel>
                <Panel title={t('gsc.pages')} bodyClassName="p-0 sm:p-0">
                  <Table
                    rows={report.pages}
                    rowKey={(r) => r.key}
                    stackOnMobile
                    dense
                    empty={<EmptyState compact title={t('gsc.noRows')} />}
                    columns={columns(t('gsc.page'), (r) => (
                      <a href={r.key} target="_blank" rel="noreferrer" className="break-all text-link hover:underline">
                        {r.key.replace(/^https?:\/\/[^/]+/, '') || '/'}
                      </a>
                    ))}
                  />
                </Panel>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
