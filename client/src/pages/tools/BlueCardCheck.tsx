import { useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BookOpen, CheckCircle2, Info, XCircle } from 'lucide-react';
import clsx from 'clsx';
import { PageHero } from '@/components/layout/PageHero';
import { PageCta } from '@/components/visa/PageCta';
import { PathLink, useGuidePath } from '@/components/guides/shared';
import { currentSiteLocale, registerCopy } from '@/i18n';
import { pagesSeo } from '@/i18n/pagesSeo';
import { BLUE_CARD_GROUPS, checkBlueCard, euroFormat, useBlueCardThresholds, type BlueCardGroup as Group } from '@/lib/calculators/blueCard';
import { usePageTitle } from '@/lib/usePageTitle';

registerCopy(pagesSeo);

const HERO = 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=2000&q=70';

/**
 * EU Blue Card salary check (/blue-card-check). The thresholds come from the server (GET /api/seo/blue-card),
 * i.e. the admin-maintained values the case checks use; nothing is duplicated in the client. The check itself
 * is shared with the compact calculator in the guides (lib/calculators/blueCard.ts).
 */
export default function BlueCardCheck() {
  const { t } = useTranslation();
  usePageTitle(t('bcCheck.title'));
  const id = useId();
  const guidePath = useGuidePath('blue-card');
  const { data } = useBlueCardThresholds();
  const [salary, setSalary] = useState('52000');
  const [period, setPeriod] = useState<'year' | 'month'>('year');
  const [group, setGroup] = useState<Group>('standard');
  const [degree, setDegree] = useState(true);
  const [contract, setContract] = useState(true);
  const [year, setYear] = useState<string>('');
  useEffect(() => {
    if (data?.year && !year) setYear(data.year);
  }, [data?.year, year]);

  const fmt = useMemo(() => euroFormat(currentSiteLocale()), [t]); // t changes with the language
  const { yearly, threshold, salaryOk, degreeOk, ok, diff } = checkBlueCard({ salary, period, group, degree, contract }, data?.thresholds, year);
  const years = data ? Object.keys(data.thresholds).sort() : [];

  return (
    <>
      <PageHero title={t('bcCheck.title')} subtitle={t('bcCheck.subtitle')} image={HERO} crumb={{ to: '/tools', label: t('siteNav.tools') }} />
      <section className="section">
        <div className="container-x grid items-start gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-10">
          <form className="card card-pad space-y-5" onSubmit={(e) => e.preventDefault()} aria-labelledby={`${id}-form`}>
            <h2 id={`${id}-form`} className="font-display text-lg font-bold text-ink">
              {t('bcCheck.form')}
            </h2>
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <div>
                <label htmlFor={`${id}-salary`} className="label">
                  {t('bcCheck.salary')}
                </label>
                <input
                  id={`${id}-salary`}
                  className="input text-base font-semibold tabular-nums"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={period === 'month' ? 50 : 500}
                  value={salary}
                  onChange={(e) => setSalary(e.target.value)}
                />
              </div>
              <fieldset>
                <legend className="label">{t('bcCheck.period')}</legend>
                <div className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-surface p-1">
                  {(['year', 'month'] as const).map((p) => (
                    <label
                      key={p}
                      className={clsx(
                        'cursor-pointer rounded-md px-3 py-1.5 text-center text-sm font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500',
                        period === p ? 'bg-brand-600 text-white shadow-sm' : 'text-muted hover:text-ink',
                      )}
                    >
                      <input type="radio" className="sr-only" name={`${id}-period`} checked={period === p} onChange={() => setPeriod(p)} />
                      {t(`bcCheck.${p}`)}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
            {period === 'month' && <p className="-mt-2 text-xs text-muted">{t('bcCheck.monthHint')}</p>}

            <fieldset>
              <legend className="label">{t('bcCheck.group')}</legend>
              <div className="grid gap-2">
                {BLUE_CARD_GROUPS.map((g) => (
                  <label
                    key={g}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3 text-sm leading-snug hover:border-brand-400 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50"
                  >
                    <input type="radio" name={`${id}-group`} className="mt-0.5 size-4 shrink-0 accent-brand-600" checked={group === g} onChange={() => setGroup(g)} />
                    <span>{t(`bcCheck.groups.${g}`)}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid gap-2">
              {group !== 'it' && (
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3 text-sm leading-snug has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
                  <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-brand-600" checked={degree} onChange={(e) => setDegree(e.target.checked)} />
                  <span>{t('bcCheck.degree')}</span>
                </label>
              )}
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3 text-sm leading-snug has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
                <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-brand-600" checked={contract} onChange={(e) => setContract(e.target.checked)} />
                <span>{t('bcCheck.contract')}</span>
              </label>
            </div>

            {years.length > 1 && (
              <div>
                <label htmlFor={`${id}-year`} className="label">
                  {t('bcCheck.yearLabel')}
                </label>
                <select id={`${id}-year`} className="input" value={year} onChange={(e) => setYear(e.target.value)}>
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </form>

          <div className="space-y-4 lg:sticky lg:top-28" aria-live="polite">
            <div className="card card-pad">
              <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">{t('bcCheck.result')}</h2>
              {threshold == null ? (
                <div className="mt-4 h-24 animate-pulse rounded-xl bg-surface" />
              ) : (
                <>
                  <dl className="mt-3 space-y-1 text-sm">
                    <dt className="sr-only">{t('bcCheck.salary')}</dt>
                    <dd className="font-display text-3xl font-extrabold text-ink tabular-nums">{t('bcCheck.yourSalary', { amount: fmt.format(yearly) })}</dd>
                    <dd className="text-muted">{t('bcCheck.threshold', { year, amount: fmt.format(threshold) })}</dd>
                  </dl>
                  <div className={clsx('mt-5 flex gap-3 rounded-xl p-4', ok ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900')}>
                    {ok ? <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden /> : <XCircle className="mt-0.5 size-5 shrink-0" aria-hidden />}
                    <div className="space-y-1 text-sm leading-relaxed">
                      <p className="font-semibold">{salaryOk ? t('bcCheck.ok') : t('bcCheck.below')}</p>
                      <p>{salaryOk ? t('bcCheck.okText', { diff: fmt.format(diff) }) : t('bcCheck.belowText', { diff: fmt.format(diff) })}</p>
                      {!degreeOk && <p>{t('bcCheck.missDegree')}</p>}
                      {!contract && <p>{t('bcCheck.missContract')}</p>}
                    </div>
                  </div>
                </>
              )}
            </div>
            <p className="flex gap-2 text-xs leading-relaxed text-muted">
              <Info className="mt-px size-3.5 shrink-0" aria-hidden /> {t('bcCheck.note')}
            </p>
            {guidePath ? (
              <PathLink path={guidePath} className="btn-outline w-full">
                <BookOpen className="size-4" aria-hidden /> {t('bcCheck.guide')}
              </PathLink>
            ) : (
              <Link to="/guides" className="btn-outline w-full">
                <BookOpen className="size-4" aria-hidden /> {t('bcCheck.guide')}
              </Link>
            )}
          </div>
        </div>
      </section>
      <PageCta
        title={t('guidesPage.ctaTitle')}
        text={t('guidesPage.ctaText')}
        primary={{ to: '/booking', label: t('guidesPage.ctaBooking') }}
        secondary={{ to: '/salary-calculator', label: t('nav.salary') }}
      />
    </>
  );
}
