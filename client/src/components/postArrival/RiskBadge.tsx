import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { TONE_CLASS, type BadgeTone } from '@/components/ui/status';
import { registerCopy } from '@/i18n';
import { pagesPostArrival } from '@/i18n/pagesPostArrival';
import { pagesTimeCare } from '@/i18n/pagesTimeCare';

registerCopy(pagesTimeCare);
registerCopy(pagesPostArrival);

export const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

/** One rule of the churn-risk score (server lib/checkIns/risk.ts). */
export interface RiskReason {
  code: 'WORKER_ISSUE' | 'EMPLOYER_ISSUE' | 'OPEN_ISSUE' | 'TOPIC' | 'NO_ANSWER' | 'TREND_WORSE' | 'TREND_BETTER' | 'PROBATION_SOON';
  points: number;
  params?: Record<string, string | number>;
}

const TONE: Record<RiskLevel, BadgeTone> = { LOW: 'success', MEDIUM: 'warning', HIGH: 'danger' };

/** "Yüksək risk · 72/100" chip of an arrived worker. */
export const RiskBadge = ({ level, score }: { level: string | null; score: number | null }) => {
  const { t } = useTranslation();
  if (!level || score === null) return <span className="badge bg-neutral-bg text-neutral-fg">{t('postArrival.risk.none')}</span>;
  return (
    <span className={clsx('badge whitespace-nowrap tabular-nums', TONE[level as RiskLevel] ? TONE_CLASS[TONE[level as RiskLevel]] : TONE_CLASS.neutral)} title={t('postArrival.risk.title')}>
      {t(`postArrival.risk.levels.${level}`)} · {t('postArrival.risk.score', { score })}
    </span>
  );
};

/** The reasons behind the score, strongest first (topic codes translated with the check-in topic labels). */
export const RiskReasons = ({ reasons, className }: { reasons: RiskReason[]; className?: string }) => {
  const { t } = useTranslation();
  if (!reasons.length) return null;
  return (
    <ul className={clsx('flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted', className)} aria-label={t('postArrival.risk.reasonsTitle')}>
      {reasons.map((r, i) => (
        <li key={`${r.code}${i}`} className={clsx(r.points < 0 && 'text-success-fg')}>
          {t(`postArrival.risk.reasons.${r.code}`, { ...r.params, topic: r.params?.topic ? t(`checkIn.topics.${r.params.topic}`) : undefined })}
          <span className="ml-1 tabular-nums opacity-70">
            ({r.points > 0 ? '+' : ''}
            {r.points})
          </span>
        </li>
      ))}
    </ul>
  );
};
