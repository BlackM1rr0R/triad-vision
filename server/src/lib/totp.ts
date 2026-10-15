import crypto from 'node:crypto';

/**
 * Time-based one-time passwords (RFC 6238 on top of RFC 4226 HOTP): HMAC-SHA1, 30-second steps,
 * 6 digits — what Google Authenticator, Microsoft Authenticator, 1Password, Aegis etc. expect.
 */
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** Accepted clock drift in steps on either side (±30 s). */
export const TOTP_WINDOW = 1;
export const TOTP_ISSUER = 'Triad Vision';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export const base32Encode = (buf: Buffer) => {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
};

export const base32Decode = (input: string) => {
  const clean = input.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error('INVALID_BASE32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
};

/** New random 160-bit secret (RFC 4226 recommends ≥ 128 bits), base32 encoded. */
export const generateTotpSecret = () => base32Encode(crypto.randomBytes(20));

export const hotp = (secret: Buffer, counter: number, digits = TOTP_DIGITS) => {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = crypto.createHmac('sha1', secret).update(msg).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const bin = (mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return String(bin).padStart(digits, '0');
};

export const totpCounter = (atMs = Date.now()) => Math.floor(atMs / 1000 / TOTP_STEP_SECONDS);

export const generateTotp = (secretB32: string, atMs = Date.now()) => hotp(base32Decode(secretB32), totpCounter(atMs));

/**
 * Checks a 6-digit code against the current step ±TOTP_WINDOW. Returns the matching counter (so the
 * caller can refuse to accept the same code twice), or null. Comparison is constant-time.
 */
export const verifyTotp = (secretB32: string, code: string, atMs = Date.now()): number | null => {
  const clean = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return null;
  const secret = base32Decode(secretB32);
  const now = totpCounter(atMs);
  let match: number | null = null;
  for (let c = now - TOTP_WINDOW; c <= now + TOTP_WINDOW; c++) {
    if (crypto.timingSafeEqual(Buffer.from(hotp(secret, c)), Buffer.from(clean)) && match === null) match = c;
  }
  return match;
};

export const otpauthUri = (secretB32: string, account: string) => {
  const label = encodeURIComponent(`${TOTP_ISSUER}:${account}`);
  const params = new URLSearchParams({
    secret: secretB32,
    issuer: TOTP_ISSUER,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
};

// ─── Recovery codes ─────────────────────────────────────────────────────

export const RECOVERY_CODE_COUNT = 10;
/** No 0/O/1/I/L: codes are typed from paper. */
const RC_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** Recovery code as shown to the user: "xxxxx-xxxxx". */
export const generateRecoveryCodes = (n = RECOVERY_CODE_COUNT) =>
  Array.from({ length: n }, () => {
    const bytes = crypto.randomBytes(10);
    const chars = Array.from(bytes, (b) => RC_ALPHABET[b % RC_ALPHABET.length]).join('');
    return `${chars.slice(0, 5)}-${chars.slice(5)}`;
  });

export const normalizeRecoveryCode = (code: string) => code.toLowerCase().replace(/[^a-z0-9]/g, '');

export const hashRecoveryCode = (code: string) =>
  crypto.createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex');
