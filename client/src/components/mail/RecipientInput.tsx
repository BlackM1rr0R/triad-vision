import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { X } from 'lucide-react';
import { api } from '@/lib/api';
import type { Address } from './types';
import { EMAIL_RE, avatarTone, initialsOf } from './utils';

/**
 * Chips + autocomplete for To/Cc/Bcc. Suggestions come from the shared address book
 * (GET /api/contacts?q=), the team (GET /api/tasks/people) and, as a fallback when the contacts API
 * is not available, recent correspondents of my own mailboxes (GET /api/mail/recipients?q=).
 */
interface Suggestion extends Address {
  source: 'contacts' | 'staff' | 'recent';
}

interface ContactRow {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  emails?: string[] | null;
}
interface Person {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
}

const useDebounced = (value: string, ms = 200) => {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
};

const fetchContacts = async (q: string): Promise<Suggestion[] | null> => {
  try {
    const res = await api.get<{ items?: ContactRow[]; contacts?: ContactRow[] }>('/contacts', { params: { q, limit: 8 } });
    const rows = res.data.items ?? res.data.contacts ?? [];
    const out: Suggestion[] = [];
    for (const c of rows) {
      const name = `${c.firstName} ${c.lastName ?? ''}`.trim();
      for (const email of [c.email, ...(Array.isArray(c.emails) ? c.emails : [])]) if (email && EMAIL_RE.test(email)) out.push({ name, address: email, source: 'contacts' });
    }
    return out;
  } catch {
    return null; // 404 before the contacts module exists → fall back to recent correspondents
  }
};

const fetchRecent = async (q: string): Promise<Suggestion[]> => {
  try {
    const res = await api.get<{ recipients: Address[] }>('/mail/recipients', { params: { q } });
    return res.data.recipients.map((r) => ({ ...r, source: 'recent' }));
  } catch {
    return [];
  }
};

const usePeople = () =>
  useQuery({
    queryKey: ['tasks', 'people'],
    queryFn: async () => (await api.get<{ people: Person[] }>('/tasks/people')).data.people,
    staleTime: 5 * 60_000,
  });

export const parseTyped = (raw: string): Address | null => {
  const s = raw.trim().replace(/[,;]$/, '').trim();
  if (!s) return null;
  const m = /^(.*?)\s*<([^<>]+)>$/.exec(s);
  const address = (m ? m[2]! : s).trim();
  if (!EMAIL_RE.test(address)) return null;
  return { name: m ? m[1]!.replace(/^"|"$/g, '').trim() : '', address };
};

export const RecipientInput = ({ value, onChange, placeholder, autoFocus, id, onInvalid }: { value: Address[]; onChange: (next: Address[]) => void; placeholder?: string; autoFocus?: boolean; id?: string; onInvalid?: (text: string) => void }) => {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const q = useDebounced(text.trim());
  const people = usePeople();

  const remote = useQuery({
    queryKey: ['mail', 'suggest', q],
    queryFn: async () => {
      const contacts = await fetchContacts(q);
      if (contacts && contacts.length) return contacts;
      return fetchRecent(q);
    },
    enabled: open && q.length >= 1,
    staleTime: 30_000,
  });

  const suggestions = useMemo(() => {
    const needle = q.toLowerCase();
    const chosen = new Set(value.map((a) => a.address.toLowerCase()));
    const out: Suggestion[] = [];
    const push = (s: Suggestion) => {
      const k = s.address.toLowerCase();
      if (chosen.has(k) || out.some((o) => o.address.toLowerCase() === k)) return;
      out.push(s);
    };
    for (const s of remote.data ?? []) push(s);
    if (needle) {
      for (const p of people.data ?? []) {
        const name = `${p.firstName} ${p.lastName}`.trim();
        if (p.email && (name.toLowerCase().includes(needle) || p.email.toLowerCase().includes(needle))) push({ name, address: p.email, source: 'staff' });
      }
    }
    return out.slice(0, 8);
  }, [remote.data, people.data, q, value]);

  useEffect(() => setCursor(0), [suggestions.length, q]);

  const add = (a: Address) => {
    if (value.some((v) => v.address.toLowerCase() === a.address.toLowerCase())) return;
    onChange([...value, a]);
  };

  const commit = () => {
    const parsed = parseTyped(text);
    if (parsed) {
      add(parsed);
      setText('');
      return true;
    }
    if (text.trim()) onInvalid?.(text.trim());
    return false;
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && suggestions.length) {
      e.preventDefault();
      setCursor((c) => (c + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp' && suggestions.length) {
      e.preventDefault();
      setCursor((c) => (c - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter' || e.key === 'Tab' || e.key === ',' || e.key === ';') {
      if (!text.trim() && e.key !== 'Enter') return;
      if (e.key === 'Tab' && !text.trim()) return;
      e.preventDefault();
      const s = suggestions[cursor];
      if (s && open && text.trim()) {
        add(s);
        setText('');
      } else commit();
    } else if (e.key === 'Backspace' && !text && value.length) {
      onChange(value.slice(0, -1));
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="relative min-w-0 flex-1">
      <div className="flex min-h-9 flex-wrap items-center gap-1 py-1" onClick={() => inputRef.current?.focus()}>
        {value.map((a) => (
          <span key={a.address} className={clsx('inline-flex max-w-full items-center gap-1 rounded-full border py-0.5 pr-1 pl-0.5 text-xs', EMAIL_RE.test(a.address) ? 'border-line bg-sunken text-ink' : 'border-danger/40 bg-danger-bg text-danger-fg')} title={a.address}>
            <span className={clsx('grid size-5 place-items-center rounded-full text-[0.55rem] font-bold', avatarTone(a.address))}>{initialsOf(a)}</span>
            <span className="truncate">{a.name?.trim() || a.address}</span>
            <button type="button" onClick={() => onChange(value.filter((v) => v !== a))} className="grid size-4 place-items-center rounded-full text-muted hover:text-danger-fg" aria-label={t('mail.actions.delete')}>
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          value={text}
          autoFocus={autoFocus}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            window.setTimeout(() => setOpen(false), 150);
            commit();
          }}
          onKeyDown={onKey}
          placeholder={value.length ? '' : (placeholder ?? t('mail.compose.recipientPlaceholder'))}
          className="min-w-[8rem] flex-1 bg-transparent py-1 text-sm text-ink outline-none placeholder:text-muted"
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      {open && text.trim() && suggestions.length > 0 && (
        <ul className="absolute top-full left-0 z-[95] mt-1 w-full max-w-md overflow-hidden rounded-xl border border-line bg-card p-1 shadow-[var(--tv-shadow-raised)]">
          {suggestions.map((s, i) => (
            <li key={`${s.source}-${s.address}`}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  add(s);
                  setText('');
                  inputRef.current?.focus();
                }}
                className={clsx('flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm', i === cursor ? 'bg-sunken' : 'hover:bg-sunken')}
              >
                <span className={clsx('grid size-6 shrink-0 place-items-center rounded-full text-[0.6rem] font-bold', avatarTone(s.address))}>{initialsOf(s)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">{s.name || s.address}</span>
                  {s.name && <span className="block truncate text-xs text-muted">{s.address}</span>}
                </span>
                <span className="shrink-0 text-[0.65rem] text-muted">{t(`mail.compose.${s.source === 'staff' ? 'staff' : s.source === 'contacts' ? 'contacts' : 'recent'}`)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
