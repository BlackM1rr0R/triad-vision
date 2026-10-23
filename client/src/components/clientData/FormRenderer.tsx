import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { FileUp, Paperclip, Plus, Trash2 } from 'lucide-react';
import { fileUrl } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { Spinner } from '@/components/ui/Spinner';
import { isVisible, uploadCaseFile, type Answers, type FormField } from './api';

/**
 * Renders a questionnaire (smart form) for the client — or read-only for staff / preview. Mobile first:
 * one column, large touch targets, native date / number inputs. Show-if fields appear when their condition
 * is met; repeatable groups get "add row" / "remove".
 */

interface Props {
  fields: FormField[];
  answers: Answers;
  onChange?: (next: Answers) => void;
  readOnly?: boolean;
  /** "key" or "key.row.sub" of required answers still missing (highlighted after a submit attempt). */
  missing?: Set<string>;
  /** Needed for file fields (uploads go to the case). */
  caseId?: string;
  fileNames?: Record<string, { name: string }>;
}

const Value = ({ f, v, fileNames }: { f: FormField; v: unknown; fileNames?: Record<string, { name: string }> }) => {
  const { t } = useTranslation();
  const { tr, date } = useL10n();
  if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return <span className="text-muted italic">—</span>;
  switch (f.type) {
    case 'yesno':
      return <span>{v ? t('clientData.common.yes') : t('clientData.common.no')}</span>;
    case 'date':
      return <span>{date(`${String(v)}T12:00:00Z`)}</span>;
    case 'select':
      return <span>{tr(f.options?.find((o) => o.value === v)?.label) || String(v)}</span>;
    case 'multi':
      return <span>{(v as string[]).map((x) => tr(f.options?.find((o) => o.value === x)?.label) || x).join(', ')}</span>;
    case 'file':
      return (
        <span className="flex flex-col gap-1">
          {(v as string[]).map((id) => (
            <a key={id} href={fileUrl(id)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-brand-700 hover:underline">
              <Paperclip className="size-3.5" aria-hidden /> {fileNames?.[id]?.name ?? t('clientData.common.file')}
            </a>
          ))}
        </span>
      );
    default:
      return <span className="whitespace-pre-line">{String(v)}</span>;
  }
};

const Input = ({ f, value, onChange, invalid, id }: { f: FormField; value: unknown; onChange: (v: unknown) => void; invalid: boolean; id: string }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const cls = clsx('input w-full', invalid && 'border-red-400 ring-2 ring-red-100 dark:ring-red-900/40');
  switch (f.type) {
    case 'textarea':
      return <textarea id={id} className={cls} rows={3} value={String(value ?? '')} maxLength={4000} onChange={(e) => onChange(e.target.value)} />;
    case 'number':
      return <input id={id} type="number" inputMode="decimal" className={cls} value={value === undefined || value === null ? '' : String(value)} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />;
    case 'date':
      return <input id={id} type="date" className={cls} value={String(value ?? '')} min="1900-01-01" max="2100-12-31" onChange={(e) => onChange(e.target.value || undefined)} />;
    case 'select':
      return (
        <select id={id} className={cls} value={String(value ?? '')} onChange={(e) => onChange(e.target.value || undefined)}>
          <option value="">{t('clientData.common.choose')}</option>
          {f.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {tr(o.label)}
            </option>
          ))}
        </select>
      );
    case 'multi': {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className={clsx('flex flex-wrap gap-2', invalid && 'rounded-lg ring-2 ring-red-100 dark:ring-red-900/40')} role="group" aria-labelledby={`${id}-label`}>
          {f.options?.map((o) => {
            const on = arr.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                aria-pressed={on}
                onClick={() => onChange(on ? arr.filter((x) => x !== o.value) : [...arr, o.value])}
                className={clsx('min-h-10 rounded-lg border px-3 text-sm transition', on ? 'border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-950/40 dark:text-brand-200' : 'border-line bg-white text-ink/80 hover:border-brand-300')}
              >
                {tr(o.label)}
              </button>
            );
          })}
        </div>
      );
    }
    case 'yesno':
      return (
        <div className={clsx('grid grid-cols-2 gap-2 sm:max-w-xs', invalid && 'rounded-lg ring-2 ring-red-100 dark:ring-red-900/40')} role="radiogroup" aria-labelledby={`${id}-label`}>
          {[true, false].map((b) => (
            <button
              key={String(b)}
              type="button"
              role="radio"
              aria-checked={value === b}
              onClick={() => onChange(b)}
              className={clsx('min-h-11 rounded-lg border text-sm font-semibold transition', value === b ? 'border-brand-500 bg-brand-600 text-white' : 'border-line bg-white text-ink/80 hover:border-brand-300')}
            >
              {b ? t('clientData.common.yes') : t('clientData.common.no')}
            </button>
          ))}
        </div>
      );
    default:
      return <input id={id} type="text" className={cls} value={String(value ?? '')} maxLength={500} onChange={(e) => onChange(e.target.value)} />;
  }
};

const FileInput = ({ caseId, value, onChange, fileNames }: { caseId?: string; value: unknown; onChange: (v: unknown) => void; fileNames: Record<string, { name: string }> }) => {
  const { t } = useTranslation();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const ids = Array.isArray(value) ? (value as string[]) : [];
  return (
    <div className="space-y-2">
      {ids.map((id) => (
        <div key={id} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm">
          <span className="flex min-w-0 items-center gap-1.5">
            <Paperclip className="size-4 shrink-0 text-muted" aria-hidden /> <span className="truncate">{fileNames[id]?.name ?? t('clientData.common.file')}</span>
          </span>
          <button type="button" className="grid size-9 shrink-0 place-items-center rounded-md text-muted hover:text-red-600" aria-label={t('clientData.common.remove')} onClick={() => onChange(ids.filter((x) => x !== id))}>
            <Trash2 className="size-4" aria-hidden />
          </button>
        </div>
      ))}
      <input
        ref={ref}
        type="file"
        className="sr-only"
        tabIndex={-1}
        accept="application/pdf,image/jpeg,image/png,image/heic"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file || !caseId) return;
          setBusy(true);
          setError(false);
          try {
            const doc = await uploadCaseFile(caseId, file);
            fileNames[doc.id] = { name: doc.originalName };
            onChange([...ids, doc.id]);
          } catch {
            setError(true);
          } finally {
            setBusy(false);
          }
        }}
      />
      <button type="button" className="btn-secondary btn-sm" disabled={busy || ids.length >= 10} onClick={() => ref.current?.click()}>
        {busy ? <Spinner className="size-4" /> : <FileUp className="size-4" aria-hidden />} {busy ? t('clientData.common.uploading') : t('clientData.common.upload')}
      </button>
      {error && <p className="text-xs text-red-600">{t('clientData.errors.UPLOAD_FAILED')}</p>}
    </div>
  );
};

export const FormRenderer = ({ fields, answers, onChange, readOnly, missing, caseId, fileNames: names }: Props) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const base = useId();
  const [fileNames] = useState<Record<string, { name: string }>>(() => ({ ...(names ?? {}) }));
  const set = (key: string, v: unknown) => onChange?.({ ...answers, [key]: v });

  return (
    <div className="space-y-5">
      {fields
        .filter((f) => isVisible(f, answers))
        .map((f) => {
          const id = `${base}-${f.key}`;
          const invalid = !!missing?.has(f.key);
          const label = (
            <span id={`${id}-label`} className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-navy-900">
              {tr(f.label)}
              {f.required && !readOnly && <span className="text-xs font-normal text-red-600">*</span>}
            </span>
          );
          const help = f.help && tr(f.help) ? <p className="mt-0.5 text-xs text-muted">{tr(f.help)}</p> : null;
          if (readOnly) {
            return (
              <div key={f.key} className="border-b border-line pb-3 last:border-0">
                {label}
                <div className="mt-1 text-sm text-ink">
                  {f.type === 'group' ? (
                    <GroupRead f={f} rows={(answers[f.key] as Answers[] | undefined) ?? []} fileNames={fileNames} />
                  ) : (
                    <Value f={f} v={answers[f.key]} fileNames={fileNames} />
                  )}
                </div>
              </div>
            );
          }
          if (f.type === 'group') {
            const rows = Array.isArray(answers[f.key]) ? (answers[f.key] as Answers[]) : [];
            const setRows = (next: Answers[]) => set(f.key, next);
            return (
              <fieldset key={f.key} className={clsx('rounded-xl border p-3 sm:p-4', invalid ? 'border-red-300' : 'border-line')}>
                <legend className="px-1">{label}</legend>
                {help}
                <div className="mt-2 space-y-3">
                  {rows.map((row, i) => (
                    <div key={i} className="rounded-lg bg-surface p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted">#{i + 1}</span>
                        <button type="button" className="grid size-9 place-items-center rounded-md text-muted hover:text-red-600" aria-label={t('clientData.common.remove')} onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {(f.fields ?? []).map((s) => {
                          const sid = `${id}-${i}-${s.key}`;
                          return (
                            <label key={s.key} htmlFor={sid} className={clsx('block min-w-0', s.type === 'textarea' && 'sm:col-span-2')}>
                              <span id={`${sid}-label`} className="mb-1 block text-xs font-semibold text-ink/80">
                                {tr(s.label)}
                                {s.required && <span className="text-red-600"> *</span>}
                              </span>
                              <Input f={s} id={sid} value={row[s.key]} invalid={!!missing?.has(`${f.key}.${i}.${s.key}`)} onChange={(v) => setRows(rows.map((r, j) => (j === i ? { ...r, [s.key]: v } : r)))} />
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  {rows.length < (f.maxRows ?? 20) && (
                    <button type="button" className="btn-white btn-sm w-full border border-dashed border-line sm:w-auto" onClick={() => setRows([...rows, {}])}>
                      <Plus className="size-4" aria-hidden /> {t('clientData.common.addRow')}
                    </button>
                  )}
                </div>
              </fieldset>
            );
          }
          return (
            <div key={f.key}>
              <label htmlFor={id} className="block">
                {label}
              </label>
              {help}
              <div className="mt-1.5">
                {f.type === 'file' ? (
                  <FileInput caseId={caseId} value={answers[f.key]} fileNames={fileNames} onChange={(v) => set(f.key, v)} />
                ) : (
                  <Input f={f} id={id} value={answers[f.key]} invalid={invalid} onChange={(v) => set(f.key, v)} />
                )}
              </div>
              {invalid && <p className="mt-1 text-xs text-red-600">{t('clientData.common.requiredHint')}</p>}
            </div>
          );
        })}
    </div>
  );
};

const GroupRead = ({ f, rows, fileNames }: { f: FormField; rows: Answers[]; fileNames: Record<string, { name: string }> }) => {
  const { tr } = useL10n();
  if (!rows.length) return <span className="text-muted italic">—</span>;
  return (
    <ol className="space-y-2">
      {rows.map((r, i) => (
        <li key={i} className="rounded-lg bg-surface px-3 py-2">
          <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
            {(f.fields ?? []).map((s) => (
              <div key={s.key} className="min-w-0">
                <dt className="text-[11px] text-muted">{tr(s.label)}</dt>
                <dd className="break-words">
                  <Value f={s} v={r[s.key]} fileNames={fileNames} />
                </dd>
              </div>
            ))}
          </dl>
        </li>
      ))}
    </ol>
  );
};
