import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlertTriangle, Building2, CheckCircle2, Hand, Hourglass, Landmark } from 'lucide-react';
import { useBallLine } from '@/components/clientProcess/Ball';
import { SIDE_TONE, type BallInCourt, type BallSide } from '@/components/clientProcess/api';
import { Badge } from '@/components/ui/Badge';

const ICON: Record<BallSide, typeof Hand> = { CLIENT: Hand, TEAM: Hourglass, EMBASSY: Landmark, NONE: CheckCircle2 };

/**
 * One-line "Top kimdədir?" strip under the sticky case header (always visible). The full panel with the
 * time-per-side bar stays on the Ümumi tab.
 */
export default function BallStrip({ ball, onDetails }: { ball: BallInCourt | null | undefined; onDetails?: () => void }) {
  const { t } = useTranslation();
  const line = useBallLine('staff');
  if (!ball) return null;
  const Icon = ICON[ball.side] ?? Building2;
  const rest = ball.items.slice(1);
  return (
    <section
      id="case-ball"
      aria-label={t('cp.ball.title')}
      className={clsx('relative flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 overflow-hidden rounded-xl border bg-card py-2.5 pr-3 pl-4', ball.overdue ? 'border-danger-border' : 'border-line')}
    >
      <span className={clsx('absolute inset-y-0 left-0 w-1', SIDE_TONE[ball.side].bar)} aria-hidden />
      <span className={clsx('grid size-8 shrink-0 place-items-center rounded-lg', SIDE_TONE[ball.side].chip)}>
        <Icon className="size-4" aria-hidden />
      </span>
      <p className="min-w-0 flex-[1_1_14rem] text-sm">
        <span className="text-xs font-semibold tracking-wide text-muted uppercase">{t('cp.ball.title')}</span>{' '}
        <span className="font-bold text-ink">{t(`cp.ball.sideStaff.${ball.side}`)}</span>
        {ball.side !== 'NONE' && <span className="text-ink/85"> — {line(ball)}</span>}
      </p>
      <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
        {ball.side !== 'NONE' && <span>{ball.days > 0 ? t('cp.ball.since', { count: ball.days }) : t('cp.ball.sinceToday')}</span>}
        {ball.overdue && (
          <Badge tone="danger" icon={AlertTriangle} size="sm">
            {ball.side === 'CLIENT' ? t('cp.ball.overdue') : t('cp.ball.late')}
          </Badge>
        )}
        {rest.length > 0 && (
          <button
            type="button"
            onClick={onDetails}
            className="rounded-md px-1.5 py-0.5 font-semibold text-link hover:bg-primary/[0.06]"
            title={rest.map((i) => t(`cp.ball.sideStaff.${i.side}`)).join(' · ')}
          >
            {t('cp.ball.alsoStaff')} +{rest.length}
          </button>
        )}
      </span>
    </section>
  );
}
