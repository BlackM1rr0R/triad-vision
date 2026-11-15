/**
 * Time-zone helpers of the "Baku ↔ Berlin" clock (pure, no imports: server/tests/unit/worldHome.test.ts loads
 * this file directly). Offsets come from Intl, so Germany's summer time (last Sunday of March → last Sunday of
 * October) is handled by the browser's time-zone data, never by hand-written rules.
 */

export const BAKU_TZ = 'Asia/Baku';
export const BERLIN_TZ = 'Europe/Berlin';

/** UTC offset of a time zone at an instant, in minutes (Berlin: 60 in winter, 120 in summer; Baku: 240). */
export const tzOffsetMinutes = (timeZone: string, at: Date): number => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour') % 24, n('minute'), n('second'));
  const whole = Math.floor(at.getTime() / 1000) * 1000;
  return Math.round((asUtc - whole) / 60000);
};

/** How many minutes `a` is ahead of `b` at that instant (Baku vs Berlin: 180 in winter, 120 in summer). */
export const zoneDifferenceMinutes = (at: Date, a = BAKU_TZ, b = BERLIN_TZ): number => tzOffsetMinutes(a, at) - tzOffsetMinutes(b, at);

/** "+3" / "+2" / "+3:30" / "0": the difference as shown next to the clocks. */
export const formatDifference = (minutes: number): string => {
  if (minutes === 0) return '0';
  const sign = minutes > 0 ? '+' : '−';
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m ? `${sign}${h}:${String(m).padStart(2, '0')}` : `${sign}${h}`;
};

/** Whether Germany is on summer time (CEST) at that instant. */
export const berlinSummerTime = (at: Date): boolean => tzOffsetMinutes(BERLIN_TZ, at) === 120;

/** "14:05" in a time zone (24 h, Latin digits: the clock never changes width between languages). */
export const clockTime = (timeZone: string, at: Date): string =>
  new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at);

/** Hour of the day (0–23) in a time zone: day / night icon and the "good time to call" hint. */
export const hourIn = (timeZone: string, at: Date): number =>
  Number(new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(at)) % 24;

/** Both cities inside office hours (Mon–Fri 9–18 local) — a good moment to call a German employer from Baku. */
export const bothInOfficeHours = (at: Date, a = BAKU_TZ, b = BERLIN_TZ): boolean => {
  const weekday = (tz: string) => new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(at);
  return [a, b].every((tz) => {
    const h = hourIn(tz, at);
    return h >= 9 && h < 18 && !['Sat', 'Sun'].includes(weekday(tz));
  });
};
