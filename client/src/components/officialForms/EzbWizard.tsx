import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCircle2, ExternalLink, HelpCircle, Pencil, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { registerCopy } from '@/i18n';
import { pagesEzbWizard } from '@/i18n/pagesEzbWizard';
import type { L10n } from './api';

registerCopy(pagesEzbWizard);

/**
 * Step-by-step wizard of the "Erklärung zum Beschäftigungsverhältnis" (EzB 02/2024). The server sends every
 * employer field with its step, the official question number and the rules (pattern, range, "show when");
 * this component evaluates the rules generically (same source of truth as the server validation in
 * server/src/lib/officialForms/ezbWizard.ts) and shows German-first help texts with examples.
 * Used by the company portal (CompanyForms) and the staff version on the case (CaseOfficialFormsPanel).
 */

export interface WizardCondition {
  key: string;
  in: string[];
}
export interface WizardField {
  key: string;
  group: string;
  kind: 'text' | 'date' | 'code' | 'money' | 'number';
  codes: string[] | null;
  label: L10n;
  value: string;
  required: boolean;
  step: string;
  question: number | null;
  rules: { pattern?: string; min?: number; max?: number; showWhen?: WizardCondition; requiredWhenShown?: boolean; multiline?: boolean };
}
export interface WizardMeta {
  steps: string[];
  officialForm: { url: string; version: string; checked: string };
  kldbSuggestions: { code: string; de: string; en: string; az: string; verify: boolean }[];
}

type Values = Record<string, string>;
type ErrorCode = 'REQUIRED' | 'PATTERN' | 'RANGE' | 'DATE_ORDER';

const conditionMet = (c: WizardCondition | undefined, v: Values) => {
  if (!c) return true;
  const x = (v[c.key] ?? '').trim();
  return c.in.includes('*') ? !!x : c.in.includes(x);
};

/** Mirrors isShown() on the server: a field is shown when its condition and the condition it depends on hold. */
export const fieldShown = (fields: WizardField[], key: string, v: Values, depth = 0): boolean => {
  const f = fields.find((x) => x.key === key);
  const c = f?.rules.showWhen;
  if (!c) return true;
  if (depth > 5) return false;
  return conditionMet(c, v) && fieldShown(fields, c.key, v, depth + 1);
};

/** Client-side validation with the server's rules (the server checks again on submit). */
export const validateWizard = (fields: WizardField[], v: Values) => {
  const errors: Record<string, ErrorCode> = {};
  for (const f of fields) {
    if (!fieldShown(fields, f.key, v)) continue;
    const raw = (v[f.key] ?? '').trim();
    if (!raw) {
      if (f.required || (f.rules.showWhen && f.rules.requiredWhenShown)) errors[f.key] = 'REQUIRED';
      continue;
    }
    if (f.rules.pattern && !new RegExp(f.rules.pattern).test(raw)) errors[f.key] = 'PATTERN';
    if (f.rules.min !== undefined || f.rules.max !== undefined) {
      const n = Number(raw.replace(',', '.'));
      if (!Number.isFinite(n) || (f.rules.min !== undefined && n < f.rules.min) || (f.rules.max !== undefined && n > f.rules.max)) errors[f.key] = 'RANGE';
    }
  }
  const start = v['contract.startDate'];
  const end = v['contract.endDate'];
  if (start && end && fieldShown(fields, 'contract.endDate', v) && end <= start) errors['contract.endDate'] = 'DATE_ORDER';
  return errors;
};

/** Hints (not blocking): minimum wage (MiLoV5) and statutory leave (§ 3 BUrlG). */
const warningsOf = (v: Values) => {
  const out: Record<string, string> = {};
  const hours = Number(v['contract.weeklyHours']);
  const monthly = Number(v['contract.grossMonthly']);
  if (v['contract.vacationDays'] && hours >= 30 && Number(v['contract.vacationDays']) < 20) out['contract.vacationDays'] = 'VACATION_BELOW_STATUTORY';
  if (hours > 0 && monthly > 0) {
    const start = v['contract.startDate'] || new Date().toISOString().slice(0, 10);
    const min = start >= '2027-01-01' ? 14.6 : 13.9;
    if (monthly / (hours * (52 / 12)) < min) out['contract.grossMonthly'] = 'BELOW_MINIMUM_WAGE';
  }
  return out;
};

export interface EzbWizardProps {
  fields: WizardField[];
  meta: WizardMeta;
  values: Values;
  onChange: (key: string, value: string) => void;
  /** Keys the server rejected on the last submit. */
  serverInvalid?: string[];
  readOnly?: boolean;
  /** GET endpoint for the KldB search (?q=). */
  kldbUrl: string;
  /** Buttons on the review step (submit / generate / data sheet / preview). */
  reviewActions: ReactNode;
  /** Shown above the steps (e.g. worker summary). */
  header?: ReactNode;
}

export const EzbWizard = ({ fields, meta, values, onChange, serverInvalid = [], readOnly, kldbUrl, reviewActions, header }: EzbWizardProps) => {
  const { t } = useTranslation();
  const steps = [...meta.steps, 'review'];
  const [step, setStep] = useState(0);
  const [touchedSteps, setTouchedSteps] = useState<Set<string>>(new Set());
  const errors = useMemo(() => validateWizard(fields, values), [fields, values]);
  const warnings = useMemo(() => warningsOf(values), [values]);
  const current = steps[step];
  const stepFields = fields.filter((f) => f.step === current && fieldShown(fields, f.key, values));

  // Jump to the first step with a server-side error.
  useEffect(() => {
    if (!serverInvalid.length) return;
    const first = fields.find((f) => serverInvalid.includes(f.key));
    const idx = first ? meta.steps.indexOf(first.step) : -1;
    if (idx >= 0) {
      setStep(idx);
      setTouchedSteps((s) => new Set([...s, first!.step]));
    }
  }, [serverInvalid, fields, meta.steps]);

  const stepErrors = (s: string) => fields.filter((f) => f.step === s && errors[f.key]).length;
  const missingTotal = Object.keys(errors).length;
  const go = (i: number) => {
    setTouchedSteps((s) => new Set([...s, current]));
    setStep(Math.max(0, Math.min(steps.length - 1, i)));
    if (typeof window !== 'undefined') document.getElementById('ezb-wizard-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="space-y-5" id="ezb-wizard-top">
      {header}
      {/* Stepper */}
      <nav aria-label={t('ezbWizard.stepOf', { n: step + 1, total: steps.length })}>
        <p className="mb-2 text-xs font-semibold text-muted">{t('ezbWizard.stepOf', { n: step + 1, total: steps.length })}</p>
        <ol className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
          {steps.map((s, i) => {
            const bad = s !== 'review' && touchedSteps.has(s) && stepErrors(s) > 0;
            const done = s !== 'review' && touchedSteps.has(s) && !stepErrors(s);
            return (
              <li key={s} className="shrink-0">
                <button
                  type="button"
                  onClick={() => go(i)}
                  aria-current={i === step ? 'step' : undefined}
                  className={clsx(
                    'flex min-h-10 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors',
                    i === step ? 'border-primary bg-primary text-primary-contrast' : bad ? 'border-warning-border bg-warning-bg text-warning-fg' : 'border-line bg-card text-muted hover:text-ink',
                  )}
                >
                  {done ? <Check className="size-3.5" aria-hidden /> : bad ? <AlertTriangle className="size-3.5" aria-hidden /> : <span aria-hidden>{i + 1}.</span>}
                  {t(`ezbWizard.steps.${s}`)}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <section className="rounded-3xl border border-line bg-card p-4 sm:p-6" aria-labelledby="ezb-step-title">
        <h2 id="ezb-step-title" className="font-display text-lg font-semibold text-ink">
          {t(`ezbWizard.steps.${current}`)}
        </h2>
        <p className="mt-1 text-sm text-muted">{t(`ezbWizard.stepIntro.${current}`)}</p>

        {current === 'review' ? (
          <Review fields={fields} values={values} errors={errors} steps={meta.steps} onEdit={(s) => go(meta.steps.indexOf(s))} />
        ) : (
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            {stepFields.map((f) => (
              <WizardInput
                key={f.key}
                field={f}
                value={values[f.key] ?? ''}
                error={touchedSteps.has(current) || serverInvalid.includes(f.key) ? errors[f.key] : undefined}
                warning={warnings[f.key]}
                readOnly={readOnly}
                onChange={(v) => onChange(f.key, v)}
                kldb={f.key === 'employment.kldbCode' ? { url: kldbUrl, suggestions: meta.kldbSuggestions, onPick: (code) => onChange(f.key, code) } : undefined}
              />
            ))}
          </div>
        )}

        {current !== 'review' && touchedSteps.has(current) && stepErrors(current) > 0 && (
          <p className="mt-4 flex items-center gap-2 text-sm text-warning-fg" role="status">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            {t('ezbWizard.errors.stepHasErrors')}
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          {step > 0 && (
            <button type="button" className="btn-secondary" onClick={() => go(step - 1)}>
              <ArrowLeft className="size-4" aria-hidden />
              {t('ezbWizard.back')}
            </button>
          )}
          {current !== 'review' ? (
            <button type="button" className="btn-primary ml-auto" onClick={() => go(step + 1)}>
              {t('ezbWizard.next')}
              <ArrowRight className="size-4" aria-hidden />
            </button>
          ) : (
            <div className="ml-auto flex flex-wrap gap-2">{reviewActions}</div>
          )}
        </div>
        {current === 'review' && (
          <p className={clsx('mt-3 flex items-center gap-2 text-sm', missingTotal ? 'text-warning-fg' : 'text-success-fg')} role="status">
            {missingTotal ? <AlertTriangle className="size-4" aria-hidden /> : <CheckCircle2 className="size-4" aria-hidden />}
            {missingTotal ? t('ezbWizard.review.missing', { count: missingTotal }) : t('ezbWizard.review.complete')}
          </p>
        )}
      </section>

      <p className="text-xs text-muted">
        {t('ezbWizard.official.note', { version: meta.officialForm.version, date: meta.officialForm.checked.split('-').reverse().join('.') })}{' '}
        <a href={meta.officialForm.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-link hover:underline">
          {t('ezbWizard.official.link')}
          <ExternalLink className="size-3" aria-hidden />
        </a>
      </p>
    </div>
  );
};

/** The current wizard values (validation result included) for the parent's submit buttons. */
export const wizardHasErrors = (fields: WizardField[], values: Values) => Object.keys(validateWizard(fields, values)).length > 0;

const displayValue = (f: WizardField, raw: string, t: (k: string) => string, date: (s: string) => string) => {
  if (!raw) return '';
  if (f.kind === 'code') return raw === 'yes' ? t('ezbWizard.yes') : raw === 'no' ? t('ezbWizard.no') : t(`ezbWizard.codes.${raw}`);
  if (f.kind === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return date(raw);
  if (f.kind === 'money') return `${Number(raw).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  return raw;
};

const Review = ({ fields, values, errors, steps, onEdit }: { fields: WizardField[]; values: Values; errors: Record<string, ErrorCode>; steps: string[]; onEdit: (step: string) => void }) => {
  const { t } = useTranslation();
  const { tr, date } = useL10n();
  return (
    <div className="mt-5 space-y-4">
      {steps.map((s) => {
        const rows = fields.filter((f) => f.step === s && fieldShown(fields, f.key, values));
        return (
          <div key={s} className="rounded-2xl border border-line">
            <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
              <h3 className="text-sm font-semibold text-ink">{t(`ezbWizard.steps.${s}`)}</h3>
              <button type="button" className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-link hover:underline" onClick={() => onEdit(s)}>
                <Pencil className="size-3.5" aria-hidden />
                {t('ezbWizard.edit')}
              </button>
            </div>
            <dl className="divide-y divide-line text-sm">
              {rows.map((f) => (
                <div key={f.key} className={clsx('grid gap-1 px-4 py-2 sm:grid-cols-[1fr_1.2fr]', errors[f.key] && 'bg-warning-bg')}>
                  <dt className="text-muted">
                    {f.question ? <span className="mr-1 text-xs tabular-nums">{f.question} ·</span> : null}
                    {tr(f.label)}
                  </dt>
                  <dd className={clsx('break-words', errors[f.key] ? 'font-semibold text-warning-fg' : 'text-ink')}>
                    {displayValue(f, values[f.key] ?? '', t, date) || (errors[f.key] ? t(`ezbWizard.errors.${errors[f.key]}`) : t('ezbWizard.empty'))}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        );
      })}
    </div>
  );
};

const WizardInput = ({
  field,
  value,
  error,
  warning,
  readOnly,
  onChange,
  kldb,
}: {
  field: WizardField;
  value: string;
  error?: ErrorCode;
  warning?: string;
  readOnly?: boolean;
  onChange: (v: string) => void;
  kldb?: { url: string; suggestions: WizardMeta['kldbSuggestions']; onPick: (code: string) => void };
}) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const id = `ezb-${field.key.replace(/\./g, '-')}`;
  const helpId = `${id}-help`;
  const errId = `${id}-err`;
  const required = field.required || (!!field.rules.showWhen && !!field.rules.requiredWhenShown);
  const wide = field.rules.multiline || field.key === 'company.name' || field.key === 'employment.workplaceAddress' || field.kind === 'code';
  const cls = clsx('input', error && 'border-danger ring-1 ring-danger');
  const helpText = t(`ezbWizard.help.${field.key}.text`, { defaultValue: '' });
  const example = t(`ezbWizard.help.${field.key}.example`, { defaultValue: '' });
  const describedBy = [helpText ? helpId : '', error ? errId : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className={clsx(wide && 'sm:col-span-2')}>
      <label className="label flex flex-wrap items-baseline gap-x-2" htmlFor={id}>
        <span>{tr(field.label)}</span>
        {field.question ? <span className="badge chip-sky text-[11px]">{t('ezbWizard.question', { n: field.question })}</span> : <span className="text-[11px] font-normal text-muted">{t('ezbWizard.notOnForm')}</span>}
        <span className="text-xs font-normal text-muted">({required ? t('ezbWizard.required') : t('ezbWizard.optional')})</span>
      </label>
      {field.kind === 'code' && field.codes ? (
        field.codes.length <= 3 ? (
          <div role="radiogroup" aria-labelledby={`${id}-lbl`} aria-describedby={describedBy} className="flex flex-wrap gap-2" id={id}>
            <span id={`${id}-lbl`} className="sr-only">
              {tr(field.label)}
            </span>
            {field.codes.map((c) => (
              <label key={c} className={clsx('flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm', value === c ? 'border-primary bg-primary/10 font-semibold text-ink' : 'border-line text-muted', readOnly && 'cursor-default opacity-70')}>
                <input type="radio" className="size-4" name={id} value={c} checked={value === c} disabled={readOnly} onChange={() => onChange(c)} />
                {c === 'yes' ? t('ezbWizard.yes') : c === 'no' ? t('ezbWizard.no') : t(`ezbWizard.codes.${c}`, { defaultValue: c })}
              </label>
            ))}
          </div>
        ) : (
          <select id={id} className={cls} value={value} disabled={readOnly} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} aria-describedby={describedBy}>
            <option value="">{t('ezbWizard.choose')}</option>
            {field.codes.map((c) => (
              <option key={c} value={c}>
                {c === 'yes' ? t('ezbWizard.yes') : c === 'no' ? t('ezbWizard.no') : t(`ezbWizard.codes.${c}`, { defaultValue: c })}
              </option>
            ))}
          </select>
        )
      ) : field.rules.multiline ? (
        <textarea id={id} rows={4} maxLength={1000} className={cls} value={value} readOnly={readOnly} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} aria-describedby={describedBy} />
      ) : (
        <input
          id={id}
          className={cls}
          type={field.kind === 'date' ? 'date' : field.kind === 'money' || field.kind === 'number' ? 'number' : field.key === 'company.email' ? 'email' : field.key === 'company.phone' || field.key === 'company.fax' ? 'tel' : 'text'}
          inputMode={field.kind === 'money' || field.kind === 'number' ? 'decimal' : field.rules.pattern?.startsWith('^\\d') ? 'numeric' : undefined}
          step={field.kind === 'money' ? '0.01' : field.kind === 'number' ? '0.5' : undefined}
          min={field.rules.min}
          max={field.rules.max}
          maxLength={300}
          value={value}
          readOnly={readOnly}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          aria-required={required}
        />
      )}
      {error && (
        <p id={errId} className="mt-1 text-xs font-semibold text-danger-fg">
          {t(`ezbWizard.errors.${error}`)}
        </p>
      )}
      {warning && (
        <p className="mt-1 flex items-start gap-1.5 text-xs text-warning-fg">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t(`ezbWizard.warnings.${warning}`)}
        </p>
      )}
      {helpText && (
        <p id={helpId} className="mt-1.5 flex items-start gap-1.5 text-xs text-muted">
          <HelpCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            {helpText}
            {example ? (
              <>
                {' '}
                <span className="font-semibold">{t('ezbWizard.example')}:</span> <span className="italic">{example}</span>
              </>
            ) : null}
          </span>
        </p>
      )}
      {kldb && !readOnly && <KldbPicker {...kldb} />}
    </div>
  );
};

const KldbPicker = ({ url, suggestions, onPick }: { url: string; suggestions: WizardMeta['kldbSuggestions']; onPick: (code: string) => void }) => {
  const { t, i18n } = useTranslation();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(q.trim()), 300);
    return () => window.clearTimeout(id);
  }, [q]);
  const search = useQuery({
    queryKey: ['ezb-kldb', url, debounced],
    queryFn: async () => (await api.get<{ items: WizardMeta['kldbSuggestions'] }>(url, { params: { q: debounced } })).data.items,
    enabled: debounced.length >= 2,
  });
  const items = debounced.length >= 2 ? (search.data ?? []) : suggestions;
  const lang = (i18n.resolvedLanguage ?? 'de').slice(0, 2);
  const name = (o: WizardMeta['kldbSuggestions'][number]) => (lang === 'az' ? o.az : lang === 'de' ? o.de : o.en || o.de);
  return (
    <div className="mt-2 rounded-xl bg-sunken p-3">
      <label className="relative block">
        <span className="sr-only">{t('ezbWizard.kldb.search')}</span>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input className="input pl-9" value={q} placeholder={t('ezbWizard.kldb.placeholder')} onChange={(e) => setQ(e.target.value)} aria-label={t('ezbWizard.kldb.search')} />
      </label>
      {items.length ? (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={t('ezbWizard.kldb.suggestions')}>
          {items.slice(0, 8).map((o) => (
            <li key={o.code}>
              <button type="button" className="min-h-9 rounded-lg border border-line bg-card px-2.5 py-1 text-left text-xs hover:border-primary" onClick={() => onPick(o.code)} title={o.verify ? t('ezbWizard.kldb.verify') : undefined}>
                <span className="font-semibold tabular-nums">{o.code}</span> · {name(o)}
                {o.verify ? <span className="ml-1 text-muted">*</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : debounced.length >= 2 && !search.isLoading ? (
        <p className="mt-2 text-xs text-muted">{t('ezbWizard.kldb.none')}</p>
      ) : null}
      {items.some((o) => o.verify) && <p className="mt-1.5 text-[11px] text-muted">* {t('ezbWizard.kldb.verify')}</p>}
    </div>
  );
};

export default EzbWizard;
