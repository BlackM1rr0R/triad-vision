/**
 * Pure rules of the document expiry warnings: which warning windows apply to a document, which window
 * a moment falls into and whether a reminder is due. No database access, so it is unit tested directly.
 *
 * A "window" is a number of days before the expiry date (180 = "six months before"). Window 0 means
 * "already expired". A document is warned once per window: the window the last reminder fell into is
 * recomputed from `expiryRemindedAt`, and a reminder is only due once the document entered a narrower one.
 * Entering late (e.g. a passport with 20 days left) only sends the narrowest matching window.
 */

export type ExpiryKind = 'passport' | 'default';

/**
 * Warning windows in days before the expiry date, per kind (configure here).
 *   - passport: 6 months (Schengen/visa rule: valid well beyond the stay), 3 months, 1 month;
 *   - every other document with a validity (certificates, police clearance, health insurance, language
 *     certificate…): 60, 30 and 7 days.
 */
export const EXPIRY_WINDOWS: Record<ExpiryKind, readonly number[]> = {
  passport: [180, 90, 30],
  default: [60, 30, 7],
};

/** DocumentRequirement.key / VaultDocument.kind → kind. Anything not listed uses `default`. */
export const EXPIRY_KIND_BY_KEY: Record<string, ExpiryKind> = {
  PASSPORT: 'passport',
};

/** Staff digest: documents expiring within this many days. */
export const DIGEST_DAYS = 30;

const DAY = 24 * 60 * 60 * 1000;

export const kindForKey = (key: string | null | undefined): ExpiryKind => (key && EXPIRY_KIND_BY_KEY[key]) || 'default';

/** Whole days left until the expiry date (0 or negative once it passed). */
export const daysLeft = (expiresAt: Date, now: Date) => Math.ceil((expiresAt.getTime() - now.getTime()) / DAY);

/** The narrowest window `at` falls into; 0 = expired; null = before the widest window. */
export const windowAt = (kind: ExpiryKind, expiresAt: Date, at: Date): number | null => {
  const left = daysLeft(expiresAt, at);
  if (left <= 0) return 0;
  const windows = [...EXPIRY_WINDOWS[kind]].sort((a, b) => a - b);
  return windows.find((w) => left <= w) ?? null;
};

/**
 * The window a reminder is due for right now, or null. `remindedAt` is the moment of the last reminder
 * for this expiry date (reset to null whenever the date changes).
 */
export const dueWindow = (kind: ExpiryKind, expiresAt: Date, remindedAt: Date | null, now: Date): number | null => {
  const current = windowAt(kind, expiresAt, now);
  if (current === null) return null;
  if (!remindedAt) return current;
  const last = windowAt(kind, expiresAt, remindedAt);
  if (last === null) return current;
  return current < last ? current : null;
};

export type ExpiryTone = 'ok' | 'soon' | 'urgent' | 'expired';

/** Chip colour: expired (red), inside the narrowest windows (red/amber), otherwise fine (green). */
export const toneOf = (kind: ExpiryKind, expiresAt: Date, now: Date): ExpiryTone => {
  const left = daysLeft(expiresAt, now);
  if (left <= 0) return 'expired';
  const windows = [...EXPIRY_WINDOWS[kind]].sort((a, b) => a - b);
  if (left <= windows[0]) return 'urgent';
  if (left <= windows[windows.length - 1]) return 'soon';
  return 'ok';
};

// ─── Reading an expiry date out of stored OCR / check results ─────────────

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})/;

/** "YYYY-MM-DD…" → Date at UTC midnight, or null for anything that is not a real calendar date. */
export const parseDay = (value: unknown): Date | null => {
  if (typeof value !== 'string') return null;
  const m = ISO_DAY.exec(value.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime()) || d.getUTCDate() !== Number(m[3]) || d.getUTCMonth() !== Number(m[2]) - 1) return null;
  const year = d.getUTCFullYear();
  return year >= 1990 && year <= 2100 ? d : null;
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);

/**
 * Expiry date found in a document's `ocr` JSON (passport MRZ from the OCR job, or the vault-style
 * `{ fields: { expiryDate }, valid }`) or in its `checks` JSON (expiry issues of the upload check).
 * The MRZ date is only trusted when its check digit is correct.
 */
export const expiryFromRecords = (ocr: unknown, checks?: unknown): Date | null => {
  const o = obj(ocr);
  const mrz = obj(o?.mrz);
  if (mrz) {
    const digits = obj(mrz.checks);
    if (mrz.valid === true || digits?.expiryDate === true) {
      const d = parseDay(mrz.expiryDate);
      if (d) return d;
    }
  }
  const fields = obj(o?.fields);
  if (fields && o?.valid !== false) {
    const d = parseDay(fields.expiryDate);
    if (d) return d;
  }
  const c = obj(checks);
  if (c && Array.isArray(c.issues)) {
    for (const issue of c.issues) {
      const d = parseDay(obj(obj(issue)?.params)?.expiryDate);
      if (d) return d;
    }
  }
  return null;
};
