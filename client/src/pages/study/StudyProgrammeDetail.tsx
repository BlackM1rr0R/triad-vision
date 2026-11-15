import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, CalendarClock, ExternalLink, Send } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesStudy } from '@/i18n/pagesStudy';
import { PageHero, PageHeroSkeleton } from '@/components/layout/PageHero';
import { buttonClass } from '@/components/ui/Button';
import { DeadlineLine, StudyCard, useDaysLeft, useStudyDate } from '@/components/study/StudyCard';
import { StudyApplyForm } from '@/components/study/StudyApplyForm';
import { euro, intakeLabel, STUDY_STATES, type StudyDetailResponse } from '@/lib/study';
import NotFound from '../NotFound';

registerCopy(pagesStudy);

const HERO = 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&w=2000&q=70';

const Fact = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="border-b border-line py-3 last:border-0 sm:grid sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
    <dt className="text-sm text-muted">{label}</dt>
    <dd className="mt-0.5 font-semibold break-words text-ink sm:mt-0">{children}</dd>
  </div>
);

/** /study/:slug — one programme: facts, deadlines with countdown, official link, "apply via Triad Vision". */
export default function StudyProgrammeDetail() {
  const { slug = '' } = useParams();
  const { t } = useTranslation();
  const { tr, trList } = useL10n();
  const fmt = useStudyDate();
  const left = useDaysLeft();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['study-programme', slug],
    queryFn: async () => (await api.get<StudyDetailResponse>(`/study/programmes/${encodeURIComponent(slug)}`)).data,
    retry: false,
    staleTime: 60_000,
  });
  usePageTitle(data?.programme.name ?? t('study.hero.title'));

  if (isLoading) return <PageHeroSkeleton />;
  if (isError || !data) return <NotFound />;
  const p = data.programme;
  const description = tr(p.description);
  const requirements = trList(p.requirements);
  // The year of "today" for the intake choices: from the server's computation, never the browser clock.
  const todayYear = Number(data.today.slice(0, 4));

  return (
    <>
      <PageHero title={p.name} subtitle={`${p.university} · ${p.city}`} image={HERO} crumb={{ to: '/study', label: t('study.detail.back') }} />
      <section className="section">
        <div className="container-x grid items-start gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-10">
          <div className="min-w-0 space-y-6">
            <Link to="/study" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
              <ArrowLeft className="size-4" aria-hidden /> {t('study.detail.back')}
            </Link>

            <div className="card card-pad rounded-3xl">
              <h2 className="font-display text-xl font-semibold text-ink">{t('study.detail.facts')}</h2>
              <dl className="mt-2">
                <Fact label={t('study.detail.university')}>{p.university}</Fact>
                <Fact label={t('study.detail.city')}>
                  {p.city}, {STUDY_STATES[p.federalState] ?? p.federalState}
                </Fact>
                <Fact label={t('study.detail.degree')}>{t(`study.degree.${p.degree}`)}</Fact>
                <Fact label={t('study.detail.language')}>{t(`study.lang.${p.teachingLanguage}`)}</Fact>
                {p.languageRequirement && <Fact label={t('study.detail.languageReq')}>{p.languageRequirement}</Fact>}
                <Fact label={t('study.detail.duration')}>{t('study.card.semesters', { n: p.durationSemesters })}</Fact>
                <Fact label={t('study.detail.tuition')}>{p.tuitionPerSemester > 0 ? t('study.card.tuition', { amount: euro(p.tuitionPerSemester) }) : t('study.card.free')}</Fact>
                {p.semesterContribution != null && <Fact label={t('study.detail.contribution')}>{euro(p.semesterContribution)}</Fact>}
                <Fact label={t('study.detail.route')}>{t(`study.route.${p.applicationRoute}`)}</Fact>
              </dl>
            </div>

            <div className="card card-pad rounded-3xl">
              <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
                <CalendarClock className="size-5 text-muted" aria-hidden /> {t('study.detail.deadlines')}
              </h2>
              <p className="mt-1 text-sm text-muted">{t('study.detail.deadlinesHint')}</p>
              {p.deadlines.length ? (
                <ul className="mt-4 space-y-3">
                  {p.deadlines.map((d) => (
                    <li key={`${d.intake}-${d.to}-${d.note ?? ''}`} className="rounded-2xl border border-line p-4">
                      <p className="font-semibold text-ink">
                        {intakeLabel(t, d.intake, d.intakeYear)}
                        {d.note && <span className="ml-2 text-sm font-normal text-muted">({d.note})</span>}
                      </p>
                      <p className="mt-1 text-sm text-ink">
                        {d.opens
                          ? t('study.detail.window', { from: fmt(d.opens), to: fmt(d.closes) })
                          : t('study.detail.until', { date: fmt(d.closes) })}
                      </p>
                      <p className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                        <span className={d.daysLeft <= 30 ? 'rounded-full bg-warning-bg px-2 py-0.5 text-warning-fg' : 'rounded-full bg-sunken px-2 py-0.5 text-muted'}>{left(d)}</span>
                        {d.open === true && <span className="rounded-full bg-success-bg px-2 py-0.5 text-success-fg">{t('study.card.open')}</span>}
                        {d.open === false && d.opens && <span className="rounded-full bg-sunken px-2 py-0.5 text-muted">{t('study.card.opens', { date: fmt(d.opens) })}</span>}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <DeadlineLine d={null} className="mt-3" />
              )}
            </div>

            {(description || requirements.length > 0) && (
              <div className="card card-pad space-y-4 rounded-3xl">
                {description && (
                  <div>
                    <h2 className="font-display text-xl font-semibold text-ink">{t('study.detail.about')}</h2>
                    {description.split(/\n\s*\n/).map((para, i) => (
                      <p key={i} className="mt-2 whitespace-pre-line text-ink">
                        {para}
                      </p>
                    ))}
                  </div>
                )}
                {requirements.length > 0 && (
                  <div>
                    <h2 className="font-display text-xl font-semibold text-ink">{t('study.detail.requirements')}</h2>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-ink">
                      {requirements.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="rounded-3xl border border-line bg-sunken p-5">
              <a href={p.officialUrl} target="_blank" rel="nofollow noopener noreferrer" className={buttonClass({ variant: 'outline' })}>
                {t('study.detail.official')} <ExternalLink className="size-4" aria-hidden />
                <span className="sr-only">{t('study.detail.newTab')}</span>
              </a>
              <p className="mt-3 text-sm text-muted">{t('study.detail.officialHint')}</p>
              <p className="mt-1 text-xs text-muted">
                {t('study.detail.updated')}: <time dateTime={p.updatedAt.slice(0, 10)}>{fmt(p.updatedAt.slice(0, 10))}</time>
              </p>
            </div>
          </div>

          <aside id="apply" className="card card-pad scroll-mt-28 rounded-3xl lg:sticky lg:top-28">
            <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
              <Send className="size-5 text-muted" aria-hidden /> {t('study.detail.apply')}
            </h2>
            <p className="mt-1 text-sm text-muted">{t('study.detail.applyText')}</p>
            {p.nextDeadline && (
              <div className="mt-3 rounded-2xl bg-sunken p-3">
                <p className="text-xs text-muted">{t('study.card.nextDeadline')}</p>
                <DeadlineLine d={p.nextDeadline} soon={p.soon} className="mt-1" />
              </div>
            )}
            <div className="mt-5">
              <StudyApplyForm programme={p} todayYear={todayYear} />
            </div>
          </aside>
        </div>
      </section>

      {data.related.length > 0 && (
        <section className="section-sm bg-sunken">
          <div className="container-x">
            <h2 className="font-display text-2xl font-semibold text-ink">{t('study.detail.others')}</h2>
            <ul className="grid-cards cards-balanced mt-5 grid-cols-1 [--cols:1] md:[--cols:2] xl:[--cols:4]">
              {data.related.map((r) => (
                <li key={r.slug}>
                  <StudyCard p={r} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </>
  );
}
