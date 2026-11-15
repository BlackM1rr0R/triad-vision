import { describe, expect, it } from 'vitest';
import {
  UPLOAD_LINK_MAX_DAYS,
  UPLOAD_LINK_MAX_FILES,
  UPLOAD_TOKEN_RE,
  expiryFrom,
  hashUploadToken,
  newUploadToken,
  requirementIdsOf,
  tokenPrefixOf,
  uploadLinkState,
  uploadPageUrl,
} from '../../src/lib/uploadLinks/token.js';
import { RECEIPT_CODE_RE, initialsOf, randomReceiptCode, staffFirstNameOf } from '../../src/lib/originals/receipts.js';

// Login-free upload links (lib/uploadLinks/token.ts) and the receipt verification code (lib/originals/receipts.ts).

const NOW = new Date('2026-11-16T10:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

describe('upload link tokens', () => {
  it('are 256-bit url-safe tokens, unique, stored only as a SHA-256 hash', () => {
    const tokens = new Set(Array.from({ length: 200 }, newUploadToken));
    expect(tokens.size).toBe(200);
    for (const t of tokens) expect(t).toMatch(UPLOAD_TOKEN_RE);
    const t = [...tokens][0];
    const h = hashUploadToken(t);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).toBe(hashUploadToken(t));
    expect(h).not.toContain(t);
    expect(hashUploadToken(`${t}x`)).not.toBe(h);
    expect(tokenPrefixOf(t)).toBe(t.slice(0, 6));
  });

  it('expire after 7 days by default, clamped to 1 … 30 days', () => {
    expect(expiryFrom(NOW).getTime() - NOW.getTime()).toBe(7 * DAY);
    expect(expiryFrom(NOW, 0).getTime() - NOW.getTime()).toBe(DAY);
    expect(expiryFrom(NOW, 99).getTime() - NOW.getTime()).toBe(UPLOAD_LINK_MAX_DAYS * DAY);
    expect(expiryFrom(NOW, 14).getTime() - NOW.getTime()).toBe(14 * DAY);
  });

  it('state: revoked beats expired beats used up', () => {
    const base = { expiresAt: new Date(NOW.getTime() + DAY), revokedAt: null, uploadCount: 0 };
    expect(uploadLinkState(base, NOW)).toBe('ACTIVE');
    expect(uploadLinkState({ ...base, expiresAt: NOW }, NOW)).toBe('EXPIRED');
    expect(uploadLinkState({ ...base, uploadCount: UPLOAD_LINK_MAX_FILES }, NOW)).toBe('EXHAUSTED');
    expect(uploadLinkState({ ...base, uploadCount: UPLOAD_LINK_MAX_FILES - 1 }, NOW)).toBe('ACTIVE');
    expect(uploadLinkState({ ...base, revokedAt: NOW, expiresAt: new Date(0) }, NOW)).toBe('REVOKED');
  });

  it('reads requirement ids defensively and builds the page URL', () => {
    expect(requirementIdsOf(['a', 'b', 3, '', null])).toEqual(['a', 'b']);
    expect(requirementIdsOf({ a: 1 })).toEqual([]);
    expect(uploadPageUrl('https://triad-vision.de/', 'abc')).toBe('https://triad-vision.de/upload/abc');
  });
});

describe('hand-over receipt verification', () => {
  it('codes are 16 characters from an unambiguous alphabet and unique', () => {
    const codes = new Set(Array.from({ length: 500 }, randomReceiptCode));
    expect(codes.size).toBe(500);
    for (const c of codes) expect(c).toMatch(RECEIPT_CODE_RE);
    expect(RECEIPT_CODE_RE.test('ABCDEFGHJKLMNPQ0')).toBe(false); // 0 is not in the alphabet
  });

  it('shows initials and the first name only', () => {
    expect(initialsOf('Əli', 'Məmmədov')).toBe('Ə. M.');
    expect(initialsOf('ismayıl', 'quliyev')).toBe('İ. Q.'); // Azerbaijani casing: i → İ
    expect(initialsOf('', '')).toBe('—');
    expect(initialsOf('Анна', null)).toBe('А.');
    expect(staffFirstNameOf('Leyla Nur')).toBe('Leyla');
    expect(staffFirstNameOf(null)).toBeNull();
  });
});
