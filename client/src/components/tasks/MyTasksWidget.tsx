import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, ListTodo } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesTasks } from '@/i18n/pagesTasks';
import { api } from '@/lib/api';
import { Panel } from '@/components/admin/ui';
import { taskKeys, useTaskList } from './api';
import { DueChip, PriorityChip, Skeleton } from './bits';

registerCopy(pagesTasks);

const PARAMS = { assignee: 'me', status: 'TODO,IN_PROGRESS,REVIEW', sort: 'dueAt', dir: 'asc', pageSize: '6' };

/** Dashboard card: my open tasks, nearest deadline first. */
export const MyTasksWidget = () => {
  const { t } = useTranslation();
  const list = useTaskList(PARAMS);
  const summary = useQuery({
    queryKey: taskKeys.summary,
    queryFn: async () => (await api.get<{ open: number; overdue: number }>('/tasks/summary')).data,
    refetchInterval: 60_000,
  });
  const items = list.data?.items ?? [];
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          {t('tasks.widget.title')}
          {!!summary.data?.open && <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-bold text-brand-700 tabular-nums">{summary.data.open}</span>}
          {!!summary.data?.overdue && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">{t('tasks.widget.overdue', { count: summary.data.overdue })}</span>}
        </span>
      }
      icon={ListTodo}
      bodyClassName="p-0!"
      actions={
        <Link to="/workspace/tasks" className="inline-flex items-center gap-0.5 text-xs font-semibold text-brand-600 hover:underline">
          {t('tasks.widget.open')} <ArrowUpRight className="size-3" />
        </Link>
      }
    >
      {list.isLoading ? (
        <div className="space-y-2 p-5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : !items.length ? (
        <p className="px-5 py-8 text-center text-sm text-muted sm:px-6">{t('tasks.widget.empty')}</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((task) => (
            <li key={task.id}>
              <Link to={`/workspace/tasks/${task.key}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-surface sm:px-6">
                <span className="w-14 shrink-0 font-mono text-[0.7rem] font-semibold text-muted">{task.key}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{task.title}</span>
                <PriorityChip priority={task.priority} compact />
                <DueChip dueAt={task.dueAt} status={task.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
};
