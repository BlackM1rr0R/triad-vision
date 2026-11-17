import fs from 'node:fs/promises';
import sharp from 'sharp';
import { prisma } from '../../db.js';
import { notFound } from '../http.js';
import { eligibleCase, firstDayOf } from '../employerArrival.js';
import { companyLogoOf, filesOfUrl } from '../publicImages.js';
import { welcomePosterPdf, type PosterInput } from './pdf.js';
import { contactFromNote } from './texts.js';

/**
 * Data of the welcome poster of one incoming worker (company portal → arrival checklist → "Welcome poster").
 * Only the company's own workers whose visa was approved and who have not left (same rule and 404 as the arrival
 * checklist, lib/employerArrival.ts eligibleCase). The poster shows only the worker's first name.
 */

/** The stored company logo as PNG bytes for pdf-lib (WebP on disk); null when missing or unreadable. */
export const logoPng = async (logo: unknown): Promise<Buffer | null> => {
  const l = companyLogoOf(logo);
  const file = l ? filesOfUrl(l.url)[0] : undefined;
  if (!file) return null;
  try {
    const buf = await fs.readFile(file);
    return await sharp(buf).resize({ width: 600, height: 300, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  } catch {
    return null;
  }
};

export const posterInput = async (companyId: string, caseId: string): Promise<PosterInput> => {
  const c = await eligibleCase(companyId, caseId);
  if (!c) throw notFound('WORKER_NOT_FOUND');
  const [kase, company, items, contract] = await Promise.all([
    prisma.case.findUnique({ where: { id: caseId }, select: { client: { select: { firstName: true } } } }),
    prisma.company.findUnique({ where: { id: companyId }, select: { name: true, logo: true } }),
    prisma.employerArrivalItem.findMany({ where: { caseId, companyId, key: { in: ['BUDDY', 'FIRST_DAY'] } }, select: { key: true, note: true, dueDate: true } }),
    prisma.employmentContract.findUnique({ where: { caseId }, select: { startDate: true } }),
  ]);
  return {
    firstName: kase?.client.firstName.trim() ?? '',
    company: company?.name ?? '',
    logoPng: await logoPng(company?.logo),
    contact: contactFromNote(items.find((i) => i.key === 'BUDDY')?.note),
    firstDay: firstDayOf(items) ?? contract?.startDate ?? null,
  };
};

export const welcomePoster = async (companyId: string, caseId: string) => welcomePosterPdf(await posterInput(companyId, caseId));
