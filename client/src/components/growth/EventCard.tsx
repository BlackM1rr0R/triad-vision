import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, CalendarDays, Globe2, MapPin, Users, Video } from 'lucide-react';
import clsx from 'clsx';
import { buttonClass } from '@/components/ui/Button';
import { useL10n } from '@/lib/l10n';
import { bakuTime, type PublicEvent } from './api';

export const EventMeta = ({ e }: { e: PublicEvent }) => {
  const { t } = useTranslation();
  const { locale } = useL10n();
  return (
    <ul className="space-y-1.5 text-sm text-muted">
      <li className="flex items-start gap-2">
        <CalendarDays className="mt-0.5 size-4 shrink-0 text-subtle" aria-hidden />
        <span>
          {bakuTime(e.startsAt, locale)} <span className="text-xs">{t('gp.events.bakuTime')}</span>
        </span>
      </li>
      <li className="flex items-start gap-2">
        {e.mode === 'ONLINE' ? <Video className="mt-0.5 size-4 shrink-0 text-subtle" aria-hidden /> : <MapPin className="mt-0.5 size-4 shrink-0 text-subtle" aria-hidden />}
        <span>{e.mode === 'ONLINE' ? t('gp.events.online') : `${t('gp.events.offline')}${e.address ? ` · ${e.address}` : ''}`}</span>
      </li>
      <li className="flex items-start gap-2">
        <Globe2 className="mt-0.5 size-4 shrink-0 text-subtle" aria-hidden />
        <span>{t('gp.events.language', { lang: t(`gp.events.langNames.${e.language}`) })}</span>
      </li>
      {e.seatsLeft != null && e.status === 'PUBLISHED' && (
        <li className="flex items-start gap-2">
          <Users className="mt-0.5 size-4 shrink-0 text-subtle" aria-hidden />
          <span>{e.seatsLeft > 0 ? t('gp.events.seatsLeft', { count: e.seatsLeft }) : t('gp.events.full')}</span>
        </li>
      )}
    </ul>
  );
};

export const EventBadge = ({ e }: { e: PublicEvent }) => {
  const { t } = useTranslation();
  if (e.status === 'CANCELLED') return <span className="rounded-full bg-danger-bg px-2.5 py-0.5 text-xs font-semibold text-danger-fg">{t('gp.events.cancelled')}</span>;
  if (!e.registrationOpen) return <span className="rounded-full bg-neutral-bg px-2.5 py-0.5 text-xs font-semibold text-neutral-fg">{e.seatsLeft === 0 ? t('gp.events.full') : t('gp.events.closed')}</span>;
  return (
    <span className={clsx('rounded-full px-2.5 py-0.5 text-xs font-semibold', e.mode === 'ONLINE' ? 'chip-sky' : 'chip-sage')}>
      {e.mode === 'ONLINE' ? t('gp.events.online') : t('gp.events.offline')}
    </span>
  );
};

export const EventCard = ({ e }: { e: PublicEvent }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  return (
    <article className="card card-pad flex h-full flex-col items-start rounded-3xl">
      <EventBadge e={e} />
      <h3 className="mt-3 font-display text-lg leading-snug font-semibold text-ink">{tr(e.title)}</h3>
      <p className="mt-2 line-clamp-3 text-sm text-muted">{tr(e.description)}</p>
      <div className="mt-4 w-full flex-1">
        <EventMeta e={e} />
      </div>
      <Link to={`/events/${e.slug}`} className={buttonClass({ variant: 'outline', block: true, className: 'mt-5' })}>
        {t('gp.events.details')} <ArrowRight className="size-4" aria-hidden />
      </Link>
    </article>
  );
};
