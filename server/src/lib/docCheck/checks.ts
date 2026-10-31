import fsp from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { config } from '../../config.js';
import { langDataAvailable, OCR_IMAGE_MIME } from '../docsIntel/ocr.js';
import { imageSize, scanPassportImage, type PassportScanResult } from '../docsIntel/passportScan.js';

/**
 * Automatic document checks right after an upload (case documents and the client's document vault).
 * Only cheap, library-free checks run here — image quality (blur, darkness, cut-off) is analysed in the
 * browser before the upload (client/src/lib/docCheck.ts), because the server has no image library.
 *
 *   - PDF: must load with pdf-lib (not encrypted, not broken) and have at least one page.
 *   - Photo requirement: must be an image, not a PDF / Word file.
 *   - Images: pixel size read from the file header (PNG IHDR, JPEG SOFn, WebP VP8/VP8L/VP8X).
 *   - Passport (and ID card) images: MRZ OCR with a short deadline; a timeout leaves the result
 *     `pending` and a background job finishes it (see lib/docCheck/index.ts).
 *
 * Checks never block an upload: they are stored next to the file and shown to the client and staff.
 */

export type CheckLevel = 'ok' | 'warn' | 'error';
export type CheckCode =
  | 'EMPTY_FILE'
  | 'PDF_UNREADABLE'
  | 'PHOTO_NOT_IMAGE'
  | 'LOW_RESOLUTION'
  | 'WRONG_TYPE_SUSPECTED'
  | 'PASSPORT_EXPIRED'
  | 'PASSPORT_EXPIRES_SOON';

export interface CheckIssue {
  code: CheckCode;
  level: 'warn' | 'error';
  params?: Record<string, string | number>;
}

export interface DocChecks {
  level: CheckLevel;
  issues: CheckIssue[];
  at: string;
  /** MRZ OCR did not finish in time; a background job completes the check. */
  pending?: boolean;
}

/** Which special rules apply to a file. */
export type CheckTarget = 'PASSPORT' | 'ID_CARD' | 'PHOTO' | 'OTHER';

/** Synchronous OCR budget inside the upload request. */
export const SYNC_OCR_TIMEOUT_MS = 8_000;
/** An image whose longest edge is below this many pixels is reported as LOW_RESOLUTION. */
export const MIN_IMAGE_EDGE = 600;
/** Passport validity thresholds (months): below ERROR is an error, below WARN a warning. */
export const PASSPORT_ERROR_MONTHS = 6;
export const PASSPORT_WARN_MONTHS = 12;

/** Requirement key (DocumentRequirement.key) → check target. */
export const targetForRequirement = (key: string | null | undefined): CheckTarget => {
  if (key === 'PASSPORT') return 'PASSPORT';
  if (key === 'ID_CARD') return 'ID_CARD';
  if (key === 'PHOTO' || key === 'PHOTO_2') return 'PHOTO';
  return 'OTHER';
};

/** Vault kind → check target. */
export const targetForVaultKind = (kind: string): CheckTarget =>
  kind === 'PASSPORT' || kind === 'ID_CARD' || kind === 'PHOTO' ? kind : 'OTHER';

/**
 * Replaceable dependencies (tests swap the OCR for a stub). OCR is off in the test environment unless a
 * test turns it on, so e2e uploads never start tesseract.
 */
export const docCheckDeps: {
  ocrAvailable: () => boolean;
  scan: (image: Buffer, opts: { timeoutMs?: number; now?: Date }) => Promise<PassportScanResult>;
} = {
  ocrAvailable: () => !config.isTest && langDataAvailable(),
  scan: scanPassportImage,
};

const MONTH_MS = 30.44 * 24 * 60 * 60 * 1000;

/** Whole months between now and an ISO date (negative when in the past). */
export const monthsLeft = (expiryIso: string, now = new Date()) =>
  Math.floor((new Date(`${expiryIso.slice(0, 10)}T00:00:00Z`).getTime() - now.getTime()) / MONTH_MS);

/** Expiry issue for a passport / ID expiry date, or null when it is valid long enough. */
export const expiryIssue = (expiryIso: string | null | undefined, now = new Date()): CheckIssue | null => {
  if (!expiryIso) return null;
  const expiry = new Date(`${expiryIso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(expiry.getTime())) return null;
  const date = expiryIso.slice(0, 10);
  if (expiry.getTime() < now.getTime()) return { code: 'PASSPORT_EXPIRED', level: 'error', params: { expiryDate: date } };
  const left = expiry.getTime() - now.getTime();
  const months = Math.max(0, monthsLeft(date, now));
  if (left < PASSPORT_ERROR_MONTHS * MONTH_MS) return { code: 'PASSPORT_EXPIRES_SOON', level: 'error', params: { expiryDate: date, months } };
  if (left < PASSPORT_WARN_MONTHS * MONTH_MS) return { code: 'PASSPORT_EXPIRES_SOON', level: 'warn', params: { expiryDate: date, months } };
  return null;
};

/** Overall level of a list of issues. */
export const levelOf = (issues: CheckIssue[]): CheckLevel =>
  issues.some((i) => i.level === 'error') ? 'error' : issues.length ? 'warn' : 'ok';

export const buildChecks = (issues: CheckIssue[], now = new Date(), pending = false): DocChecks => ({
  level: levelOf(issues),
  issues,
  at: now.toISOString(),
  ...(pending ? { pending: true } : {}),
});

/** True when the PDF opens (not encrypted / not corrupt) and has at least one page. */
export const pdfReadable = async (buf: Buffer) => {
  try {
    const pdf = await PDFDocument.load(buf, { ignoreEncryption: false, updateMetadata: false });
    return pdf.getPageCount() > 0;
  } catch {
    return false;
  }
};

/** The OCR issues of a passport / ID scan result. */
export const issuesFromScan = (target: CheckTarget, scan: PassportScanResult, now = new Date()): CheckIssue[] => {
  if (!scan.ok) {
    // ID cards use a 3-line MRZ the parser does not read, so a missing MRZ is only suspicious on passports.
    return scan.error === 'MRZ_NOT_FOUND' && target === 'PASSPORT' ? [{ code: 'WRONG_TYPE_SUSPECTED', level: 'warn' }] : [];
  }
  const issue = expiryIssue(scan.fields.expiryDate, now);
  return issue ? [issue] : [];
};

export interface CheckResult {
  checks: DocChecks;
  /** Passport fields read from the MRZ (vault prefill), when the scan succeeded. */
  scan?: Extract<PassportScanResult, { ok: true }>;
}

/** Runs every check on a stored file. Never throws for bad content (only for an unreadable path). */
export const runChecks = async (input: {
  path: string;
  mimeType: string;
  target: CheckTarget;
  now?: Date;
  timeoutMs?: number;
}): Promise<CheckResult> => checkBuffer(await fsp.readFile(input.path), input);

/**
 * The same checks on file content in memory: stored files (runChecks) and the pre-upload check of a
 * passport / ID photo in the client portal (POST /api/vault/precheck), which stores nothing.
 */
export const checkBuffer = async (
  buf: Buffer,
  input: { mimeType: string; target: CheckTarget; now?: Date; timeoutMs?: number },
): Promise<CheckResult> => {
  const now = input.now ?? new Date();
  const issues: CheckIssue[] = [];
  if (buf.length === 0) return { checks: buildChecks([{ code: 'EMPTY_FILE', level: 'error' }], now) };

  const isImage = OCR_IMAGE_MIME.includes(input.mimeType);
  const isPdf = input.mimeType === 'application/pdf';

  if (isPdf && !(await pdfReadable(buf))) issues.push({ code: 'PDF_UNREADABLE', level: 'error' });
  if (input.target === 'PHOTO' && !isImage) issues.push({ code: 'PHOTO_NOT_IMAGE', level: 'error' });

  if (isImage) {
    const size = imageSize(buf);
    if (size && Math.max(size.width, size.height) < MIN_IMAGE_EDGE) {
      issues.push({ code: 'LOW_RESOLUTION', level: 'warn', params: { width: size.width, height: size.height } });
    }
  }

  let pending = false;
  let scan: CheckResult['scan'];
  if (isImage && (input.target === 'PASSPORT' || input.target === 'ID_CARD') && docCheckDeps.ocrAvailable()) {
    try {
      const result = await docCheckDeps.scan(buf, { timeoutMs: input.timeoutMs ?? SYNC_OCR_TIMEOUT_MS, now });
      if (!result.ok && result.error === 'OCR_TIMEOUT') pending = true;
      else {
        issues.push(...issuesFromScan(input.target, result, now));
        if (result.ok) scan = result;
      }
    } catch (err) {
      // OCR failures never fail an upload; the file is simply not MRZ-checked.
      console.error('[docCheck] passport OCR failed', err);
    }
  }
  return { checks: buildChecks(issues, now, pending), scan };
};

/** Reads a stored checks JSON value defensively. */
export const checksOf = (value: unknown): DocChecks | null => {
  const v = value as Partial<DocChecks> | null;
  return v && typeof v === 'object' && Array.isArray(v.issues) && typeof v.level === 'string' ? (v as DocChecks) : null;
};
