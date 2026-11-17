import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowRight, BookOpen, Briefcase, FileCheck, Gauge, Home, Info, Smartphone, Wallet, type LucideIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesReadiness } from '@/i18n/pagesReadiness';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { READINESS_KEY, ReadinessRing, TrendLine, levelOf, useNextText, useReadiness, type PartKey, type ReadinessData, type ReadinessPart } from '@/components/readiness/Readiness';

registerCopy(pagesReadiness);

const ICONS: Record<PartKey, LucideIcon> = { language: BookOpen, documents: FileCheck, skills: Briefcase, housing: Home, money: Wallet };

const MONEY: Record<string, string[]> = {
  savings: ['none', 'lt1', '1to2', 'gt2'],
  firstMonth: ['no', 'yes'],
  travelCosts: ['no', 'partly', 'yes'],
  bankCard: ['no', 'yes'],
};

const PartCard = ({ p }: { p: ReadinessPart }) => {
  const { t } = useTranslation();
  const nextText = useNextText();
  const Icon = ICONS[p.key];
  const d = p.detail;
  const detail =
    p.key === 'language'
      ? d.level && d.level !== 'none'
        ? t('readiness.detail.language', { level: d.level })
        : t('readiness.detail.languageNone')
      : p.key === 'documents'
        ? d.total
          ? t('readiness.detail.documents', d)
          : t('readiness.detail.documentsNone')
        : p.key === 'skills'
          ? t('readiness.detail.skills', { cv: d.cv, recognition: t(`readiness.recognition.${String(d.recognition)}`, { defaultValue: String(d.recognition) }) })
          : p.key === 'housing'
            ? t('readiness.detail.housing', { steps: d.stepsDone, total: d.stepsTotal })
            : t('readiness.detail.money', { answered: d.answered });
  const internal = p.next?.to.startsWith('/account/readiness');
  return (
    <li className="card p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <h2 className="font-display text-base font-semibold text-ink">{t(`readiness.parts.${p.key}`)}</h2>
            <span className="text-sm font-semibold text-ink tabular-nums">{p.score} / 100</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuenow={p.score} aria-valuemin={0} aria-valuemax={100} aria-label={t(`readiness.parts.${p.key}`)}>
            <div className={clsx('h-full rounded-full transition-[width] duration-700', p.score >= 75 ? 'bg-success' : p.score >= 40 ? 'bg-primary' : 'bg-warning')} style={{ width: `${p.score}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted">
            {detail} · {t('readiness.points', { points: p.points, weight: p.weight })}
          </p>
          {p.next &&
            (internal ? (
              <a href="#money" className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-sm font-semibold text-ink hover:bg-sunken">
                <span>{nextText(p)}</span>
                <span className="shrink-0 rounded-full bg-success-bg px-2 py-0.5 text-xs text-success-fg">{t('readiness.gain', { gain: p.next.gain })}</span>
              </a>
            ) : (
              <Link to={p.next.to} className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-sm font-semibold text-ink hover:bg-sunken">
                <span className="inline-flex items-center gap-1">
                  {nextText(p)} <ArrowRight className="size-3.5" aria-hidden />
                </span>
                <span className="shrink-0 rounded-full bg-success-bg px-2 py-0.5 text-xs text-success-fg">{t('readiness.gain', { gain: p.next.gain })}</span>
              </Link>
            ))}
        </div>
      </div>
    </li>
  );
};

const MoneyCheck = ({ answers }: { answers: Record<string, string> }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: async (patch: Record<string, string>) => (await api.put<ReadinessData>('/account/readiness/money', patch)).data,
    onSuccess: (data) => {
      qc.setQueryData(READINESS_KEY, data);
      toast.success(t('readiness.money.saved'));
    },
    onError: () => toast.error(t('readiness.error')),
  });
  return (
    <section id="money" className="card scroll-mt-24 p-5" aria-labelledby="money-h">
      <h2 id="money-h" className="type-section-title flex items-center gap-2 text-ink">
        <Wallet className="size-5 text-primary" aria-hidden /> {t('readiness.money.title')}
      </h2>
      <p className="mt-1 text-xs text-muted">{t('readiness.money.hint')}</p>
      <div className="mt-4 space-y-4">
        {Object.entries(MONEY).map(([q, opts]) => (
          <fieldset key={q}>
            <legend className="label">{t(`readiness.money.q.${q}`)}</legend>
            <div className="flex flex-wrap gap-2">
              {opts.map((o) => (
                <label
                  key={o}
                  className={clsx(
                    'flex min-h-11 cursor-pointer items-center rounded-xl border px-3 text-sm font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus/40',
                    answers[q] === o ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-card text-ink hover:bg-sunken',
                  )}
                >
                  <input type="radio" className="sr-only" name={`money-${q}`} checked={answers[q] === o} disabled={save.isPending} onChange={() => save.mutate({ [q]: o })} />
                  {t(`readiness.money.a.${q}.${o}`)}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
    </section>
  );
};

/**
 * /account/readiness — Germany readiness score: ring, trend of the daily snapshots, the five sub-scores with the
 * next step each (linking to the page that raises it), the money self-check and how the score is computed.
 */
export default function AccountReadiness() {
  const { t } = useTranslation();
  usePageTitle(t('readiness.title'));
  const q = useReadiness();
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h2 className="type-page-title flex items-center gap-2 text-ink">
          <Gauge className="size-6 text-primary" aria-hidden /> {t('readiness.title')}
        </h2>
        <p className="mt-1 text-sm text-muted">{t('readiness.subtitle')}</p>
      </header>
      {q.isLoading ? (
        <Skeleton className="h-64 rounded-3xl" />
      ) : q.isError || !q.data ? (
        <ErrorState onRetry={() => void q.refetch()} />
      ) : (
        <>
          <section className="card grid gap-6 p-5 sm:p-6 md:grid-cols-[auto_1fr] md:items-center">
            <div className="flex flex-col items-center gap-2">
              <ReadinessRing score={q.data.score} />
              <p className="text-sm font-semibold text-ink">{t(`readiness.level.${levelOf(q.data.score)}`)}</p>
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-ink">{t('readiness.history.title')}</h2>
              <div className="mt-2">
                <TrendLine history={q.data.history} />
              </div>
            </div>
          </section>
          <ul className="grid gap-4 md:grid-cols-2">
            {q.data.parts.map((p) => (
              <PartCard key={p.key} p={p} />
            ))}
          </ul>
          <MoneyCheck answers={q.data.money} />
          <section className="card p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Info className="size-4 text-primary" aria-hidden /> {t('readiness.how.title')}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">{t('readiness.how.text')}</p>
            <Link to="/account/emergency-wallpaper" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-link hover:underline">
              <Smartphone className="size-4" aria-hidden /> {t('readiness.wallpaper')}
            </Link>
          </section>
        </>
      )}
    </div>
  );
}
