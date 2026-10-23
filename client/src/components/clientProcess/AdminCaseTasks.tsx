import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import { BellRing, CheckCircle2, ClipboardList, ExternalLink, Paperclip, Plus, RotateCcw, Trash2, XCircle } from 'lucide-react';
import { api, fileUrl } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import type { CaseDetail } from '@/lib/types';
import { Panel } from '@/components/admin/ui';
import { Modal } from '@/components/admin/Modal';
import { fmtDate } from '@/components/admin/labels';
import { caseKey } from '@/components/admin/case/shared';
import { cpKeys, STATE_TONE, useCpError, type StaffTaskView, type TaskTemplate } from './api';

const ymd = (d: Date) => new Date(d.getTime() + 4 * 3600 * 1000).toISOString().slice(0, 10);

const NewTaskModal = ({ c, open, onClose }: { c: CaseDetail; open: boolean; onClose: () => void }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const qc = useQueryClient();
  const onError = useCpError('admin');
  const clientLocale = (c.client as { locale?: string }).locale ?? 'az';
  const { data: templates } = useQuery({
    queryKey: cpKeys.templates,
    queryFn: async () => (await api.get<{ templates: TaskTemplate[] }>('/admin/client-process/templates')).data.templates,
    enabled: open,
    staleTime: Infinity,
  });
  const [template, setTemplate] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [requirementId, setRequirementId] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [notify, setNotify] = useState(true);

  const pick = (key: string) => {
    setTemplate(key);
    const tpl = templates?.find((x) => x.key === key);
    if (!tpl) return;
    // The client reads it in their language; staff edit the text in it too.
    setTitle(tpl.title[clientLocale] ?? tpl.title.az);
    setDescription(tpl.description[clientLocale] ?? tpl.description.az);
    setDueAt(ymd(new Date(Date.now() + tpl.dueDays * 86400000)));
  };
  const reset = () => {
    setTemplate('');
    setTitle('');
    setDescription('');
    setDueAt('');
    setRequirementId('');
    setLinkUrl('');
    setFile(null);
    setNotify(true);
  };
  const create = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      if (template) fd.append('template', template);
      fd.append('title', title.trim());
      if (description.trim()) fd.append('description', description.trim());
      if (dueAt) fd.append('dueAt', dueAt);
      if (requirementId) fd.append('requirementId', requirementId);
      if (linkUrl.trim()) fd.append('linkUrl', linkUrl.trim());
      if (file) fd.append('file', file);
      fd.append('notify', String(notify));
      return api.post(`/admin/client-process/cases/${c.id}/tasks`, fd);
    },
    onSuccess: () => {
      toast.success(t('cp.tasks.created'));
      reset();
      onClose();
      void qc.invalidateQueries({ queryKey: cpKeys.caseTasks(c.id) });
      void qc.invalidateQueries({ queryKey: caseKey(c.id) });
    },
    onError,
  });
  const reqs = c.requirements.filter((r) => r.stage === 'INITIAL' || r.stage === 'EMBASSY');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('cp.tasks.add')}
      description={t('cp.tasks.remindersHint')}
      size="lg"
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
            {t('cp.tasks.cancel')}
          </button>
          <button type="button" className="btn-primary btn-sm" disabled={title.trim().length < 2 || create.isPending} onClick={() => create.mutate()}>
            {t('cp.tasks.create')}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="label">{t('cp.tasks.template')}</p>
          <div className="flex flex-wrap gap-2">
            {(templates ?? []).map((tpl) => (
              <button key={tpl.key} type="button" onClick={() => pick(tpl.key)} aria-pressed={template === tpl.key} className={clsx('min-h-9 rounded-full border px-3 text-xs font-semibold', template === tpl.key ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-line bg-card text-navy-900')}>
                {tpl.title[clientLocale] ?? tpl.title.az}
              </button>
            ))}
            <button type="button" onClick={() => setTemplate('')} aria-pressed={!template} className={clsx('min-h-9 rounded-full border px-3 text-xs font-semibold', !template ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-line bg-card text-navy-900')}>
              {t('cp.tasks.custom')}
            </button>
          </div>
        </div>
        <label className="block">
          <span className="label">{t('cp.tasks.fTitle')}</span>
          <input className="input" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">{t('cp.tasks.fDescription')}</span>
          <textarea className="input min-h-20 resize-y" value={description} maxLength={4000} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label">{t('cp.tasks.fDue')}</span>
            <input type="date" className="input" value={dueAt} min={ymd(new Date())} onChange={(e) => setDueAt(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">{t('cp.tasks.fRequirement')}</span>
            <select className="input" value={requirementId} onChange={(e) => setRequirementId(e.target.value)}>
              <option value="">{t('cp.tasks.none')}</option>
              {reqs.map((r) => (
                <option key={r.id} value={r.id}>
                  {tr(r.title)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">{t('cp.tasks.fLink')}</span>
            <input type="url" className="input" value={linkUrl} placeholder="https://" onChange={(e) => setLinkUrl(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">{t('cp.tasks.fFile')}</span>
            <input type="file" className="block w-full text-sm" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> {t('cp.tasks.fNotify')}
        </label>
      </div>
    </Modal>
  );
};

/** Staff: the client's tasks on the case page. */
export const AdminCaseTasks = ({ c }: { c: CaseDetail }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const onError = useCpError('admin');
  const [adding, setAdding] = useState(false);
  const { data } = useQuery({
    queryKey: cpKeys.caseTasks(c.id),
    queryFn: async () => (await api.get<{ tasks: StaffTaskView[] }>(`/admin/client-process/cases/${c.id}/tasks`)).data.tasks,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: cpKeys.caseTasks(c.id) });
    void qc.invalidateQueries({ queryKey: caseKey(c.id) });
  };
  const patch = useMutation({ mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/admin/client-process/tasks/${id}`, { status }), onSuccess: refresh, onError });
  const remove = useMutation({ mutationFn: (id: string) => api.delete(`/admin/client-process/tasks/${id}`), onSuccess: refresh, onError });
  const remind = useMutation({ mutationFn: (id: string) => api.post(`/admin/client-process/tasks/${id}/remind`), onSuccess: () => toast.success(t('cp.tasks.reminded')), onError });
  const tasks = data ?? [];
  const closed = ['APPROVED', 'REJECTED', 'CANCELLED'].includes(c.status);

  return (
    <Panel
      id="client-tasks"
      title={t('cp.tasks.staffTitle')}
      icon={ClipboardList}
      className="scroll-mt-24"
      actions={
        !closed && (
          <button type="button" className="btn-primary btn-sm" onClick={() => setAdding(true)}>
            <Plus className="size-4" aria-hidden /> {t('cp.tasks.add')}
          </button>
        )
      }
    >
      {tasks.length === 0 ? (
        <p className="text-sm text-muted">{t('cp.tasks.empty')}</p>
      ) : (
        <ul className="space-y-3">
          {tasks.map((task) => (
            <li key={task.id} className={clsx('rounded-lg border p-3', task.state === 'overdue' ? 'border-red-200 bg-red-50/50' : 'border-line')}>
              <div className="flex flex-wrap items-center gap-2">
                <p className={clsx('min-w-0 flex-1 text-sm font-semibold break-words text-navy-900', task.status !== 'OPEN' && 'text-muted line-through')}>{task.rawTitle}</p>
                <span className={clsx('badge', STATE_TONE[task.state])}>{t(`cp.tasks.state.${task.state}`)}</span>
              </div>
              <p className="mt-0.5 text-xs text-muted">
                {task.dueAt ? t('cp.tasks.due', { date: fmtDate(task.dueAt) }) : t('cp.tasks.noDue')}
                {task.createdBy && ` · ${t('cp.tasks.by', { name: task.createdBy.name })}`}
                {task.requirement && ` · ${task.requirement.title}`}
                {task.completedAt && ` · ${t('cp.tasks.completedAt', { date: fmtDate(task.completedAt) })}`}
                {task.completedVia === 'UPLOAD' && ` (${t('cp.tasks.viaUpload')})`}
              </p>
              {task.clientNote && <p className="mt-1 text-xs text-slate-700">{t('cp.tasks.clientNote', { note: task.clientNote })}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {task.linkUrl && (
                  <a href={task.linkUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm">
                    <ExternalLink className="size-3.5" aria-hidden /> {t('cp.tasks.openLink')}
                  </a>
                )}
                {task.attachmentId && (
                  <a href={fileUrl(task.attachmentId)} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm">
                    <Paperclip className="size-3.5" aria-hidden /> {t('cp.tasks.attachment')}
                  </a>
                )}
                {task.clientDocumentId && (
                  <a href={fileUrl(task.clientDocumentId)} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm">
                    <Paperclip className="size-3.5" aria-hidden /> {t('cp.tasks.clientFile')}
                  </a>
                )}
                {task.status === 'OPEN' ? (
                  <>
                    <button type="button" className="btn-secondary btn-sm" onClick={() => remind.mutate(task.id)} disabled={remind.isPending}>
                      <BellRing className="size-3.5" aria-hidden /> {t('cp.tasks.remind')}
                    </button>
                    <button type="button" className="btn-secondary btn-sm" onClick={() => patch.mutate({ id: task.id, status: 'DONE' })}>
                      <CheckCircle2 className="size-3.5" aria-hidden /> {t('cp.tasks.markDone')}
                    </button>
                    <button type="button" className="btn-secondary btn-sm" onClick={() => patch.mutate({ id: task.id, status: 'CANCELLED' })}>
                      <XCircle className="size-3.5" aria-hidden /> {t('cp.tasks.cancelTask')}
                    </button>
                  </>
                ) : (
                  <button type="button" className="btn-secondary btn-sm" onClick={() => patch.mutate({ id: task.id, status: 'OPEN' })}>
                    <RotateCcw className="size-3.5" aria-hidden /> {t('cp.tasks.reopen')}
                  </button>
                )}
                <button
                  type="button"
                  className="btn-secondary btn-sm text-danger"
                  aria-label={t('cp.tasks.delete')}
                  onClick={() => {
                    // TODO(ui): ConfirmDialog
                    if (window.confirm(t('cp.tasks.deleteConfirm'))) remove.mutate(task.id);
                  }}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <NewTaskModal c={c} open={adding} onClose={() => setAdding(false)} />
    </Panel>
  );
};

export default AdminCaseTasks;
