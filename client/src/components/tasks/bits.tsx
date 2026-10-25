import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { Skeleton as UiSkeleton } from '@/components/ui/Skeleton';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, Clock, Flag, Search } from 'lucide-react';
import type { Person, TaskPriority, TaskStatus } from './types';
import {
  DUE_TONE,
  PRIORITY_TONE,
  STATUS_DOT,
  STATUS_TONE,
  avatarTone,
  dueLabel,
  dueState,
  fullName,
  initials,
  priorityLabel,
  richParts,
  statusLabel,
} from './utils';

export const Avatar = ({ person, size = 'md', ring = false }: { person: Person; size?: 'xs' | 'sm' | 'md' | 'lg'; ring?: boolean }) => (
  <span
    title={fullName(person)}
    className={clsx(
      'inline-grid shrink-0 place-items-center rounded-full font-bold select-none',
      avatarTone(person.id),
      ring && 'ring-2 ring-white',
      { xs: 'size-5 text-[0.55rem]', sm: 'size-6 text-[0.6rem]', md: 'size-8 text-[0.7rem]', lg: 'size-10 text-xs' }[size],
    )}
  >
    {initials(person)}
  </span>
);

export const AvatarStack = ({ people, max = 3, size = 'sm' }: { people: Person[]; max?: number; size?: 'xs' | 'sm' | 'md' }) => {
  if (!people.length) return null;
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <span className="flex items-center -space-x-1.5" title={people.map(fullName).join(', ')}>
      {shown.map((p) => (
        <Avatar key={p.id} person={p} size={size} ring />
      ))}
      {rest > 0 && (
        <span className={clsx('inline-grid place-items-center rounded-full bg-line font-bold text-muted ring-2 ring-white', size === 'xs' ? 'size-5 text-[0.55rem]' : 'size-6 text-[0.6rem]')}>
          +{rest}
        </span>
      )}
    </span>
  );
};

export const PriorityChip = ({ priority, compact = false }: { priority: TaskPriority; compact?: boolean }) => {
  useTranslation();
  if (compact && priority === 'NORMAL') return null;
  return (
    <span className={clsx('badge whitespace-nowrap', PRIORITY_TONE[priority])}>
      {priority === 'URGENT' ? <AlertTriangle className="size-3" aria-hidden /> : <Flag className="size-3" aria-hidden />}
      {priorityLabel(priority)}
    </span>
  );
};

export const StatusChip = ({ status }: { status: TaskStatus }) => {
  useTranslation();
  return (
    <span className={clsx('badge whitespace-nowrap', STATUS_TONE[status])}>
      <span className={clsx('size-1.5 rounded-full', STATUS_DOT[status])} aria-hidden />
      {statusLabel(status)}
    </span>
  );
};

export const DueChip = ({ dueAt, status, className }: { dueAt: string | null; status: TaskStatus; className?: string }) => {
  const { t } = useTranslation();
  const state = dueState(dueAt, status);
  if (!dueAt || !state) return null;
  return (
    <span className={clsx('badge whitespace-nowrap tabular-nums', DUE_TONE[state], state === 'done' && 'line-through decoration-1', className)}>
      {state === 'overdue' ? <AlertTriangle className="size-3" aria-hidden /> : <Clock className="size-3" aria-hidden />}
      {state === 'overdue' && <span className="sr-only">{t('tasks.due.overdue')}: </span>}
      {dueLabel(dueAt)}
    </span>
  );
};

export const ProgressBar = ({ done, total, className }: { done: number; total: number; className?: string }) => {
  const { t } = useTranslation();
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <span className={clsx('block h-1.5 overflow-hidden rounded-full bg-sunken', className)} role="progressbar" aria-label={t('ui.progress')} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <span className={clsx('block h-full rounded-full transition-[width] duration-300', pct === 100 ? 'bg-success' : 'bg-primary')} style={{ width: `${pct}%` }} />
    </span>
  );
};

/** Plain text with line breaks, safe links and mention chips. Never renders HTML. */
export const RichText = ({ text, className }: { text: string; className?: string }) => {
  const parts = useMemo(() => richParts(text), [text]);
  return (
    <div className={clsx('whitespace-pre-wrap break-words', className)}>
      {parts.map((p, i) =>
        p.type === 'text' ? (
          <span key={i}>{p.text}</span>
        ) : p.type === 'link' ? (
          <a key={i} href={p.href} target="_blank" rel="noopener noreferrer nofollow" className="font-medium text-link underline decoration-link/30 underline-offset-2 hover:decoration-link">
            {p.text}
          </a>
        ) : (
          <span key={i} className="rounded bg-primary/[0.06] px-1 font-semibold text-link">
            @{p.name}
          </span>
        ),
      )}
    </div>
  );
};

/**
 * Dropdown anchored below its trigger (the popover's parent element). Rendered in a portal with fixed
 * positioning, so scrolling containers (filter bar, task panel) never clip it. Closes on outside click
 * and Escape.
 */
export const Popover = ({
  open,
  onClose,
  children,
  className,
  align = 'left',
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  align?: 'left' | 'right';
}) => {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const place = () => {
      const trigger = anchorRef.current?.parentElement;
      const panel = panelRef.current;
      if (!trigger) return;
      const r = trigger.getBoundingClientRect();
      const w = panel?.offsetWidth ?? 280;
      const h = panel?.offsetHeight ?? 0;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let left = align === 'right' ? r.right - w : r.left;
      left = Math.max(8, Math.min(left, vw - w - 8));
      const below = vh - r.bottom - 12;
      const above = r.top - 12;
      const flip = h > below && above > below;
      const top = flip ? Math.max(8, r.top - 6 - Math.min(h, above)) : r.bottom + 6;
      setPos({ top, left, maxHeight: Math.max(160, flip ? above : below) });
    };
    place();
    const raf = requestAnimationFrame(place);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      const trigger = anchorRef.current?.parentElement;
      if (panelRef.current?.contains(target) || trigger?.contains(target)) return;
      closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <>
      <span ref={anchorRef} hidden />
      {open &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: 'fixed', top: pos?.top ?? -9999, left: pos?.left ?? -9999, maxHeight: pos?.maxHeight }}
            className={clsx('z-[90] overflow-y-auto rounded-xl border border-line bg-card p-1.5 text-ink shadow-[var(--tv-shadow-raised)]', className)}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
};

/** Searchable list of team members with check marks (assignee picker, filters). */
export const PeopleList = ({
  people,
  selected,
  onToggle,
  autoFocus = true,
  extra,
}: {
  people: Person[];
  selected: string[];
  onToggle: (p: Person) => void;
  autoFocus?: boolean;
  extra?: ReactNode;
}) => {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? people.filter((p) => `${fullName(p)} ${p.email ?? ''}`.toLowerCase().includes(s)) : people;
  }, [people, q]);
  return (
    <div className="w-72 max-w-[calc(100vw-2rem)]">
      <label className="relative mb-1 block">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted" aria-hidden />
        <input autoFocus={autoFocus} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('tasks.ph.searchPeople')} className="input py-2 pl-8 text-sm" />
      </label>
      {extra}
      <ul className="max-h-64 overflow-y-auto overscroll-contain py-0.5" role="listbox" aria-multiselectable>
        {shown.map((p) => {
          const on = selected.includes(p.id);
          return (
            <li key={p.id}>
              <button
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => onToggle(p)}
                className={clsx('flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-sunken', on && 'bg-primary/[0.06]')}
              >
                <Avatar person={p} size="sm" />
                <span className="min-w-0 flex-1 truncate font-medium text-ink">{fullName(p)}</span>
                {on && <Check className="size-4 shrink-0 text-link" aria-hidden />}
              </button>
            </li>
          );
        })}
        {!shown.length && <li className="px-2 py-3 text-center text-sm text-muted">{t('tasks.empty.people')}</li>}
      </ul>
    </div>
  );
};

/** Loading block: the design-system Skeleton (kept under this name for the task views). */
export const Skeleton = ({ className }: { className?: string }) => <UiSkeleton className={className} />;
