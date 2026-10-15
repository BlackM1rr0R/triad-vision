import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Briefcase, ChevronDown, Search, UserPlus, X } from 'lucide-react';
import type { CaseRef, Person, TaskPriority, TaskStatus } from './types';
import { TASK_PRIORITIES } from './types';
import { searchCases, usePeople } from './api';
import { Avatar, PeopleList, Popover } from './bits';
import { PRIORITY_TONE, STATUS_DOT, fullName, priorityLabel, statusLabel } from './utils';

const useDebounced = <T,>(value: T, ms = 250) => {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
};

/** Chips of the chosen assignees plus a searchable picker. */
export const AssigneeField = ({
  value,
  onChange,
  disabled = false,
  align = 'left',
}: {
  value: Person[];
  onChange: (next: Person[]) => void;
  disabled?: boolean;
  align?: 'left' | 'right';
}) => {
  const { t } = useTranslation();
  const people = usePeople();
  const [open, setOpen] = useState(false);
  const ids = value.map((p) => p.id);
  const toggle = (p: Person) => onChange(ids.includes(p.id) ? value.filter((x) => x.id !== p.id) : [...value, p]);
  return (
    <div className="relative flex flex-wrap items-center gap-1.5">
      {value.map((p) => (
        <span key={p.id} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card py-0.5 pr-1 pl-0.5 text-xs font-semibold text-ink">
          <Avatar person={p} size="xs" />
          <span className="max-w-[10rem] truncate">{fullName(p)}</span>
          {!disabled && (
            <button type="button" onClick={() => toggle(p)} className="grid size-5 place-items-center rounded-full text-muted hover:bg-surface hover:text-danger" aria-label={`${t('tasks.actions.remove')}: ${fullName(p)}`}>
              <X className="size-3" />
            </button>
          )}
        </span>
      ))}
      {!value.length && disabled && <span className="text-sm text-muted">{t('tasks.ph.noAssignee')}</span>}
      {!disabled && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-line px-2.5 py-1 text-xs font-semibold text-muted transition hover:border-brand-400 hover:text-brand-600"
          aria-expanded={open}
        >
          <UserPlus className="size-3.5" /> {value.length ? t('tasks.actions.add') : t('tasks.fields.assignees')}
        </button>
      )}
      <Popover open={open} onClose={() => setOpen(false)} align={align}>
        <PeopleList people={people.data ?? []} selected={ids} onToggle={toggle} />
      </Popover>
    </div>
  );
};

/** Search-as-you-type picker for the linked visa case. */
export const CaseField = ({
  value,
  onChange,
  disabled = false,
  align = 'left',
  placeholder,
}: {
  value: CaseRef | null;
  onChange: (next: CaseRef | null) => void;
  disabled?: boolean;
  align?: 'left' | 'right';
  /** label of the empty trigger (default "Not linked") */
  placeholder?: string;
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const debounced = useDebounced(q);
  const results = useQuery({ queryKey: ['tasks', 'case-options', debounced], queryFn: () => searchCases(debounced), enabled: open, staleTime: 30_000 });
  return (
    <div className="relative">
      {value ? (
        <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 py-1.5 text-sm">
          <Briefcase className="size-3.5 shrink-0 text-brand-600" aria-hidden />
          <span className="truncate font-semibold text-ink">{value.number}</span>
          <span className="truncate text-muted">· {value.clientName}</span>
          {!disabled && (
            <button type="button" onClick={() => onChange(null)} className="ml-1 grid size-5 shrink-0 place-items-center rounded-full text-muted hover:text-danger" aria-label={t('tasks.actions.clear')}>
              <X className="size-3" />
            </button>
          )}
        </span>
      ) : disabled ? (
        <span className="text-sm text-muted">{t('tasks.ph.noCase')}</span>
      ) : (
        <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-line px-2.5 py-1.5 text-sm font-medium text-muted hover:border-brand-400 hover:text-brand-600">
          <Briefcase className="size-3.5" /> {placeholder ?? t('tasks.ph.noCase')} <ChevronDown className="size-3.5" />
        </button>
      )}
      <Popover open={open} onClose={() => setOpen(false)} className="w-80 max-w-[calc(100vw-2rem)]" align={align}>
        <label className="relative mb-1 block">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted" aria-hidden />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('tasks.ph.searchCase')} className="input py-2 pl-8 text-sm" />
        </label>
        <ul className="max-h-64 overflow-y-auto py-0.5">
          {(results.data ?? []).map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                  setQ('');
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-surface"
              >
                <Briefcase className="size-3.5 shrink-0 text-muted" aria-hidden />
                <span className="font-semibold text-ink">{c.number}</span>
                <span className="truncate text-muted">{c.clientName}</span>
              </button>
            </li>
          ))}
          {results.isFetched && !results.data?.length && <li className="px-2 py-3 text-center text-sm text-muted">{t('tasks.empty.cases')}</li>}
        </ul>
      </Popover>
    </div>
  );
};

export const PriorityPicker = ({ value, onChange, disabled }: { value: TaskPriority; onChange: (p: TaskPriority) => void; disabled?: boolean }) => {
  useTranslation();
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup">
      {TASK_PRIORITIES.map((p) => (
        <button
          key={p}
          type="button"
          role="radio"
          aria-checked={value === p}
          disabled={disabled}
          onClick={() => onChange(p)}
          className={clsx(
            'rounded-lg px-2.5 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed',
            value === p ? clsx(PRIORITY_TONE[p], 'ring-2 ring-current/30') : 'bg-surface text-muted hover:text-ink',
            disabled && value !== p && 'opacity-50',
          )}
        >
          {priorityLabel(p)}
        </button>
      ))}
    </div>
  );
};

export const StatusSelect = ({
  value,
  options,
  onChange,
  disabled,
  id,
}: {
  value: TaskStatus;
  options: TaskStatus[];
  onChange: (s: TaskStatus) => void;
  disabled?: boolean;
  id?: string;
}) => {
  useTranslation();
  return (
    <div className="relative">
      <span className={clsx('pointer-events-none absolute top-1/2 left-3 size-2 -translate-y-1/2 rounded-full', STATUS_DOT[value])} aria-hidden />
      <select id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as TaskStatus)} className="input appearance-none py-2 pr-8 pl-7 font-semibold disabled:opacity-70">
        {options.map((s) => (
          <option key={s} value={s}>
            {statusLabel(s)}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted" aria-hidden />
    </div>
  );
};

/** Native date + time inputs (local time). Empty date clears the value. */
export const DateTimeField = ({
  date,
  time,
  onChange,
  disabled,
  idPrefix,
  label,
}: {
  date: string;
  time: string;
  onChange: (date: string, time: string) => void;
  disabled?: boolean;
  idPrefix: string;
  label: string;
}) => {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-1.5">
      <input
        id={`${idPrefix}-date`}
        type="date"
        aria-label={label}
        value={date}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value, time)}
        className="input min-w-0 flex-1 py-2 disabled:opacity-70"
      />
      <input
        type="time"
        aria-label={`${label} · ${t('tasks.fields.time')}`}
        value={time}
        disabled={disabled || !date}
        onChange={(e) => onChange(date, e.target.value)}
        className="input w-[8.25rem] shrink-0 py-2 disabled:opacity-50"
      />
      {!disabled && date && (
        <button type="button" onClick={() => onChange('', '')} className="grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface hover:text-danger" aria-label={t('tasks.actions.clear')}>
          <X className="size-4" />
        </button>
      )}
    </div>
  );
};
