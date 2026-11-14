import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { normalizePhoneNumber, parsePhone, phoneCountryForRole, type PhoneCountry } from '../../src/lib/phone.js';
import { phoneInput, planPhoneMigration } from '../../src/lib/phoneField.js';
import { HttpError } from '../../src/lib/http.js';

/** Shared phone normaliser (src/lib/phone.ts) and its browser mirror (client/src/lib/phone.ts). */

const clientFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../client/src/lib/phone.ts');
const serverFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/lib/phone.ts');
let clientParse: typeof parsePhone;
beforeAll(async () => {
  clientParse = ((await import(pathToFileURL(clientFile).href)) as { parsePhone: typeof parsePhone }).parsePhone;
});

const CASES: [string, PhoneCountry | null, string | null][] = [
  // Already international, with separators.
  ['+994501234567', null, '+994501234567'],
  ['+994 50 123-45-67', null, '+994501234567'],
  ['+994 (50) 123.45.67', null, '+994501234567'],
  ['+994 50 123 45 67', null, '+994501234567'],
  [' +49 151-1234 5678 ', null, '+4915112345678'],
  ['+49 (0) 151 12345678', null, '+4915112345678'],
  ['+49 0151 12345678', null, '+4915112345678'],
  ['+994 050 123 45 67', null, '+994501234567'],
  ['+1 202 555 0143', null, '+12025550143'],
  // 00 → +
  ['00994501234567', null, '+994501234567'],
  ['0049 151 12345678', null, '+4915112345678'],
  // Azerbaijani local numbers (default, and with context AZ).
  ['050 123 45 67', null, '+994501234567'],
  ['0501234567', 'AZ', '+994501234567'],
  ['(012) 555-12-34', null, '+994125551234'],
  ['055-555-55-55', null, '+994555555555'],
  ['501234567', null, '+994501234567'],
  ['994501234567', null, '+994501234567'],
  // German local numbers only with context DE.
  ['0151 12345678', 'DE', '+4915112345678'],
  ['030 1234567', 'DE', '+49301234567'],
  ['0501234567', 'DE', '+49501234567'],
  ['4915112345678', 'DE', '+4915112345678'],
  ['0151 12345678', null, null],
  ['030 1234567', null, null],
  ['4915112345678', null, null],
  ['0151 12345678', 'AZ', null],
  // Refused.
  ['', null, null],
  ['   ', null, null],
  ['n/a', null, null],
  ['+994 50 abc 45 67', null, null],
  ['+994 123', null, null],
  ['+9945012345678', null, null],
  ['+9945012345678901', null, null],
  ['+0123456789', null, null],
  ['12345', null, null],
  ['050 123 45 67 ext 2', null, null],
];

describe('parsePhone', () => {
  it.each(CASES)('%j (context %s) → %s', (raw, country, expected) => {
    expect(normalizePhoneNumber(raw, { country })).toBe(expected);
  });

  it('gives a reason when it refuses', () => {
    expect(parsePhone('')).toEqual({ ok: false, reason: 'EMPTY' });
    expect(parsePhone(null)).toEqual({ ok: false, reason: 'EMPTY' });
    expect(parsePhone('call me')).toEqual({ ok: false, reason: 'INVALID_CHARS' });
    expect(parsePhone('+994 123')).toEqual({ ok: false, reason: 'INVALID_LENGTH' });
    expect(parsePhone('0151 12345678')).toEqual({ ok: false, reason: 'AMBIGUOUS' });
  });

  it('is idempotent: a normalised number stays as it is', () => {
    for (const [raw, country, expected] of CASES) {
      if (!expected) continue;
      expect(normalizePhoneNumber(expected, { country })).toBe(expected);
      expect(normalizePhoneNumber(normalizePhoneNumber(raw, { country }), { country })).toBe(expected);
    }
  });

  it('client mirror gives the same answers and has the same code', () => {
    for (const [raw, country] of CASES) expect(clientParse(raw, { country })).toEqual(parsePhone(raw, { country }));
    const body = (f: string) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').replace(/^ \* Mirror:.*$/m, '');
    expect(body(clientFile)).toBe(body(serverFile));
  });

  it('maps roles to a country context', () => {
    expect(phoneCountryForRole('COMPANY')).toBe('DE');
    expect(phoneCountryForRole('CLIENT')).toBe('AZ');
    expect(phoneCountryForRole('AGENT')).toBe('AZ');
    expect(phoneCountryForRole('STAFF')).toBeNull();
    expect(phoneCountryForRole(undefined)).toBeNull();
  });
});

describe('phoneInput (form fields)', () => {
  const code = (fn: () => unknown) => {
    try {
      fn();
    } catch (e) {
      return e instanceof HttpError ? `${e.status}:${e.code}` : String(e);
    }
    return 'no error';
  };

  it('leaves the column alone when the field is not sent, clears it on empty', () => {
    expect(phoneInput(undefined)).toBeUndefined();
    expect(phoneInput(null)).toBeNull();
    expect(phoneInput('  ')).toBeNull();
  });

  it('normalises a new number and refuses one it cannot read', () => {
    expect(phoneInput('050 123 45 67', { current: null, country: 'AZ' })).toBe('+994501234567');
    expect(phoneInput('0151 12345678', { country: 'DE' })).toBe('+4915112345678');
    expect(code(() => phoneInput('0151 12345678', { country: 'AZ' }))).toBe('400:INVALID_PHONE');
    expect(code(() => phoneInput('call me'))).toBe('400:INVALID_PHONE');
  });

  it('keeps an unreadable legacy value that is sent back unchanged', () => {
    expect(phoneInput('ask office', { current: 'ask office' })).toBe('ask office');
    expect(phoneInput(' ask office ', { current: 'ask office' })).toBe('ask office');
    expect(code(() => phoneInput('ask office 2', { current: 'ask office' }))).toBe('400:INVALID_PHONE');
  });
});

describe('planPhoneMigration', () => {
  const rows = [
    { id: 'a', phone: '+994501234567', country: 'AZ' as const },
    { id: 'b', phone: '050 123 45 67', country: 'AZ' as const },
    { id: 'c', phone: '0151 12345678', country: 'DE' as const },
    { id: 'd', phone: '0151 12345678', country: null },
    { id: 'e', phone: 'whatsapp only', country: 'AZ' as const },
    { id: 'f', phone: null, country: null },
    { id: 'g', phone: '', country: null },
    { id: 'h', phone: '00994 55 555 55 55', country: null },
  ];

  it('changes only what it can read unambiguously and lists the rest', () => {
    const plan = planPhoneMigration(rows);
    expect(plan.updates).toEqual([
      { id: 'b', from: '050 123 45 67', to: '+994501234567' },
      { id: 'c', from: '0151 12345678', to: '+4915112345678' },
      { id: 'h', from: '00994 55 555 55 55', to: '+994555555555' },
    ]);
    expect(plan.flagged.map((f) => [f.id, f.reason])).toEqual([
      ['d', 'AMBIGUOUS'],
      ['e', 'INVALID_CHARS'],
    ]);
    expect(plan.unchanged).toBe(3);
  });

  it('is idempotent: a second run after applying finds nothing to change', () => {
    const plan = planPhoneMigration(rows);
    const after = rows.map((r) => ({ ...r, phone: plan.updates.find((u) => u.id === r.id)?.to ?? r.phone }));
    const again = planPhoneMigration(after);
    expect(again.updates).toEqual([]);
    expect(again.flagged).toEqual(plan.flagged);
  });
});
