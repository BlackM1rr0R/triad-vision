import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, ClipboardCheck, Download, Info, Link2, RotateCcw, Timer, XCircle } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { buttonClass } from '@/components/ui/Button';
import { RelatedGuides } from '@/components/guides/RelatedGuides';
import { GameLinks } from '@/components/games/GameLinks';
import { copyLink, downloadResultCard } from '@/components/games/shareCard';
import { registerCopy } from '@/i18n';
import { pagesGames } from '@/i18n/pagesGames';
import { pagesTrafficSigns } from '@/i18n/pagesTrafficSigns';
import { useBrand } from '@/lib/brand';
import { localePath } from '@/lib/localeRouter';
import { usePageTitle } from '@/lib/usePageTitle';
import { loadProgress, mmss, pickTx, saveProgress } from '@/lib/games/common';
import { useReadyReport } from '@/lib/readyProgress/sync'; // Germany Ready: results of signed-in clients
import {
  EXAM_SECONDS,
  EXAM_SIZE,
  SIGN_BY_ID,
  SIGN_CATEGORIES,
  SIGN_SOURCES,
  SIGNS,
  SIGNS_AS_OF,
  buildExam,
  grade,
  passMark,
  signsByCategory,
  type ExamQuestion,
  type ExamResult,
  type Sign,
  type SignCategory,
} from '@/lib/games/trafficSigns/signs';

registerCopy(pagesGames);
registerCopy(pagesTrafficSigns);

const PATH = '/traffic-signs';
const KNOWN_KEY = 'signs.known';
const BEST_KEY = 'signs.best';

const useLng = () => {
  const { i18n } = useTranslation();
  return (i18n.resolvedLanguage ?? 'az').slice(0, 2);
};

const SignImg = ({ sign, className }: { sign: Sign; className?: string }) => (
  <img src={sign.file} alt={sign.de} loading="lazy" decoding="async" className={clsx('object-contain', className)} width={96} height={96} />
);

// ─── Learn mode ─────────────────────────────────────────────────────────

const Learn = () => {
  const { t } = useTranslation();
  const lng = useLng();
  const [cat, setCat] = useState<SignCategory>('warning');
  const [open, setOpen] = useState<string | null>(null);
  const [known, setKnown] = useState<string[]>([]);
  useEffect(() => setKnown(loadProgress<string[]>(KNOWN_KEY, []).filter((id) => SIGN_BY_ID.has(id))), []);
  const toggleKnown = (id: string) =>
    setKnown((cur) => {
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      saveProgress(KNOWN_KEY, next);
      return next;
    });
  const list = signsByCategory(cat);
  const active = open ? SIGN_BY_ID.get(open) : null;

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label={t('trafficSigns.categories.label')} className="flex gap-2 overflow-x-auto pb-1">
        {SIGN_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={cat === c}
            onClick={() => {
              setCat(c);
              setOpen(null);
            }}
            className={clsx(
              'min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40',
              cat === c ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-card text-ink hover:bg-sunken',
            )}
          >
            {t(`trafficSigns.categories.${c}`)} <span className="opacity-70">({signsByCategory(c).length})</span>
          </button>
        ))}
      </div>
      <p className="text-sm text-muted">{t(`trafficSigns.categoryText.${cat}`)}</p>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="font-semibold text-ink" aria-live="polite">
          {t('trafficSigns.learn.knownCount', { n: known.length, total: SIGNS.length })}
        </p>
        {known.length > 0 && (
          <button
            type="button"
            className="min-h-10 text-sm font-semibold text-link hover:underline"
            onClick={() => {
              setKnown([]);
              saveProgress(KNOWN_KEY, []);
            }}
          >
            {t('trafficSigns.learn.reset')}
          </button>
        )}
      </div>
      <p className="text-xs text-muted">{t('trafficSigns.learn.hint')}</p>

      {active && (
        <div className="rounded-3xl border border-primary/30 bg-card p-4 shadow-[var(--tv-shadow-raised)] sm:p-5" aria-live="polite">
          <div className="flex items-start gap-4">
            <SignImg sign={active} className="size-24 shrink-0 sm:size-28" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-muted">{t('trafficSigns.learn.number', { id: active.id })}</p>
              <h3 className="font-display text-lg font-semibold text-ink">{pickTx(active.name, lng)}</h3>
              {lng !== 'de' && (
                <p className="mt-0.5 text-sm text-muted">
                  {t('trafficSigns.learn.official')}: <span lang="de" className="font-semibold text-ink">{active.de}</span>
                </p>
              )}
              <p className="mt-2 text-sm leading-relaxed text-ink">{pickTx(active.text, lng)}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={buttonClass({ variant: known.includes(active.id) ? 'outline' : 'primary', size: 'sm' })} onClick={() => toggleKnown(active.id)}>
              <CheckCircle2 className="size-4" aria-hidden /> {known.includes(active.id) ? t('trafficSigns.learn.unmark') : t('trafficSigns.learn.markKnown')}
            </button>
            <button type="button" className={buttonClass({ variant: 'ghost', size: 'sm' })} onClick={() => setOpen(null)}>
              {t('trafficSigns.learn.close')}
            </button>
          </div>
        </div>
      )}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {list.map((s) => {
          const isKnown = known.includes(s.id);
          return (
            <li key={s.id}>
              <button
                type="button"
                aria-pressed={open === s.id}
                onClick={() => setOpen(open === s.id ? null : s.id)}
                className={clsx(
                  'relative flex h-full w-full flex-col items-center gap-2 rounded-2xl border p-3 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40',
                  open === s.id ? 'border-primary bg-sunken' : 'border-line bg-card hover:border-line-strong hover:bg-sunken',
                )}
              >
                {isKnown && (
                  <span className="absolute right-2 top-2 text-success-fg" title={t('trafficSigns.learn.known')}>
                    <CheckCircle2 className="size-4" aria-hidden />
                    <span className="sr-only">{t('trafficSigns.learn.known')}</span>
                  </span>
                )}
                <span className="grid h-20 w-full place-items-center rounded-xl bg-white p-1.5">
                  <SignImg sign={s} className="max-h-full max-w-full" />
                </span>
                <span className="text-xs font-semibold leading-snug text-ink">{pickTx(s.name, lng)}</span>
                <span className="text-[11px] text-muted tabular-nums">{s.id}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

// ─── Exam mode ──────────────────────────────────────────────────────────

type ExamPhase = 'intro' | 'running' | 'result';

const Exam = ({ onLearn }: { onLearn: () => void }) => {
  const { t } = useTranslation();
  const lng = useLng();
  const brand = useBrand();
  const [phase, setPhase] = useState<ExamPhase>('intro');
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [index, setIndex] = useState(0);
  const [deadline, setDeadline] = useState(0);
  const [now, setNow] = useState(0);
  const [result, setResult] = useState<ExamResult | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [best, setBest] = useState<number | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => setBest(loadProgress<number | null>(BEST_KEY, null)), []);
  const report = useReadyReport();

  const start = (pool?: Sign[]) => {
    const qs = buildExam(Math.random, EXAM_SIZE, pool ?? SIGNS);
    setQuestions(qs);
    setAnswers({});
    setIndex(0);
    setResult(null);
    setTimedOut(false);
    const seconds = Math.max(60, Math.round((EXAM_SECONDS * qs.length) / EXAM_SIZE));
    setDeadline(Date.now() + seconds * 1000);
    setNow(Date.now());
    setPhase('running');
  };

  const finish = useCallback(
    (byTimeout = false) => {
      const r = grade(questions, answers);
      setResult(r);
      setTimedOut(byTimeout);
      setPhase('result');
      if (r.total === EXAM_SIZE) report({ activityId: 'traffic-signs', score: r.correct, max: r.total }); // Germany Ready sync (full exams only)
      if (r.total === EXAM_SIZE && (best === null || r.percent > best)) {
        setBest(r.percent);
        saveProgress(BEST_KEY, r.percent);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [questions, answers, best, report],
  );

  useEffect(() => {
    if (phase !== 'running') return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [phase]);
  const left = Math.max(0, Math.ceil((deadline - now) / 1000));
  useEffect(() => {
    if (phase === 'running' && deadline && now >= deadline) finish(true);
  }, [phase, now, deadline, finish]);
  useEffect(() => {
    if (phase === 'running') headingRef.current?.focus();
  }, [index, phase]);

  if (phase === 'intro')
    return (
      <div className="rounded-3xl border border-line bg-card p-5 sm:p-7">
        <ClipboardCheck className="size-8 text-primary" aria-hidden />
        <p className="mt-3 text-sm leading-relaxed text-ink">{t('trafficSigns.exam.intro', { total: EXAM_SIZE, minutes: EXAM_SECONDS / 60, pass: passMark(EXAM_SIZE) })}</p>
        {best !== null && <p className="mt-2 text-sm text-muted">{t('games.common.best', { value: `${best} %` })}</p>}
        <button type="button" className={clsx(buttonClass({ size: 'lg' }), 'mt-4')} onClick={() => start()}>
          {t('trafficSigns.exam.start')} <ArrowRight className="size-4" aria-hidden />
        </button>
        <p className="mt-3 text-xs text-muted">{t('games.common.progressNote')}</p>
      </div>
    );

  if (phase === 'result' && result) {
    const answerName = (id: string | undefined) => (id ? pickTx(SIGN_BY_ID.get(id)!.name, lng) : t('trafficSigns.result.unanswered'));
    const wrong = questions.map((q, i) => ({ q, i })).filter(({ q, i }) => answers[i] !== q.signId);
    const card = async () => {
      try {
        await downloadResultCard({
          lead: t('trafficSigns.result.cardLead'),
          big: `${result.percent} %`,
          sub: result.passed ? t('trafficSigns.result.cardPassed', { correct: result.correct, total: result.total }) : t('trafficSigns.result.cardFailed', { correct: result.correct, total: result.total }),
          lines: [t('trafficSigns.result.passMark', { pass: passMark(result.total), total: result.total })],
          footer: t('games.common.playAt', { domain: brand.domain, path: PATH }),
          filename: `traffic-signs-${result.percent}`,
        });
      } catch {
        toast.error(t('games.common.cardFailed'));
      }
    };
    const share = async () => {
      const ok = await copyLink(`${window.location.origin}${localePath(PATH)}`);
      if (ok) toast.success(t('games.common.copied'));
      else toast.error(t('games.common.copyFailed'));
    };
    return (
      <div className="space-y-4">
        <section className={clsx('rounded-3xl border p-5 sm:p-7', result.passed ? 'border-success-border bg-success-bg' : 'border-danger-border bg-danger-bg')} aria-live="polite">
          {timedOut && <p className="mb-2 text-sm font-semibold text-warning-fg">{t('trafficSigns.exam.timeUp')}</p>}
          <p className={clsx('flex items-center gap-2 font-display text-3xl font-semibold', result.passed ? 'text-success-fg' : 'text-danger-fg')}>
            {result.passed ? <CheckCircle2 className="size-8" aria-hidden /> : <XCircle className="size-8" aria-hidden />}
            {result.passed ? t('trafficSigns.result.passed') : t('trafficSigns.result.failed')}
          </p>
          <p className="mt-2 text-lg font-semibold text-ink tabular-nums">{t('trafficSigns.result.score', { correct: result.correct, total: result.total, percent: result.percent })}</p>
          <p className="text-sm text-muted">{t('trafficSigns.result.passMark', { pass: passMark(result.total), total: result.total })}</p>
          {best !== null && <p className="text-sm text-muted">{t('games.common.best', { value: `${best} %` })}</p>}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {wrong.length > 0 && (
              <button type="button" className={buttonClass({ size: 'lg' })} onClick={() => start(result.mistakes.map((id) => SIGN_BY_ID.get(id)!))}>
                <RotateCcw className="size-4" aria-hidden /> {t('trafficSigns.result.retryMistakes')}
              </button>
            )}
            <button type="button" className={buttonClass({ variant: wrong.length ? 'outline' : 'primary', size: 'lg' })} onClick={() => start()}>
              <ClipboardCheck className="size-4" aria-hidden /> {t('trafficSigns.result.newExam')}
            </button>
            <button type="button" className={buttonClass({ variant: 'outline', size: 'lg' })} onClick={() => void card()}>
              <Download className="size-4" aria-hidden /> {t('games.common.card')}
            </button>
            <button type="button" className={buttonClass({ variant: 'ghost', size: 'lg' })} onClick={() => void share()}>
              <Link2 className="size-4" aria-hidden /> {t('games.common.share')}
            </button>
            <button type="button" className={buttonClass({ variant: 'ghost', size: 'lg' })} onClick={onLearn}>
              <BookOpen className="size-4" aria-hidden /> {t('trafficSigns.result.toLearn')}
            </button>
          </div>
        </section>
        <section aria-labelledby="signs-mistakes-h" className="space-y-3">
          <h3 id="signs-mistakes-h" className="font-display text-lg font-semibold text-ink">
            {t('trafficSigns.result.mistakes')}
          </h3>
          {wrong.length === 0 ? (
            <p className="text-sm text-muted">{t('trafficSigns.result.noMistakes')}</p>
          ) : (
            <ul className="space-y-2">
              {wrong.map(({ q, i }) => {
                const sign = SIGN_BY_ID.get(q.signId)!;
                return (
                  <li key={i} className="flex gap-3 rounded-2xl border border-line bg-card p-3">
                    <span className="grid size-16 shrink-0 place-items-center rounded-xl bg-white p-1">
                      <SignImg sign={sign} className="max-h-full max-w-full" />
                    </span>
                    <div className="min-w-0 text-sm">
                      <p className="flex items-start gap-1 text-danger-fg">
                        <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> {t('trafficSigns.result.your', { answer: answerName(answers[i]) })}
                      </p>
                      <p className="flex items-start gap-1 font-semibold text-success-fg">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /> {t('trafficSigns.result.right', { answer: pickTx(sign.name, lng) })}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        <span lang="de" className="font-semibold">
                          {sign.id} · {sign.de}
                        </span>{' '}
                        — {pickTx(sign.text, lng)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    );
  }

  const q = questions[index];
  if (!q) return null;
  const sign = SIGN_BY_ID.get(q.signId)!;
  const answeredCount = Object.keys(answers).length;
  const unanswered = questions.length - answeredCount;
  const lowTime = left <= 60;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-ink tabular-nums">{t('trafficSigns.exam.answered', { n: answeredCount, total: questions.length })}</p>
        <p className={clsx('flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold tabular-nums', lowTime ? 'border-danger-border bg-danger-bg text-danger-fg' : 'border-line bg-card text-ink')} role="timer" aria-label={t('trafficSigns.exam.timeLeft')}>
          <Timer className="size-4" aria-hidden /> {mmss(left)}
        </p>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={answeredCount} aria-label={t('trafficSigns.exam.answered', { n: answeredCount, total: questions.length })}>
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${(answeredCount / questions.length) * 100}%` }} />
      </div>
      <section className="rounded-3xl border border-line bg-card p-4 sm:p-6" aria-labelledby="signs-q-h">
        <p className="text-xs font-semibold text-muted">{t('trafficSigns.exam.question', { n: index + 1, total: questions.length })}</p>
        <h3 id="signs-q-h" ref={headingRef} tabIndex={-1} className="mt-1 font-display text-lg font-semibold text-ink focus:outline-none">
          {t('trafficSigns.exam.which')}
        </h3>
        <div className="mx-auto mt-4 grid size-40 place-items-center rounded-2xl bg-white p-2 sm:size-48">
          <img src={sign.file} alt="" className="max-h-full max-w-full object-contain" />
        </div>
        <fieldset className="mt-4">
          <legend className="sr-only">{t('trafficSigns.exam.which')}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {q.options.map((o) => {
              const opt = SIGN_BY_ID.get(o)!;
              const chosen = answers[index] === o;
              return (
                <label
                  key={o}
                  className={clsx(
                    'flex min-h-12 cursor-pointer items-center rounded-xl border px-3 py-2 text-sm font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus/40',
                    chosen ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-card text-ink hover:border-line-strong hover:bg-sunken',
                  )}
                >
                  <input
                    type="radio"
                    className="sr-only"
                    name={`signs-q-${index}`}
                    value={o}
                    checked={chosen}
                    onChange={() => setAnswers((a) => ({ ...a, [index]: o }))}
                  />
                  {pickTx(opt.name, lng)}
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <button type="button" className={buttonClass({ variant: 'ghost' })} disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}>
            <ArrowLeft className="size-4" aria-hidden /> {t('trafficSigns.exam.prev')}
          </button>
          {index < questions.length - 1 ? (
            <button type="button" className={buttonClass({ variant: answers[index] ? 'primary' : 'outline' })} onClick={() => setIndex((i) => i + 1)}>
              {t('games.common.next')} <ArrowRight className="size-4" aria-hidden />
            </button>
          ) : (
            <button type="button" className={buttonClass({})} onClick={() => finish(false)}>
              <ClipboardCheck className="size-4" aria-hidden /> {t('trafficSigns.exam.finish')}
            </button>
          )}
        </div>
      </section>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">{unanswered > 0 && t('trafficSigns.exam.unansweredLeft', { n: unanswered })}</p>
        {index < questions.length - 1 && (
          <button type="button" className={buttonClass({ variant: 'outline', size: 'sm' })} onClick={() => finish(false)}>
            {t('trafficSigns.exam.finish')}
          </button>
        )}
      </div>
    </div>
  );
};

/**
 * /traffic-signs — German traffic signs (StVO): learn mode by category (known signs kept in localStorage) and a
 * 30-question timed exam (pass ≥ 90 %), mistake review and retry. Images are bundled public-domain SVGs.
 */
export default function TrafficSignsPage() {
  const { t } = useTranslation();
  usePageTitle(t('trafficSigns.heroTitle'));
  const [mode, setMode] = useState<'learn' | 'exam'>('learn');
  const [y, m] = SIGNS_AS_OF.split('-');
  const asOf = useMemo(() => `${m}.${y}`, [m, y]);

  return (
    <>
      <PageHero title={t('trafficSigns.heroTitle')} subtitle={t('trafficSigns.heroSubtitle', { n: SIGNS.length })} crumb={{ to: '/tools', label: t('siteNav.tools') }} />
      <section className="section">
        <div className="container-x max-w-5xl space-y-5">
          <div role="tablist" aria-label={t('trafficSigns.modes.label')} className="inline-grid grid-cols-2 gap-1 rounded-2xl border border-line bg-sunken p-1">
            {(['learn', 'exam'] as const).map((md) => (
              <button
                key={md}
                type="button"
                role="tab"
                aria-selected={mode === md}
                onClick={() => setMode(md)}
                className={clsx(
                  'flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40',
                  mode === md ? 'bg-card text-ink shadow-sm' : 'text-muted hover:text-ink',
                )}
              >
                {md === 'learn' ? <BookOpen className="size-4" aria-hidden /> : <ClipboardCheck className="size-4" aria-hidden />}
                {t(`trafficSigns.modes.${md}`)}
              </button>
            ))}
          </div>
          {mode === 'learn' ? <Learn /> : <Exam onLearn={() => setMode('learn')} />}
        </div>
      </section>

      <section className="pb-12" aria-labelledby="signs-note-h">
        <div className="container-x max-w-3xl space-y-3 text-sm leading-relaxed text-ink">
          <h2 id="signs-note-h" className="font-display text-xl font-semibold">
            {t('trafficSigns.note.title')}
          </h2>
          <p>
            {t('trafficSigns.note.license')}{' '}
            <a href="/signs/LICENSE.md" className="font-semibold text-link hover:underline" target="_blank" rel="noopener">
              {t('trafficSigns.note.licenseLink')}
            </a>
          </p>
          <p>{t('trafficSigns.note.sources')}</p>
          <ul className="list-disc space-y-1 pl-5">
            {SIGN_SOURCES.map((s) => (
              <li key={s.url}>
                <a href={s.url} className="font-semibold text-link hover:underline" target="_blank" rel="noopener noreferrer">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">{t('games.common.asOf', { date: asOf })}</p>
          <p className="flex items-start gap-2 rounded-2xl border border-warning-border bg-warning-bg p-3 text-warning-fg" role="note">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> {t('trafficSigns.note.disclaimer')}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <Link to="/driving-licence-germany" className="inline-flex min-h-10 items-center gap-1 font-semibold text-link hover:underline">
              {t('trafficSigns.note.driving')} <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link to="/glossary/fuehrerschein-umschreibung" className="inline-flex min-h-10 items-center gap-1 font-semibold text-link hover:underline">
              {t('trafficSigns.note.glossary')} <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </div>
      </section>
      <section className="pb-12">
        <div className="container-x">
          <GameLinks current={PATH} />
        </div>
      </section>
      <RelatedGuides tool={PATH} />
    </>
  );
}
