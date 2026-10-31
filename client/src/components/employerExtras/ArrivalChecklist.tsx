import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { CalendarDays, CheckCircle2, Circle, ClipboardCheck, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesEmployerExtras } from '@/i18n/pagesEmployerExtras';
import { Spinner } from '@/components/ui/Spinner';
import { Drawer } from '@/components/ui/Drawer';
import { Switch } from '@/components/ui/Switch';
import { ErrorState } from '@/components/ui/ErrorState';
import { fmtDate } from '@/components/admin/labels';
import { toastJobsError } from '@/components/jobs/labels';

registerCopy(pagesEmployerExtras);

export interface ChecklistItem {
  id: string;
  key: string | null;
  label: string | null;
  custom?: boolean;
  done: boolean;
  doneAt: string | null;
  doneByName?: string | null;
  dueDate: string | null;
  note?: string | null;
  visibleToWorker?: boolean;
}

interface Progress {
  done: number;
  total: number;
}

interface OverviewRow {
  caseId: string;
  name: string;
  profession: string;
  arrival: string | null;
  firstDay: string | null;
  progress: Progress;
}

const useItemLabel = () => {
  const { t } = useTranslation();
  return (i: Pick<ChecklistItem, 'key' | 'label'>) => (i.key ? t(`employerChecklist.item.${i.key}`) : (i.label ?? ''));
};

const dayInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

export const ProgressBar = ({ progress, className }: { progress: Progress; className?: string }) => {
  const { t } = useTranslation();
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <div className={className}>
      <div className="h-1.5 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={clsx('h-full rounded-full', pct === 100 ? 'bg-success' : 'bg-primary')} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted">{t('employerChecklist.progress', { done: progress.done, total: progress.total })}</p>
    </div>
  );
};

// ─── Company: one item row (editable) ─────────────────────────────────────

const ItemRow = ({ caseId, item, onSaved }: { caseId: string; item: ChecklistItem; onSaved: () => void }) => {
  const { t } = useTranslation();
  const label = useItemLabel();
  const [note, setNote] = useState(item.note ?? '');
  useEffect(() => setNote(item.note ?? ''), [item.note]);
  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`/company/workers/${caseId}/checklist/${item.id}`, body),
    onSuccess: onSaved,
    onError: toastJobsError,
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/company/workers/${caseId}/checklist/${item.id}`),
    onSuccess: onSaved,
    onError: toastJobsError,
  });
  return (
    <li className={clsx('rounded-xl border p-3', item.done ? 'border-success/40 bg-success/5' : 'border-line bg-card')}>
      <div className="flex items-start gap-3">
        <button
          type="button"
          role="checkbox"
          aria-checked={item.done}
          aria-label={label(item)}
          disabled={patch.isPending}
          onClick={() => patch.mutate({ done: !item.done })}
          className="mt-0.5 shrink-0"
        >
          {patch.isPending ? <Spinner className="size-5" /> : item.done ? <CheckCircle2 className="size-5 text-success" /> : <Circle className="size-5 text-muted" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{label(item)}</p>
          {item.done && item.doneAt && (
            <p className="text-[11px] text-muted">{t('employerChecklist.doneBy', { name: item.doneByName ?? '—', date: fmtDate(item.doneAt) })}</p>
          )}
          <div className="mt-2 grid gap-2 sm:grid-cols-[10rem_1fr]">
            <label className="text-[11px] font-medium text-muted">
              {t('employerChecklist.date')}
              <input
                type="date"
                className="input mt-0.5 text-sm"
                defaultValue={dayInput(item.dueDate)}
                onBlur={(e) => {
                  if (e.target.value !== dayInput(item.dueDate)) patch.mutate({ dueDate: e.target.value || null });
                }}
              />
            </label>
            <label className="text-[11px] font-medium text-muted">
              {t('employerChecklist.note')}
              <input
                className="input mt-0.5 text-sm"
                maxLength={1000}
                value={note}
                placeholder={t('employerChecklist.notePh')}
                onChange={(e) => setNote(e.target.value)}
                onBlur={() => {
                  if (note.trim() !== (item.note ?? '')) patch.mutate({ note: note.trim() || null });
                }}
              />
            </label>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <Switch size="sm" showLabel checked={!!item.visibleToWorker} onChange={(v) => patch.mutate({ visibleToWorker: v })} label={t('employerChecklist.visible')} />
            {item.custom && (
              <button type="button" className="btn-ghost btn-sm text-danger" disabled={remove.isPending} onClick={() => remove.mutate()}>
                <Trash2 className="size-3.5" /> {t('employerChecklist.remove')}
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
};

/** Company: the checklist of one worker in a drawer. */
export const ChecklistDrawer = ({ caseId, name, onClose }: { caseId: string | null; name?: string; onClose: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [label, setLabel] = useState('');
  const q = useQuery({
    queryKey: ['company-arrival-checklist', caseId],
    enabled: !!caseId,
    queryFn: async () => (await api.get<{ items: ChecklistItem[]; progress: Progress; firstDay: string | null }>(`/company/workers/${caseId}/checklist`)).data,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['company-arrival-checklist', caseId] });
    void qc.invalidateQueries({ queryKey: ['company-arrival-checklists'] });
  };
  const add = useMutation({
    mutationFn: () => api.post(`/company/workers/${caseId}/checklist`, { label: label.trim() }),
    onSuccess: () => {
      setLabel('');
      toast.success(t('employerChecklist.saved'));
      refresh();
    },
    onError: toastJobsError,
  });
  return (
    <Drawer open={!!caseId} onClose={onClose} title={t('employerChecklist.title')} description={name} width="md" closeLabel={t('employerChecklist.close')}>
      {q.isLoading ? (
        <Spinner />
      ) : q.isError || !q.data ? (
        <ErrorState onRetry={() => void q.refetch()} />
      ) : (
        <div className="space-y-4">
          <ProgressBar progress={q.data.progress} />
          <ul className="space-y-2">
            {q.data.items.map((i) => (
              <ItemRow key={i.id} caseId={caseId!} item={i} onSaved={refresh} />
            ))}
          </ul>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (label.trim()) add.mutate();
            }}
          >
            <label className="sr-only" htmlFor="checklist-new">
              {t('employerChecklist.add')}
            </label>
            <input id="checklist-new" className="input text-sm" maxLength={200} value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('employerChecklist.addPh')} />
            <button type="submit" className="btn-secondary btn-sm shrink-0" disabled={!label.trim() || add.isPending}>
              {add.isPending ? <Spinner className="size-3.5" /> : <Plus className="size-3.5" />} {t('employerChecklist.add')}
            </button>
          </form>
        </div>
      )}
    </Drawer>
  );
};

/** Company portal ("Workers" page): progress of every worker with an approved visa; ?checklist=<caseId> opens one. */
export const CompanyArrivalChecklists = () => {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const openId = params.get('checklist');
  const q = useQuery({
    queryKey: ['company-arrival-checklists'],
    queryFn: async () => (await api.get<{ items: OverviewRow[] }>('/company/workers/checklists/overview')).data.items,
  });
  const setOpen = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('checklist', id);
    else next.delete('checklist');
    setParams(next, { replace: true });
  };
  const rows = q.data ?? [];
  if (q.isLoading || (!rows.length && !openId)) return null; // nothing to prepare yet: no empty card on the page

  return (
    <section className="card min-w-0 p-5 sm:p-6">
      <header className="mb-4">
        <h2 className="type-section-title flex items-center gap-2 text-ink">
          <ClipboardCheck className="size-5 text-primary" aria-hidden /> {t('employerChecklist.overviewTitle')}
        </h2>
        <p className="mt-1 text-xs text-muted">{t('employerChecklist.overviewHint')}</p>
      </header>
      {q.isError ? (
        <ErrorState onRetry={() => void q.refetch()} />
      ) : !rows.length ? (
        <p className="text-sm text-muted">{t('employerChecklist.empty')}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => (
            <li key={r.caseId}>
              <button
                type="button"
                onClick={() => setOpen(r.caseId)}
                className="w-full rounded-xl border border-line bg-card p-4 text-left transition-colors hover:border-line-strong"
                aria-label={`${t('employerChecklist.open')}: ${r.name}`}
              >
                <p className="truncate font-semibold text-ink">{r.name}</p>
                <p className="truncate text-xs text-muted">{r.profession}</p>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                  {r.arrival && (
                    <span>
                      {t('employerChecklist.arrival')}: {fmtDate(r.arrival)}
                    </span>
                  )}
                  {r.firstDay && (
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="size-3" aria-hidden /> {t('employerChecklist.firstDay')}: {fmtDate(r.firstDay)}
                    </span>
                  )}
                </div>
                <ProgressBar progress={r.progress} className="mt-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <ChecklistDrawer caseId={openId} name={rows.find((r) => r.caseId === openId)?.name} onClose={() => setOpen(null)} />
    </section>
  );
};

// ─── Read-only lists: staff (admin arrival view) and worker (client arrival page) ───

export const ReadOnlyChecklist = ({ items, staff = false }: { items: ChecklistItem[]; staff?: boolean }) => {
  const { t } = useTranslation();
  const label = useItemLabel();
  return (
    <ul className="space-y-1.5">
      {items.map((i) => (
        <li key={i.id} className="flex items-start gap-2 text-sm">
          {i.done ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> : <Circle className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />}
          <div className="min-w-0 flex-1">
            <p className={clsx('text-ink', !i.done && 'text-muted')}>
              <span className="sr-only">{i.done ? t('employerChecklist.done') : ''} </span>
              {label(i)}
              {i.dueDate && <span className="ml-1.5 text-xs text-muted">· {fmtDate(i.dueDate)}</span>}
              {staff && i.visibleToWorker === false && <span className="ml-1.5 text-[11px] text-muted">({t('employerChecklist.internal')})</span>}
            </p>
            {staff && i.done && i.doneAt && <p className="text-[11px] text-muted">{t('employerChecklist.doneBy', { name: i.doneByName ?? '—', date: fmtDate(i.doneAt) })}</p>}
            {staff && i.note && <p className="text-xs text-muted">{i.note}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
};

/** Staff: employer checklist block for the admin arrival detail. */
export const StaffEmployerChecklist = ({
  checklist,
}: {
  checklist: { company: { id: string; name: string } | null; items: ChecklistItem[]; progress: Progress; firstDay: string | null } | null | undefined;
}) => {
  const { t } = useTranslation();
  if (!checklist) return null;
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
        <ClipboardCheck className="size-4 text-primary" aria-hidden /> {t('employerChecklist.staffTitle')}
        {checklist.company && <span className="font-normal text-muted">· {checklist.company.name}</span>}
      </p>
      {checklist.items.length ? (
        <>
          <ProgressBar progress={checklist.progress} />
          <ReadOnlyChecklist items={checklist.items} staff />
        </>
      ) : (
        <p className="text-xs text-muted">{t('employerChecklist.staffEmpty')}</p>
      )}
    </div>
  );
};

/** Worker: what the employer prepares (items it shares), read-only on the client arrival page. */
export const WorkerEmployerChecklist = ({ caseId }: { caseId: string }) => {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['arrival-employer-checklist', caseId],
    queryFn: async () => (await api.get<{ employerChecklist: { items: ChecklistItem[]; progress: Progress } | null }>(`/arrival/${caseId}`)).data.employerChecklist,
  });
  if (!q.data) return null;
  return (
    <section className="card p-5">
      <h3 className="type-card-title flex items-center gap-2">
        <ClipboardCheck className="size-5 text-primary" aria-hidden /> {t('employerChecklist.workerTitle')}
      </h3>
      <p className="mt-1 text-xs text-muted">{t('employerChecklist.workerHint')}</p>
      <ProgressBar progress={q.data.progress} className="my-3" />
      <ReadOnlyChecklist items={q.data.items} />
    </section>
  );
};

/** Staff: loads the employer checklist of an arrival plan (admin arrival drawer). */
export const StaffEmployerChecklistCard = ({ caseId }: { caseId: string }) => {
  const q = useQuery({
    queryKey: ['admin-arrivals', 'employer-checklist', caseId],
    queryFn: async () =>
      (await api.get<{ employerChecklist: Parameters<typeof StaffEmployerChecklist>[0]['checklist'] }>(`/admin/arrivals/${caseId}`)).data.employerChecklist,
  });
  if (!q.data) return null;
  return (
    <div className="rounded-2xl border border-line p-4">
      <StaffEmployerChecklist checklist={q.data} />
    </div>
  );
};
