import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Tabs } from '@/components/ui/Tabs';
import { CalendarDays, Columns3, List, ListTodo, Plus, User, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesTasks } from '@/i18n/pagesTasks';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { hasMinRole } from '@/lib/types';
import { usePageTitle } from '@/lib/usePageTitle';
import { taskKeys, useTaskList } from '@/components/tasks/api';
import type { CaseRef, ListSort, TaskCard, TaskFilters, TaskListResponse, TaskPriority, TaskStatus, TaskView } from '@/components/tasks/types';
import { BOARD_STATUSES, TASK_PRIORITIES, TASK_STATUSES } from '@/components/tasks/types';
import { BoardView } from '@/components/tasks/BoardView';
import { ListView } from '@/components/tasks/ListView';
import { CalendarView, calendarRange } from '@/components/tasks/CalendarView';
import { FilterBar } from '@/components/tasks/FilterBar';
import { TaskPanel } from '@/components/tasks/TaskPanel';
import { NewTaskDialog, type NewTaskDefaults } from '@/components/tasks/NewTaskDialog';
import { EMPTY_FILTERS, activeFilterCount, errorText, filterParams, fromInputs, toTimeInput } from '@/components/tasks/utils';
import { useNewParam } from '@/components/command/useNewParam'; // ?new=1 deep link (Ctrl+K palette)

registerCopy(pagesTasks);

const VIEW_KEY = 'tv-tasks-view';
const readView = (): TaskView => {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === 'list' || v === 'calendar' ? v : 'board';
  } catch {
    return 'board';
  }
};
const LIST_SORTS: ListSort[] = ['number', 'title', 'priority', 'dueAt', 'status', 'updatedAt', 'createdAt'];
const DUES = ['overdue', 'today', 'week', 'none'] as const;

const csv = <T extends string>(v: string | null, allowed: readonly T[]) => (v ? v.split(',').filter((x): x is T => (allowed as readonly string[]).includes(x)) : []);

/**
 * Team tasks: board (kanban), list and calendar views over the same filters, with a task panel on the
 * right. Everything that matters lives in the URL (/workspace/tasks/T-0012?view=list&scope=all…), so
 * links and reloads land on the same screen.
 */
export default function WorkspaceTasks() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const params = useParams();
  const [sp, setSp] = useSearchParams();
  const ref = (params['*'] ?? '').split('/')[0] || null;
  const isAdmin = hasMinRole(user?.role, 'ADMIN');
  usePageTitle(ref ? `${ref.toUpperCase()} · ${t('tasks.title')}` : t('tasks.title'));

  // ─── URL state ───
  const view: TaskView = (['board', 'list', 'calendar'] as const).find((v) => v === sp.get('view')) ?? readView();
  const mine = (sp.get('scope') ?? (isAdmin ? 'all' : 'mine')) === 'mine';
  const filters: TaskFilters = useMemo(
    () => ({
      assignee: sp.get('assignee') ?? '',
      priority: csv<TaskPriority>(sp.get('priority'), TASK_PRIORITIES),
      status: csv<TaskStatus>(sp.get('status'), TASK_STATUSES),
      due: DUES.find((d) => d === sp.get('due')) ?? '',
      caseId: sp.get('case') ?? '',
      search: sp.get('q') ?? '',
      cancelled: sp.get('cancelled') === '1',
    }),
    [sp],
  );
  const sort = LIST_SORTS.find((s) => s === sp.get('sort')) ?? 'updatedAt';
  const dir: 'asc' | 'desc' = sp.get('dir') === 'asc' ? 'asc' : sp.get('dir') === 'desc' ? 'desc' : sort === 'dueAt' || sort === 'title' ? 'asc' : 'desc';
  const page = Math.max(1, Number(sp.get('page')) || 1);
  const monthParam = /^\d{4}-\d{2}$/.exec(sp.get('month') ?? '')?.[0];
  const month = useMemo(() => {
    if (monthParam) return new Date(Number(monthParam.slice(0, 4)), Number(monthParam.slice(5)) - 1, 1);
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  }, [monthParam]);
  const caseLabel = sp.get('caseNo') ?? '';

  const patchSp = useCallback(
    (patch: Record<string, string | null>) => {
      setSp(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === null || v === '') next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSp],
  );

  const setFilters = (f: TaskFilters) =>
    patchSp({
      assignee: f.assignee || null,
      priority: f.priority.join(',') || null,
      status: f.status.join(',') || null,
      due: f.due || null,
      case: f.caseId || null,
      q: f.search.trim() || null,
      cancelled: f.cancelled ? '1' : null,
      page: null,
    });
  const setView = (v: TaskView) => {
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* private mode */
    }
    patchSp({ view: v, page: null });
  };

  // ─── Data ───
  const base = useMemo(() => filterParams(filters, mine), [filters, mine]);
  const range = calendarRange(month);
  const listParams = useMemo(() => {
    if (view === 'board') return { ...base, sort: 'board', pageSize: '500' };
    if (view === 'calendar') return { ...base, sort: 'dueAt', dir: 'asc', pageSize: '500', dueFrom: range.start.toISOString(), dueTo: range.end.toISOString() };
    return { ...base, sort, dir, page: String(page), pageSize: '50' };
  }, [base, view, sort, dir, page, range.start.getTime(), range.end.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = useTaskList(listParams);
  const items = list.data?.items ?? [];

  // ─── Permissions (mirrors the server) ───
  const canMove = useCallback(
    (task: TaskCard) => isAdmin || task.createdById === user?.id || task.assignees.some((a) => a.id === user?.id),
    [isAdmin, user?.id],
  );
  const canEdit = useCallback((task: TaskCard) => isAdmin || task.createdById === user?.id, [isAdmin, user?.id]);

  // ─── Navigation ───
  const qs = sp.toString();
  // The page is mounted both in the workspace (/workspace/tasks) and in the admin panel (/admin/tasks).
  const tasksPath = useLocation().pathname.startsWith('/admin') ? '/admin/tasks' : '/workspace/tasks';
  const openTask = useCallback((task: { key: string }) => navigate(`${tasksPath}/${task.key}${qs ? `?${qs}` : ''}`), [navigate, qs, tasksPath]);
  const closeTask = useCallback(() => navigate(`${tasksPath}${qs ? `?${qs}` : ''}`), [navigate, qs, tasksPath]);

  // ─── New task ───
  const [creating, setCreating] = useState<NewTaskDefaults | null>(null);
  const meAsAssignee = user ? [{ id: user.id, firstName: user.firstName, lastName: user.lastName }] : [];
  const startCreate = (d: NewTaskDefaults = {}) => setCreating({ assignees: mine ? meAsAssignee : [], ...d });
  useNewParam(() => startCreate()); // /workspace/tasks?new=1 (workspace home, Ctrl+K palette)

  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (!typing && (e.key === 'n' || e.key === 'N') && !creating) {
        e.preventDefault();
        startCreate();
      } else if (!typing && e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'Escape' && ref && !creating && !document.querySelector('[role="alertdialog"],[role="dialog"]')) {
        closeTask();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  // ─── Board: optimistic drag & drop ───
  const onMove = async (task: TaskCard, status: TaskStatus, beforeId: string | null) => {
    const key = taskKeys.list(listParams);
    const previous = qc.getQueryData<TaskListResponse>(key);
    qc.setQueryData<TaskListResponse>(key, (old) => {
      if (!old) return old;
      const rest = old.items.filter((i) => i.id !== task.id);
      const moved = { ...task, status, completedAt: status === 'DONE' ? task.completedAt ?? new Date().toISOString() : null };
      let at = beforeId ? rest.findIndex((i) => i.id === beforeId) : -1;
      if (at < 0) {
        const lastInColumn = rest.map((i) => i.status).lastIndexOf(status);
        at = lastInColumn + 1;
      }
      rest.splice(at, 0, moved);
      return { ...old, items: rest };
    });
    try {
      await api.post(`/tasks/${task.id}/move`, { status, beforeId });
    } catch (err) {
      qc.setQueryData(key, previous);
      toast.error(errorText(err));
    } finally {
      void qc.invalidateQueries({ queryKey: taskKeys.lists });
      void qc.invalidateQueries({ queryKey: taskKeys.summary });
      void qc.invalidateQueries({ queryKey: taskKeys.detail(task.key) });
    }
  };

  // ─── Calendar: drag to another day keeps the time of day ───
  const onReschedule = async (task: TaskCard, day: string) => {
    const dueAt = fromInputs(day, toTimeInput(task.dueAt));
    const key = taskKeys.list(listParams);
    const previous = qc.getQueryData<TaskListResponse>(key);
    qc.setQueryData<TaskListResponse>(key, (old) => (old ? { ...old, items: old.items.map((i) => (i.id === task.id ? { ...i, dueAt } : i)) } : old));
    try {
      await api.patch(`/tasks/${task.id}`, { dueAt });
    } catch (err) {
      qc.setQueryData(key, previous);
      toast.error(errorText(err));
    } finally {
      void qc.invalidateQueries({ queryKey: taskKeys.all });
    }
  };

  const columns = useMemo(() => {
    const cols = filters.status.length ? BOARD_STATUSES.filter((s) => filters.status.includes(s)) : BOARD_STATUSES;
    return filters.cancelled ? [...cols, 'CANCELLED' as const] : cols;
  }, [filters.status, filters.cancelled]);
  const anyFilter = activeFilterCount(filters) > 0 || !!filters.search;
  const activeId = ref ? items.find((i) => i.key === ref.toUpperCase() || i.id === ref)?.id ?? null : null;
  const loading = list.isLoading;
  const empty = !loading && !list.isError && list.data?.total === 0;

  const views: { id: TaskView; icon: LucideIcon; label: string }[] = [
    { id: 'board', icon: Columns3, label: t('tasks.views.board') },
    { id: 'list', icon: List, label: t('tasks.views.list') },
    { id: 'calendar', icon: CalendarDays, label: t('tasks.views.calendar') },
  ];

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <header className="shrink-0 space-y-3 border-b border-line bg-card px-4 pt-4 pb-3 lg:px-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="hidden size-10 place-items-center rounded-xl bg-brand-600 text-white shadow-sm sm:grid">
              <ListTodo className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 font-display text-xl font-extrabold text-ink">
                {t('tasks.title')}
                {list.data && <span className="rounded-full bg-surface px-2 py-0.5 font-sans text-xs font-semibold text-muted tabular-nums ring-1 ring-line">{list.data.total}</span>}
              </h1>
              <p className="hidden truncate text-xs text-muted sm:block">{t('tasks.subtitle')}</p>
            </div>
          </div>

          <Tabs
            variant="pills"
            label={t('tasks.title')}
            items={views.map((v) => ({ key: v.id, icon: v.icon, label: <span className="sr-only sm:not-sr-only">{v.label}</span> }))}
            value={view}
            onChange={setView}
          />

          <div className="ml-auto flex items-center gap-2">
            <div className="flex rounded-xl border border-line bg-surface p-1">
              {([true, false] as const).map((m) => (
                <button
                  key={String(m)}
                  type="button"
                  aria-pressed={mine === m}
                  title={m ? t('tasks.scope.mineHint') : t('tasks.scope.allHint')}
                  onClick={() => patchSp({ scope: m ? 'mine' : 'all', assignee: null, page: null })}
                  className={clsx('inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition', mine === m ? 'bg-card text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink')}
                >
                  {m ? <User className="size-4" aria-hidden /> : <Users className="size-4" aria-hidden />}
                  {m ? t('tasks.scope.mine') : t('tasks.scope.all')}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => startCreate()} className="btn-primary btn-sm h-10 px-4" title={t('tasks.shortcutNew')}>
              <Plus className="size-4" />
              <span className="hidden sm:inline">{t('tasks.newTask')}</span>
              <kbd className="ml-1 hidden rounded border border-white/30 px-1.5 font-sans text-[0.65rem] leading-4 font-semibold text-white/80 lg:inline">N</kbd>
            </button>
          </div>
        </div>

        <FilterBar
          filters={filters}
          onChange={setFilters}
          mine={mine}
          caseLabel={caseLabel}
          onCaseLabel={(c: CaseRef | null) => patchSp({ caseNo: c ? `${c.number} · ${c.clientName}` : null })}
          searchRef={searchRef}
        />
      </header>

      <div className="relative min-h-0 flex-1 bg-surface">
        {list.isError && !list.data ? (
          <div className="grid h-full place-items-center p-6 text-center">
            <div>
              <p className="font-semibold text-ink">{t('tasks.toast.loadFailed')}</p>
              <button type="button" onClick={() => void list.refetch()} className="btn-white btn-sm mt-3 border border-line">
                {t('tasks.actions.retry')}
              </button>
            </div>
          </div>
        ) : view === 'board' ? (
          <BoardView
            columns={columns}
            tasks={items}
            loading={loading}
            activeId={activeId}
            canMove={canMove}
            onOpen={openTask}
            onMove={(task, status, beforeId) => void onMove(task, status, beforeId)}
            onCreateIn={(status) => startCreate({ status })}
          />
        ) : view === 'list' ? (
          empty ? null : (
            <ListView
              data={list.data}
              loading={loading}
              sort={sort}
              dir={dir}
              onSort={(key) => patchSp({ sort: key, dir: key === sort ? (dir === 'asc' ? 'desc' : 'asc') : null, page: null })}
              page={page}
              onPage={(p) => patchSp({ page: p > 1 ? String(p) : null })}
              onOpen={openTask}
              activeId={activeId}
            />
          )
        ) : (
          <CalendarView
            month={month}
            onMonth={(d) => patchSp({ month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` })}
            tasks={items}
            loading={list.isFetching}
            onOpen={openTask}
            onCreateOn={(day) => startCreate({ dueDate: day })}
            onReschedule={(task, day) => void onReschedule(task, day)}
            canEdit={canEdit}
          />
        )}

        {empty && view !== 'calendar' && (
          <div className={clsx('pointer-events-none absolute inset-0 grid place-items-center p-6', view === 'board' && 'bg-surface/40')}>
            <div className="pointer-events-auto max-w-sm rounded-2xl border border-line bg-card p-7 text-center shadow-[0_20px_60px_-30px_rgba(11,31,68,0.45)]">
              <span className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-600">
                <ListTodo className="size-7" aria-hidden />
              </span>
              <h2 className="font-display text-lg font-bold text-ink">{anyFilter || mine ? t('tasks.empty.filtered') : t('tasks.empty.board')}</h2>
              <p className="mt-1.5 text-sm text-muted">{anyFilter ? t('tasks.empty.filteredHint') : t('tasks.empty.boardHint')}</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {anyFilter && (
                  <button type="button" onClick={() => setFilters(EMPTY_FILTERS)} className="btn-secondary btn-sm">
                    {t('tasks.filters.clear')}
                  </button>
                )}
                {mine && !anyFilter && (
                  <button type="button" onClick={() => patchSp({ scope: 'all' })} className="btn-secondary btn-sm">
                    {t('tasks.scope.allHint')}
                  </button>
                )}
                <button type="button" onClick={() => startCreate()} className="btn-primary btn-sm">
                  <Plus className="size-4" /> {t('tasks.newTask')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>{ref && <TaskPanel key="panel" taskRef={ref} onClose={closeTask} onDeleted={closeTask} />}</AnimatePresence>

      <NewTaskDialog
        open={!!creating}
        defaults={creating ?? {}}
        onClose={() => setCreating(null)}
        onCreated={(task) => {
          setCreating(null);
          toast.success(t('tasks.toast.created', { key: task.key }), {
            action: { label: t('tasks.actions.open'), onClick: () => openTask(task) },
          });
        }}
      />
    </div>
  );
}
