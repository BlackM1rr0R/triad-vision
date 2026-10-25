import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Icon } from '@/components/ui/Icon';
import { useL10n } from '@/lib/l10n';
import type { Service } from '@/lib/types';
import { servicePhase } from '@/components/visa/utils';

const PHASE_ICONS = ['UserSearch', 'FileCheck2', 'Stamp', 'Plane'];
const CHIPS = ['chip-soft', 'chip-sage', 'chip-sky', 'chip-peach'];

/** Connector arrow: horizontal between columns on large screens, vertical between stacked phases below. */
const Arrow = ({ index }: { index: number }) => (
  <>
    <svg aria-hidden viewBox="0 0 40 24" className="mx-auto hidden h-6 w-10 self-center text-subtle lg:block">
      <motion.path
        d="M2 12 H32"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="4 5"
        fill="none"
        initial={{ pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, delay: 0.2 + index * 0.2 }}
      />
      <path d="M30 6 L38 12 L30 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
    <svg aria-hidden viewBox="0 0 24 32" className="mx-auto h-8 w-6 text-subtle lg:hidden">
      <path d="M12 2 V24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="4 5" fill="none" />
      <path d="M6 20 L12 28 L18 20" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  </>
);

/** The four journey stages with the services that belong to each. */
export const JourneyFlow = ({ services }: { services: Service[] }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const phases = t('servicesPage.journey.phases', { returnObjects: true }) as {
    title: string;
    text: string;
  }[];

  return (
    <div role="group" aria-label={t('servicesPage.journey.aria')} className="grid gap-1 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] lg:gap-2">
      {phases.map((p, i) => {
        const items = services.filter((s) => servicePhase(s.slug) === i);
        return (
          <Fragment key={p.title}>
            {i > 0 && <Arrow index={i} />}
            <motion.div
              className="flex flex-col rounded-3xl border border-line bg-card p-4 shadow-[var(--tv-shadow-card)] sm:p-5"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.6, delay: i * 0.15 }}
            >
              <div className="flex items-center gap-3">
                <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${CHIPS[i % CHIPS.length]}`}>
                  <Icon name={PHASE_ICONS[i]} className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold tracking-widest text-highlight-fg uppercase">0{i + 1}</p>
                  <h3 className="font-display text-lg leading-tight font-semibold text-ink">{p.title}</h3>
                </div>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted">{p.text}</p>
              <ul className="mt-4 space-y-2">
                {items.map((s) => (
                  <li key={s.id}>
                    <Link
                      to={`/services/${s.slug}`}
                      className="flex min-h-11 items-center gap-2.5 rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-line-strong hover:bg-sunken"
                    >
                      <Icon name={s.icon} className="size-4 shrink-0 text-muted" />
                      <span className="min-w-0 leading-snug">{tr(s.title)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </motion.div>
          </Fragment>
        );
      })}
    </div>
  );
};
