import { useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { Activity as ActivityIcon, ArrowRight, Calendar, Flag, Link2, Pencil, Sparkles, Trash2, Type, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import type { Activity, Person, TimelineEntry } from './types';
import { usePeople } from './api';
import { Avatar, RichText } from './bits';
import { editorToTokens, fmtDayTime, fullName, priorityLabel, statusLabel, tokensToEditor } from './utils';

const MENTION_QUERY = /(^|\s)@([^\s@]{0,30})$/;

/**
 * Textarea with @mention autocomplete. People are shown as "@Full Name" while typing and stored as
 * "@[Full Name](user:<id>)" tokens, so names with spaces stay unambiguous.
 */
export const CommentEditor = ({
  initial = '',
  onSubmit,
  onCancel,
  submitLabel,
  autoFocus = false,
  compact = false,
}: {
  initial?: string;
  onSubmit: (body: string) => Promise<unknown>;
  onCancel?: () => void;
  submitLabel: string;
  autoFocus?: boolean;
  compact?: boolean;
}) => {
  const { t } = useTranslation();
  const people = usePeople();
  const start = useMemo(() => tokensToEditor(initial), [initial]);
  const [text, setText] = useState(start.text);
  const [picked, setPicked] = useState<Person[]>(start.people);
  const [query, setQuery] = useState<string | null>(null);
  const [hi, setHi] = useState(0);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  const matches = useMemo(() => {
    if (query === null) return [];
    const q = query.toLowerCase();
    return (people.data ?? []).filter((p) => fullName(p).toLowerCase().includes(q) || p.lastName.toLowerCase().startsWith(q)).slice(0, 6);
  }, [people.data, query]);

  const syncQuery = (value: string, caret: number) => {
    const m = MENTION_QUERY.exec(value.slice(0, caret));
    setQuery(m ? m[2] : null);
    setHi(0);
  };

  const choose = (p: Person) => {
    const el = ref.current;
    if (!el) return;
    const caret = el.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@([^\s@]{0,30})$/, `@${fullName(p)} `);
    const next = before + text.slice(caret);
    setText(next);
    setPicked((list) => (list.some((x) => x.id === p.id) ? list : [...list, p]));
    setQuery(null);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(before.length, before.length);
    });
  };

  const submit = async () => {
    const body = editorToTokens(text.trim(), picked.filter((p) => text.includes(`@${fullName(p)}`)));
    if (!body || busy) return;
    setBusy(true);
    try {
      await onSubmit(body);
      setText('');
      setPicked([]);
    } catch {
      /* the caller reports the error; keep the draft */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={text}
        autoFocus={autoFocus}
        rows={compact ? 2 : 3}
        maxLength={5000}
        placeholder={t('tasks.ph.comment')}
        aria-label={t('tasks.ph.comment')}
        onChange={(e) => {
          setText(e.target.value);
          syncQuery(e.target.value, e.target.selectionStart ?? e.target.value.length);
        }}
        onClick={(e) => syncQuery(text, e.currentTarget.selectionStart ?? text.length)}
        onKeyDown={(e) => {
          if (query !== null && matches.length) {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setHi((h) => (h + 1) % matches.length);
              return;
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setHi((h) => (h - 1 + matches.length) % matches.length);
              return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault();
              choose(matches[hi]);
              return;
            }
          }
          if (e.key === 'Escape' && query !== null) {
            e.preventDefault();
            e.stopPropagation();
            setQuery(null);
            return;
          }
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void submit();
          }
        }}
        className="input resize-y leading-relaxed"
      />
      {query !== null && matches.length > 0 && (
        <ul className="absolute bottom-full left-0 z-30 mb-1 w-64 rounded-xl border border-line bg-card p-1 shadow-xl" role="listbox">
          {matches.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === hi}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(p);
                }}
                className={clsx('flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm', i === hi ? 'bg-brand-50' : 'hover:bg-surface')}
              >
                <Avatar person={p} size="xs" />
                <span className="truncate font-medium text-ink">{fullName(p)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex items-center justify-end gap-2">
        <span className="mr-auto hidden text-[0.7rem] text-muted sm:inline">Ctrl + Enter</span>
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-secondary btn-sm">
            {t('tasks.actions.cancel')}
          </button>
        )}
        <button type="button" onClick={() => void submit()} disabled={!text.trim() || busy} className="btn-primary btn-sm">
          {busy && <Spinner className="size-3.5" />}
          {submitLabel}
        </button>
      </div>
    </div>
  );
};

const ACTIVITY_ICON: Record<Activity['type'], LucideIcon> = {
  created: Sparkles,
  status: ArrowRight,
  priority: Flag,
  due: Calendar,
  assignees: Users,
  case: Link2,
  title: Type,
};

export const activityText = (a: Activity, t: (k: string, o?: Record<string, unknown>) => string) => {
  switch (a.type) {
    case 'created':
      return t('tasks.activity.created');
    case 'status':
      return t('tasks.activity.status', { from: statusLabel(a.from), to: statusLabel(a.to) });
    case 'priority':
      return t('tasks.activity.priority', { from: priorityLabel(a.from), to: priorityLabel(a.to) });
    case 'due':
      if (!a.to) return t('tasks.activity.dueCleared');
      return a.from ? t('tasks.activity.dueChanged', { from: fmtDayTime(a.from), to: fmtDayTime(a.to) }) : t('tasks.activity.dueSet', { to: fmtDayTime(a.to) });
    case 'assignees':
      return [
        a.added.length ? t('tasks.activity.added', { names: a.added.map((x) => x.name).join(', ') }) : '',
        a.removed.length ? t('tasks.activity.removed', { names: a.removed.map((x) => x.name).join(', ') }) : '',
      ]
        .filter(Boolean)
        .join('; ');
    case 'case':
      return a.to ? t('tasks.activity.caseLinked', { to: a.to }) : t('tasks.activity.caseUnlinked');
    case 'title':
      return t('tasks.activity.title', { to: a.to });
    default:
      return '';
  }
};

/** Comments as bubbles and activity as quiet one-liners, oldest first. */
export const Timeline = ({
  entries,
  meId,
  onEdit,
  onDelete,
}: {
  entries: TimelineEntry[];
  meId: string | undefined;
  onEdit: (id: string, body: string) => Promise<unknown>;
  onDelete: (id: string) => void;
}) => {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<string | null>(null);
  const tt = (k: string, o?: Record<string, unknown>) => String(t(k, o));
  return (
    <ol className="space-y-3">
      {entries.map((e) => {
        const who = e.author ? `${fullName(e.author)}${e.author.id === meId ? ` (${tt('tasks.panel.you')})` : ''}` : tt('tasks.activity.someone');
        if (e.kind === 'activity') {
          if (!e.activity) return null;
          const Icon = ACTIVITY_ICON[e.activity.type] ?? ActivityIcon;
          return (
            <li key={e.id} className="flex items-start gap-3 pl-1 text-xs text-muted">
              <span className="mt-px grid size-6 shrink-0 place-items-center rounded-full bg-surface text-muted ring-1 ring-line">
                <Icon className="size-3" aria-hidden />
              </span>
              <p className="min-w-0 flex-1 pt-1 leading-relaxed">
                <span className="font-semibold text-ink/80">{who}</span> {activityText(e.activity, tt)}
                <span className="ml-1.5 whitespace-nowrap opacity-80">· {fmtDayTime(e.createdAt)}</span>
              </p>
            </li>
          );
        }
        return (
          <li key={e.id} className="flex items-start gap-3">
            {e.author ? <Avatar person={e.author} size="md" /> : <span className="size-8 shrink-0 rounded-full bg-slate-200" />}
            <div className="group min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-baseline gap-x-2 text-xs">
                <span className="font-semibold text-ink">{who}</span>
                <span className="text-muted">{fmtDayTime(e.createdAt)}</span>
                <span className="ml-auto flex gap-1 opacity-100 transition sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                  {e.canEdit && editing !== e.id && (
                    <button type="button" onClick={() => setEditing(e.id)} className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface hover:text-ink" aria-label={t('tasks.actions.edit')}>
                      <Pencil className="size-3.5" />
                    </button>
                  )}
                  {e.canDelete && (
                    <button type="button" onClick={() => onDelete(e.id)} className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface hover:text-danger" aria-label={t('tasks.actions.delete')}>
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </span>
              </div>
              {editing === e.id ? (
                <CommentEditor
                  initial={e.body}
                  autoFocus
                  compact
                  submitLabel={t('tasks.actions.save')}
                  onCancel={() => setEditing(null)}
                  onSubmit={async (body) => {
                    await onEdit(e.id, body);
                    setEditing(null);
                  }}
                />
              ) : (
                <RichText text={e.body} className="rounded-2xl rounded-tl-md border border-line bg-surface px-3.5 py-2.5 text-sm leading-relaxed text-ink" />
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
};
