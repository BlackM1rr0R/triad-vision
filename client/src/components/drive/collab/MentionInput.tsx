import { forwardRef, useImperativeHandle, useRef, useState, type KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import type { StaffPerson } from '../types';
import { MENTION_RE, mentionToken } from './api';

export interface MentionInputHandle {
  /** The text with every picked "@Name" turned into a mention token. */
  serialize: () => string;
  reset: (raw?: string) => void;
  focus: () => void;
}

/** Stored body → what the textarea shows ("@Name") plus the people already mentioned. */
const fromRaw = (raw: string) => {
  const picked = new Map<string, string>();
  const text = raw.replace(MENTION_RE, (_m, name: string, id: string) => {
    picked.set(name, id);
    return `@${name}`;
  });
  return { text, picked };
};

/**
 * Comment box with an @mention picker of active staff: typing "@" (and a few letters) opens the list;
 * Enter / click inserts "@First Last". Ctrl+Enter submits.
 */
export const MentionInput = forwardRef<MentionInputHandle, { initial?: string; placeholder: string; onSubmit: () => void; rows?: number; autoFocus?: boolean; disabled?: boolean }>(
  function MentionInput({ initial = '', placeholder, onSubmit, rows = 2, autoFocus, disabled }, ref) {
    const { t } = useTranslation();
    const start = fromRaw(initial);
    const [text, setText] = useState(start.text);
    const picked = useRef(start.picked);
    const area = useRef<HTMLTextAreaElement>(null);
    const [query, setQuery] = useState<{ q: string; at: number } | null>(null);
    const [active, setActive] = useState(0);

    const people = useQuery({
      queryKey: ['drive', 'people', query?.q ?? ''],
      queryFn: async () => (await api.get<{ people: StaffPerson[] }>('/drive/people', { params: { q: query?.q || undefined } })).data.people,
      enabled: !!query,
      staleTime: 30_000,
    });
    const options = (people.data ?? []).slice(0, 8);

    useImperativeHandle(ref, () => ({
      serialize: () => {
        let out = text;
        const names = [...picked.current.entries()].sort((a, b) => b[0].length - a[0].length);
        for (const [name, id] of names) {
          const [firstName, ...rest] = name.split(' ');
          out = out.split(`@${name}`).join(mentionToken({ id, firstName, lastName: rest.join(' ') }));
        }
        return out.trim();
      },
      reset: (raw = '') => {
        const r = fromRaw(raw);
        picked.current = r.picked;
        setText(r.text);
        setQuery(null);
      },
      focus: () => area.current?.focus(),
    }));

    const detect = (value: string, caret: number) => {
      const before = value.slice(0, caret);
      const m = /(^|\s)@([\p{L}\p{M}.'-]{0,30})$/u.exec(before);
      if (m) {
        setQuery({ q: m[2], at: caret - m[2].length - 1 });
        setActive(0);
      } else setQuery(null);
    };

    const pick = (p: StaffPerson) => {
      if (!query) return;
      const name = `${p.firstName} ${p.lastName}`.trim();
      const caret = area.current?.selectionStart ?? text.length;
      const next = `${text.slice(0, query.at)}@${name} ${text.slice(caret)}`;
      picked.current.set(name, p.id);
      setText(next);
      setQuery(null);
      const pos = query.at + name.length + 2;
      window.setTimeout(() => {
        area.current?.focus();
        area.current?.setSelectionRange(pos, pos);
      }, 0);
    };

    const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (query && options.length) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setActive((a) => (a + 1) % options.length);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setActive((a) => (a - 1 + options.length) % options.length);
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          pick(options[active]);
          return;
        }
      }
      if (e.key === 'Escape' && query) {
        e.stopPropagation();
        setQuery(null);
        return;
      }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        onSubmit();
      }
    };

    return (
      <div className="relative">
        <textarea
          ref={area}
          value={text}
          rows={rows}
          autoFocus={autoFocus}
          disabled={disabled}
          placeholder={placeholder}
          maxLength={4000}
          onChange={(e) => {
            setText(e.target.value);
            detect(e.target.value, e.target.selectionStart ?? e.target.value.length);
          }}
          onKeyDown={onKey}
          onBlur={() => window.setTimeout(() => setQuery(null), 150)}
          className="input min-h-[2.75rem] resize-y !py-2 !text-sm"
        />
        {query && (
          <ul className="absolute right-0 left-0 z-30 mt-1 max-h-56 overflow-y-auto rounded-lg border border-line bg-card py-1 shadow-[var(--tv-shadow-raised)]" role="listbox">
            {options.map((p, i) => (
              <li key={p.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(p)}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${i === active ? 'bg-primary/[0.06] dark:bg-white/10' : 'hover:bg-sunken'}`}
                >
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-[10px] font-bold text-link">{(p.firstName[0] ?? '') + (p.lastName[0] ?? '')}</span>
                  <span className="min-w-0 truncate text-ink">
                    {p.firstName} {p.lastName}
                  </span>
                  <span className="ml-auto truncate text-[11px] text-muted">{p.email}</span>
                </button>
              </li>
            ))}
            {people.data && options.length === 0 && <li className="px-3 py-2 text-xs text-muted">{t('driveCollab.comments.noPeople')}</li>}
          </ul>
        )}
      </div>
    );
  },
);

/** Renders a stored comment body with mention tokens as highlighted "@Name". */
export const CommentBody = ({ body }: { body: string }) => {
  const parts: (string | { name: string; id: string })[] = [];
  let last = 0;
  for (const m of body.matchAll(MENTION_RE)) {
    if (m.index! > last) parts.push(body.slice(last, m.index));
    parts.push({ name: m[1], id: m[2] });
    last = m.index! + m[0].length;
  }
  if (last < body.length) parts.push(body.slice(last));
  return (
    <p className="text-sm leading-relaxed break-words whitespace-pre-wrap text-ink">
      {parts.map((p, i) =>
        typeof p === 'string' ? (
          p
        ) : (
          <span key={i} className="rounded bg-primary/[0.06] px-1 font-semibold text-link dark:bg-brand-500/15 dark:text-brand-200">
            @{p.name}
          </span>
        ),
      )}
    </p>
  );
};
