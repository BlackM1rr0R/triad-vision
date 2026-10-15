/**
 * iCalendar (.ics, RFC 5545) generation and small time-zone helpers for consultation bookings.
 * Times are always written in UTC ("Z"), so every calendar app shows them in the reader's own zone.
 */

/** Offset (ms) of `timeZone` from UTC at the instant `date` (e.g. +4 h for Asia/Baku). */
export const tzOffsetMs = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
};

/**
 * Wall-clock time in `timeZone` → UTC instant. Handles DST: the offset is re-evaluated at the
 * resulting instant, so "09:00 Europe/Berlin" is correct on both sides of a clock change.
 */
export const zonedToUtc = (y: number, month: number, d: number, h: number, mi: number, timeZone: string) => {
  const guess = Date.UTC(y, month - 1, d, h, mi);
  let result = guess - tzOffsetMs(new Date(guess), timeZone);
  const second = guess - tzOffsetMs(new Date(result), timeZone);
  if (second !== result) result = second;
  return new Date(result);
};

/** Calendar day (y, m, d, weekday 0=Sunday) of `date` as seen in `timeZone`. */
export const zonedDay = (date: Date, timeZone: string) => {
  const local = new Date(date.getTime() + tzOffsetMs(date, timeZone));
  return { y: local.getUTCFullYear(), m: local.getUTCMonth() + 1, d: local.getUTCDate(), weekday: local.getUTCDay() };
};

export const isValidTimeZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Escapes TEXT values (RFC 5545 §3.3.11). */
export const icsEscape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Folds a content line at 75 octets (continuation lines start with a space), never splitting a UTF-8 character. */
export const foldLine = (line: string) => {
  const out: string[] = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const len = Buffer.byteLength(ch, 'utf8');
    const limit = out.length === 0 ? 75 : 74; // continuation lines carry a leading space
    if (bytes + len > limit) {
      out.push(current);
      current = '';
      bytes = 0;
    }
    current += ch;
    bytes += len;
  }
  out.push(current);
  return out.join('\r\n ');
};

export interface IcsEvent {
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  description?: string;
  url?: string;
  location?: string;
  organizer?: { name: string; email: string };
  /** CANCELLED produces a cancellation that calendar apps apply to the earlier event with the same UID. */
  status?: 'CONFIRMED' | 'CANCELLED';
  sequence?: number;
  stamp?: Date;
}

export const buildIcs = (ev: IcsEvent) => {
  const cancelled = ev.status === 'CANCELLED';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Triad Vision//Consultation//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${cancelled ? 'CANCEL' : 'PUBLISH'}`,
    'BEGIN:VEVENT',
    `UID:${ev.uid}`,
    `DTSTAMP:${icsDate(ev.stamp ?? new Date())}`,
    `DTSTART:${icsDate(ev.start)}`,
    `DTEND:${icsDate(ev.end)}`,
    `SUMMARY:${icsEscape(ev.summary)}`,
    ev.description ? `DESCRIPTION:${icsEscape(ev.description)}` : null,
    ev.location ? `LOCATION:${icsEscape(ev.location)}` : null,
    ev.url ? `URL:${ev.url}` : null,
    ev.organizer ? `ORGANIZER;CN=${icsEscape(ev.organizer.name)}:mailto:${ev.organizer.email}` : null,
    `STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    `SEQUENCE:${ev.sequence ?? (cancelled ? 1 : 0)}`,
    'TRANSP:OPAQUE',
    ...(cancelled
      ? []
      : ['BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Reminder', 'TRIGGER:-PT15M', 'END:VALARM']),
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter((l): l is string => l !== null);
  return lines.map(foldLine).join('\r\n') + '\r\n';
};
