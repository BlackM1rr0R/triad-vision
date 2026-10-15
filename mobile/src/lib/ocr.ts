import type { Mrz, OcrRecord } from '@/types';

/** Pure helpers around the passport OCR record returned by /api/documents/:id/ocr. */

export type OcrOutcome = 'pending' | 'done' | 'failed';

export const mrzOf = (ocr: OcrRecord | null | undefined): Mrz | null => (ocr && 'mrz' in ocr && ocr.mrz ? ocr.mrz : null);

/** pending: not run yet · done: a machine readable zone was found · failed: skipped (PDF), error or no MRZ. */
export const ocrOutcome = (ocr: OcrRecord | null | undefined): OcrOutcome => {
  if (!ocr) return 'pending';
  return mrzOf(ocr) ? 'done' : 'failed';
};

/** HTTP statuses / codes meaning "OCR is not offered here" — the UI hides the feature quietly. */
export const ocrUnavailable = (status: number | undefined, code: string) =>
  status === 404 || status === 501 || status === 503 || code === 'OCR_UNAVAILABLE' || code === 'NOT_FOUND';

/** Display name in passport order: "ALIYEV ALI". */
export const mrzName = (mrz: Pick<Mrz, 'surname' | 'givenNames'>) => [mrz.surname, mrz.givenNames].filter(Boolean).join(' ').trim();

const MONTH_MS = 30.44 * 24 * 60 * 60 * 1000;

/** 'expired', 'soon' (within 12 months, matches the server's PASSPORT_WARNING_MONTHS) or 'ok'. */
export const expiryState = (expiryDate: string | null | undefined, now = Date.now()): 'ok' | 'soon' | 'expired' | null => {
  if (!expiryDate) return null;
  const t = new Date(`${expiryDate}T00:00:00Z`).getTime();
  if (Number.isNaN(t)) return null;
  if (t <= now) return 'expired';
  return t < now + 12 * MONTH_MS ? 'soon' : 'ok';
};
