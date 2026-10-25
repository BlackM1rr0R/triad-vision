import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import clsx from 'clsx';

/** How an edit ended: commit and move (dr, dc), or cancel. */
export type EditEnd = { commit: true; value: string; dr: number; dc: number } | { commit: false };

interface BaseProps {
  style: CSSProperties;
  onEnd: (e: EditEnd) => void;
}

/**
 * In-cell text editor. "enter" mode (started by typing) commits and moves on arrow keys like Excel;
 * "edit" mode (F2 / double-click) keeps arrows inside the text. Alt+Enter inserts a line break.
 */
export function TextEditor({ style, value, mode, onChange, onEnd, align, autoFocus = true }: BaseProps & { value: string; mode: 'enter' | 'edit'; onChange: (v: string) => void; align?: string; autoFocus?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !autoFocus) return;
    el.focus({ preventScroll: true });
    const n = el.value.length;
    el.setSelectionRange(n, n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <textarea
      ref={ref}
      value={value}
      spellCheck={false}
      aria-label="cell editor"
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => {
        // Moving into the formula bar keeps the edit open.
        if (e.relatedTarget && (e.relatedTarget as HTMLElement).getAttribute('data-formula-bar') !== null) return;
        onEnd({ commit: true, value: ref.current?.value ?? value, dr: 0, dc: 0 });
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        const v = e.currentTarget.value;
        if (e.key === 'Enter' && e.altKey) {
          e.preventDefault();
          const el = e.currentTarget;
          const s = el.selectionStart;
          const next = v.slice(0, s) + '\n' + v.slice(el.selectionEnd);
          onChange(next);
          requestAnimationFrame(() => el.setSelectionRange(s + 1, s + 1));
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          onEnd({ commit: true, value: v, dr: e.shiftKey ? -1 : 1, dc: 0 });
        } else if (e.key === 'Tab') {
          e.preventDefault();
          onEnd({ commit: true, value: v, dr: 0, dc: e.shiftKey ? -1 : 1 });
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onEnd({ commit: false });
        } else if (mode === 'enter' && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && !v.startsWith('=')) {
          e.preventDefault();
          const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key as 'ArrowUp']!;
          onEnd({ commit: true, value: v, dr: d[0], dc: d[1] });
        }
      }}
      style={{ ...style, textAlign: (align as CSSProperties['textAlign']) ?? 'left' }}
      className="absolute z-20 resize-none overflow-hidden border-2 border-primary bg-field px-1.5 py-[3px] text-[13px] leading-[18px] text-ink shadow-[var(--tv-shadow-raised)] outline-none"
    />
  );
}

/** Date picker editor (value "YYYY-MM-DD"). */
export function DateEditor({ style, value, onEnd }: BaseProps & { value: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [v, setV] = useState(/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '');
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    try {
      ref.current?.showPicker?.();
    } catch {
      /* not allowed without a gesture in some browsers */
    }
  }, []);
  return (
    <input
      ref={ref}
      type="date"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onEnd({ commit: true, value: v, dr: 0, dc: 0 })}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          onEnd({ commit: true, value: v, dr: e.key === 'Enter' ? (e.shiftKey ? -1 : 1) : 0, dc: e.key === 'Tab' ? (e.shiftKey ? -1 : 1) : 0 });
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onEnd({ commit: false });
        }
      }}
      style={{ ...style, minWidth: Math.max(Number(style.width) || 0, 150) }}
      className="absolute z-20 border-2 border-primary bg-field px-1.5 text-[13px] text-ink shadow-[var(--tv-shadow-raised)] outline-none"
    />
  );
}

/** Drop-down list editor with type-to-filter and keyboard navigation. */
export function SelectEditor({ style, value, initialFilter, options, onEnd }: BaseProps & { value: string; initialFilter?: string; options: { value: string; label: string }[] }) {
  const [q, setQ] = useState(initialFilter ?? '');
  const all = useMemo(() => [{ value: '', label: '—' }, ...options], [options]);
  const list = useMemo(() => {
    const s = q.trim().toLocaleLowerCase();
    return s ? all.filter((o) => o.label.toLocaleLowerCase().includes(s) || (/^[A-Z_]+$/.test(o.value) && o.value.toLocaleLowerCase().startsWith(s))) : all;
  }, [all, q]);
  const [hi, setHi] = useState(() => Math.max(0, all.findIndex((o) => o.value === value)));
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => inputRef.current?.focus({ preventScroll: true }), []);
  useEffect(() => setHi((h) => Math.min(h, Math.max(0, list.length - 1))), [list.length]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${hi}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [hi]);
  const pick = (o: { value: string } | undefined, dr = 1, dc = 0) => onEnd(o ? { commit: true, value: o.value, dr, dc } : { commit: false });
  return (
    <div style={{ ...style, height: 'auto', minWidth: Math.max(Number(style.width) || 0, 200) }} className="absolute z-30 rounded-lg border-2 border-primary bg-card shadow-[var(--tv-shadow-raised)]">
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setHi(0);
        }}
        onBlur={(e) => {
          if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) onEnd({ commit: false });
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHi((h) => Math.min(list.length - 1, h + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHi((h) => Math.max(0, h - 1));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            pick(list[hi], e.shiftKey ? -1 : 1);
          } else if (e.key === 'Tab') {
            e.preventDefault();
            pick(list[hi], 0, e.shiftKey ? -1 : 1);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onEnd({ commit: false });
          }
        }}
        className="w-full border-b border-line bg-transparent px-2 py-1.5 text-[13px] text-ink outline-none"
      />
      <div ref={listRef} role="listbox" className="max-h-60 overflow-auto py-1">
        {list.map((o, i) => (
          <button
            key={o.value || '_none'}
            type="button"
            data-i={i}
            role="option"
            aria-selected={o.value === value}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => pick(o, 0)}
            onMouseEnter={() => setHi(i)}
            className={clsx('block w-full truncate px-2.5 py-1 text-left text-[13px]', i === hi ? 'bg-primary text-primary-contrast' : 'text-ink', o.value === value && i !== hi && 'font-semibold text-link')}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
