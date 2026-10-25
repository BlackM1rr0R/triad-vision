import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, MessagesSquare, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useL10n } from '@/lib/l10n';
import { usePageTitle } from '@/lib/usePageTitle';
import { hasMinRole, type L10n } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { pagesPrep } from '@/i18n/pagesPrep';
import { Modal } from '@/components/admin/Modal';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { L10nInput, emptyL10n } from '@/components/admin/L10nInput';
import { EmptyState, ErrorBlock, LoadingBlock, PageHead, Switch } from '@/components/admin/ui';
import { toastError } from '@/components/admin/labels';
import { btnSecondary } from '@/components/prep/ui';
import { Spinner } from '@/components/ui/Spinner';
import { categoryLabel, PREP_KINDS, VISA_TYPES, type AdminPrepQuestion, type PrepKind, type VisaType } from '@/components/prep/types';

registerCopy(pagesPrep);

const KEY = ['admin-interview-prep'];
type ListResponse = { items: AdminPrepQuestion[]; categories: string[] };

type Draft = {
  id?: string;
  kind: PrepKind;
  category: string;
  question: L10n;
  answerDe: string;
  tips: L10n;
  visaTypes: VisaType[];
  published: boolean;
};

const blankDraft = (kind: PrepKind): Draft => ({ kind, category: '', question: emptyL10n(), answerDe: '', tips: emptyL10n(), visaTypes: [], published: true });
const toDraft = (q: AdminPrepQuestion): Draft => ({
  id: q.id,
  kind: q.kind,
  category: q.category,
  question: { ...emptyL10n(), ...q.question },
  answerDe: q.answerDe,
  tips: { ...emptyL10n(), ...(q.tips ?? {}) },
  visaTypes: q.visaTypes ?? [],
  published: q.published,
});

const selectCls = 'input w-auto min-w-0 py-2 text-sm';

// ─── Edit dialog ──────────────────────────────────────────────────────────

const EditDialog = ({ draft, categories, onClose }: { draft: Draft; categories: string[]; onClose: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [d, setD] = useState<Draft>(draft);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

  const save = useMutation({
    mutationFn: async () => {
      const body = { kind: d.kind, category: d.category.trim(), question: d.question, answerDe: d.answerDe, tips: d.tips, visaTypes: d.visaTypes, published: d.published };
      return d.id ? api.put(`/admin/interview-prep/${d.id}`, body) : api.post('/admin/interview-prep', body);
    },
    onSuccess: () => {
      toast.success(t('prep.admin.saved'));
      void qc.invalidateQueries({ queryKey: KEY });
      onClose();
    },
    onError: (e) => toastError(e),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  const formId = 'interview-prep-form';

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={d.id ? t('prep.admin.editTitle') : t('prep.admin.newTitle')}
      footer={
        <>
          <button type="button" className={btnSecondary} onClick={onClose}>
            {t('prep.admin.cancel')}
          </button>
          <button type="submit" form={formId} className="btn-primary btn-sm" disabled={save.isPending}>
            {save.isPending && <Spinner className="size-3.5" />} {t('prep.admin.save')}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label">{t('prep.admin.kind')}</span>
            <select className="input" value={d.kind} onChange={(e) => set('kind', e.target.value as PrepKind)}>
              {PREP_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`prep.page.tabs.${k}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">{t('prep.admin.category')} *</span>
            <input
              className="input"
              list="interview-prep-categories"
              required
              maxLength={40}
              pattern="[a-z0-9_\-]+"
              value={d.category}
              onChange={(e) => set('category', e.target.value.toLowerCase())}
            />
            <datalist id="interview-prep-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <span className="mt-1 block text-xs text-muted">{t('prep.admin.categoryHint')}</span>
          </label>
        </div>

        <L10nInput label={t('prep.admin.question')} value={d.question} onChange={(v) => set('question', v)} required />

        <label className="block">
          <span className="label">{t('prep.admin.answerDe')} *</span>
          <textarea className="input" rows={5} required maxLength={5000} lang="de" value={d.answerDe} onChange={(e) => set('answerDe', e.target.value)} />
          <span className="mt-1 block text-xs text-muted">{t('prep.admin.answerHint')}</span>
        </label>

        <L10nInput label={t('prep.admin.tips')} value={d.tips} onChange={(v) => set('tips', v)} multiline rows={3} />

        <fieldset>
          <legend className="label">{t('prep.admin.visaTypes')}</legend>
          <div className="flex flex-wrap gap-2">
            {VISA_TYPES.map((v) => {
              const on = d.visaTypes.includes(v);
              return (
                <label key={v} className={clsx('inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-colors', on ? 'border-primary bg-primary/[0.06] text-ink' : 'border-line bg-card text-ink/80')}>
                  <input type="checkbox" className="size-3.5 accent-primary" checked={on} onChange={(e) => set('visaTypes', e.target.checked ? [...d.visaTypes, v] : d.visaTypes.filter((x) => x !== v))} />
                  {t(`prep.visa.${v}`)}
                </label>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-muted">{t('prep.admin.visaHint')}</p>
        </fieldset>

        <div className="flex items-center gap-3">
          <Switch checked={d.published} onChange={(v) => set('published', v)} label={t('prep.admin.published')} />
          <span className="text-sm text-ink">{d.published ? t('prep.admin.published') : t('prep.admin.draft')}</span>
        </div>
      </form>
    </Modal>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────

export default function AdminInterviewPrep() {
  const { t, i18n } = useTranslation();
  const { tr } = useL10n();
  const { user } = useAuth();
  usePageTitle(t('prep.admin.title'));
  const qc = useQueryClient();
  const canEdit = hasMinRole(user?.role, 'ADMIN');
  const [kind, setKind] = useState<PrepKind | ''>('');
  const [category, setCategory] = useState('');
  const [visa, setVisa] = useState<VisaType | ''>('');
  const [status, setStatus] = useState<'' | 'true' | 'false'>('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<AdminPrepQuestion | null>(null);
  const cat = (c: string) => categoryLabel(t, (k) => i18n.exists(k), c);

  const list = useQuery({ queryKey: KEY, queryFn: async () => (await api.get<ListResponse>('/admin/interview-prep')).data });
  const items = useMemo(() => list.data?.items ?? [], [list.data]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items.filter(
      (q) =>
        (!kind || q.kind === kind) &&
        (!category || q.category === category) &&
        (!visa || !q.visaTypes?.length || q.visaTypes.includes(visa)) &&
        (!status || String(q.published) === status) &&
        (!needle || JSON.stringify(q.question).toLowerCase().includes(needle) || q.answerDe.toLowerCase().includes(needle)),
    );
  }, [items, kind, category, visa, status, search]);

  const refresh = () => void qc.invalidateQueries({ queryKey: KEY });

  const publish = useMutation({
    mutationFn: (v: { id: string; published: boolean }) => api.patch(`/admin/interview-prep/${v.id}/publish`, { published: v.published }),
    onSuccess: refresh,
    onError: (e) => toastError(e),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/interview-prep/${id}`),
    onSuccess: () => {
      toast.success(t('prep.admin.deleted'));
      setDeleting(null);
      refresh();
    },
    onError: (e) => toastError(e),
  });
  const reorder = useMutation({
    mutationFn: (ids: string[]) => api.post('/admin/interview-prep/reorder', { ids }),
    onSuccess: refresh,
    onError: (e) => toastError(e),
  });

  /** Moves a question one place within its kind (the order clients see). */
  const move = (q: AdminPrepQuestion, dir: -1 | 1) => {
    const same = items.filter((x) => x.kind === q.kind);
    const i = same.findIndex((x) => x.id === q.id);
    const j = i + dir;
    if (j < 0 || j >= same.length) return;
    const ids = same.map((x) => x.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    reorder.mutate(ids);
  };

  return (
    <div>
      <PageHead
        title={t('prep.admin.title')}
        subtitle={canEdit ? t('prep.admin.subtitle') : `${t('prep.admin.subtitle')} ${t('prep.admin.readOnly')}`}
        actions={
          canEdit && (
            <button type="button" className="btn-primary btn-sm" onClick={() => setEditing(blankDraft(kind || 'EMBASSY'))}>
              <Plus className="size-3.5" aria-hidden /> {t('prep.admin.add')}
            </button>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input className="input py-2 pl-9" type="search" placeholder={t('prep.admin.search')} aria-label={t('prep.admin.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className={selectCls} value={kind} onChange={(e) => setKind(e.target.value as PrepKind | '')} aria-label={t('prep.admin.kind')}>
          <option value="">{t('prep.admin.allKinds')}</option>
          {PREP_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`prep.page.tabs.${k}`)}
            </option>
          ))}
        </select>
        <select className={selectCls} value={category} onChange={(e) => setCategory(e.target.value)} aria-label={t('prep.admin.category')}>
          <option value="">{t('prep.admin.allCategories')}</option>
          {(list.data?.categories ?? []).map((c) => (
            <option key={c} value={c}>
              {cat(c)}
            </option>
          ))}
        </select>
        <select className={selectCls} value={visa} onChange={(e) => setVisa(e.target.value as VisaType | '')} aria-label={t('prep.admin.visaTypes')}>
          <option value="">{t('prep.admin.allVisa')}</option>
          {VISA_TYPES.map((v) => (
            <option key={v} value={v}>
              {t(`prep.visa.${v}`)}
            </option>
          ))}
        </select>
        <select className={selectCls} value={status} onChange={(e) => setStatus(e.target.value as '' | 'true' | 'false')} aria-label={t('prep.admin.colStatus')}>
          <option value="">{t('prep.admin.allStatus')}</option>
          <option value="true">{t('prep.admin.published')}</option>
          <option value="false">{t('prep.admin.draft')}</option>
        </select>
      </div>

      {list.isLoading ? (
        <LoadingBlock />
      ) : list.isError ? (
        <ErrorBlock error={list.error} onRetry={() => void list.refetch()} />
      ) : (
        <section className="min-w-0 overflow-hidden rounded-xl border border-line bg-card">
          <p className="border-b border-line px-4 py-2.5 text-xs font-semibold text-muted">{t('prep.admin.count', { n: filtered.length })}</p>
          {filtered.length === 0 ? (
            <EmptyState icon={MessagesSquare} title={t('prep.admin.empty')} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-sunken text-left text-xs font-semibold text-muted">
                  <tr>
                    {canEdit && <th className="w-16 px-3 py-2" />}
                    <th className="px-3 py-2">{t('prep.admin.colQuestion')}</th>
                    <th className="px-3 py-2">{t('prep.admin.colCategory')}</th>
                    <th className="px-3 py-2">{t('prep.admin.colVisa')}</th>
                    <th className="px-3 py-2">{t('prep.admin.colStatus')}</th>
                    {canEdit && <th className="w-24 px-3 py-2" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {filtered.map((q) => (
                    <tr key={q.id} className={clsx('align-top transition-colors hover:bg-surface/60', !q.published && 'opacity-70')}>
                      {canEdit && (
                        <td className="px-3 py-2.5">
                          <div className="flex flex-col gap-0.5">
                            <button type="button" className="grid size-7 place-items-center rounded text-muted hover:bg-sunken hover:text-ink disabled:opacity-30" disabled={reorder.isPending} onClick={() => move(q, -1)} aria-label={t('prep.admin.moveUp')}>
                              <ArrowUp className="size-3.5" />
                            </button>
                            <button type="button" className="grid size-7 place-items-center rounded text-muted hover:bg-sunken hover:text-ink disabled:opacity-30" disabled={reorder.isPending} onClick={() => move(q, 1)} aria-label={t('prep.admin.moveDown')}>
                              <ArrowDown className="size-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                      <td className="px-3 py-2.5">
                        <span className={clsx('badge mb-1', q.kind === 'EMBASSY' ? 'bg-primary/10 text-ink' : 'bg-accent-bg text-accent-fg')}>{t(`prep.page.tabs.${q.kind}`)}</span>
                        <p className="font-semibold text-ink">{tr(q.question)}</p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted" lang="de">
                          {q.answerDe}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-ink/80">{cat(q.category)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex max-w-[14rem] flex-wrap gap-1">
                          {q.visaTypes?.length ? (
                            q.visaTypes.map((v) => (
                              <span key={v} className="badge bg-sunken text-ink/80">
                                {t(`prep.visa.${v}`)}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-muted">{t('prep.admin.everyVisa')}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <Switch checked={q.published} disabled={!canEdit || publish.isPending} onChange={(v) => publish.mutate({ id: q.id, published: v })} label={t('prep.admin.published')} />
                          <span className="text-xs text-muted">{q.published ? t('prep.admin.published') : t('prep.admin.draft')}</span>
                        </div>
                      </td>
                      {canEdit && (
                        <td className="px-3 py-2.5">
                          <div className="flex justify-end gap-1">
                            <button type="button" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-ink" onClick={() => setEditing(toDraft(q))} aria-label={t('prep.admin.editTitle')}>
                              <Pencil className="size-4" />
                            </button>
                            <button type="button" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-danger-fg" onClick={() => setDeleting(q)} aria-label={t('prep.admin.delete')}>
                              <Trash2 className="size-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {editing && <EditDialog draft={editing} categories={list.data?.categories ?? []} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        title={t('prep.admin.deleteTitle')}
        confirmLabel={t('prep.admin.delete')}
        loading={remove.isPending}
      />
    </div>
  );
}
