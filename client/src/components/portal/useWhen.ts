import { useL10n } from '@/lib/l10n';

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['minute', 60],
  ['hour', 60 * 60],
  ['day', 24 * 60 * 60],
];

const AZ_UNIT = { minute: 'dəqiqə', hour: 'saat', day: 'gün' } as const;

/** "5 minutes ago" for the last week, an absolute date after that. */
export const useWhen = () => {
  const { locale, dateTime } = useL10n();
  return (iso: string) => {
    const diff = (new Date(iso).getTime() - Date.now()) / 1000;
    const abs = Math.abs(diff);
    if (abs > 7 * 24 * 60 * 60) return dateTime(iso);
    const [unit, seconds] = [...UNITS].reverse().find(([, s]) => abs >= s) ?? UNITS[0];
    const n = Math.round(diff / seconds);
    // Browsers ship little or no Azerbaijani relative-time data ("-4 h"), so format it by hand.
    if (locale === 'az') {
      if (abs < 60) return 'indicə';
      return `${Math.abs(n)} ${AZ_UNIT[unit as 'minute' | 'hour' | 'day']} ${diff < 0 ? 'əvvəl' : 'sonra'}`;
    }
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    if (abs < 60) return rtf.format(0, 'minute');
    return rtf.format(n, unit);
  };
};
