import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Check } from 'lucide-react';
import { errorCode } from '@/lib/api';
import { STATUS_TONES, toneClasses } from '@/components/ui/status';
import type { Locale } from '@/i18n';

export type ArrivalStatus = 'DRAFT' | 'SUBMITTED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
export type HousingStatus = 'NONE' | 'REQUESTED' | 'SEARCHING' | 'OFFERED' | 'ARRANGED';
export const HOUSING_STATUSES: HousingStatus[] = ['NONE', 'REQUESTED', 'SEARCHING', 'OFFERED', 'ARRANGED'];
export const ARRIVAL_STATUSES: ArrivalStatus[] = ['DRAFT', 'SUBMITTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED'];

interface Person {
  id: string;
  firstName: string;
  lastName: string;
}

export interface ArrivalPlan {
  id: string;
  caseId: string;
  case: { id: string; number: string; profession: string };
  status: ArrivalStatus;
  flightDate: string | null;
  flightNumber: string | null;
  departureAirport: string | null;
  arrivalAirport: string | null;
  arrivalTime: string | null;
  travellers: number;
  luggageNote: string | null;
  pickupRequested: boolean;
  pickupConfirmed: boolean;
  pickupDetails: string | null;
  housingStatus: HousingStatus;
  housingCity: string | null;
  housingBudget: number | null;
  housingFrom: string | null;
  housingNote: string | null;
  housingDetails: string | null;
  clientNote: string | null;
  handledBy: Person | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  editable: boolean;
}

export interface StaffArrivalPlan extends Omit<ArrivalPlan, 'case'> {
  staffNote: string | null;
  handledById: string | null;
  client: { id: string; firstName: string; lastName: string; email: string; phone: string | null; locale: Locale };
  case: { id: string; number: string; profession: string; status: string; assignedStaff: Person | null };
  upcoming: boolean;
}

export const personName = (p: { firstName: string; lastName: string } | null | undefined) => (p ? `${p.firstName} ${p.lastName}`.trim() : '—');

// ─── Airports ─────────────────────────────────────────────────────────────

export const GERMAN_AIRPORTS: { code: string; city: string }[] = [
  { code: 'BER', city: 'Berlin Brandenburg' },
  { code: 'HAM', city: 'Hamburg' },
  { code: 'MUC', city: 'München' },
  { code: 'CGN', city: 'Köln/Bonn' },
  { code: 'FRA', city: 'Frankfurt am Main' },
  { code: 'STR', city: 'Stuttgart' },
  { code: 'DUS', city: 'Düsseldorf' },
  { code: 'LEJ', city: 'Leipzig/Halle' },
  { code: 'DRS', city: 'Dresden' },
  { code: 'HAJ', city: 'Hannover' },
  { code: 'NUE', city: 'Nürnberg' },
  { code: 'DTM', city: 'Dortmund' },
  { code: 'BRE', city: 'Bremen' },
];

export const DEPARTURE_AIRPORTS: { code: string; city: string }[] = [
  { code: 'GYD', city: 'Bakı (Heydər Əliyev)' },
  { code: 'GNJ', city: 'Gəncə' },
  { code: 'NAJ', city: 'Naxçıvan' },
  { code: 'IST', city: 'İstanbul' },
  { code: 'SAW', city: 'İstanbul Sabiha Gökçen' },
  { code: 'TBS', city: 'Tbilisi' },
  { code: 'ALA', city: 'Almaty' },
  { code: 'TAS', city: 'Tashkent' },
  { code: 'EVN', city: 'Yerevan' },
  { code: 'DXB', city: 'Dubai' },
];

const ALL_AIRPORTS = [...GERMAN_AIRPORTS, ...DEPARTURE_AIRPORTS];

/** "FRA" → "FRA · Frankfurt am Main"; free text is shown as entered. */
export const airportLabel = (v: string | null | undefined) => {
  if (!v) return null;
  const hit = ALL_AIRPORTS.find((a) => a.code === v.trim().toUpperCase());
  return hit ? `${hit.code} · ${hit.city}` : v;
};

// ─── German local time ↔ UTC ──────────────────────────────────────────────

export const BERLIN = 'Europe/Berlin';

const partsIn = (d: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(d);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour') % 24, mi: get('minute'), s: get('second') };
};

const offsetMs = (d: Date, timeZone: string) => {
  const p = partsIn(d, timeZone);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(d.getTime() / 1000) * 1000;
};

/** "2026-10-24T14:35" read as German local time → ISO (UTC). */
export const berlinInputToIso = (v: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v);
  if (!m) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let ts = guess - offsetMs(new Date(guess), BERLIN);
  ts = guess - offsetMs(new Date(ts), BERLIN); // second pass settles DST edges
  return new Date(ts).toISOString();
};

/** ISO → "YYYY-MM-DDTHH:mm" in German local time (for <input type="datetime-local">). */
export const isoToBerlinInput = (iso: string | null | undefined) => {
  if (!iso) return '';
  const p = partsIn(new Date(iso), BERLIN);
  const z = (n: number) => String(n).padStart(2, '0');
  return `${p.y}-${z(p.m)}-${z(p.d)}T${z(p.h)}:${z(p.mi)}`;
};

/** ISO date (stored as UTC midnight) → "YYYY-MM-DD". */
export const isoToDateInput = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '');

const INTL: Record<Locale, string> = { az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' };
const TZ_SHORT: Record<Locale, string> = { az: 'Almaniya vaxtı', de: 'deutsche Zeit', en: 'German time', ru: 'время Германии' };

export const useArrivalFormat = () => {
  const { i18n } = useTranslation();
  const locale = ((i18n.resolvedLanguage ?? 'az').slice(0, 2) as Locale) || 'az';
  return {
    locale,
    arrival: (iso: string | null | undefined) =>
      iso ? `${new Intl.DateTimeFormat(INTL[locale], { dateStyle: 'medium', timeStyle: 'short', timeZone: BERLIN }).format(new Date(iso))} (${TZ_SHORT[locale]})` : null,
    arrivalShort: (iso: string | null | undefined) =>
      iso ? new Intl.DateTimeFormat(INTL[locale], { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: BERLIN }).format(new Date(iso)) : null,
    day: (iso: string | null | undefined) => (iso ? new Intl.DateTimeFormat(INTL[locale], { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(iso)) : null),
    dateTime: (iso: string | null | undefined) => (iso ? new Intl.DateTimeFormat(INTL[locale], { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)) : null),
  };
};

// ─── Errors ───────────────────────────────────────────────────────────────

export const useArrivalError = () => {
  const { t, i18n } = useTranslation();
  return useCallback(
    (err: unknown) => {
      const code = errorCode(err);
      const fields = (err as { response?: { data?: { fields?: string[] } } })?.response?.data?.fields;
      if (code === 'PLAN_INCOMPLETE' && fields?.length) {
        toast.error(t('arrival.missing', { fields: fields.map((f) => t(`arrival.fields.${f}`)).join(', ') }));
        return;
      }
      const key = [`arrival.errors.${code}`, `portal.errors.${code}`].find((k) => i18n.exists(k));
      toast.error(key ? t(key) : t('common.error'));
    },
    [t, i18n],
  );
};

// ─── Status pill and timeline ─────────────────────────────────────────────

const TONE: Record<ArrivalStatus, string> = toneClasses(STATUS_TONES.arrival);

export const ArrivalStatusPill = ({ status, className }: { status: ArrivalStatus; className?: string }) => {
  const { t } = useTranslation();
  return <span className={clsx('badge whitespace-nowrap', TONE[status], className)}>{t(`arrival.status.${status}`)}</span>;
};

const HOUSING_TONE: Record<HousingStatus, string> = { ...toneClasses(STATUS_TONES.housing), NONE: 'text-muted' };

export const HousingPill = ({ status }: { status: HousingStatus }) => {
  const { t } = useTranslation();
  if (status === 'NONE') return <span className="text-muted">—</span>;
  return <span className={clsx('badge whitespace-nowrap', HOUSING_TONE[status])}>{t(`arrival.housing.${status}`)}</span>;
};

const FLOW: Exclude<ArrivalStatus, 'CANCELLED'>[] = ['DRAFT', 'SUBMITTED', 'CONFIRMED', 'COMPLETED'];

export const ArrivalTimeline = ({ status }: { status: ArrivalStatus }) => {
  const { t } = useTranslation();
  const at = status === 'CANCELLED' ? -1 : FLOW.indexOf(status);
  return (
    <ol className={clsx('flex items-center gap-1 sm:gap-2', status === 'CANCELLED' && 'opacity-50')} aria-label={t(`arrival.status.${status}`)}>
      {FLOW.map((s, i) => {
        const done = i <= at;
        return (
          <li key={s} className="flex flex-1 items-center gap-1 sm:gap-2">
            <span className={clsx('grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold transition-colors duration-300', done ? 'bg-brand-600 text-white' : 'border border-line bg-surface text-muted')}>
              {done ? <Check className="size-3.5" aria-hidden /> : i + 1}
            </span>
            <span className={clsx('hidden truncate text-xs font-semibold sm:inline', done ? 'text-ink' : 'text-muted')} aria-current={i === at ? 'step' : undefined}>
              {t(`arrival.timeline.${s}`)}
            </span>
            {i < FLOW.length - 1 && <span className={clsx('h-0.5 min-w-3 flex-1 rounded-full transition-colors duration-300', i < at ? 'bg-brand-500' : 'bg-line')} aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
};
