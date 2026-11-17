import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowRight, BookOpen, Building2, CheckCircle2, ClipboardCheck, Download, Handshake, Link2, RotateCcw, Scale, Users, XCircle } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { buttonClass } from '@/components/ui/Button';
import { RelatedGuides } from '@/components/guides/RelatedGuides';
import { copyLink, downloadResultCard } from '@/components/games/shareCard';
import { Disclaimer, GlossaryLinks, Sources, ToolFaq, useFaq } from '@/components/tools/calc/CalcShared';
import { registerCopy } from '@/i18n';
import { pagesWorkplaceEtiquette } from '@/i18n/pagesWorkplaceEtiquette';
import { useBrand } from '@/lib/brand';
import { localePath } from '@/lib/localeRouter';
import { usePageTitle } from '@/lib/usePageTitle';
import { loadProgress, pickTx, saveProgress } from '@/lib/games/common';
import { useReadyReport } from '@/lib/readyProgress/sync'; // Germany Ready: results of signed-in clients
import { ETIQUETTE_QUESTIONS, ETIQUETTE_TOTAL, gradeEtiquette, type EtiquetteQuestion, type EtiquetteResult } from '@/lib/workplaceEtiquette/questions';
import { ETIQUETTE_AS_OF, ETIQUETTE_SOURCES } from '@/lib/workplaceEtiquette/sources';

registerCopy(pagesWorkplaceEtiquette);

const PATH = '/workplace-etiquette';
const BEST_KEY = 'etiquette.best';

const useSiteLng = () => {
  const { i18n } = useTranslation();
  return (i18n.resolvedLanguage ?? 'az').slice(0, 2);
};

const GLOSSARY = [
  { slug: 'probezeit', label: 'Probezeit' },
  { slug: 'krankmeldung', label: 'Krankmeldung' },
  { slug: 'arbeitsunfaehigkeitsbescheinigung', label: 'AU-Bescheinigung' },
  { slug: 'arbeitszeit', label: 'Arbeitszeit' },
  { slug: 'ueberstunden', label: 'Überstunden' },
  { slug: 'urlaubsanspruch', label: 'Urlaubsanspruch' },
  { slug: 'betriebsrat', label: 'Betriebsrat' },
  { slug: 'arbeitszeugnis', label: 'Arbeitszeugnis' },
  { slug: 'arbeitsunfall', label: 'Arbeitsunfall' },
];

/** Law / custom chip + the sources and glossary terms of one question. */
const Explanation = ({ q, lng }: { q: EtiquetteQuestion; lng: string }) => {
  const { t } = useTranslation();
  return (
    <div className="mt-2 space-y-2 text-sm leading-relaxed text-ink">
      <p>
        <span className={clsx('mr-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', q.kind === 'law' ? 'bg-primary/10 text-primary' : 'bg-sunken text-muted')}>
          {q.kind === 'law' ? <Scale className="size-3" aria-hidden /> : <Users className="size-3" aria-hidden />} {t(`etq.kind.${q.kind}`)}
        </span>
        {pickTx(q.explain, lng)}
      </p>
      {(q.sources.length > 0 || q.glossary?.length) && (
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {q.sources.map((s) => (
            <a key={s} href={ETIQUETTE_SOURCES[s].url} target="_blank" rel="noopener noreferrer" className="font-semibold text-link hover:underline">
              {t('etq.sources')}: {ETIQUETTE_SOURCES[s].label.split(' – ')[0]}
            </a>
          ))}
          {q.glossary?.map((g) => (
            <Link key={g.slug} to={`/glossary/${g.slug}`} className="font-semibold text-link hover:underline" translate="no">
              {t('etq.glossary')}: {g.label}
            </Link>
          ))}
        </p>
      )}
    </div>
  );
};

type Phase = 'intro' | 'running' | 'result';

/**
 * /workplace-etiquette — German workplace etiquette quiz: 25 scenarios (lib/workplaceEtiquette/questions.ts) with
 * instant explanations (law vs. custom, official sources), score, full review, retry of mistakes, a share card and
 * the Germany Ready report ('workplace-etiquette', full runs only). For workers and for employers to share.
 */
export default function WorkplaceEtiquettePage() {
  const { t } = useTranslation();
  usePageTitle(t('etq.heroTitle'));
  const lng = useSiteLng();
  const brand = useBrand();
  const faq = useFaq('etq.faq');
  const report = useReadyReport();
  const [phase, setPhase] = useState<Phase>('intro');
  const [questions, setQuestions] = useState<EtiquetteQuestion[]>(ETIQUETTE_QUESTIONS);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<EtiquetteResult | null>(null);
  const [onlyMistakes, setOnlyMistakes] = useState(false);
  const [best, setBest] = useState<number | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => setBest(loadProgress<number | null>(BEST_KEY, null)), []);
  useEffect(() => {
    if (phase === 'running') headingRef.current?.focus();
  }, [index, phase]);

  const start = (pool: EtiquetteQuestion[] = ETIQUETTE_QUESTIONS) => {
    setQuestions(pool);
    setIndex(0);
    setAnswers({});
    setResult(null);
    setOnlyMistakes(false);
    setPhase('running');
  };

  const finish = () => {
    const r = gradeEtiquette(answers, questions);
    setResult(r);
    setPhase('result');
    if (r.total === ETIQUETTE_TOTAL) {
      report({ activityId: 'workplace-etiquette', score: r.correct, max: r.total }); // Germany Ready (full runs only)
      if (best === null || r.percent > best) {
        setBest(r.percent);
        saveProgress(BEST_KEY, r.percent);
      }
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const share = async () => {
    const ok = await copyLink(`${window.location.origin}${localePath(PATH)}`);
    if (ok) toast.success(t('etq.result.copied'));
    else toast.error(t('etq.result.copyFailed'));
  };
  const card = async (r: EtiquetteResult) => {
    try {
      await downloadResultCard({
        lead: t('etq.result.cardLead'),
        big: `${r.percent} %`,
        sub: t('etq.result.cardSub', { correct: r.correct, total: r.total }),
        lines: [t('etq.result.cardLine')],
        footer: t('etq.result.playAt', { domain: brand.domain, path: PATH }),
        filename: `workplace-etiquette-${r.percent}`,
      });
    } catch {
      toast.error(t('etq.result.cardFailed'));
    }
  };

  const reviewList = useMemo(() => (result && onlyMistakes ? questions.filter((q) => result.mistakes.includes(q.id)) : questions), [questions, result, onlyMistakes]);

  const q = questions[index];
  const chosen = q ? answers[q.id] : undefined;
  const answered = chosen !== undefined;

  return (
    <>
      <PageHero title={t('etq.heroTitle')} subtitle={t('etq.heroSubtitle', { n: ETIQUETTE_TOTAL })} crumb={{ to: '/tools', label: t('siteNav.tools') }} />
      <section className="section">
        <div className="container-x max-w-3xl space-y-5">
          {phase === 'intro' && (
            <div className="rounded-3xl border border-line bg-card p-5 sm:p-7">
              <Handshake className="size-8 text-primary" aria-hidden />
              <p className="mt-3 text-sm leading-relaxed text-ink">{t('etq.intro')}</p>
              {best !== null && <p className="mt-2 text-sm text-muted">{t('etq.result.score', { correct: Math.round((best / 100) * ETIQUETTE_TOTAL), total: ETIQUETTE_TOTAL, percent: best })}</p>}
              <button type="button" className={clsx(buttonClass({ size: 'lg' }), 'mt-4')} onClick={() => start()}>
                {t('etq.start')} <ArrowRight className="size-4" aria-hidden />
              </button>
              {/* Crawlable list of the situations (also a preview). */}
              <ol className="mt-5 grid gap-1.5 text-sm text-muted sm:grid-cols-2">
                {ETIQUETTE_QUESTIONS.map((x, i) => (
                  <li key={x.id} className="flex gap-2">
                    <span className="tabular-nums text-ink">{i + 1}.</span> <span className="line-clamp-2">{pickTx(x.q, lng)}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {phase === 'running' && q && (
            <section className="rounded-3xl border border-line bg-card p-4 sm:p-6" aria-labelledby="etq-q-h">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-muted">{t('etq.question', { n: index + 1, total: questions.length })}</p>
                <p className="text-xs text-muted tabular-nums">{t('etq.progress', { n: Object.keys(answers).length, total: questions.length })}</p>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={Object.keys(answers).length} aria-label={t('etq.progress', { n: Object.keys(answers).length, total: questions.length })}>
                <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${(Object.keys(answers).length / questions.length) * 100}%` }} />
              </div>
              <h2 id="etq-q-h" ref={headingRef} tabIndex={-1} className="mt-4 font-display text-lg font-semibold text-ink focus:outline-none">
                {pickTx(q.q, lng)}
              </h2>
              <fieldset className="mt-4" disabled={answered}>
                <legend className="sr-only">{t('etq.choose')}</legend>
                <div className="grid gap-2">
                  {q.options.map((o, i) => {
                    const isChosen = chosen === i;
                    const isRight = i === q.correct;
                    return (
                      <label
                        key={i}
                        className={clsx(
                          'flex min-h-12 items-start gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus/40',
                          !answered && 'cursor-pointer border-line bg-card text-ink hover:border-line-strong hover:bg-sunken',
                          answered && isRight && 'border-success-border bg-success-bg text-success-fg',
                          answered && isChosen && !isRight && 'border-danger-border bg-danger-bg text-danger-fg',
                          answered && !isRight && !isChosen && 'border-line bg-card text-muted',
                        )}
                      >
                        <input type="radio" className="sr-only" name={`etq-${q.id}`} checked={isChosen} onChange={() => setAnswers((a) => ({ ...a, [q.id]: i }))} />
                        {answered && isRight && <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />}
                        {answered && isChosen && !isRight && <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />}
                        <span>{pickTx(o, lng)}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              {answered && (
                <div className="mt-4 rounded-2xl bg-sunken p-4" aria-live="polite">
                  <p className={clsx('font-semibold', chosen === q.correct ? 'text-success-fg' : 'text-danger-fg')}>{chosen === q.correct ? t('etq.right') : t('etq.wrong')}</p>
                  <Explanation q={q} lng={lng} />
                </div>
              )}
              <div className="mt-5 flex justify-end">
                {index < questions.length - 1 ? (
                  <button type="button" className={buttonClass({ variant: answered ? 'primary' : 'outline' })} disabled={!answered} onClick={() => setIndex((i) => i + 1)}>
                    {t('etq.next')} <ArrowRight className="size-4" aria-hidden />
                  </button>
                ) : (
                  <button type="button" className={buttonClass({})} disabled={!answered} onClick={finish}>
                    <ClipboardCheck className="size-4" aria-hidden /> {t('etq.finish')}
                  </button>
                )}
              </div>
            </section>
          )}

          {phase === 'result' && result && (
            <>
              <section className={clsx('rounded-3xl border p-5 sm:p-7', result.passed ? 'border-success-border bg-success-bg' : 'border-warning-border bg-warning-bg')} aria-live="polite">
                <p className={clsx('flex items-center gap-2 font-display text-2xl font-semibold', result.passed ? 'text-success-fg' : 'text-warning-fg')}>
                  {result.passed ? <CheckCircle2 className="size-7" aria-hidden /> : <BookOpen className="size-7" aria-hidden />}
                  {result.passed ? t('etq.result.passed') : t('etq.result.failed')}
                </p>
                <p className="mt-2 text-lg font-semibold text-ink tabular-nums">{t('etq.result.score', { correct: result.correct, total: result.total, percent: result.percent })}</p>
                <p className="text-sm text-muted">{t('etq.result.passMark')}</p>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  {result.mistakes.length > 0 && (
                    <button type="button" className={buttonClass({ size: 'lg' })} onClick={() => start(questions.filter((x) => result.mistakes.includes(x.id)))}>
                      <RotateCcw className="size-4" aria-hidden /> {t('etq.result.retryMistakes')}
                    </button>
                  )}
                  <button type="button" className={buttonClass({ variant: result.mistakes.length ? 'outline' : 'primary', size: 'lg' })} onClick={() => start()}>
                    <ClipboardCheck className="size-4" aria-hidden /> {t('etq.result.restart')}
                  </button>
                  <button type="button" className={buttonClass({ variant: 'outline', size: 'lg' })} onClick={() => void card(result)}>
                    <Download className="size-4" aria-hidden /> {t('etq.result.card')}
                  </button>
                  <button type="button" className={buttonClass({ variant: 'ghost', size: 'lg' })} onClick={() => void share()}>
                    <Link2 className="size-4" aria-hidden /> {t('etq.result.share')}
                  </button>
                </div>
              </section>

              <section aria-labelledby="etq-review-h" className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 id="etq-review-h" className="font-display text-lg font-semibold text-ink">
                    {t('etq.result.review')}
                  </h2>
                  {result.mistakes.length > 0 && (
                    <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-sm font-semibold text-ink">
                      <input type="checkbox" className="size-4" checked={onlyMistakes} onChange={(e) => setOnlyMistakes(e.target.checked)} /> {t('etq.result.onlyMistakes')}
                    </label>
                  )}
                </div>
                {onlyMistakes && reviewList.length === 0 && <p className="text-sm text-muted">{t('etq.result.noMistakes')}</p>}
                <ul className="space-y-2">
                  {reviewList.map((x) => {
                    const a = answers[x.id];
                    const ok = a === x.correct;
                    return (
                      <li key={x.id} className={clsx('rounded-2xl border p-4', ok ? 'border-line bg-card' : 'border-danger-border bg-card')}>
                        <p className="font-semibold text-ink">{pickTx(x.q, lng)}</p>
                        {!ok && (
                          <p className="mt-1 flex items-start gap-1 text-sm text-danger-fg">
                            <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> {t('etq.yourAnswer', { answer: a === undefined ? t('etq.unanswered') : pickTx(x.options[a], lng) })}
                          </p>
                        )}
                        <p className="mt-1 flex items-start gap-1 text-sm font-semibold text-success-fg">
                          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /> {t('etq.rightAnswer', { answer: pickTx(x.options[x.correct], lng) })}
                        </p>
                        <Explanation q={x} lng={lng} />
                      </li>
                    );
                  })}
                </ul>
              </section>
            </>
          )}

          <section className="rounded-3xl border border-line bg-card p-5" aria-labelledby="etq-employers-h">
            <h2 id="etq-employers-h" className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
              <Building2 className="size-5 text-primary" aria-hidden /> {t('etq.employers.title')}
            </h2>
            <p className="mt-1 text-sm text-muted">{t('etq.employers.text')}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={buttonClass({ variant: 'outline', size: 'sm' })} onClick={() => void share()}>
                <Link2 className="size-4" aria-hidden /> {t('etq.result.share')}
              </button>
              <Link to="/employer-guide-azerbaijan" className={buttonClass({ variant: 'ghost', size: 'sm' })}>
                {t('etq.employers.guide')} <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
          </section>

          <h2 className="font-display text-xl font-semibold text-ink">{t('etq.note.title')}</h2>
          <GlossaryLinks terms={GLOSSARY} />
          <Sources checked={ETIQUETTE_AS_OF} items={Object.values(ETIQUETTE_SOURCES)} />
          <Disclaimer>{t('etq.note.disclaimer')}</Disclaimer>
        </div>
      </section>
      <ToolFaq items={faq} />
      <RelatedGuides tool={PATH} />
    </>
  );
}
