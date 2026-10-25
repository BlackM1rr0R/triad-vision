import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import clsx from 'clsx';
import { Flame, Snowflake, Sun } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import type { BadgeTone } from '@/components/ui/status';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import type { LeadDetails, LeadLevel, ScoreReason } from './api';

/** Lead level → badge tone and icon (categorical, not a status). */
export const LEVEL_TONE: Record<LeadLevel, BadgeTone> = { HOT: 'danger', WARM: 'warning', COLD: 'neutral' };
const LEVEL_ICON = { HOT: Flame, WARM: Sun, COLD: Snowflake } as const;

/** One stored score reason as a sentence in the UI language. */
export const reasonLabel = (t: TFunction, r: ScoreReason) => {
  switch (r.code) {
    case 'source':
      return t(`mk.lead.reasons.source.${r.key ?? 'other'}`);
    case 'event':
      return t(`mk.lead.reasons.event.${r.key}`, { n: r.n ?? 1 });
    case 'pageViews':
      return t('mk.lead.reasons.pageViews', { n: r.n ?? 0 });
    case 'quiz':
      return t(`mk.lead.reasons.quiz.${r.key}`);
    case 'company':
      return t('mk.lead.reasons.company', { n: r.n ?? 0 });
    case 'recency':
      return t(`mk.lead.reasons.recency.${r.key}`);
    case 'contact':
      return t(`mk.lead.reasons.contact.${r.key}`);
    case 'estimate':
      return t('mk.lead.reasons.estimate');
    default:
      return r.code;
  }
};

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/**
 * Score badge for the inquiry list: level + points. The reasons are in the native tooltip (title) and
 * the accessible name, so they are never clipped by the list's rounded overflow container.
 */
export const LeadScoreBadge = ({ level, score, reasons, className }: { level: LeadLevel | null; score: number; reasons: ScoreReason[] | null; className?: string }) => {
  const { t } = useTranslation();
  if (!level) return null;
  const why = (reasons ?? []).map((r) => `${signed(r.points)} ${reasonLabel(t, r)}`).join('\n');
  const label = `${t('mk.lead.score')}: ${score} · ${t(`mk.lead.levels.${level}`)}`;
  return (
    <span title={why ? `${label}\n\n${why}` : label} aria-label={why ? `${label}. ${why.replace(/\n/g, '; ')}` : label} className={clsx('inline-flex', className)}>
      <Badge tone={LEVEL_TONE[level]} icon={LEVEL_ICON[level]} size="sm">
        <span className="tabular-nums">{score}</span>
      </Badge>
    </span>
  );
};

/** Reasons as a compact list (+points). */
export const ReasonList = ({ reasons }: { reasons: ScoreReason[] }) => {
  const { t } = useTranslation();
  return (
    <ul className="space-y-1 text-xs">
      {reasons.map((r, i) => (
        <li key={i} className="flex items-baseline justify-between gap-3">
          <span className="text-ink">{reasonLabel(t, r)}</span>
          <span className={clsx('shrink-0 font-semibold tabular-nums', r.points >= 0 ? 'text-success-fg' : 'text-danger-fg')}>{signed(r.points)}</span>
        </li>
      ))}
    </ul>
  );
};

/** Expanded inquiry: score reasons, visitor history (consent only), campaign, quiz and estimate. */
export const LeadDetailsPanel = ({ inquiryId }: { inquiryId: string }) => {
  const { t } = useTranslation();
  const { dateTime } = useL10n();
  const { data } = useQuery({
    queryKey: ['admin', 'inquiry-lead', inquiryId],
    queryFn: async () => (await api.get<LeadDetails>(`/admin/marketing/inquiries/${inquiryId}/lead`)).data,
    staleTime: 30_000,
  });
  if (!data) return null;
  const v = data.visitor;
  const counters = Object.entries(v?.events ?? {});
  const events = counters.filter(([k]) => !k.startsWith('page:') && !/^quiz_(high|medium|low)$/.test(k));
  const pages = counters.filter(([k]) => k.startsWith('page:')).sort((a, b) => b[1] - a[1]);
  const utm = data.utm ?? v?.utm ?? null;
  return (
    <div className="grid gap-4 rounded-lg border border-line bg-card p-3.5 sm:grid-cols-2">
      <div>
        <p className="mb-2 text-[11px] font-semibold tracking-wide text-muted uppercase">{t('mk.lead.reasonsTitle')}</p>
        {data.reasons.length ? <ReasonList reasons={data.reasons} /> : <p className="text-xs text-muted">{t('mk.lead.unscored')}</p>}
        {data.preview.score !== data.score && (
          <p className="mt-2 text-[11px] text-muted">{t('mk.lead.details.now', { score: data.preview.score, level: t(`mk.lead.levels.${data.preview.level}`) })}</p>
        )}
      </div>
      <div className="space-y-3 text-xs">
        <div>
          <p className="mb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">{t('mk.lead.details.visitor')}</p>
          {v ? (
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
              <dt className="text-muted">{t('mk.lead.details.visits')}</dt>
              <dd className="text-ink tabular-nums">{v.visits}</dd>
              <dt className="text-muted">{t('mk.lead.details.pageViews')}</dt>
              <dd className="text-ink tabular-nums">{v.pageViews}</dd>
              <dt className="text-muted">{t('mk.lead.details.firstSeen')}</dt>
              <dd className="text-ink">{dateTime(v.firstSeenAt)}</dd>
              <dt className="text-muted">{t('mk.lead.details.lastSeen')}</dt>
              <dd className="text-ink">{dateTime(v.lastSeenAt)}</dd>
            </dl>
          ) : (
            <p className="text-muted">{t('mk.lead.details.noVisitor')}</p>
          )}
        </div>
        {events.length > 0 && (
          <div>
            <p className="mb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">{t('mk.lead.details.events')}</p>
            <p className="text-ink">{events.map(([k, n]) => t(`mk.lead.reasons.event.${k}`, { n })).join(' · ')}</p>
          </div>
        )}
        {pages.length > 0 && (
          <div>
            <p className="mb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">{t('mk.lead.details.pages')}</p>
            <p className="text-ink">{pages.slice(0, 8).map(([k, n]) => `${k.slice(5)} ×${n}`).join(' · ')}</p>
          </div>
        )}
        {utm && (
          <div>
            <p className="mb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">{t('mk.lead.details.campaign')}</p>
            <p className="break-words text-ink">{Object.entries(utm).map(([k, val]) => `${k}=${val}`).join(' · ')}</p>
          </div>
        )}
        {data.quizResult?.fit && (
          <p>
            <span className="text-muted">{t('mk.lead.details.quiz')}: </span>
            <span className="text-ink">
              {t(`mk.lead.reasons.quiz.${data.quizResult.fit}`)}
              {data.quizResult.score != null && ` (${data.quizResult.score}/100)`}
            </span>
          </p>
        )}
        {data.estimate?.oneTime && (
          <p>
            <span className="text-muted">{t('mk.lead.details.estimate')}: </span>
            <span className="text-ink">
              {data.estimate.category?.visaLabel} · {t('mk.common.eurRange', { min: data.estimate.oneTime[0], max: data.estimate.oneTime[1] })}
              {data.estimate.refundable && data.estimate.refundable[1] > 0 && ` + ${t('mk.common.eur', { n: data.estimate.refundable[1] })}`}
            </span>
          </p>
        )}
        {data.landing && (
          <p>
            <span className="text-muted">{t('mk.lead.details.landing')}: </span>
            <a href={`/l/${data.landing.slug}`} target="_blank" rel="noreferrer" className="font-semibold text-link hover:underline">
              {data.landing.title}
            </a>
          </p>
        )}
      </div>
    </div>
  );
};
