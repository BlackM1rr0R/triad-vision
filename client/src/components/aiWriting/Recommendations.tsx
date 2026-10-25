import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowRight, BriefcaseBusiness, CheckCircle2, CircleAlert, Lightbulb, MapPin, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesAiWriting } from '@/i18n/pagesAiWriting';
import type { Recommendation, Recommendations as Recs } from './api';

registerCopy(pagesAiWriting);

const Item = ({ r }: { r: Recommendation }) => {
  const { t } = useTranslation();
  const v = r.vacancy;
  const salary = v.salaryMin || v.salaryMax ? t('aiw.rec.salary', { min: v.salaryMin ?? '…', max: v.salaryMax ?? '…' }) : null;
  return (
    <li className="rounded-xl border border-line bg-sunken p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold break-words text-ink">{v.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
            {v.city && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" aria-hidden /> {v.city}
              </span>
            )}
            {v.company && <span>{v.company}</span>}
            {salary && <span className="font-semibold text-ink/80">{salary}</span>}
          </p>
        </div>
        <span className="shrink-0 rounded-lg bg-sunken px-2 py-1 text-center text-xs leading-tight font-bold text-primary" title={t('aiw.rec.score')}>
          {r.score}%
        </span>
      </div>
      {r.why ? (
        <p className="mt-2 flex items-start gap-1.5 text-sm text-ink/90">
          <Sparkles className="mt-0.5 size-3.5 shrink-0 text-link" aria-hidden /> {r.why}
        </p>
      ) : (
        r.met.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-success-fg">
            {r.met.slice(0, 3).map((m) => (
              <li key={m} className="inline-flex items-center gap-1">
                <CheckCircle2 className="size-3.5" aria-hidden /> {t(`aiw.rec.met.${m}`)}
              </li>
            ))}
          </ul>
        )
      )}
      {r.gaps.length > 0 && (
        <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-warning-fg">
          {r.gaps.slice(0, 2).map((g) => (
            <li key={g.code} className="inline-flex items-center gap-1">
              <CircleAlert className="size-3.5" aria-hidden /> {t(`aiw.rec.gaps.${g.code}`, { required: g.required })}
            </li>
          ))}
        </ul>
      )}
      <Link to={`/jobs/${v.slug}`} className="mt-3 inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-link hover:text-link">
        {t('aiw.rec.view')} <ArrowRight className="size-4" aria-hidden />
      </Link>
    </li>
  );
};

/** "Sizə uyğun vakansiyalar" on the account overview; renders nothing until there is at least one match. */
export const RecommendationsCard = () => {
  const { t, i18n } = useTranslation();
  const { data } = useQuery({
    queryKey: ['ai-writing', 'recommendations', i18n.resolvedLanguage],
    queryFn: async () => (await api.get<Recs>('/ai-writing/recommendations')).data,
    staleTime: 15 * 60_000,
    retry: false,
  });
  if (!data?.items.length) return null;
  return (
    <section className="card p-4 sm:p-5" aria-labelledby="rec-title">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="rec-title" className="flex items-center gap-2 text-base font-semibold text-ink">
            <BriefcaseBusiness className="size-5 text-primary" aria-hidden /> {t('aiw.rec.title')}
          </h2>
          <p className="mt-0.5 text-xs text-muted">{t('aiw.rec.subtitle')}</p>
        </div>
        <Link to="/jobs" className="shrink-0 text-xs font-semibold text-link hover:text-link">
          {t('aiw.rec.all')}
        </Link>
      </div>
      <ul className="mt-4 space-y-3">
        {data.items.map((r) => (
          <Item key={r.vacancy.id} r={r} />
        ))}
      </ul>
      {data.tip && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-warning-border bg-warning-bg p-3 text-sm text-ink">
          <Lightbulb className="mt-0.5 size-4 shrink-0 text-highlight" aria-hidden />
          <p>
            <span className="font-semibold">{t('aiw.rec.tip')}:</span> {data.tip}{' '}
            <Link to="/account/profile" className="font-semibold whitespace-nowrap text-link hover:text-link">
              {t('aiw.rec.improve')}
            </Link>
          </p>
        </div>
      )}
    </section>
  );
};

export default RecommendationsCard;
