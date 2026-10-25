import { useId, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BookOpen, CheckCircle2, Info, Lightbulb, RotateCcw, XCircle } from 'lucide-react';
import clsx from 'clsx';
import { PageHero } from '@/components/layout/PageHero';
import { PageCta } from '@/components/visa/PageCta';
import { PathLink, useGuidePath } from '@/components/guides/shared';
import { registerCopy } from '@/i18n';
import { pagesSeo } from '@/i18n/pagesSeo';
import { usePageTitle } from '@/lib/usePageTitle';
import {
  MIN_POINTS,
  scoreChancenkarte,
  type AgeBand,
  type ChancenkarteInput,
  type EnglishLevel,
  type Experience,
  type GermanLevel,
  type Qualification,
} from '@/lib/chancenkarte';

registerCopy(pagesSeo);

const HERO = 'https://images.unsplash.com/photo-1528728329032-2972f65dfb3f?auto=format&fit=crop&w=2000&q=70';

const DEFAULTS: ChancenkarteInput = {
  qualification: 'foreign',
  shortage: false,
  german: 'A1',
  english: 'none',
  experience: 'two',
  age: 'u35',
  stay: false,
  partner: false,
  funds: true,
};

const Select = ({ id, label, value, onChange, children }: { id: string; label: string; value: string; onChange: (v: string) => void; children: ReactNode }) => (
  <div>
    <label htmlFor={id} className="label">
      {label}
    </label>
    <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      {children}
    </select>
  </div>
);

const Check = ({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) => (
  <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-line bg-card p-3.5 text-sm leading-snug text-ink transition-colors hover:border-line-strong has-[:checked]:border-primary has-[:checked]:bg-sunken">
    <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span>{children}</span>
  </label>
);

/** Chancenkarte points calculator (/chancenkarte-calculator). Runs entirely in the browser. */
export default function ChancenkarteCalculator() {
  const { t } = useTranslation();
  usePageTitle(t('ckCalc.title'));
  const id = useId();
  const [form, setForm] = useState<ChancenkarteInput>(DEFAULTS);
  const set = <K extends keyof ChancenkarteInput>(k: K, v: ChancenkarteInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const result = useMemo(() => scoreChancenkarte(form), [form]);
  const guidePath = useGuidePath('chancenkarte');

  const ok = result.status !== 'notYet';
  const pct = Math.min(100, Math.round((result.points / 14) * 100));
  const tips = [
    form.german !== 'B2' && t('ckCalc.tipGerman'),
    form.qualification === 'foreign' && t('ckCalc.tipRecognition'),
    form.english !== 'C1' && t('ckCalc.tipEnglish'),
  ].filter((x): x is string => !!x);

  return (
    <>
      <PageHero title={t('ckCalc.title')} subtitle={t('ckCalc.subtitle')} image={HERO} crumb={{ to: '/tools', label: t('siteNav.tools') }} />
      <section className="section">
        <div className="container-x grid items-start gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-10">
          <form className="card card-pad space-y-5 rounded-3xl" onSubmit={(e) => e.preventDefault()} aria-labelledby={`${id}-form`}>
            <div className="flex items-center justify-between gap-3">
              <h2 id={`${id}-form`} className="font-display text-lg font-semibold text-ink">
                {t('ckCalc.form')}
              </h2>
              <button type="button" onClick={() => setForm(DEFAULTS)} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-muted sm:min-h-10 transition-colors hover:bg-sunken hover:text-ink">
                <RotateCcw className="size-3.5" aria-hidden /> {t('ckCalc.reset')}
              </button>
            </div>

            <fieldset>
              <legend className="label">{t('ckCalc.qualification')}</legend>
              <div className="grid gap-2">
                {(['full', 'partial', 'foreign', 'none'] as Qualification[]).map((q) => (
                  <label
                    key={q}
                    className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-line bg-card p-3.5 text-sm leading-snug transition-colors hover:border-line-strong has-[:checked]:border-primary has-[:checked]:bg-sunken"
                  >
                    <input type="radio" name={`${id}-q`} className="mt-0.5 size-4 shrink-0 accent-primary" checked={form.qualification === q} onChange={() => set('qualification', q)} />
                    <span>{t(`ckCalc.qual.${q}`)}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <Select id={`${id}-de`} label={t('ckCalc.german')} value={form.german} onChange={(v) => set('german', v as GermanLevel)}>
                <option value="none">{t('ckCalc.levelNone')}</option>
                <option value="A1">A1</option>
                <option value="A2">A2</option>
                <option value="B1">B1</option>
                <option value="B2">B2 / C1 / C2</option>
              </Select>
              <Select id={`${id}-en`} label={t('ckCalc.english')} value={form.english} onChange={(v) => set('english', v as EnglishLevel)}>
                <option value="none">{t('ckCalc.englishLow')}</option>
                <option value="B2">B2</option>
                <option value="C1">C1 / C2</option>
              </Select>
              <Select id={`${id}-exp`} label={t('ckCalc.experience')} value={form.experience} onChange={(v) => set('experience', v as Experience)}>
                {(['none', 'two', 'five'] as Experience[]).map((x) => (
                  <option key={x} value={x}>
                    {t(`ckCalc.exp.${x}`)}
                  </option>
                ))}
              </Select>
              <Select id={`${id}-age`} label={t('ckCalc.age')} value={form.age} onChange={(v) => set('age', v as AgeBand)}>
                {(['u35', 'u40', 'o40'] as AgeBand[]).map((x) => (
                  <option key={x} value={x}>
                    {t(`ckCalc.ages.${x}`)}
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid gap-2">
              <Check checked={form.shortage} onChange={(v) => set('shortage', v)}>
                {t('ckCalc.shortage')}
              </Check>
              <Check checked={form.stay} onChange={(v) => set('stay', v)}>
                {t('ckCalc.stay')}
              </Check>
              <Check checked={form.partner} onChange={(v) => set('partner', v)}>
                {t('ckCalc.partner')}
              </Check>
              <Check checked={form.funds} onChange={(v) => set('funds', v)}>
                {t('ckCalc.funds')}
              </Check>
            </div>
          </form>

          <div className="space-y-4 lg:sticky lg:top-28" aria-live="polite">
            <div className="card card-pad rounded-3xl">
              <h2 className="type-overline text-muted">{t('ckCalc.result')}</h2>
              <div className="mt-3 flex items-end justify-between gap-3">
                <p className="font-display text-4xl font-semibold text-ink tabular-nums">{t('ckCalc.points', { count: result.points })}</p>
                <p className="pb-1 text-xs text-muted">{t('ckCalc.of')}</p>
              </div>
              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-sunken" aria-hidden>
                <div className={clsx('h-full rounded-full transition-all', result.points >= MIN_POINTS ? 'bg-success' : 'bg-warning')} style={{ width: `${pct}%` }} />
              </div>

              <div className={clsx('mt-5 flex gap-3 rounded-xl p-4', ok ? 'bg-success-bg text-success-fg' : 'bg-warning-bg text-warning-fg')}>
                {ok ? <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden /> : <XCircle className="mt-0.5 size-5 shrink-0" aria-hidden />}
                <div>
                  <p className="font-semibold">{t(`ckCalc.${result.status}`)}</p>
                  <p className="mt-1 text-sm leading-relaxed">{t(`ckCalc.${result.status}Text`)}</p>
                </div>
              </div>

              {result.missing.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm font-semibold text-ink">{t('ckCalc.missing')}</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink/80">
                    {result.missing.map((m) => (
                      <li key={m}>{m === 'points' ? t('ckCalc.missPoints', { count: result.pointsShort }) : t(`ckCalc.miss${m[0].toUpperCase()}${m.slice(1)}`)}</li>
                    ))}
                  </ul>
                </div>
              )}

              {form.qualification !== 'full' && (
                <div className="mt-5 border-t border-line pt-4">
                  <p className="text-sm font-semibold text-ink">{t('ckCalc.breakdown')}</p>
                  <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
                    {result.rows.map((r) => (
                      <div key={r.row} className="contents">
                        <dt className="text-muted">{t(`ckCalc.rows.${r.row}`)}</dt>
                        <dd className={clsx('text-right font-semibold tabular-nums', r.points ? 'text-ink' : 'text-muted')}>+{r.points}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
            </div>

            {result.status === 'notYet' && tips.length > 0 && (
              <div className="card card-pad">
                <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <Lightbulb className="size-4 text-highlight-fg" aria-hidden /> {t('ckCalc.tips')}
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink/80">
                  {tips.map((tip) => (
                    <li key={tip}>{tip}</li>
                  ))}
                </ul>
              </div>
            )}

            <p className="flex gap-2 text-xs leading-relaxed text-muted">
              <Info className="mt-px size-3.5 shrink-0" aria-hidden /> {t('ckCalc.note')}
            </p>
            {guidePath ? (
              <PathLink path={guidePath} className="btn-secondary w-full">
                <BookOpen className="size-4" aria-hidden /> {t('ckCalc.guide')}
              </PathLink>
            ) : (
              <Link to="/guides" className="btn-secondary w-full">
                <BookOpen className="size-4" aria-hidden /> {t('ckCalc.guide')}
              </Link>
            )}
          </div>
        </div>
      </section>
      <PageCta
        title={t('guidesPage.ctaTitle')}
        text={t('guidesPage.ctaText')}
        primary={{ to: '/booking', label: t('guidesPage.ctaBooking') }}
        secondary={{ to: '/eligibility', label: t('guidesPage.ctaEligibility') }}
      />
    </>
  );
}
