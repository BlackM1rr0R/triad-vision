import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import {
  ArrowLeft,
  ArrowRight,
  Award,
  BadgeEuro,
  BookOpenCheck,
  Briefcase,
  CalendarCheck,
  CheckCircle2,
  CircleAlert,
  Clock,
  Compass,
  GraduationCap,
  HardHat,
  HeartPulse,
  Languages,
  Laptop,
  MessageCircleOff,
  MessagesSquare,
  Package,
  Pencil,
  RotateCcw,
  School,
  Share2,
  Sprout,
  TrendingUp,
  Trophy,
  Truck,
  User,
  UserCheck,
  UserPlus,
  UserRound,
  Users,
  UtensilsCrossed,
  Warehouse,
  Wrench,
  HelpCircle,
  CircleOff,
} from 'lucide-react';
import { api } from '@/lib/api';
import { trackLead } from '@/lib/leadVisitor';
import { registerCopy, toContentLocale } from '@/i18n';
import { pagesPublicAi } from '@/i18n/pagesPublicAi';
import { pagesPathFinder } from '@/i18n/pagesPathFinder';
import { usePageTitle } from '@/lib/usePageTitle';
import { Spinner } from '@/components/ui/Spinner';
import { OptionCard } from '@/components/quiz/OptionCard';
import { useMoney } from '@/components/tools/format';

registerCopy(pagesPublicAi);
registerCopy(pagesPathFinder);

/** Mirrors server/src/lib/publicAi/pathFinder.ts (the option sets are the eligibility quiz's). */
const OPTIONS = {
  profession: ['driver', 'care', 'construction', 'technical', 'hospitality', 'it', 'logistics', 'other', 'none'],
  education: ['school', 'vocational', 'university'],
  german: ['none', 'A1', 'A2', 'B1', 'B2'],
  experience: ['none', 'lt2', '2_5', '5p'],
  age: ['u18', '18_25', '26_35', '36_45', '46p'],
} as const;
type Question = keyof typeof OPTIONS;
const STEPS = Object.keys(OPTIONS) as Question[];
type Answers = Partial<Record<Question, string>>;

const ICONS: Record<Question, Record<string, ReactNode>> = {
  profession: {
    driver: <Truck />, care: <HeartPulse />, construction: <HardHat />, technical: <Wrench />, hospitality: <UtensilsCrossed />,
    it: <Laptop />, logistics: <Warehouse />, other: <HelpCircle />, none: <CircleOff />,
  },
  education: { school: <School />, vocational: <Wrench />, university: <GraduationCap /> },
  german: { none: <MessageCircleOff />, A1: <Languages />, A2: <Languages />, B1: <MessagesSquare />, B2: <BookOpenCheck /> },
  experience: { none: <Sprout />, lt2: <TrendingUp />, '2_5': <Award />, '5p': <Trophy /> },
  age: { u18: <User />, '18_25': <User />, '26_35': <UserRound />, '36_45': <UserCheck />, '46p': <Users /> },
};

const valid = (q: Question, v: string | null | undefined): v is string => !!v && (OPTIONS[q] as readonly string[]).includes(v);
const fromParams = (p: URLSearchParams): Answers => Object.fromEntries(STEPS.filter((q) => valid(q, p.get(q))).map((q) => [q, p.get(q)!]));
const isComplete = (a: Answers): a is Record<Question, string> => STEPS.every((q) => valid(q, a[q]));

type Missing = { code: string; [k: string]: string | number };
interface Salary {
  kind: 'job' | 'ausbildung';
  source: 'vacancies' | 'reference';
  grossMin: number;
  grossMax: number;
  netMin: number;
  netMax: number;
  vacancies: number;
}
interface FinderPath {
  key: string;
  score: number;
  fit: 'high' | 'medium' | 'low';
  reasons: string[];
  missing: Missing[];
  minWeeks: number;
  maxWeeks: number;
  visa: { slug: string; label: string; title: string } | null;
  salary: Salary | null;
  package: { slug: string; tier: string; title: string; priceCents: number; currency: string } | null;
}
interface FinderResult {
  paths: FinderPath[];
  jobs: { count: number; sector: string | null };
}

const FIT_CLASS = { high: 'bg-success-bg text-success-fg', medium: 'bg-warning-bg text-warning-fg', low: 'bg-sunken text-muted' } as const;

/** GA4 event when analytics are on (gtag only exists after consent, lib/analytics.ts). */
const gaEvent = (name: string, params: Record<string, string | number>) => {
  try {
    window.gtag?.('event', name, params);
  } catch {
    // analytics are best effort
  }
};

const Fact = ({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) => (
  <div className="rounded-xl bg-sunken p-3">
    <dt className="flex items-center gap-1.5 text-xs font-semibold text-muted [&>svg]:size-3.5">
      {icon}
      {label}
    </dt>
    <dd className="mt-1 text-sm text-ink">{children}</dd>
  </div>
);

const PathCard = ({ p, best }: { p: FinderPath; best: boolean }) => {
  const { t, i18n } = useTranslation();
  const { euro } = useMoney();
  const level = (v: string | number) => (v === 'none' ? t('pai.levelNone') : String(v));
  const price = (cents: number, currency: string) =>
    new Intl.NumberFormat(i18n.resolvedLanguage === 'az' ? 'az-Latn-AZ' : (i18n.resolvedLanguage ?? 'en'), { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100);
  return (
    <article
      className={clsx(
        'rounded-2xl border p-4 sm:p-6',
        best ? 'border-primary bg-card shadow-[var(--tv-shadow-raised)] ring-1 ring-primary' : 'border-line bg-card shadow-[var(--tv-shadow-card)]',
      )}
      aria-labelledby={`pf-path-${p.key}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {best && <span className="badge bg-primary text-primary-contrast">{t('pf.best')}</span>}
        <span className={clsx('badge', FIT_CLASS[p.fit])}>{t(`pai.quiz.fit.${p.fit}`)}</span>
        <span className="text-xs font-semibold text-muted tabular-nums">{p.score}/100</span>
        {p.visa && <span className="ml-auto rounded-md border border-line-strong bg-sunken px-2 py-0.5 font-mono text-xs font-bold text-ink">{p.visa.label}</span>}
      </div>
      <h3 id={`pf-path-${p.key}`} className="mt-2 font-display text-lg font-semibold text-ink sm:text-xl">
        {t(`pai.paths.${p.key}.title`)}
      </h3>
      <p className="mt-1 text-sm text-muted">{t(`pai.paths.${p.key}.desc`)}</p>

      <dl className="mt-4 grid gap-2.5 sm:grid-cols-3">
        <Fact icon={<BadgeEuro aria-hidden />} label={p.salary?.kind === 'ausbildung' ? t('pf.salaryAusbildung') : t('pf.salary')}>
          {p.salary ? (
            <>
              <span className="block font-semibold tabular-nums">{t('pf.gross', { min: euro(p.salary.grossMin), max: euro(p.salary.grossMax) })}</span>
              <span className="block text-xs font-semibold text-success-fg tabular-nums">{t('pf.net', { min: euro(p.salary.netMin), max: euro(p.salary.netMax) })}</span>
              <span className="mt-0.5 block text-[11px] text-muted">
                {p.salary.source === 'vacancies' ? t('pf.sourceVacancies', { count: p.salary.vacancies }) : t('pf.sourceReference')}
              </span>
            </>
          ) : (
            <span className="text-xs">{t('pf.salaryNone')}</span>
          )}
        </Fact>
        <Fact icon={<Clock aria-hidden />} label={t('pf.durationLabel')}>
          <span className="block font-semibold tabular-nums">{t('pf.durationValue', { min: p.minWeeks, max: p.maxWeeks })}</span>
          <span className="mt-0.5 block text-[11px] text-muted">{t('pf.durationHint')}</span>
        </Fact>
        <Fact icon={<Package aria-hidden />} label={t('pf.packageLabel')}>
          {p.package ? (
            <>
              <span className="block font-semibold">{p.package.title}</span>
              <span className="block text-xs tabular-nums">{t('pf.packagePrice', { price: price(p.package.priceCents, p.package.currency) })}</span>
              <Link to="/packages" className="mt-0.5 inline-flex min-h-8 items-center gap-1 text-xs font-semibold text-link hover:underline">
                {t('pf.packageLink')} <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </>
          ) : (
            <span className="text-xs">{t('pf.noPackage')}</span>
          )}
        </Fact>
      </dl>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {p.reasons.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted uppercase">{t('pf.why')}</p>
            <ul className="mt-1 space-y-1 text-sm text-ink">
              {p.reasons.map((r) => (
                <li key={r} className="flex items-start gap-1.5">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success-fg" aria-hidden /> {t(`pai.reasons.${r}`)}
                </li>
              ))}
            </ul>
          </div>
        )}
        {p.missing.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted uppercase">{t('pf.missing')}</p>
            <ul className="mt-1 space-y-1 text-sm text-ink">
              {p.missing.map((m, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning-fg" aria-hidden />
                  {t(`pai.gaps.${m.code}`, { ...m, from: m.from !== undefined ? level(m.from) : undefined })}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {p.visa && (
        <Link to={`/visas/${p.visa.slug}`} className="mt-3 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-link hover:underline">
          {t('pf.visaLink')} <ArrowRight className="size-4" aria-hidden />
        </Link>
      )}
    </article>
  );
};

/**
 * /path-finder — "which path fits me": 5 questions → recommended visa routes (the eligibility quiz's scoring,
 * server lib/publicAi/pathFinder.ts) with salary range, typical duration and the matching package. The answers
 * live in the URL once finished, so a result can be shared and reopened (/path-finder?profession=driver&…).
 */
export default function PathFinder() {
  const { t, i18n } = useTranslation();
  usePageTitle(t('pf.title'));
  const lang = toContentLocale(i18n.resolvedLanguage);
  const [params, setParams] = useSearchParams();
  const urlAnswers = useMemo(() => fromParams(params), [params]);
  const shown = isComplete(urlAnswers) ? urlAnswers : null;
  const [answers, setAnswers] = useState<Answers>(urlAnswers);
  const [step, setStep] = useState(() => Math.max(0, STEPS.findIndex((q) => !valid(q, urlAnswers[q]))));
  const advance = useRef<number | undefined>(undefined);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const result = useQuery({
    queryKey: ['path-finder', shown, lang],
    queryFn: async () => (await api.get<FinderResult>('/public-ai/path-finder', { params: { ...shown, lang } })).data,
    enabled: !!shown,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  // One analytics event per shown result (lead scoring and GA4 only run with analytics consent).
  const tracked = useRef<string | null>(null);
  useEffect(() => {
    const best = result.data?.paths[0];
    const key = shown ? STEPS.map((q) => shown[q]).join('.') : null;
    if (!best || !key || tracked.current === key) return;
    tracked.current = key;
    trackLead('quiz_done', { fit: best.fit, path: '/path-finder' });
    gaEvent('path_finder_result', { path: best.key, fit: best.fit, profession: shown!.profession });
  }, [result.data, shown]);

  useEffect(() => () => window.clearTimeout(advance.current), []);

  // Move focus to the question / result heading on step changes (screen readers, keyboard users).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    headingRef.current?.focus({ preventScroll: true });
    headingRef.current?.scrollIntoView({ block: 'nearest' });
  }, [step, !!shown]);

  const current = STEPS[step];
  const last = step === STEPS.length - 1;

  const finish = (a: Answers) => {
    if (!isComplete(a)) return;
    const next = new URLSearchParams(params);
    STEPS.forEach((q) => next.set(q, a[q]));
    setParams(next);
  };

  const pick = (value: string) => {
    const next = { ...answers, [current]: value };
    setAnswers(next);
    window.clearTimeout(advance.current);
    advance.current = window.setTimeout(() => (last ? finish(next) : setStep((s) => Math.min(s + 1, STEPS.length - 1))), 260);
  };

  const edit = () => {
    setAnswers(urlAnswers);
    setStep(0);
    const next = new URLSearchParams(params);
    STEPS.forEach((q) => next.delete(q));
    setParams(next);
  };
  const restart = () => {
    setAnswers({});
    setStep(0);
    const next = new URLSearchParams(params);
    STEPS.forEach((q) => next.delete(q));
    setParams(next);
  };

  const share = async () => {
    const url = window.location.href;
    gaEvent('share', { method: 'path_finder', content_type: 'result' });
    try {
      if (navigator.share) {
        await navigator.share({ title: t('pf.shareTitle'), url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success(t('pf.copied'));
    } catch {
      // cancelled or clipboard blocked: nothing to do
    }
  };

  const progress = shown ? 100 : Math.round((step / STEPS.length) * 100);

  return (
    <>
      <section className="hero-warm border-b border-line pt-28 pb-16 sm:pt-36">
        <div className="container-x text-center">
          <span className="eyebrow">
            <Compass className="size-4" aria-hidden /> {t('pf.eyebrow')}
          </span>
          <h1 className="type-hero mx-auto mt-3 max-w-3xl text-ink">{t('pf.title')}</h1>
          <p className="mx-auto mt-4 max-w-2xl leading-relaxed text-muted sm:text-lg">{t('pf.subtitle')}</p>
          <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-line bg-card px-3.5 py-1.5 text-xs font-medium text-ink">
            <Clock className="size-3.5" aria-hidden /> {t('pf.duration')}
          </p>
        </div>
      </section>

      <section className="relative pb-20">
        <div className="container-x">
          <div className={clsx('relative mx-auto -mt-10 overflow-hidden rounded-3xl border border-line bg-card shadow-[var(--tv-shadow-raised)]', shown ? 'max-w-5xl' : 'max-w-3xl')}>
            <div className="h-1.5 bg-sunken" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label={t('pf.step', { n: Math.min(step + 1, STEPS.length), total: STEPS.length })}>
              <div className="h-full bg-primary transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${progress}%` }} />
            </div>
            <div className="p-4 sm:p-8">
              {shown ? (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 ref={headingRef} tabIndex={-1} className="type-subsection text-ink outline-none">
                        {t('pf.resultTitle')}
                      </h2>
                      <p className="mt-1 text-xs text-muted">
                        <span className="font-semibold">{t('pf.basedOn')}:</span> {STEPS.map((q) => t(`pai.quiz.o.${q}.${shown[q]}`)).join(' · ')}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="btn-secondary btn-sm" onClick={() => void share()}>
                        <Share2 className="size-4" aria-hidden /> {t('pf.share')}
                      </button>
                      <button type="button" className="btn-ghost btn-sm" onClick={edit}>
                        <Pencil className="size-4" aria-hidden /> {t('pf.edit')}
                      </button>
                    </div>
                  </div>

                  {result.isError ? (
                    <div className="rounded-2xl border border-danger-border bg-danger-bg p-4 text-sm text-danger-fg" role="alert">
                      {t('pf.error')}{' '}
                      <button type="button" className="font-semibold underline" onClick={() => void result.refetch()}>
                        {t('pf.retry')}
                      </button>
                    </div>
                  ) : !result.data ? (
                    <p className="flex min-h-48 items-center justify-center gap-3 text-sm text-muted" role="status">
                      <Spinner className="size-6 text-primary" /> {t('pf.loading')}
                    </p>
                  ) : (
                    <div className="space-y-3" aria-live="polite">
                      {result.data.paths.map((p, i) => (
                        <PathCard key={p.key} p={p} best={i === 0} />
                      ))}
                    </div>
                  )}

                  <div className="rounded-2xl border border-line bg-sunken p-4">
                    <p className="text-sm font-bold text-ink">{t('pf.nextTitle')}</p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      <Link to="/booking" className="btn-primary" onClick={() => gaEvent('path_finder_cta', { cta: 'booking' })}>
                        <CalendarCheck className="size-4" aria-hidden /> {t('pf.consult')}
                      </Link>
                      <Link to="/register" className="btn-secondary" onClick={() => gaEvent('path_finder_cta', { cta: 'register' })}>
                        <UserPlus className="size-4" aria-hidden /> {t('pf.register')}
                      </Link>
                      {result.data && result.data.jobs.count > 0 && (
                        <Link to={result.data.jobs.sector ? `/jobs?sector=${result.data.jobs.sector}` : '/jobs'} className="btn-ghost">
                          <Briefcase className="size-4" aria-hidden /> {t('pf.jobs', { count: result.data.jobs.count })}
                        </Link>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <button type="button" className="btn-ghost btn-sm" onClick={restart}>
                      <RotateCcw className="size-4" aria-hidden /> {t('pf.again')}
                    </button>
                    <Link to="/uygunluq-testi" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-link hover:underline">
                      {t('pf.quizLink')} <ArrowRight className="size-4" aria-hidden />
                    </Link>
                  </div>
                  <p className="text-xs text-muted">{t('pf.disclaimer')}</p>
                </div>
              ) : (
                <fieldset>
                  <legend className="contents">
                    <span className="type-overline block text-muted">{t('pf.step', { n: step + 1, total: STEPS.length })}</span>
                    <h2 ref={headingRef} tabIndex={-1} id="pf-question" className="mt-2 block font-display text-xl leading-tight font-semibold text-ink outline-none sm:text-2xl">
                      {t(`pf.q.${current}`)}
                    </h2>
                  </legend>
                  <div role="radiogroup" aria-labelledby="pf-question" className={clsx('mt-5 grid gap-2.5', OPTIONS[current].length > 5 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
                    {OPTIONS[current].map((value, i) => (
                      <OptionCard key={`${current}-${value}`} icon={ICONS[current][value]} label={t(`pai.quiz.o.${current}.${value}`)} selected={answers[current] === value} index={i} onSelect={() => pick(value)} />
                    ))}
                  </div>
                  <div className="mt-6 flex justify-between gap-3">
                    <button type="button" className="btn-ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
                      <ArrowLeft className="size-4" aria-hidden /> {t('pf.back')}
                    </button>
                    {last ? (
                      <button type="button" className="btn-primary" disabled={!isComplete(answers)} onClick={() => finish(answers)}>
                        {t('pf.result')} <ArrowRight className="size-4" aria-hidden />
                      </button>
                    ) : (
                      <button type="button" className="btn-primary" disabled={!valid(current, answers[current])} onClick={() => setStep((s) => s + 1)}>
                        {t('pf.next')} <ArrowRight className="size-4" aria-hidden />
                      </button>
                    )}
                  </div>
                </fieldset>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
