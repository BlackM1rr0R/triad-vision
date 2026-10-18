import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ArrowDownAZ, ArrowUpAZ, Check, Search, X } from 'lucide-react';
import type { ColumnFilter } from './model';

/** Closes on outside click / Escape; keeps itself inside the viewport. */
const usePopup = (onClose: () => void) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('mousedown', down, true);
    window.addEventListener('keydown', key, true);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('mousedown', down, true);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);
  return ref;
};

const Floating = ({ x, y, onClose, children, className }: { x: number; y: number; onClose: () => void; children: ReactNode; className?: string }) => {
  const ref = usePopup(onClose);
  const [pos, setPos] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ left: Math.max(4, Math.min(x, window.innerWidth - r.width - 8)), top: Math.max(4, Math.min(y, window.innerHeight - r.height - 8)) });
  }, [x, y, ref]);
  return createPortal(
    <div ref={ref} style={{ position: 'fixed', left: pos.left, top: pos.top, zIndex: 60 }} className={clsx('rounded-xl border border-line bg-card text-ink shadow-2xl', className)}>
      {children}
    </div>,
    document.body,
  );
};

export interface MenuItem {
  label?: string;
  icon?: ReactNode;
  shortcut?: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
}

export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  return (
    <Floating x={x} y={y} onClose={onClose} className="min-w-56 py-1.5">
      <div role="menu">
        {items.map((it, i) =>
          it.separator ? (
            <div key={i} className="my-1 border-t border-line" role="separator" />
          ) : (
            <button
              key={i}
              type="button"
              role="menuitem"
              disabled={it.disabled}
              onClick={() => {
                onClose();
                it.onClick?.();
              }}
              className={clsx(
                'flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm disabled:cursor-not-allowed disabled:opacity-40',
                it.danger ? 'text-danger hover:bg-danger/10' : 'hover:bg-brand-50',
              )}
            >
              <span className="grid w-4 shrink-0 place-items-center text-muted">{it.icon}</span>
              <span className="flex-1">{it.label}</span>
              {it.shortcut && <span className="text-xs text-muted">{it.shortcut}</span>}
            </button>
          ),
        )}
      </div>
    </Floating>
  );
}

/** Column header menu: sort, "contains" text and a pick-list of the column's values. */
export function FilterMenu({
  x,
  y,
  title,
  values,
  filter,
  onChange,
  onSort,
  onClose,
}: {
  x: number;
  y: number;
  title: string;
  values: string[];
  filter: ColumnFilter | undefined;
  onChange: (f: ColumnFilter | undefined) => void;
  onSort?: (dir: 'asc' | 'desc') => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [contains, setContains] = useState(filter?.contains ?? '');
  const [picked, setPicked] = useState<Set<string> | null>(filter?.values ? new Set(filter.values) : null);
  const [search, setSearch] = useState('');
  const shown = useMemo(() => {
    const q = search.trim().toLocaleLowerCase();
    return (q ? values.filter((v) => v.toLocaleLowerCase().includes(q)) : values).slice(0, 500);
  }, [values, search]);
  const isPicked = (v: string) => !picked || picked.has(v);
  const toggle = (v: string) => {
    const next = new Set(picked ?? values);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    setPicked(next.size === values.length ? null : next);
  };
  const apply = () => {
    const f: ColumnFilter = {};
    if (contains.trim()) f.contains = contains.trim();
    if (picked) f.values = [...picked];
    onChange(Object.keys(f).length ? f : undefined);
    onClose();
  };
  return (
    <Floating x={x} y={y} onClose={onClose} className="w-72 p-3">
      <div className="mb-2 truncate text-xs font-semibold text-muted">{title}</div>
      {onSort && (
        <div className="mb-3 grid grid-cols-2 gap-2">
          <button type="button" className="flex items-center justify-center gap-1.5 rounded-lg border border-line px-2 py-1.5 text-xs font-semibold hover:bg-surface" onClick={() => (onSort('asc'), onClose())}>
            <ArrowDownAZ size={14} /> {t('sheet.sortAsc')}
          </button>
          <button type="button" className="flex items-center justify-center gap-1.5 rounded-lg border border-line px-2 py-1.5 text-xs font-semibold hover:bg-surface" onClick={() => (onSort('desc'), onClose())}>
            <ArrowUpAZ size={14} /> {t('sheet.sortDesc')}
          </button>
        </div>
      )}
      <label className="mb-1 block text-xs font-semibold text-ink/80">{t('sheet.filter.contains')}</label>
      <input className="input mb-3 py-1.5" value={contains} onChange={(e) => setContains(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && apply()} autoFocus />
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-semibold text-ink/80">{t('sheet.filter.values')}</span>
        <span className="flex gap-2">
          <button type="button" className="text-brand-600 hover:underline" onClick={() => setPicked(null)}>
            {t('sheet.filter.all')}
          </button>
          <button type="button" className="text-brand-600 hover:underline" onClick={() => setPicked(new Set())}>
            {t('sheet.filter.none')}
          </button>
        </span>
      </div>
      <div className="relative mb-1">
        <Search size={13} className="absolute top-1/2 left-2 -translate-y-1/2 text-muted" />
        <input className="input py-1 pl-7 text-xs" placeholder={t('sheet.filter.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="max-h-52 overflow-auto rounded-lg border border-line">
        {shown.map((v) => (
          <label key={v} className="flex cursor-pointer items-center gap-2 px-2 py-1 text-sm hover:bg-surface">
            <input type="checkbox" checked={isPicked(v)} onChange={() => toggle(v)} className="accent-brand-600" />
            <span className={clsx('truncate', !v && 'text-muted italic')}>{v || t('sheet.filter.blank')}</span>
          </label>
        ))}
        {!shown.length && <div className="px-2 py-3 text-center text-xs text-muted">—</div>}
      </div>
      <div className="mt-3 flex justify-between gap-2">
        <button type="button" className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-muted hover:bg-surface" onClick={() => (onChange(undefined), onClose())}>
          <X size={13} /> {t('sheet.filter.clear')}
        </button>
        <button type="button" className="flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700" onClick={apply}>
          <Check size={13} /> {t('sheet.filter.apply')}
        </button>
      </div>
    </Floating>
  );
}

/** Small anchored panel (colour palettes, format lists). */
export function Popover({ x, y, onClose, children, className }: { x: number; y: number; onClose: () => void; children: ReactNode; className?: string }) {
  return (
    <Floating x={x} y={y} onClose={onClose} className={clsx('p-2', className)}>
      {children}
    </Floating>
  );
}
