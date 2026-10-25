import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { Check, FileCheck2, Landmark, MapPin, Minus, PenLine, Plane, Stamp, X } from 'lucide-react';
import { useL10n } from '@/lib/l10n';
import type { Milestone, MilestoneKey } from './journey';

export const MILESTONE_ICON: Record<MilestoneKey, LucideIcon> = {
  documents: FileCheck2,
  contract: PenLine,
  embassy: Landmark,
  decision: Stamp,
  travel: Plane,
  arrival: MapPin,
};

/** "on 3 May" / "Expected: 3 – 20 May" / "Planned: 12 June" for a milestone (empty when there is no date). */
export const useMilestoneDate = () => {
  const { t } = useTranslation();
  const { date } = useL10n();
  const fmt = (iso: string) => date(iso, { day: 'numeric', month: 'short', year: 'numeric' });
  return (m: Milestone): string => {
    if (m.dateKind === 'done' && m.date) return t('jmap.doneOn', { date: fmt(m.date) });
    if (m.dateKind === 'planned' && m.date) return t('jmap.planned', { date: fmt(m.date) });
    if (m.dateKind === 'expected' && m.to) {
      return m.from && fmt(m.from) !== fmt(m.to) ? t('jmap.expectedRange', { from: date(m.from, { day: 'numeric', month: 'short' }), to: fmt(m.to) }) : t('jmap.expected', { date: fmt(m.to) });
    }
    return '';
  };
};

const DOT: Record<Milestone['status'], string> = {
  done: 'bg-highlight text-highlight-contrast',
  current: 'bg-highlight-bg text-ink ring-2 ring-highlight',
  upcoming: 'border border-line bg-card text-muted',
  skipped: 'border border-dashed border-line bg-sunken text-muted',
};

/**
 * The journey as an ordered list (the accessible version of the map, and the only one on phones): one row per
 * milestone with an icon, its state in words and its date. The connector line is filled up to the current step.
 */
export function JourneyTimeline({ milestones, labelOf, className }: { milestones: Milestone[]; labelOf: (m: Milestone) => string; className?: string }) {
  const { t } = useTranslation();
  const dateOf = useMilestoneDate();
  return (
    <ol aria-label={t('jmap.listLabel')} className={clsx('min-w-0', className)}>
      {milestones.map((m, i) => {
        const Icon = m.negative ? X : m.status === 'done' ? Check : m.status === 'skipped' ? Minus : MILESTONE_ICON[m.key];
        const when = dateOf(m);
        const last = i === milestones.length - 1;
        const nextDone = !last && (milestones[i + 1].status === 'done' || milestones[i + 1].status === 'current');
        return (
          <motion.li
            key={m.key}
            className="relative flex gap-3 pb-4 last:pb-0"
            aria-current={m.status === 'current' ? 'step' : undefined}
            initial={{ opacity: 0, x: -8 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-20px' }}
            transition={{ duration: 0.35, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
          >
            {!last && <span className={clsx('absolute top-9 bottom-1 left-[15px] w-0.5 rounded-full', nextDone ? 'bg-highlight' : 'bg-line')} aria-hidden />}
            <span className={clsx('relative grid size-8 shrink-0 place-items-center rounded-full', m.negative ? 'bg-danger-bg text-danger-fg' : DOT[m.status])} aria-hidden>
              <Icon className="size-4" />
            </span>
            <span className="min-w-0 flex-1 pt-1">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className={clsx('text-sm font-semibold break-words', m.status === 'skipped' ? 'text-muted line-through decoration-line' : 'text-ink')}>{labelOf(m)}</span>
                <span
                  className={clsx(
                    'text-xs font-semibold',
                    m.negative ? 'text-danger-fg' : m.status === 'current' ? 'text-highlight-fg' : m.status === 'done' ? 'text-success-fg' : 'text-muted',
                  )}
                >
                  {m.negative ? t('jmap.rejected') : t(`jmap.status.${m.status}`)}
                </span>
              </span>
              {when && <span className="mt-0.5 block text-xs text-muted">{when}</span>}
            </span>
          </motion.li>
        );
      })}
    </ol>
  );
}
