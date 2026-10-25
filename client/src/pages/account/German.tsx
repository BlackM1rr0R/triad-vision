import { useMemo, useState } from 'react';
import { STATUS_TONES, toneClasses } from '@/components/ui/status';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, Award, BookOpen, CheckCircle2, ExternalLink, FileCheck2, GraduationCap, Languages, MapPin, Monitor, RotateCcw, Sparkles, Upload, Users, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useL10n } from '@/lib/l10n';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesJourney } from '@/i18n/pagesJourney';
import { Spinner } from '@/components/ui/Spinner';
import { OptionCard } from '@/components/quiz/OptionCard';
import { useApiError } from '@/components/portal/useApiError';
import { GERMAN_STATUS_KEY, useGermanCourses, useGermanStatus } from '@/components/journey/api';
import { GermanProgressBoard } from '@/components/german/GermanProgressBoard';
import { GERMAN_LEVELS, type CertificateState, type EstimatedLevel, type GermanQuestion, type GermanTestResult, type LanguageCourse } from '@/components/journey/types';
import { Learning } from '@/components/illustrations';

registerCopy(pagesJourney);

const EASE = [0.22, 1, 0.36, 1] as const;
const LEVEL_TONE: Record<string, string> = { none: 'bg-line text-muted', A1: 'bg-info-bg text-info-fg', A2: 'bg-sunken text-link', B1: 'bg-accent-bg text-accent-fg', B2: 'bg-success-bg text-success-fg', C1: 'bg-warning-bg text-warning-fg', C2: 'bg-warning-bg text-warning-fg' };

const LevelPill = ({ level, className }: { level: string | null | undefined; className?: string }) => {
  const { t } = useTranslation();
  const key = level && level !== 'none' ? level : 'none';
  return <span className={clsx('badge whitespace-nowrap', LEVEL_TONE[key] ?? LEVEL_TONE.none, className)}>{level && level !== 'none' ? level : t('journey.german.none')}</span>;
};

// ─── Level test ─────────────────────────────────────────────────────────

type Phase = 'intro' | 'test' | 'result';

const LevelTest = ({ requiredLevel }: { requiredLevel: string | null }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const qc = useQueryClient();
  const apiError = useApiError();
  const { user, setUser } = useAuth();
  const [phase, setPhase] = useState<Phase>('intro');
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<{ result: GermanTestResult; correct: Record<string, number> } | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const test = useQuery({
    queryKey: ['journey-german-test'],
    queryFn: async () => (await api.get<{ questions: GermanQuestion[] }>('/journey/german/test')).data.questions,
    enabled: phase !== 'intro',
    staleTime: Infinity,
    gcTime: 0,
  });
  const questions = useMemo(() => test.data ?? [], [test.data]);
  const current = questions[index];
  const unanswered = questions.filter((q) => answers[q.id] === undefined).length;

  const submit = useMutation({
    mutationFn: async () => (await api.post<{ result: GermanTestResult; correct: Record<string, number> }>('/journey/german/test', { answers })).data,
    onSuccess: (data) => {
      setResult(data);
      setPhase('result');
      setConfirmed(false);
      setReviewing(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    onError: (err) => apiError(err),
  });

  const confirm = useMutation({
    mutationFn: async (level: EstimatedLevel) => (await api.put<{ germanLevel: string }>('/journey/german/level', { level })).data,
    onSuccess: (data) => {
      if (user) setUser({ ...user, germanLevel: data.germanLevel });
      void qc.invalidateQueries({ queryKey: GERMAN_STATUS_KEY });
      setConfirmed(true);
      toast.success(t('journey.german.test.result.confirmed'));
    },
    onError: (err) => apiError(err),
  });

  const restart = async () => {
    setAnswers({});
    setIndex(0);
    setResult(null);
    setReviewing(false);
    await qc.resetQueries({ queryKey: ['journey-german-test'] });
    setPhase('test');
  };

  const start = () => {
    setAnswers({});
    setIndex(0);
    setPhase('test');
  };

  return (
    <section className="card overflow-hidden" aria-labelledby="german-test-title">
      <div className="border-b border-line px-5 py-4 sm:px-6">
        <h2 id="german-test-title" className="flex items-center gap-2.5 text-base font-semibold text-ink">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl chip-soft">
            <Languages className="size-4" aria-hidden />
          </span>
          {t('journey.german.test.title')}
        </h2>
      </div>

      <div className="p-5 sm:p-6">
        <AnimatePresence mode="wait">
          {phase === 'intro' && (
            <motion.div key="intro" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35, ease: EASE }}>
              <p className="max-w-2xl leading-relaxed text-muted">{t('journey.german.test.intro')}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {GERMAN_LEVELS.map((l) => (
                  <LevelPill key={l} level={l} />
                ))}
              </div>
              <button type="button" className="btn-primary mt-6" onClick={start}>
                <Sparkles className="size-4" aria-hidden />
                {t('journey.german.test.start')}
              </button>
            </motion.div>
          )}

          {phase === 'test' && (
            <motion.div key="test" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35, ease: EASE }}>
              {test.isLoading ? (
                <div className="grid place-items-center py-10">
                  <Spinner className="size-6 text-primary" />
                </div>
              ) : !current ? (
                <p className="text-muted">{t('journey.german.test.empty')}</p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-semibold text-ink">{t('journey.german.test.question', { n: index + 1, total: questions.length })}</span>
                    <LevelPill level={current.level} />
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={index + 1}>
                    <motion.div className="h-full rounded-full bg-highlight" animate={{ width: `${((index + 1) / questions.length) * 100}%` }} transition={{ duration: 0.4, ease: EASE }} />
                  </div>
                  <AnimatePresence mode="wait">
                    <motion.div key={current.id} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.3, ease: EASE }}>
                      <p className="mt-5 text-lg font-bold break-words text-ink sm:text-xl">{tr(current.question)}</p>
                      <div role="radiogroup" aria-label={tr(current.question)} className="mt-4 grid gap-3 sm:grid-cols-2">
                        {current.options.map((opt, i) => (
                          <OptionCard
                            key={i}
                            index={i}
                            icon={<span className="font-display text-base font-semibold">{String.fromCharCode(65 + i)}</span>}
                            label={opt}
                            selected={answers[current.id] === i}
                            onSelect={() => setAnswers((a) => ({ ...a, [current.id]: i }))}
                          />
                        ))}
                      </div>
                    </motion.div>
                  </AnimatePresence>
                  <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                    <button type="button" className="btn-secondary" disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}>
                      <ArrowLeft className="size-4" aria-hidden />
                      {t('journey.german.test.back')}
                    </button>
                    {index < questions.length - 1 ? (
                      <button type="button" className="btn-primary" disabled={answers[current.id] === undefined} onClick={() => setIndex((i) => i + 1)}>
                        {t('journey.german.test.next')}
                        <ArrowRight className="size-4" aria-hidden />
                      </button>
                    ) : (
                      <span className="flex flex-wrap items-center gap-3">
                        {unanswered > 0 && <span className="text-xs text-muted">{t('journey.german.test.unanswered', { count: unanswered })}</span>}
                        <button type="button" className="btn-primary" disabled={submit.isPending || Object.keys(answers).length === 0} onClick={() => submit.mutate()}>
                          {submit.isPending && <Spinner className="size-4" />}
                          {t('journey.german.test.finish')}
                        </button>
                      </span>
                    )}
                  </div>
                </>
              )}
            </motion.div>
          )}

          {phase === 'result' && result && (
            <motion.div key="result" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.4, ease: EASE }}>
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                <div className="grid size-24 shrink-0 place-items-center rounded-2xl border border-warning-border bg-highlight-bg text-ink">
                  <span className="text-center leading-none">
                    <span className="block font-display text-3xl font-semibold">{result.result.estimated === 'none' ? '–' : result.result.estimated}</span>
                    <span className="mt-1 block text-[10px] font-semibold text-muted uppercase">{t('journey.german.test.result.estimated')}</span>
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <span className="type-overline text-muted">{t('journey.german.test.result.title')}</span>
                  <p className="mt-1 text-xl font-semibold text-ink">{t(`journey.german.levels.${result.result.estimated}`)}</p>
                  <p className="text-sm text-muted">{t('journey.german.test.result.score', { correct: result.result.correct, total: result.result.total })}</p>
                  <p className="mt-3 text-sm leading-relaxed text-ink/85">{t(`journey.german.test.result.recommend.${result.result.estimated}`)}</p>
                  {requiredLevel && (
                    <p className={clsx('mt-2 text-sm font-semibold', levelRank(result.result.estimated) >= levelRank(requiredLevel) ? 'text-success' : 'text-warning-fg')}>
                      {levelRank(result.result.estimated) >= levelRank(requiredLevel) ? t('journey.german.test.result.recommend.enough') : t('journey.german.test.result.recommend.needMore', { level: requiredLevel })}
                    </p>
                  )}
                </div>
              </div>

              <ul className="mt-5 grid gap-2 sm:grid-cols-4">
                {result.result.levels.map((l) => (
                  <li key={l.level} className={clsx('rounded-xl border p-3', l.passed ? 'border-success/30 bg-success-bg' : 'border-line bg-sunken')}>
                    <div className="flex items-center justify-between">
                      <LevelPill level={l.level} />
                      {l.passed ? <CheckCircle2 className="size-4 text-success" aria-label={t('journey.german.test.result.passed')} /> : <XCircle className="size-4 text-muted" aria-label={t('journey.german.test.result.failed')} />}
                    </div>
                    <p className="mt-2 font-display text-lg font-semibold text-ink">{l.percent}%</p>
                    <p className="text-[11px] text-muted">
                      {l.correct}/{l.total}
                    </p>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted">{t('journey.german.test.result.rule')}</p>

              <div className="mt-5 flex flex-wrap gap-2">
                {!confirmed ? (
                  <button type="button" className="btn-primary" disabled={confirm.isPending} onClick={() => confirm.mutate(result.result.estimated)}>
                    {confirm.isPending && <Spinner className="size-4" />}
                    <Award className="size-4" aria-hidden />
                    {t('journey.german.test.result.confirm')}
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-xl bg-success-bg px-4 py-2.5 text-sm font-semibold text-success-fg">
                    <CheckCircle2 className="size-4" aria-hidden /> {t('journey.german.test.result.confirmed')}
                  </span>
                )}
                <button type="button" className="btn-secondary" onClick={() => setReviewing((r) => !r)}>
                  {t('journey.german.test.result.review')}
                </button>
                <button type="button" className="btn-secondary" onClick={() => void restart()}>
                  <RotateCcw className="size-4" aria-hidden />
                  {t('journey.german.test.restart')}
                </button>
              </div>

              {reviewing && (
                <ol className="mt-6 space-y-2 border-t border-line pt-5">
                  {questions.map((q, i) => {
                    const chosen = answers[q.id];
                    const right = result.correct[q.id];
                    const ok = chosen === right;
                    return (
                      <li key={q.id} className={clsx('rounded-xl border p-3 text-sm', ok ? 'border-success/30 bg-success-bg' : 'border-danger-border bg-danger-bg')}>
                        <div className="flex items-start gap-2">
                          {ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> : <XCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />}
                          <div className="min-w-0">
                            <p className="font-medium text-ink">
                              {i + 1}. {tr(q.question)} <LevelPill level={q.level} className="ml-1 align-middle" />
                            </p>
                            <p className="mt-1 text-xs text-muted">
                              {chosen !== undefined ? q.options[chosen] : '—'}
                              {!ok && right !== undefined && (
                                <>
                                  {' · '}
                                  <span className="font-semibold text-success-fg">
                                    {t('journey.german.test.result.correctAnswer')}: {q.options[right]}
                                  </span>
                                </>
                              )}
                            </p>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
};

const RANK: Record<string, number> = { none: 0, A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };
const levelRank = (l: string | null | undefined) => RANK[l ?? 'none'] ?? 0;

// ─── Courses ────────────────────────────────────────────────────────────

const FORMAT_ICON = { online: Monitor, offline: Users, hybrid: BookOpen } as const;

const CourseCard = ({ c, index }: { c: LanguageCourse; index: number }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const FormatIcon = c.format ? FORMAT_ICON[c.format] : BookOpen;
  return (
    <motion.li
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.45, delay: Math.min(index * 0.05, 0.3), ease: EASE }}
      className="card flex h-full flex-col p-5 transition hover:border-line-strong"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl chip-soft">
          <FormatIcon className="size-5" aria-hidden />
        </span>
        <span className="flex flex-wrap justify-end gap-1.5">
          {c.levels && <span className="badge bg-primary text-primary-contrast">{c.levels}</span>}
          {c.format && <span className="badge bg-sunken text-muted">{t(`journey.german.courses.format.${c.format}`)}</span>}
        </span>
      </div>
      <h3 className="mt-3 font-semibold break-words text-ink">{c.name}</h3>
      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
        {c.provider && <span>{c.provider}</span>}
        {c.city && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3" aria-hidden /> {c.city}
          </span>
        )}
      </p>
      {c.description && <p className="mt-2 text-sm leading-relaxed text-ink/80">{tr(c.description)}</p>}
      {c.url && (
        <a href={c.url} target="_blank" rel="noreferrer" className="mt-auto inline-flex items-center gap-1.5 pt-4 text-sm font-semibold text-link hover:text-link">
          {t('journey.german.courses.visit')}
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
      )}
    </motion.li>
  );
};

// ─── Certificate ────────────────────────────────────────────────────────

const CERT_TONE: Record<CertificateState, string> = toneClasses(STATUS_TONES.certificate);

const CertificateCard = ({ status }: { status: ReturnType<typeof useGermanStatus>['data'] }) => {
  const { t } = useTranslation();
  const { date } = useL10n();
  const cert = status?.certificate ?? null;
  return (
    <section className="card p-5 sm:p-6" aria-labelledby="cert-title">
      <h2 id="cert-title" className="flex items-center gap-2.5 text-base font-semibold text-ink">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl chip-soft">
          <FileCheck2 className="size-4" aria-hidden />
        </span>
        {t('journey.german.certificate.title')}
        {cert && <span className={clsx('badge ml-auto', CERT_TONE[cert.status])}>{t(`journey.german.certificate.status.${cert.status}`)}</span>}
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-muted">{t('journey.german.certificate.body')}</p>
      {cert ? (
        <>
          {cert.uploadedAt && <p className="mt-2 text-xs text-muted">{date(cert.uploadedAt)}</p>}
          <Link to={cert.link} className={clsx('mt-4 min-h-10 px-4 py-2 text-sm', cert.status === 'missing' || cert.status === 'rejected' ? 'btn-primary' : 'btn-secondary')}>
            {cert.status === 'missing' || cert.status === 'rejected' ? <Upload className="size-4" aria-hidden /> : <ArrowRight className="size-4" aria-hidden />}
            {cert.status === 'missing' || cert.status === 'rejected' ? t('journey.german.certificate.upload') : t('journey.german.certificate.open')}
          </Link>
        </>
      ) : status?.case ? (
        <p className="mt-3 rounded-xl bg-sunken px-4 py-3 text-sm text-muted">{t('journey.german.certificate.noRequirement')}</p>
      ) : (
        <>
          <p className="mt-3 rounded-xl bg-sunken px-4 py-3 text-sm text-muted">{t('journey.german.certificate.noCase')}</p>
          <Link to="/account#start" className="btn-white mt-4 min-h-10 border border-line px-4 py-2 text-sm">
            {t('journey.german.certificate.startCase')}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </>
      )}
    </section>
  );
};

// ─── Page ───────────────────────────────────────────────────────────────

export default function German() {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const { user } = useAuth();
  usePageTitle(t('journey.german.title'));
  const { data: status } = useGermanStatus(!!user);
  const { data: courses } = useGermanCourses(!!user);
  const userLevel = status?.userLevel ?? user?.germanLevel ?? null;
  const required = status?.requiredLevel ?? null;
  const meets = required ? levelRank(userLevel) >= levelRank(required) : null;

  return (
    <div className="space-y-6 lg:space-y-8">
      <section className="relative overflow-hidden rounded-3xl border border-line bg-card p-6 text-ink shadow-[var(--tv-shadow-card)] sm:p-8" aria-labelledby="german-title">
        <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center">
          <div className="min-w-0">
            <span className="type-overline inline-flex items-center gap-2 text-muted">
              <GraduationCap className="size-4" aria-hidden />
              Deutsch
            </span>
            <h1 id="german-title" className="type-page-title mt-2">{t('journey.german.title')}</h1>
            <p className="mt-1 max-w-[65ch] text-muted">{t('journey.german.subtitle')}</p>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-2xl border border-line bg-sunken px-4 py-3">
              <dt className="text-[11px] font-semibold text-muted uppercase">{t('journey.german.yourLevel')}</dt>
              <dd className="mt-1 font-display text-xl font-semibold">{userLevel && userLevel !== 'none' ? userLevel : t('journey.german.none')}</dd>
            </div>
            <div className="rounded-2xl border border-line bg-sunken px-4 py-3">
              <dt className="text-[11px] font-semibold text-muted uppercase">{t('journey.german.required')}</dt>
              <dd className="mt-1 font-display text-xl font-semibold">{required ?? '—'}</dd>
              {status?.case?.visaCategory && <dd className="mt-0.5 truncate text-[11px] text-muted">{tr(status.case.visaCategory.title)}</dd>}
            </div>
          </dl>
          <Learning className="hidden w-36 lg:block" />
        </div>
        {required ? (
          <p className={clsx('relative mt-4 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold', meets ? 'bg-success-bg text-success-fg' : 'bg-warning-bg text-warning-fg')}>
            {meets ? <CheckCircle2 className="size-3.5" aria-hidden /> : <XCircle className="size-3.5" aria-hidden />}
            {meets ? t('journey.german.meets') : t('journey.german.below')}
          </p>
        ) : (
          status?.case && <p className="relative mt-4 text-xs text-muted">{t('journey.german.requiredNone')}</p>
        )}
      </section>

      {/* Goal, courses, exams (Baku exam dates), timeline and certificate upload. */}
      <GermanProgressBoard />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
        <div className="min-w-0 space-y-6">
          <LevelTest requiredLevel={required} />
          <section aria-labelledby="courses-title">
            <h2 id="courses-title" className="flex items-center gap-2.5 text-xl font-semibold text-ink">
              <BookOpen className="size-5 text-primary" aria-hidden />
              {t('journey.german.courses.title')}
            </h2>
            <p className="mt-1 text-sm text-muted">{t('journey.german.courses.subtitle')}</p>
            {courses && courses.length === 0 ? (
              <p className="card mt-4 p-5 text-sm text-muted">{t('journey.german.courses.empty')}</p>
            ) : (
              <ul className="mt-4 grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">{courses?.map((c, i) => <CourseCard key={c.id} c={c} index={i} />)}</ul>
            )}
          </section>
        </div>
        <aside className="min-w-0 space-y-6">
          <CertificateCard status={status} />
        </aside>
      </div>
    </div>
  );
}
