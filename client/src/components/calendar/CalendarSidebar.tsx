import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { MiniMonth } from './MiniMonth';
import type { Person } from './types';
import { CALENDAR_DOT, TONES, fullName, userColor } from './utils';

export type ToggleKey = 'mine' | 'team' | 'case' | 'booking' | 'interview' | 'task';
export const TOGGLE_KEYS: ToggleKey[] = ['mine', 'team', 'case', 'booking', 'interview', 'task'];
const LABEL: Record<ToggleKey, string> = { mine: 'mine', team: 'team', case: 'cases', booking: 'bookings', interview: 'interviews', task: 'tasks' };

const Check = ({ on, dot, label, onChange }: { on: boolean; dot: string; label: string; onChange: () => void }) => (
  <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm text-ink hover:bg-sunken">
    <input type="checkbox" checked={on} onChange={onChange} className="sr-only" />
    <span className={clsx('grid size-4 shrink-0 place-items-center rounded border-2 transition-colors', on ? `${dot} border-transparent` : 'border-line bg-card')} aria-hidden>
      {on && <span className="size-1.5 rounded-sm bg-card" />}
    </span>
    <span className="truncate">{label}</span>
  </label>
);

export const CalendarSidebar = ({
  month,
  selected,
  marks,
  onSelectDay,
  onMonthChange,
  toggles,
  onToggle,
  people,
  meId,
  users,
  onToggleUser,
}: {
  month: Date;
  selected: Date;
  marks?: Set<string>;
  onSelectDay: (d: Date) => void;
  onMonthChange: (d: Date) => void;
  toggles: Record<ToggleKey, boolean>;
  onToggle: (k: ToggleKey) => void;
  people: Person[];
  meId: string;
  users: string[];
  onToggleUser: (id: string) => void;
}) => {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const colleagues = useMemo(() => {
    const s = q.trim().toLowerCase();
    return people.filter((p) => p.id !== meId && (!s || fullName(p).toLowerCase().includes(s)));
  }, [people, meId, q]);
  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-3">
      <MiniMonth month={month} selected={selected} marks={marks} onSelect={onSelectDay} onMonthChange={onMonthChange} />
      <div>
        <h3 className="mb-1 px-1.5 text-[0.68rem] font-bold tracking-[0.12em] text-muted uppercase">{t('calendar.calendars.title')}</h3>
        {TOGGLE_KEYS.map((k) => (
          <Check key={k} on={toggles[k]} dot={CALENDAR_DOT[k]} label={t(`calendar.calendars.${LABEL[k]}`)} onChange={() => onToggle(k)} />
        ))}
      </div>
      <div className="min-h-0">
        <h3 className="mb-1 px-1.5 text-[0.68rem] font-bold tracking-[0.12em] text-muted uppercase">{t('calendar.calendars.colleagues')}</h3>
        {people.length > 8 && (
          <label className="relative mb-1 block">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('calendar.calendars.searchPeople')} className="input py-1.5 pl-8 text-xs" />
          </label>
        )}
        <div className="max-h-72 overflow-y-auto">
          {colleagues.map((p) => (
            <Check key={p.id} on={users.includes(p.id)} dot={TONES[userColor(p.id)].dot} label={fullName(p)} onChange={() => onToggleUser(p.id)} />
          ))}
        </div>
      </div>
    </div>
  );
};
