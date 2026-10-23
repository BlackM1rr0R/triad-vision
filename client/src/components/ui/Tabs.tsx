import { useCallback, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
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
        'flex min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        variant === 'underline' ? 'gap-1 border-b border-line' : ['max-w-full gap-1 rounded-xl bg-surface p-1', fullWidth ? 'w-full' : 'w-fit'],
        className,
      )}
    >
      {items.map((it) => {
        const active = it.key === value;
        const ids = tabIds(prefix, it.key);
        const Icon = it.icon;
        return (
          <button
            key={it.key}
            id={ids.tab}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={ids.panel}
            tabIndex={active ? 0 : -1}
            disabled={it.disabled}
            title={it.title}
            onClick={() => onChange(it.key)}
            className={clsx(
              'inline-flex items-center justify-center gap-1.5 font-semibold whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-50',
              fullWidth ? 'min-w-0 flex-1' : 'shrink-0',
              size === 'sm' ? 'text-xs' : 'text-sm',
              variant === 'underline'
                ? ['-mb-px border-b-2', size === 'sm' ? 'min-h-9 px-2.5 py-1.5' : 'min-h-11 px-3 py-2', active ? 'border-brand-600 text-ink' : 'border-transparent text-muted hover:border-line hover:text-ink']
                : ['rounded-lg', size === 'sm' ? 'min-h-8 px-2.5 py-1' : 'min-h-9 px-3 py-1.5', active ? 'bg-card text-ink shadow-sm' : 'text-muted hover:text-ink'],
              it.className,
            )}
          >
            {Icon && <Icon className="size-4 shrink-0" aria-hidden />}
            {it.label}
            {it.count !== undefined && (
              <span className={clsx('rounded-full px-1.5 text-[10px] tabular-nums', active ? 'bg-brand-100 text-brand-700' : 'bg-surface text-muted')}>{it.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
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
