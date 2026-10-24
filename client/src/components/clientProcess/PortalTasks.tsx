import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import { CheckCircle2, ExternalLink, FileText, ListChecks, Paperclip, RotateCcw } from 'lucide-react';
import { api, fileUrl } from '@/lib/api';
import { optimistic } from '@/lib/optimistic';
import { useL10n } from '@/lib/l10n';
import { cpKeys, STATE_TONE, useCpError, type ClientTaskView } from './api';

type TasksResponse = { tasks: ClientTaskView[]; counts: { open: number; overdue: number } };

export const useMyTasks = (caseId?: string) =>
  useQuery({
    queryKey: cpKeys.myTasks(caseId),
    queryFn: async () => (await api.get<TasksResponse>('/client-process/tasks', { params: caseId ? { caseId } : {} })).data,
    refetchInterval: 60_000,
  });

/** A task list with one task set to DONE / OPEN (optimistic state; the server recomputes the counts). */
const setStatus = (prev: TasksResponse | undefined, id: string, status: 'DONE' | 'OPEN'): TasksResponse | undefined => {
  if (!prev) return prev;
  const was = prev.tasks.find((x) => x.id === id);
  if (!was) return prev;
  const tasks = prev.tasks.map((x) => (x.id === id ? { ...x, status, state: status === 'DONE' ? ('done' as const) : ('open' as const) } : x));
  const delta = status === 'DONE' && was.status === 'OPEN' ? -1 : status === 'OPEN' && was.status !== 'OPEN' ? 1 : 0;
  return { ...prev, tasks, counts: { ...prev.counts, open: Math.max(0, prev.counts.open + delta), overdue: status === 'DONE' && was.state === 'overdue' ? Math.max(0, prev.counts.overdue - 1) : prev.counts.overdue } };
};

const TaskRow = ({ task, showCase, onChanged }: { task: ClientTaskView; showCase?: boolean; onChanged: () => void }) => {
  const { t } = useTranslation();
  const { date } = useL10n();
  const onError = useCpError();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const done = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      if (note.trim()) fd.append('note', note.trim());
      if (file) fd.append('file', file);
      return api.post(`/client-process/tasks/${task.id}/done`, fd);
    },
    // Optimistic: the task moves to "done" at once; a refused request puts it back (error toast).
    ...optimistic<TasksResponse, void>(qc, { key: ['client-process', 'tasks'], update: (prev) => setStatus(prev, task.id, 'DONE'), onError }),
    onSuccess: () => {
      toast.success(t('cp.tasks.doneOk'));
      setOpen(false);
      onChanged();
    },
  });
  const undo = useMutation({
    mutationFn: () => api.post(`/client-process/tasks/${task.id}/reopen`),
    ...optimistic<TasksResponse, void>(qc, { key: ['client-process', 'tasks'], update: (prev) => setStatus(prev, task.id, 'OPEN'), onError }),
    onSuccess: onChanged,
  });
  const isOpen = task.status === 'OPEN';

  return (
    <li className={clsx('rounded-xl border p-4', task.state === 'overdue' ? 'border-red-200 bg-red-50/60' : 'border-line bg-card')}>
      <div className="flex flex-wrap items-start gap-3">
        <span className={clsx('mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg', isOpen ? 'bg-brand-100 text-brand-700' : 'bg-emerald-100 text-emerald-700')}>
          {isOpen ? <ListChecks className="size-4" aria-hidden /> : <CheckCircle2 className="size-4" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className={clsx('font-semibold break-words text-navy-900', !isOpen && 'line-through decoration-slate-300')}>{task.title}</p>
            <span className={clsx('badge', STATE_TONE[task.state])}>{t(`cp.tasks.state.${task.state}`)}</span>
          </div>
          <p className={clsx('mt-0.5 text-xs', task.state === 'overdue' ? 'font-semibold text-red-700' : 'text-muted')}>
            {task.dueAt ? t('cp.tasks.due', { date: date(task.dueAt, { day: 'numeric', month: 'long' }) }) : t('cp.tasks.noDue')}
            {showCase && (
              <>
                {' · '}
                <Link to={`/account/cases/${task.caseId}#client-tasks`} className="font-semibold text-brand-600 hover:underline">
                  {t('cp.tasks.caseNo', { number: task.caseNumber })}
                </Link>
              </>
            )}
          </p>
          {task.description && <p className="mt-2 text-sm leading-relaxed break-words whitespace-pre-line text-slate-700">{task.description}</p>}
          {task.requirement && isOpen && (
            <a href={`/account/cases/${task.caseId}#docs-${task.requirement.stage.toLowerCase()}`} className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline">
              <FileText className="size-4" aria-hidden /> {t('cp.tasks.requirement', { title: task.requirement.title })}
            </a>
          )}
          <div className="mt-2 flex flex-wrap gap-3 text-sm">
            {task.linkUrl && (
              <a href={task.linkUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-brand-600 hover:underline">
                <ExternalLink className="size-4" aria-hidden /> {t('cp.tasks.openLink')}
              </a>
            )}
            {task.attachmentId && (
              <a href={fileUrl(task.attachmentId)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-brand-600 hover:underline">
                <Paperclip className="size-4" aria-hidden /> {t('cp.tasks.attachment')}
              </a>
            )}
            {task.clientDocumentId && (
              <a href={fileUrl(task.clientDocumentId)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-muted hover:underline">
                <Paperclip className="size-4" aria-hidden /> {t('cp.tasks.yourFile')}
              </a>
            )}
          </div>
          {!isOpen && (
            <p className="mt-2 text-xs text-muted">
              {task.completedAt && t('cp.tasks.completedAt', { date: date(task.completedAt) })}
              {task.completedVia === 'UPLOAD' && ` · ${t('cp.tasks.viaUpload')}`}
              {task.clientNote && ` · ${t('cp.tasks.yourNote', { note: task.clientNote })}`}
            </p>
          )}
        </div>
        {isOpen && !open && (
          <button type="button" className="btn-primary btn-sm w-full sm:w-auto" onClick={() => setOpen(true)}>
            <CheckCircle2 className="size-4" aria-hidden /> {t('cp.tasks.markDone')}
          </button>
        )}
        {!isOpen && task.completedVia === 'CLIENT' && (
          <button type="button" className="btn-ghost btn-sm" onClick={() => undo.mutate()} disabled={undo.isPending}>
            <RotateCcw className="size-4" aria-hidden /> {t('cp.tasks.undo')}
          </button>
        )}
      </div>
      {open && (
        <form
          className="mt-3 space-y-3 border-t border-line pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            done.mutate();
          }}
        >
          <label className="block">
            <span className="label">{t('cp.tasks.note')}</span>
            <textarea className="input min-h-20" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">{t('cp.tasks.file')}</span>
            <input type="file" className="block w-full text-sm" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn-primary btn-sm" disabled={done.isPending}>
              {t('cp.tasks.confirm')}
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>
              {t('cp.tasks.cancel')}
            </button>
          </div>
        </form>
      )}
    </li>
  );
};

/** "Mənim tapşırıqlarım": on the case page (caseId) or across all cases (dashboard). Hidden when there are none. */
export const PortalTasks = ({ caseId, onChanged }: { caseId?: string; onChanged?: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useMyTasks(caseId);
  const [showDone, setShowDone] = useState(false);
  if (!data || data.tasks.length === 0) return null;
  const open = data.tasks.filter((x) => x.status === 'OPEN');
  const done = data.tasks.filter((x) => x.status !== 'OPEN');
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['client-process', 'tasks'] });
    onChanged?.();
  };
  return (
    <section id="client-tasks" className="card scroll-mt-24 p-5 sm:p-6" aria-labelledby="client-tasks-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 id="client-tasks-title" className="text-lg font-extrabold text-navy-900">{t('cp.tasks.title')}</h2>
          <p className="text-sm text-muted">{t('cp.tasks.subtitle')}</p>
        </div>
        {open.length > 0 && <span className={clsx('badge', data.counts.overdue ? STATE_TONE.overdue : STATE_TONE.open)}>{t('cp.tasks.openCount', { count: open.length })}</span>}
      </div>
      {open.length === 0 && <p className="mt-4 text-sm text-muted">{t('cp.tasks.empty')}</p>}
      <ul className="mt-4 space-y-3">
        {open.map((task) => (
          <TaskRow key={task.id} task={task} showCase={!caseId} onChanged={refresh} />
        ))}
      </ul>
      {done.length > 0 && (
        <div className="mt-4">
          <button type="button" className="text-sm font-semibold text-brand-600 hover:underline" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone}>
            {t('cp.tasks.showDone', { count: done.length })}
          </button>
          {showDone && (
            <ul className="mt-3 space-y-3">
              {done.map((task) => (
                <TaskRow key={task.id} task={task} showCase={!caseId} onChanged={refresh} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
};
