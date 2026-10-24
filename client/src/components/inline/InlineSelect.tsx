import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Check, Pencil } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesAdminUx } from '@/i18n/pagesAdminUx';
import { Spinner } from '@/components/ui/Spinner';
import { onInlineEditRequest } from './optimistic';

registerCopy(pagesAdminUx);

export interface InlineOption {
  value: string;
  label: ReactNode;
  /** Plain text for type-ahead and the accessible name. */
  text: string;
  hint?: ReactNode;
}

/**
 * Click-to-edit table cell: shows the value as a button; click / Enter opens a small listbox (arrow keys,
 * Home / End, type-ahead, Enter or click to pick, Esc cancels, focus returns to the cell). `onSave` is awaited
 * while a spinner shows; the caller does the optimistic update and rollback (components/inline/optimistic.ts).
 * Rows can open it from the keyboard ("E") with requestInlineEdit(rowId, field).
 */
export const InlineSelect = ({
  label,
  value,
  options,
  display,
  onSave,
  disabled,
  disabledHint,
  rowId,
  field,
  primary,
  className,
}: {
  /** Accessible name of the field ("Status", "Responsible"). */
  label: string;
  value: string;
  options: InlineOption[];
  /** How the current value looks when not editing. */
  display: ReactNode;
  onSave: (value: string) => Promise<unknown> | void;
  disabled?: boolean;
  /** Tooltip when disabled (e.g. no allowed transition). */
  disabledHint?: string;
  rowId?: string;
  field?: string;
  /** Opened by a field-less edit request for its row. */
  primary?: boolean;
  className?: string;
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(0);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const typed = useRef({ text: '', at: 0 });
  const listId = useId();
  const canEdit = !disabled && !busy && options.length > 0;

  const openList = () => {
    if (!canEdit) return;
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) window.setTimeout(() => btnRef.current?.focus({ preventScroll: true }), 0);
  };

  useEffect(() => {
    if (!rowId) return;
    return onInlineEditRequest((d) => {
      if (d.rowId !== rowId || (d.field ? d.field !== field : !primary)) return;
      btnRef.current?.focus({ preventScroll: true });
      openList();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowId, field, primary, canEdit, value, options]);

  // The list is portalled to <body> (table wrappers scroll / clip), fixed under the cell or above it near the bottom.
  const [pos, setPos] = useState<CSSProperties>({});
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      const below = window.innerHeight - r.bottom;
      const up = below < 260 && r.top > below;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - 232));
      setPos(up ? { left, bottom: window.innerHeight - r.top + 4 } : { left, top: r.bottom + 4 });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.focus({ preventScroll: true });
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!wrapRef.current?.contains(t) && !listRef.current?.contains(t)) close(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pick = async (v: string) => {
    close();
    if (v === value) return;
    setBusy(true);
    try {
      await onSave(v);
    } finally {
      setBusy(false);
    }
  };

  const onListKey = (e: KeyboardEvent<HTMLUListElement>) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(options.length - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const o = options[active];
      if (o) void pick(o.value);
    } else if (e.key === 'Tab') {
      close(false);
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : '') + e.key.toLowerCase(), at: now };
      const i = options.findIndex((o) => o.text.toLowerCase().startsWith(typed.current.text));
      if (i >= 0) setActive(i);
    }
  };

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [active, open]);

  // Nothing to choose (no allowed change): plain text, no extra tab stop.
  if (!options.length && !busy)
    return (
      <span className={clsx('inline-flex max-w-full', className)} title={disabledHint}>
        {display}
      </span>
    );

  return (
    <span ref={wrapRef} className={clsx('relative inline-flex max-w-full', className)} onClick={(e) => e.stopPropagation()}>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`${label}: ${options.find((o) => o.value === value)?.text ?? value}. ${canEdit ? t('ux.inline.editHint') : ''}`.trim()}
        title={!canEdit && disabledHint ? disabledHint : undefined}
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          if (open) close();
          else openList();
        }}
        onKeyDown={(e) => {
          // Activation keys belong to this cell, not to a clickable row around it.
          if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            e.stopPropagation();
            openList();
          }
        }}
        className={clsx(
          'group/inl inline-flex max-w-full min-w-0 items-center gap-1 rounded-md text-left transition outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50',
          canEdit ? 'cursor-pointer hover:bg-brand-50/70 hover:ring-1 hover:ring-brand-200' : 'cursor-default',
        )}
      >
        <span className="min-w-0">{display}</span>
        {busy ? (
          <Spinner className="size-3 shrink-0 text-brand-600" />
        ) : canEdit ? (
          <Pencil className="size-3 shrink-0 text-muted opacity-0 transition group-hover/inl:opacity-100 group-focus-visible/inl:opacity-100" aria-hidden />
        ) : null}
      </button>
      {open &&
        createPortal(
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-label={label}
            aria-activedescendant={`${listId}-${active}`}
            onKeyDown={onListKey}
            onBlur={(e) => {
              const to = e.relatedTarget as Node | null;
              if (!wrapRef.current?.contains(to) && !listRef.current?.contains(to)) close(false);
            }}
            style={pos}
            className="fixed z-[140] max-h-64 max-w-[min(20rem,calc(100vw-1rem))] min-w-[12rem] overflow-auto rounded-lg border border-line bg-card p-1 text-sm shadow-xl outline-none"
          >
            {options.map((o, i) => (
              <li
                key={o.value}
                id={`${listId}-${i}`}
                data-index={i}
                role="option"
                aria-selected={o.value === value}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void pick(o.value)}
                className={clsx('flex cursor-pointer items-start gap-2 rounded-md px-2.5 py-1.5', i === active ? 'bg-brand-50 text-navy-900' : 'text-ink')}
              >
                <Check className={clsx('mt-0.5 size-3.5 shrink-0', o.value === value ? 'text-brand-600' : 'invisible')} aria-hidden />
                <span className="min-w-0">
                  <span className="block">{o.label}</span>
                  {o.hint && <span className="block text-[11px] text-muted">{o.hint}</span>}
                </span>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </span>
  );
};
