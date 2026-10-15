/**
 * Snooze presets (pure). Times are computed in the given UTC offset (minutes, as sent by the
 * browser via `tzOffset`) so "tomorrow 09:00" is the user's morning, not the server's.
 */
export const SNOOZE_PRESETS = ['laterToday', 'tomorrow', 'thisWeekend', 'nextWeek'] as const;
export type SnoozePreset = (typeof SNOOZE_PRESETS)[number];

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const MORNING = 9;

/**
 * `tzOffsetMin` follows JavaScript's Date#getTimezoneOffset convention (UTC − local, so Baku is −240).
 */
export const snoozeUntil = (preset: SnoozePreset, now: Date, tzOffsetMin = 0): Date => {
  const local = now.getTime() - tzOffsetMin * MIN; // epoch ms shifted so UTC getters read local wall time
  const l = new Date(local);
  const startOfDay = Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate());
  const toUtc = (ms: number) => new Date(ms + tzOffsetMin * MIN);
  switch (preset) {
    case 'laterToday': {
      // in 3 hours, rounded up to the full hour; never past 20:00 → then tomorrow morning
      const t = Math.ceil((local + 3 * HOUR) / HOUR) * HOUR;
      if (t - startOfDay > 20 * HOUR) return toUtc(startOfDay + DAY + MORNING * HOUR);
      return toUtc(t);
    }
    case 'tomorrow':
      return toUtc(startOfDay + DAY + MORNING * HOUR);
    case 'thisWeekend': {
      const dow = l.getUTCDay(); // 0 = Sunday
      let delta = (6 - dow + 7) % 7; // days until Saturday
      if (delta === 0) delta = 7;
      return toUtc(startOfDay + delta * DAY + MORNING * HOUR);
    }
    case 'nextWeek': {
      const dow = l.getUTCDay();
      let delta = (1 - dow + 7) % 7; // days until Monday
      if (delta === 0) delta = 7;
      return toUtc(startOfDay + delta * DAY + MORNING * HOUR);
    }
  }
};
