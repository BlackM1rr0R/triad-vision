import fs from 'node:fs/promises';
import { Router, type Request } from 'express';
import { z } from 'zod';
import type { ReferralPartner } from '@prisma/client';
import { prisma } from '../../db.js';
import { decodeOriginalName, documentUpload, verifyUploadedFile } from '../../middleware/upload.js';
import { badRequest, conflict, forbidden, limiter, notFound, parse } from '../http.js';
import { audit } from '../audit.js';
import { partnerContextOf, requireClientList } from '../partnerAccess/context.js'; // per-partner permissions
import { schoolRecordAccess } from '../partnerAccess/permissions.js';
import {
  ownStudent,
  listStudents,
  recordData,
  recordInput,
  recordInputError,
  recordView,
  removeCertificate,
  requireLanguageSchool,
  requireSchool,
  sendCertificate,
  studentDetail,
} from './schools.js';

/**
 * Students view of school / language-school partners — mounted inside the partner portal (/api/partner,
 * AGENT login linked to a ReferralPartner; lib/partners/schools.ts has the rules):
 *   GET    /students                         own students (stage + level only with consent)           SCHOOL | LANGUAGE_SCHOOL
 *   GET    /students/:clientId               one own student (404 for anyone else)                     SCHOOL | LANGUAGE_SCHOOL
 *   POST   /students/:clientId/records       attendance / exam result (multipart, optional certificate) LANGUAGE_SCHOOL, consent
 *   GET    /student-records/:id/certificate  certificate of an own record
 *   DELETE /student-records/:id              withdraw an own PENDING record
 */
export const partnerSchoolRouter = Router();

/**
 * The partner (owner or team member, lib/partnerAccess) with the permission the action needs: students are clients
 * (client list). Records and their certificates are the school's own data, not case documents, so the documents
 * level does not apply (schoolRecordAccess); the category / consent checks stay in the routes.
 */
const partnerOf = async (req: Request, need: 'view' | 'write' | 'file' = 'view'): Promise<ReferralPartner> => {
  const ctx = await partnerContextOf(req);
  requireClientList(ctx);
  const access = schoolRecordAccess(ctx.perms, ctx.partner.category);
  if (need === 'file' && !access.certificate) throw forbidden('PARTNER_PERMISSION_DENIED');
  return ctx.partner;
};

/** The student's stage only with the case-stage permission. */
const withStage = async <T extends { stage: unknown }>(req: Request, row: T): Promise<T> => ((await partnerContextOf(req)).perms.caseStage ? row : { ...row, stage: null });

partnerSchoolRouter.get('/students', async (req, res) => {
  const partner = await partnerOf(req);
  requireSchool(partner);
  const q = parse(z.object({ search: z.string().trim().max(120).optional() }), req.query);
  res.json({ category: partner.category, items: await Promise.all((await listStudents(partner, q)).map((s) => withStage(req, s))) });
});

partnerSchoolRouter.get('/students/:clientId', async (req, res) => {
  const partner = await partnerOf(req);
  requireSchool(partner);
  res.json({ student: await withStage(req, await studentDetail(partner, String(req.params.clientId))) });
});

const recordLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 120, keyGenerator: (req) => `partner-records:${req.user?.id ?? 'anon'}` });

/** Rights before the optional certificate is spooled to disk. */
const recordPrecheck = async (req: Request, _res: unknown, next: () => void) => {
  requireLanguageSchool(await partnerOf(req, 'write'));
  next();
};

partnerSchoolRouter.post('/students/:clientId/records', recordLimiter, recordPrecheck, documentUpload.single('certificate'), async (req, res) => {
  const file = req.file;
  try {
    const partner = await partnerOf(req, 'write');
    requireLanguageSchool(partner);
    if (!partner.active) throw forbidden('PARTNER_INACTIVE');
    const { user, consent } = await ownStudent(partner.id, String(req.params.clientId));
    if (!consent) throw forbidden('CONSENT_REQUIRED');
    const body = parse(recordInput, req.body ?? {});
    const err = recordInputError(body);
    if (err) throw badRequest(err);
    if (file && body.kind !== 'EXAM') throw badRequest('CERTIFICATE_ONLY_FOR_EXAM');
    if (file) await verifyUploadedFile(file);
    const row = await prisma.partnerStudentRecord.create({
      data: {
        partnerId: partner.id,
        clientId: user.id,
        ...recordData(body),
        ...(file ? { certificateKey: file.filename, certificateName: decodeOriginalName(file.originalname).slice(0, 255), certificateMime: file.mimetype, certificateSize: file.size } : {}),
        createdById: req.user!.id,
      },
    });
    await audit(req, 'PARTNER_STUDENT_RECORD_CREATED', `user:${user.id}`, { partnerId: partner.id, recordId: row.id, kind: row.kind, level: row.level, certificate: !!file });
    res.status(201).json({ record: recordView(row) });
  } catch (err) {
    if (file) await fs.unlink(file.path).catch(() => undefined);
    throw err;
  }
});

/** An own record (404 for another partner's one, like a missing record). */
const ownRecord = async (req: Request, need: 'write' | 'file') => {
  const partner = await partnerOf(req, need);
  requireSchool(partner);
  const r = await prisma.partnerStudentRecord.findFirst({ where: { id: String(req.params.id).slice(0, 40), partnerId: partner.id } });
  if (!r) throw notFound('RECORD_NOT_FOUND');
  return { partner, r };
};

partnerSchoolRouter.get('/student-records/:id/certificate', async (req, res) => {
  const { r } = await ownRecord(req, 'file');
  sendCertificate(res, r);
});

partnerSchoolRouter.delete('/student-records/:id', async (req, res) => {
  const { partner, r } = await ownRecord(req, 'write');
  if (r.status !== 'PENDING') throw conflict('RECORD_ALREADY_REVIEWED');
  await prisma.partnerStudentRecord.delete({ where: { id: r.id } });
  await removeCertificate(r.certificateKey);
  await audit(req, 'PARTNER_STUDENT_RECORD_WITHDRAWN', `user:${r.clientId}`, { partnerId: partner.id, recordId: r.id });
  res.json({ ok: true });
});
