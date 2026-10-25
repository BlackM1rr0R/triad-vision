import { useCallback, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';

export type TabItem<K extends string = string> = {
  key: K;
  label: ReactNode;
  icon?: LucideIcon;
  /** Small counter after the label. */
  count?: number;
  disabled?: boolean;
  /** Native tooltip (e.g. the full name of an abbreviated label). */
  title?: string;
  /** Extra classes on this tab (e.g. "hidden sm:inline-flex" for desktop-only views). */
  className?: string;
};

export type TabsProps<K extends string = string> = {
  items: TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  /** Accessible name of the tab list. */
  label: string;
  /** "underline" (default, page sections) or "pills" (compact switches inside cards). */
  variant?: 'underline' | 'pills';
  /** Prefix for tab / panel ids, so <TabPanel id={…}> can reference them (default: generated). */
  idPrefix?: string;
  /** "sm" = compact (inside dense forms), "md" default. */
  size?: 'sm' | 'md';
  /** Tabs share the full width equally (segmented control on phones). */
  fullWidth?: boolean;
  className?: string;
};

/** Ids that connect a tab to its panel. */
export const tabIds = (prefix: string, key: string) => ({ tab: `${prefix}-tab-${key}`, panel: `${prefix}-panel-${key}` });

/**
 * WAI-ARIA tabs: arrow keys / Home / End move between tabs (roving tabindex, automatic activation).
 * Render the active content in <TabPanel idPrefix={…} tabKey={value}>.
 *
 *   const [tab, setTab] = useTabParam('tab', ['list', 'settings'] as const, 'list');
 *   <Tabs label="Invoices" idPrefix="inv" items={[{ key: 'list', label: 'List' }, { key: 'settings', label: 'Settings' }]} value={tab} onChange={setTab} />
 *   <TabPanel idPrefix="inv" tabKey={tab}>…</TabPanel>
 */
export function Tabs<K extends string>({ items, value, onChange, label, variant = 'underline', idPrefix, size = 'md', fullWidth = false, className }: TabsProps<K>) {
  const autoId = useId();
  const prefix = idPrefix ?? `tabs${autoId}`;
  const listRef = useRef<HTMLDivElement>(null);
  const enabled = items.filter((i) => !i.disabled);
  const indicator = useTabIndicator(listRef, prefix, value);

  const move = (e: KeyboardEvent<HTMLDivElement>) => {
    const idx = enabled.findIndex((i) => i.key === value);
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % enabled.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + enabled.length) % enabled.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = enabled.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const key = enabled[next].key;
    onChange(key);
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>(`#${CSS.escape(tabIds(prefix, key).tab)}`)?.focus());
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      onKeyDown={move}
      className={clsx(
        'relative flex min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        variant === 'underline' ? 'gap-1 border-b border-line' : ['max-w-full gap-1 rounded-xl bg-sunken p-1', fullWidth ? 'w-full' : 'w-fit'],
        className,
      )}
    >
      {/* One indicator that slides to the active tab (falls back to the per-tab border / background until measured). */}
      {indicator && (
        <span
          aria-hidden
          className={clsx(
            'pointer-events-none absolute left-0',
            indicator.animate && 'transition-[transform,width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]',
            variant === 'underline' ? 'bottom-0 h-0.5 rounded-full bg-brand-600' : 'top-1 bottom-1 rounded-lg bg-card shadow-[var(--tv-shadow-card)] ring-1 ring-line/60',
          )}
          style={{ width: indicator.width, transform: `translateX(${indicator.left}px)` }}
        />
      )}
      {items.map((it) => {
        const active = it.key === value;
        const slid = active && !!indicator;
        const ids = tabIds(prefix, it.key);
        const Icon = it.icon;
        return (
          <button
            key={it.key}
            id={ids.tab}
            type="button"
            role="tab"
            aria-selected={active}
            // only when the caller names the ids: then a <TabPanel idPrefix=…> exists to point at
            aria-controls={idPrefix ? ids.panel : undefined}
            tabIndex={active ? 0 : -1}
            disabled={it.disabled}
            title={it.title}
            onClick={() => onChange(it.key)}
            className={clsx(
              'relative inline-flex items-center justify-center gap-1.5 font-medium whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-50',
              fullWidth ? 'min-w-0 flex-1' : 'shrink-0',
              size === 'sm' ? 'text-xs' : 'text-sm',
              variant === 'underline'
                ? ['-mb-px border-b-2', size === 'sm' ? 'min-h-9 px-2.5 py-1.5' : 'min-h-[var(--tv-control-h)] px-3 py-2', active ? clsx(slid ? 'border-transparent' : 'border-brand-600', 'text-ink') : 'border-transparent text-muted hover:border-line-strong hover:text-ink']
                : ['rounded-lg', size === 'sm' ? 'min-h-8 px-2.5 py-1' : 'min-h-9 px-3 py-1.5', active ? clsx(!slid && 'bg-card shadow-sm', 'text-ink') : 'text-muted hover:text-ink'],
              it.className,
            )}
          >
            {Icon && <Icon className="size-4 shrink-0" aria-hidden />}
            {it.label}
            {it.count !== undefined && (
              <span className={clsx('rounded-full px-1.5 text-[10px] font-semibold tabular-nums', active ? 'bg-brand-100 text-brand-700' : 'bg-sunken text-muted')}>{it.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Position of the active tab inside the tab list, for the sliding indicator. Measured before paint; the
 * first position is applied without a transition (no slide-in from the left on mount). CSS transitions are
 * off for reduced motion (index.css), so the indicator then simply jumps.
 */
function useTabIndicator(listRef: RefObject<HTMLDivElement | null>, prefix: string, value: string) {
  const [pos, setPos] = useState<{ left: number; width: number; animate: boolean } | null>(null);
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const tab = list.querySelector<HTMLElement>(`#${CSS.escape(tabIds(prefix, value).tab)}`);
      if (!tab || !tab.offsetWidth) return setPos(null);
      setPos((prev) => {
        const next = { left: tab.offsetLeft, width: tab.offsetWidth };
        if (prev && prev.left === next.left && prev.width === next.width) return prev;
        return { ...next, animate: prev !== null };
      });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    Array.from(list.children).forEach((c) => ro.observe(c));
    return () => ro.disconnect();
  }, [listRef, prefix, value]);
  return pos;
}

/** Panel for the active tab (role="tabpanel", labelled by its tab). */
export const TabPanel = ({ idPrefix, tabKey, children, className }: { idPrefix: string; tabKey: string; children: ReactNode; className?: string }) => {
  const ids = tabIds(idPrefix, tabKey);
  return (
    <div role="tabpanel" id={ids.panel} aria-labelledby={ids.tab} tabIndex={0} className={clsx('outline-none', className)}>
      {children}
    </div>
  );
};

/**
 * Tab state kept in a URL search param (?tab=settings), so tabs survive reloads and can be linked.
 * Unknown / missing values fall back to `fallback`; selecting the fallback removes the param.
 */
export function useTabParam<K extends string>(param: string, keys: readonly K[], fallback: K, opts: { replace?: boolean } = {}) {
  const [params, setParams] = useSearchParams();
  const raw = params.get(param);
  const value = (raw && (keys as readonly string[]).includes(raw) ? raw : fallback) as K;
  const set = useCallback(
    (next: K) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next === fallback) p.delete(param);
          else p.set(param, next);
          return p;
        },
        { replace: opts.replace ?? true },
      );
    },
    [setParams, param, fallback, opts.replace],
  );
  return [value, set] as const;
}
