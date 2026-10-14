/** Minimal RFC 5545 calendar file for one event (fallback when the native calendar API is unavailable). */
const pad = (n: number) => String(n).padStart(2, '0');

export const toIcsDate = (d: Date) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

const escapeText = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');

export const buildIcs = (e: { uid: string; title: string; start: Date; end: Date; location?: string; notes?: string; now?: Date }) =>
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Triad Vision//Mobile//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.uid}@triad-vision.de`,
    `DTSTAMP:${toIcsDate(e.now ?? new Date())}`,
    `DTSTART:${toIcsDate(e.start)}`,
    `DTEND:${toIcsDate(e.end)}`,
    `SUMMARY:${escapeText(e.title)}`,
    e.location ? `LOCATION:${escapeText(e.location)}` : null,
    e.notes ? `DESCRIPTION:${escapeText(e.notes)}` : null,
    'BEGIN:VALARM',
    'TRIGGER:-PT2H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(e.title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');
