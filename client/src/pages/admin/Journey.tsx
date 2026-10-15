import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, BookOpen, CalendarRange, Compass, Eraser, Languages, ListChecks, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useL10n } from '@/lib/l10n';
import { hasMinRole, type L10n } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { pagesJourney } from '@/i18n/pagesJourney';
import { ICON_NAMES, Icon, hasIcon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui/Spinner';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { Drawer } from '@/components/admin/Drawer';
import { L10nInput, emptyL10n, fillFromAz } from '@/components/admin/L10nInput';
import { toastError } from '@/components/admin/labels';
import { Chip, EmptyState, ErrorBlock, LoadingBlock, PageHead, Switch } from '@/components/admin/ui';
import { FORECAST_STEPS, GERMAN_LEVELS, type AdminForecastRow, type ForecastOverride, type ForecastRanges, type ForecastStepKey, type GermanQuestionAdmin, type LanguageCourse, type OnboardingItem } from '@/components/journey/types';

registerCopy(pagesJourney);

type Tab = 'forecast' | 'onboarding' | 'questions' | 'courses';
const TABS: { key: Tab; icon: typeof Compass }[] = [
  { key: 'forecast', icon: CalendarRange },
  { key: 'onboarding', icon: ListChecks },
  { key: 'questions', icon: Languages },
  { key: 'courses', icon: BookOpen },
];

const useAdminList = <T,>(key: string, url: string) =>
  useQuery({ queryKey: ['admin-journey', key], queryFn: async () => (await api.get<{ items: T[] }>(url)).data.items });

const RowActions = ({ onEdit, onDelete, onUp, onDown, canWrite }: { onEdit: () => void; onDelete: () => void; onUp?: () => void; onDown?: () => void; canWrite: boolean }) => {
  const { t } = useTranslation();
  if (!canWrite) return null;
  const btn = 'grid size-9 place-items-center rounded-lg text-muted transition hover:bg-brand-50 hover:text-brand-700 disabled:opacity-30 disabled:hover:bg-transparent';
  return (
    <div className="flex shrink-0 items-center">
      {onUp && (
        <button type="button" className={btn} onClick={onUp} title={t('journey.admin.common.up')} aria-label={t('journey.admin.common.up')}>
          <ArrowUp className="size-3.5" />
        </button>
      )}
      {onDown && (
        <button type="button" className={btn} onClick={onDown} title={t('journey.admin.common.down')} aria-label={t('journey.admin.common.down')}>
          <ArrowDown className="size-3.5" />
        </button>
      )}
      <button type="button" className={btn} onClick={onEdit} title={t('journey.admin.common.edit')} aria-label={t('journey.admin.common.edit')}>
        <Pencil className="size-3.5" />
      </button>
      <button type="button" className={clsx(btn, 'hover:bg-red-50 hover:text-red-700')} onClick={onDelete} title={t('journey.admin.common.delete')} aria-label={t('journey.admin.common.delete')}>
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
};

const DrawerFooter = ({ onCancel, saving, disabled }: { onCancel: () => void; saving: boolean; disabled?: boolean }) => {
  const { t } = useTranslation();
  return (
    <div className="flex justify-end gap-2">
      <button type="button" className="btn-white btn-sm border border-line" onClick={onCancel}>
        {t('journey.admin.common.cancel')}
      </button>
      <button type="submit" form="journey-form" className="btn-primary btn-sm" disabled={saving || disabled}>
        {saving && <Spinner className="size-3.5" />} {t('journey.admin.common.save')}
      </button>
    </div>
  );
};

/** Generic create/update/delete wiring for one admin resource. */
const useCrud = (key: string, url: string) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-journey', key] });
  const save = useMutation({
    mutationFn: async ({ id, body }: { id: string | null; body: Record<string, unknown> }) => (id ? api.put(`${url}/${id}`, body) : api.post(url, body)),
    onSuccess: (_r, v) => {
      void invalidate();
      toast.success(v.id ? t('journey.admin.common.updated') : t('journey.admin.common.created'));
    },
    onError: (err) => toastError(err),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`${url}/${id}`),
    onSuccess: () => {
      void invalidate();
      toast.success(t('journey.admin.common.deleted'));
    },
    onError: (err) => toastError(err),
  });
  const patch = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) => api.put(`${url}/${id}`, body),
    onSuccess: () => void invalidate(),
    onError: (err) => toastError(err),
  });
  return { save, remove, patch, invalidate };
};

const PublishedSwitch = ({ item, patch, canWrite }: { item: { id: string; published: boolean }; patch: ReturnType<typeof useCrud>['patch']; canWrite: boolean }) => {
  const { t } = useTranslation();
  return <Switch checked={item.published} disabled={!canWrite} label={item.published ? t('journey.admin.common.published') : t('journey.admin.common.draft')} onChange={(v) => patch.mutate({ id: item.id, body: { published: v } })} />;
};

// ─── Forecast overrides ────────────────────────────────────────────────

type Draft = Record<ForecastStepKey, { min: string; max: string }>;
const toDraft = (o: ForecastOverride | null): Draft =>
  Object.fromEntries(FORECAST_STEPS.map((k) => [k, { min: o?.[k]?.[0]?.toString() ?? '', max: o?.[k]?.[1]?.toString() ?? '' }])) as Draft;

const ForecastRow = ({ row, canWrite }: { row: AdminForecastRow; canWrite: boolean }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft>(() => toDraft(row.override));
  useEffect(() => setDraft(toDraft(row.override)), [row.override]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(row.override));
  const invalid = FORECAST_STEPS.some((k) => {
    const { min, max } = draft[k];
    if (!min && !max) return false;
    return !min || !max || Number(max) < Number(min) || Number(min) < 0;
  });
  const save = useMutation({
    mutationFn: async () => {
      const body: Record<string, [number, number] | null> = {};
      for (const k of FORECAST_STEPS) body[k] = draft[k].min && draft[k].max ? [Number(draft[k].min), Number(draft[k].max)] : null;
      return api.put(`/admin/journey/forecast/${row.id}`, body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-journey', 'forecast'] });
      void qc.invalidateQueries({ queryKey: ['journey-forecast'] });
      toast.success(t('journey.admin.forecast.saved'));
    },
    onError: (err) => toastError(err),
  });

  return (
    <tr className="align-top">
      <td className="px-4 py-3">
        <p className="font-semibold text-navy-900">{tr(row.title)}</p>
        <p className="text-xs text-muted">{row.visaLabel}{!row.published && ` · ${t('journey.admin.common.draft')}`}</p>
      </td>
      {FORECAST_STEPS.map((k) => {
        const eff = row.effective[k];
        return (
          <td key={k} className="px-2 py-3">
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                max={730}
                className="input h-9 w-16 px-2 text-center text-sm tabular-nums"
                aria-label={`${tr(row.title)} · ${t(`journey.forecast.steps.${k}`)} · ${t('journey.admin.forecast.min')}`}
                value={draft[k].min}
                disabled={!canWrite}
                placeholder={String(eff.minDays)}
                onChange={(e) => setDraft((d) => ({ ...d, [k]: { ...d[k], min: e.target.value } }))}
              />
              <span className="text-muted">–</span>
              <input
                type="number"
                min={0}
                max={730}
                className="input h-9 w-16 px-2 text-center text-sm tabular-nums"
                aria-label={`${tr(row.title)} · ${t(`journey.forecast.steps.${k}`)} · ${t('journey.admin.forecast.max')}`}
                value={draft[k].max}
                disabled={!canWrite}
                placeholder={String(eff.maxDays)}
                onChange={(e) => setDraft((d) => ({ ...d, [k]: { ...d[k], max: e.target.value } }))}
              />
            </div>
            <p className={clsx('mt-1 text-[11px]', eff.basedOn === 'override' ? 'text-brand-700' : 'text-muted')}>
              {t(`journey.admin.forecast.source.${eff.basedOn}`, { count: eff.sample })}
            </p>
          </td>
        );
      })}
      <td className="px-3 py-3 text-right">
        {canWrite && (
          <div className="inline-flex items-center gap-1">
            <button type="button" className="btn-primary btn-sm" disabled={!dirty || invalid || save.isPending} onClick={() => save.mutate()} title={invalid ? t('journey.admin.forecast.invalid') : undefined}>
              {save.isPending && <Spinner className="size-3.5" />} {t('journey.admin.common.save')}
            </button>
            <button type="button" className="grid size-9 place-items-center rounded-lg text-muted transition hover:bg-brand-50 hover:text-brand-700" title={t('journey.admin.forecast.clear')} aria-label={t('journey.admin.forecast.clear')} onClick={() => setDraft(toDraft(null))}>
              <Eraser className="size-3.5" />
            </button>
          </div>
        )}
      </td>
    </tr>
  );
};

const ForecastTab = ({ canWrite }: { canWrite: boolean }) => {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['admin-journey', 'forecast'],
    queryFn: async () => (await api.get<{ items: AdminForecastRow[]; fallback: ForecastRanges }>('/admin/journey/forecast')).data,
  });
  if (q.isLoading) return <LoadingBlock />;
  if (q.error || !q.data) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  return (
    <div className="rounded-xl border border-line bg-white">
      <p className="border-b border-line px-5 py-4 text-sm text-muted">{t('journey.admin.forecast.intro')}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[60rem] text-sm">
          <thead className="bg-surface text-left text-[11px] font-semibold tracking-wide text-muted uppercase">
            <tr>
              <th className="px-4 py-2.5">{t('journey.admin.forecast.visa')}</th>
              {FORECAST_STEPS.map((k) => (
                <th key={k} className="px-2 py-2.5">
                  {t(`journey.forecast.steps.${k}`)} <span className="font-normal normal-case">({t('journey.admin.forecast.days')})</span>
                </th>
              ))}
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {q.data.items.map((row) => (
              <ForecastRow key={row.id} row={row} canWrite={canWrite} />
            ))}
            <tr className="bg-surface/60 text-xs text-muted">
              <td className="px-4 py-3 font-semibold">{t('journey.admin.forecast.fallback')}</td>
              {FORECAST_STEPS.map((k) => (
                <td key={k} className="px-2 py-3">
                  {t('journey.admin.forecast.effective', { min: q.data.fallback[k].minDays, max: q.data.fallback[k].maxDays })}
                  <span className="block">{t(`journey.admin.forecast.source.${q.data.fallback[k].basedOn}`, { count: q.data.fallback[k].sample })}</span>
                </td>
              ))}
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── Onboarding items ──────────────────────────────────────────────────

type ItemForm = { slug: string; icon: string; title: L10n; body: L10n; link: string; dueDays: string; published: boolean };
const emptyItem = (): ItemForm => ({ slug: '', icon: 'CheckCircle2', title: emptyL10n(), body: emptyL10n(), link: '', dueDays: '', published: true });
const itemToForm = (i: OnboardingItem): ItemForm => ({ slug: i.slug, icon: i.icon, title: i.title, body: i.body, link: i.link ?? '', dueDays: i.dueDays?.toString() ?? '', published: i.published });

type ItemRow = OnboardingItem & { _count?: { progress: number } };

const OnboardingTab = ({ canWrite }: { canWrite: boolean }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const qc = useQueryClient();
  const url = '/admin/journey/onboarding-items';
  const list = useAdminList<ItemRow>('items', url);
  const crud = useCrud('items', url);
  const [editing, setEditing] = useState<{ id: string | null; form: ItemForm } | null>(null);
  const [deleting, setDeleting] = useState<ItemRow | null>(null);
  const reorder = useMutation({
    mutationFn: async (ids: string[]) => api.put(`${url}/reorder`, { ids }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-journey', 'items'] }),
    onError: (err) => toastError(err),
  });
  const items = list.data ?? [];
  const move = (i: number, dir: -1 | 1) => {
    const ids = items.map((x) => x.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    reorder.mutate(ids);
  };
  const submit = () => {
    if (!editing) return;
    const f = editing.form;
    if (!f.slug.trim() || !f.title.az.trim() || !f.body.az.trim()) {
      toast.error(t('journey.admin.common.required'));
      return;
    }
    crud.save.mutate(
      { id: editing.id, body: { slug: f.slug.trim(), icon: f.icon, title: fillFromAz(f.title), body: fillFromAz(f.body), link: f.link.trim() || null, dueDays: f.dueDays === '' ? null : Number(f.dueDays), published: f.published, sortOrder: editing.id ? undefined : items.length } },
      { onSuccess: () => setEditing(null) },
    );
  };

  if (list.isLoading) return <LoadingBlock />;
  if (list.error) return <ErrorBlock error={list.error} onRetry={() => list.refetch()} />;

  return (
    <>
      <div className="mb-4 flex justify-end">
        {canWrite && (
          <button type="button" className="btn-primary btn-sm" onClick={() => setEditing({ id: null, form: emptyItem() })}>
            <Plus className="size-3.5" /> {t('journey.admin.items.new')}
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <div className="rounded-xl border border-line bg-white">
          <EmptyState icon={ListChecks} title={t('journey.admin.items.empty')} />
        </div>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-white">
          {items.map((it, i) => (
            <li key={it.id} className="flex items-center gap-3 px-4 py-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
                {hasIcon(it.icon) ? <Icon name={it.icon} className="size-4" /> : <Compass className="size-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-navy-900">{tr(it.title)}</p>
                <p className="truncate text-xs text-muted">
                  {it.slug}
                  {it.dueDays !== null && ` · ${t('journey.onboarding.within', { count: it.dueDays })}`}
                  {it._count && ` · ${t('journey.admin.items.doneBy', { count: it._count.progress })}`}
                </p>
              </div>
              <PublishedSwitch item={it} patch={crud.patch} canWrite={canWrite} />
              <RowActions canWrite={canWrite} onEdit={() => setEditing({ id: it.id, form: itemToForm(it) })} onDelete={() => setDeleting(it)} onUp={i > 0 ? () => move(i, -1) : undefined} onDown={i < items.length - 1 ? () => move(i, 1) : undefined} />
            </li>
          ))}
        </ul>
      )}

      <Drawer open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? t('journey.admin.items.edit') : t('journey.admin.items.new')} footer={<DrawerFooter onCancel={() => setEditing(null)} saving={crud.save.isPending} />}>
        {editing && (
          <form id="journey-form" className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="it-slug" className="label">{t('journey.admin.items.slug')}</label>
                <input id="it-slug" className="input" value={editing.form.slug} pattern="[a-z0-9-]+" required onChange={(e) => setEditing({ ...editing, form: { ...editing.form, slug: e.target.value } })} />
              </div>
              <div>
                <label htmlFor="it-icon" className="label">{t('journey.admin.items.icon')}</label>
                <select id="it-icon" className="input" value={editing.form.icon} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, icon: e.target.value } })}>
                  {!ICON_NAMES.includes(editing.form.icon) && <option value={editing.form.icon}>{editing.form.icon}</option>}
                  {ICON_NAMES.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            </div>
            <L10nInput label={t('journey.admin.items.title')} value={editing.form.title} onChange={(v) => setEditing({ ...editing, form: { ...editing.form, title: v } })} required />
            <L10nInput label={t('journey.admin.items.body')} value={editing.form.body} onChange={(v) => setEditing({ ...editing, form: { ...editing.form, body: v } })} multiline rows={8} required />
            <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
              <div>
                <label htmlFor="it-link" className="label">{t('journey.admin.items.link')}</label>
                <input id="it-link" className="input" type="url" value={editing.form.link} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, link: e.target.value } })} />
              </div>
              <div>
                <label htmlFor="it-due" className="label">{t('journey.admin.items.dueDays')}</label>
                <input id="it-due" className="input" type="number" min={0} max={3650} value={editing.form.dueDays} placeholder={t('journey.admin.items.dueNone')} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, dueDays: e.target.value } })} />
              </div>
            </div>
            <label className="flex items-center gap-3 text-sm">
              <Switch checked={editing.form.published} label={t('journey.admin.common.published')} onChange={(v) => setEditing({ ...editing, form: { ...editing.form, published: v } })} />
              {t('journey.admin.common.published')}
            </label>
          </form>
        )}
      </Drawer>
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => deleting && crud.remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })} title={t('journey.admin.common.confirmDelete')} message={deleting ? tr(deleting.title) : undefined} loading={crud.remove.isPending} />
    </>
  );
};

// ─── German questions ──────────────────────────────────────────────────

type QForm = { level: string; question: L10n; options: string; answer: number; published: boolean };
const emptyQ = (): QForm => ({ level: 'A1', question: emptyL10n(), options: '', answer: 0, published: true });
const qToForm = (q: GermanQuestionAdmin): QForm => ({ level: q.level, question: q.question, options: q.options.join('\n'), answer: q.answer, published: q.published });

const QuestionsTab = ({ canWrite }: { canWrite: boolean }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const url = '/admin/journey/german/questions';
  const list = useAdminList<GermanQuestionAdmin>('questions', url);
  const crud = useCrud('questions', url);
  const [level, setLevel] = useState<string>('all');
  const [editing, setEditing] = useState<{ id: string | null; form: QForm } | null>(null);
  const [deleting, setDeleting] = useState<GermanQuestionAdmin | null>(null);
  const items = useMemo(() => (list.data ?? []).filter((q) => level === 'all' || q.level === level), [list.data, level]);
  const options = editing ? editing.form.options.split('\n').map((s) => s.trim()).filter(Boolean) : [];

  const submit = () => {
    if (!editing) return;
    const f = editing.form;
    if (!f.question.az.trim() || options.length < 2 || f.answer >= options.length) {
      toast.error(t('journey.admin.common.required'));
      return;
    }
    crud.save.mutate({ id: editing.id, body: { level: f.level, question: fillFromAz(f.question), options, answer: f.answer, published: f.published } }, { onSuccess: () => setEditing(null) });
  };

  if (list.isLoading) return <LoadingBlock />;
  if (list.error) return <ErrorBlock error={list.error} onRetry={() => list.refetch()} />;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          <Chip active={level === 'all'} onClick={() => setLevel('all')} count={list.data?.length}>
            {t('journey.admin.questions.all')}
          </Chip>
          {GERMAN_LEVELS.map((l) => (
            <Chip key={l} active={level === l} onClick={() => setLevel(l)} count={list.data?.filter((q) => q.level === l).length}>
              {l}
            </Chip>
          ))}
        </div>
        {canWrite && (
          <button type="button" className="btn-primary btn-sm" onClick={() => setEditing({ id: null, form: { ...emptyQ(), level: level === 'all' ? 'A1' : level } })}>
            <Plus className="size-3.5" /> {t('journey.admin.questions.new')}
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <div className="rounded-xl border border-line bg-white">
          <EmptyState icon={Languages} title={t('journey.admin.questions.empty')} />
        </div>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-white">
          {items.map((q) => (
            <li key={q.id} className="flex items-start gap-3 px-4 py-3">
              <span className="badge mt-0.5 shrink-0 bg-navy-900 text-white">{q.level}</span>
              <div className="min-w-0 flex-1">
                <p className="font-medium break-words text-navy-900">{tr(q.question)}</p>
                <p className="mt-1 flex flex-wrap gap-1.5 text-xs">
                  {q.options.map((o, i) => (
                    <span key={i} className={clsx('rounded-md px-1.5 py-0.5', i === q.answer ? 'bg-emerald-100 font-semibold text-emerald-800' : 'bg-surface text-muted')}>
                      {String.fromCharCode(65 + i)}. {o}
                    </span>
                  ))}
                </p>
              </div>
              <PublishedSwitch item={q} patch={crud.patch} canWrite={canWrite} />
              <RowActions canWrite={canWrite} onEdit={() => setEditing({ id: q.id, form: qToForm(q) })} onDelete={() => setDeleting(q)} />
            </li>
          ))}
        </ul>
      )}

      <Drawer open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? t('journey.admin.questions.edit') : t('journey.admin.questions.new')} footer={<DrawerFooter onCancel={() => setEditing(null)} saving={crud.save.isPending} />}>
        {editing && (
          <form id="journey-form" className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <div>
              <label htmlFor="q-level" className="label">{t('journey.admin.questions.level')}</label>
              <select id="q-level" className="input" value={editing.form.level} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, level: e.target.value } })}>
                {GERMAN_LEVELS.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
            <L10nInput label={t('journey.admin.questions.prompt')} value={editing.form.question} onChange={(v) => setEditing({ ...editing, form: { ...editing.form, question: v } })} required />
            <div>
              <label htmlFor="q-options" className="label">{t('journey.admin.questions.options')}</label>
              <textarea id="q-options" className="input font-mono text-[13px]" rows={5} value={editing.form.options} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, options: e.target.value } })} />
              <p className="mt-1 text-xs text-muted">{t('journey.admin.questions.optionsHint')}</p>
            </div>
            <div>
              <label htmlFor="q-answer" className="label">{t('journey.admin.questions.answer')}</label>
              <select id="q-answer" className="input" value={editing.form.answer} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, answer: Number(e.target.value) } })}>
                {options.map((o, i) => (
                  <option key={i} value={i}>
                    {String.fromCharCode(65 + i)}. {o}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-3 text-sm">
              <Switch checked={editing.form.published} label={t('journey.admin.common.published')} onChange={(v) => setEditing({ ...editing, form: { ...editing.form, published: v } })} />
              {t('journey.admin.common.published')}
            </label>
          </form>
        )}
      </Drawer>
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => deleting && crud.remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })} title={t('journey.admin.common.confirmDelete')} message={deleting ? tr(deleting.question) : undefined} loading={crud.remove.isPending} />
    </>
  );
};

// ─── Courses ───────────────────────────────────────────────────────────

type CForm = { name: string; provider: string; city: string; url: string; levels: string; format: string; description: L10n; published: boolean };
const emptyC = (): CForm => ({ name: '', provider: '', city: '', url: '', levels: '', format: '', description: emptyL10n(), published: true });
const cToForm = (c: LanguageCourse): CForm => ({ name: c.name, provider: c.provider ?? '', city: c.city ?? '', url: c.url ?? '', levels: c.levels ?? '', format: c.format ?? '', description: c.description ?? emptyL10n(), published: c.published });

const CoursesTab = ({ canWrite }: { canWrite: boolean }) => {
  const { t } = useTranslation();
  const url = '/admin/journey/german/courses';
  const list = useAdminList<LanguageCourse>('courses', url);
  const crud = useCrud('courses', url);
  const [editing, setEditing] = useState<{ id: string | null; form: CForm } | null>(null);
  const [deleting, setDeleting] = useState<LanguageCourse | null>(null);
  const items = list.data ?? [];

  const submit = () => {
    if (!editing) return;
    const f = editing.form;
    if (!f.name.trim()) {
      toast.error(t('journey.admin.common.required'));
      return;
    }
    const hasDesc = f.description.az.trim().length > 0;
    crud.save.mutate(
      { id: editing.id, body: { name: f.name.trim(), provider: f.provider.trim() || null, city: f.city.trim() || null, url: f.url.trim() || null, levels: f.levels.trim() || null, format: f.format || null, description: hasDesc ? fillFromAz(f.description) : null, published: f.published, sortOrder: editing.id ? undefined : items.length } },
      { onSuccess: () => setEditing(null) },
    );
  };
  const field = (key: keyof CForm, label: string, extra: Record<string, unknown> = {}): ReactNode =>
    editing && (
      <div>
        <label htmlFor={`c-${key}`} className="label">{label}</label>
        <input id={`c-${key}`} className="input" value={editing.form[key] as string} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, [key]: e.target.value } })} {...extra} />
      </div>
    );

  if (list.isLoading) return <LoadingBlock />;
  if (list.error) return <ErrorBlock error={list.error} onRetry={() => list.refetch()} />;

  return (
    <>
      <div className="mb-4 flex justify-end">
        {canWrite && (
          <button type="button" className="btn-primary btn-sm" onClick={() => setEditing({ id: null, form: emptyC() })}>
            <Plus className="size-3.5" /> {t('journey.admin.courses.new')}
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <div className="rounded-xl border border-line bg-white">
          <EmptyState icon={BookOpen} title={t('journey.admin.courses.empty')} />
        </div>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-white">
          {items.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-navy-900">
                  {c.name}
                  {c.levels && <span className="badge ml-2 bg-navy-900 text-white">{c.levels}</span>}
                </p>
                <p className="truncate text-xs text-muted">
                  {[c.provider, c.city, c.format && t(`journey.german.courses.format.${c.format}`), c.url].filter(Boolean).join(' · ')}
                </p>
              </div>
              <PublishedSwitch item={c} patch={crud.patch} canWrite={canWrite} />
              <RowActions canWrite={canWrite} onEdit={() => setEditing({ id: c.id, form: cToForm(c) })} onDelete={() => setDeleting(c)} />
            </li>
          ))}
        </ul>
      )}

      <Drawer open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? t('journey.admin.courses.edit') : t('journey.admin.courses.new')} footer={<DrawerFooter onCancel={() => setEditing(null)} saving={crud.save.isPending} />}>
        {editing && (
          <form id="journey-form" className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
            {field('name', t('journey.admin.courses.name'), { required: true, maxLength: 160 })}
            <div className="grid gap-3 sm:grid-cols-2">
              {field('provider', t('journey.admin.courses.provider'), { maxLength: 160 })}
              {field('city', t('journey.admin.courses.city'), { maxLength: 80 })}
              {field('url', t('journey.admin.courses.url'), { type: 'url' })}
              {field('levels', t('journey.admin.courses.levels'), { maxLength: 40 })}
            </div>
            <div>
              <label htmlFor="c-format" className="label">{t('journey.admin.courses.format')}</label>
              <select id="c-format" className="input" value={editing.form.format} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, format: e.target.value } })}>
                <option value="">—</option>
                {(['online', 'offline', 'hybrid'] as const).map((f) => (
                  <option key={f} value={f}>{t(`journey.german.courses.format.${f}`)}</option>
                ))}
              </select>
            </div>
            <L10nInput label={t('journey.admin.courses.description')} value={editing.form.description} onChange={(v) => setEditing({ ...editing, form: { ...editing.form, description: v } })} multiline rows={3} />
            <label className="flex items-center gap-3 text-sm">
              <Switch checked={editing.form.published} label={t('journey.admin.common.published')} onChange={(v) => setEditing({ ...editing, form: { ...editing.form, published: v } })} />
              {t('journey.admin.common.published')}
            </label>
          </form>
        )}
      </Drawer>
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => deleting && crud.remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })} title={t('journey.admin.common.confirmDelete')} message={deleting?.name} loading={crud.remove.isPending} />
    </>
  );
};

// ─── Page ──────────────────────────────────────────────────────────────

export default function Journey() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canWrite = hasMinRole(user?.role, 'ADMIN');
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some((x) => x.key === params.get('tab')) ? params.get('tab') : 'forecast') as Tab;

  return (
    <div>
      <PageHead title={t('journey.admin.title')} subtitle={canWrite ? t('journey.admin.subtitle') : t('journey.admin.readOnly')} />
      <div role="tablist" className="mb-5 flex gap-1 overflow-x-auto rounded-xl border border-line bg-white p-1 [scrollbar-width:none]">
        {TABS.map(({ key, icon: TabIcon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setParams({ tab: key }, { replace: true })}
            className={clsx('inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold whitespace-nowrap transition', tab === key ? 'bg-navy-900 text-white' : 'text-muted hover:bg-surface hover:text-navy-900')}
          >
            <TabIcon className="size-4" aria-hidden />
            {t(`journey.admin.tabs.${key}`)}
          </button>
        ))}
      </div>
      {tab === 'forecast' && <ForecastTab canWrite={canWrite} />}
      {tab === 'onboarding' && <OnboardingTab canWrite={canWrite} />}
      {tab === 'questions' && <QuestionsTab canWrite={canWrite} />}
      {tab === 'courses' && <CoursesTab canWrite={canWrite} />}
    </div>
  );
}
