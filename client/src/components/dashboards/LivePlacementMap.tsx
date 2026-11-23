import { useMemo, useState } from 'react';
import { m, useReducedMotionConfig } from 'framer-motion';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { registerCopy } from '@/i18n';
import { pagesDashboards } from '@/i18n/pagesDashboards';
import { GERMANY, cityCoords, makeProjection } from '@/components/about/geo';
import { ErrorBlock, LoadingBlock } from '@/components/admin/ui';
import { DataTable, TableToggle, VIZ, useVizFormat } from '@/components/charts';
import { usePlacements, type PlacementCity } from './api';

registerCopy(pagesDashboards);

const MAP_W = 460;
const proj = makeProjection({ w: 5.6, e: 15.3, s: 47.1, n: 55.2 }, MAP_W, 14);
/** Room to the right of Germany for the Baku marker (the flight lines are schematic: Baku is far outside the map). */
const EXTRA = 130;
const VIEW_W = proj.width + EXTRA;
const BAKU: [number, number] = [VIEW_W - 34, 34];

type Placed = PlacementCity & { x: number; y: number; r: number };

const place = (cities: PlacementCity[]) => {
  const placed: Placed[] = [];
  const unplaced: PlacementCity[] = [];
  const max = Math.max(1, ...cities.map((c) => c.workers));
  for (const c of cities) {
    const ll = c.lat != null && c.lng != null ? ([c.lng, c.lat] as [number, number]) : cityCoords(c.city);
    if (!ll) {
      unplaced.push(c);
      continue;
    }
    const [x, y] = proj.project(ll);
    placed.push({ ...c, x, y, r: 4 + Math.sqrt(c.workers / max) * 9 });
  }
  return { placed, unplaced };
};

/** Quadratic curve from Baku to a city, arching upwards. */
const flightPath = (x: number, y: number) => {
  const cx = (BAKU[0] + x) / 2;
  const cy = Math.min(BAKU[1], y) - 40 - Math.abs(BAKU[0] - x) * 0.12;
  return `M${BAKU[0]},${BAKU[1]} Q${cx.toFixed(1)},${cy.toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}`;
};

/**
 * Live map of Germany for the admin: a dot per city where workers were placed (real data only: approved / arrived
 * cases, past placements, manual map entries — GET /admin/analytics/placements) and a line flying in from Baku to
 * each one. Lines draw in one after another and a small plane-dot travels along them; with "reduce motion" the map is
 * static. Dots are buttons (keyboard) that show the city's numbers; the table view is the text alternative.
 */
export const LivePlacementMap = () => {
  const { t } = useTranslation();
  const f = useVizFormat();
  const reduce = useReducedMotionConfig();
  const q = usePlacements();
  const [selected, setSelected] = useState<string | null>(null);
  const [table, setTable] = useState(false);
  const { placed, unplaced } = useMemo(() => place(q.data?.cities ?? []), [q.data]);

  if (q.isLoading) return <LoadingBlock />;
  if (q.error) {
    const status = (q.error as { response?: { status?: number } }).response?.status;
    return status === 403 ? <p className="py-8 text-center text-sm text-muted">{t('dash.map.restricted')}</p> : <ErrorBlock error={q.error} onRetry={() => void q.refetch()} />;
  }
  const d = q.data;
  if (!d || !d.cities.length) return <p className="py-8 text-center text-sm text-muted">{t('dash.map.empty')}</p>;

  const sel = d.cities.find((c) => c.cityKey === selected) ?? null;
  const summary = d.cities
    .slice(0, 8)
    .map((c) => `${c.city} ${c.workers}`)
    .join(', ');
  const top = new Set(placed.slice(0, 10).map((c) => c.cityKey));
  const tableId = 'placements-table';

  return (
    <figure className="m-0">
      <figcaption className="sr-only">{t('dash.map.aria', { summary })}</figcaption>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted">
        <span>
          {t('dash.map.total')}: <b className="text-lg text-ink tabular-nums">{f.num(d.total)}</b>
        </span>
        <span>
          {t('dash.map.cities')}: <b className="text-ink tabular-nums">{d.cities.length}</b>
        </span>
      </div>

      <svg viewBox={`0 0 ${VIEW_W} ${proj.height}`} className="mx-auto w-full max-w-[640px]" role="group" aria-label={t('dash.map.aria', { summary })}>
        <defs>
          <clipPath id="tv-live-de-clip">
            <path d={proj.path(GERMANY)} />
          </clipPath>
          <pattern id="tv-live-de-grid" width="12" height="12" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="1" fill="var(--ill-line)" />
          </pattern>
        </defs>
        <path d={proj.path(GERMANY)} fill="var(--ill-sky)" stroke="var(--color-line-strong)" strokeWidth="2" strokeLinejoin="round" />
        <rect width={proj.width} height={proj.height} fill="url(#tv-live-de-grid)" clipPath="url(#tv-live-de-clip)" />

        {/* flight lines from Baku */}
        <g fill="none" aria-hidden>
          {placed.map((c, i) => {
            const path = flightPath(c.x, c.y);
            const on = selected === c.cityKey;
            return (
              <g key={c.cityKey}>
                <m.path
                  d={path}
                  stroke={on ? VIZ[3] : VIZ[0]}
                  strokeOpacity={on ? 0.95 : 0.4}
                  strokeWidth={on ? 2 : 1.25}
                  strokeLinecap="round"
                  strokeDasharray="1 4"
                  initial={reduce ? false : { pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 1.1, delay: 0.15 + i * 0.09, ease: 'easeOut' }}
                />
                {!reduce && (
                  <circle r="2.6" fill={VIZ[3]} opacity="0">
                    <animateMotion dur={`${4 + (i % 4)}s`} begin={`${1.2 + i * 0.35}s`} repeatCount="indefinite" path={path} />
                    <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.9;1" dur={`${4 + (i % 4)}s`} begin={`${1.2 + i * 0.35}s`} repeatCount="indefinite" />
                  </circle>
                )}
              </g>
            );
          })}
        </g>

        {/* Baku */}
        <g aria-hidden>
          <circle cx={BAKU[0]} cy={BAKU[1]} r="7" fill="var(--color-ink)" />
          <circle cx={BAKU[0]} cy={BAKU[1]} r="3" fill="var(--color-highlight)" />
          <text x={BAKU[0]} y={BAKU[1] + 22} textAnchor="middle" className="fill-ink text-[12px] font-semibold">
            {t('dash.map.baku')}
          </text>
        </g>

        {/* cities */}
        {placed.map((c, i) => {
          const isSel = selected === c.cityKey;
          const labelLeft = c.x > proj.width * 0.62;
          return (
            <g
              key={c.cityKey}
              role="button"
              tabIndex={0}
              aria-pressed={isSel}
              aria-label={`${c.city}: ${t('dash.map.workers', { count: c.workers })}`}
              onClick={() => setSelected(isSel ? null : c.cityKey)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelected(isSel ? null : c.cityKey);
                }
              }}
              className="cursor-pointer outline-none [&:focus-visible>circle:first-child]:stroke-focus"
            >
              <m.circle
                cx={c.x}
                cy={c.y}
                r={c.r}
                fill={isSel ? 'var(--color-highlight)' : 'var(--color-primary)'}
                stroke="var(--color-card)"
                strokeWidth="2.5"
                initial={reduce ? false : { opacity: 0, scale: 0.4 }}
                animate={{ opacity: 1, scale: 1 }}
                style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                transition={{ duration: 0.4, delay: 0.1 + i * 0.07 }}
              />
              {!reduce && (
                <circle cx={c.x} cy={c.y} r={c.r} fill="none" stroke="var(--color-primary)" strokeWidth="1.5" opacity="0">
                  <animate attributeName="r" values={`${c.r};${c.r + 10}`} dur="2.6s" begin={`${i * 0.4}s`} repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.5;0" dur="2.6s" begin={`${i * 0.4}s`} repeatCount="indefinite" />
                </circle>
              )}
              {(top.has(c.cityKey) || isSel) && (
                <text
                  x={labelLeft ? c.x - c.r - 5 : c.x + c.r + 5}
                  y={c.y + 4}
                  textAnchor={labelLeft ? 'end' : 'start'}
                  className="fill-ink text-[11px] font-semibold"
                  style={{ paintOrder: 'stroke', stroke: 'var(--color-card)', strokeWidth: 4, strokeLinejoin: 'round' }}
                >
                  {c.city} · {c.workers}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <p className="mt-2 text-center text-[11px] text-muted">{t('dash.map.note')}</p>

      {sel && (
        <div className="mx-auto mt-3 max-w-md rounded-xl border border-line bg-surface/60 p-3 text-sm" aria-live="polite">
          <p className="font-semibold text-ink">
            {sel.city} · {t('dash.map.workers', { count: sel.workers })}
          </p>
          <p className="mt-1 text-xs text-muted">
            {t(`dash.map.source.${sel.source}`)}
            {sel.computed > 0 && ` · ${t('dash.map.computed', { count: sel.computed })}`}
            {sel.past > 0 && ` · ${t('dash.map.past', { count: sel.past })}`}
          </p>
          {sel.professions.length > 0 && <p className="mt-1 text-xs text-ink/80">{sel.professions.join(', ')}</p>}
        </div>
      )}
      {unplaced.length > 0 && <p className="mt-3 text-xs text-muted">{t('dash.map.unlocated', { list: unplaced.map((c) => `${c.city} (${c.workers})`).join(', ') })}</p>}

      <div className="mt-3 flex justify-end">
        <TableToggle open={table} onToggle={() => setTable((v) => !v)} controls={tableId} />
      </div>
      {table ? (
        <DataTable
          id={tableId}
          className={clsx('mt-2')}
          head={[t('dash.map.table'), t('dash.map.total'), t('dash.map.professions')]}
          rows={d.cities.map((c) => [c.city, f.num(c.workers), c.professions.join(', ') || '—'])}
        />
      ) : (
        <span id={tableId} hidden />
      )}
    </figure>
  );
};
