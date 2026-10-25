import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import type { CaseRef, Person, TaskDetail, TaskPriority, TaskStatus } from './types';
import { TASK_STATUSES } from './types';
import { useTaskActions } from './api';
import { AssigneeField, CaseField, DateTimeField, PriorityPicker, StatusSelect } from './pickers';
import { DEFAULT_DUE_TIME, dayKey, errorText, fromInputs } from './utils';
import { FileDrop, PendingFiles } from './FileDrop';

export interface NewTaskDefaults {
  status?: TaskStatus;
  /** 'YYYY-MM-DD' (local) */
  dueDate?: string;
  case?: CaseRef | null;
  assignees?: Person[];
}

/** "New task" dialog: title first, everything else optional. Full screen on phones. */
export const NewTaskDialog = ({
  open,
  onClose,
  defaults,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  defaults: NewTaskDefaults;
  onCreated: (task: TaskDetail) => void;
}) => {
  const { t } = useTranslation();
  const actions = useTaskActions();
  const titleId = useId();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>('TODO');
  const [priority, setPriority] = useState<TaskPriority>('NORMAL');
  const [assignees, setAssignees] = useState<Person[]>([]);
  const [due, setDue] = useState({ date: '', time: '' });
  const [start, setStart] = useState({ date: '', time: '' });
  const [caseRef, setCaseRef] = useState<CaseRef | null>(null);
  const [busy, setBusy] = useState(false);
  const today = dayKey(new Date());
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<Record<number, number>>({});

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setDescription('');
    setStatus(defaults.status ?? 'TODO');
    setPriority('NORMAL');
    setAssignees(defaults.assignees ?? []);
    setDue(defaults.dueDate ? { date: defaults.dueDate, time: DEFAULT_DUE_TIME } : { date: '', time: '' });
    // A new task starts today (it can be moved later, never into the past).
    setStart({ date: dayKey(new Date()), time: '' });
    setCaseRef(defaults.case ?? null);
    setBusy(false);
    setFiles([]);
    setProgress({});
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const task = await actions.create({
        title: title.trim(),
        description: description.trim() ? description : null,
        status,
        priority,
        assigneeIds: assignees.map((a) => a.id),
        dueAt: fromInputs(due.date, due.time),
        startAt: fromInputs(start.date, start.time || '09:00'),
        caseId: caseRef?.id ?? null,
      });
      // Files are uploaded one after another once the task exists; a failed file does not undo the task.
      let latest = task;
      for (let i = 0; i < files.length; i++) {
        setProgress((p) => ({ ...p, [i]: 0 }));
        try {
          latest = await actions.upload(task.id, files[i], (pct) => setProgress((p) => ({ ...p, [i]: pct })));
          setProgress((p) => ({ ...p, [i]: 100 }));
        } catch (err) {
          toast.error(`${t('tasks.actions.uploadFailed', { name: files[i].name })} — ${errorText(err)}`);
        }
      }
      onCreated(latest);
    } catch (err) {
      toast.error(errorText(err));
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      title={t('tasks.newTask')}
      closeLabel={t('tasks.actions.close')}
      size="lg"
      mobile="full"
      align="top"
      zIndex={70}
      as="form"
      onSubmit={submit}
      bodyClassName="space-y-5"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            {t('tasks.actions.cancel')}
          </Button>
          <Button type="submit" size="sm" loading={busy} disabled={!title.trim()}>
            {busy
              ? files.length && Object.keys(progress).length
                ? t('tasks.actions.uploading', { done: Object.values(progress).filter((v) => v >= 100).length, total: files.length })
                : t('tasks.actions.creating')
              : t('tasks.actions.create')}
          </Button>
        </>
      }
    >
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                placeholder={t('tasks.ph.title')}
                aria-label={t('tasks.fields.title')}
                className="w-full border-0 bg-transparent p-0 font-display text-xl font-bold text-ink outline-none placeholder:text-subtle sm:text-2xl"
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                maxLength={20000}
                placeholder={t('tasks.ph.description')}
                aria-label={t('tasks.fields.description')}
                className="input resize-y leading-relaxed"
              />
              <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                <div>
                  <span className="label">{t('tasks.fields.assignees')}</span>
                  <AssigneeField value={assignees} onChange={setAssignees} />
                </div>
                <div>
                  <label className="label" htmlFor={`${titleId}-status`}>
                    {t('tasks.fields.status')}
                  </label>
                  <StatusSelect id={`${titleId}-status`} value={status} options={TASK_STATUSES.filter((s) => s !== 'CANCELLED')} onChange={setStatus} />
                </div>
                <div>
                  <label className="label" htmlFor={`${titleId}-start-date`}>
                    {t('tasks.fields.startAt')}
                  </label>
                  <DateTimeField
                    idPrefix={`${titleId}-start`}
                    label={t('tasks.fields.startAt')}
                    date={start.date}
                    time={start.time}
                    min={today}
                    onChange={(date, time) => setStart({ date, time: date ? time || '09:00' : '' })}
                  />
                </div>
                <div>
                  <label className="label" htmlFor={`${titleId}-due-date`}>
                    {t('tasks.fields.dueAt')}
                  </label>
                  <DateTimeField
                    idPrefix={`${titleId}-due`}
                    label={t('tasks.fields.dueAt')}
                    date={due.date}
                    time={due.time}
                    min={start.date && start.date > today ? start.date : today}
                    onChange={(date, time) => setDue({ date, time: date ? time || DEFAULT_DUE_TIME : '' })}
                  />
                </div>
                <div>
                  <span className="label">{t('tasks.fields.priority')}</span>
                  <PriorityPicker value={priority} onChange={setPriority} />
                </div>
                <div>
                  <span className="label">{t('tasks.fields.case')}</span>
                  <CaseField value={caseRef} onChange={setCaseRef} />
                </div>
              </div>
              <div>
                <span className="label">{t('tasks.fields.attachments')}</span>
                <FileDrop
                  disabled={busy}
                  onFiles={(picked) => setFiles((cur) => [...cur, ...picked].slice(0, 50))}
                  onTooLarge={(f) => toast.error(`${f.name}: ${t('tasks.errors.FILE_TOO_LARGE')}`)}
                />
                <PendingFiles files={files} progress={busy ? progress : undefined} onRemove={busy ? undefined : (i) => setFiles((cur) => cur.filter((_, j) => j !== i))} />
                {files.length > 0 && !busy && <p className="mt-1.5 text-xs text-muted">{t('tasks.actions.filesPending', { count: files.length })}</p>}
              </div>
              <p className="text-xs text-muted">{t('tasks.panel.timezone')}</p>
    </Modal>
  );
};
