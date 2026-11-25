import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Map as MapIcon, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesSearchConsoleTools } from '@/i18n/pagesSearchConsoleTools';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input, Select } from '@/components/ui/Field';
import { confirmDialog } from '@/components/ui';
import { AreaChart, Sparkline, VIZ, type ChartSeries } from '@/components/charts';
import { EmptyState, ErrorBlock, ListSkeleton, Panel } from '@/components/admin/ui';

registerCopy(pagesSearchConsoleTools);

/** Filters of the report (server lib/searchConsoleTracker.ts: normalizeExplore). */
export interface ExploreFilters {
  days: number;
  from: string;
  to: string;
  country: string;
  device: string;
}

export const DEFAULT_FILTERS: ExploreFilters = {
  days: 28,
  from: '',
  to: '',
  country: '',
  device: '',
};
export const PERIODS = [7, 28, 90, 180] as const;
export const COUNTRY_CODES = ['AZ', 'DE', 'RU', 'TR', 'UA', 'GE', 'KZ', 'UZ', 'AT', 'CH', 'US', 'GB'] as const;
const DEVICE_CODES = ['DESKTOP', 'MOBILE', 'TABLET'] as const;
const CUSTOM = 'custom';

/** Query parameters of GET /admin/search-console/explore. */
export const exploreParams = (f: ExploreFilters) => ({
  ...(f.from || f.to ? { from: f.from || undefined, to: f.to || undefined } : { days: f.days }),
  country: f.country || undefined,
  device: f.device || undefined,
});

const regionName = (code: string, lng: string) => {
  try {
    return new Intl.DisplayNames([lng], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
};

/** Period, country and device drop-downs (a chosen date range replaces the preset period). */
export const FilterBar = ({ value, onChange }: { value: ExploreFilters; onChange: (v: ExploreFilters) => void }) => {
  const { t, i18n } = useTranslation();
  const custom = !!(value.from || value.to);
  const label = 'mb-1 block text-xs font-medium text-muted';
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <label className={label} htmlFor="gsc-period">
          {t('gscx.filters.period')}
        </label>
        <Select
          id="gsc-period"
          value={custom ? CUSTOM : String(value.days)}
          onChange={(e) => {
            if (e.target.value === CUSTOM) {
              const end = new Date(Date.now() - 86_400_000);
              const start = new Date(end.getTime() - 27 * 86_400_000);
              onChange({
                ...value,
                from: start.toISOString().slice(0, 10),
                to: end.toISOString().slice(0, 10),
              });
            } else
              onChange({
                ...value,
                days: Number(e.target.value),
                from: '',
                to: '',
              });
          }}
        >
          {PERIODS.map((d) => (
            <option key={d} value={d}>
              {t('gscx.filters.days', { count: d })}
            </option>
          ))}
          <option value={CUSTOM}>{t('gscx.filters.custom')}</option>
        </Select>
      </div>
      {custom && (
        <>
          <div>
            <label className={label} htmlFor="gsc-from">
              {t('gscx.filters.from')}
            </label>
            <Input id="gsc-from" type="date" value={value.from} max={value.to || undefined} onChange={(e) => onChange({ ...value, from: e.target.value })} />
          </div>
          <div>
            <label className={label} htmlFor="gsc-to">
              {t('gscx.filters.to')}
            </label>
            <Input id="gsc-to" type="date" value={value.to} min={value.from || undefined} onChange={(e) => onChange({ ...value, to: e.target.value })} />
          </div>
        </>
      )}
      <div>
        <label className={label} htmlFor="gsc-country">
          {t('gscx.filters.country')}
        </label>
        <Select id="gsc-country" value={value.country} onChange={(e) => onChange({ ...value, country: e.target.value })}>
          <option value="">{t('gscx.filters.allCountries')}</option>
          {COUNTRY_CODES.map((c) => (
            <option key={c} value={c}>
              {regionName(c, i18n.language)} ({c})
            </option>
          ))}
        </Select>
      </div>
      <div>
        <label className={label} htmlFor="gsc-device">
          {t('gscx.filters.device')}
        </label>
        <Select id="gsc-device" value={value.device} onChange={(e) => onChange({ ...value, device: e.target.value })}>
          <option value="">{t('gscx.filters.allDevices')}</option>
          {DEVICE_CODES.map((d) => (
            <option key={d} value={d}>
              {t(`gscx.filters.devices.${d}`)}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
};

/** Change against the previous period: arrow + percent (for position, down = better). */
export const Delta = ({ now, before, lowerIsBetter = false }: { now: number; before: number | null | undefined; lowerIsBetter?: boolean }) => {
  const { t } = useTranslation();
  if (before == null || before === 0) return null;
  const change = (now - before) / before;
  if (Math.abs(change) < 0.005) return null;
  const good = lowerIsBetter ? change < 0 : change > 0;
  const Arrow = change > 0 ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${good ? 'text-success-fg' : 'text-danger-fg'}`} title={t('gscx.filters.vsPrevious')}>
      <Arrow className="size-3" aria-hidden />
      {Math.abs(change * 100).toLocaleString(undefined, {
        maximumFractionDigits: 0,
      })}
      %
    </span>
  );
};

/** Clicks and impressions per day. */
export const TrendChart = ({ days }: { days: { key: string; clicks: number; impressions: number }[] }) => {
  const { t, i18n } = useTranslation();
  const fmt = new Intl.DateTimeFormat(i18n.language, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
  const series: ChartSeries[] = [
    { key: 'clicks', label: t('gsc.clicks'), color: VIZ[0] },
    { key: 'impressions', label: t('gsc.impressions'), color: VIZ[1] },
  ];
  return (
    <Panel title={t('gscx.trend.title')}>
      <AreaChart
        mode="line"
        points={days.map((d) => ({
          x: d.key,
          values: { clicks: d.clicks, impressions: d.impressions },
        }))}
        series={series}
        xLabel={(x) => fmt.format(new Date(`${x}T00:00:00Z`))}
        format={(v) => v.toLocaleString(i18n.language)}
        ariaLabel={t('gscx.trend.aria')}
        emptyText={t('gsc.noRows')}
        height={220}
      />
    </Panel>
  );
};

/* ───────────────────────────────── Keyword tracker ───────────────────────────────── */

interface KeywordDay {
  day: string;
  clicks: number;
  impressions: number;
  position: number;
}
interface Summary {
  clicks: number;
  impressions: number;
  position: number;
}
interface TrackedKeyword {
  id: string;
  keyword: string;
  country: string;
  lastSyncedAt: string | null;
  trend: { current: Summary; previous: Summary; positionChange: number | null };
  days: KeywordDay[];
}

const KW_KEY = ['admin', 'search-console', 'keywords'];

const KeywordRow = ({ k, onRemove }: { k: TrackedKeyword; onRemove: () => void }) => {
  const { t, i18n } = useTranslation();
  const pos = (n: number) =>
    n.toLocaleString(i18n.language, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  const { current, positionChange } = k.trend;
  const withData = k.days.filter((d) => d.impressions > 0);
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      <div className="min-w-0 flex-1 basis-48">
        <p className="break-words font-medium text-ink">
          {k.keyword}
          {k.country && (
            <Badge tone="neutral" className="ml-2 align-middle">
              {k.country}
            </Badge>
          )}
        </p>
        <p className="text-xs text-muted">
          {k.lastSyncedAt
            ? t('gscx.kw.lastSynced', {
                time: new Date(k.lastSyncedAt).toLocaleString(i18n.language, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }),
              })
            : t('gscx.kw.never')}
        </p>
        {k.lastSyncedAt && !withData.length && <p className="text-xs text-muted">{t('gscx.kw.noData')}</p>}
      </div>
      {withData.length > 0 && (
        <>
          <Sparkline
            values={withData.map((d) => d.position)}
            label={`${t('gscx.kw.position')}: ${withData.map((d) => pos(d.position)).join(', ')}`}
            pointLabel={(i) => withData[i]!.day}
            format={pos}
            width={120}
            height={32}
            focusable={false}
          />
          <dl className="grid grid-cols-4 gap-x-4 text-right text-sm tabular-nums">
            <div>
              <dt className="text-xs text-muted">{t('gscx.kw.position')}</dt>
              <dd className="font-semibold text-ink">{current.impressions ? pos(current.position) : '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t('gscx.kw.change')}</dt>
              <dd className={positionChange == null || positionChange === 0 ? 'text-muted' : positionChange > 0 ? 'text-success-fg' : 'text-danger-fg'}>
                {positionChange == null ? '—' : `${positionChange > 0 ? '+' : ''}${pos(positionChange)}`}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t('gsc.clicks')}</dt>
              <dd className="text-ink">{current.clicks.toLocaleString(i18n.language)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t('gsc.impressions')}</dt>
              <dd className="text-ink">{current.impressions.toLocaleString(i18n.language)}</dd>
            </div>
          </dl>
        </>
      )}
      <Button variant="ghost" size="sm" icon={Trash2} onClick={onRemove} aria-label={`${t('gscx.kw.remove')}: ${k.keyword}`}>
        <span className="sr-only">{t('gscx.kw.remove')}</span>
      </Button>
    </li>
  );
};

/** Keyword tracker: staff add target keywords, the server stores their daily position / clicks. */
export const KeywordTracker = () => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [keyword, setKeyword] = useState('');
  const [country, setCountry] = useState('');
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: KW_KEY,
    queryFn: async () => (await api.get<{ keywords: TrackedKeyword[] }>('/admin/search-console/keywords')).data.keywords,
  });
  const fail = (e: unknown) => {
    const code = errorCode(e);
    toast.error(t(`gscx.kw.errors.${code}`, { defaultValue: t('gsc.error.API_ERROR') }));
  };
  const add = useMutation({
    mutationFn: async () => (await api.post<{ synced: boolean; keywords: TrackedKeyword[] }>('/admin/search-console/keywords', { keyword, country: country || undefined })).data,
    onSuccess: (r) => {
      qc.setQueryData(KW_KEY, r.keywords);
      setKeyword('');
      toast.success(r.synced ? t('gscx.kw.added') : t('gscx.kw.addedPending'));
    },
    onError: fail,
  });
  const refresh = useMutation({
    mutationFn: async () =>
      (
        await api.post<{
          synced: number;
          failed: number;
          keywords: TrackedKeyword[];
        }>('/admin/search-console/keywords/refresh')
      ).data,
    onSuccess: (r) => {
      qc.setQueryData(KW_KEY, r.keywords);
      toast.success(t('gscx.kw.refreshed', { synced: r.synced, failed: r.failed }));
    },
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/admin/search-console/keywords/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KW_KEY });
      toast.success(t('gscx.kw.removed'));
    },
    onError: fail,
  });

  return (
    <Panel
      title={t('gscx.kw.title')}
      actions={
        !!data?.length && (
          <Button variant="secondary" size="sm" icon={RefreshCw} loading={refresh.isPending} onClick={() => refresh.mutate()}>
            {t('gscx.kw.refresh')}
          </Button>
        )
      }
    >
      <p className="mb-4 text-xs leading-relaxed text-muted">{t('gscx.kw.intro')}</p>
      <form
        className="mb-2 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (keyword.trim().length >= 2) add.mutate();
        }}
      >
        <Input
          className="min-w-56 flex-1"
          value={keyword}
          maxLength={200}
          placeholder={t('gscx.kw.placeholder')}
          aria-label={t('gscx.kw.placeholder')}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <Select value={country} aria-label={t('gscx.filters.country')} onChange={(e) => setCountry(e.target.value)} className="w-auto">
          <option value="">{t('gscx.filters.allCountries')}</option>
          {COUNTRY_CODES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Button type="submit" size="sm" icon={Plus} loading={add.isPending} disabled={keyword.trim().length < 2}>
          {t('gscx.kw.add')}
        </Button>
      </form>
      {isLoading ? (
        <ListSkeleton />
      ) : error || !data ? (
        <ErrorBlock error={error} onRetry={() => void refetch()} />
      ) : data.length === 0 ? (
        <EmptyState compact title={t('gscx.kw.empty')} />
      ) : (
        <ul className="divide-y divide-line">
          {data.map((k) => (
            <KeywordRow
              key={k.id}
              k={k}
              onRemove={async () => {
                if (
                  await confirmDialog({
                    message: t('gscx.kw.removeConfirm', { keyword: k.keyword }),
                    confirmLabel: t('gscx.kw.remove'),
                  })
                )
                  remove.mutate(k.id);
              }}
            />
          ))}
        </ul>
      )}
    </Panel>
  );
};

/* ───────────────────────────────── Sitemap ───────────────────────────────── */

interface Sitemap {
  path: string;
  lastSubmitted: string | null;
  lastDownloaded: string | null;
  isPending: boolean;
  errors: number;
  warnings: number;
  contents: { type: string; submitted: number; indexed: number }[];
}
interface SitemapsResult {
  configured: boolean;
  sitemapUrl?: string;
  sitemaps?: Sitemap[];
  error?: { code: string; message: string } | null;
}

const SM_KEY = ['admin', 'search-console', 'sitemaps'];

/** Sitemaps of the property with Google's last status, and the "Sitemap göndər" button. */
export const SitemapPanel = () => {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: SM_KEY,
    queryFn: async () => (await api.get<SitemapsResult>('/admin/search-console/sitemaps')).data,
  });
  const submit = useMutation({
    mutationFn: async () => (await api.post<SitemapsResult>('/admin/search-console/sitemaps/submit')).data,
    onSuccess: (r) => {
      qc.setQueryData(SM_KEY, r);
      toast.success(t('gscx.sitemap.submitted'));
    },
    onError: (e) => {
      const code = errorCode(e);
      toast.error(code === 'NO_ACCESS' ? t('gscx.sitemap.noAccess') : code === 'RATE_LIMITED' ? t('gscx.sitemap.rateLimited') : t('gscx.sitemap.failed'));
    },
  });
  const time = (iso: string) =>
    new Date(iso).toLocaleString(i18n.language, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  return (
    <Panel
      title={t('gscx.sitemap.title')}
      icon={MapIcon}
      actions={
        <Button variant="secondary" size="sm" loading={submit.isPending} onClick={() => submit.mutate()}>
          {t('gscx.sitemap.submit')}
        </Button>
      }
    >
      <p className="mb-3 text-xs leading-relaxed text-muted">{t('gscx.sitemap.intro')}</p>
      {isLoading ? (
        <ListSkeleton />
      ) : error || !data ? (
        <ErrorBlock error={error} onRetry={() => void refetch()} />
      ) : (
        <>
          {data.error && (
            <p role="alert" className="mb-3 text-sm text-warning-fg">
              {data.error.code === 'NO_ACCESS' ? t('gscx.sitemap.noAccess') : t('gsc.error.API_ERROR')}
            </p>
          )}
          {data.sitemaps?.length ? (
            <ul className="divide-y divide-line">
              {data.sitemaps.map((s) => (
                <li key={s.path} className="py-3 text-sm">
                  <a href={s.path} target="_blank" rel="noreferrer" className="break-all text-link hover:underline">
                    {s.path}
                  </a>
                  <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                    <span>
                      {s.lastSubmitted
                        ? t('gscx.sitemap.lastSubmitted', {
                            time: time(s.lastSubmitted),
                          })
                        : null}
                    </span>
                    <span>
                      {s.lastDownloaded
                        ? t('gscx.sitemap.lastDownloaded', {
                            time: time(s.lastDownloaded),
                          })
                        : t('gscx.sitemap.notRead')}
                    </span>
                    {s.isPending && <Badge tone="warning">{t('gscx.sitemap.pending')}</Badge>}
                    {s.errors > 0 && <span className="text-danger-fg">{t('gscx.sitemap.errors', { count: s.errors })}</span>}
                    {s.warnings > 0 && <span className="text-warning-fg">{t('gscx.sitemap.warnings', { count: s.warnings })}</span>}
                  </p>
                  {s.contents.map((c) => (
                    <p key={c.type} className="text-xs text-muted">
                      {t('gscx.sitemap.urls', {
                        type: c.type,
                        submitted: c.submitted.toLocaleString(i18n.language),
                        indexed: c.indexed.toLocaleString(i18n.language),
                      })}
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          ) : (
            !data.error && <EmptyState compact title={t('gscx.sitemap.none')} />
          )}
        </>
      )}
    </Panel>
  );
};
