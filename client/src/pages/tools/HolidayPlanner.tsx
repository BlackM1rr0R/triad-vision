import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { CalendarDays, CalendarPlus, Download, Sun } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { buttonClass } from '@/components/ui/Button';
import { RelatedGuides } from '@/components/guides/RelatedGuides';
import { registerCopy } from '@/i18n';
import { pagesHolidayPlanner } from '@/i18n/pagesHolidayPlanner';
import { usePageTitle } from '@/lib/usePageTitle';
import { STATE_NAMES } from '@/lib/salary';
import {
  bridgeDays,
  dayNumber,
  fromDayNumber,
  HOLIDAY_DE,
  HOLIDAY_STATES,
  HOLIDAY_YEARS,
  HOLIDAYS_CHECKED,
  holidaysFor,
  holidaysIcs,
  isoDate,
  isWeekend,
  nextDay,
  weekday,
  type BridgeOption,
  type HolidayState,
} from '@/lib/publicCalc/holidays';
import { Disclaimer, dmy, GlossaryLinks, Sources, ToolFaq, useFaq } from '@/components/tools/calc/CalcShared';

registerCopy(pagesHolidayPlanner);

const SOURCES = [
  { label: 'DGB – Gesetzliche Feiertage in Deutschland (nach Bundesland)', url: 'https://www.dgb.de/service/ratgeber/feiertage/' },
  { label: '§ 3b EStG – Feiertagszuschläge (Feiertage am Arbeitsort)', url: 'https://www.gesetze-im-internet.de/estg/__3b.html' },
  { label: 'Bundesurlaubsgesetz (BUrlG) – Mindesturlaub', url: 'https://www.gesetze-im-internet.de/burlg/' },
];

const download = (content: string, filename: string) => {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/**
 * /holiday-planner — public holidays of every Bundesland 2026 – 2028 (computed in lib/publicCalc/holidays.ts),
 * a year calendar, the best bridge days and an .ics download (generated in the browser).
 */
export default function HolidayPlannerPage() {
  const { t } = useTranslation();
  usePageTitle(t('holidayPlanner.heroTitle'));
  const faq = useFaq('holidayPlanner.faq');
  const [state, setState] = useState<HolidayState>('BE');
  const [year, setYear] = useState<number>(2027);
  const [maxVacation, setMaxVacation] = useState(4);
  const holidays = useMemo(() => holidaysFor(state, year), [state, year]);
  const bridges = useMemo(() => bridgeDays(state, year, maxVacation), [state, year, maxVacation]);
  const weekdays = t('holidayPlanner.weekdays', { returnObjects: true }) as unknown as string[];
  const months = t('holidayPlanner.months', { returnObjects: true }) as unknown as string[];
  const name = (k: keyof typeof HOLIDAY_DE) => t(`holidayPlanner.names.${k}`);
  const holidayMap = useMemo(() => new Map(holidays.map((h) => [h.date, h])), [holidays]);
  const vacationSet = useMemo(() => new Set(bridges.flatMap((b) => b.vacationDates)), [bridges]);
  const wd = (iso: string) => (Array.isArray(weekdays) ? weekdays[weekday(iso)] : '');

  const icsAll = () => {
    const events = holidays.map((h) => ({
      date: h.date,
      summary: `${name(h.key)} (${HOLIDAY_DE[h.key]})${h.partial ? ` – ${t('holidayPlanner.partialShort')}` : ''}`,
      description: `${STATE_NAMES[state]} · triad-vision.de/holiday-planner`,
      uid: `${h.date}-${h.key}-${state}@triad-vision.de`,
    }));
    download(holidaysIcs(events, `${t('holidayPlanner.icsName')} ${STATE_NAMES[state]} ${year}`, stamp()), `feiertage-${state.toLowerCase()}-${year}.ics`);
  };
  const icsBridge = (b: BridgeOption) => {
    const events = [
      {
        date: b.start,
        endExclusive: nextDay(b.end),
        summary: t('holidayPlanner.bridgeIcs', { off: b.daysOff, vac: b.vacationDays }),
        description: `${t('holidayPlanner.book')}: ${b.vacationDates.map(dmy).join(', ')}`,
        uid: `bridge-${b.start}-${b.end}-${state}@triad-vision.de`,
      },
    ];
    download(holidaysIcs(events, t('holidayPlanner.icsName'), stamp()), `brueckentage-${b.start}.ics`);
  };

  return (
    <>
      <PageHero title={t('holidayPlanner.heroTitle')} subtitle={t('holidayPlanner.heroSubtitle')} crumb={{ to: '/tools', label: t('siteNav.tools') }} />
      <section className="section">
        <div className="container-x space-y-6">
          <form className="grid gap-3 rounded-3xl border border-line bg-card p-4 sm:grid-cols-3 sm:p-5" onSubmit={(e) => e.preventDefault()} aria-label={t('holidayPlanner.form')}>
            <div>
              <label htmlFor="hp-state" className="label">
                {t('holidayPlanner.state')}
              </label>
              <select id="hp-state" className="input" value={state} onChange={(e) => setState(e.target.value as HolidayState)}>
                {HOLIDAY_STATES.map((s) => (
                  <option key={s} value={s}>
                    {STATE_NAMES[s]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="hp-year" className="label">
                {t('holidayPlanner.year')}
              </label>
              <select id="hp-year" className="input" value={year} onChange={(e) => setYear(Number(e.target.value))}>
                {HOLIDAY_YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="hp-max" className="label">
                {t('holidayPlanner.maxVacation')}
              </label>
              <select id="hp-max" className="input" value={maxVacation} onChange={(e) => setMaxVacation(Number(e.target.value))}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </form>

          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
                  <CalendarDays className="size-5 text-primary" aria-hidden /> {t('holidayPlanner.listTitle', { state: STATE_NAMES[state], year })}
                </h2>
                <button type="button" className={buttonClass({ variant: 'outline', size: 'sm' })} onClick={icsAll}>
                  <Download className="size-4" aria-hidden /> {t('holidayPlanner.downloadIcs')}
                </button>
              </div>
              <ul className="divide-y divide-line rounded-3xl border border-line bg-card">
                {holidays.map((h) => (
                  <li key={`${h.date}-${h.key}`} className="flex items-start justify-between gap-3 px-4 py-2.5">
                    <div>
                      <p className="font-semibold text-ink">{name(h.key)}</p>
                      <p className="text-xs text-muted" translate="no">
                        {HOLIDAY_DE[h.key]}
                      </p>
                      {h.partial && <p className="mt-0.5 text-xs text-warning-fg">{t(`holidayPlanner.partial.${h.key}`, { defaultValue: t('holidayPlanner.partialShort') })}</p>}
                    </div>
                    <div className="text-right text-sm tabular-nums">
                      <p className="font-semibold text-ink">{dmy(h.date)}</p>
                      <p className={clsx('text-xs', isWeekend(h.date) ? 'text-warning-fg' : 'text-muted')}>
                        {wd(h.date)}
                        {isWeekend(h.date) && ` · ${t('holidayPlanner.weekend')}`}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted">{t('holidayPlanner.countNote', { n: holidays.filter((h) => !h.partial).length })}</p>
            </div>

            <div className="space-y-3">
              <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
                <Sun className="size-5 text-primary" aria-hidden /> {t('holidayPlanner.bridgeTitle')}
              </h2>
              {bridges.length ? (
                <ul className="space-y-2">
                  {bridges.map((b) => (
                    <li key={`${b.start}-${b.end}`} className="rounded-2xl border border-line bg-card p-4">
                      <p className="font-display text-lg font-semibold text-ink">{t('holidayPlanner.bridgeItem', { vac: b.vacationDays, off: b.daysOff })}</p>
                      <p className="text-sm text-muted">
                        {dmy(b.start)} – {dmy(b.end)} · {b.holidays.map((k) => name(k)).join(', ')}
                      </p>
                      <p className="mt-1 text-sm text-ink">
                        {t('holidayPlanner.book')}: {b.vacationDates.map((d) => `${wd(d)} ${dmy(d).slice(0, 5)}`).join(', ')}
                      </p>
                      <button type="button" className={clsx(buttonClass({ variant: 'ghost', size: 'sm' }), 'mt-1 -ml-2')} onClick={() => icsBridge(b)}>
                        <CalendarPlus className="size-4" aria-hidden /> {t('holidayPlanner.addToCalendar')}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-2xl border border-line bg-card p-4 text-sm text-muted">{t('holidayPlanner.noBridges')}</p>
              )}
              <p className="text-xs leading-snug text-muted">{t('holidayPlanner.bridgeNote')}</p>
            </div>
          </div>

          <div>
            <h2 className="font-display text-xl font-semibold text-ink">{t('holidayPlanner.calendarTitle', { year })}</h2>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted" aria-hidden>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-3 rounded bg-primary" /> {t('holidayPlanner.legendHoliday')}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-3 rounded bg-success-bg ring-1 ring-success-border" /> {t('holidayPlanner.legendBridge')}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-3 rounded bg-sunken ring-1 ring-line" /> {t('holidayPlanner.legendWeekend')}
              </span>
            </div>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 12 }, (_, m) => (
                <MonthGrid key={m} year={year} month={m + 1} title={Array.isArray(months) ? months[m] : String(m + 1)} weekdays={Array.isArray(weekdays) ? weekdays : []} holidayMap={holidayMap} vacation={vacationSet} name={name} />
              ))}
            </div>
          </div>

          <GlossaryLinks
            terms={[
              { slug: 'urlaubsanspruch', label: 'Urlaubsanspruch' },
              { slug: 'arbeitsvertrag', label: 'Arbeitsvertrag' },
              { slug: 'schichtarbeit', label: 'Schichtarbeit' },
              { slug: 'arbeitszeit', label: 'Arbeitszeit' },
            ]}
          />
          <div className="flex flex-wrap gap-2">
            <Link to="/shift-pay-calculator" className={buttonClass({ variant: 'outline' })}>
              {t('holidayPlanner.actions.shift')}
            </Link>
          </div>
          <Disclaimer>{t('holidayPlanner.disclaimer')}</Disclaimer>
          <Sources checked={HOLIDAYS_CHECKED} items={SOURCES} />
        </div>
      </section>
      <ToolFaq items={faq} />
      <RelatedGuides tool="/holiday-planner" />
    </>
  );
}

const MonthGrid = ({
  year,
  month,
  title,
  weekdays,
  holidayMap,
  vacation,
  name,
}: {
  year: number;
  month: number;
  title: string;
  weekdays: string[];
  holidayMap: Map<string, { key: keyof typeof HOLIDAY_DE; partial: boolean }>;
  vacation: Set<string>;
  name: (k: keyof typeof HOLIDAY_DE) => string;
}) => {
  const first = isoDate(year, month, 1);
  const start = dayNumber(first);
  const days = dayNumber(month === 12 ? isoDate(year + 1, 1, 1) : isoDate(year, month + 1, 1)) - start;
  const lead = (weekday(first) + 6) % 7; // Monday first
  const order = [1, 2, 3, 4, 5, 6, 0];
  return (
    <div className="rounded-2xl border border-line bg-card p-3">
      <h3 className="mb-2 text-sm font-semibold text-ink">{title}</h3>
      <table className="w-full table-fixed border-collapse text-center text-xs">
        <thead>
          <tr>
            {order.map((d) => (
              <th key={d} scope="col" className="pb-1 font-medium text-muted">
                {weekdays[d]?.slice(0, 2)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: Math.ceil((lead + days) / 7) }, (_, w) => (
            <tr key={w}>
              {Array.from({ length: 7 }, (_, c) => {
                const n = w * 7 + c - lead;
                if (n < 0 || n >= days) return <td key={c} />;
                const iso = fromDayNumber(start + n);
                const h = holidayMap.get(iso);
                const label = h ? `${n + 1}: ${name(h.key)}` : undefined;
                return (
                  <td key={c} className="p-0.5">
                    <span
                      title={label}
                      aria-label={label}
                      className={clsx(
                        'flex h-7 items-center justify-center rounded-md tabular-nums',
                        h && !h.partial && 'bg-primary font-semibold text-primary-contrast',
                        h?.partial && 'font-semibold text-primary ring-1 ring-primary',
                        !h && vacation.has(iso) && 'bg-success-bg text-ink ring-1 ring-success-border',
                        !h && !vacation.has(iso) && isWeekend(iso) && 'bg-sunken text-muted',
                        !h && !vacation.has(iso) && !isWeekend(iso) && 'text-ink',
                      )}
                    >
                      {n + 1}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
