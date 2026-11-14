import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ChartNoAxesCombined, CheckCircle2, ExternalLink, Eye, MousePointerClick, Percent, RefreshCw, ScanSearch, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesSearchConsole } from '@/i18n/pagesSearchConsole';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Table } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Flag } from '@/components/ui/Flag';
import { EmptyState, ErrorBlock, KpiCell, KpiStrip, ListSkeleton, Panel } from '@/components/admin/ui';

registerCopy(pagesSearchConsole);

interface Row {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

type Locale = 'az' | 'de' | 'en' | 'ru' | 'tr' | 'uk';
type DuplicateReason = 'http' | 'www' | 'lng' | 'query' | 'trailingSlash' | 'azPrefix' | 'alias';
interface StrikingRow extends Row {
  page: string | null;
}
interface LowCtrRow extends Row {
  kind: 'query' | 'page';
  expectedCtr: number;
  missedClicks: number;
}
interface LocaleStats extends Omit<Row, 'key'> {
  locale: Locale;
  pages: number;
}
interface DuplicateGroup {
  canonical: string;
  canonicalRow: Row | null;
  urls: (Row & { reasons: DuplicateReason[]; redirected: boolean })[];
  impressions: number;
  clicks: number;
}
interface Opportunities {
  strikingQueries: StrikingRow[];
  strikingPages: StrikingRow[];
  lowCtr: LowCtrRow[];
  locales: LocaleStats[];
  duplicates: DuplicateGroup[];
}

type GscErrorCode = 'AUTH_FAILED' | 'NO_ACCESS' | 'API_ERROR';
type NotConfigured = { configured: false; reason: 'MISSING_CREDENTIALS' | 'MISSING_SITE' | 'INVALID_CREDENTIALS'; siteUrl: string | null; serviceAccountEmail: string | null };

/** GET /api/admin/search-console (server lib/searchConsole.ts). */
type Result =
  | NotConfigured
  | {
      configured: true;
      siteUrl: string;
      serviceAccountEmail: string;
      cached: boolean;
      error: { code: GscErrorCode; message: string } | null;
      report: {
        startDate: string;
        endDate: string;
        totals: Omit<Row, 'key'>;
        queries: Row[];
        pages: Row[];
        days: Row[];
        /** Missing in a report cached by an older server build. */
        opportunities?: Opportunities;
        fetchedAt: string;
      } | null;
    };

interface InspectionRow {
  url: string;
  locale: Locale;
  path: string;
  verdict: string | null;
  coverageState: string | null;
  indexingState: string | null;
  robotsTxtState: string | null;
  pageFetchState: string | null;
  lastCrawlTime: string | null;
  googleCanonical: string | null;
  userCanonical: string | null;
  canonicalMismatch: boolean;
  link: string | null;
  error: { code: string; message: string } | null;
}

/** GET /api/admin/search-console/inspection (URL Inspection of the key pages, cached 24 h on the server). */
type InspectionResult =
  | NotConfigured
  | {
      configured: true;
      siteUrl: string;
      serviceAccountEmail: string;
      cached: boolean;
      error: { code: GscErrorCode; message: string } | null;
      report: { siteUrl: string; origin: string; rows: InspectionRow[]; fetchedAt: string } | null;
    };

const KEY = ['admin', 'search-console'];
const INSPECT_KEY = ['admin', 'search-console', 'inspection'];
/** Mirrors the server thresholds (lib/searchConsole.ts) for the explanations. */
const STRIKING = { min: 4, max: 20 };
const LOW_CTR_MIN_IMPRESSIONS = 20;
/** 6 languages × 7 key pages (server INSPECTION_PATHS). */
const INSPECTED_URLS = 42;

const pathOf = (url: string) => url.replace(/^https?:\/\/[^/]+/, '') || '/';
const bareUrl = (url: string) => url.replace(/^https:\/\//, '');

/** Shared number formats of the page. */
const useFormat = () => {
  const { i18n } = useTranslation();
  return {
    num: (n: number) => n.toLocaleString(i18n.language),
    pct: (n: number) => `${(n * 100).toLocaleString(i18n.language, { maximumFractionDigits: 1 })}%`,
    pos: (n: number) => n.toLocaleString(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    time: (iso: string) => new Date(iso).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }),
  };
};

const PageLink = ({ url, full = false }: { url: string; full?: boolean }) => (
  <a href={url} target="_blank" rel="noreferrer" className="break-all text-link hover:underline">
    {full ? bareUrl(url) : pathOf(url)}
  </a>
);

const Hint = ({ children }: { children: ReactNode }) => <p className="px-4 pt-3 pb-1 text-xs leading-relaxed text-muted sm:px-5">{children}</p>;

/** Opportunities computed on the server from the 28-day report: languages, striking distance, low CTR, duplicates. */
const OpportunitySections = ({ opp }: { opp: Opportunities }) => {
  const { t } = useTranslation();
  const { num, pct, pos } = useFormat();
  const empty = <EmptyState compact title={t('gsc.opp.none')} />;
  const striking = (render: (r: StrikingRow) => ReactNode, first: string) => [
    { key: 'key', header: first, primary: true, cell: render },
    { key: 'impressions', header: t('gsc.impressions'), numeric: true, cell: (r: StrikingRow) => num(r.impressions) },
    { key: 'clicks', header: t('gsc.clicks'), numeric: true, hideBelow: 'sm' as const, cell: (r: StrikingRow) => num(r.clicks) },
    { key: 'position', header: t('gsc.position'), numeric: true, cell: (r: StrikingRow) => pos(r.position) },
  ];
  return (
    <section aria-labelledby="gsc-opp" className="space-y-6">
      <div>
        <h2 id="gsc-opp" className="text-base font-semibold text-ink">
          {t('gsc.opp.title')}
        </h2>
        <p className="mt-1 text-xs text-muted">{t('gsc.opp.intro')}</p>
      </div>

      <Panel title={t('gsc.opp.locales')} bodyClassName="p-0 sm:p-0">
        <Hint>{t('gsc.opp.localesHint')}</Hint>
        <Table
          rows={opp.locales}
          rowKey={(r) => r.locale}
          stackOnMobile
          dense
          columns={[
            {
              key: 'locale',
              header: t('gsc.opp.locale'),
              primary: true,
              cell: (r) => (
                <span className="inline-flex items-center gap-2 font-medium uppercase">
                  <Flag code={r.locale} /> {r.locale}
                </span>
              ),
            },
            { key: 'pages', header: t('gsc.opp.pagesCount'), numeric: true, hideBelow: 'sm', cell: (r) => num(r.pages) },
            { key: 'clicks', header: t('gsc.clicks'), numeric: true, cell: (r) => num(r.clicks) },
            { key: 'impressions', header: t('gsc.impressions'), numeric: true, cell: (r) => num(r.impressions) },
            { key: 'ctr', header: t('gsc.ctr'), numeric: true, cell: (r) => (r.impressions ? pct(r.ctr) : '—') },
            { key: 'position', header: t('gsc.position'), numeric: true, cell: (r) => (r.impressions ? pos(r.position) : '—') },
          ]}
        />
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title={t('gsc.opp.strikingQueries')} bodyClassName="p-0 sm:p-0">
          <Hint>{t('gsc.opp.strikingHint', STRIKING)}</Hint>
          <Table
            rows={opp.strikingQueries}
            rowKey={(r) => r.key}
            stackOnMobile
            dense
            empty={empty}
            columns={striking(
              (r) => (
                <span className="block">
                  <span className="break-words">{r.key}</span>
                  {r.page && (
                    <span className="mt-0.5 block text-xs text-muted">
                      <span className="sr-only">{t('gsc.opp.topPage')}: </span>
                      <PageLink url={r.page} />
                    </span>
                  )}
                </span>
              ),
              t('gsc.query'),
            )}
          />
        </Panel>
        <Panel title={t('gsc.opp.strikingPages')} bodyClassName="p-0 sm:p-0">
          <Hint>{t('gsc.opp.strikingHint', STRIKING)}</Hint>
          <Table rows={opp.strikingPages} rowKey={(r) => r.key} stackOnMobile dense empty={empty} columns={striking((r) => <PageLink url={r.key} />, t('gsc.page'))} />
        </Panel>
      </div>

      <Panel title={t('gsc.opp.lowCtr')} bodyClassName="p-0 sm:p-0">
        <Hint>{t('gsc.opp.lowCtrHint', { min: LOW_CTR_MIN_IMPRESSIONS })}</Hint>
        <Table
          rows={opp.lowCtr}
          rowKey={(r) => `${r.kind}:${r.key}`}
          stackOnMobile
          dense
          empty={empty}
          columns={[
            {
              key: 'key',
              header: t('gsc.opp.item'),
              primary: true,
              cell: (r) => (
                <span className="flex items-start gap-2">
                  <Badge size="sm" tone={r.kind === 'query' ? 'info' : 'neutral'}>
                    {t(`gsc.opp.kind.${r.kind}`)}
                  </Badge>
                  {r.kind === 'page' ? <PageLink url={r.key} /> : <span className="break-words">{r.key}</span>}
                </span>
              ),
            },
            { key: 'impressions', header: t('gsc.impressions'), numeric: true, cell: (r) => num(r.impressions) },
            { key: 'ctr', header: t('gsc.ctr'), numeric: true, cell: (r) => pct(r.ctr) },
            { key: 'expected', header: t('gsc.opp.expected'), numeric: true, hideBelow: 'sm', cell: (r) => pct(r.expectedCtr) },
            { key: 'position', header: t('gsc.position'), numeric: true, hideBelow: 'sm', cell: (r) => pos(r.position) },
            { key: 'missed', header: t('gsc.opp.missed'), numeric: true, cell: (r) => pos(r.missedClicks) },
          ]}
        />
      </Panel>

      <Panel title={t('gsc.opp.duplicates')}>
        <p className="mb-4 text-xs leading-relaxed text-muted">{t('gsc.opp.duplicatesHint')}</p>
        {opp.duplicates.length === 0 ? (
          empty
        ) : (
          <ul className="divide-y divide-line">
            {opp.duplicates.map((g) => (
              <li key={g.canonical} className="py-3 first:pt-0 last:pb-0">
                <p className="text-sm font-medium text-ink">
                  <span className="sr-only">{t('gsc.opp.canonical')}: </span>
                  <PageLink url={g.canonical} full />
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {g.canonicalRow ? t('gsc.opp.canonicalStats', { clicks: num(g.canonicalRow.clicks), impressions: num(g.canonicalRow.impressions) }) : t('gsc.opp.canonicalMissing')}
                </p>
                <ul aria-label={t('gsc.opp.variants')} className="mt-2 space-y-1.5 border-l-2 border-line pl-3">
                  {g.urls.map((u) => (
                    <li key={u.key} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                      <span className="text-muted">
                        <PageLink url={u.key} full />
                      </span>
                      <span className="tabular-nums text-muted">
                        {num(u.impressions)} {t('gsc.impressions').toLowerCase()} · {num(u.clicks)} {t('gsc.clicks').toLowerCase()} · {pos(u.position)}
                      </span>
                      {u.reasons.map((reason) => (
                        <Badge key={reason} size="sm" tone="neutral">
                          {t(`gsc.opp.reason.${reason}`)}
                        </Badge>
                      ))}
                      <Badge size="sm" tone={u.redirected ? 'success' : 'warning'}>
                        {u.redirected ? t('gsc.opp.redirected') : t('gsc.opp.notRedirected')}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </section>
  );
};

const VERDICT_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = { PASS: 'success', PARTIAL: 'warning', FAIL: 'danger', NEUTRAL: 'neutral' };

/** URL Inspection of the key pages in every language: loaded on demand (the API quota is 2000 URLs a day). */
const IndexingCheck = () => {
  const { t } = useTranslation();
  const { num, time } = useFormat();
  const qc = useQueryClient();
  const cachedRun = qc.getQueryData<InspectionResult>(INSPECT_KEY);
  const [started, setStarted] = useState(!!cachedRun);
  const [refreshing, setRefreshing] = useState(false);
  const { data, isFetching, error, refetch } = useQuery({
    queryKey: INSPECT_KEY,
    queryFn: async () => (await api.get<InspectionResult>('/admin/search-console/inspection', { timeout: 5 * 60_000 })).data,
    enabled: started,
    staleTime: Infinity,
  });
  const recheck = async () => {
    setRefreshing(true);
    try {
      qc.setQueryData(INSPECT_KEY, (await api.get<InspectionResult>('/admin/search-console/inspection', { params: { refresh: '1' }, timeout: 5 * 60_000 })).data);
    } finally {
      setRefreshing(false);
    }
  };
  const busy = isFetching || refreshing;
  const result = data?.configured ? data : null;
  const rows = result?.report?.rows ?? [];
  const summary = {
    indexed: num(rows.filter((r) => r.verdict === 'PASS').length),
    total: num(rows.length),
    mismatch: num(rows.filter((r) => r.canonicalMismatch).length),
    errors: num(rows.filter((r) => r.error).length),
  };

  return (
    <Panel
      title={t('gsc.inspect.title')}
      icon={ScanSearch}
      actions={
        <Button
          variant="secondary"
          size="sm"
          icon={started ? RefreshCw : ScanSearch}
          loading={busy}
          onClick={() => (started && data ? void recheck() : setStarted(true))}
        >
          {started && data ? t('gsc.inspect.rerun') : t('gsc.inspect.run')}
        </Button>
      }
      bodyClassName="p-0 sm:p-0"
    >
      <Hint>{t('gsc.inspect.hint', { count: INSPECTED_URLS })}</Hint>
      <div aria-live="polite" className="px-4 pb-2 text-xs text-muted sm:px-5">
        {busy ? t('gsc.inspect.running') : result?.report ? `${t('gsc.inspect.checkedAt', { time: time(result.report.fetchedAt) })} · ${t('gsc.inspect.summary', summary)}` : null}
      </div>
      {error ? (
        <div className="p-4 sm:p-5">
          <ErrorBlock error={error} onRetry={() => void refetch()} />
        </div>
      ) : result?.error ? (
        <p role="alert" className="mx-4 mb-4 flex items-start gap-2 rounded-xl border border-line p-3 text-sm text-ink sm:mx-5">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-fg" aria-hidden />
          <span>
            {t(`gsc.error.${result.error.code}`)} <span className="text-muted">({result.error.message})</span>
          </span>
        </p>
      ) : null}
      {(rows.length > 0 || (busy && !data)) && (
        <Table
          rows={rows}
          loading={busy && !data}
          loadingRows={6}
          rowKey={(r) => r.url}
          stackOnMobile
          dense
          caption={t('gsc.inspect.title')}
          columns={[
            {
              key: 'url',
              header: t('gsc.inspect.url'),
              primary: true,
              cell: (r) => (
                <span className="inline-flex items-center gap-2">
                  <Flag code={r.locale} />
                  <PageLink url={r.url} />
                </span>
              ),
            },
            {
              key: 'coverage',
              header: t('gsc.inspect.coverage'),
              cell: (r) =>
                r.error ? (
                  <span className="text-danger-fg">
                    {t('gsc.inspect.rowError')}: {r.error.message}
                  </span>
                ) : (
                  <span className="flex flex-wrap items-center gap-1.5">
                    {r.verdict && (
                      <Badge size="sm" tone={VERDICT_TONE[r.verdict] ?? 'neutral'}>
                        {t(`gsc.inspect.verdict.${r.verdict}`, { defaultValue: r.verdict })}
                      </Badge>
                    )}
                    <span className="text-xs text-muted">{r.coverageState}</span>
                  </span>
                ),
            },
            { key: 'lastCrawl', header: t('gsc.inspect.lastCrawl'), hideBelow: 'md', cell: (r) => (r.lastCrawlTime ? time(r.lastCrawlTime) : t('gsc.inspect.never')) },
            {
              key: 'canonical',
              header: t('gsc.inspect.googleCanonical'),
              cell: (r) =>
                !r.googleCanonical ? (
                  t('gsc.inspect.never')
                ) : r.canonicalMismatch ? (
                  <span className="inline-flex items-start gap-1.5 text-warning-fg" title={t('gsc.inspect.mismatch')}>
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span className="sr-only">{t('gsc.inspect.mismatch')}: </span>
                    <PageLink url={r.googleCanonical} full />
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-muted">
                    <CheckCircle2 className="size-3.5 text-success-fg" aria-hidden /> {t('gsc.inspect.sameCanonical')}
                  </span>
                ),
            },
            {
              key: 'open',
              header: <span className="sr-only">{t('gsc.inspect.open')}</span>,
              hideBelow: 'sm',
              cell: (r) =>
                r.link ? (
                  <a href={r.link} target="_blank" rel="noreferrer" className="inline-flex text-link hover:underline" aria-label={`${t('gsc.inspect.open')}: ${pathOf(r.url)}`} title={t('gsc.inspect.open')}>
                    <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                ) : null,
            },
          ]}
        />
      )}
    </Panel>
  );
};

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
              {report.opportunities && <OpportunitySections opp={report.opportunities} />}
            </>
          )}
          <IndexingCheck />
        </div>
      )}
    </div>
  );
}
