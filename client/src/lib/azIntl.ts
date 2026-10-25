/**
 * Azerbaijani dates when the browser has no Azerbaijani locale data.
 *
 * Chrome (and other Chromium browsers) ship a reduced ICU without "az": `Intl.DateTimeFormat('az')` then prints
 * "2026 M10 14" and `Intl.RelativeTimeFormat('az')` falls back to English. Turkish uses the same date patterns
 * as Azerbaijani (14 Ekim 2026 ↔ 14 oktyabr 2026, 14.10.2026), so for "az" we format with the native Turkish
 * formatter (keeping every option, time zone included) and swap the month, weekday and relative-time words.
 *
 * Installed once at startup, only when the browser lacks "az"; other locales and browsers with full ICU are
 * untouched. Covers Intl.DateTimeFormat, Intl.RelativeTimeFormat and Date#toLocale*String.
 */

const MONTHS_LONG = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avqust', 'sentyabr', 'oktyabr', 'noyabr', 'dekabr'];
const MONTHS_SHORT = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avq', 'sen', 'okt', 'noy', 'dek'];
const WEEKDAYS_LONG = ['bazar', 'bazar ertəsi', 'çərşənbə axşamı', 'çərşənbə', 'cümə axşamı', 'cümə', 'şənbə'];
const WEEKDAYS_SHORT = ['B.', 'B.e.', 'Ç.a.', 'Ç.', 'C.a.', 'C.', 'Ş.'];

type DTF = Intl.DateTimeFormat;
type Ctor = typeof Intl.DateTimeFormat;

const lacksAz = () => {
  try {
    const resolved = new Intl.DateTimeFormat('az').resolvedOptions().locale;
    const month = new Intl.DateTimeFormat('az', { month: 'long' }).format(new Date(2026, 9, 14));
    return !resolved.toLowerCase().startsWith('az') || month !== 'oktyabr';
  } catch {
    return false;
  }
};

const isAz = (locales: Intl.LocalesArgument): boolean => {
  const first = Array.isArray(locales) ? locales[0] : locales;
  const tag = typeof first === 'string' ? first : first instanceof Intl.Locale ? first.toString() : undefined;
  return !!tag && /^az(-|$)/i.test(tag);
};

/** Turkish month / weekday names (long and short) of the native ICU → Azerbaijani, by index. */
const buildWordMap = (NativeDTF: Ctor) => {
  const map = new Map<string, string>();
  for (let m = 0; m < 12; m++) {
    const d = new Date(Date.UTC(2026, m, 15, 12));
    for (const [opt, az] of [['long', MONTHS_LONG[m]], ['short', MONTHS_SHORT[m]]] as const) {
      const tr = new NativeDTF('tr', { month: opt, timeZone: 'UTC' }).format(d);
      map.set(tr, az);
      // Stand-alone vs. format forms can differ: also map the form inside a full date.
      const part = new NativeDTF('tr', { day: 'numeric', month: opt, timeZone: 'UTC' }).formatToParts(d).find((p) => p.type === 'month')?.value;
      if (part) map.set(part, az);
    }
  }
  for (let w = 0; w < 7; w++) {
    const d = new Date(Date.UTC(2026, 9, 11 + w, 12)); // 11 Oct 2026 is a Sunday
    map.set(new NativeDTF('tr', { weekday: 'long', timeZone: 'UTC' }).format(d), WEEKDAYS_LONG[w]);
    map.set(new NativeDTF('tr', { weekday: 'short', timeZone: 'UTC' }).format(d), WEEKDAYS_SHORT[w]);
  }
  return map;
};

const translateParts = (parts: Intl.DateTimeFormatPart[], words: Map<string, string>) =>
  parts.map((p) => (p.type === 'month' || p.type === 'weekday' ? { ...p, value: words.get(p.value) ?? p.value } : p));

/** Turkish relative-time words → Azerbaijani. Unicode-aware word edges: `` does not treat ö/ş/ı as letters. */
const word = (w: string) => new RegExp(`(?<!\\p{L})${w.replace(/\./g, '\\.')}(?!\\p{L})`, 'gu');
const RELATIVE: [RegExp, string][] = (
  [
    ['dün', 'dünən'],
    ['yarın', 'sabah'],
    ['bugün', 'bu gün'],
    ['şimdi', 'indi'],
    ['geçen', 'keçən'],
    ['gelecek', 'gələn'],
    ['önce', 'əvvəl'],
    ['dakika', 'dəqiqə'],
    ['dk.', 'dəq.'],
    ['saniye', 'saniyə'],
    ['sn.', 'san.'],
    ['sa.', 'saat'],
    ['hafta', 'həftə'],
    ['hf.', 'həftə'],
    ['yıl', 'il'],
    ['çeyrek', 'rüb'],
  ] as const
).map(([tr, az]) => [word(tr), az]);
const translateRelative = (s: string) => RELATIVE.reduce((out, [re, az]) => out.replace(re, az), s);

export const installAzIntl = () => {
  if (typeof Intl === 'undefined' || !lacksAz()) return;
  const NativeDTF = Intl.DateTimeFormat;
  const words = buildWordMap(NativeDTF);

  const AzAwareDTF = function (this: unknown, locales?: Intl.LocalesArgument, options?: Intl.DateTimeFormatOptions): DTF {
    if (!isAz(locales)) return new NativeDTF(locales, options);
    const inner = new NativeDTF('tr', options);
    const fmt: DTF = Object.create(inner) as DTF;
    Object.defineProperties(fmt, {
      format: { value: (d?: Date | number) => translateParts(inner.formatToParts(d), words).map((p) => p.value).join('') },
      formatToParts: { value: (d?: Date | number) => translateParts(inner.formatToParts(d), words) },
      formatRange: {
        value: (a: Date | number, b: Date | number) =>
          inner.formatRangeToParts(a, b).map((p) => (p.type === 'month' || p.type === 'weekday' ? (words.get(p.value) ?? p.value) : p.value)).join(''),
      },
      formatRangeToParts: {
        value: (a: Date | number, b: Date | number) =>
          inner.formatRangeToParts(a, b).map((p) => (p.type === 'month' || p.type === 'weekday' ? { ...p, value: words.get(p.value) ?? p.value } : p)),
      },
      resolvedOptions: { value: () => ({ ...inner.resolvedOptions(), locale: 'az' }) },
    });
    return fmt;
  } as unknown as Ctor;
  Object.assign(AzAwareDTF, { supportedLocalesOf: NativeDTF.supportedLocalesOf.bind(NativeDTF) });
  (AzAwareDTF as { prototype: unknown }).prototype = NativeDTF.prototype;
  Intl.DateTimeFormat = AzAwareDTF;

  const NativeRTF = Intl.RelativeTimeFormat;
  if (NativeRTF) {
    const AzAwareRTF = function (this: unknown, locales?: Intl.LocalesArgument, options?: Intl.RelativeTimeFormatOptions) {
      if (!isAz(locales)) return new NativeRTF(locales, options);
      const inner = new NativeRTF('tr', options);
      const fmt = Object.create(inner) as Intl.RelativeTimeFormat;
      Object.defineProperties(fmt, {
        format: { value: (v: number, u: Intl.RelativeTimeFormatUnit) => translateRelative(inner.format(v, u)) },
        formatToParts: {
          value: (v: number, u: Intl.RelativeTimeFormatUnit) => inner.formatToParts(v, u).map((p) => (p.type === 'literal' ? { ...p, value: translateRelative(p.value) } : p)),
        },
        resolvedOptions: { value: () => ({ ...inner.resolvedOptions(), locale: 'az' }) },
      });
      return fmt;
    } as unknown as typeof Intl.RelativeTimeFormat;
    Object.assign(AzAwareRTF, { supportedLocalesOf: NativeRTF.supportedLocalesOf.bind(NativeRTF) });
    (AzAwareRTF as { prototype: unknown }).prototype = NativeRTF.prototype;
    (Intl as { RelativeTimeFormat: unknown }).RelativeTimeFormat = AzAwareRTF;
  }

  // Date#toLocale*String use the engine's internal formatter, not the global: route "az" through ours.
  const proto = Date.prototype;
  const nativeDate = proto.toLocaleDateString;
  const nativeTime = proto.toLocaleTimeString;
  const nativeBoth = proto.toLocaleString;
  proto.toLocaleDateString = function (this: Date, locales?: Intl.LocalesArgument, options?: Intl.DateTimeFormatOptions) {
    if (!isAz(locales)) return nativeDate.call(this, locales, options);
    const o = options && (options.dateStyle || options.year || options.month || options.day || options.weekday) ? options : { ...options, year: 'numeric', month: 'numeric', day: 'numeric' };
    return new Intl.DateTimeFormat('az', o as Intl.DateTimeFormatOptions).format(this);
  };
  proto.toLocaleTimeString = function (this: Date, locales?: Intl.LocalesArgument, options?: Intl.DateTimeFormatOptions) {
    if (!isAz(locales)) return nativeTime.call(this, locales, options);
    const o = options && (options.timeStyle || options.hour || options.minute || options.second) ? options : { ...options, hour: '2-digit', minute: '2-digit', second: '2-digit' };
    return new Intl.DateTimeFormat('az', o as Intl.DateTimeFormatOptions).format(this);
  };
  proto.toLocaleString = function (this: Date, locales?: Intl.LocalesArgument, options?: Intl.DateTimeFormatOptions) {
    if (!isAz(locales)) return nativeBoth.call(this, locales, options);
    const o = options && Object.keys(options).some((k) => k !== 'timeZone' && k !== 'hour12' && k !== 'hourCycle') ? options : { ...options, year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' };
    return new Intl.DateTimeFormat('az', o as Intl.DateTimeFormatOptions).format(this);
  };
};
