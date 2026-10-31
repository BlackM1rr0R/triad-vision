import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Lock } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesPartnerRecords } from '@/i18n/pagesPartnerRecords';

registerCopy(pagesPartnerRecords);

/**
 * Legal data of an employer (Company columns) as grouped form sections — "Hüquqi məlumat", "Ünvan",
 * "İmza və rəhbərlik", "Bank" — plus a read-only view and the "data for contracts 7/10" bar. Used by the admin
 * company dialogs / drawer / profile page and (without bank) by the employer portal profile.
 */

export const LEGAL_SECTIONS = {
  legal: ['legalForm', 'registerNumber', 'registerCourt', 'betriebsnummer', 'taxNumber', 'vatId', 'foundedYear', 'employeeCount', 'collectiveAgreement'],
  address: ['street', 'postalCode', 'city', 'country'],
  signing: ['managingDirector', 'signatoryName', 'signatoryRole'],
  bank: ['bankName', 'bankAccountHolder', 'iban', 'bic'],
} as const;
export type LegalSection = keyof typeof LEGAL_SECTIONS;
export type LegalKey = (typeof LEGAL_SECTIONS)[LegalSection][number];
export const LEGAL_KEYS = Object.values(LEGAL_SECTIONS).flat() as LegalKey[];
export type LegalFormValue = Record<LegalKey, string>;

const MAX: Record<LegalKey, number> = {
  legalForm: 40,
  registerNumber: 40,
  registerCourt: 120,
  betriebsnummer: 12,
  taxNumber: 40,
  vatId: 40,
  foundedYear: 4,
  employeeCount: 8,
  collectiveAgreement: 160,
  street: 160,
  postalCode: 12,
  city: 80,
  country: 80,
  managingDirector: 160,
  signatoryName: 160,
  signatoryRole: 80,
  bankName: 120,
  bankAccountHolder: 120,
  iban: 42,
  bic: 11,
};
const NUMERIC = new Set<LegalKey>(['foundedYear', 'employeeCount']);
const WIDE = new Set<LegalKey>(['street', 'collectiveAgreement', 'registerCourt']);

export const legalFormOf = (c?: Partial<Record<string, unknown>> | null): LegalFormValue =>
  Object.fromEntries(LEGAL_KEYS.map((k) => [k, c?.[k] === null || c?.[k] === undefined ? '' : String(c[k])])) as LegalFormValue;

/** "1234 5678" → valid? (empty = valid; the field is optional) */
export const betriebsnummerInvalid = (v: string) => !!v.trim() && !/^\d{8}$/.test(v.replace(/[\s.-]+/g, ''));

/**
 * Request fields from the form: '' → null, numbers parsed. `bank: false` leaves bank data out entirely (staff
 * without the right, employer portal); masked values ("•••• 3000") are left out so they mean "unchanged".
 */
export const legalPayload = (f: LegalFormValue, opts: { bank: boolean; omit?: LegalKey[] } = { bank: false }) => {
  const out: Record<string, string | number | null> = {};
  for (const k of LEGAL_KEYS) {
    if (opts.omit?.includes(k)) continue;
    if (!opts.bank && (LEGAL_SECTIONS.bank as readonly string[]).includes(k)) continue;
    const v = f[k].trim();
    if (v.includes('•')) continue;
    out[k] = NUMERIC.has(k) ? (v && /^\d+$/.test(v) ? Number(v) : null) : v || null;
  }
  return out;
};

export interface LegalDataFormProps {
  value: LegalFormValue;
  onChange: (v: LegalFormValue) => void;
  idPrefix: string;
  /** edit (ADMIN+), locked (shown masked, read-only), hidden (employer portal). Default hidden. */
  bank?: 'edit' | 'locked' | 'hidden';
  /** Sections to show (default all but bank unless `bank` says otherwise). */
  sections?: LegalSection[];
  /** Fields rendered elsewhere by the host form. */
  omit?: LegalKey[];
  /** Fields that must be filled (e.g. city in the admin create form). */
  required?: LegalKey[];
  disabled?: boolean;
}

export function LegalDataForm({ value, onChange, idPrefix, bank = 'hidden', sections, omit = [], required = [], disabled }: LegalDataFormProps) {
  const { t } = useTranslation();
  const list = (sections ?? (['legal', 'address', 'signing', 'bank'] as LegalSection[])).filter((s) => s !== 'bank' || bank !== 'hidden');
  const hint = (k: LegalKey) =>
    k === 'betriebsnummer' ? t('partnerRecords.legal.betriebsnummerHint') : k === 'registerNumber' ? t('partnerRecords.legal.registerHint') : k === 'signatoryName' ? t('partnerRecords.legal.signatoryHint') : null;
  return (
    <div className="space-y-5">
      {list.map((s) => {
        const keys = LEGAL_SECTIONS[s].filter((k) => !omit.includes(k));
        if (!keys.length) return null;
        const locked = s === 'bank' && bank === 'locked';
        return (
          <fieldset key={s} className="grid gap-3 sm:grid-cols-2" disabled={disabled || locked}>
            <legend className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
              {t(`partnerRecords.legal.sections.${s}`)}
              {locked && (
                <span className="inline-flex items-center gap-1 text-[11px] font-normal text-muted">
                  <Lock className="size-3" aria-hidden /> {t('partnerRecords.legal.bankLocked')}
                </span>
              )}
            </legend>
            {keys.map((k) => {
              const invalid = k === 'betriebsnummer' && betriebsnummerInvalid(value[k]);
              const h = hint(k);
              return (
                <div key={k} className={WIDE.has(k) ? 'sm:col-span-2' : undefined}>
                  <label className="label" htmlFor={`${idPrefix}-${k}`}>
                    {t(`partnerRecords.fields.${k}`)}
                  </label>
                  <input
                    id={`${idPrefix}-${k}`}
                    className={clsx('input', invalid && 'border-danger focus:border-danger')}
                    inputMode={NUMERIC.has(k) || k === 'betriebsnummer' ? 'numeric' : undefined}
                    maxLength={MAX[k]}
                    required={required.includes(k)}
                    aria-invalid={invalid || undefined}
                    aria-describedby={h || invalid ? `${idPrefix}-${k}-hint` : undefined}
                    value={value[k]}
                    readOnly={locked}
                    onChange={(e) => onChange({ ...value, [k]: e.target.value })}
                  />
                  {(h || invalid) && (
                    <p id={`${idPrefix}-${k}-hint`} className={clsx('mt-1 text-[11px]', invalid ? 'text-danger-fg' : 'text-muted')}>
                      {invalid ? t('partnerRecords.errors.INVALID_BETRIEBSNUMMER') : h}
                    </p>
                  )}
                </div>
              );
            })}
          </fieldset>
        );
      })}
    </div>
  );
}

/** Read-only definition list of the filled legal data, grouped like the form. */
export function LegalDataView({ data, bank = 'hidden' }: { data: Partial<Record<string, unknown>>; bank?: 'edit' | 'locked' | 'hidden' }) {
  const { t } = useTranslation();
  const sections = (Object.keys(LEGAL_SECTIONS) as LegalSection[]).filter((s) => s !== 'bank' || bank !== 'hidden');
  return (
    <div className="grid gap-5 md:grid-cols-2">
      {sections.map((s) => (
        <section key={s}>
          <h3 className="mb-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase">{t(`partnerRecords.legal.sections.${s}`)}</h3>
          <dl className="divide-y divide-line">
            {LEGAL_SECTIONS[s].map((k) => {
              const v = data[k];
              return (
                <div key={k} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
                  <dt className="shrink-0 text-xs text-muted">{t(`partnerRecords.fields.${k}`)}</dt>
                  <dd className={clsx('min-w-0 text-right font-medium break-words', v === null || v === undefined || v === '' ? 'text-muted' : 'text-ink')}>{v === null || v === undefined || v === '' ? '—' : String(v)}</dd>
                </div>
              );
            })}
          </dl>
        </section>
      ))}
    </div>
  );
}

export interface Completeness {
  filled: number;
  total: number;
  missing: string[];
}

/** "Data for contracts 7/10" with a bar and the missing field names. */
export function CompletenessBar({ completeness, className, onFill }: { completeness: Completeness; className?: string; onFill?: () => void }) {
  const { t } = useTranslation();
  const { filled, total, missing } = completeness;
  const done = filled >= total;
  const pct = total ? Math.round((filled / total) * 100) : 100;
  return (
    <div className={clsx('rounded-lg border px-3 py-2.5', done ? 'border-success-border bg-success-bg/50' : 'border-warning-border bg-warning-bg/50', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={clsx('flex items-center gap-1.5 text-sm font-semibold', done ? 'text-success-fg' : 'text-warning-fg')}>
          {done ? <CheckCircle2 className="size-4" aria-hidden /> : <AlertTriangle className="size-4" aria-hidden />}
          {done ? t('partnerRecords.legal.complete') : t('partnerRecords.legal.completeness', { filled, total })}
        </p>
        {!done && onFill && (
          <button type="button" className="text-xs font-semibold text-link hover:underline" onClick={onFill}>
            {t('partnerRecords.contracts.template.fillProfile')}
          </button>
        )}
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuenow={filled} aria-valuemin={0} aria-valuemax={total} aria-label={t('partnerRecords.legal.completeness', { filled, total })}>
        <div className={clsx('h-full rounded-full', done ? 'bg-success' : 'bg-warning')} style={{ width: `${pct}%` }} />
      </div>
      {!done && <p className="mt-1.5 text-xs text-muted">{t('partnerRecords.legal.missing', { fields: missing.map((k) => t(`partnerRecords.fields.${k}`)).join(', ') })}</p>}
    </div>
  );
}

export default LegalDataForm;
