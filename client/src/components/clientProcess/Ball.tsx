import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlertTriangle, Building2, CheckCircle2, Hand, Hourglass, Landmark } from 'lucide-react';
import { useL10n } from '@/lib/l10n';
import { SIDE_TONE, useEtaText, type BallInCourt, type BallItem, type BallSide } from './api';

const ICON: Record<BallSide, typeof Hand> = { CLIENT: Hand, TEAM: Building2, EMBASSY: Landmark, NONE: CheckCircle2 };

/** One line: "2 sənəd yükləyin · son tarix 25 okt" / "sənədləriniz yoxlanılır · təxminən 24 saat". */
export const useBallLine = (audience: 'client' | 'staff') => {
  const { t } = useTranslation();
  const { date } = useL10n();
  const eta = useEtaText();
  const ns = audience === 'client' ? 'cp.reason' : 'cp.reasonStaff';
  return (b: Pick<BallInCourt, 'side' | 'reason' | 'count' | 'dueAt' | 'eta'>) => {
    const parts = [t(`${ns}.${b.reason}`, { count: b.count })];
    if (b.side === 'CLIENT' && b.dueAt) parts.push(t('cp.ball.due', { date: date(b.dueAt, { day: 'numeric', month: 'short' }) }));
    if ((b.side === 'TEAM' || b.side === 'EMBASSY') && b.eta) parts.push(eta(b.eta));
    return parts.join(' · ');
  };
};

const itemText = (t: ReturnType<typeof useTranslation>['t'], ns: string, i: BallItem) => t(`${ns}.${i.reason}`, { count: i.count });

/** Client portal: big card at the top of the case page. */
export const BallCard = ({ ball }: { ball: BallInCourt | null | undefined }) => {
  const { t } = useTranslation();
  const line = useBallLine('client');
  if (!ball) return null;
  const Icon = ICON[ball.side];
  const others = ball.side !== 'CLIENT' ? ball.items.filter((i) => i.side === 'CLIENT') : [];
  const clientTurn = ball.side === 'CLIENT';
  return (
    <section
      className={clsx('card relative overflow-hidden p-5 sm:p-6', clientTurn && 'border-brand-400/40 ring-4 ring-brand-500/10', ball.overdue && clientTurn && 'border-red-300 ring-red-500/10')}
      aria-labelledby="ball-title"
    >
      <span className={clsx('absolute inset-y-0 left-0 w-1.5', SIDE_TONE[ball.side].bar)} aria-hidden />
      <div className="flex items-start gap-4">
        <span className={clsx('grid size-11 shrink-0 place-items-center rounded-xl', SIDE_TONE[ball.side].chip)}>
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="eyebrow">{t('cp.ball.title')}</p>
          <h2 id="ball-title" className="mt-1 text-lg font-extrabold break-words text-navy-900 sm:text-xl">
            {t(`cp.ball.side.${ball.side}`)}
            {ball.side !== 'NONE' && <span className="font-semibold text-muted">: </span>}
            {ball.side !== 'NONE' && <span className="font-semibold text-navy-900">{line(ball)}</span>}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
            {ball.side !== 'NONE' && <span>{ball.days > 0 ? t('cp.ball.since', { count: ball.days }) : t('cp.ball.sinceToday')}</span>}
            {ball.overdue && (
              <span className="badge bg-danger-bg text-danger-fg">
                <AlertTriangle className="size-3.5" aria-hidden /> {clientTurn ? t('cp.ball.overdue') : t('cp.ball.late')}
              </span>
            )}
          </div>
          {others.length > 0 && (
            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <span className="font-semibold">{t('cp.ball.also')}:</span> {others.map((i) => itemText(t, 'cp.reason', i)).join(' · ')}
            </p>
          )}
        </div>
      </div>
    </section>
  );
};

/** Admin cases list: compact chip. */
export const BallChip = ({ ball }: { ball: BallInCourt | null | undefined }) => {
  const { t } = useTranslation();
  const line = useBallLine('staff');
  if (!ball) return <span className="text-xs text-muted">—</span>;
  return (
    <span className="inline-flex max-w-56 flex-col gap-0.5" title={line(ball)}>
      <span className={clsx('badge w-fit whitespace-nowrap', SIDE_TONE[ball.side].chip, ball.overdue && 'ring-1 ring-red-400')}>
        {t(`cp.ball.sideStaff.${ball.side}`)}
        {ball.side !== 'NONE' && ` · ${t('cp.ball.days', { count: ball.days })}`}
      </span>
      {ball.side !== 'NONE' && <span className="truncate text-[11px] text-muted">{line(ball)}</span>}
    </span>
  );
};

/** Admin case header: side, reason, ETA, other items and a bar of the time per side. */
export const BallPanel = ({ ball }: { ball: BallInCourt | null | undefined }) => {
  const { t } = useTranslation();
  const line = useBallLine('staff');
  const { date } = useL10n();
  if (!ball) return null;
  const Icon = ball.side === 'TEAM' ? Hourglass : ICON[ball.side];
  const rest = ball.items.slice(1);
  const total = ball.totals.CLIENT + ball.totals.TEAM + ball.totals.EMBASSY || 1;
  return (
    <section className="rounded-2xl border border-line bg-card p-4 sm:p-5" aria-label={t('cp.ball.title')}>
      <div className="flex flex-wrap items-start gap-3">
        <span className={clsx('grid size-10 shrink-0 place-items-center rounded-xl', SIDE_TONE[ball.side].chip)}>
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">{t('cp.ball.title')}</p>
          <p className="mt-0.5 font-bold break-words text-navy-900">
            {t(`cp.ball.sideStaff.${ball.side}`)}
            {ball.side !== 'NONE' && <span className="font-medium"> — {line(ball)}</span>}
          </p>
          <p className="mt-1 text-xs text-muted">
            {ball.side !== 'NONE' && (ball.days > 0 ? t('cp.ball.since', { count: ball.days }) : t('cp.ball.sinceToday'))}
            {ball.overdue && <span className="ml-2 font-semibold text-red-600">{ball.side === 'CLIENT' ? t('cp.ball.overdue') : t('cp.ball.late')}</span>}
          </p>
          {rest.length > 0 && (
            <p className="mt-2 text-sm text-navy-900">
              <span className="font-semibold">{t('cp.ball.alsoStaff')}:</span>{' '}
              {rest.map((i) => `${t(`cp.ball.sideStaff.${i.side}`)} — ${itemText(t, 'cp.reasonStaff', i)}${i.dueAt ? ` (${date(i.dueAt, { day: 'numeric', month: 'short' })})` : ''}`).join(' · ')}
            </p>
          )}
        </div>
      </div>
      {total > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-semibold text-muted">{t('cp.ball.timeline')}</p>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={t('cp.ball.timeline')}>
            {(['CLIENT', 'TEAM', 'EMBASSY'] as const).map((s) =>
              ball.totals[s] > 0 ? <span key={s} className={SIDE_TONE[s].bar} style={{ width: `${(ball.totals[s] / total) * 100}%` }} /> : null,
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            {(['CLIENT', 'TEAM', 'EMBASSY'] as const).map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5">
                <span className={clsx('size-2 rounded-full', SIDE_TONE[s].bar)} aria-hidden />
                {t(`cp.ball.totals.${s}`)}: {t('cp.ball.days', { count: Math.round(ball.totals[s]) })}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
