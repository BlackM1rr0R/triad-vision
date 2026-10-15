import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ListTodo, Plus } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesTasks } from '@/i18n/pagesTasks';
import { Panel } from '@/components/admin/ui';
import { useTaskList } from './api';
import { AvatarStack, DueChip, Skeleton, StatusChip } from './bits';
import { NewTaskDialog } from './NewTaskDialog';

registerCopy(pagesTasks);

/** Case page section: tasks linked to this case, plus "new task for this case". */
export const CaseTasks = ({ caseId, number, clientName }: { caseId: string; number: string; clientName: string }) => {
  const { t } = useTranslation();
  const [creating, setCreating] = useState(false);
  const list = useTaskList({ caseId, status: 'TODO,IN_PROGRESS,REVIEW,DONE', sort: 'updatedAt', pageSize: '50' });
  const items = list.data?.items ?? [];
  return (
    <Panel
      title={t('tasks.caseTasks.title')}
      icon={ListTodo}
      bodyClassName="p-0!"
      actions={
        <button type="button" onClick={() => setCreating(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline">
          <Plus className="size-3.5" /> {t('tasks.caseTasks.add')}
        </button>
      }
    >
      {list.isLoading ? (
        <div className="space-y-2 p-5">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : !items.length ? (
        <p className="px-5 py-6 text-sm text-muted sm:px-6">{t('tasks.caseTasks.empty')}</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((task) => (
            <li key={task.id}>
              <Link to={`/workspace/tasks/${task.key}`} className="block px-5 py-3 transition hover:bg-surface sm:px-6">
                <span className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 font-mono text-[0.7rem] font-semibold text-muted">{task.key}</span>
                  <span className="min-w-0 flex-1 text-sm leading-snug font-semibold break-words text-ink">{task.title}</span>
                </span>
                <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <StatusChip status={task.status} />
                  <DueChip dueAt={task.dueAt} status={task.status} />
                  <span className="ml-auto">
                    <AvatarStack people={task.assignees} size="xs" />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <NewTaskDialog
        open={creating}
        defaults={{ case: { id: caseId, number, clientName } }}
        onClose={() => setCreating(false)}
        onCreated={(task) => {
          setCreating(false);
          toast.success(t('tasks.toast.created', { key: task.key }));
        }}
      />
    </Panel>
  );
};
