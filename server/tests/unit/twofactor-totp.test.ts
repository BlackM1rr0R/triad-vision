import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  generateRecoveryCodes,
  generateTotp,
  generateTotpSecret,
  hashRecoveryCode,
  hotp,
  otpauthUri,
  verifyTotp,
} from '../../src/lib/totp.js';
import { open, seal } from '../../src/lib/secretBox.js';

// RFC 6238 Appendix B uses the ASCII secret "12345678901234567890" (SHA1).
const RFC_SECRET = Buffer.from('12345678901234567890', 'ascii');
const RFC_B32 = base32Encode(RFC_SECRET);

describe('TOTP (RFC 6238)', () => {
  it('base32 round-trips and matches the RFC 4648 alphabet', () => {
    expect(RFC_B32).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode(RFC_B32).equals(RFC_SECRET)).toBe(true);
    expect(base32Decode('gezd gnbv-gy3t')).toEqual(base32Decode('GEZDGNBVGY3T'));
    expect(() => base32Decode('1!')).toThrow();
  });

  it('matches the RFC 6238 SHA1 test vectors (last 6 digits)', () => {
    const vectors: [number, string][] = [
      [59, '94287082'],
      [1111111109, '07081804'],
      [1111111111, '14050471'],
      [1234567890, '89005924'],
      [2000000000, '69279037'],
    ];
    for (const [t, expected] of vectors) {
      expect(hotp(RFC_SECRET, Math.floor(t / 30), 8)).toBe(expected);
      expect(generateTotp(RFC_B32, t * 1000)).toBe(expected.slice(-6));
    }
  });

  it('accepts ±1 step of drift and nothing beyond', () => {
    const secret = generateTotpSecret();
    const now = 1_800_000_000_000;
    const step = Math.floor(now / 30000);
    expect(verifyTotp(secret, generateTotp(secret, now), now)).toBe(step);
    expect(verifyTotp(secret, generateTotp(secret, now - 30_000), now)).toBe(step - 1);
    expect(verifyTotp(secret, generateTotp(secret, now + 30_000), now)).toBe(step + 1);
    expect(verifyTotp(secret, generateTotp(secret, now - 90_000), now)).toBeNull();
    expect(verifyTotp(secret, generateTotp(secret, now + 90_000), now)).toBeNull();
    expect(verifyTotp(secret, 'abcdef', now)).toBeNull();
    expect(verifyTotp(secret, '12345', now)).toBeNull();
  });

  it('builds an otpauth URI authenticator apps understand', () => {
    const uri = otpauthUri('ABCDEF', 'staff@example.com');
    expect(uri.startsWith('otpauth://totp/Triad%20Vision%3Astaff%40example.com?')).toBe(true);
    const params = new URL(uri).searchParams;
    expect(params.get('secret')).toBe('ABCDEF');
    expect(params.get('issuer')).toBe('Triad Vision');
    expect(params.get('digits')).toBe('6');
    expect(params.get('period')).toBe('30');
  });

  it('generates 10 distinct recovery codes whose hash ignores case and dashes', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[a-z2-9]{5}-[a-z2-9]{5}$/);
    expect(hashRecoveryCode(codes[0]!)).toBe(hashRecoveryCode(` ${codes[0]!.toUpperCase().replace('-', '')} `));
    expect(hashRecoveryCode(codes[0]!)).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('secretBox (AES-256-GCM)', () => {
  it('round-trips and uses a fresh IV every time', () => {
    const a = seal('JBSWY3DPEHPK3PXP');
    const b = seal('JBSWY3DPEHPK3PXP');
    expect(a).not.toBe(b);
    expect(a.startsWith('v1:')).toBe(true);
    expect(a).not.toContain('JBSWY3DPEHPK3PXP');
    expect(open(a)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('rejects tampered, foreign or malformed values without throwing', () => {
    const sealed = seal('secret');
    const raw = Buffer.from(sealed.slice(3), 'base64');
    raw[raw.length - 1] ^= 1;
    expect(open(`v1:${raw.toString('base64')}`)).toBeNull();
    expect(open('v1:AAAA')).toBeNull();
    expect(open('plain-text')).toBeNull();
    expect(open(null)).toBeNull();
  });

  it('uses TOTP_ENC_KEY when set (values sealed with another key do not open)', () => {
    const before = seal('x');
    process.env.TOTP_ENC_KEY = 'another-key-for-the-test';
    try {
      expect(open(before)).toBeNull();
      expect(open(seal('y'))).toBe('y');
    } finally {
      delete process.env.TOTP_ENC_KEY;
    }
    expect(open(before)).toBe('x');
  });
});
