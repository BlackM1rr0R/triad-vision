import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, BookOpen, Download, Hourglass, ListChecks, Pencil, PlayCircle, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useL10n } from '@/lib/l10n';
import { usePageTitle } from '@/lib/usePageTitle';
import { hasMinRole, type L10n } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { pagesWaitingRoom } from '@/i18n/pagesWaitingRoom';
import { Modal } from '@/components/admin/Modal';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { L10nInput, emptyL10n } from '@/components/admin/L10nInput';
import { EmptyState, ErrorBlock, LoadingBlock, PageHead, Switch } from '@/components/admin/ui';
import { statusLabel } from '@/components/admin/labels';
import { Spinner } from '@/components/ui/Spinner';
import { WR_KINDS, WR_STAGES, WR_TOPICS, WR_VISA_TYPES, type AdminWrItem, type WrKind, type WrStage, type WrTopic, type WrVisaType } from '@/components/waitingRoom/api';

registerCopy(pagesWaitingRoom);

const KEY = ['admin-waiting-room'];
const KIND_ICON = { LESSON: BookOpen, VIDEO: PlayCircle, EXERCISE: Sparkles, CHECKLIST: ListChecks } as const;
const selectCls = 'input w-auto min-w-0 py-2 text-sm';

type Question = { q: L10n; options: L10n[]; answer: number };
type Draft = {
  id?: string;
  kind: WrKind;
  topic: WrTopic;
  title: L10n;
  body: L10n;
  videoUrl: string;
  minutes: string;
  exercise: Question[];
  visaTypes: WrVisaType[];
  stages: WrStage[];
  published: boolean;
};

const blankQuestion = (): Question => ({ q: emptyL10n(), options: [emptyL10n(), emptyL10n()], answer: 0 });
const blankDraft = (): Draft => ({ kind: 'LESSON', topic: 'life', title: emptyL10n(), body: emptyL10n(), videoUrl: '', minutes: '3', exercise: [], visaTypes: [], stages: [], published: true });
const toDraft = (i: AdminWrItem): Draft => ({
  id: i.id,
  kind: i.kind,
  topic: i.topic,
  title: { ...emptyL10n(), ...i.title },
  body: { ...emptyL10n(), ...(i.body ?? {}) },
  videoUrl: i.videoUrl ?? '',
  minutes: i.minutes ? String(i.minutes) : '',
  exercise: (i.exercise ?? []).map((q) => ({ q: { ...emptyL10n(), ...q.q }, options: q.options.map((o) => ({ ...emptyL10n(), ...o })), answer: q.answer })),
  visaTypes: i.visaTypes ?? [],
  stages: i.stages ?? [],
  published: i.published,
});

const useWrError = () => {
  const { t, i18n } = useTranslation();
  return (err: unknown) => {
    const code = errorCode(err);
    toast.error(i18n.exists(`waitingRoom.admin.errors.${code}`) ? t(`waitingRoom.admin.errors.${code}`) : i18n.exists(`admin.errors.${code}`) ? t(`admin.errors.${code}`) : t('common.error'));
  };
};

const Chips = <T extends string>({ legend, hint, all, value, onChange, label }: { legend: string; hint: string; all: readonly T[]; value: T[]; onChange: (v: T[]) => void; label: (v: T) => string }) => (
  <fieldset>
    <legend className="label">{legend}</legend>
    <div className="flex flex-wrap gap-2">
      {all.map((v) => {
        const on = value.includes(v);
        return (
          <label key={v} className={clsx('inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-colors', on ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-line bg-card text-ink/80')}>
            <input type="checkbox" className="size-3.5 accent-brand-600" checked={on} onChange={(e) => onChange(e.target.checked ? [...value, v] : value.filter((x) => x !== v))} />
            {label(v)}
          </label>
        );
      })}
    </div>
    <p className="mt-1 text-xs text-muted">{hint}</p>
  </fieldset>
);

// ─── Edit dialog ──────────────────────────────────────────────────────────

const EditDialog = ({ draft, onClose }: { draft: Draft; onClose: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const onError = useWrError();
  const [d, setD] = useState<Draft>(draft);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const setQ = (qi: number, q: Question) => set('exercise', d.exercise.map((x, i) => (i === qi ? q : x)));

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        kind: d.kind,
        topic: d.topic,
        title: d.title,
        body: Object.values(d.body).some((v) => v.trim()) ? d.body : null,
        videoUrl: d.kind === 'VIDEO' ? d.videoUrl.trim() || null : null,
        exercise: d.kind === 'EXERCISE' ? d.exercise : null,
        minutes: d.minutes ? Number(d.minutes) : null,
        visaTypes: d.visaTypes,
        stages: d.stages,
        published: d.published,
      };
      return d.id ? api.put(`/admin/waiting-room/${d.id}`, body) : api.post('/admin/waiting-room', body);
    },
    onSuccess: () => {
      toast.success(t('waitingRoom.admin.saved'));
      void qc.invalidateQueries({ queryKey: KEY });
      onClose();
    },
    onError,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  const formId = 'waiting-room-form';

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={d.id ? t('waitingRoom.admin.editTitle') : t('waitingRoom.admin.newTitle')}
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
            {t('waitingRoom.admin.cancel')}
          </button>
          <button type="submit" form={formId} className="btn-primary btn-sm" disabled={save.isPending}>
            {save.isPending && <Spinner className="size-3.5" />} {t('waitingRoom.admin.save')}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="label">{t('waitingRoom.admin.kind')}</span>
            <select className="input" value={d.kind} onChange={(e) => setD((p) => ({ ...p, kind: e.target.value as WrKind, exercise: e.target.value === 'EXERCISE' && !p.exercise.length ? [blankQuestion()] : p.exercise }))}>
              {WR_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`waitingRoom.kinds.${k}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">{t('waitingRoom.admin.topic')}</span>
            <select className="input" value={d.topic} onChange={(e) => set('topic', e.target.value as WrTopic)}>
              {WR_TOPICS.map((k) => (
                <option key={k} value={k}>
                  {t(`waitingRoom.topics.${k}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">{t('waitingRoom.admin.minutes')}</span>
            <input className="input" type="number" min={1} max={240} value={d.minutes} onChange={(e) => set('minutes', e.target.value)} />
          </label>
        </div>

        <L10nInput label={t('waitingRoom.admin.titleLabel')} value={d.title} onChange={(v) => set('title', v)} required />
        <L10nInput label={t('waitingRoom.admin.body')} value={d.body} onChange={(v) => set('body', v)} multiline rows={8} hint={t('waitingRoom.admin.bodyHint')} />

        {d.kind === 'VIDEO' && (
          <label className="block">
            <span className="label">{t('waitingRoom.admin.videoUrl')} *</span>
            <input className="input" type="url" required placeholder="https://www.youtube.com/watch?v=…" value={d.videoUrl} onChange={(e) => set('videoUrl', e.target.value)} />
            <span className="mt-1 block text-xs text-muted">{t('waitingRoom.admin.videoHint')}</span>
          </label>
        )}

        {d.kind === 'EXERCISE' && (
          <fieldset className="space-y-3">
            <legend className="label">{t('waitingRoom.admin.exercise')}</legend>
            {d.exercise.map((q, qi) => (
              <div key={qi} className="space-y-3 rounded-xl border border-line bg-surface p-3 sm:p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-muted">{t('waitingRoom.admin.question', { n: qi + 1 })}</span>
                  <button type="button" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-card hover:text-danger" onClick={() => set('exercise', d.exercise.filter((_, i) => i !== qi))} aria-label={t('waitingRoom.admin.removeQuestion')}>
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <L10nInput label={t('waitingRoom.admin.question', { n: qi + 1 })} value={q.q} onChange={(v) => setQ(qi, { ...q, q: v })} required />
                {q.options.map((o, oi) => (
                  <div key={oi} className="flex items-start gap-2">
                    <label className="mt-8 flex shrink-0 items-center" title={t('waitingRoom.admin.correctOption')}>
                      <input type="radio" name={`q-${qi}-answer`} className="size-4 accent-success" checked={q.answer === oi} onChange={() => setQ(qi, { ...q, answer: oi })} aria-label={`${t('waitingRoom.admin.correctOption')}: ${t('waitingRoom.admin.option', { n: oi + 1 })}`} />
                    </label>
                    <div className="min-w-0 flex-1">
                      <L10nInput label={t('waitingRoom.admin.option', { n: oi + 1 })} value={o} onChange={(v) => setQ(qi, { ...q, options: q.options.map((x, i) => (i === oi ? v : x)) })} required />
                    </div>
                    {q.options.length > 2 && (
                      <button
                        type="button"
                        className="mt-7 grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-card hover:text-danger"
                        onClick={() => setQ(qi, { ...q, options: q.options.filter((_, i) => i !== oi), answer: q.answer === oi ? 0 : q.answer > oi ? q.answer - 1 : q.answer })}
                        aria-label={t('waitingRoom.admin.removeOption')}
                      >
                        <X className="size-4" />
                      </button>
                    )}
                  </div>
                ))}
                {q.options.length < 6 && (
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setQ(qi, { ...q, options: [...q.options, emptyL10n()] })}>
                    <Plus className="size-3.5" aria-hidden /> {t('waitingRoom.admin.addOption')}
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="btn-secondary btn-sm" onClick={() => set('exercise', [...d.exercise, blankQuestion()])}>
              <Plus className="size-3.5" aria-hidden /> {t('waitingRoom.admin.addQuestion')}
            </button>
          </fieldset>
        )}

        <Chips legend={t('waitingRoom.admin.visaTypes')} hint={t('waitingRoom.admin.visaHint')} all={WR_VISA_TYPES} value={d.visaTypes} onChange={(v) => set('visaTypes', v)} label={(v) => t(`waitingRoom.visa.${v}`)} />
        <Chips legend={t('waitingRoom.admin.stages')} hint={t('waitingRoom.admin.stagesHint')} all={WR_STAGES} value={d.stages} onChange={(v) => set('stages', v)} label={(v) => statusLabel(v)} />

        <div className="flex items-center gap-3">
          <Switch checked={d.published} onChange={(v) => set('published', v)} label={t('waitingRoom.admin.published')} />
          <span className="text-sm text-ink">{d.published ? t('waitingRoom.admin.published') : t('waitingRoom.admin.draft')}</span>
        </div>
      </form>
    </Modal>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────

export default function AdminWaitingRoom() {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const { user } = useAuth();
  usePageTitle(t('waitingRoom.admin.title'));
  const qc = useQueryClient();
  const onError = useWrError();
  const canEdit = hasMinRole(user?.role, 'ADMIN');
  const [kind, setKind] = useState<WrKind | ''>('');
  const [topic, setTopic] = useState<WrTopic | ''>('');
  const [status, setStatus] = useState<'' | 'true' | 'false'>('');
  const [editing, setEditing] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<AdminWrItem | null>(null);

  const list = useQuery({ queryKey: KEY, queryFn: async () => (await api.get<{ items: AdminWrItem[] }>('/admin/waiting-room')).data.items });
  const items = useMemo(() => list.data ?? [], [list.data]);
  const filtered = items.filter((i) => (!kind || i.kind === kind) && (!topic || i.topic === topic) && (!status || String(i.published) === status));
  const refresh = () => void qc.invalidateQueries({ queryKey: KEY });

  const publish = useMutation({ mutationFn: (v: { id: string; published: boolean }) => api.patch(`/admin/waiting-room/${v.id}/publish`, { published: v.published }), onSuccess: refresh, onError });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/waiting-room/${id}`),
    onSuccess: () => {
      toast.success(t('waitingRoom.admin.deleted'));
      setDeleting(null);
      refresh();
    },
    onError,
  });
  const reorder = useMutation({ mutationFn: (ids: string[]) => api.post('/admin/waiting-room/reorder', { ids }), onSuccess: refresh, onError });
  const starter = useMutation({
    mutationFn: async () => (await api.post<{ created: number; skipped: number }>('/admin/waiting-room/starter')).data,
    onSuccess: (r) => {
      toast.success(t('waitingRoom.admin.starterDone', r));
      refresh();
    },
    onError,
  });

  /** Moves an item one place in the overall order (the order clients see). */
  const move = (item: AdminWrItem, dir: -1 | 1) => {
    const i = items.findIndex((x) => x.id === item.id);
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const ids = items.map((x) => x.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    reorder.mutate(ids);
  };

  return (
    <div>
      <PageHead
        title={t('waitingRoom.admin.title')}
        subtitle={canEdit ? t('waitingRoom.admin.subtitle') : `${t('waitingRoom.admin.subtitle')} ${t('waitingRoom.admin.readOnly')}`}
        actions={
          canEdit && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary btn-sm" onClick={() => starter.mutate()} disabled={starter.isPending}>
                {starter.isPending ? <Spinner className="size-3.5" /> : <Download className="size-3.5" aria-hidden />} {t('waitingRoom.admin.starter')}
              </button>
              <button type="button" className="btn-primary btn-sm" onClick={() => setEditing(blankDraft())}>
                <Plus className="size-3.5" aria-hidden /> {t('waitingRoom.admin.add')}
              </button>
            </div>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select className={selectCls} value={kind} onChange={(e) => setKind(e.target.value as WrKind | '')} aria-label={t('waitingRoom.admin.kind')}>
          <option value="">{t('waitingRoom.admin.all')}</option>
          {WR_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`waitingRoom.kinds.${k}`)}
            </option>
          ))}
        </select>
        <select className={selectCls} value={topic} onChange={(e) => setTopic(e.target.value as WrTopic | '')} aria-label={t('waitingRoom.admin.topic')}>
          <option value="">{t('waitingRoom.admin.all')}</option>
          {WR_TOPICS.map((k) => (
            <option key={k} value={k}>
              {t(`waitingRoom.topics.${k}`)}
            </option>
          ))}
        </select>
        <select className={selectCls} value={status} onChange={(e) => setStatus(e.target.value as '' | 'true' | 'false')} aria-label={t('waitingRoom.admin.cols.status')}>
          <option value="">{t('waitingRoom.admin.allStatus')}</option>
          <option value="true">{t('waitingRoom.admin.published')}</option>
          <option value="false">{t('waitingRoom.admin.draft')}</option>
        </select>
      </div>

      {list.isLoading ? (
        <LoadingBlock />
      ) : list.isError ? (
        <ErrorBlock error={list.error} onRetry={() => void list.refetch()} />
      ) : (
        <section className="min-w-0 overflow-hidden rounded-xl border border-line bg-card">
          <p className="border-b border-line px-4 py-2.5 text-xs font-semibold text-muted">{t('waitingRoom.admin.count', { n: filtered.length })}</p>
          {filtered.length === 0 ? (
            <EmptyState icon={Hourglass} title={t('waitingRoom.admin.empty')} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-surface text-left text-xs font-semibold text-muted">
                  <tr>
                    {canEdit && <th className="w-16 px-3 py-2" />}
                    <th className="px-3 py-2">{t('waitingRoom.admin.cols.item')}</th>
                    <th className="px-3 py-2">{t('waitingRoom.admin.cols.topic')}</th>
                    <th className="px-3 py-2">{t('waitingRoom.admin.cols.audience')}</th>
                    <th className="px-3 py-2">{t('waitingRoom.admin.cols.done')}</th>
                    <th className="px-3 py-2">{t('waitingRoom.admin.cols.status')}</th>
                    {canEdit && <th className="w-24 px-3 py-2" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {filtered.map((i) => {
                    const Icon = KIND_ICON[i.kind];
                    return (
                      <tr key={i.id} className={clsx('align-top transition-colors hover:bg-surface/60', !i.published && 'opacity-70')}>
                        {canEdit && (
                          <td className="px-3 py-2.5">
                            <div className="flex flex-col gap-0.5">
                              <button type="button" className="grid size-7 place-items-center rounded text-muted hover:bg-surface hover:text-ink disabled:opacity-30" disabled={reorder.isPending} onClick={() => move(i, -1)} aria-label={t('waitingRoom.admin.moveUp')}>
                                <ArrowUp className="size-3.5" />
                              </button>
                              <button type="button" className="grid size-7 place-items-center rounded text-muted hover:bg-surface hover:text-ink disabled:opacity-30" disabled={reorder.isPending} onClick={() => move(i, 1)} aria-label={t('waitingRoom.admin.moveDown')}>
                                <ArrowDown className="size-3.5" />
                              </button>
                            </div>
                          </td>
                        )}
                        <td className="px-3 py-2.5">
                          <span className="badge mb-1 inline-flex items-center gap-1 bg-brand-100 text-brand-800">
                            <Icon className="size-3" aria-hidden />
                            {t(`waitingRoom.kinds.${i.kind}`)}
                            {i.minutes ? ` · ${t('waitingRoom.minutes', { count: i.minutes })}` : ''}
                          </span>
                          <p className="font-semibold text-ink">{tr(i.title)}</p>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-ink/80">{t(`waitingRoom.topics.${i.topic}`)}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex max-w-[16rem] flex-wrap gap-1">
                            {!i.visaTypes?.length && !i.stages?.length && <span className="text-xs text-muted">{t('waitingRoom.admin.everyone')}</span>}
                            {i.visaTypes?.map((v) => (
                              <span key={v} className="badge bg-surface text-ink/80">
                                {t(`waitingRoom.visa.${v}`)}
                              </span>
                            ))}
                            {i.stages?.map((s) => (
                              <span key={s} className="badge bg-info-bg text-info-fg">
                                {statusLabel(s)}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted tabular-nums">{t('waitingRoom.admin.completedBy', { count: i.completedCount })}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <Switch checked={i.published} disabled={!canEdit || publish.isPending} onChange={(v) => publish.mutate({ id: i.id, published: v })} label={t('waitingRoom.admin.published')} />
                            <span className="text-xs text-muted">{i.published ? t('waitingRoom.admin.published') : t('waitingRoom.admin.draft')}</span>
                          </div>
                        </td>
                        {canEdit && (
                          <td className="px-3 py-2.5">
                            <div className="flex justify-end gap-1">
                              <button type="button" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink" onClick={() => setEditing(toDraft(i))} aria-label={t('waitingRoom.admin.editTitle')}>
                                <Pencil className="size-4" />
                              </button>
                              <button type="button" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface hover:text-danger" onClick={() => setDeleting(i)} aria-label={t('waitingRoom.admin.delete')}>
                                <Trash2 className="size-4" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {editing && <EditDialog draft={editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        title={t('waitingRoom.admin.deleteTitle')}
        confirmLabel={t('waitingRoom.admin.delete')}
        loading={remove.isPending}
      />
    </div>
  );
}
