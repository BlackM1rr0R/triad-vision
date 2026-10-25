import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, GripVertical, Lock, Plus, Search, X } from 'lucide-react';
import { BarChart, LineChart, SERIES_COLORS, compactNumber } from '@/components/admin/charts';
import { DonutChart } from '@/components/admin/chartKit';
import {
  useReportFormat,
  type AggFn,
  type ChartType,
  type Dataset,
  type DatasetColumn,
  type FilterOp,
  type Granularity,
  type ReportConfig,
  type ReportFilter,
  type ReportResult,
  type StaffUser,
} from './types';

/** Building blocks of the report builder: column picker, filters, grouping, preview table and chart. */

const Section = ({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) => (
  <section className="min-w-0 rounded-xl border border-line bg-card p-4 sm:p-5">
    <h3 className="text-sm font-semibold text-ink">{title}</h3>
    {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    <div className="mt-3">{children}</div>
  </section>
);

const iconBtn = 'grid size-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-sunken hover:text-ink disabled:opacity-30';

// ─── Columns ────────────────────────────────────────────────────────────

export const ColumnsPicker = ({ dataset, value, onChange }: { dataset: Dataset; value: string[]; onChange: (cols: string[]) => void }) => {
  const { t } = useTranslation();
  const f = useReportFormat();
  const [q, setQ] = useState('');
  const [drag, setDrag] = useState<number | null>(null);
  const byKey = useMemo(() => new Map(dataset.columns.map((c) => [c.key, c])), [dataset]);
  const shown = dataset.columns.filter((c) => !q || f.tr(c.label).toLowerCase().includes(q.toLowerCase()));
  const toggle = (k: string) => onChange(value.includes(k) ? value.filter((x) => x !== k) : [...value, k]);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= value.length || from === to) return;
    const next = [...value];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    onChange(next);
  };
  return (
    <Section title={t('reports.columns')} hint={t('reports.columnsHint')}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="min-w-0">
          <p className="label">{t('reports.available')}</p>
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('reports.available')} />
          </div>
          <ul className="max-h-72 space-y-0.5 overflow-y-auto pr-1">
            {shown.map((c) => (
              <li key={c.key}>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-sunken">
                  <input type="checkbox" className="size-4 accent-primary" checked={value.includes(c.key)} onChange={() => toggle(c.key)} />
                  <span className="min-w-0 flex-1 truncate">{f.tr(c.label)}</span>
                  {c.masked && <Lock className="size-3.5 text-muted" aria-label={t('reports.masked')} />}
                </label>
              </li>
            ))}
          </ul>
        </div>
        <div className="min-w-0">
          <p className="label">{t('reports.selected')}</p>
          {value.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-xs text-muted">{t('reports.noColumns')}</p>
          ) : (
            <ol className="space-y-1">
              {value.map((k, i) => {
                const c = byKey.get(k);
                if (!c) return null;
                return (
                  <li
                    key={k}
                    draggable
                    onDragStart={() => setDrag(i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (drag !== null) move(drag, i);
                      setDrag(null);
                    }}
                    onDragEnd={() => setDrag(null)}
                    className={clsx('flex items-center gap-1 rounded-lg border border-line bg-sunken px-1.5 py-1 text-sm', drag === i && 'opacity-50')}
                  >
                    <GripVertical className="size-4 shrink-0 cursor-grab text-muted" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{f.tr(c.label)}</span>
                    <button type="button" className={iconBtn} onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={t('reports.moveUp')}>
                      <ArrowUp className="size-3.5" />
                    </button>
                    <button type="button" className={iconBtn} onClick={() => move(i, i + 1)} disabled={i === value.length - 1} aria-label={t('reports.moveDown')}>
                      <ArrowDown className="size-3.5" />
                    </button>
                    <button type="button" className={iconBtn} onClick={() => toggle(k)} aria-label={t('reports.remove')}>
                      <X className="size-3.5" />
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </Section>
  );
};

// ─── Filters ────────────────────────────────────────────────────────────

const defaultValue = (c: DatasetColumn, op: FilterOp): unknown => {
  if (op === 'empty' || op === 'notEmpty') return undefined;
  if (c.type === 'date') return op === 'relative' ? 'lastMonth' : op === 'between' ? { from: '', to: '' } : '';
  if (op === 'between') return ['', ''];
  if (c.type === 'enum' || c.type === 'user') return [];
  if (c.type === 'boolean') return true;
  return '';
};

const MultiPick = ({ options, value, onChange, placeholder }: { options: { value: string; label: string }[]; value: string[]; onChange: (v: string[]) => void; placeholder: string }) => {
  const [open, setOpen] = useState(false);
  const label = options.filter((o) => value.includes(o.value)).map((o) => o.label).join(', ');
  return (
    <div className="relative min-w-0">
      <button type="button" className="input truncate text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {label || <span className="text-muted">{placeholder}</span>}
      </button>
      {open && (
        <ul className="absolute z-20 mt-1 max-h-60 w-full min-w-[12rem] overflow-y-auto rounded-lg border border-line bg-card p-1 shadow-[var(--tv-shadow-raised)]">
          {options.map((o) => (
            <li key={o.value}>
              <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-sunken">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={value.includes(o.value)}
                  onChange={() => onChange(value.includes(o.value) ? value.filter((x) => x !== o.value) : [...value, o.value])}
                />
                <span className="truncate">{o.label}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const FilterValue = ({ col, filter, onChange, relativeRanges, users }: { col: DatasetColumn; filter: ReportFilter; onChange: (v: unknown) => void; relativeRanges: string[]; users: StaffUser[] }) => {
  const { t } = useTranslation();
  const f = useReportFormat();
  const v = filter.value;
  if (filter.op === 'empty' || filter.op === 'notEmpty') return null;
  if (col.type === 'date') {
    if (filter.op === 'relative')
      return (
        <select className="input" value={String(v ?? '')} onChange={(e) => onChange(e.target.value)} aria-label={t('reports.value')}>
          {relativeRanges.map((r) => (
            <option key={r} value={r}>
              {t(`reports.relative.${r}`)}
            </option>
          ))}
        </select>
      );
    if (filter.op === 'between') {
      const r = (v ?? {}) as { from?: string; to?: string };
      return (
        <div className="grid grid-cols-2 gap-2">
          <input type="date" className="input" value={r.from ?? ''} onChange={(e) => onChange({ ...r, from: e.target.value })} aria-label={t('reports.from')} />
          <input type="date" className="input" value={r.to ?? ''} onChange={(e) => onChange({ ...r, to: e.target.value })} aria-label={t('reports.to')} />
        </div>
      );
    }
    return <input type="date" className="input" value={String(v ?? '')} onChange={(e) => onChange(e.target.value)} aria-label={t('reports.value')} />;
  }
  if (col.type === 'enum')
    return (
      <MultiPick
        options={(col.enumValues ?? []).map((x) => ({ value: x, label: col.enumLabels?.[x] ? f.tr(col.enumLabels[x]) : x }))}
        value={Array.isArray(v) ? (v as string[]) : []}
        onChange={onChange}
        placeholder={t('reports.chooseValues')}
      />
    );
  if (col.type === 'user')
    return <MultiPick options={[{ value: 'me', label: t('reports.me') }, ...users.map((u) => ({ value: u.id, label: u.name }))]} value={Array.isArray(v) ? (v as string[]) : []} onChange={onChange} placeholder={t('reports.chooseValues')} />;
  if (col.type === 'boolean')
    return (
      <select className="input" value={v === false ? 'false' : 'true'} onChange={(e) => onChange(e.target.value === 'true')} aria-label={t('reports.value')}>
        <option value="true">{t('reports.bool.yes')}</option>
        <option value="false">{t('reports.bool.no')}</option>
      </select>
    );
  if ((col.type === 'number' || col.type === 'money') && filter.op === 'between') {
    const [lo, hi] = Array.isArray(v) ? (v as unknown[]) : ['', ''];
    return (
      <div className="grid grid-cols-2 gap-2">
        <input type="number" step="any" className="input" value={String(lo ?? '')} onChange={(e) => onChange([e.target.value, hi])} aria-label={t('reports.from')} />
        <input type="number" step="any" className="input" value={String(hi ?? '')} onChange={(e) => onChange([lo, e.target.value])} aria-label={t('reports.to')} />
      </div>
    );
  }
  return (
    <input
      type={col.type === 'number' || col.type === 'money' ? 'number' : 'text'}
      step="any"
      className="input"
      value={String(v ?? '')}
      onChange={(e) => onChange(e.target.value)}
      aria-label={t('reports.value')}
    />
  );
};

export const FiltersEditor = ({
  dataset,
  value,
  onChange,
  relativeRanges,
  users,
}: {
  dataset: Dataset;
  value: ReportFilter[];
  onChange: (f: ReportFilter[]) => void;
  relativeRanges: string[];
  users: StaffUser[];
}) => {
  const { t } = useTranslation();
  const f = useReportFormat();
  const filterable = dataset.columns.filter((c) => c.ops.length);
  const byKey = new Map(dataset.columns.map((c) => [c.key, c]));
  const add = () => {
    const c = filterable.find((x) => x.key === dataset.dateColumn) ?? filterable[0];
    if (!c) return;
    onChange([...value, { column: c.key, op: c.ops[0], value: defaultValue(c, c.ops[0]) }]);
  };
  const set = (i: number, patch: Partial<ReportFilter>) => onChange(value.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <Section title={t('reports.filters')}>
      {value.length === 0 && <p className="mb-3 text-xs text-muted">{t('reports.noFilters')}</p>}
      <ul className="space-y-2">
        {value.map((flt, i) => {
          const col = byKey.get(flt.column);
          if (!col) return null;
          return (
            <li key={i} className="grid gap-2 rounded-lg border border-line p-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,10rem)_minmax(0,1.3fr)_auto] sm:items-center sm:border-0 sm:p-0">
              <select
                className="input"
                value={flt.column}
                aria-label={t('reports.field')}
                onChange={(e) => {
                  const c = byKey.get(e.target.value)!;
                  set(i, { column: c.key, op: c.ops[0], value: defaultValue(c, c.ops[0]) });
                }}
              >
                {filterable.map((c) => (
                  <option key={c.key} value={c.key}>
                    {f.tr(c.label)}
                  </option>
                ))}
              </select>
              <select className="input" value={flt.op} aria-label={t('reports.operator')} onChange={(e) => set(i, { op: e.target.value as FilterOp, value: defaultValue(col, e.target.value as FilterOp) })}>
                {col.ops.map((op) => (
                  <option key={op} value={op}>
                    {t(`reports.ops.${op}`)}
                  </option>
                ))}
              </select>
              <div className="min-w-0">
                <FilterValue col={col} filter={flt} onChange={(v) => set(i, { value: v })} relativeRanges={relativeRanges} users={users} />
              </div>
              <button type="button" className={clsx(iconBtn, 'justify-self-end')} onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label={t('reports.remove')}>
                <X className="size-4" />
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" className="btn-secondary btn-sm mt-3" onClick={add} disabled={!filterable.length}>
        <Plus className="size-4" /> {t('reports.addFilter')}
      </button>
    </Section>
  );
};

// ─── Group by + calculations + sort ─────────────────────────────────────

const GRANS: Granularity[] = ['day', 'week', 'month', 'quarter', 'year'];

export const GroupEditor = ({ dataset, config, onChange }: { dataset: Dataset; config: ReportConfig; onChange: (patch: Partial<ReportConfig>) => void }) => {
  const { t } = useTranslation();
  const f = useReportFormat();
  const groupable = dataset.columns.filter((c) => c.groupable);
  const aggCols = dataset.columns.filter((c) => c.aggregatable.length);
  const byKey = new Map(dataset.columns.map((c) => [c.key, c]));
  const grouped = config.groupBy.length > 0;
  const sortOptions = grouped
    ? [
        ...config.groupBy.map((g) => ({ key: g.column, label: f.tr(byKey.get(g.column)?.label) })),
        { key: 'count', label: t('reports.aggFn.count') },
        ...config.aggregations.filter((a) => a.fn !== 'count').map((a) => ({ key: `${a.fn}_${a.column}`, label: `${t(`reports.aggFn.${a.fn}`)} · ${f.tr(byKey.get(a.column)?.label)}` })),
      ]
    : dataset.columns.map((c) => ({ key: c.key, label: f.tr(c.label) }));
  const sort = config.sort ?? null;
  return (
    <Section title={`${t('reports.groupBy')} · ${t('reports.aggregations')}`}>
      <div className="space-y-2">
        {config.groupBy.map((g, i) => {
          const c = byKey.get(g.column);
          return (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <select
                className="input min-w-0 flex-1"
                value={g.column}
                aria-label={t('reports.groupBy')}
                onChange={(e) => onChange({ groupBy: config.groupBy.map((x, j) => (j === i ? { column: e.target.value, granularity: byKey.get(e.target.value)?.type === 'date' ? 'month' : undefined } : x)), sort: null })}
              >
                {groupable.map((col) => (
                  <option key={col.key} value={col.key}>
                    {f.tr(col.label)}
                  </option>
                ))}
              </select>
              {c?.type === 'date' && (
                <select className="input w-32" value={g.granularity ?? 'month'} aria-label={t('reports.groupBy')} onChange={(e) => onChange({ groupBy: config.groupBy.map((x, j) => (j === i ? { ...x, granularity: e.target.value as Granularity } : x)) })}>
                  {GRANS.map((gr) => (
                    <option key={gr} value={gr}>
                      {t(`reports.granularity.${gr}`)}
                    </option>
                  ))}
                </select>
              )}
              <button type="button" className={iconBtn} onClick={() => onChange({ groupBy: config.groupBy.filter((_, j) => j !== i), sort: null, ...(config.groupBy.length === 1 ? { aggregations: [], chart: null } : {}) })} aria-label={t('reports.remove')}>
                <X className="size-4" />
              </button>
            </div>
          );
        })}
        {config.groupBy.length < 2 && groupable.length > 0 && (
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => {
              const c = groupable.find((x) => !config.groupBy.some((g) => g.column === x.key)) ?? groupable[0];
              onChange({ groupBy: [...config.groupBy, { column: c.key, granularity: c.type === 'date' ? 'month' : undefined }], sort: null });
            }}
          >
            <Plus className="size-4" /> {t('reports.addGroup')}
          </button>
        )}
      </div>

      {grouped && (
        <div className="mt-4 space-y-2 border-t border-line pt-4">
          <p className="label">{t('reports.aggregations')}</p>
          <p className="text-xs text-muted">{t('reports.aggFn.count')} ✓</p>
          {config.aggregations
            .map((a, i) => ({ a, i }))
            .filter(({ a }) => a.fn !== 'count')
            .map(({ a, i }) => {
              const c = byKey.get(a.column);
              return (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <select className="input w-36" value={a.fn} aria-label={t('reports.aggregations')} onChange={(e) => onChange({ aggregations: config.aggregations.map((x, j) => (j === i ? { ...x, fn: e.target.value as AggFn } : x)), sort: null })}>
                    {(c?.aggregatable ?? []).map((fn) => (
                      <option key={fn} value={fn}>
                        {t(`reports.aggFn.${fn}`)}
                      </option>
                    ))}
                  </select>
                  <select
                    className="input min-w-0 flex-1"
                    value={a.column}
                    aria-label={t('reports.field')}
                    onChange={(e) => {
                      const nc = byKey.get(e.target.value)!;
                      onChange({ aggregations: config.aggregations.map((x, j) => (j === i ? { column: nc.key, fn: nc.aggregatable.includes(x.fn) ? x.fn : nc.aggregatable[0] } : x)), sort: null });
                    }}
                  >
                    {aggCols.map((col) => (
                      <option key={col.key} value={col.key}>
                        {f.tr(col.label)}
                      </option>
                    ))}
                  </select>
                  <button type="button" className={iconBtn} onClick={() => onChange({ aggregations: config.aggregations.filter((_, j) => j !== i), sort: null })} aria-label={t('reports.remove')}>
                    <X className="size-4" />
                  </button>
                </div>
              );
            })}
          {aggCols.length > 0 && config.aggregations.length < 12 && (
            <button type="button" className="btn-secondary btn-sm" onClick={() => onChange({ aggregations: [...config.aggregations, { column: aggCols[0].key, fn: aggCols[0].aggregatable[0] }] })}>
              <Plus className="size-4" /> {t('reports.addAggregation')}
            </button>
          )}
        </div>
      )}

      <div className="mt-4 grid gap-2 border-t border-line pt-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <label className="min-w-0">
          <span className="label">{t('reports.sort')}</span>
          <select
            className="input"
            value={sort?.column ?? ''}
            onChange={(e) => onChange({ sort: e.target.value ? { column: e.target.value, dir: sort?.dir ?? (grouped ? 'desc' : 'asc') } : null })}
          >
            <option value="">—</option>
            {sortOptions.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">&nbsp;</span>
          <select className="input" value={sort?.dir ?? 'asc'} disabled={!sort} onChange={(e) => sort && onChange({ sort: { ...sort, dir: e.target.value as 'asc' | 'desc' } })} aria-label={t('reports.sort')}>
            <option value="asc">{t('reports.asc')}</option>
            <option value="desc">{t('reports.desc')}</option>
          </select>
        </label>
      </div>
    </Section>
  );
};

// ─── Preview table ──────────────────────────────────────────────────────

const PAGE = 50;

export const PreviewTable = ({ result }: { result: ReportResult }) => {
  const { t } = useTranslation();
  const f = useReportFormat();
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(result.rows.length / PAGE));
  const rows = result.rows.slice(page * PAGE, page * PAGE + PAGE);
  const right = (type: string) => type === 'money' || type === 'number';
  if (!result.rows.length) return <p className="py-10 text-center text-sm text-muted">{t('reports.noRows')}</p>;
  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-max text-sm">
          <thead className="bg-sunken text-xs text-muted">
            <tr>
              {result.columns.map((c) => (
                <th key={c.key} scope="col" className={clsx('px-3 py-2 font-semibold whitespace-nowrap', right(c.type) ? 'text-right' : 'text-left')}>
                  {f.tr(c.label)}
                  {c.masked && <Lock className="ml-1 inline size-3" aria-label={t('reports.masked')} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-line">
                {result.columns.map((c) => (
                  <td key={c.key} className={clsx('max-w-[24rem] truncate px-3 py-1.5', right(c.type) && 'text-right tabular-nums')}>
                    {f.cell(c, r[c.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {result.totals && (
            <tfoot className="border-t-2 border-line bg-sunken font-semibold">
              <tr>
                {result.columns.map((c, i) => (
                  <td key={c.key} className={clsx('px-3 py-2', right(c.type) && 'text-right tabular-nums')}>
                    {result.totals![c.key] !== undefined ? f.cell({ ...c, column: undefined }, result.totals![c.key]) : i === 0 ? t('reports.totalRow') : ''}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-xs text-muted">
          <button type="button" className="btn-secondary btn-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            {t('reports.prev')}
          </button>
          <span>{t('reports.page', { page: page + 1, pages })}</span>
          <button type="button" className="btn-secondary btn-sm" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>
            {t('reports.next')}
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Chart ──────────────────────────────────────────────────────────────

// Pie view: the interactive donut of the chart kit (hover, legend toggles, table fallback).

export const ReportChart = ({ result, type, metric, onChange }: { result: ReportResult; type: ChartType; metric?: string; onChange: (c: { type: ChartType; metric?: string }) => void }) => {
  const { t } = useTranslation();
  const f = useReportFormat();
  const groupCols = result.columns.filter((c) => !c.fn);
  const metrics = result.columns.filter((c) => c.fn);
  const m = metrics.find((c) => c.key === metric) ?? metrics[metrics.length - 1];
  if (!result.grouped || !m) return <p className="py-10 text-center text-sm text-muted">{t('reports.chartNeedsGroup')}</p>;
  const label = (r: Record<string, unknown>) => groupCols.map((c) => f.cell(c, r[c.key])).join(' · ');
  const value = (r: Record<string, unknown>) => {
    const v = Number(r[m.key] ?? 0);
    return m.type === 'money' ? v / 100 : v;
  };
  const fmt = (v: number) => (m.type === 'money' ? f.cell({ type: 'money' }, v * 100) : f.num(v));
  const rows = result.rows.slice(0, 60);
  let pie = rows.map((r) => ({ label: label(r), value: value(r) }));
  if (pie.length > 8) {
    const sorted = [...pie].sort((a, b) => b.value - a.value);
    pie = [...sorted.slice(0, 7), { label: t('reports.pieOther'), value: sorted.slice(7).reduce((a, s) => a + s.value, 0) }];
  }
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-line p-0.5" role="group" aria-label={t('reports.chart')}>
          {(['bar', 'line', 'pie'] as ChartType[]).map((ct) => (
            <button key={ct} type="button" aria-pressed={type === ct} onClick={() => onChange({ type: ct, metric: m.key })} className={clsx('rounded-md px-3 py-1.5 text-xs font-semibold', type === ct ? 'bg-card text-ink shadow-[var(--tv-shadow-card)] ring-1 ring-line' : 'text-muted hover:text-ink')}>
              {t(`reports.chartTypes.${ct}`)}
            </button>
          ))}
        </div>
        {metrics.length > 1 && (
          <select className="input w-auto" value={m.key} onChange={(e) => onChange({ type, metric: e.target.value })} aria-label={t('reports.chartMetric')}>
            {metrics.map((c) => (
              <option key={c.key} value={c.key}>
                {f.tr(c.label)}
              </option>
            ))}
          </select>
        )}
      </div>
      {type === 'bar' && <BarChart bars={rows.map((r) => ({ label: label(r), value: value(r) }))} height={240} format={fmt} axisFormat={compactNumber} ariaLabel={t('reports.chartAria')} />}
      {type === 'line' && (
        <LineChart
          points={rows.map((r) => ({ x: label(r), values: { v: value(r) } }))}
          series={[{ key: 'v', label: f.tr(m.label), color: SERIES_COLORS[0] }]}
          hidden={new Set()}
          onToggle={() => undefined}
          xLabel={(x) => x}
          ariaLabel={t('reports.chartAria')}
          area
        />
      )}
      {type === 'pie' && <DonutChart slices={pie.map((p, i) => ({ key: `${i}`, ...p }))} format={fmt} ariaLabel={t('reports.chartAria')} size={200} />}
    </div>
  );
};
