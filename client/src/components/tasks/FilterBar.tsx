import { useEffect, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { Briefcase, Calendar, Check, ChevronDown, CircleDot, Flag, RotateCcw, Search, User, X } from 'lucide-react';
import type { CaseRef, DueFilter, TaskFilters, TaskPriority, TaskStatus } from './types';
import { TASK_PRIORITIES, TASK_STATUSES } from './types';
import { usePeople } from './api';
import { PeopleList, Popover } from './bits';
import { CaseField } from './pickers';
import { STATUS_DOT, activeFilterCount, fullName, priorityLabel, statusLabel } from './utils';

const Trigger = ({ icon: Icon, label, active, onClick }: { icon: typeof User; label: ReactNode; active: boolean; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className={clsx(
      'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold whitespace-nowrap transition',
      active ? 'border-primary bg-primary/[0.06] text-link' : 'border-line bg-card text-ink hover:border-line-strong',
    )}
  >
    <Icon className="size-3.5" aria-hidden />
    {label}
    <ChevronDown className="size-3.5 opacity-60" aria-hidden />
  </button>
);

const Option = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) => (
  <button type="button" role="menuitemcheckbox" aria-checked={on} onClick={onClick} className={clsx('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-sunken', on && 'bg-primary/[0.06]')}>
    <span className="min-w-0 flex-1 truncate">{children}</span>
    {on && <Check className="size-4 shrink-0 text-link" aria-hidden />}
  </button>
);

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

/** Search + filter menus. Horizontal scroll on phones, wraps on wide screens. */
export const FilterBar = ({
  filters,
  onChange,
  mine,
  caseLabel,
  onCaseLabel,
  searchRef,
}: {
  filters: TaskFilters;
  onChange: (next: TaskFilters) => void;
  mine: boolean;
  caseLabel: string;
  onCaseLabel: (c: CaseRef | null) => void;
  searchRef?: React.Ref<HTMLInputElement>;
}) => {
  const { t } = useTranslation();
  const people = usePeople();
  const [open, setOpen] = useState<null | 'assignee' | 'priority' | 'status' | 'due' | 'case'>(null);
  const [q, setQ] = useState(filters.search);
  const set = (patch: Partial<TaskFilters>) => onChange({ ...filters, ...patch });

  useEffect(() => setQ(filters.search), [filters.search]);
  useEffect(() => {
    if (q === filters.search) return;
    const id = window.setTimeout(() => onChange({ ...filters, search: q }), 300);
    return () => window.clearTimeout(id);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const assigneePerson = people.data?.find((p) => p.id === filters.assignee);
  const assigneeLabel =
    filters.assignee === 'unassigned' ? t('tasks.filters.unassigned') : filters.assignee === 'me' ? t('tasks.filters.me') : assigneePerson ? fullName(assigneePerson) : t('tasks.filters.assignee');
  const dues: DueFilter[] = ['overdue', 'today', 'week', 'none'];
  const count = activeFilterCount(filters) + (filters.search ? 1 : 0);
  const menu = (key: NonNullable<typeof open>) => ({ open: open === key, onClose: () => setOpen(null) });

  return (
    <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden">
      <label className="relative w-56 shrink-0 sm:w-72">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          ref={searchRef}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('tasks.search')}
          aria-label={t('tasks.search')}
          className="input h-9 py-0 pl-9"
        />
      </label>

      {!mine && (
        <div className="relative">
          <Trigger icon={User} label={assigneeLabel} active={!!filters.assignee} onClick={() => setOpen(open === 'assignee' ? null : 'assignee')} />
          <Popover {...menu('assignee')}>
            <PeopleList
              people={people.data ?? []}
              selected={filters.assignee ? [filters.assignee] : []}
              onToggle={(p) => {
                set({ assignee: filters.assignee === p.id ? '' : p.id });
                setOpen(null);
              }}
              extra={
                <div className="border-b border-line pb-1">
                  <Option on={!filters.assignee} onClick={() => (set({ assignee: '' }), setOpen(null))}>
                    {t('tasks.filters.anyone')}
                  </Option>
                  <Option on={filters.assignee === 'unassigned'} onClick={() => (set({ assignee: 'unassigned' }), setOpen(null))}>
                    {t('tasks.filters.unassigned')}
                  </Option>
                </div>
              }
            />
          </Popover>
        </div>
      )}

      <div className="relative">
        <Trigger
          icon={Flag}
          label={filters.priority.length === 1 ? priorityLabel(filters.priority[0]) : filters.priority.length ? `${t('tasks.filters.priority')} · ${filters.priority.length}` : t('tasks.filters.priority')}
          active={filters.priority.length > 0}
          onClick={() => setOpen(open === 'priority' ? null : 'priority')}
        />
        <Popover {...menu('priority')} className="w-52">
          {[...TASK_PRIORITIES].reverse().map((p: TaskPriority) => (
            <Option key={p} on={filters.priority.includes(p)} onClick={() => set({ priority: toggle(filters.priority, p) })}>
              {priorityLabel(p)}
            </Option>
          ))}
        </Popover>
      </div>

      <div className="relative">
        <Trigger
          icon={CircleDot}
          label={filters.status.length === 1 ? statusLabel(filters.status[0]) : filters.status.length ? `${t('tasks.filters.status')} · ${filters.status.length}` : t('tasks.filters.status')}
          active={filters.status.length > 0}
          onClick={() => setOpen(open === 'status' ? null : 'status')}
        />
        <Popover {...menu('status')} className="w-56">
          {TASK_STATUSES.filter((s) => s !== 'CANCELLED').map((s: TaskStatus) => (
            <Option key={s} on={filters.status.includes(s)} onClick={() => set({ status: toggle(filters.status, s) })}>
              <span className="inline-flex items-center gap-2">
                <span className={clsx('size-2 rounded-full', STATUS_DOT[s])} aria-hidden />
                {statusLabel(s)}
              </span>
            </Option>
          ))}
          <div className="mt-1 border-t border-line pt-1">
            <Option on={filters.cancelled} onClick={() => set({ cancelled: !filters.cancelled })}>
              {t('tasks.filters.showCancelled')}
            </Option>
          </div>
        </Popover>
      </div>

      <div className="relative">
        <Trigger icon={Calendar} label={filters.due ? t(`tasks.filters.${filters.due}`) : t('tasks.filters.due')} active={!!filters.due} onClick={() => setOpen(open === 'due' ? null : 'due')} />
        <Popover {...menu('due')} className="w-52">
          <Option on={!filters.due} onClick={() => (set({ due: '' }), setOpen(null))}>
            {t('tasks.filters.anyDue')}
          </Option>
          {dues.map((d) => (
            <Option key={d} on={filters.due === d} onClick={() => (set({ due: d }), setOpen(null))}>
              {t(`tasks.filters.${d}`)}
            </Option>
          ))}
        </Popover>
      </div>

      {filters.caseId ? (
        <span className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-primary bg-primary/[0.06] px-3 text-sm font-semibold text-link">
          <Briefcase className="size-3.5" aria-hidden />
          {caseLabel || t('tasks.filters.case')}
          <button type="button" onClick={() => (set({ caseId: '' }), onCaseLabel(null))} className="-mr-1 grid size-6 place-items-center rounded-md hover:bg-primary/10" aria-label={t('tasks.actions.clear')}>
            <X className="size-3.5" />
          </button>
        </span>
      ) : (
        <div className="shrink-0">
          <CaseField
            value={null}
            placeholder={t('tasks.filters.case')}
            onChange={(c) => {
              onCaseLabel(c);
              set({ caseId: c?.id ?? '' });
            }}
          />
        </div>
      )}

      {count > 0 && (
        <button type="button" onClick={() => (onChange({ ...filters, assignee: '', priority: [], status: [], due: '', caseId: '', search: '', cancelled: false }), onCaseLabel(null), setQ(''))} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-muted hover:text-danger-fg">
          <RotateCcw className="size-3.5" /> {t('tasks.filters.clear')}
        </button>
      )}
    </div>
  );
};
