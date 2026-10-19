import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, BookOpen, CalendarRange, Compass, Eraser, Eye, EyeOff, Languages, ListChecks, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useL10n } from '@/lib/l10n';
import { hasMinRole, type L10n } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { pagesJourney } from '@/i18n/pagesJourney';
import { ICON_NAMES, Icon, hasIcon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui/Spinner';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { Drawer } from '@/components/admin/Drawer';
import { L10nInput, LANGS, emptyL10n, fillFromAz, type Lang } from '@/components/admin/L10nInput';
import { TranslateButton } from '@/components/admin/TranslateButton';
import { toastError } from '@/components/admin/labels';
import { Chip, EmptyState, ErrorBlock, LoadingBlock, PageHead, Switch } from '@/components/admin/ui';
import { FORECAST_STEPS, GERMAN_LEVELS, type AdminForecastRow, type ForecastOverride, type ForecastRanges, type ForecastStepKey, type ForecastUnit, type GermanQuestionAdmin, type LanguageCourse, type OnboardingItem } from '@/components/journey/types';

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

/** Values are stored in days; each cell is entered in days or weeks (week × 7), the unit is remembered per visa type. */
type Unit = ForecastUnit;
type Cell = { min: string; max: string; unit: Unit };
type Draft = Record<ForecastStepKey, Cell>;
const MAX_DAYS = 730;
const inUnit = (days: number, unit: Unit) => (unit === 'week' ? String(Math.round((days / 7) * 10) / 10) : String(days));
const toDays = (v: string, unit: Unit) => Math.round(Number(v) * (unit === 'week' ? 7 : 1));
const toDraft = (o: ForecastOverride | null, units: AdminForecastRow['units']): Draft =>
  Object.fromEntries(
    FORECAST_STEPS.map((k) => {
      const unit: Unit = units?.[k] ?? 'day';
      const r = o?.[k];
      return [k, { min: r ? inUnit(r[0], unit) : '', max: r ? inUnit(r[1], unit) : '', unit }];
    }),
  ) as Draft;
/** What the draft means in days (null = no override for the step) — compared to detect changes and sent on save. */
const draftDays = (d: Draft) =>
  Object.fromEntries(FORECAST_STEPS.map((k) => [k, d[k].min && d[k].max ? [toDays(d[k].min, d[k].unit), toDays(d[k].max, d[k].unit)] : null])) as Record<ForecastStepKey, [number, number] | null>;
const draftUnits = (d: Draft) => Object.fromEntries(FORECAST_STEPS.filter((k) => d[k].unit === 'week').map((k) => [k, 'week'])) as Partial<Record<ForecastStepKey, Unit>>;

const UnitToggle = ({ unit, onChange, disabled, label }: { unit: Unit; onChange: (u: Unit) => void; disabled?: boolean; label: string }) => {
  const { t } = useTranslation();
  return (
    <div role="radiogroup" aria-label={label} className="mt-1 inline-flex rounded-md border border-line bg-surface p-0.5 text-[10px] font-semibold">
      {(['day', 'week'] as const).map((u) => (
        <button
          key={u}
          type="button"
          role="radio"
          aria-checked={unit === u}
          disabled={disabled}
          onClick={() => onChange(u)}
          className={clsx('min-h-6 rounded px-1.5 transition', unit === u ? 'bg-card text-ink shadow-sm' : 'text-muted hover:text-ink')}
        >
          {t(`journey.admin.forecast.unit.${u}`)}
        </button>
      ))}
    </div>
  );
};

const iconBtn = 'grid size-9 place-items-center rounded-lg text-muted transition hover:bg-brand-50 hover:text-brand-700 disabled:opacity-40';

const ForecastRow = ({ row, canWrite, onDelete, onToggle, toggling }: { row: AdminForecastRow; canWrite: boolean; onDelete: () => void; onToggle: () => void; toggling: boolean }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft>(() => toDraft(row.override, row.units));
  useEffect(() => setDraft(toDraft(row.override, row.units)), [row.override, row.units]);
  const initial = toDraft(row.override, row.units);
  const dirty = JSON.stringify([draftDays(draft), draftUnits(draft)]) !== JSON.stringify([draftDays(initial), draftUnits(initial)]);
  const invalid = FORECAST_STEPS.some((k) => {
    const { min, max, unit } = draft[k];
    if (!min && !max) return false;
    if (!min || !max) return true;
    const a = toDays(min, unit);
    const b = toDays(max, unit);
    return !Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < a || b > MAX_DAYS;
  });
  const setUnit = (k: ForecastStepKey, unit: Unit) =>
    setDraft((d) => {
      const c = d[k];
      if (c.unit === unit) return d;
      const conv = (v: string) => (v === '' || !Number.isFinite(Number(v)) ? v : inUnit(toDays(v, c.unit), unit));
      return { ...d, [k]: { min: conv(c.min), max: conv(c.max), unit } };
    });
  const save = useMutation({
    mutationFn: async () => api.put(`/admin/journey/forecast/${row.id}`, { ...draftDays(draft), units: draftUnits(draft) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-journey', 'forecast'] });
      void qc.invalidateQueries({ queryKey: ['journey-forecast'] });
      toast.success(t('journey.admin.forecast.saved'));
    },
    onError: (err) => toastError(err),
  });

  return (
    <tr className={clsx('align-top', !row.published && 'bg-surface/50')}>
      <td className="px-4 py-3">
        <p className={clsx('font-semibold', row.published ? 'text-ink' : 'text-muted')}>{tr(row.title)}</p>
        <p className="text-xs text-muted">
          {row.visaLabel}
          {!row.published && (
            <span className="badge ml-1.5 bg-slate-100 text-[10px] text-slate-600">{t('journey.admin.visa.inactive')}</span>
          )}
        </p>
        {(row.usage.cases > 0 || row.usage.vacancies > 0) && <p className="mt-0.5 text-[11px] text-muted">{t('journey.admin.visa.usage', { cases: row.usage.cases, vacancies: row.usage.vacancies })}</p>}
      </td>
      {FORECAST_STEPS.map((k) => {
        const eff = row.effective[k];
        const cell = draft[k];
        const max = cell.unit === 'week' ? Math.floor(MAX_DAYS / 7) : MAX_DAYS;
        const step = cell.unit === 'week' ? 0.5 : 1;
        const name = `${tr(row.title)} · ${t(`journey.forecast.steps.${k}`)}`;
        return (
          <td key={k} className="px-2 py-3">
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                max={max}
                step={step}
                className="input h-9 w-16 px-2 text-center text-sm tabular-nums"
                aria-label={`${name} · ${t('journey.admin.forecast.min')} (${t(`journey.admin.forecast.unit.${cell.unit}`)})`}
                value={cell.min}
                disabled={!canWrite}
                placeholder={inUnit(eff.minDays, cell.unit)}
                onChange={(e) => setDraft((d) => ({ ...d, [k]: { ...d[k], min: e.target.value } }))}
              />
              <span className="text-muted">–</span>
              <input
                type="number"
                min={0}
                max={max}
                step={step}
                className="input h-9 w-16 px-2 text-center text-sm tabular-nums"
                aria-label={`${name} · ${t('journey.admin.forecast.max')} (${t(`journey.admin.forecast.unit.${cell.unit}`)})`}
                value={cell.max}
                disabled={!canWrite}
                placeholder={inUnit(eff.maxDays, cell.unit)}
                onChange={(e) => setDraft((d) => ({ ...d, [k]: { ...d[k], max: e.target.value } }))}
              />
            </div>
            <UnitToggle unit={cell.unit} disabled={!canWrite} onChange={(u) => setUnit(k, u)} label={`${name} · ${t('journey.admin.forecast.unitLabel')}`} />
            <p className={clsx('mt-1 text-[11px]', eff.basedOn === 'override' ? 'text-brand-700' : 'text-muted')}>
              {t(`journey.admin.forecast.source.${eff.basedOn}`, { count: eff.sample })}
            </p>
          </td>
        );
      })}
      <td className="px-3 py-3 text-right">
        {canWrite && (
          <div className="inline-flex flex-wrap items-center justify-end gap-1">
            <button type="button" className="btn-primary btn-sm" disabled={!dirty || invalid || save.isPending} onClick={() => save.mutate()} title={invalid ? t('journey.admin.forecast.invalid') : undefined}>
              {save.isPending && <Spinner className="size-3.5" />} {t('journey.admin.common.save')}
            </button>
            <button type="button" className={iconBtn} title={t('journey.admin.forecast.clear')} aria-label={t('journey.admin.forecast.clear')} onClick={() => setDraft(toDraft(null, draftUnits(draft)))}>
              <Eraser className="size-3.5" />
            </button>
            <button
              type="button"
              className={iconBtn}
              disabled={toggling}
              onClick={onToggle}
              title={row.published ? t('journey.admin.visa.deactivate') : t('journey.admin.visa.activate')}
              aria-label={`${row.published ? t('journey.admin.visa.deactivate') : t('journey.admin.visa.activate')} · ${tr(row.title)}`}
            >
              {toggling ? <Spinner className="size-3.5" /> : row.published ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </button>
            <button type="button" className={clsx(iconBtn, 'hover:bg-red-50 hover:text-red-700')} onClick={onDelete} title={t('journey.admin.visa.delete')} aria-label={`${t('journey.admin.visa.delete')} · ${tr(row.title)}`}>
              <Trash2 className="size-3.5" />
            </button>
          </div>
        )}
      </td>
    </tr>
  );
};

// ─── Visa types (VisaCategory, the same records as Content → Visa categories) ──

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/ə/g, 'e').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ß/g, 'ss').replace(/ä/g, 'a')
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

type VisaForm = { title: L10n; summary: L10n; visaLabel: string; slug: string; slugTouched: boolean; published: boolean; ai: { title: Lang[]; summary: Lang[] } };
const emptyVisa = (): VisaForm => ({ title: emptyL10n(), summary: emptyL10n(), visaLabel: '', slug: '', slugTouched: false, published: true, ai: { title: [], summary: [] } });
const hasText = (v: L10n) => LANGS.some((l) => v[l].trim());
const firstText = (v: L10n) => LANGS.map((l) => v[l].trim()).find(Boolean) ?? '';
/** Missing languages: the AI translation when available, else the text that was written. */
const completeL10n = async (fields: Record<'title' | 'summary', L10n>) => {
  const missing = (v: L10n) => hasText(v) && LANGS.some((l) => !v[l].trim());
  let values = fields;
  if (missing(fields.title) || missing(fields.summary)) {
    try {
      const res = await api.post<{ values: Record<'title' | 'summary', L10n> }>('/admin/translate', { fields, context: 'name and short summary of a German visa / job category (e.g. truck drivers §19c)' });
      values = res.data.values;
    } catch {
      /* fall back to copies below */
    }
  }
  const fill = (v: L10n): L10n => ({ az: v.az.trim() || firstText(v), de: v.de.trim() || firstText(v), en: v.en.trim() || firstText(v), ru: v.ru.trim() || firstText(v) });
  return { title: fill(values.title), summary: fill(values.summary) };
};

const NewVisaDrawer = ({ open, onClose, nextSortOrder }: { open: boolean; onClose: () => void; nextSortOrder: number }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [f, setF] = useState<VisaForm>(emptyVisa);
  useEffect(() => {
    if (open) setF(emptyVisa());
  }, [open]);
  const keepAi = (ai: Lang[], before: L10n, after: L10n) => ai.filter((l) => before[l] === after[l]);
  const create = useMutation({
    mutationFn: async () => {
      const { title, summary } = await completeL10n({ title: f.title, summary: f.summary });
      return api.post('/admin/content/visa-categories', {
        slug: f.slug || slugify(title.de || title.en || title.az),
        icon: 'BadgeCheck',
        image: '',
        visaLabel: f.visaLabel.trim(),
        title,
        summary,
        items: { az: [], de: [], en: [], ru: [] },
        body: summary,
        sortOrder: nextSortOrder,
        published: f.published,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-journey', 'forecast'] });
      void qc.invalidateQueries({ queryKey: ['admin-content', 'visa-categories'] });
      void qc.invalidateQueries({ queryKey: ['content'] });
      toast.success(t('journey.admin.visa.created'));
      onClose();
    },
    onError: (err) => (errorCode(err) === 'DUPLICATE' ? toast.error(t('journey.admin.visa.duplicate')) : toastError(err)),
  });
  const valid = hasText(f.title) && !!f.visaLabel.trim() && /^[a-z0-9-]+$/.test(f.slug || slugify(firstText(f.title)) || '-');
  const translate = (
    <TranslateButton
      fields={{ title: f.title, summary: f.summary }}
      ai={f.ai}
      context="name and short summary of a German visa / job category (e.g. truck drivers §19c)"
      onTranslated={(values, translated) =>
        setF((cur) => ({ ...cur, title: values.title, summary: values.summary, ai: { title: [...new Set([...cur.ai.title, ...translated.title])], summary: [...new Set([...cur.ai.summary, ...translated.summary])] } }))
      }
    />
  );
  return (
    <Drawer open={open} onClose={onClose} title={t('journey.admin.visa.new')} footer={<DrawerFooter onCancel={onClose} saving={create.isPending} disabled={!valid} />}>
      <form
        id="journey-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) {
            toast.error(t('journey.admin.common.required'));
            return;
          }
          create.mutate();
        }}
      >
        <L10nInput
          label={t('journey.admin.visa.name')}
          value={f.title}
          required
          anyLang
          aiLangs={f.ai.title}
          actions={translate}
          hint={t('admin.l10n.anyLangHint')}
          onChange={(title) =>
            setF((cur) => ({ ...cur, title, slug: cur.slugTouched ? cur.slug : slugify(title.de || title.en || title.az || title.ru), ai: { ...cur.ai, title: keepAi(cur.ai.title, cur.title, title) } }))
          }
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="visa-label" className="label">
              {t('journey.admin.visa.label')} <span className="text-danger">*</span>
            </label>
            <input id="visa-label" className="input" maxLength={40} required value={f.visaLabel} placeholder="§19c" onChange={(e) => setF({ ...f, visaLabel: e.target.value })} />
          </div>
          <div>
            <label htmlFor="visa-slug" className="label">
              {t('journey.admin.visa.slug')}
            </label>
            <input
              id="visa-slug"
              className="input font-mono text-sm"
              maxLength={60}
              value={f.slug}
              onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''), slugTouched: true })}
            />
          </div>
        </div>
        <L10nInput
          label={t('journey.admin.visa.summary')}
          value={f.summary}
          multiline
          rows={3}
          anyLang
          aiLangs={f.ai.summary}
          onChange={(summary) => setF((cur) => ({ ...cur, summary, ai: { ...cur.ai, summary: keepAi(cur.ai.summary, cur.summary, summary) } }))}
        />
        <label className="flex items-center gap-3 text-sm">
          <Switch checked={f.published} label={t('journey.admin.visa.active')} onChange={(v) => setF({ ...f, published: v })} />
          {f.published ? t('journey.admin.visa.active') : t('journey.admin.visa.inactive')}
        </label>
        <p className="rounded-lg bg-surface px-3 py-2 text-xs text-muted">
          {t('journey.admin.visa.contentHint')}{' '}
          <Link to="/admin/content/visa-categories" className="font-semibold text-brand-700 hover:underline">
            {t('journey.admin.visa.contentLink')}
          </Link>
        </p>
      </form>
    </Drawer>
  );
};

const ForecastTab = ({ canWrite }: { canWrite: boolean }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<{ row: AdminForecastRow; blocked: { cases: number; vacancies: number } | null } | null>(null);
  const q = useQuery({
    queryKey: ['admin-journey', 'forecast'],
    queryFn: async () => (await api.get<{ items: AdminForecastRow[]; fallback: ForecastRanges }>('/admin/journey/forecast')).data,
  });
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['admin-journey', 'forecast'] }),
      qc.invalidateQueries({ queryKey: ['admin-content', 'visa-categories'] }),
      qc.invalidateQueries({ queryKey: ['content'] }),
    ]);
  const toggle = useMutation({
    mutationFn: async (row: AdminForecastRow) => api.put(`/admin/content/visa-categories/${row.id}`, { published: !row.published }),
    onSuccess: (_r, row) => {
      void refresh();
      toast.success(row.published ? t('journey.admin.visa.deactivated') : t('journey.admin.visa.activated'));
      setDeleting(null);
    },
    onError: (err) => toastError(err),
  });
  const remove = useMutation({
    mutationFn: async (row: AdminForecastRow) => api.delete(`/admin/content/visa-categories/${row.id}`),
    onSuccess: () => {
      void refresh();
      toast.success(t('journey.admin.common.deleted'));
      setDeleting(null);
    },
    onError: (err, row) => {
      if (errorCode(err) === 'VISA_CATEGORY_IN_USE') {
        const data = (err as { response?: { data?: { cases?: number; vacancies?: number } } }).response?.data;
        setDeleting({ row, blocked: { cases: data?.cases ?? 0, vacancies: data?.vacancies ?? 0 } });
      } else toastError(err);
    },
  });

  if (q.isLoading) return <LoadingBlock />;
  if (q.error || !q.data) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const items = q.data.items;
  const blocked = deleting?.blocked ?? (deleting && (deleting.row.usage.cases || deleting.row.usage.vacancies) ? deleting.row.usage : null);
  return (
    <div className="rounded-xl border border-line bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <p className="max-w-3xl text-sm text-muted">{t('journey.admin.forecast.intro')}</p>
        {canWrite && (
          <button type="button" className="btn-primary btn-sm shrink-0" onClick={() => setCreating(true)}>
            <Plus className="size-3.5" aria-hidden /> {t('journey.admin.visa.new')}
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <EmptyState icon={CalendarRange} title={t('journey.admin.visa.empty')} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[64rem] text-sm">
            <thead className="bg-surface text-left text-[11px] font-semibold tracking-wide text-muted uppercase">
              <tr>
                <th className="px-4 py-2.5">{t('journey.admin.forecast.visa')}</th>
                {FORECAST_STEPS.map((k) => (
                  <th key={k} className="px-2 py-2.5">
                    {t(`journey.forecast.steps.${k}`)}
                  </th>
                ))}
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((row) => (
                <ForecastRow
                  key={row.id}
                  row={row}
                  canWrite={canWrite}
                  toggling={toggle.isPending && toggle.variables?.id === row.id}
                  onToggle={() => toggle.mutate(row)}
                  onDelete={() => setDeleting({ row, blocked: null })}
                />
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
      )}
      <NewVisaDrawer open={creating} onClose={() => setCreating(false)} nextSortOrder={items.reduce((m, r) => Math.max(m, r.sortOrder ?? 0), -1) + 1} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        loading={remove.isPending || toggle.isPending}
        title={blocked ? t('journey.admin.visa.inUseTitle') : t('journey.admin.visa.deleteTitle')}
        tone={blocked ? 'primary' : 'danger'}
        confirmLabel={blocked ? (deleting?.row.published ? t('journey.admin.visa.deactivate') : t('journey.admin.common.cancel')) : t('journey.admin.visa.delete')}
        message={
          deleting &&
          (blocked
            ? t(deleting.row.published ? 'journey.admin.visa.inUse' : 'journey.admin.visa.inUseInactive', { name: tr(deleting.row.title), cases: blocked.cases, vacancies: blocked.vacancies })
            : t('journey.admin.visa.deleteMsg', { name: tr(deleting.row.title) }))
        }
        onConfirm={() => {
          if (!deleting) return;
          if (!blocked) remove.mutate(deleting.row);
          else if (deleting.row.published) toggle.mutate(deleting.row);
          else setDeleting(null);
        }}
      />
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
