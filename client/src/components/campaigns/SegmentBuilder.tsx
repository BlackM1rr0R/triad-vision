import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Plus, Trash2, Users } from 'lucide-react';
import { ALL_STATUSES, statusLabel } from '@/components/admin/labels';
import { Spinner } from '@/components/ui/Spinner';
import { useL10n } from '@/lib/l10n';
import type { CaseStatus } from '@/lib/types';
import {
  APP_STATUSES,
  blankCondition,
  FIELDS,
  LANGS,
  previewSegment,
  useSegmentOptions,
  VISA_TYPES,
  type Condition,
  type Definition,
  type Field,
  type SegmentPreview,
} from './api';

/** Toggle chips for a multi-value field. */
const Chips = <T extends string>({ all, value, onChange, label }: { all: readonly T[]; value: T[]; onChange: (v: T[]) => void; label: (v: T) => string }) => (
  <div className="flex flex-wrap gap-1.5">
    {all.map((v) => {
      const on = value.includes(v);
      return (
        <button
          key={v}
          type="button"
          aria-pressed={on}
          onClick={() => onChange(on ? value.filter((x) => x !== v) : [...value, v])}
          className={clsx(
            'inline-flex min-h-8 items-center rounded-full border px-2.5 text-xs font-semibold transition',
            on ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-card text-ink/80 hover:border-brand-400',
          )}
        >
          {label(v)}
        </button>
      );
    })}
  </div>
);

/** Pick from a long list (companies, categories): a select adds, chips remove. */
const PickList = ({ options, value, onChange, placeholder }: { options: { id: string; label: string }[]; value: string[]; onChange: (v: string[]) => void; placeholder: string }) => (
  <div className="space-y-2">
    <select className="input py-2" value="" onChange={(e) => e.target.value && onChange([...value, e.target.value])}>
      <option value="">{placeholder}</option>
      {options
        .filter((o) => !value.includes(o.id))
        .map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
    </select>
    {value.length > 0 && (
      <div className="flex flex-wrap gap-1.5">
        {value.map((id) => (
          <button key={id} type="button" onClick={() => onChange(value.filter((x) => x !== id))} className="inline-flex min-h-8 items-center gap-1 rounded-full bg-brand-50 px-2.5 text-xs font-semibold text-brand-700 hover:bg-brand-100">
            {options.find((o) => o.id === id)?.label ?? id} ×
          </button>
        ))}
      </div>
    )}
  </div>
);

/** Free values (city, country) as comma-separated text with suggestions. */
const WordsInput = ({ value, onChange, suggestions, id }: { value: string[]; onChange: (v: string[]) => void; suggestions: string[]; id: string }) => {
  const { t } = useTranslation();
  const [text, setText] = useState(value.join(', '));
  return (
    <>
      <input
        className="input py-2"
        list={`${id}-list`}
        value={text}
        placeholder={t('campaigns.segments.valuesHint')}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onChange(text.split(',').map((s) => s.trim()).filter(Boolean))}
      />
      <datalist id={`${id}-list`}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </>
  );
};

const ConditionEditor = ({ c, onChange, uid }: { c: Condition; onChange: (c: Condition) => void; uid: string }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const options = useSegmentOptions().data;
  const s = (k: string, o?: Record<string, unknown>) => t(`campaigns.segments.${k}`, o);
  switch (c.field) {
    case 'role':
      return <Chips all={['CLIENT', 'COMPANY'] as const} value={c.values} onChange={(values) => onChange({ ...c, values })} label={(v) => s(`roles.${v}`)} />;
    case 'caseStatus':
      return <Chips all={ALL_STATUSES} value={c.values} onChange={(values) => onChange({ ...c, values: values as CaseStatus[] })} label={(v) => statusLabel(v)} />;
    case 'visaType':
      return <Chips all={VISA_TYPES} value={c.values as (typeof VISA_TYPES)[number][]} onChange={(values) => onChange({ ...c, values })} label={(v) => s(`visaTypes.${v}`)} />;
    case 'locale':
      return <Chips all={LANGS} value={c.values} onChange={(values) => onChange({ ...c, values })} label={(v) => v.toUpperCase()} />;
    case 'visaCategory':
      return (
        <PickList
          options={(options?.visaCategories ?? []).map((v) => ({ id: v.id, label: tr(v.title) || v.slug }))}
          value={c.values}
          onChange={(values) => onChange({ ...c, values })}
          placeholder={s('choose')}
        />
      );
    case 'company':
      return <PickList options={(options?.companies ?? []).map((v) => ({ id: v.id, label: v.name }))} value={c.values} onChange={(values) => onChange({ ...c, values })} placeholder={s('choose')} />;
    case 'caseState':
      return (
        <select className="input py-2" value={c.value} onChange={(e) => onChange({ ...c, value: e.target.value as typeof c.value })}>
          {(['ACTIVE', 'CLOSED', 'NONE'] as const).map((v) => (
            <option key={v} value={v}>
              {s(`caseState.${v}`)}
            </option>
          ))}
        </select>
      );
    case 'registered':
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs text-muted">
            {s('from')}
            <input type="date" className="input mt-1 py-2" value={c.from ?? ''} onChange={(e) => onChange({ ...c, from: e.target.value || undefined })} />
          </label>
          <label className="text-xs text-muted">
            {s('to')}
            <input type="date" className="input mt-1 py-2" value={c.to ?? ''} onChange={(e) => onChange({ ...c, to: e.target.value || undefined })} />
          </label>
        </div>
      );
    case 'lastActivity':
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          <select className="input py-2" value={c.op} onChange={(e) => onChange({ ...c, op: e.target.value as 'before' | 'after' })}>
            <option value="before">{s('before')}</option>
            <option value="after">{s('after')}</option>
          </select>
          <input type="date" className="input py-2" value={c.date} onChange={(e) => e.target.value && onChange({ ...c, date: e.target.value })} />
        </div>
      );
    case 'city':
    case 'country':
      return <WordsInput id={`${uid}-${c.field}`} value={c.values} onChange={(values) => onChange({ ...c, values })} suggestions={(c.field === 'city' ? options?.cities : options?.countries) ?? []} />;
    case 'passportExpiresWithin':
      return (
        <label className="flex items-center gap-2 text-sm">
          <input type="number" min={1} max={120} className="input w-24 py-2" value={c.months} onChange={(e) => onChange({ ...c, months: Math.max(1, Math.min(120, Number(e.target.value) || 1)) })} />
          {s('months')}
        </label>
      );
    case 'appointmentWithin':
      return (
        <label className="flex items-center gap-2 text-sm">
          <input type="number" min={1} max={365} className="input w-24 py-2" value={c.days} onChange={(e) => onChange({ ...c, days: Math.max(1, Math.min(365, Number(e.target.value) || 1)) })} />
          {s('days')}
        </label>
      );
    case 'applicationStatus':
      return (
        <div className="space-y-2">
          <select className="input py-2" value={c.vacancyId} onChange={(e) => onChange({ ...c, vacancyId: e.target.value })}>
            <option value="">{s('vacancy')}…</option>
            {(options?.vacancies ?? []).map((v) => (
              <option key={v.id} value={v.id}>
                {typeof v.title === 'string' ? v.title : tr(v.title)}
                {v.company ? ` · ${v.company}` : ''}
              </option>
            ))}
          </select>
          <Chips all={APP_STATUSES} value={c.values as (typeof APP_STATUSES)[number][]} onChange={(values) => onChange({ ...c, values })} label={(v) => s(`appStatus.${v}`)} />
          {!c.values.length && <p className="text-xs text-muted">{s('anyStatus')}</p>}
        </div>
      );
    case 'unpaidInvoice':
      return null;
    case 'marketingOptIn':
      return (
        <select className="input py-2" value={c.value ? 'yes' : 'no'} onChange={(e) => onChange({ ...c, value: e.target.value === 'yes' })}>
          <option value="yes">{s('yes')}</option>
          <option value="no">{s('no')}</option>
        </select>
      );
  }
};

const OpToggle = ({ value, onChange, label }: { value: 'AND' | 'OR'; onChange: (v: 'AND' | 'OR') => void; label: string }) => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="font-semibold text-muted">{label}:</span>
      {(['AND', 'OR'] as const).map((op) => (
        <button
          key={op}
          type="button"
          aria-pressed={value === op}
          onClick={() => onChange(op)}
          className={clsx('min-h-8 rounded-md border px-2.5 font-semibold', value === op ? 'border-navy-900 bg-navy-900 text-white' : 'border-line bg-card text-ink/80')}
        >
          {t(`campaigns.segments.${op === 'AND' ? 'and' : 'or'}`)}
        </button>
      ))}
    </div>
  );
};

/** Click-built AND/OR groups of conditions. */
export const SegmentBuilder = ({ value, onChange }: { value: Definition; onChange: (d: Definition) => void }) => {
  const { t } = useTranslation();
  const s = (k: string, o?: Record<string, unknown>) => t(`campaigns.segments.${k}`, o);
  const setGroup = (gi: number, g: Definition['groups'][number] | null) =>
    onChange({ ...value, groups: g ? value.groups.map((x, i) => (i === gi ? g : x)) : value.groups.filter((_, i) => i !== gi) });

  return (
    <div className="space-y-3">
      {value.groups.length > 1 && <OpToggle value={value.op} onChange={(op) => onChange({ ...value, op })} label={s('groupsJoin')} />}
      {value.groups.length === 0 && <p className="rounded-lg bg-surface px-3 py-2 text-sm text-muted">{s('emptyRule')}</p>}
      {value.groups.map((g, gi) => (
        <fieldset key={gi} className="rounded-xl border border-line bg-surface/60 p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <legend className="text-sm font-semibold text-navy-900">{s('group', { n: gi + 1 })}</legend>
            <div className="flex flex-wrap items-center gap-2">
              {g.conditions.length > 1 && <OpToggle value={g.op} onChange={(op) => setGroup(gi, { ...g, op })} label={s('inGroup')} />}
              <button type="button" className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs font-semibold text-red-700 hover:bg-red-50" onClick={() => setGroup(gi, null)}>
                <Trash2 className="size-3.5" aria-hidden /> {s('remove')}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            {g.conditions.map((c, ci) => (
              <div key={ci} className="grid gap-2 rounded-lg border border-line bg-card p-3 md:grid-cols-[14rem_1fr_auto] md:items-start">
                <select
                  className="input py-2"
                  aria-label={s('addCondition')}
                  value={c.field}
                  onChange={(e) => setGroup(gi, { ...g, conditions: g.conditions.map((x, i) => (i === ci ? blankCondition(e.target.value as Field) : x)) })}
                >
                  {FIELDS.map((f) => (
                    <option key={f} value={f}>
                      {s(`fields.${f}`)}
                    </option>
                  ))}
                </select>
                <div className="min-w-0">
                  <ConditionEditor uid={`g${gi}c${ci}`} c={c} onChange={(nc) => setGroup(gi, { ...g, conditions: g.conditions.map((x, i) => (i === ci ? nc : x)) })} />
                </div>
                <button
                  type="button"
                  aria-label={s('remove')}
                  className="grid size-9 place-items-center justify-self-end rounded-md text-muted hover:bg-red-50 hover:text-red-700"
                  onClick={() => {
                    const conditions = g.conditions.filter((_, i) => i !== ci);
                    setGroup(gi, conditions.length ? { ...g, conditions } : null);
                  }}
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="btn-white btn-sm mt-3 border border-line" onClick={() => setGroup(gi, { ...g, conditions: [...g.conditions, blankCondition('caseStatus')] })}>
            <Plus className="size-3.5" aria-hidden /> {s('addCondition')}
          </button>
        </fieldset>
      ))}
      <button type="button" className="btn-secondary btn-sm" onClick={() => onChange({ ...value, groups: [...value.groups, { op: 'AND', conditions: [blankCondition('role')] }] })}>
        <Plus className="size-3.5" aria-hidden /> {s('addGroup')}
      </button>
    </div>
  );
};

/** Live count + sample for a definition (debounced). */
export const useSegmentPreview = (definition: Definition | null) => {
  const [data, setData] = useState<SegmentPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const key = definition ? JSON.stringify(definition) : '';
  useEffect(() => {
    if (!definition) {
      setData(null);
      return;
    }
    let alive = true;
    setLoading(true);
    const h = window.setTimeout(() => {
      previewSegment(definition)
        .then((d) => alive && setData(d))
        .catch(() => alive && setData(null))
        .finally(() => alive && setLoading(false));
    }, 400);
    return () => {
      alive = false;
      window.clearTimeout(h);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { data, loading };
};

export const SegmentPreviewPanel = ({ preview, loading, footer }: { preview: SegmentPreview | null; loading: boolean; footer?: ReactNode }) => {
  const { t } = useTranslation();
  const s = (k: string, o?: Record<string, unknown>) => t(`campaigns.segments.${k}`, o);
  return (
    <div className="rounded-xl border border-line bg-card">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-4 py-3">
        <Users className="size-4 text-brand-600" aria-hidden />
        <p className="text-lg font-bold text-navy-900 tabular-nums" aria-live="polite">
          {preview ? s('count', { count: preview.count }) : '—'}
        </p>
        {preview && <p className="text-xs text-muted">{s('optedIn', { count: preview.marketingOptedIn })}</p>}
        {loading && <Spinner className="ml-auto size-4" />}
      </div>
      <div className="max-h-80 overflow-auto">
        {preview && preview.sample.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted">{s('noMatch')}</p>}
        {preview && preview.sample.length > 0 && (
          <table className="w-full text-left text-xs">
            <caption className="px-4 pt-3 text-left text-xs font-semibold text-muted">{s('sample')}</caption>
            <thead className="text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">{s('sampleCols.name')}</th>
                <th className="px-2 py-2 font-medium">{s('sampleCols.contact')}</th>
                <th className="hidden px-2 py-2 font-medium sm:table-cell">{s('sampleCols.role')}</th>
                <th className="px-2 py-2 font-medium">{s('sampleCols.lang')}</th>
                <th className="px-4 py-2 font-medium">{s('sampleCols.consent')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {preview.sample.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2 font-medium text-navy-900">
                    {r.firstName} {r.lastName}
                    {r.company && <span className="block text-[11px] text-muted">{r.company.name}</span>}
                  </td>
                  <td className="max-w-[12rem] truncate px-2 py-2 text-muted" title={r.email}>
                    {r.email}
                  </td>
                  <td className="hidden px-2 py-2 sm:table-cell">{s(`roles.${r.role === 'COMPANY' ? 'COMPANY' : 'CLIENT'}`)}</td>
                  <td className="px-2 py-2 uppercase">{r.locale}</td>
                  <td className="px-4 py-2">{r.marketingOptIn ? '✓' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {footer}
    </div>
  );
};
