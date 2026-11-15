import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { BadgeCheck, Car, CalendarClock, GraduationCap, Languages, MapPin, Sparkles, Timer } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesPool } from '@/i18n/pagesPool';
import { fmtDay, type PoolCard } from './types';

registerCopy(pagesPool);

const Row = ({ icon: Icon, label, children }: { icon: typeof Car; label: string; children: ReactNode }) => (
  <div className="flex min-w-0 items-start gap-2.5">
    <Icon className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-sm break-words text-ink">{children}</dd>
    </div>
  </div>
);

/** Anonymous pool card (employer list / detail, the client's preview, staff preview). Shows only the card fields. */
export const PoolCardView = ({ card, detailed, actions, className }: { card: PoolCard; detailed?: boolean; actions?: ReactNode; className?: string }) => {
  const { t, i18n } = useTranslation();
  const p = (k: string) => t(`pool.${k}`);
  const regions = card.regions.length ? card.regions.map((r) => p(`regions.${r}`)).join(', ') : p('regions.ANY');
  const start = card.earliestStart ? fmtDay(card.earliestStart, i18n.language) : card.availability ? p(`availability.${card.availability}`) : '—';
  return (
    <article className={clsx('rounded-2xl border border-line bg-card p-4 sm:p-5', className)}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-xs font-semibold tracking-wide text-muted">{card.code}</p>
          <h3 className="type-card-title mt-0.5 break-words">{card.professions[0] ?? '—'}</h3>
          {card.professions.length > 1 && <p className="text-xs text-muted">{card.professions.slice(1).join(' · ')}</p>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="badge bg-brand-100 text-brand-700">{card.germanLevel && card.germanLevel !== 'none' ? `DE ${card.germanLevel}` : p('germanNone')}</span>
          <span className="badge bg-neutral-bg text-neutral-fg">{p(`track.${card.track}`)}</span>
        </div>
      </header>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <Row icon={Timer} label={p('labels.experience')}>
          {card.experienceYears != null ? t('pool.years', { n: card.experienceYears }) : '—'}
        </Row>
        <Row icon={BadgeCheck} label={p('labels.recognition')}>
          {p(`recognition.${card.recognitionStatus}`)}
        </Row>
        <Row icon={MapPin} label={p('labels.regions')}>
          {regions}
        </Row>
        <Row icon={CalendarClock} label={p('labels.start')}>
          {start}
        </Row>
        {(detailed || card.drivingLicences.length > 0) && (
          <Row icon={Car} label={p('labels.licences')}>
            {card.drivingLicences.length ? card.drivingLicences.join(', ') : '—'}
          </Row>
        )}
        {detailed && (
          <Row icon={GraduationCap} label={p('labels.education')}>
            {card.education ? p(`education.${card.education}`) : '—'}
          </Row>
        )}
        {(detailed || card.languages.length > 0) && (
          <Row icon={Languages} label={p('labels.languages')}>
            {card.languages.length ? card.languages.map((l) => `${p(`languages.${l.lang}`)} (${l.level === 'native' ? p('native') : l.level})`).join(', ') : '—'}
          </Row>
        )}
        {detailed && card.availability && (
          <Row icon={CalendarClock} label={p('labels.availability')}>
            {p(`availability.${card.availability}`)}
          </Row>
        )}
      </dl>
      {card.skills.length > 0 && (
        <div className="mt-4">
          <p className="sr-only">{p('labels.skills')}</p>
          <ul className="flex flex-wrap gap-1.5">
            {(detailed ? card.skills : card.skills.slice(0, 6)).map((s) => (
              <li key={s} className="rounded-lg border border-line px-2 py-0.5 text-xs text-ink">
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}
      {card.summary && (detailed || card.summary.length < 220) && (
        <div className="mt-4 rounded-xl bg-sunken p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
            <Sparkles className="size-3.5" aria-hidden /> {p('labels.summary')}
          </p>
          <p className="mt-1 text-sm leading-relaxed whitespace-pre-line text-ink">{card.summary}</p>
        </div>
      )}
      {actions && <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">{actions}</div>}
    </article>
  );
};
