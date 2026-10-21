import { expiresSoon, getWorker, terminateWorker } from './ocr.js';
import { parseMrz, parseMrzText, type MrzResult } from './mrz.js';

/**
 * Registration helper: reads the MRZ of a passport photo held in memory and returns the fields the
 * sign-up form needs. Nothing is written to disk or to the database — the buffer is dropped with the
 * request. OCR runs in the shared tesseract.js worker (a worker thread), so the event loop is never
 * blocked; concurrent scans simply queue behind each other.
 */

export const PASSPORT_SCAN_TIMEOUT_MS = 20_000;
/** Share of the image height (from the bottom) that is read first: the MRZ sits in the lowest ~quarter. */
const BOTTOM_SHARE = 0.4;

export type ScanWarning = 'EXPIRED' | 'EXPIRES_SOON' | 'CHECK_DIGIT';

export interface PassportScanFields {
  firstName: string;
  lastName: string;
  birthDate: string | null;
  passportNumber: string;
  nationality: string | null;
  sex: 'M' | 'F' | 'X';
  expiryDate: string | null;
}

export type PassportScanResult =
  | {
      ok: true;
      fields: PassportScanFields;
      checks: { valid: boolean; documentNumber: boolean; birthDate: boolean; expiryDate: boolean; composite: boolean };
      warnings: ScanWarning[];
    }
  | { ok: false; error: 'MRZ_NOT_FOUND' | 'OCR_TIMEOUT' };

/** MRZ names are upper-case: "ALIYEV" → "Aliyev", "ANNA MARIA" → "Anna Maria". */
export const titleCase = (s: string) =>
  s
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

const todayIso = (now: Date) => now.toISOString().slice(0, 10);

/** Turns a parsed MRZ into the registration fields, checks and warnings. */
export const scanResultFromMrz = (mrz: MrzResult, now = new Date()): PassportScanResult => {
  const warnings: ScanWarning[] = [];
  if (mrz.expiryDate) {
    if (mrz.expiryDate < todayIso(now)) warnings.push('EXPIRED');
    else if (expiresSoon(mrz.expiryDate, now)) warnings.push('EXPIRES_SOON');
  }
  if (!mrz.valid) warnings.push('CHECK_DIGIT');
  return {
    ok: true,
    fields: {
      firstName: titleCase(mrz.givenNames),
      lastName: titleCase(mrz.surname),
      birthDate: mrz.birthDate || null,
      passportNumber: mrz.documentNumber,
      nationality: mrz.nationality.replace(/</g, '') || null,
      sex: mrz.sex,
      expiryDate: mrz.expiryDate || null,
    },
    checks: {
      valid: mrz.valid,
      documentNumber: mrz.checks.documentNumber,
      birthDate: mrz.checks.birthDate,
      expiryDate: mrz.checks.expiryDate,
      composite: mrz.checks.composite,
    },
    warnings,
  };
};

// ─── Filler repair ─────────────────────────────────────────────────────
//
// tesseract's English model often reads the MRZ filler '<' as K or L and inserts extra characters, so
// lines come out longer than 44. Names are cut at the first run of 3+ fillers (a real name never has
// one) and the optional-data block of line 2 is rebuilt; every repaired line 2 must still satisfy the
// check digits, so a wrong repair can never turn into a "valid" result.

const OPTIONAL_LEN = 14;

/** Line 1 with everything after the names (first filler run after the "<<" separator) replaced by fillers. */
export const repairNameLine = (line: string) => {
  const sep = line.indexOf('<<', 5);
  if (sep < 0) return line.padEnd(44, '<').slice(0, 44);
  // 3+ fillers, or a run of 3+ letters tesseract typically reads a filler as (C, K, L) that runs into
  // fillers or the line end ("ALICCCCLLLL"); "BLACKLOCK" or "JACK<<<" stay intact.
  const run = line.slice(sep + 2).search(/[A-Z](?:<{3,}|[CKL]{3,}(?=[<CKL]|$))/);
  const cut = run < 0 ? line : line.slice(0, sep + 2 + run + 1);
  return cut.padEnd(44, '<').slice(0, 44);
};

/** Candidate line-2 readings: as read, and with the filler part of the optional data cleaned up. */
export const repairDataLine = (line: string): string[] => {
  const out = new Set<string>([line]);
  if (line.length >= 44 && line.length <= 52) {
    const head = line.slice(0, 28);
    const tail = line.slice(-2);
    const mid = line.slice(28, -2);
    const fit = (content: string) => {
      const c = content.replace(/^<+|<+$/g, '');
      return c.length <= OPTIONAL_LEN ? c.padEnd(OPTIONAL_LEN, '<') : null;
    };
    for (const content of [mid.replace(/[<KL]+$/, ''), mid.replace(/[KL]/g, '<'), mid.replace(/[KL]/g, '<').replace(/[0O]$/, '')]) {
      const fixed = fit(content);
      if (fixed) out.add(head + fixed + tail);
    }
  }
  return [...out];
};

const compact = (l: string) => l.replace(/\s/g, '').toUpperCase().replace(/[^A-Z0-9<]/g, '<');

/** Every MRZ reading of an OCR text (plain parse plus the repaired variants), best first. */
export const mrzCandidates = (text: string, now = new Date()): MrzResult[] => {
  const scored: { mrz: MrzResult; score: number }[] = [];
  const plain = parseMrzText(text, now);
  const lines = text.split(/\r?\n/).map(compact).filter((l) => l.length >= 30);
  // The plain parse reads the same raw lines, so it pays the same noise penalty as the repaired
  // variants (plus one): otherwise a reading whose check digits hold but whose names still carry
  // tesseract's K/L filler junk would beat its own cleaned-up repair.
  const pair = lines.findIndex((l, i) => i + 1 < lines.length && /^P[A-Z<]/.test(l) && l.includes('<<', 2) && /[0-9]/.test(lines[i + 1]));
  const plainNoise = pair < 0 ? 0 : Math.abs(lines[pair].length - 44) + Math.abs(lines[pair + 1].length - 44);
  if (plain) scored.push({ mrz: plain, score: (plain.valid ? 100 : 0) - 1 - plainNoise });
  for (let i = 0; i + 1 < lines.length; i++) {
    const l1 = lines[i];
    const l2 = lines[i + 1];
    if (!/^P[A-Z<]/.test(l1) || !l1.includes('<<', 2) || !/[0-9]/.test(l2)) continue;
    // Fewer stray characters (line length closer to 44) means a cleaner reading.
    const noise = Math.abs(l1.length - 44) + Math.abs(l2.length - 44);
    for (const data of repairDataLine(l2)) {
      const mrz = parseMrz(repairNameLine(l1), data, now);
      scored.push({ mrz, score: (mrz.valid ? 100 : 0) - noise });
    }
    break;
  }
  return scored.sort((a, b) => b.score - a.score).map((c) => c.mrz);
};

// ─── Image size (no image library on the server: read it from the header) ──

/** Pixel size of a JPEG / PNG / WebP buffer, or null when the header cannot be read. */
export const imageSize = (b: Buffer): { width: number; height: number } | null => {
  try {
    // PNG: IHDR right after the signature.
    if (b.length >= 24 && b[0] === 0x89 && b.toString('latin1', 12, 16) === 'IHDR') {
      return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
    }
    // JPEG: walk the segments up to the first SOFn marker.
    if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) return null;
        const marker = b[i + 1];
        if (marker === 0xff) { i++; continue; }
        if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { i += 2; continue; }
        const len = b.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
        }
        i += 2 + len;
      }
      return null;
    }
    // WebP: lossy (VP8), lossless (VP8L) or extended (VP8X).
    if (b.length >= 30 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') {
      const chunk = b.toString('latin1', 12, 16);
      if (chunk === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
      if (chunk === 'VP8L') {
        return {
          width: 1 + (((b[22] & 0x3f) << 8) | b[21]),
          height: 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6)),
        };
      }
      if (chunk === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    }
  } catch {
    return null;
  }
  return null;
};

// ─── OCR ───────────────────────────────────────────────────────────────

class ScanTimeout extends Error {}

/** Stray characters in the OCR lines the MRZ came from (0 for a perfect 44 + 44 reading). */
const noiseOf = (mrz: MrzResult, text: string) => {
  const lines = text.split(/\r?\n/).map(compact);
  const i = lines.findIndex((l) => l.startsWith(mrz.lines[0].slice(0, 5)) && l.includes('<<', 2));
  if (i < 0 || i + 1 >= lines.length) return 0;
  return Math.abs(lines[i].length - 44) + Math.abs(lines[i + 1].length - 44);
};

const withDeadline = <T>(p: Promise<T>, ms: number) =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new ScanTimeout('passport scan timed out')), Math.max(ms, 1));
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });

type Rect = { left: number; top: number; width: number; height: number };

const readRegion = async (image: Buffer, rectangle: Rect | undefined, deadline: number) => {
  const worker = await withDeadline(getWorker(), deadline - Date.now());
  try {
    const { data } = await withDeadline(worker.recognize(image, rectangle ? { rectangle } : {}), deadline - Date.now());
    return data.text ?? '';
  } catch (err) {
    // A hung or crashed worker is thrown away so the next scan starts clean.
    await terminateWorker();
    throw err;
  }
};

/**
 * Reads the MRZ: first the bottom part of the photo (fast, less noise), then — when that gives no
 * valid MRZ — the whole image. The best parse wins (a valid one over one with check-digit errors).
 */
export const scanPassportImage = async (image: Buffer, opts: { timeoutMs?: number; now?: Date } = {}): Promise<PassportScanResult> => {
  const now = opts.now ?? new Date();
  const deadline = Date.now() + (opts.timeoutMs ?? PASSPORT_SCAN_TIMEOUT_MS);
  const size = imageSize(image);
  const regions: (Rect | undefined)[] = [];
  if (size && size.width > 0 && size.height > 0) {
    const top = Math.floor(size.height * (1 - BOTTOM_SHARE));
    regions.push({ left: 0, top, width: size.width, height: size.height - top });
  }
  regions.push(undefined);

  // Both regions are read (the second only while time is left): the cleanest valid reading wins.
  let best: { mrz: MrzResult; score: number } | null = null;
  try {
    for (const region of regions) {
      if (best && Date.now() > deadline - 2000) break;
      const text = await readRegion(image, region, deadline);
      const [mrz] = mrzCandidates(text, now).filter((c) => c.documentNumber || c.surname);
      if (!mrz) continue;
      const score = (mrz.valid ? 100 : 0) - noiseOf(mrz, text);
      if (!best || score > best.score) best = { mrz, score };
      if (mrz.valid && score >= 100) break;
    }
  } catch (err) {
    if (best) return scanResultFromMrz(best.mrz, now);
    if (err instanceof ScanTimeout) return { ok: false, error: 'OCR_TIMEOUT' };
    throw err;
  }
  return best ? scanResultFromMrz(best.mrz, now) : { ok: false, error: 'MRZ_NOT_FOUND' };
};
