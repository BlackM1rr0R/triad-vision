import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowRight, BookOpen, CalendarCheck, Download, Ear, ExternalLink, Flag, Info, Mic, PenLine, RotateCcw, Target, type LucideIcon } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { buttonClass } from '@/components/ui/Button';
import { RelatedGuides } from '@/components/guides/RelatedGuides';
import { EmailResult } from '@/components/tools/EmailResult';
import { GlossaryChips } from '@/components/glossary/GlossaryChips';
import { downloadResultCard } from '@/components/games/shareCard';
import { registerCopy } from '@/i18n';
import { pagesLevelSelf } from '@/i18n/pagesLevelSelf';
import { usePageTitle } from '@/lib/usePageTitle';
import { loadProgress, saveProgress } from '@/lib/games/common';
import { useReadyReport } from '@/lib/readyProgress/sync'; // Germany Ready: results of signed-in clients
import { LEVEL_SELF_FAQ } from '@/lib/germanExam/faq';
import {
  LEVEL_UE,
  MAX_PLAN_WEEKS,
  SKILLS,
  STATEMENTS,
  activityLink,
  buildPlan,
  estimateAll,
  hoursBetween,
  levelIndex,
  nextLevel,
  overallLevel,
  targetsAbove,
  typicalWeeks,
  ueBetween,
  weakestFirst,
  weeksFor,
  type Answer,
  type EstLevel,
  type Skill,
  type TargetLevel,
} from '@/lib/germanExam/selfAssessment';

registerCopy(pagesLevelSelf);

const PATH = '/german-level-test-self';
const STORE = 'levelSelf.v1';
const SKILL_ICON: Record<Skill, LucideIcon> = { listening: Ear, reading: BookOpen, speaking: Mic, writing: PenLine };
const CEFR_GRID = 'https://www.coe.int/en/web/common-european-framework-reference-languages/table-2-cefr-3.3-common-reference-levels-self-assessment-grid';
const GOETHE_FAQ = 'https://www.goethe.de/ins/gb/en/sta/lon/kur/faq.html';
const SHOWN_WEEKS = 8;

interface Stored {
  answers: Record<string, Answer>;
  hoursPerDay: number;
  daysPerWeek: number;
  target: TargetLevel | null;
  shown: boolean;
}
const DEFAULTS: Stored = { answers: {}, hoursPerDay: 1, daysPerWeek: 5, target: null, shown: false };

const sanitize = (raw: unknown): Stored => {
  if (!raw || typeof raw !== 'object') return DEFAULTS;
  const r = raw as Partial<Stored>;
  const answers = Object.fromEntries(Object.entries(r.answers ?? {}).filter(([k, v]) => STATEMENTS.some((s) => s.id === k) && (v === 0 || v === 1 || v === 2))) as Record<string, Answer>;
  const hpd = typeof r.hoursPerDay === 'number' && r.hoursPerDay > 0 && r.hoursPerDay <= 12 ? r.hoursPerDay : DEFAULTS.hoursPerDay;
  const dpw = typeof r.daysPerWeek === 'number' && r.daysPerWeek >= 1 && r.daysPerWeek <= 7 ? Math.round(r.daysPerWeek) : DEFAULTS.daysPerWeek;
  const target = typeof r.target === 'string' && ['A1', 'A2', 'B1', 'B2', 'C1'].includes(r.target) ? (r.target as TargetLevel) : null;
  return { answers, hoursPerDay: hpd, daysPerWeek: dpw, target, shown: !!r.shown };
};

const levelLabel = (t: (k: string) => string, l: EstLevel | TargetLevel) => t(`levelSelf.levels.${l}`);

/** /german-level-test-self — CEFR "can do" self-assessment → level per skill and overall → study plan. */
export default function GermanLevelSelfPage() {
  const { t, i18n } = useTranslation();
  usePageTitle(t('levelSelf.heroTitle'));
  const lng = (i18n.resolvedLanguage ?? 'az').slice(0, 2) as keyof typeof LEVEL_SELF_FAQ;
  const faq = LEVEL_SELF_FAQ[lng] ?? LEVEL_SELF_FAQ.en;
  const [st, setSt] = useState<Stored>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [allWeeks, setAllWeeks] = useState(false);
  const resultRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setSt(sanitize(loadProgress<unknown>(STORE, null)));
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded) saveProgress(STORE, st);
  }, [st, loaded]);

  const answered = Object.keys(st.answers).length;
  const bySkill = useMemo(() => estimateAll(st.answers), [st.answers]);
  const overall = overallLevel(bySkill);
  const weakest = weakestFirst(bySkill)[0];
  const targets = targetsAbove(overall);
  const target: TargetLevel = st.target && targets.includes(st.target) ? st.target : nextLevel(overall);
  const hours = hoursBetween(overall, target);
  const weeks = weeksFor(hours, st.hoursPerDay, st.daysPerWeek);
  const planWeeks = weeks ? typicalWeeks(weeks) : 0;
  const plan = useMemo(() => (weeks && planWeeks > 0 ? buildPlan(bySkill, planWeeks) : []), [bySkill, weeks, planWeeks]);
  const perWeek = Math.round(st.hoursPerDay * st.daysPerWeek * 10) / 10;

  const setAnswer = (id: string, a: Answer) => setSt((s) => ({ ...s, answers: { ...s.answers, [id]: a } }));
  const report = useReadyReport();
  const show = () => {
    setSt((s) => ({ ...s, shown: true }));
    // Germany Ready sync (signed-in clients): the estimate as a rank 0 (pre-A1) … 4 (B2), once per answer set.
    report({ activityId: 'level-self', score: levelIndex(overall), max: 4, dedupeKey: `levelSelf:${overall}:${answered}` });
    window.requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const card = async () => {
    try {
      await downloadResultCard({
        lead: t('levelSelf.result.cardLead'),
        big: levelLabel(t, overall),
        sub: t('levelSelf.result.overall'),
        lines: SKILLS.map((s) => `${t(`levelSelf.skills.${s}`)}: ${levelLabel(t, bySkill[s])}`),
        footer: t('levelSelf.result.cardFooter'),
        filename: 'german-level',
      });
    } catch {
      toast.error(t('levelSelf.result.cardFailed'));
    }
  };

  return (
    <>
      <PageHero title={t('levelSelf.heroTitle')} subtitle={t('levelSelf.heroSubtitle')} crumb={{ to: '/tools', label: t('siteNav.tools') }} />
      <section className="section">
        <div className="container-x max-w-4xl space-y-6">
          <p className="text-sm text-muted">{t('levelSelf.intro')}</p>

          <form onSubmit={(e) => e.preventDefault()} className="space-y-5">
            {SKILLS.map((skill) => {
              const I = SKILL_ICON[skill];
              return (
                <section key={skill} aria-labelledby={`ls-${skill}`} className="rounded-3xl border border-line bg-card p-4 sm:p-5">
                  <h2 id={`ls-${skill}`} className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
                    <I className="size-5 text-primary" aria-hidden /> {t(`levelSelf.skills.${skill}`)}
                  </h2>
                  <ol className="mt-3 space-y-3">
                    {STATEMENTS.filter((s) => s.skill === skill).map((s) => (
                      <li key={s.id}>
                        <fieldset className="rounded-2xl border border-line p-3">
                          <legend className="sr-only">{t(`levelSelf.statements.${s.id}`)}</legend>
                          <p className="text-sm leading-relaxed text-ink" aria-hidden>
                            <span className="mr-2 rounded-md bg-sunken px-1.5 py-0.5 text-[11px] font-semibold text-muted">{s.level}</span>
                            {t(`levelSelf.statements.${s.id}`)}
                          </p>
                          <div className="mt-2 grid grid-cols-3 gap-2">
                            {([0, 1, 2] as const).map((a) => (
                              <label
                                key={a}
                                className={clsx(
                                  'flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-2 py-1.5 text-center text-xs font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus/40 sm:text-sm',
                                  st.answers[s.id] === a ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-card text-ink hover:border-line-strong hover:bg-sunken',
                                )}
                              >
                                <input type="radio" className="sr-only" name={s.id} checked={st.answers[s.id] === a} onChange={() => setAnswer(s.id, a)} />
                                {t(`levelSelf.answers.a${a}`)}
                              </label>
                            ))}
                          </div>
                        </fieldset>
                      </li>
                    ))}
                  </ol>
                </section>
              );
            })}
            <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-card/95 p-3 shadow-[var(--tv-shadow-raised)] backdrop-blur">
              <div className="min-w-40 flex-1">
                <p className="text-xs font-semibold text-muted tabular-nums">{t('levelSelf.progress', { n: answered, total: STATEMENTS.length })}</p>
                <div className="mt-1 h-2 rounded-full bg-sunken" aria-hidden>
                  <div className="h-2 rounded-full bg-primary transition-[width]" style={{ width: `${(answered / STATEMENTS.length) * 100}%` }} />
                </div>
              </div>
              <button type="button" className={buttonClass()} onClick={show} disabled={!answered}>
                <Target className="size-4" aria-hidden /> {t('levelSelf.showResult')}
              </button>
            </div>
          </form>

          {st.shown && answered > 0 && (
            <>
              <section ref={resultRef} aria-labelledby="ls-result-h" className="scroll-mt-24 rounded-3xl border border-primary/30 bg-card p-5 shadow-[var(--tv-shadow-raised)] sm:p-7" aria-live="polite">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 id="ls-result-h" className="text-sm font-semibold text-muted">
                      {t('levelSelf.result.title')}
                    </h2>
                    <p className="mt-1 font-display text-4xl font-semibold text-ink">
                      {levelLabel(t, overall)} <span className="text-lg font-normal text-muted">· {t(`levelSelf.levelNames.${overall}`)}</span>
                    </p>
                    <p className="text-sm text-muted">{t('levelSelf.result.overall')}</p>
                  </div>
                  <button type="button" className={buttonClass({ variant: 'outline', size: 'sm' })} onClick={() => void card()}>
                    <Download className="size-4" aria-hidden /> {t('levelSelf.result.download')}
                  </button>
                </div>
                <h3 className="mt-5 text-sm font-semibold text-ink">{t('levelSelf.result.perSkill')}</h3>
                <ul className="mt-2 space-y-2">
                  {SKILLS.map((s) => {
                    const I = SKILL_ICON[s];
                    const idx = levelIndex(bySkill[s]);
                    return (
                      <li key={s} className="grid grid-cols-[8rem_1fr_3.5rem] items-center gap-3 text-sm sm:grid-cols-[10rem_1fr_4rem]">
                        <span className="flex items-center gap-2 font-semibold text-ink">
                          <I className="size-4 text-primary" aria-hidden /> {t(`levelSelf.skills.${s}`)}
                        </span>
                        <span className="h-3 rounded-full bg-sunken" aria-hidden>
                          <span className={clsx('block h-3 rounded-full', s === weakest ? 'bg-warning-fg' : 'bg-primary')} style={{ width: `${Math.max(4, (idx / 4) * 100)}%` }} />
                        </span>
                        <span className="text-right font-semibold tabular-nums text-ink">{levelLabel(t, bySkill[s])}</span>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3 text-sm font-semibold text-ink">{t('levelSelf.result.weakest', { skill: t(`levelSelf.skills.${weakest}`) })}</p>
                <p className="mt-2 text-xs text-muted">{t('levelSelf.result.note')}</p>
              </section>
              <EmailResult
                tool="german-level-test-self"
                countUse="mount"
                summary={[
                  { label: t('levelSelf.result.overall'), value: `${levelLabel(t, overall)} · ${t(`levelSelf.levelNames.${overall}`)}` },
                  ...SKILLS.map((s) => ({ label: t(`levelSelf.skills.${s}`), value: levelLabel(t, bySkill[s]) })),
                  { label: t('levelSelf.result.perSkill'), value: t('levelSelf.result.weakest', { skill: t(`levelSelf.skills.${weakest}`) }) },
                ]}
              />

              <section aria-labelledby="ls-plan-h" className="space-y-4 rounded-3xl border border-line bg-card p-5 sm:p-7">
                <h2 id="ls-plan-h" className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
                  <CalendarCheck className="size-5 text-primary" aria-hidden /> {t('levelSelf.plan.title')}
                </h2>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label htmlFor="ls-target" className="label">
                      {t('levelSelf.plan.target')}
                    </label>
                    <select id="ls-target" className="input" value={target} onChange={(e) => setSt((s) => ({ ...s, target: e.target.value as TargetLevel }))}>
                      {targets.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="ls-hpd" className="label">
                      {t('levelSelf.plan.hoursPerDay')}
                    </label>
                    <input
                      id="ls-hpd"
                      type="number"
                      inputMode="decimal"
                      className="input"
                      min={0.25}
                      max={12}
                      step={0.25}
                      value={st.hoursPerDay}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setSt((s) => ({ ...s, hoursPerDay: Number.isFinite(v) ? Math.max(0, Math.min(12, v)) : s.hoursPerDay }));
                      }}
                    />
                  </div>
                  <div>
                    <label htmlFor="ls-dpw" className="label">
                      {t('levelSelf.plan.daysPerWeek')}
                    </label>
                    <select id="ls-dpw" className="input" value={st.daysPerWeek} onChange={(e) => setSt((s) => ({ ...s, daysPerWeek: Number(e.target.value) }))}>
                      {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {hours[1] === 0 ? (
                  <p className="text-sm text-ink">{t('levelSelf.plan.reached')}</p>
                ) : (
                  <div className="space-y-1 text-sm text-ink">
                    <p>
                      {t('levelSelf.plan.hours', {
                        min: hours[0],
                        max: hours[1],
                        ueMin: ueBetween(overall, target)[0],
                        ueMax: ueBetween(overall, target)[1],
                        target,
                      })}
                    </p>
                    <p className="font-display text-xl font-semibold">{weeks ? t('levelSelf.plan.weeks', { perWeek, min: weeks[0], max: weeks[1] }) : t('levelSelf.plan.noTime')}</p>
                    <p className="text-xs text-muted">{t('levelSelf.plan.estimate')}</p>
                  </div>
                )}
                {plan.length > 0 && (
                  <>
                    <ol className="grid gap-2 sm:grid-cols-2">
                      {(allWeeks ? plan : plan.slice(0, SHOWN_WEEKS)).map((w) => (
                        <li key={w.week} className={clsx('rounded-2xl border p-3', w.milestone ? 'border-primary/40 bg-sunken' : 'border-line')}>
                          <p className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-ink">
                            <span>{t('levelSelf.plan.week', { n: w.week })}</span>
                            <span className="text-xs font-normal text-muted">{t('levelSelf.plan.focus', { skill: t(`levelSelf.skills.${w.focus}`) })}</span>
                          </p>
                          {w.milestone && (
                            <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-primary">
                              <Flag className="size-3.5" aria-hidden /> {t(w.milestone === 'final' ? 'levelSelf.plan.final' : 'levelSelf.plan.check')}
                            </p>
                          )}
                          <ul className="mt-2 space-y-1">
                            {w.activities.map((a) => (
                              <li key={a}>
                                <Link to={activityLink(a, target)} className="inline-flex min-h-8 items-center gap-1 text-sm text-link hover:underline">
                                  <ArrowRight className="size-3.5 shrink-0" aria-hidden /> {t(`levelSelf.activities.${a}`)}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ol>
                    {plan.length > SHOWN_WEEKS && (
                      <button type="button" className={buttonClass({ variant: 'ghost', size: 'sm' })} aria-expanded={allWeeks} onClick={() => setAllWeeks((v) => !v)}>
                        {allWeeks ? t('levelSelf.plan.showLess') : t('levelSelf.plan.showAll', { n: plan.length })}
                      </button>
                    )}
                    {weeks && typicalWeeks(weeks) > MAX_PLAN_WEEKS && <p className="text-xs text-muted">{t('levelSelf.plan.capped', { n: MAX_PLAN_WEEKS })}</p>}
                  </>
                )}
                <button
                  type="button"
                  className={buttonClass({ variant: 'ghost', size: 'sm' })}
                  onClick={() => {
                    setSt(DEFAULTS);
                    setAllWeeks(false);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  <RotateCcw className="size-4" aria-hidden /> {t('levelSelf.reset')}
                </button>
              </section>
            </>
          )}

          <div className="grid gap-2 sm:grid-cols-3">
            {[
              { to: '/german-mock-exam/a1', label: t('levelSelf.links.mockA1') },
              { to: '/german-mock-exam/b1', label: t('levelSelf.links.mockB1') },
              { to: '/account/german', label: t('levelSelf.links.account') },
            ].map((l) => (
              <Link key={l.to} to={l.to} className="flex min-h-12 items-center justify-between gap-2 rounded-2xl border border-line bg-card px-4 py-3 text-sm font-semibold text-ink hover:border-line-strong hover:bg-sunken">
                {l.label} <ArrowRight className="size-4 shrink-0" aria-hidden />
              </Link>
            ))}
          </div>

          <section aria-labelledby="ls-method-h" className="space-y-2 text-sm leading-relaxed text-ink">
            <h2 id="ls-method-h" className="font-display text-xl font-semibold">
              {t('levelSelf.method.title')}
            </h2>
            <p>{t('levelSelf.method.cefr')}</p>
            <p>{t('levelSelf.method.hours')}</p>
            <ul className="space-y-1">
              <li>
                <a href={CEFR_GRID} className="inline-flex items-center gap-1 font-semibold text-link hover:underline" target="_blank" rel="noopener noreferrer">
                  {t('levelSelf.method.cefrSource')} <ExternalLink className="size-3.5" aria-hidden />
                </a>{' '}
                <span className="text-xs text-muted">© Council of Europe</span>
              </li>
              <li>
                <a href={GOETHE_FAQ} className="inline-flex items-center gap-1 font-semibold text-link hover:underline" target="_blank" rel="noopener noreferrer">
                  {t('levelSelf.method.hoursSource')} <ExternalLink className="size-3.5" aria-hidden />
                </a>
              </li>
            </ul>
            <p className="text-xs text-muted">
              {t('levelSelf.method.asOf')} UE: {Object.entries(LEVEL_UE)
                .map(([l, [a, b]]) => `${l} ${a}–${b}`)
                .join(' · ')}
            </p>
            <p className="flex items-start gap-2 rounded-2xl border border-warning-border bg-warning-bg p-3 text-warning-fg" role="note">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> {t('levelSelf.result.note')}
            </p>
            <GlossaryChips slugs={['sprachzertifikat', 'integrationskurs']} />
          </section>

          <section aria-labelledby="ls-faq-h" className="space-y-3">
            <h2 id="ls-faq-h" className="font-display text-xl font-semibold text-ink">
              {t('levelSelf.faqTitle')}
            </h2>
            {faq.map((f) => (
              <details key={f.q} className="group rounded-2xl border border-line bg-card p-4">
                <summary className="cursor-pointer list-none font-semibold text-ink marker:hidden">
                  <span className="flex items-start justify-between gap-3">
                    {f.q} <ArrowRight className="mt-1 size-4 shrink-0 transition-transform group-open:rotate-90" aria-hidden />
                  </span>
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-ink">{f.a}</p>
              </details>
            ))}
          </section>
        </div>
      </section>
      <RelatedGuides tool={PATH} />
    </>
  );
}
