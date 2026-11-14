import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { MessageSquareText, Settings2, Users } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesStaffDesk } from '@/i18n/pagesStaffDesk';
import { Spinner } from '@/components/ui/Spinner';
import { useCannedPicker, type CannedContext, type CannedPickerItem } from './api';

registerCopy(pagesStaffDesk);

/** "/" at the start or after whitespace, then the shortcut typed so far (letters, digits, - and _). */
const TRIGGER = /(^|\s)\/([\p{L}\p{N}_-]{0,40})$/u;
const MAX_SHOWN = 8;

const score = (r: CannedPickerItem, q: string) => {
  if (!q) return 1;
  const s = (r.shortcut ?? '').toLocaleLowerCase();
  const n = r.name.toLocaleLowerCase();
  if (s.startsWith(q)) return 4;
  if (n.startsWith(q)) return 3;
  if (s.includes(q) || n.includes(q)) return 2;
  return r.body.toLocaleLowerCase().includes(q) ? 1 : 0;
};

/**
 * Canned replies in a staff composer: typing "/" (at the start or after a space) opens a picker of the saved
 * replies (personal + team, the client's language variant, variables filled by the server); the text after the
 * slash filters, ↑ / ↓ choose, Enter / Tab insert, Esc closes. The caller keeps its own textarea and state:
 *
 *   const canned = useCannedComposer({ value: body, setValue: setBody, ref, context: { caseId } });
 *   <div className="relative"> <textarea ref={ref} onChange={(e) => { setBody(e.target.value); canned.onInput(e.currentTarget); }}
 *     onKeyDown={(e) => { if (canned.onKeyDown(e)) return; … }} /> {canned.popover} </div>
 */
export const useCannedComposer = ({ value, setValue, ref, context, placement = 'top' }: { value: string; setValue: (v: string) => void; ref: RefObject<HTMLTextAreaElement | null>; context: CannedContext; placement?: 'top' | 'bottom' }) => {
  const { t } = useTranslation();
  const [trigger, setTrigger] = useState<{ start: number; end: number; query: string } | null>(null);
  const [active, setActive] = useState(0);
  const [used, setUsed] = useState(false);
  const picker = useCannedPicker(context, used);

  const check = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el || el.selectionStart !== el.selectionEnd) {
      setTrigger(null);
      return;
    }
    const caret = el.selectionStart;
    const m = TRIGGER.exec(el.value.slice(0, caret));
    if (!m) {
      setTrigger(null);
      return;
    }
    const start = caret - m[2].length - 1;
    setUsed(true);
    setTrigger((prev) => (prev && prev.start === start && prev.query === m[2] ? prev : { start, end: caret, query: m[2] }));
  }, []);

  // A new query starts at the first match again.
  useEffect(() => setActive(0), [trigger?.start, trigger?.query]);

  // Close when the value is replaced from outside (sent, cleared, AI draft inserted).
  useEffect(() => {
    if (trigger && value.slice(trigger.start, trigger.start + 1) !== '/') setTrigger(null);
  }, [value, trigger]);

  const list = useMemo(() => {
    const q = (trigger?.query ?? '').toLocaleLowerCase();
    return (picker.data?.replies ?? [])
      .map((r) => ({ r, s: score(r, q) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, MAX_SHOWN)
      .map((x) => x.r);
  }, [picker.data, trigger?.query]);

  const insert = useCallback(
    (r: CannedPickerItem) => {
      if (!trigger) return;
      const next = value.slice(0, trigger.start) + r.filled + value.slice(trigger.end);
      setValue(next);
      setTrigger(null);
      const pos = trigger.start + r.filled.length;
      requestAnimationFrame(() => {
        const el = ref.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(pos, pos);
      });
    },
    [trigger, value, setValue, ref],
  );

  /** Returns true when the key was handled by the picker (the caller then skips its own handling). */
  const onKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (!trigger) return false;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setTrigger(null);
      return true;
    }
    if (!list.length) return false;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length);
      return true;
    }
    if ((e.key === 'Enter' && !e.ctrlKey && !e.metaKey) || e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      insert(list[Math.min(active, list.length - 1)]);
      return true;
    }
    return false;
  };

  const listId = useRef(`canned-${Math.random().toString(36).slice(2, 8)}`).current;
  const open = !!trigger;

  const popover = open ? (
    <div
      id={listId}
      role="listbox"
      aria-label={t('sd.canned.picker')}
      className={clsx('absolute inset-x-0 z-40 max-h-80 overflow-y-auto rounded-xl border border-line bg-card p-1 shadow-[var(--tv-shadow-raised)]', placement === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5')}
      onMouseDown={(e) => e.preventDefault()} // keep the textarea focused
    >
      <p className="flex items-center justify-between gap-2 px-2.5 pt-1.5 pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">
        <span className="inline-flex items-center gap-1.5">
          <MessageSquareText className="size-3.5" aria-hidden /> {t('sd.canned.picker')}
          {picker.data?.lang && <span className="rounded bg-sunken px-1 font-mono text-[10px] normal-case">{picker.data.lang}</span>}
        </span>
        <span className="hidden font-normal normal-case sm:inline">{t('sd.canned.keys')}</span>
      </p>
      {picker.isLoading ? (
        <div className="grid place-items-center py-5">
          <Spinner className="size-4 text-link" />
        </div>
      ) : list.length === 0 ? (
        <p className="px-2.5 py-3 text-sm text-muted">{trigger?.query ? t('sd.canned.noMatch', { q: trigger.query }) : t('sd.canned.none')}</p>
      ) : (
        <ul>
          {list.map((r, i) => (
            <li key={r.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => insert(r)}
                className={clsx('block w-full rounded-lg px-2.5 py-2 text-left', i === active ? 'bg-primary/[0.08]' : 'hover:bg-sunken')}
              >
                <span className="flex items-center gap-2 text-sm">
                  <span className="truncate font-semibold text-ink">{r.name}</span>
                  {r.shortcut && <span className="code-id shrink-0 text-xs text-link">/{r.shortcut}</span>}
                  {r.shared && (
                    <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded bg-sunken px-1.5 text-[10px] font-semibold text-muted">
                      <Users className="size-3" aria-hidden /> {t('sd.canned.team')}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 line-clamp-2 text-xs whitespace-pre-line text-muted">{r.filled}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-1 border-t border-line px-2.5 pt-1.5 pb-1">
        <Link to="/admin/canned-replies" className="inline-flex items-center gap-1 text-xs font-semibold text-link hover:underline">
          <Settings2 className="size-3.5" aria-hidden /> {t('sd.canned.manage')}
        </Link>
      </div>
    </div>
  ) : null;

  return {
    open,
    onKeyDown,
    /** Call from onChange / onClick / onKeyUp with the textarea: opens or updates the picker. */
    onInput: check,
    popover,
    /** ARIA wiring for the textarea while the picker is open. */
    aria: open ? { 'aria-controls': listId, 'aria-expanded': true, 'aria-autocomplete': 'list' as const } : {},
  };
};

/** Short hint under a composer: "/ — hazır cavablar". */
export const CannedHint = ({ className }: { className?: string }) => {
  const { t } = useTranslation();
  return <span className={clsx('text-[11px] text-muted', className)}>{t('sd.canned.hint')}</span>;
};
