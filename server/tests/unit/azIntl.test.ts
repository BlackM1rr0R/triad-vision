import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * client/src/lib/azIntl.ts: Azerbaijani dates in browsers whose ICU has no "az" (Chrome). Node has full ICU, so
 * the test first simulates the reduced ICU ("az" → root locale), then installs the shim.
 */

const NativeDTF = Intl.DateTimeFormat;
const NativeRTF = Intl.RelativeTimeFormat;
const nativeDate = Date.prototype.toLocaleDateString;
const nativeTime = Date.prototype.toLocaleTimeString;
const nativeBoth = Date.prototype.toLocaleString;

const strip = (l: unknown): unknown => (typeof l === 'string' && /^az/i.test(l) ? 'und' : Array.isArray(l) ? l.map(strip) : l);

beforeAll(async () => {
  const dtf = function (l?: Intl.LocalesArgument, o?: Intl.DateTimeFormatOptions) {
    return new NativeDTF(strip(l) as Intl.LocalesArgument, o);
  } as unknown as typeof Intl.DateTimeFormat;
  Object.assign(dtf, { prototype: NativeDTF.prototype, supportedLocalesOf: NativeDTF.supportedLocalesOf });
  Intl.DateTimeFormat = dtf;
  const rtf = function (l?: Intl.LocalesArgument, o?: Intl.RelativeTimeFormatOptions) {
    return new NativeRTF(strip(l) as Intl.LocalesArgument, o);
  } as unknown as typeof Intl.RelativeTimeFormat;
  Object.assign(rtf, { prototype: NativeRTF.prototype, supportedLocalesOf: NativeRTF.supportedLocalesOf });
  (Intl as { RelativeTimeFormat: unknown }).RelativeTimeFormat = rtf;

  const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../client/src/lib/azIntl.ts');
  const m = (await import(/* @vite-ignore */ pathToFileURL(file).href)) as { installAzIntl: () => void };
  m.installAzIntl();
});

afterAll(() => {
  Intl.DateTimeFormat = NativeDTF;
  (Intl as { RelativeTimeFormat: unknown }).RelativeTimeFormat = NativeRTF;
  Date.prototype.toLocaleDateString = nativeDate;
  Date.prototype.toLocaleTimeString = nativeTime;
  Date.prototype.toLocaleString = nativeBoth;
});

describe('Azerbaijani dates without "az" ICU data', () => {
  const d = new Date(2026, 9, 14, 21, 40);

  it('formats month and weekday names in Azerbaijani', () => {
    expect(new Intl.DateTimeFormat('az', { dateStyle: 'long' }).format(d)).toBe('14 oktyabr 2026');
    expect(d.toLocaleDateString('az', { day: 'numeric', month: 'short' })).toBe('14 okt');
    expect(d.toLocaleDateString('az')).toBe('14.10.2026');
    expect(new Intl.DateTimeFormat('az', { weekday: 'long' }).format(d)).toBe('çərşənbə');
    expect(new Intl.DateTimeFormat('az', { day: 'numeric', month: 'short', year: 'numeric' }).formatRange(d, new Date(2026, 10, 3)).replace(/\s/g, ' ')).toBe('14 okt – 3 noy 2026');
  });

  it('translates relative times', () => {
    const r = new Intl.RelativeTimeFormat('az', { numeric: 'auto' });
    expect([r.format(-1, 'day'), r.format(1, 'day'), r.format(0, 'second'), r.format(-3, 'day'), r.format(-5, 'minute'), r.format(-1, 'month')]).toEqual([
      'dünən',
      'sabah',
      'indi',
      '3 gün əvvəl',
      '5 dəqiqə əvvəl',
      'keçən ay',
    ]);
  });

  it('leaves other locales alone', () => {
    expect(new Intl.DateTimeFormat('de', { dateStyle: 'long' }).format(d)).toBe('14. Oktober 2026');
    expect(new Intl.DateTimeFormat('az') instanceof Intl.DateTimeFormat).toBe(true);
  });
});
