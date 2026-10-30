import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, Columns3, GripVertical, RotateCcw } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { registerCopy } from '@/i18n';
import { pagesStaffPower } from '@/i18n/pagesStaffPower';
import { useEscapeLayer } from '@/components/ui/overlay';
import type { TablePrefs } from './api';
import { moveId, orderColumns } from './pure';

registerCopy(pagesStaffPower);

/**
 * Per-user table settings of the admin lists: which columns show, their order and width (and, on list pages,
 * table vs. list view). Stored in localStorage for an instant first paint and on the server (Setting
 * `staffUi:<userId>`, PUT /admin/me/table-prefs/:tableId) so they follow the user to another browser.
 * Density stays the global admin toggle (DensityToggle).
 */

export interface ColumnDef {
  id: string;
  /** Header text (also the label in the column chooser). */
  label: string;
  /** Header content when it differs from the label (e.g. an icon). */
  header?: ReactNode;
  /** Cannot be hidden (identifying column). */
  required?: boolean;
  /** Hidden until the user shows it. */
  defaultHidden?: boolean;
  /** Starting width in px (undefined = automatic). */
  width?: number;
  minWidth?: number;
  align?: 'left' | 'right';
  /** Extra classes of the cells / header. */
  className?: string;
  thClassName?: string;
}

const MIN_W = 60;
const storageKey = (userId: string | undefined, tableId: string) => `tv-table:${userId ?? 'anon'}:${tableId}`;
const PREFS_KEY = ['staff-table-prefs'] as const;

const readLocal = (key: string): TablePrefs | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as TablePrefs) : null;
  } catch {
    return null;
  }
};
const writeLocal = (key: string, prefs: TablePrefs | null) => {
  try {
    if (prefs) localStorage.setItem(key, JSON.stringify(prefs));
    else localStorage.removeItem(key);
  } catch {
    /* private mode */
  }
};

export { orderColumns };

export interface TableSettings {
  tableId: string;
  defs: ColumnDef[];
  /** Visible columns in display order. */
  columns: ColumnDef[];
  /** Every column in display order with its visibility. */
  all: (ColumnDef & { visible: boolean })[];
  prefs: TablePrefs;
  widthOf: (id: string) => number | undefined;
  setWidth: (id: string, w: number, persist?: boolean) => void;
  toggle: (id: string) => void;
  move: (id: string, toIndex: number) => void;
  setMode: (mode: 'table' | 'list') => void;
  mode: 'table' | 'list' | undefined;
  reset: () => void;
  /** Replaces the whole prefs (a saved view with columns). */
  apply: (prefs: TablePrefs | null) => void;
  customized: boolean;
}

export const useTableSettings = (tableId: string, defs: ColumnDef[]): TableSettings => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const key = storageKey(user?.id, tableId);
  const [prefs, setPrefs] = useState<TablePrefs>(() => readLocal(key) ?? {});
  const [live, setLive] = useState<Record<string, number>>({});
  const dirty = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  // Server copy (one request for every table of the user).
  const server = useQuery({
    queryKey: PREFS_KEY,
    queryFn: async () => (await api.get<{ tables: Record<string, TablePrefs> }>('/admin/me/table-prefs')).data.tables,
    staleTime: 10 * 60_000,
    enabled: !!user,
  });
  useEffect(() => {
    if (!server.data || dirty.current) return;
    const remote = server.data[tableId];
    if (remote) {
      setPrefs(remote);
      writeLocal(key, remote);
    }
  }, [server.data, tableId, key]);

  const save = useCallback(
    (next: TablePrefs | null) => {
      dirty.current = true;
      setPrefs(next ?? {});
      writeLocal(key, next);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        void api
          .put(`/admin/me/table-prefs/${encodeURIComponent(tableId)}`, { prefs: next })
          .then(() => qc.setQueryData<Record<string, TablePrefs>>(PREFS_KEY, (old) => {
            const copy = { ...(old ?? {}) };
            if (next) copy[tableId] = next;
            else delete copy[tableId];
            return copy;
          }))
          .catch(() => {
            /* kept in this browser; the next change retries */
          });
      }, 600);
    },
    [key, qc, tableId],
  );
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const hiddenSet = useMemo(() => new Set(prefs.hidden ?? defs.filter((d) => d.defaultHidden).map((d) => d.id)), [prefs.hidden, defs]);
  const order = useMemo(() => orderColumns(defs, prefs.order), [defs, prefs.order]);
  const byId = useMemo(() => new Map(defs.map((d) => [d.id, d])), [defs]);
  const all = order.map((id) => ({ ...byId.get(id)!, visible: byId.get(id)!.required || !hiddenSet.has(id) }));

  return {
    tableId,
    defs,
    all,
    columns: all.filter((c) => c.visible),
    prefs,
    widthOf: (id) => live[id] ?? prefs.widths?.[id] ?? byId.get(id)?.width,
    setWidth: (id, w, persist = true) => {
      const width = Math.round(Math.max(byId.get(id)?.minWidth ?? MIN_W, Math.min(1200, w)));
      if (!persist) {
        setLive((l) => ({ ...l, [id]: width }));
        return;
      }
      setLive((l) => {
        const { [id]: _drop, ...rest } = l;
        return rest;
      });
      save({ ...prefs, widths: { ...(prefs.widths ?? {}), [id]: width } });
    },
    toggle: (id) => {
      const def = byId.get(id);
      if (!def || def.required) return;
      const next = new Set(hiddenSet);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      save({ ...prefs, hidden: [...next] });
    },
    move: (id, toIndex) => {
      save({ ...prefs, order: moveId(order, id, toIndex) });
    },
    mode: prefs.mode,
    setMode: (mode) => save({ ...prefs, mode }),
    reset: () => save(prefs.mode ? { mode: prefs.mode } : null),
    apply: (p) => save(p ? { ...p } : null),
    customized: !!(prefs.order?.length || prefs.hidden || (prefs.widths && Object.keys(prefs.widths).length)),
  };
};

// ─── Column chooser ─────────────────────────────────────────────────────

/** "Sütunlar" button + popover: show / hide, drag (or ↑ ↓) to reorder, reset. */
export const ColumnChooser = ({ settings, className }: { settings: TableSettings; className?: string }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  useEscapeLayer(open, () => setOpen(false));
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  const hiddenCount = settings.all.filter((c) => !c.visible).length;
  return (
    <div ref={box} className={clsx('relative', className)} data-tour="sp-columns">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-line bg-card px-3.5 text-sm font-semibold whitespace-nowrap text-ink/80 transition hover:border-line-strong sm:min-h-9"
      >
        <Columns3 className="size-4" aria-hidden /> {t('sp.table.columns')}
        {hiddenCount > 0 && <span className="rounded bg-sunken px-1.5 text-[11px] text-muted tabular-nums">{t('sp.table.hiddenCount', { count: hiddenCount })}</span>}
      </button>
      {open && (
        <div role="dialog" aria-label={t('sp.table.chooserTitle')} className="absolute right-0 z-50 mt-1.5 w-72 rounded-xl border border-line bg-card p-2 shadow-[var(--tv-shadow-overlay)]">
          <p className="px-2 pt-1 pb-2 text-xs text-muted">{t('sp.table.chooserHint')}</p>
          <ul className="max-h-80 overflow-y-auto">
            {settings.all.map((c, i) => (
              <li
                key={c.id}
                draggable
                onDragStart={(e) => {
                  setDragId(c.id);
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', c.id);
                }}
                onDragOver={(e) => {
                  if (dragId) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragId && dragId !== c.id) settings.move(dragId, i);
                  setDragId(null);
                }}
                onDragEnd={() => setDragId(null)}
                className={clsx('flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm', dragId === c.id ? 'opacity-50' : 'hover:bg-sunken')}
              >
                <GripVertical className="size-3.5 shrink-0 cursor-grab text-subtle" aria-hidden />
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                  <input type="checkbox" className="size-4 accent-primary" checked={c.visible} disabled={c.required} onChange={() => settings.toggle(c.id)} />
                  <span className={clsx('truncate', !c.visible && 'text-muted')}>{c.label}</span>
                </label>
                <button type="button" className="grid size-6 place-items-center rounded text-muted hover:bg-line/60 hover:text-ink disabled:opacity-30" disabled={i === 0} onClick={() => settings.move(c.id, i - 1)} aria-label={t('sp.table.moveUp', { col: c.label })}>
                  <ArrowUp className="size-3" aria-hidden />
                </button>
                <button type="button" className="grid size-6 place-items-center rounded text-muted hover:bg-line/60 hover:text-ink disabled:opacity-30" disabled={i === settings.all.length - 1} onClick={() => settings.move(c.id, i + 1)} aria-label={t('sp.table.moveDown', { col: c.label })}>
                  <ArrowDown className="size-3" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-1 flex items-center justify-between border-t border-line px-1 pt-2">
            <span className="text-[11px] text-muted">{t('sp.table.resizeHint')}</span>
            <button type="button" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-link hover:bg-primary/[0.06] disabled:opacity-40" disabled={!settings.customized} onClick={settings.reset}>
              <RotateCcw className="size-3" aria-hidden /> {t('sp.table.reset')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Table ──────────────────────────────────────────────────────────────

export interface RowSelectionProps {
  isSelected: (id: string) => boolean;
  /** `shift` = extend the range from the last clicked row. */
  toggle: (id: string, on: boolean, shift: boolean) => void;
  allOnPage: boolean;
  someOnPage: boolean;
  togglePage: (on: boolean) => void;
}

const SelectCell = ({ checked, label, onChange }: { checked: boolean; label: string; onChange: (on: boolean, shift: boolean) => void }) => (
  <input
    type="checkbox"
    aria-label={label}
    className="size-4 cursor-pointer accent-primary"
    checked={checked}
    onClick={(e) => {
      e.stopPropagation();
      onChange(e.currentTarget.checked, e.shiftKey);
    }}
    onChange={() => {
      /* handled in onClick (needs shiftKey) */
    }}
  />
);

/** Header cell: drag to reorder, drag the right edge (or ← → on the handle) to resize. */
const HeaderCell = ({ col, settings, index, dragId, setDragId }: { col: ColumnDef; settings: TableSettings; index: number; dragId: string | null; setDragId: (id: string | null) => void }) => {
  const { t } = useTranslation();
  const w = settings.widthOf(col.id);
  const thRef = useRef<HTMLTableCellElement>(null);
  const startResize = (e: React.PointerEvent<HTMLSpanElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = thRef.current?.getBoundingClientRect().width ?? w ?? 120;
    let last = startW;
    const onMove = (ev: PointerEvent) => {
      last = startW + (ev.clientX - startX);
      settings.setWidth(col.id, last, false);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      settings.setWidth(col.id, last, true);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };
  const onKey = (e: ReactKeyboardEvent<HTMLSpanElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const cur = thRef.current?.getBoundingClientRect().width ?? w ?? 120;
    settings.setWidth(col.id, cur + (e.key === 'ArrowRight' ? 16 : -16));
  };
  const style: CSSProperties | undefined = w ? { width: w, minWidth: w, maxWidth: w } : undefined;
  return (
    <th
      ref={thRef}
      scope="col"
      style={style}
      draggable
      onDragStart={(e) => {
        setDragId(col.id);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', col.id);
      }}
      onDragOver={(e) => {
        if (dragId && dragId !== col.id) e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (dragId && dragId !== col.id) {
          const target = settings.all.findIndex((c) => c.id === col.id);
          settings.move(dragId, target);
        }
        setDragId(null);
      }}
      onDragEnd={() => setDragId(null)}
      data-col={col.id}
      data-index={index}
      className={clsx('group/th relative cursor-grab px-4 py-2.5 select-none', col.align === 'right' && 'text-right', dragId === col.id && 'opacity-50', col.thClassName)}
    >
      <span className="block truncate">{col.header ?? col.label}</span>
      <span
        role="separator"
        aria-orientation="vertical"
        aria-label={t('sp.table.resize', { col: col.label })}
        aria-valuenow={Math.round(w ?? 0)}
        aria-valuemin={60}
        aria-valuemax={1200}
        tabIndex={0}
        onPointerDown={startResize}
        onKeyDown={onKey}
        onClick={(e: ReactMouseEvent) => e.stopPropagation()}
        draggable={false}
        onDragStart={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        className="absolute top-1 right-0 bottom-1 w-2 cursor-col-resize rounded border-r-2 border-transparent outline-none group-hover/th:border-line-strong focus-visible:border-focus"
      />
    </th>
  );
};

export interface SettingsTableProps<T> {
  settings: TableSettings;
  rows: T[];
  rowKey: (row: T) => string;
  cells: Record<string, (row: T) => ReactNode>;
  selection?: RowSelectionProps;
  selectLabel?: string;
  selectAllLabel?: string;
  onRowClick?: (row: T, e: ReactMouseEvent<HTMLTableRowElement>) => void;
  rowClassName?: (row: T) => string | undefined;
  rowProps?: (row: T) => Record<string, unknown>;
  tableClassName?: string;
  bodyClassName?: string;
  className?: string;
  caption?: string;
}

/** Plain admin table that follows the user's column settings (order, visibility, width) with an optional select column. */
export function SettingsTable<T>({ settings, rows, rowKey, cells, selection, selectLabel, selectAllLabel, onRowClick, rowClassName, rowProps, tableClassName, bodyClassName, className, caption }: SettingsTableProps<T>) {
  const [dragId, setDragId] = useState<string | null>(null);
  return (
    <div className={clsx('overflow-x-auto rounded-xl border border-line bg-card', className)}>
      <table className={clsx('w-full text-left text-sm', tableClassName)}>
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="border-b border-line bg-surface/70 text-xs font-medium whitespace-nowrap text-muted">
          <tr>
            {selection && (
              <th className="w-8 py-2.5 pl-4" scope="col" data-tour="sp-select-all">
                <input
                  type="checkbox"
                  aria-label={selectAllLabel}
                  className="size-4 cursor-pointer accent-primary"
                  checked={selection.allOnPage}
                  ref={(el) => {
                    if (el) el.indeterminate = !selection.allOnPage && selection.someOnPage;
                  }}
                  onChange={(e) => selection.togglePage(e.target.checked)}
                />
              </th>
            )}
            {settings.columns.map((c, i) => (
              <HeaderCell key={c.id} col={c} settings={settings} index={i} dragId={dragId} setDragId={setDragId} />
            ))}
          </tr>
        </thead>
        <tbody className={clsx('divide-y divide-line', bodyClassName)}>
          {rows.map((row) => {
            const id = rowKey(row);
            const on = selection?.isSelected(id) ?? false;
            return (
              <tr
                key={id}
                data-row-id={id}
                aria-selected={selection ? on : undefined}
                onClick={onRowClick ? (e) => onRowClick(row, e) : undefined}
                className={clsx(onRowClick && 'cursor-pointer', 'transition hover:bg-primary/[0.04]', on && 'bg-primary/[0.05]', rowClassName?.(row))}
                {...(rowProps?.(row) ?? {})}
              >
                {selection && (
                  <td className="py-3 pl-4 align-top" onClick={(e) => e.stopPropagation()}>
                    <SelectCell checked={on} label={selectLabel ?? ''} onChange={(v, shift) => selection.toggle(id, v, shift)} />
                  </td>
                )}
                {settings.columns.map((c) => {
                  const w = settings.widthOf(c.id);
                  return (
                    <td key={c.id} style={w ? { width: w, minWidth: w, maxWidth: w } : undefined} className={clsx('px-4 py-3 align-top', c.align === 'right' && 'text-right', w && 'overflow-hidden', c.className)}>
                      {cells[c.id]?.(row) ?? null}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Table / list switch of pages that have both (persisted with the table settings). */
export const ViewModeToggle = ({ settings, fallback = 'list' }: { settings: TableSettings; fallback?: 'table' | 'list' }) => {
  const { t } = useTranslation();
  const mode = settings.mode ?? fallback;
  return (
    <div role="radiogroup" aria-label={t('sp.table.viewMode')} className="inline-flex shrink-0 gap-1 rounded-lg border border-line bg-card p-0.5">
      {(['list', 'table'] as const).map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          onClick={() => settings.setMode(m)}
          className={clsx('rounded-md px-2.5 py-1.5 text-xs font-semibold transition', mode === m ? 'bg-sunken text-ink' : 'text-muted hover:text-ink')}
        >
          {t(m === 'table' ? 'sp.table.viewTable' : 'sp.table.viewList')}
        </button>
      ))}
    </div>
  );
};
