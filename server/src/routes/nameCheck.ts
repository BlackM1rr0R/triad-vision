import { Router, type Request } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db.js';
import { isStaff, requireAuth } from '../middleware/auth.js';
import { limiter, notFound, parse } from '../lib/http.js';
import { mrzOf } from '../lib/docsIntel/ocr.js';
import { analyseName, compareWithMrz } from '../lib/nameCheck/index.js';

/**
 * Name transliteration checker — mounted at /api/name-check (signed in). Clients use it on their profile /
 * "confirm data" page, staff in the case view. Nothing is stored; no AI.
 *
 *   POST /   { firstName, lastName, caseId? } → { analysis, onFile, profile, profileComparison }
 *            analysis: MRZ (ICAO 9303) form, ICAO alternative, English-style and German-by-ear spellings,
 *            the special letters, the 39-character MRZ name field, and the comparison with the passport MRZ on file.
 *            onFile: the MRZ name read (OCR) from the newest passport upload of the case (staff: caseId required;
 *            client: the given own case, else their newest passport upload).
 */
export const nameCheckRouter = Router();
nameCheckRouter.use(requireAuth);

const bodySchema = z.object({
  firstName: z.string().trim().max(80).default(''),
  lastName: z.string().trim().max(80).default(''),
  caseId: z.string().trim().min(1).max(40).optional(),
});

const staffAccess = (req: Request) => isStaff(req.user) && !!req.user!.twoFactorEnabled;

const passportOnFile = async (req: Request, caseId: string | undefined) => {
  let where: Prisma.DocumentWhereInput;
  let client: { firstName: string; lastName: string } | null;
  if (caseId) {
    const c = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, clientId: true, client: { select: { firstName: true, lastName: true } } } });
    if (!c || (!staffAccess(req) && c.clientId !== req.user!.id)) throw notFound('CASE_NOT_FOUND');
    where = { caseId: c.id };
    client = c.client;
  } else {
    if (staffAccess(req)) return { mrz: null, client: null };
    where = { case: { clientId: req.user!.id } };
    client = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { firstName: true, lastName: true } });
  }
  const docs = await prisma.document.findMany({
    where: { ...where, ocrAt: { not: null }, requirement: { is: { key: 'PASSPORT' } } },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { ocr: true, createdAt: true, status: true },
  });
  const withMrz = docs.map((d) => ({ d, m: mrzOf(d.ocr) })).filter((x) => x.m && (x.m.surname || x.m.givenNames));
  const best = withMrz.find((x) => x.m!.valid && x.d.status === 'ACCEPTED') ?? withMrz.find((x) => x.m!.valid) ?? withMrz[0] ?? null;
  return {
    mrz: best ? { surname: best.m!.surname, givenNames: best.m!.givenNames, valid: best.m!.valid, uploadedAt: best.d.createdAt.toISOString() } : null,
    client,
  };
};

nameCheckRouter.post('/', limiter({ windowMs: 60 * 1000, limit: 120 }), async (req, res) => {
  const body = parse(bodySchema, req.body ?? {});
  const { mrz, client } = await passportOnFile(req, body.caseId);
  res.json({
    analysis: analyseName(body, mrz),
    onFile: mrz,
    profile: client,
    // The name in the profile (what goes into the forms) vs. the passport.
    profileComparison: mrz && client ? compareWithMrz(client, mrz) : null,
  });
});
