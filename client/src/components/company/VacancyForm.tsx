import { useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Languages } from 'lucide-react';
import { LOCALES, type Locale } from '@/i18n';
import { Flag } from '@/components/ui/Flag';
import { Switch } from '@/components/admin/ui';
import { useJobLabels } from '@/components/jobs/labels';
import { EMPLOYMENT_TYPES, GERMAN_LEVELS, SECTORS, type VacancyRow } from '@/components/jobs/types';

type L10nText = Record<Locale, string>;

export interface VacancyFormState {
  title: L10nText;
  description: L10nText;
  requirements: L10nText;
  benefits: L10nText;
  sector: string;
  city: string;
  profession: string;
  germanLevel: string;
  minExperience: string;
  drivingLicence: string;
  salaryMin: string;
  salaryMax: string;
  positions: string;
  employmentType: string;
  showCompany: boolean;
  closesAt: string;
  // staff only
  companyId: string;
  visaCategoryId: string;
  slug: string;
}

const emptyL10n = (): L10nText => ({ az: '', de: '', en: '', ru: '' });
const SOURCE_ORDER: Locale[] = ['de', 'en', 'az', 'ru'];

/**
 * Languages that only repeat the source text were auto-filled by the server: show them empty
 * ("same as …") so editing the source does not leave stale copies behind.
 */
const editableL10n = (v: Record<Locale, string> | null | undefined): L10nText => {
  if (!v) return emptyL10n();
  const src = SOURCE_ORDER.find((l) => v[l]);
  const out = emptyL10n();
  for (const l of LOCALES) out[l] = v[l] && (l === src || v[l] !== v[src!]) ? v[l] : '';
  return out;
};

const listToText = (v: Record<Locale, string[]> | null | undefined): L10nText => {
  if (!v) return emptyL10n();
  return editableL10n(Object.fromEntries(LOCALES.map((l) => [l, (v[l] ?? []).join('\n')])) as L10nText);
};

export const formFromVacancy = (v?: VacancyRow | null): VacancyFormState => ({
  title: editableL10n(v?.title),
  description: editableL10n(v?.description),
  requirements: listToText(v?.requirements),
  benefits: listToText(v?.benefits),
  sector: v?.sector ?? '',
  city: v?.city ?? '',
  profession: v?.profession ?? '',
  germanLevel: v?.germanLevel ?? '',
  minExperience: v?.minExperience != null ? String(v.minExperience) : '',
  drivingLicence: v?.drivingLicence ?? '',
  salaryMin: v?.salaryMin != null ? String(v.salaryMin) : '',
  salaryMax: v?.salaryMax != null ? String(v.salaryMax) : '',
  positions: String(v?.positions ?? 1),
  employmentType: v?.employmentType ?? 'FULL_TIME',
  showCompany: v?.showCompany ?? false,
  closesAt: v?.closesAt ? v.closesAt.slice(0, 10) : '',
  companyId: v?.companyId ?? '',
  visaCategoryId: v?.visaCategoryId ?? '',
  slug: v?.slug ?? '',
});

const pickFilled = (v: L10nText) => Object.fromEntries(LOCALES.filter((l) => v[l].trim()).map((l) => [l, v[l].trim()]));
const pickLists = (v: L10nText) => {
  const out = Object.fromEntries(
    LOCALES.map((l) => [l, v[l].split('\n').map((x) => x.trim()).filter(Boolean)] as const).filter(([, items]) => items.length),
  );
  return Object.keys(out).length ? out : null;
};
const num = (s: string) => (s.trim() === '' ? null : Number(s));

/** Request body for POST/PATCH (company or staff). Empty languages are filled by the server. */
export const payloadFromForm = (f: VacancyFormState, staff: boolean) => ({
  title: pickFilled(f.title),
  description: pickFilled(f.description),
  requirements: pickLists(f.requirements),
  benefits: pickLists(f.benefits),
  sector: f.sector || null,
  city: f.city.trim() || null,
  profession: f.profession.trim() || null,
  germanLevel: f.germanLevel || null,
  minExperience: num(f.minExperience),
  drivingLicence: f.drivingLicence.trim() || null,
  salaryMin: num(f.salaryMin),
  salaryMax: num(f.salaryMax),
  positions: Number(f.positions) || 1,
  employmentType: f.employmentType,
  showCompany: f.showCompany,
  closesAt: f.closesAt || null,
  ...(staff
    ? { companyId: f.companyId || null, visaCategoryId: f.visaCategoryId || null, ...(f.slug.trim() ? { slug: f.slug.trim().toLowerCase() } : {}) }
    : {}),
});

const hasText = (v: L10nText) => LOCALES.some((l) => v[l].trim());

const Field = ({ id, label, hint, children, className }: { id: string; label: string; hint?: string; children: ReactNode; className?: string }) => (
  <div className={clsx('min-w-0', className)}>
    <label className="label" htmlFor={id}>
      {label}
    </label>
    {children}
    {hint && <p className="mt-1 text-[11px] text-muted">{hint}</p>}
  </div>
);

/**
 * Vacancy editor. Texts are edited per language (tabs); at least one language is required and the
 * others are filled with the same text until staff translate them. `extra` renders staff-only fields.
 */
export const VacancyForm = ({
  initial,
  onSubmit,
  busy,
  submitLabel,
  extra,
  formId = 'vacancy-form',
  hideSubmit,
  staff = false,
}: {
  initial: VacancyFormState;
  onSubmit: (state: VacancyFormState) => void;
  busy?: boolean;
  submitLabel: string;
  extra?: (state: VacancyFormState, set: <K extends keyof VacancyFormState>(k: K, v: VacancyFormState[K]) => void) => ReactNode;
  formId?: string;
  hideSubmit?: boolean;
  staff?: boolean;
}) => {
  const { t, i18n } = useTranslation();
  const L = useJobLabels();
  const [f, setF] = useState<VacancyFormState>(initial);
  const uiLang = (i18n.resolvedLanguage ?? 'de').slice(0, 2) as Locale;
  const [lang, setLang] = useState<Locale>(LOCALES.find((l) => initial.title[l]) ?? (staff ? 'az' : uiLang));
  const set = <K extends keyof VacancyFormState>(k: K, v: VacancyFormState[K]) => setF((s) => ({ ...s, [k]: v }));
  const setText = (k: 'title' | 'description' | 'requirements' | 'benefits', v: string) => setF((s) => ({ ...s, [k]: { ...s[k], [lang]: v } }));
  const source = SOURCE_ORDER.find((l) => f.title[l].trim());
  const salaryBad = f.salaryMin !== '' && f.salaryMax !== '' && Number(f.salaryMin) > Number(f.salaryMax);
  const valid = hasText(f.title) && hasText(f.description) && !salaryBad;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (valid) onSubmit(f);
  };

  const placeholder = (k: 'title' | 'description' | 'requirements' | 'benefits') =>
    lang !== source && source && f[k][source] ? t('jobsArea.form.sameAs', { lang: source.toUpperCase() }) : undefined;

  return (
    <form id={formId} onSubmit={submit} className="space-y-8">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm font-bold text-navy-900">
            <Languages className="size-4 text-brand-600" aria-hidden /> {t('jobsArea.form.texts')}
          </p>
          <div className="flex gap-1 rounded-xl bg-surface p-1" role="tablist" aria-label={t('jobsArea.form.language')}>
            {LOCALES.map((l) => (
              <button
                key={l}
                type="button"
                role="tab"
                aria-selected={lang === l}
                onClick={() => setLang(l)}
                className={clsx(
                  'relative inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold uppercase transition',
                  lang === l ? 'bg-white text-navy-900 shadow' : 'text-muted hover:text-navy-900',
                )}
              >
                <Flag code={l} className="h-3 w-4" /> {l}
                {f.title[l].trim() && <span className="size-1.5 rounded-full bg-emerald-500" aria-label={t('jobsArea.form.filled')} />}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted">{t(staff ? 'jobsArea.form.langHintStaff' : 'jobsArea.form.langHint')}</p>
        <Field id="vf-title" label={`${t('jobsArea.form.title')} (${lang.toUpperCase()})`}>
          <input id="vf-title" className="input" maxLength={160} value={f.title[lang]} placeholder={placeholder('title')} onChange={(e) => setText('title', e.target.value)} />
        </Field>
        <Field id="vf-desc" label={`${t('jobsArea.form.description')} (${lang.toUpperCase()})`}>
          <textarea id="vf-desc" className="input min-h-40" maxLength={8000} value={f.description[lang]} placeholder={placeholder('description')} onChange={(e) => setText('description', e.target.value)} />
        </Field>
        <div className="grid gap-4 md:grid-cols-2">
          <Field id="vf-req" label={`${t('jobsArea.form.requirements')} (${lang.toUpperCase()})`} hint={t('jobsArea.form.listHint')}>
            <textarea id="vf-req" className="input min-h-32" value={f.requirements[lang]} placeholder={placeholder('requirements')} onChange={(e) => setText('requirements', e.target.value)} />
          </Field>
          <Field id="vf-ben" label={`${t('jobsArea.form.benefits')} (${lang.toUpperCase()})`} hint={t('jobsArea.form.listHint')}>
            <textarea id="vf-ben" className="input min-h-32" value={f.benefits[lang]} placeholder={placeholder('benefits')} onChange={(e) => setText('benefits', e.target.value)} />
          </Field>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <p className="text-sm font-bold text-navy-900 sm:col-span-2 lg:col-span-3">{t('jobsArea.form.details')}</p>
        <Field id="vf-sector" label={t('jobsArea.form.sector')}>
          <select id="vf-sector" className="input" value={f.sector} onChange={(e) => set('sector', e.target.value)}>
            <option value="">—</option>
            {SECTORS.map((s) => (
              <option key={s} value={s}>
                {L.sector(s)}
              </option>
            ))}
          </select>
        </Field>
        <Field id="vf-city" label={t('jobsArea.form.city')}>
          <input id="vf-city" className="input" maxLength={80} value={f.city} onChange={(e) => set('city', e.target.value)} placeholder="Hamburg" />
        </Field>
        <Field id="vf-type" label={t('jobsArea.form.employmentType')}>
          <select id="vf-type" className="input" value={f.employmentType} onChange={(e) => set('employmentType', e.target.value)}>
            {EMPLOYMENT_TYPES.map((e) => (
              <option key={e} value={e}>
                {L.employmentType(e)}
              </option>
            ))}
          </select>
        </Field>
        <Field id="vf-prof" label={t('jobsArea.form.profession')} hint={t('jobsArea.form.professionHint')}>
          <input id="vf-prof" className="input" maxLength={120} value={f.profession} onChange={(e) => set('profession', e.target.value)} placeholder="LKW-Fahrer" />
        </Field>
        <Field id="vf-german" label={t('jobsArea.form.germanLevel')}>
          <select id="vf-german" className="input" value={f.germanLevel} onChange={(e) => set('germanLevel', e.target.value)}>
            <option value="">—</option>
            {GERMAN_LEVELS.map((g) => (
              <option key={g} value={g}>
                {L.german(g)}
              </option>
            ))}
          </select>
        </Field>
        <Field id="vf-exp" label={t('jobsArea.form.minExperience')}>
          <input id="vf-exp" type="number" min={0} max={40} inputMode="numeric" className="input" value={f.minExperience} onChange={(e) => set('minExperience', e.target.value)} />
        </Field>
        <Field id="vf-lic" label={t('jobsArea.form.drivingLicence')} hint={t('jobsArea.form.licenceHint')}>
          <input id="vf-lic" className="input" maxLength={40} value={f.drivingLicence} onChange={(e) => set('drivingLicence', e.target.value)} placeholder="CE" />
        </Field>
        <Field id="vf-smin" label={t('jobsArea.form.salaryMin')}>
          <input id="vf-smin" type="number" min={0} max={100000} step={50} inputMode="numeric" className="input" value={f.salaryMin} onChange={(e) => set('salaryMin', e.target.value)} />
        </Field>
        <Field id="vf-smax" label={t('jobsArea.form.salaryMax')}>
          <input
            id="vf-smax"
            type="number"
            min={0}
            max={100000}
            step={50}
            inputMode="numeric"
            className={clsx('input', salaryBad && 'border-danger')}
            value={f.salaryMax}
            onChange={(e) => set('salaryMax', e.target.value)}
          />
          {salaryBad && <p className="mt-1 text-[11px] text-danger">{t('jobsArea.errors.SALARY_RANGE')}</p>}
        </Field>
        <Field id="vf-pos" label={t('jobsArea.form.positions')}>
          <input id="vf-pos" type="number" min={1} max={500} inputMode="numeric" className="input" value={f.positions} onChange={(e) => set('positions', e.target.value)} />
        </Field>
        <Field id="vf-closes" label={t('jobsArea.form.closesAt')}>
          <input id="vf-closes" type="date" className="input" value={f.closesAt} min={new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)} onChange={(e) => set('closesAt', e.target.value)} />
        </Field>
        <div className="flex items-start gap-3 rounded-xl border border-line p-3 sm:col-span-2 lg:col-span-3">
          <Switch checked={f.showCompany} onChange={(v) => set('showCompany', v)} label={t('jobsArea.form.showCompany')} />
          <div>
            <p className="text-sm font-semibold text-navy-900">{t('jobsArea.form.showCompany')}</p>
            <p className="text-xs text-muted">{t('jobsArea.form.showCompanyHint')}</p>
          </div>
        </div>
      </section>

      {extra?.(f, set)}

      {!hideSubmit && (
        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={!valid || busy}>
            {submitLabel}
          </button>
        </div>
      )}
      {!valid && !salaryBad && <p className="text-right text-xs text-muted">{t('jobsArea.form.required')}</p>}
    </form>
  );
};
