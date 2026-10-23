import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, ClipboardList, Copy, Eye, Plus, Save, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useL10n } from '@/lib/l10n';
import { hasMinRole, type L10n } from '@/lib/types';
import { L10nInput, emptyL10n } from '@/components/admin/L10nInput';
import { EmptyState, ErrorBlock, LoadingBlock, PageHead, Panel, Switch } from '@/components/admin/ui';
import { Spinner } from '@/components/ui/Spinner';
import { toastError } from '@/components/admin/labels';
import { FIELD_TYPES, SUB_FIELD_TYPES, TEMPLATES_KEY, type Answers, type FieldType, type FormField, type TargetOption, type Template } from '@/components/clientData/api';
import { FormRenderer } from '@/components/clientData/FormRenderer';

/**
 * Admin → "Ağıllı anketlər": click-only form builder for questionnaire templates. Field types, required,
 * help text, show-if (an earlier field equals a value), mapping target (profile / case / VIDEX), repeatable
 * groups with sub-fields; live preview as the client sees it. Staff may look, admins change.
 */

interface Draft {
  id: string | null;
  title: L10n;
  description: L10n;
  fields: FormField[];
  active: boolean;
  builtIn: boolean;
}

const newField = (type: FieldType, taken: string[]): FormField => {
  let n = taken.length + 1;
  while (taken.includes(`field${n}`)) n++;
  return { key: `field${n}`, type, label: emptyL10n(), required: false, ...(type === 'select' || type === 'multi' ? { options: [{ value: 'a', label: { az: 'A', de: 'A', en: 'A', ru: 'A' } }] } : {}), ...(type === 'group' ? { fields: [{ key: 'item', type: 'text', label: emptyL10n() }], maxRows: 10 } : {}) };
};

const fromTemplate = (t: Template): Draft => ({ id: t.id, title: t.title, description: t.description ?? emptyL10n(), fields: JSON.parse(JSON.stringify(t.fields)) as FormField[], active: t.active, builtIn: t.builtIn });

const FieldEditor = ({
  f,
  index,
  all,
  sub,
  targets,
  readOnly,
  onChange,
  onMove,
  onRemove,
}: {
  f: FormField;
  index: number;
  all: FormField[];
  sub?: boolean;
  targets: TargetOption[];
  readOnly: boolean;
  onChange: (f: FormField) => void;
  onMove: (d: -1 | 1) => void;
  onRemove: () => void;
}) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const earlier = all.slice(0, index).filter((x) => x.type === 'yesno' || x.type === 'select' || x.type === 'multi');
  const cond = f.showIf ? all.find((x) => x.key === f.showIf!.field) : undefined;
  const fitting = targets.filter((tg) => f.type !== 'file' && (tg.entity === 'videx' || tg.kind === 'longtext' || (f.type !== 'group' && f.type !== 'multi' && (tg.kind === 'text' || (tg.kind === 'date' && f.type === 'date') || (tg.kind === 'int' && f.type === 'number') || ((tg.kind === 'level' || tg.kind === 'education') && f.type === 'select') || (tg.kind === 'passport' && f.type === 'text')))));
  const set = (patch: Partial<FormField>) => onChange({ ...f, ...patch });
  return (
    <fieldset disabled={readOnly} className={clsx('space-y-3 rounded-xl border border-line p-3 sm:p-4', sub ? 'bg-surface' : 'bg-white')}>
      <div className="flex flex-wrap items-end gap-2">
        <label className="block min-w-[8rem] flex-1 text-xs font-semibold text-ink/80">
          {t('clientData.builder.key')}
          <input className="input mt-1 w-full font-mono" value={f.key} maxLength={40} onChange={(e) => set({ key: e.target.value.replace(/[^a-zA-Z0-9_]/g, '').replace(/^[^a-z]+/, '') })} />
        </label>
        <label className="block min-w-[8rem] flex-1 text-xs font-semibold text-ink/80">
          {t('clientData.builder.type')}
          <select className="input mt-1 w-full" value={f.type} onChange={(e) => onChange({ ...newField(e.target.value as FieldType, []), key: f.key, label: f.label, help: f.help, required: f.required, showIf: f.showIf })}>
            {(sub ? SUB_FIELD_TYPES : FIELD_TYPES).map((ft) => (
              <option key={ft} value={ft}>
                {t(`clientData.fieldType.${ft}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-10 items-center gap-2 text-xs font-semibold text-ink/80">
          <Switch checked={!!f.required} onChange={(v) => set({ required: v })} label={t('clientData.builder.required')} disabled={readOnly} />
          {t('clientData.builder.required')}
        </label>
        {!readOnly && (
          <div className="ml-auto flex gap-1">
            <button type="button" className="grid size-9 place-items-center rounded-md border border-line text-muted hover:text-ink" aria-label={t('clientData.builder.moveUp')} onClick={() => onMove(-1)}>
              <ArrowUp className="size-4" aria-hidden />
            </button>
            <button type="button" className="grid size-9 place-items-center rounded-md border border-line text-muted hover:text-ink" aria-label={t('clientData.builder.moveDown')} onClick={() => onMove(1)}>
              <ArrowDown className="size-4" aria-hidden />
            </button>
            <button type="button" className="grid size-9 place-items-center rounded-md border border-line text-muted hover:text-red-600" aria-label={t('clientData.builder.removeField')} onClick={onRemove}>
              <Trash2 className="size-4" aria-hidden />
            </button>
          </div>
        )}
      </div>
      <L10nInput label={t('clientData.builder.label')} value={f.label} onChange={(v) => set({ label: v })} required anyLang />
      <L10nInput label={t('clientData.builder.help')} value={f.help ?? emptyL10n()} onChange={(v) => set({ help: Object.values(v).some((s) => s.trim()) ? v : null })} />

      {(f.type === 'select' || f.type === 'multi') && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-ink/80">{t('clientData.builder.options')}</p>
          {(f.options ?? []).map((o, i) => (
            <div key={i} className="grid gap-2 rounded-lg border border-line p-2 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-end">
              <label className="block text-[11px] text-muted">
                {t('clientData.builder.optionValue')}
                <input className="input mt-1 w-full font-mono" value={o.value} maxLength={120} onChange={(e) => set({ options: f.options!.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} />
              </label>
              <L10nInput label={t('clientData.builder.optionLabel')} value={o.label} onChange={(v) => set({ options: f.options!.map((x, j) => (j === i ? { ...x, label: v } : x)) })} anyLang />
              {!readOnly && (
                <button type="button" className="grid size-9 place-items-center rounded-md text-muted hover:text-red-600" aria-label={t('clientData.common.remove')} onClick={() => set({ options: f.options!.filter((_, j) => j !== i) })}>
                  <Trash2 className="size-4" aria-hidden />
                </button>
              )}
            </div>
          ))}
          {!readOnly && (
            <button type="button" className="btn-white btn-sm border border-line" onClick={() => set({ options: [...(f.options ?? []), { value: `option${(f.options?.length ?? 0) + 1}`, label: emptyL10n() }] })}>
              <Plus className="size-3.5" aria-hidden /> {t('clientData.builder.addOption')}
            </button>
          )}
        </div>
      )}

      {f.type === 'group' && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            <p className="flex-1 text-xs font-semibold text-ink/80">{t('clientData.builder.subFields')}</p>
            <label className="block w-28 text-[11px] text-muted">
              {t('clientData.builder.maxRows')}
              <input type="number" min={1} max={30} className="input mt-1 w-full" value={f.maxRows ?? 10} onChange={(e) => set({ maxRows: Math.max(1, Math.min(30, Number(e.target.value) || 1)) })} />
            </label>
          </div>
          {(f.fields ?? []).map((s, i) => (
            <FieldEditor
              key={i}
              f={s}
              index={i}
              all={f.fields ?? []}
              sub
              targets={[]}
              readOnly={readOnly}
              onChange={(n) => set({ fields: f.fields!.map((x, j) => (j === i ? n : x)) })}
              onMove={(d) => {
                const arr = [...(f.fields ?? [])];
                const j = i + d;
                if (j < 0 || j >= arr.length) return;
                [arr[i], arr[j]] = [arr[j], arr[i]];
                set({ fields: arr });
              }}
              onRemove={() => set({ fields: f.fields!.filter((_, j) => j !== i) })}
            />
          ))}
          {!readOnly && (
            <button type="button" className="btn-white btn-sm border border-line" onClick={() => set({ fields: [...(f.fields ?? []), newField('text', (f.fields ?? []).map((x) => x.key))] })}>
              <Plus className="size-3.5" aria-hidden /> {t('clientData.builder.addSubField')}
            </button>
          )}
        </div>
      )}

      {!sub && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs font-semibold text-ink/80">
              {t('clientData.builder.showIf')}
              <select className="input mt-1 w-full" value={f.showIf?.field ?? ''} onChange={(e) => {
                const target = all.find((x) => x.key === e.target.value);
                set({ showIf: target ? { field: target.key, equals: target.type === 'yesno' ? true : (target.options?.[0]?.value ?? '') } : null });
              }}>
                <option value="">{t('clientData.builder.always')}</option>
                {earlier.map((x) => (
                  <option key={x.key} value={x.key}>
                    {tr(x.label) || x.key}
                  </option>
                ))}
              </select>
            </label>
            {cond && (
              <label className="block text-xs font-semibold text-ink/80">
                {t('clientData.builder.equals')}
                <select
                  className="input mt-1 w-full"
                  value={String(f.showIf!.equals)}
                  onChange={(e) => set({ showIf: { field: cond.key, equals: cond.type === 'yesno' ? e.target.value === 'true' : e.target.value } })}
                >
                  {cond.type === 'yesno' ? (
                    <>
                      <option value="true">{t('clientData.common.yes')}</option>
                      <option value="false">{t('clientData.common.no')}</option>
                    </>
                  ) : (
                    cond.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {tr(o.label) || o.value}
                      </option>
                    ))
                  )}
                </select>
              </label>
            )}
          </div>
          <label className="block text-xs font-semibold text-ink/80">
            {t('clientData.builder.target')}
            <select className="input mt-1 w-full" value={f.target ?? ''} disabled={f.type === 'file' || readOnly} onChange={(e) => set({ target: e.target.value || null })}>
              <option value="">{t('clientData.builder.noTarget')}</option>
              {(['profile', 'case', 'videx'] as const).map((ent) => (
                <optgroup key={ent} label={t(`clientData.builder.entity.${ent}`)}>
                  {fitting
                    .filter((tg) => tg.entity === ent)
                    .map((tg) => (
                      <option key={tg.target} value={tg.target}>
                        {tr(tg.label)}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
        </div>
      )}
    </fieldset>
  );
};

export default function CaseFormsPage() {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const canEdit = hasMinRole(user?.role, 'ADMIN');
  const { data, isLoading, error, refetch } = useQuery({ queryKey: TEMPLATES_KEY, queryFn: async () => (await api.get<{ templates: Template[] }>('/admin/case-forms/templates')).data.templates });
  const { data: targets = [] } = useQuery({ queryKey: ['admin-case-form-targets'], queryFn: async () => (await api.get<{ targets: TargetOption[] }>('/admin/case-forms/targets')).data.targets, staleTime: Infinity });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState(false);
  const [previewAnswers, setPreviewAnswers] = useState<Answers>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!draft && data?.length) setDraft(fromTemplate(data[0]));
  }, [data, draft]);

  const keys = useMemo(() => draft?.fields.map((f) => f.key) ?? [], [draft]);
  if (isLoading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock error={error} onRetry={() => refetch()} />;

  const setFields = (fields: FormField[]) => setDraft((d) => (d ? { ...d, fields } : d));
  const save = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const body = { title: draft.title, description: Object.values(draft.description).some((s) => s.trim()) ? draft.description : null, fields: draft.fields, active: draft.active };
      const res = draft.id ? (await api.put<{ template: Template }>(`/admin/case-forms/templates/${draft.id}`, body)).data : (await api.post<{ template: Template }>('/admin/case-forms/templates', body)).data;
      await qc.invalidateQueries({ queryKey: TEMPLATES_KEY });
      setDraft(fromTemplate(res.template));
      toast.success(t('clientData.builder.saved'));
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!draft?.id) return;
    setBusy(true);
    try {
      const res = (await api.delete<{ deactivated: boolean }>(`/admin/case-forms/templates/${draft.id}`)).data;
      await qc.invalidateQueries({ queryKey: TEMPLATES_KEY });
      toast.success(res.deactivated ? t('clientData.builder.deactivated') : t('clientData.builder.deleted'));
      setDraft(null);
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHead
        title={t('clientData.builder.title')}
        subtitle={t('clientData.builder.subtitle')}
        actions={
          canEdit && (
            <button type="button" className="btn-primary btn-sm" onClick={() => setDraft({ id: null, title: emptyL10n(), description: emptyL10n(), fields: [newField('text', [])], active: true, builtIn: false })}>
              <Plus className="size-3.5" aria-hidden /> {t('clientData.builder.new')}
            </button>
          )
        }
      />
      <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <Panel title={t('clientData.builder.templates')} icon={ClipboardList} bodyClassName="p-2">
          <ul className="space-y-1">
            {data.map((tp) => (
              <li key={tp.id}>
                <button type="button" onClick={() => { setDraft(fromTemplate(tp)); setPreview(false); }} className={clsx('flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition', draft?.id === tp.id ? 'bg-brand-50 font-semibold text-brand-800 dark:bg-brand-950/40 dark:text-brand-200' : 'text-ink hover:bg-surface')}>
                  <span className="min-w-0 break-words">{tr(tp.title)}</span>
                  <span className="flex shrink-0 gap-1">
                    {tp.builtIn && <span className="badge bg-slate-100 text-[10px] text-slate-600">{t('clientData.builder.builtIn')}</span>}
                    {!tp.active && <span className="badge bg-amber-100 text-[10px] text-amber-800">{t('clientData.builder.inactive')}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>

        {!draft ? (
          <Panel>
            <EmptyState icon={ClipboardList} title={t('clientData.builder.pick')} />
          </Panel>
        ) : (
          <Panel
            title={draft.id ? tr(draft.title) || t('clientData.builder.edit') : t('clientData.builder.new')}
            icon={ClipboardList}
            actions={
              <>
                <button type="button" className="btn-white btn-sm border border-line" onClick={() => { setPreview((v) => !v); setPreviewAnswers({}); }}>
                  <Eye className="size-3.5" aria-hidden /> {preview ? t('clientData.builder.edit') : t('clientData.builder.preview')}
                </button>
                {canEdit && draft.id && (
                  <button type="button" className="btn-white btn-sm border border-line" onClick={() => setDraft({ ...draft, id: null, builtIn: false, title: { az: `${draft.title.az} (2)`, de: `${draft.title.de} (2)`, en: `${draft.title.en} (2)`, ru: `${draft.title.ru} (2)` } })}>
                    <Copy className="size-3.5" aria-hidden /> {t('clientData.builder.duplicate')}
                  </button>
                )}
                {canEdit && draft.id && (
                  <button type="button" className="btn-white btn-sm border border-line text-red-700" disabled={busy} onClick={() => void remove()}>
                    <Trash2 className="size-3.5" aria-hidden /> {draft.builtIn ? t('clientData.builder.deactivate') : t('clientData.builder.delete')}
                  </button>
                )}
                {canEdit && (
                  <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={() => void save()}>
                    {busy ? <Spinner className="size-3.5" /> : <Save className="size-3.5" aria-hidden />} {t('clientData.common.save')}
                  </button>
                )}
              </>
            }
          >
            {!canEdit && <p className="mb-4 rounded-lg bg-surface px-3 py-2 text-xs text-muted">{t('clientData.builder.readOnly')}</p>}
            {preview ? (
              <div className="mx-auto max-w-2xl">
                <FormRenderer fields={draft.fields} answers={previewAnswers} onChange={setPreviewAnswers} />
              </div>
            ) : (
              <div className="space-y-4">
                <fieldset disabled={!canEdit} className="space-y-3">
                  <L10nInput label={t('clientData.builder.titleLabel')} value={draft.title} onChange={(v) => setDraft({ ...draft, title: v })} required anyLang />
                  <L10nInput label={t('clientData.builder.descriptionLabel')} value={draft.description} onChange={(v) => setDraft({ ...draft, description: v })} multiline rows={2} />
                  <label className="flex items-center gap-2 text-xs font-semibold text-ink/80">
                    <Switch checked={draft.active} onChange={(v) => setDraft({ ...draft, active: v })} label={t('clientData.builder.active')} disabled={!canEdit} />
                    {t('clientData.builder.active')}
                  </label>
                </fieldset>
                <h3 className="text-sm font-semibold text-navy-900">{t('clientData.builder.fields', { count: draft.fields.length })}</h3>
                {draft.fields.map((f, i) => (
                  <FieldEditor
                    key={i}
                    f={f}
                    index={i}
                    all={draft.fields}
                    targets={targets}
                    readOnly={!canEdit}
                    onChange={(n) => setFields(draft.fields.map((x, j) => (j === i ? n : x)))}
                    onMove={(d) => {
                      const arr = [...draft.fields];
                      const j = i + d;
                      if (j < 0 || j >= arr.length) return;
                      [arr[i], arr[j]] = [arr[j], arr[i]];
                      setFields(arr);
                    }}
                    onRemove={() => setFields(draft.fields.filter((_, j) => j !== i))}
                  />
                ))}
                {canEdit && (
                  <div className="flex flex-wrap gap-2">
                    {FIELD_TYPES.map((ft) => (
                      <button key={ft} type="button" className="btn-white btn-sm border border-dashed border-line" onClick={() => setFields([...draft.fields, newField(ft, keys)])}>
                        <Plus className="size-3.5" aria-hidden /> {t(`clientData.fieldType.${ft}`)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Panel>
        )}
      </div>
    </div>
  );
}
