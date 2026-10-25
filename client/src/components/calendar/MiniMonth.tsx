import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addMonths, dayKey, fmtMonthTitle, isToday, monthGrid, weekdayMin } from './utils';

/** Small month picker for the sidebar. */
export const MiniMonth = ({ month, selected, marks, onSelect, onMonthChange }: { month: Date; selected: Date; marks?: Set<string>; onSelect: (d: Date) => void; onMonthChange: (d: Date) => void }) => {
  const { t } = useTranslation();
  const days = monthGrid(month);
  const sel = dayKey(selected);
  return (
    <div className="select-none">
      <div className="mb-1 flex items-center justify-between">
        <button type="button" onClick={() => onMonthChange(addMonths(month, -1))} className="grid size-7 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink" aria-label={t('calendar.prev')}>
          <ChevronLeft className="size-4" />
        </button>
        <button type="button" onClick={() => onSelect(new Date())} className="text-xs font-bold text-ink hover:text-link">
          {fmtMonthTitle(month)}
        </button>
        <button type="button" onClick={() => onMonthChange(addMonths(month, 1))} className="grid size-7 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink" aria-label={t('calendar.next')}>
          <ChevronRight className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-[0.6rem] font-semibold text-muted">
        {weekdayMin().map((d, i) => (
          <span key={i} className="py-0.5">
            {d}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const k = dayKey(d);
          const other = d.getMonth() !== month.getMonth();
          return (
            <button
              key={k}
              type="button"
              onClick={() => onSelect(d)}
              className={clsx(
                'relative mx-auto my-0.5 grid size-6 place-items-center rounded-full text-[0.7rem] transition-colors',
                k === sel ? 'bg-primary font-bold text-primary-contrast' : isToday(d) ? 'font-bold text-link ring-1 ring-focus' : other ? 'text-muted hover:bg-sunken' : 'text-ink hover:bg-sunken',
              )}
              aria-pressed={k === sel}
            >
              {d.getDate()}
              {marks?.has(k) && k !== sel && <span className="absolute bottom-0.5 size-1 rounded-full bg-primary" aria-hidden />}
            </button>
          );
        })}
      </div>
    </div>
  );
};
