import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import type { CaseRef, Person, TaskDetail, TaskPriority, TaskStatus } from './types';
import { TASK_STATUSES } from './types';
import { useTaskActions } from './api';
import { AssigneeField, CaseField, DateTimeField, PriorityPicker, StatusSelect } from './pickers';
import { DEFAULT_DUE_TIME, errorText, fromInputs } from './utils';

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
  const panelRef = useRef<HTMLFormElement>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>('TODO');
  const [priority, setPriority] = useState<TaskPriority>('NORMAL');
  const [assignees, setAssignees] = useState<Person[]>([]);
  const [due, setDue] = useState({ date: '', time: '' });
  const [start, setStart] = useState({ date: '', time: '' });
  const [caseRef, setCaseRef] = useState<CaseRef | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setDescription('');
    setStatus(defaults.status ?? 'TODO');
    setPriority('NORMAL');
    setAssignees(defaults.assignees ?? []);
    setDue(defaults.dueDate ? { date: defaults.dueDate, time: DEFAULT_DUE_TIME } : { date: '', time: '' });
    setStart({ date: '', time: '' });
    setCaseRef(defaults.case ?? null);
    setBusy(false);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

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
      onCreated(task);
    } catch (err) {
      toast.error(errorText(err));
      setBusy(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-stretch justify-center sm:items-start sm:p-6 sm:pt-[8vh]">
          <motion.div className="absolute inset-0 bg-navy-950/45" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => !busy && onClose()} aria-hidden />
          <motion.form
            ref={panelRef}
            onSubmit={submit}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="relative flex max-h-full w-full flex-col overflow-hidden bg-card shadow-2xl sm:max-h-[84vh] sm:max-w-2xl sm:rounded-2xl sm:border sm:border-line"
          >
            <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5 sm:px-6">
              <h2 id={titleId} className="font-display text-base font-bold text-ink">
                {t('tasks.newTask')}
              </h2>
              <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink" aria-label={t('tasks.actions.close')}>
                <X className="size-4" />
              </button>
            </header>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                placeholder={t('tasks.ph.title')}
                aria-label={t('tasks.fields.title')}
                className="w-full border-0 bg-transparent p-0 font-display text-xl font-bold text-ink outline-none placeholder:text-muted/60 sm:text-2xl"
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
                  <label className="label" htmlFor={`${titleId}-due-date`}>
                    {t('tasks.fields.dueAt')}
                  </label>
                  <DateTimeField
                    idPrefix={`${titleId}-due`}
                    label={t('tasks.fields.dueAt')}
                    date={due.date}
                    time={due.time}
                    onChange={(date, time) => setDue({ date, time: date ? time || DEFAULT_DUE_TIME : '' })}
                  />
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
                    onChange={(date, time) => setStart({ date, time: date ? time || '09:00' : '' })}
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
              <p className="text-xs text-muted">{t('tasks.panel.timezone')}</p>
            </div>
            <footer className="flex items-center justify-end gap-2 border-t border-line bg-surface/60 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
              <button type="button" onClick={onClose} className="btn-white btn-sm border border-line" disabled={busy}>
                {t('tasks.actions.cancel')}
              </button>
              <button type="submit" className="btn-primary btn-sm" disabled={!title.trim() || busy}>
                {busy && <Spinner className="size-3.5" />}
                {busy ? t('tasks.actions.creating') : t('tasks.actions.create')}
              </button>
            </footer>
          </motion.form>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
};
