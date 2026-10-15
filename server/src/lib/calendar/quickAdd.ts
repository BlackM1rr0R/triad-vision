/**
 * Natural-ish quick add for the calendar: "Görüş sabah 15:00 1 saat", "Meeting tomorrow 15:00 1h",
 * "Treffen morgen 15:00", "Встреча завтра в 15:00". Understands today / tomorrow / the day after /
 * weekday names in az, de, en, ru, explicit dates (16.10, 16.10.2026, 2026-10-16), times (15:00,
 * 15.30, 3pm, 15h, saat 15, um 15, at 3), durations (1 saat, 90 min, 2 Std, 1 час, 1h) and
 * "all day". Whatever is not recognised becomes the title. Without a time the event starts at the
 * next full hour and lasts one hour.
 */

export interface QuickAddResult {
  title: string;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  /** which parts of the text were understood (for the preview in the composer) */
  matched: { date: boolean; time: boolean; duration: boolean };
}

export interface QuickAddOptions {
  now?: Date;
  /** minutes east of UTC of the user's wall clock (Baku = 240) */
  tzOffsetMinutes?: number;
}

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

type Rule = { re: RegExp; days?: number; weekday?: number };

const word = (alts: string[]) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts.join('|')})(?![\\p{L}\\p{N}])`, 'iu');

/** Relative days: today / tomorrow / the day after. */
const RELATIVE: Rule[] = [
  { re: word(['birigün', 'biri gün', 'o biri gün', 'übermorgen', 'day after tomorrow', 'послезавтра']), days: 2 },
  { re: word(['bu gün', 'bugün', 'heute', 'today', 'сегодня']), days: 0 },
  { re: word(['sabah', 'morgen', 'tomorrow', 'завтра']), days: 1 },
];

/** Weekday names (0 = Sunday … 6 = Saturday); multi-word Azerbaijani names come before their prefixes. */
const WEEKDAY_RULES: Rule[] = [
  { re: word(['bazar ertəsi', 'bazar ertesi', 'montag', 'monday', 'mon', 'понедельник', 'пн']), weekday: 1 },
  { re: word(['çərşənbə axşamı', 'cersenbe axsami', 'dienstag', 'tuesday', 'tue', 'вторник', 'вт']), weekday: 2 },
  { re: word(['çərşənbə', 'cersenbe', 'mittwoch', 'wednesday', 'wed', 'среда', 'среду', 'ср']), weekday: 3 },
  { re: word(['cümə axşamı', 'cume axsami', 'donnerstag', 'thursday', 'thu', 'четверг', 'чт']), weekday: 4 },
  { re: word(['cümə', 'cume', 'freitag', 'friday', 'fri', 'пятница', 'пятницу', 'пт']), weekday: 5 },
  { re: word(['şənbə', 'senbe', 'samstag', 'sonnabend', 'saturday', 'sat', 'суббота', 'субботу', 'сб']), weekday: 6 },
  { re: word(['bazar', 'sonntag', 'sunday', 'sun', 'воскресенье', 'вс']), weekday: 0 },
];

const ALL_DAY = word(['bütün gün', 'butun gun', 'ganztägig', 'ganztags', 'all day', 'all-day', 'весь день', 'целый день']);
const HALF_HOUR = word(['yarım saat', 'yarim saat', 'halbe stunde', 'half an hour', 'half hour', 'полчаса']);
const HOURS = /(?<![\p{L}\p{N}])(\d{1,2}(?:[.,]\d)?)\s*(?:saatlıq|saatliq|saat|stunden|stunde|std|hours|hour|hrs|hr|h|часов|часа|час|ч)(?![\p{L}\p{N}])/iu;
const MINUTES = /(?<![\p{L}\p{N}])(\d{1,3})\s*(?:dəqiqəlik|dəqiqə|dəq|deq|minuten|minute|minutes|mins|min|минут|минуты|мин|м)(?![\p{L}\p{N}])/iu;
const ISO_DATE = /(?<![\d])(\d{4})-(\d{2})-(\d{2})(?![\d])/;
const DMY_DATE = /(?<![\d:.])(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?![\d.:])/;
/** "15:00", "15.30", "15:00-16:30"; dotted form only when the second part is not a plausible month (so 16.10 stays a date). */
const CLOCK = /(?<![\d.:])(\d{1,2})([:.])(\d{2})(?:\s*[-–]\s*(\d{1,2})[:.](\d{2}))?(?![\d.:])/;
const AMPM = /(?<![\p{L}\p{N}])(\d{1,2})(?::(\d{2}))?\s*(am|pm)(?![\p{L}\p{N}])/iu;
const HOUR_WORD = /(?<![\p{L}\p{N}])(?:saat|at|um|в|о)\s*(\d{1,2})(?![\d:.])(?![\p{L}])/iu;
const HOUR_SUFFIX = /(?<![\p{L}\p{N}:.])(\d{1,2})\s*(?:uhr|h|-da|-də|da|də)(?![\p{L}\p{N}])/iu;
const FILLER = word(['saat', 'uhr', 'at', 'on', 'um', 'am', 'в', 'во', 'о', 'günü', 'gunu', 'dan', 'dən', 'üçün', 'für', 'for', 'на']);

const cut = (text: string, re: RegExp) => {
  const m = re.exec(text);
  if (!m) return { m: null, text };
  return { m, text: `${text.slice(0, m.index)} ${text.slice(m.index + m[0].length)}` };
};

export const parseQuickAdd = (input: string, opts: QuickAddOptions = {}): QuickAddResult => {
  const now = opts.now ?? new Date();
  const tz = opts.tzOffsetMinutes ?? 240;
  // Work on the user's wall clock by shifting to "local as UTC".
  const local = new Date(now.getTime() + tz * MIN);
  const toUtc = (y: number, m: number, d: number, h: number, mi: number) => new Date(Date.UTC(y, m, d, h, mi) - tz * MIN);

  let text = input.replace(/\s+/g, ' ').trim();
  const matched = { date: false, time: false, duration: false };
  let allDay = false;
  let dayOffset: number | null = null;
  let explicit: { y: number; m: number; d: number } | null = null;
  let hour: number | null = null;
  let minute = 0;
  let endHour: number | null = null;
  let endMinute = 0;
  let durationMin: number | null = null;

  // all day
  ({ text } = ((r) => ((allDay = !!r.m), r))(cut(text, ALL_DAY)));

  // durations (before times, so "1 saat" is not read as an hour)
  const half = cut(text, HALF_HOUR);
  if (half.m) {
    durationMin = 30;
    text = half.text;
  }
  const hrs = cut(text, HOURS);
  if (hrs.m && durationMin === null) {
    durationMin = Math.round(Number(hrs.m[1].replace(',', '.')) * 60);
    text = hrs.text;
  }
  const mins = cut(text, MINUTES);
  if (mins.m) {
    durationMin = (durationMin ?? 0) + Number(mins.m[1]);
    text = mins.text;
  }
  if (durationMin !== null) matched.duration = true;

  // explicit dates
  const iso = cut(text, ISO_DATE);
  if (iso.m) {
    explicit = { y: +iso.m[1], m: +iso.m[2] - 1, d: +iso.m[3] };
    text = iso.text;
  } else {
    const clockFirst = CLOCK.exec(text);
    // "15.30" is a time (30 is no month); "16.10" is a date. Colon forms are always times.
    const dottedIsTime = clockFirst && (clockFirst[2] === ':' || +clockFirst[3] > 12 || clockFirst[3] === '00');
    const dmy = cut(text, DMY_DATE);
    if (dmy.m && !(dottedIsTime && clockFirst && clockFirst.index === dmy.m.index) && +dmy.m[2] >= 1 && +dmy.m[2] <= 12 && +dmy.m[1] >= 1 && +dmy.m[1] <= 31) {
      const y = dmy.m[3] ? (dmy.m[3].length === 2 ? 2000 + +dmy.m[3] : +dmy.m[3]) : local.getUTCFullYear();
      explicit = { y, m: +dmy.m[2] - 1, d: +dmy.m[1] };
      text = dmy.text;
    }
  }
  if (explicit) matched.date = true;

  // relative days and weekday names
  if (!explicit) {
    for (const r of RELATIVE) {
      const c = cut(text, r.re);
      if (c.m) {
        dayOffset = r.days!;
        text = c.text;
        matched.date = true;
        break;
      }
    }
  }
  if (!explicit && dayOffset === null) {
    for (const r of WEEKDAY_RULES) {
      const c = cut(text, r.re);
      if (c.m) {
        const today = local.getUTCDay();
        let diff = (r.weekday! - today + 7) % 7;
        if (diff === 0) diff = 7; // "Friday" said on a Friday means next week
        dayOffset = diff;
        text = c.text;
        matched.date = true;
        break;
      }
    }
  }

  // times
  const clock = cut(text, CLOCK);
  if (clock.m && (clock.m[2] === ':' || +clock.m[3] > 12 || clock.m[3] === '00' || explicit || dayOffset !== null) && +clock.m[1] < 24 && +clock.m[3] < 60) {
    hour = +clock.m[1];
    minute = +clock.m[3];
    if (clock.m[4]) {
      endHour = +clock.m[4];
      endMinute = +clock.m[5];
    }
    text = clock.text;
  } else {
    const ap = cut(text, AMPM);
    if (ap.m) {
      hour = (+ap.m[1] % 12) + (ap.m[3].toLowerCase() === 'pm' ? 12 : 0);
      minute = ap.m[2] ? +ap.m[2] : 0;
      text = ap.text;
    } else {
      const hw = cut(text, HOUR_WORD);
      if (hw.m && +hw.m[1] < 24) {
        hour = +hw.m[1];
        text = hw.text;
      } else {
        const hs = cut(text, HOUR_SUFFIX);
        if (hs.m && +hs.m[1] < 24) {
          hour = +hs.m[1];
          text = hs.text;
        }
      }
    }
  }
  if (hour !== null) matched.time = true;

  // the day
  let y = local.getUTCFullYear();
  let m = local.getUTCMonth();
  let d = local.getUTCDate();
  if (explicit) ({ y, m, d } = explicit);
  else if (dayOffset !== null) {
    const t = new Date(Date.UTC(y, m, d) + dayOffset * DAY);
    y = t.getUTCFullYear();
    m = t.getUTCMonth();
    d = t.getUTCDate();
  }

  let startsAt: Date;
  let endsAt: Date;
  if (allDay) {
    startsAt = toUtc(y, m, d, 0, 0);
    endsAt = new Date(startsAt.getTime() + DAY);
  } else {
    if (hour === null) {
      if (explicit || dayOffset) {
        hour = 9;
        minute = 0;
      } else {
        // next full hour
        hour = local.getUTCHours() + 1;
        minute = 0;
        if (hour >= 24) {
          hour = 9;
          const t = new Date(Date.UTC(y, m, d) + DAY);
          y = t.getUTCFullYear();
          m = t.getUTCMonth();
          d = t.getUTCDate();
        }
      }
    } else if (!explicit && dayOffset === null) {
      // "15:00" said after 15:00 means tomorrow
      const candidate = toUtc(y, m, d, hour, minute);
      if (candidate.getTime() < now.getTime()) {
        const t = new Date(Date.UTC(y, m, d) + DAY);
        y = t.getUTCFullYear();
        m = t.getUTCMonth();
        d = t.getUTCDate();
      }
    }
    startsAt = toUtc(y, m, d, hour, minute);
    if (endHour !== null) {
      endsAt = toUtc(y, m, d, endHour, endMinute);
      if (endsAt.getTime() <= startsAt.getTime()) endsAt = new Date(endsAt.getTime() + DAY);
    } else endsAt = new Date(startsAt.getTime() + (durationMin ?? 60) * MIN);
  }

  // title: what is left, minus filler words and dangling punctuation
  let title = text;
  for (let i = 0; i < 4; i++) title = title.replace(FILLER, ' ');
  title = title
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.;:–-]+|[\s,.;:–-]+$/g, '')
    .trim();
  if (!title) title = input.trim();

  return { title: title.slice(0, 200), startsAt, endsAt, allDay, matched };
};
