import type { Prisma } from '@prisma/client';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { registerJob } from '../lib/scheduler.js';
import { langDataAvailable, OCR_IMAGE_MIME, ocrDataDir, ocrDocument } from '../lib/docsIntel/ocr.js';

/**
 * Passport OCR job: every minute picks a few freshly uploaded images (passport scans first) and runs
 * the MRZ extraction. A document is marked `ocrAt` even when OCR fails, so nothing loops forever.
 * Without the tesseract language data the job logs once and does nothing (see server/README-ocr.md).
 */

export const OCR_BATCH = 5;
let warnedNoData = false;

export const runOcrJob = async (limit = OCR_BATCH) => {
  if (config.isTest) return 0;
  if (!langDataAvailable()) {
    if (!warnedNoData) {
      warnedNoData = true;
      console.warn(`[job:ocr] no eng.traineddata in ${ocrDataDir} — passport OCR disabled (run: node scripts/fetch-ocr-data.mjs)`);
    }
    return 0;
  }
  warnedNoData = false;

  const candidates = await prisma.document.findMany({
    where: { ocrAt: null, stage: { in: ['INITIAL', 'EMBASSY'] }, mimeType: { in: OCR_IMAGE_MIME }, requirementId: { not: null } },
    orderBy: { createdAt: 'asc' },
    take: limit * 4,
    select: { id: true, requirement: { select: { key: true } } },
  });
  const batch = [...candidates.filter((d) => d.requirement?.key === 'PASSPORT'), ...candidates.filter((d) => d.requirement?.key !== 'PASSPORT')].slice(0, limit);

  let done = 0;
  for (const doc of batch) {
    try {
      await ocrDocument(doc.id, { timeoutMs: 90_000 });
    } catch (err) {
      console.error(`[job:ocr] document ${doc.id} failed`, err);
      await prisma.document
        .update({ where: { id: doc.id }, data: { ocrAt: new Date(), ocr: { error: (err as Error).message?.slice(0, 300) || 'OCR_FAILED', at: new Date().toISOString() } as Prisma.InputJsonValue } })
        .catch(() => undefined);
    }
    done++;
  }
  return done;
};

registerJob({ name: 'ocr', everyMs: 60_000, firstRunAfterMs: 90_000, run: async () => void (await runOcrJob()) });
