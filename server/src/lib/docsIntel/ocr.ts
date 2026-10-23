import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Locale, Prisma } from '@prisma/client';
import type { Worker } from 'tesseract.js';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { HttpError, notFound } from '../http.js';
import { notifyStaff, notifyUser } from '../notifications.js';
import { parseMrzText, type MrzResult } from './mrz.js';
import { syncClientFolders } from '../drive/caseFolders.js';
import { scanUserDuplicates } from '../duplicates/detect.js';
import { fillExpiryFromOcr } from '../expiry/index.js';

/**
 * Passport OCR: runs tesseract.js on an uploaded image, extracts the MRZ and stores the result on the
 * Document (`ocr`, `ocrAt`). A valid MRZ on a PASSPORT requirement also fills the empty profile fields
 * of the client and raises a warning when the passport expires within 12 months.
 *
 * Language data is read from TESSERACT_LANG_PATH (default server/ocr) and never downloaded at runtime;
 * see server/README-ocr.md. Without it OCR is reported as unavailable, nothing crashes.
 */

export const OCR_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MRZ_WHITELIST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<';
export const PASSPORT_WARNING_MONTHS = 12;

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const ocrDataDir = process.env.TESSERACT_LANG_PATH ? path.resolve(process.env.TESSERACT_LANG_PATH) : path.join(serverRoot, 'ocr');

/** Which language file is present (plain or gzipped), or null. */
export const langDataFile = () => {
  for (const name of ['eng.traineddata', 'eng.traineddata.gz']) {
    const p = path.join(ocrDataDir, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
};
export const langDataAvailable = () => langDataFile() !== null;

export type OcrRecord =
  | { skipped: 'pdf' | 'unsupported'; at: string }
  | { error: string; at: string; raw?: string }
  | {
      mrz: MrzResult | null;
      raw: string;
      confidence: number;
      at: string;
      /** Profile fields that were empty and got filled from the MRZ. */
      applied?: string[];
      /** Passport expires within PASSPORT_WARNING_MONTHS (set when the warning was raised). */
      expiryWarning?: boolean;
      error?: 'MRZ_NOT_FOUND';
    };

// ─── Worker ────────────────────────────────────────────────────────────

let workerPromise: Promise<Worker> | null = null;

const createMrzWorker = async () => {
  const { createWorker, OEM, PSM } = await import('tesseract.js');
  const file = langDataFile();
  const worker = await createWorker('eng', OEM.LSTM_ONLY, {
    langPath: ocrDataDir,
    cachePath: ocrDataDir,
    cacheMethod: 'none',
    gzip: !!file && file.endsWith('.gz'),
    logger: () => undefined,
    errorHandler: (err: unknown) => console.error('[ocr] worker error', err),
  });
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, tessedit_char_whitelist: MRZ_WHITELIST });
  return worker;
};

/** One worker per process, created on first use and recreated after a failure. */
export const getWorker = () => {
  if (!workerPromise) {
    workerPromise = createMrzWorker().catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
};

export const terminateWorker = async () => {
  const p = workerPromise;
  workerPromise = null;
  if (p) await p.then((w) => w.terminate()).catch(() => undefined);
};

const withTimeout = <T>(p: Promise<T>, ms: number, label: string) =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });

/** Runs tesseract on an image buffer and returns the raw text and confidence. */
export const recognizeText = async (image: Buffer, timeoutMs: number) => {
  const worker = await withTimeout(getWorker(), timeoutMs, 'OCR start');
  try {
    const { data } = await withTimeout(worker.recognize(image), timeoutMs, 'OCR');
    return { raw: data.text ?? '', confidence: Math.round((data.confidence ?? 0) * 10) / 10 };
  } catch (err) {
    // A hung or crashed worker is thrown away so the next run starts clean.
    await terminateWorker();
    throw err;
  }
};

// ─── Profile fill + expiry warning ────────────────────────────────────

const MONTH = 30.44 * 24 * 60 * 60 * 1000;

export const expiresSoon = (expiryDate: string, now = new Date()) => {
  const expiry = new Date(`${expiryDate}T00:00:00Z`);
  return !Number.isNaN(expiry.getTime()) && expiry.getTime() < now.getTime() + PASSPORT_WARNING_MONTHS * MONTH;
};

type ProfileFields = { passportNumber: string | null; passportExpiry: Date | null; birthDate: Date | null; nationality: string | null };

/** Profile values an MRZ provides (ISO3 nationality code is kept as is). */
export const profileFromMrz = (mrz: MrzResult): ProfileFields => ({
  passportNumber: mrz.documentNumber || null,
  passportExpiry: mrz.expiryDate ? new Date(`${mrz.expiryDate}T00:00:00Z`) : null,
  birthDate: mrz.birthDate ? new Date(`${mrz.birthDate}T00:00:00Z`) : null,
  nationality: mrz.nationality || null,
});

const WARNING_TEXT: Record<Locale, { title: string; body: (d: string) => string }> = {
  az: { title: 'Pasport etibarlılığı 12 aydan azdır', body: (d) => `Pasportunuzun etibarlılıq müddəti ${d} tarixində bitir. Səfirlik ən azı 12 ay etibarlı pasport tələb edir — zəhmət olmasa pasportu yeniləyin.` },
  de: { title: 'Reisepass weniger als 12 Monate gültig', body: (d) => `Ihr Reisepass läuft am ${d} ab. Die Botschaft verlangt einen mindestens 12 Monate gültigen Pass – bitte erneuern Sie ihn.` },
  en: { title: 'Passport valid for less than 12 months', body: (d) => `Your passport expires on ${d}. The embassy requires a passport valid for at least 12 months – please renew it.` },
  ru: { title: 'Паспорт действителен менее 12 месяцев', body: (d) => `Срок действия вашего паспорта истекает ${d}. Посольство требует паспорт, действительный не менее 12 месяцев – пожалуйста, обновите его.` },
};

/** Fills EMPTY profile fields from a valid MRZ; returns the field names that were written. */
export const fillEmptyProfileFields = async (userId: string, mrz: MrzResult) => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passportNumber: true, passportExpiry: true, birthDate: true, nationality: true } });
  if (!user) return [];
  const values = profileFromMrz(mrz);
  const data: Partial<ProfileFields> = {};
  for (const key of Object.keys(values) as (keyof ProfileFields)[]) {
    const current = user[key];
    const empty = current === null || current === undefined || (typeof current === 'string' && current.trim() === '');
    if (empty && values[key] !== null) (data as Record<string, unknown>)[key] = values[key];
  }
  const applied = Object.keys(data);
  if (applied.length) await prisma.user.update({ where: { id: userId }, data });
  if (applied.includes('passportNumber')) void syncClientFolders(userId); // "… · Pass-Nr." folder names
  if (applied.length) void scanUserDuplicates(userId);
  return applied;
};

/** Overwrites the profile with the MRZ values (explicit "apply" by staff or the client). */
export const applyMrzToProfile = async (userId: string, mrz: MrzResult) => {
  const data = profileFromMrz(mrz);
  await prisma.user.update({ where: { id: userId }, data });
  void syncClientFolders(userId); // "… · Pass-Nr." folder names
  void scanUserDuplicates(userId);
  return data;
};

const warnPassportExpiry = async (c: { id: string; number: string; clientId: string }, expiryDate: string) => {
  const client = await prisma.user.findUnique({ where: { id: c.clientId }, select: { locale: true, firstName: true, lastName: true } });
  if (!client) return;
  const text = WARNING_TEXT[client.locale];
  await notifyUser(c.clientId, { type: 'PASSPORT_EXPIRY_OCR', title: text.title, body: text.body(expiryDate), link: `/account/cases/${c.id}`, caseId: c.id });
  await notifyStaff(
    `${c.number}: pasport etibarlılığı 12 aydan azdır`,
    `${client.firstName} ${client.lastName} — pasportun etibarlılıq müddəti ${expiryDate} tarixində bitir (OCR).`,
    { caseId: c.id, link: `/admin/cases/${c.id}`, type: 'PASSPORT_EXPIRY_OCR' },
  );
  await prisma.caseEvent.create({
    data: { caseId: c.id, type: 'PASSPORT_EXPIRY_WARNING', note: `${text.title} (${expiryDate})`, actorId: null, visibleToClient: true },
  });
};

// ─── Document OCR ──────────────────────────────────────────────────────

const store = async (docId: string, record: OcrRecord) => {
  const doc = await prisma.document.update({ where: { id: docId }, data: { ocr: record as unknown as Prisma.InputJsonValue, ocrAt: new Date() } });
  await fillExpiryFromOcr(docId, record); // an MRZ expiry date fills an empty Document.expiresAt (never throws)
  return doc;
};

/**
 * Runs OCR for one document and stores the outcome. Non-images are marked as skipped so the job never
 * picks them again. Throws OCR_UNAVAILABLE (503) when the language data is missing — nothing is stored
 * then, so the document is processed once the data is installed.
 */
export const ocrDocument = async (docId: string, opts: { timeoutMs?: number; now?: Date } = {}) => {
  const now = opts.now ?? new Date();
  const doc = await prisma.document.findUnique({
    where: { id: docId },
    include: { requirement: { select: { key: true } }, case: { select: { id: true, number: true, clientId: true } } },
  });
  if (!doc) throw notFound('DOCUMENT_NOT_FOUND');
  const at = now.toISOString();

  if (!OCR_IMAGE_MIME.includes(doc.mimeType)) {
    const record: OcrRecord = { skipped: doc.mimeType === 'application/pdf' ? 'pdf' : 'unsupported', at };
    await store(doc.id, record);
    return record;
  }
  if (!langDataAvailable()) throw new HttpError(503, 'OCR_UNAVAILABLE', `Tesseract language data not found in ${ocrDataDir}`);

  let raw = '';
  let confidence = 0;
  try {
    const image = await fsp.readFile(path.join(config.uploads.privateDir, doc.storedName));
    ({ raw, confidence } = await recognizeText(image, opts.timeoutMs ?? 60_000));
  } catch (err) {
    const record: OcrRecord = { error: (err as Error).message?.slice(0, 300) || 'OCR_FAILED', at };
    await store(doc.id, record);
    return record;
  }

  const mrz = parseMrzText(raw, now);
  const record: OcrRecord = mrz ? { mrz, raw, confidence, at } : { mrz: null, raw, confidence, at, error: 'MRZ_NOT_FOUND' };

  if (mrz?.valid && doc.requirement?.key === 'PASSPORT') {
    record.applied = await fillEmptyProfileFields(doc.case.clientId, mrz);
    if (expiresSoon(mrz.expiryDate, now)) {
      record.expiryWarning = true;
      await warnPassportExpiry(doc.case, mrz.expiryDate);
    }
  }
  await store(doc.id, record);
  return record;
};

/** The MRZ stored on a document, when OCR found a valid one. */
export const mrzOf = (ocr: unknown): MrzResult | null => {
  const r = ocr as Partial<Extract<OcrRecord, { mrz: unknown }>> | null;
  return r && typeof r === 'object' && r.mrz && typeof r.mrz === 'object' ? (r.mrz as MrzResult) : null;
};
