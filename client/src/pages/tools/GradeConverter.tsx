import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ExternalLink, GraduationCap } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { buttonClass } from '@/components/ui/Button';
import { RelatedGuides } from '@/components/guides/RelatedGuides';
import { EmailResult } from '@/components/tools/EmailResult';
import { registerCopy } from '@/i18n';
import { pagesGradeConverter } from '@/i18n/pagesGradeConverter';
import { usePageTitle } from '@/lib/usePageTitle';
import { averageOf, convertGrade, GRADE_SYSTEMS, type GradeSystem } from '@/lib/publicCalc/grades';
import { decimal, Disclaimer, GlossaryLinks, NumField, Sources, ToolFaq, useFaq, useLng } from '@/components/tools/calc/CalcShared';

registerCopy(pagesGradeConverter);

const CHECKED = '2026-11-16';
const SOURCES = [
  { label: 'KMK – Umrechnung ausländischer Noten (modifizierte bayerische Formel), via Universität Heidelberg', url: 'https://backend.uni-heidelberg.de/de/dokumente/modifizierte-bayerische-formel-0/download' },
  { label: 'TUM – Notenumrechnung mit der Bayerischen Formel', url: 'https://www.tum.de/studium/bewerbung/infoportal-bewerbung/bayerische-formel' },
  { label: 'uni-assist – Bewerbung mit ausländischen Zeugnissen', url: 'https://www.uni-assist.de/' },
  { label: 'anabin – Bewertung ausländischer Bildungsnachweise (KMK)', url: 'https://anabin.kmk.org/' },
];

const SYSTEMS: GradeSystem[] = ['azSchool', 'azUniversity', 'custom'];
const BAND_STYLE = {
  veryGood: 'border-success-border bg-success-bg',
  good: 'border-success-border bg-success-bg',
  satisfactory: 'border-warning-border bg-warning-bg',
  sufficient: 'border-warning-border bg-warning-bg',
  fail: 'border-danger-border bg-danger-bg',
} as const;

/** /grade-converter — Azerbaijani (or any) grade → German grade 1.0 – 4.0 with the modified Bavarian formula. */
export default function GradeConverterPage() {
  const { t } = useTranslation();
  usePageTitle(t('gradeConverter.heroTitle'));
  const lng = useLng();
  const faq = useFaq('gradeConverter.faq');
  const [system, setSystem] = useState<GradeSystem>('azSchool');
  const [grade, setGrade] = useState(4.6);
  const [custom, setCustom] = useState({ max: 10, min: 5 });
  const [subjects, setSubjects] = useState('');
  const scale = system === 'custom' ? custom : GRADE_SYSTEMS[system];
  const r = useMemo(() => convertGrade(grade, scale.max, scale.min), [grade, scale.max, scale.min]);
  const avg = useMemo(
    () =>
      averageOf(
        subjects
          .split(/[\s;]+/)
          .map((s) => s.trim().replace(',', '.'))
          .filter(Boolean)
          .map(Number),
      ),
    [subjects],
  );
  const pick = (s: GradeSystem) => {
    setSystem(s);
    setGrade(s === 'azSchool' ? 4.6 : s === 'azUniversity' ? 82 : 8);
  };

  return (
    <>
      <PageHero title={t('gradeConverter.heroTitle')} subtitle={t('gradeConverter.heroSubtitle')} crumb={{ to: '/tools', label: t('siteNav.tools') }} />
      <section className="section">
        <div className="container-x grid gap-6 lg:grid-cols-[22rem_1fr] lg:items-start">
          <form className="space-y-4 rounded-3xl border border-line bg-card p-4 sm:p-5" onSubmit={(e) => e.preventDefault()} aria-labelledby="gc-form-h">
            <h2 id="gc-form-h" className="font-display text-lg font-semibold text-ink">
              {t('gradeConverter.form.title')}
            </h2>
            <fieldset>
              <legend className="label">{t('gradeConverter.form.system')}</legend>
              <div className="grid gap-2">
                {SYSTEMS.map((s) => (
                  <label
                    key={s}
                    className={clsx(
                      'flex min-h-11 cursor-pointer flex-col justify-center rounded-xl border px-3 py-1.5 text-sm font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus/40',
                      system === s ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-card text-ink hover:bg-sunken',
                    )}
                  >
                    <input type="radio" className="sr-only" name="gc-system" checked={system === s} onChange={() => pick(s)} />
                    {t(`gradeConverter.systems.${s}.label`)}
                    <span className={clsx('text-xs font-normal', system === s ? 'text-primary-contrast/90' : 'text-muted')}>{t(`gradeConverter.systems.${s}.scale`)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            {system === 'custom' && (
              <div className="grid grid-cols-2 gap-3">
                <NumField label={t('gradeConverter.form.max')} value={custom.max} max={1000} onChange={(v) => setCustom((c) => ({ ...c, max: v }))} />
                <NumField label={t('gradeConverter.form.min')} value={custom.min} max={1000} onChange={(v) => setCustom((c) => ({ ...c, min: v }))} />
              </div>
            )}
            <NumField label={t('gradeConverter.form.grade')} value={grade} max={1000} hint={t('gradeConverter.form.gradeHint', { max: scale.max, min: scale.min })} onChange={setGrade} />
            <div>
              <label htmlFor="gc-subjects" className="label">
                {t('gradeConverter.form.subjects')}
              </label>
              <textarea id="gc-subjects" className="input min-h-20" value={subjects} placeholder="5 4 5 5 4 3 5" aria-describedby="gc-subjects-hint" onChange={(e) => setSubjects(e.target.value)} />
              <p id="gc-subjects-hint" className="mt-1 text-[11px] leading-snug text-muted">
                {t('gradeConverter.form.subjectsHint')}
              </p>
              {avg != null && (
                <button type="button" className={clsx(buttonClass({ variant: 'outline', size: 'sm' }), 'mt-2')} onClick={() => setGrade(Math.round(avg * 100) / 100)}>
                  {t('gradeConverter.form.useAverage', { avg: decimal(avg, lng, 2) })}
                </button>
              )}
            </div>
          </form>

          <div className="min-w-0 space-y-4" aria-live="polite">
            {r ? (
              <div className={clsx('rounded-3xl border p-5', BAND_STYLE[r.band])}>
                <p className="text-sm font-semibold text-ink">{t('gradeConverter.result.title')}</p>
                <p className="mt-1 font-display text-5xl font-bold text-ink tabular-nums">{r.german != null ? decimal(r.german, lng, 1) : '—'}</p>
                <p className="mt-1 text-base font-semibold text-ink">
                  {t(`gradeConverter.bands.${r.band}`)}
                  {r.german != null && <span className="font-normal text-muted"> · {t(`gradeConverter.bandRange.${r.band}`)}</span>}
                </p>
                {r.passed ? (
                  <p className="mt-2 text-sm text-ink">{t('gradeConverter.result.raw', { raw: decimal(r.raw, lng, 3) })}</p>
                ) : (
                  <p className="mt-2 text-sm text-ink">{t('gradeConverter.result.fail')}</p>
                )}
              </div>
            ) : (
              <p className="rounded-2xl border border-danger-border bg-danger-bg p-3 text-sm text-danger-fg">{t('gradeConverter.result.invalid')}</p>
            )}
            {r && (
              <EmailResult
                tool="grade-converter"
                summary={[
                  { label: t('gradeConverter.form.system'), value: `${t(`gradeConverter.systems.${system}.label`)} (${scale.max}–${scale.min})` },
                  { label: t('gradeConverter.form.grade'), value: decimal(grade, lng, 2) },
                  { label: t('gradeConverter.result.title'), value: r.german != null ? decimal(r.german, lng, 1) : '—' },
                  { label: t('gradeConverter.table.de'), value: t(`gradeConverter.bands.${r.band}`) },
                  { label: t('gradeConverter.formula.title'), value: r.passed ? t('gradeConverter.result.raw', { raw: decimal(r.raw, lng, 3) }) : t('gradeConverter.result.fail') },
                ]}
              />
            )}

            <div className="rounded-3xl border border-line bg-card p-4 sm:p-5">
              <h2 className="font-display text-lg font-semibold text-ink">{t('gradeConverter.formula.title')}</h2>
              <p className="mt-2 rounded-xl bg-sunken px-3 py-2 text-center font-mono text-sm text-ink" translate="no">
                N = 1 + 3 × (N<sub>max</sub> − N<sub>d</sub>) / (N<sub>max</sub> − N<sub>min</sub>)
              </p>
              <ul className="mt-3 space-y-1.5 text-sm leading-relaxed text-muted">
                {(['max', 'min', 'd', 'cut'] as const).map((k) => (
                  <li key={k} className="flex gap-2">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                    <span>{t(`gradeConverter.formula.${k}`, { max: scale.max, min: scale.min, d: decimal(grade, lng, 2) })}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="overflow-x-auto rounded-3xl border border-line bg-card">
              <table className="w-full min-w-[20rem] border-collapse text-sm">
                <caption className="px-4 pt-3 text-left text-xs text-muted">{t('gradeConverter.table.caption')}</caption>
                <thead>
                  <tr className="border-b border-line bg-sunken text-left">
                    <th scope="col" className="px-4 py-2 font-semibold text-ink">
                      {t('gradeConverter.table.de')}
                    </th>
                    <th scope="col" className="px-4 py-2 font-semibold text-ink">
                      {t('gradeConverter.table.meaning')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {(['veryGood', 'good', 'satisfactory', 'sufficient'] as const).map((b) => (
                    <tr key={b} className={r?.band === b ? 'bg-primary/5 font-semibold' : undefined}>
                      <td className="px-4 py-2 tabular-nums">{t(`gradeConverter.bandRange.${b}`)}</td>
                      <td className="px-4 py-2">{t(`gradeConverter.bands.${b}`)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-3xl border border-line bg-card p-4 text-sm leading-relaxed text-muted sm:p-5">
              <h2 className="font-display text-lg font-semibold text-ink">{t('gradeConverter.official.title')}</h2>
              <p className="mt-1">{t('gradeConverter.official.text')}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to="/study" className={buttonClass({ variant: 'outline', size: 'sm' })}>
                  <GraduationCap className="size-4" aria-hidden /> {t('gradeConverter.actions.study')}
                </Link>
                <a href="https://www.uni-assist.de/" target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: 'ghost', size: 'sm' })}>
                  uni-assist <ExternalLink className="size-3.5" aria-hidden />
                </a>
                <Link to="/anerkennung" className={buttonClass({ variant: 'ghost', size: 'sm' })}>
                  {t('gradeConverter.actions.anerkennung')}
                </Link>
              </div>
            </div>
            <GlossaryLinks
              terms={[
                { slug: 'zeugnisbewertung', label: 'Zeugnisbewertung' },
                { slug: 'anabin', label: 'anabin' },
                { slug: 'studienkolleg', label: 'Studienkolleg' },
                { slug: 'zab', label: 'ZAB' },
                { slug: 'anerkennung', label: 'Anerkennung' },
              ]}
            />
            <Disclaimer>{t('gradeConverter.disclaimer')}</Disclaimer>
            <Sources checked={CHECKED} items={SOURCES} />
          </div>
        </div>
      </section>
      <ToolFaq items={faq} />
      <RelatedGuides tool="/grade-converter" />
    </>
  );
}
