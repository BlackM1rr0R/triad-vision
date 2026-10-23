import { useMemo } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { MapPin, Repeat, Video } from 'lucide-react';
import type { CalItem } from './types';
import { addDays, dayKey, fmtDayLong, fmtTime, isToday, itemsOnDay } from './utils';

/** Upcoming items grouped by day (30 days from `from`). Also the phone-friendly view. */
export const AgendaView = ({ from, days = 30, items, onOpenItem }: { from: Date; days?: number; items: CalItem[]; onOpenItem: (item: CalItem, rect: DOMRect) => void }) => {
  const { t } = useTranslation();
  const groups = useMemo(() => {
    const out: { day: Date; list: CalItem[] }[] = [];
    for (let i = 0; i < days; i++) {
      const day = addDays(from, i);
      const list = itemsOnDay(items, day);
      if (list.length) out.push({ day, list });
    }
    return out;
  }, [from, days, items]);
  if (!groups.length) return <p className="p-10 text-center text-sm text-muted">{t('calendar.labels.agendaEmpty')}</p>;
  return (
    <div className="h-full overflow-y-auto overscroll-contain">
      {groups.map(({ day, list }) => (
        <section key={dayKey(day)} className="border-b border-line">
          <h3 className={clsx('sticky top-0 z-[1] bg-card px-4 py-2 text-xs font-bold tracking-wide uppercase', isToday(day) ? 'text-brand-600' : 'text-muted')}>{fmtDayLong(day)}</h3>
          <ul className="pb-2">
            {list.map((it) => {
              const raw = it.raw;
              const location = 'location' in raw ? raw.location : null;
              const meeting = 'meetingUrl' in raw ? raw.meetingUrl : null;
              return (
                <li key={it.key}>
                  <button type="button" onClick={(e) => onOpenItem(it, e.currentTarget.getBoundingClientRect())} className="flex w-full items-start gap-3 px-4 py-2 text-left hover:bg-surface">
                    <span className="w-24 shrink-0 pt-0.5 text-xs text-muted">{it.allDay ? t('calendar.labels.allDay') : `${fmtTime(it.start)} – ${fmtTime(it.end)}`}</span>
                    <span className={clsx('mt-1.5 size-2.5 shrink-0 rounded-full', it.tone.dot)} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className={clsx('block truncate text-sm font-semibold text-ink', it.busy && 'italic text-muted')}>{it.title}</span>
                      <span className="flex flex-wrap gap-x-3 text-xs text-muted">
                        <span>{t(`calendar.sources.${it.source}`)}</span>
                        {location && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="size-3" /> {location}
                          </span>
                        )}
                        {meeting && (
                          <span className="inline-flex items-center gap-1">
                            <Video className="size-3" /> {t('calendar.actions.join')}
                          </span>
                        )}
                        {it.source === 'event' && 'rrule' in raw && raw.rrule && (
                          <span className="inline-flex items-center gap-1">
                            <Repeat className="size-3" /> {t('calendar.labels.recurring')}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
};
