import fs from 'node:fs/promises';
import path from 'node:path';
import type { Locale, PartnerStudentRecord } from '@prisma/client';
import type { Response } from 'express';
import { z } from 'zod';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { conflict, forbidden, notFound } from '../http.js';
import { GERMAN_LEVELS, germanRank } from '../matching.js';
import { notifyUser } from '../notifications.js';
import { caseListView } from '../partnerPortal/cases.js';
import { partnerSharingConsent } from './owned.js';

/**
 * Partner portal for colleges and language schools. A referral partner (ReferralPartner) has a category:
 * AGENCY (default, middlemen), SCHOOL (college / vocational school) or LANGUAGE_SCHOOL. Schools refer students
 * the same way as every partner (sign-up link /register?ref=CODE, /p/CODE, or "register a client" with the
 * client's agreement — lib/partners/owned.ts) and get a "Students" view:
 *  - only their own students (owned clients + clients of cases linked to the partner); anything else → 404;
 *  - the pipeline step and German level only when the student agreed to share data with the partner
 *    (consent PARTNER_SHARING); without it just the name and "consent pending";
 *  - LANGUAGE_SCHOOL partners record attendance (%) and exam results (level, date, provider, certificate) for
 *    consenting students. Records are PENDING until staff confirm them; a confirmed passed exam raises
 *    User.germanLevel (never lowers it). Nothing reaches the client's profile before that.
 */

export const PARTNER_CATEGORIES = ['AGENCY', 'SCHOOL', 'LANGUAGE_SCHOOL'] as const;
export type PartnerCategory = (typeof PARTNER_CATEGORIES)[number];
export const RECORD_KINDS = ['ATTENDANCE', 'EXAM'] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];
export const RECORD_STATUSES = ['PENDING', 'CONFIRMED', 'REJECTED'] as const;
export type RecordStatus = (typeof RECORD_STATUSES)[number];
/** CEFR levels an exam can certify (no "none"). */
export const EXAM_LEVELS = GERMAN_LEVELS.filter((l) => l !== 'none') as Exclude<(typeof GERMAN_LEVELS)[number], 'none'>[];
export const EXAM_PROVIDERS = ['GOETHE', 'TELC', 'OSD', 'TESTDAF', 'ECL', 'OTHER'] as const;

export const isPartnerCategory = (v: unknown): v is PartnerCategory => typeof v === 'string' && (PARTNER_CATEGORIES as readonly string[]).includes(v);
/** Unknown / legacy values count as AGENCY. */
export const categoryOf = (v: unknown): PartnerCategory => (isPartnerCategory(v) ? v : 'AGENCY');
export const isSchool = (category: unknown) => categoryOf(category) !== 'AGENCY';
export const canRecord = (category: unknown) => categoryOf(category) === 'LANGUAGE_SCHOOL';

/**
 * The German level after staff confirm an exam record: the exam level when the exam was passed and it is
 * higher than the current level, otherwise null (no change). Attendance never changes the level.
 */
export const levelAfterConfirm = (current: string | null | undefined, record: { kind: string; level?: string | null; passed?: boolean | null }): string | null => {
  if (record.kind !== 'EXAM' || record.passed !== true || !record.level) return null;
  const level = EXAM_LEVELS.find((l) => l.toLowerCase() === record.level!.trim().toLowerCase());
  if (!level) return null;
  return germanRank(level) > germanRank(current) ? level : null;
};

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), 'INVALID_DATE');
const optDay = z.preprocess((v) => (v === '' || v === null ? undefined : v), day.optional());
const optText = (max: number) => z.preprocess((v) => (v === '' || v === null ? undefined : v), z.string().trim().max(max).optional());
const boolish = z.preprocess((v) => (v === 'true' || v === '1' || v === true ? true : v === 'false' || v === '0' || v === false ? false : v), z.boolean());

/** Body of a new record (multipart form fields arrive as strings). */
export const recordInput = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('ATTENDANCE'),
    attendancePct: z.coerce.number().int().min(0).max(100),
    courseName: optText(160),
    periodFrom: optDay,
    periodTo: optDay,
    note: optText(1000),
  }),
  z.object({
    kind: z.literal('EXAM'),
    level: z.enum(EXAM_LEVELS as [string, ...string[]]),
    examDate: day,
    provider: z.enum(EXAM_PROVIDERS),
    passed: boolish,
    courseName: optText(160),
    note: optText(1000),
  }),
]);
export type RecordInput = z.infer<typeof recordInput>;

/** Cross-field checks a schema cannot express; returns an error code or null. */
export const recordInputError = (r: RecordInput, today = new Date()): string | null => {
  const todayDay = today.toISOString().slice(0, 10);
  if (r.kind === 'ATTENDANCE') {
    if (r.periodFrom && r.periodTo && r.periodFrom > r.periodTo) return 'PERIOD_INVALID';
    return null;
  }
  if (r.examDate > todayDay) return 'EXAM_DATE_IN_FUTURE';
  return null;
};

const toDate = (d: string | undefined) => (d ? new Date(`${d}T00:00:00.000Z`) : null);

/** Columns of a new record. */
export const recordData = (r: RecordInput) =>
  r.kind === 'ATTENDANCE'
    ? { kind: r.kind, attendancePct: r.attendancePct, courseName: r.courseName ?? null, periodFrom: toDate(r.periodFrom), periodTo: toDate(r.periodTo), note: r.note ?? null }
    : { kind: r.kind, level: r.level, examDate: toDate(r.examDate), provider: r.provider, passed: r.passed, courseName: r.courseName ?? null, note: r.note ?? null };

// ─── Access ──────────────────────────────────────────────────────────

/** Ids of the partner's students: owned clients and clients of cases linked to the partner. */
export const studentIdsOf = async (partnerId: string) => {
  const [owned, cases] = await Promise.all([
    prisma.user.findMany({ where: { ownerPartnerId: partnerId, role: 'CLIENT' }, select: { id: true } }),
    prisma.case.findMany({ where: { partnerId }, select: { clientId: true }, distinct: ['clientId'] }),
  ]);
  return [...new Set([...owned.map((u) => u.id), ...cases.map((c) => c.clientId)])];
};

export const requireSchool = (partner: { category: string }) => {
  if (!isSchool(partner.category)) throw forbidden('NOT_A_SCHOOL');
};
export const requireLanguageSchool = (partner: { category: string }) => {
  if (!canRecord(partner.category)) throw forbidden('NOT_A_LANGUAGE_SCHOOL');
};

/** The partner's own student (404 for anyone else, like a missing one) and whether they consented. */
export const ownStudent = async (partnerId: string, clientId: string) => {
  const id = clientId.slice(0, 40);
  const user = await prisma.user.findFirst({
    where: { id, role: 'CLIENT', OR: [{ ownerPartnerId: partnerId }, { cases: { some: { partnerId } } }] },
    select: { id: true, firstName: true, lastName: true, germanLevel: true },
  });
  if (!user) throw notFound('STUDENT_NOT_FOUND');
  const consent = (await partnerSharingConsent([user.id])).get(user.id) === true;
  return { user, consent };
};

const recordView = (r: PartnerStudentRecord) => ({
  id: r.id,
  kind: r.kind,
  courseName: r.courseName,
  periodFrom: r.periodFrom?.toISOString().slice(0, 10) ?? null,
  periodTo: r.periodTo?.toISOString().slice(0, 10) ?? null,
  attendancePct: r.attendancePct,
  level: r.level,
  examDate: r.examDate?.toISOString().slice(0, 10) ?? null,
  provider: r.provider,
  passed: r.passed,
  note: r.note,
  certificate: r.certificateKey ? { name: r.certificateName, mime: r.certificateMime, size: r.certificateSize } : null,
  status: r.status,
  reviewedAt: r.reviewedAt,
  reviewNote: r.reviewNote,
  levelApplied: r.levelApplied,
  createdAt: r.createdAt,
});
export type RecordView = ReturnType<typeof recordView>;
export { recordView };

/**
 * The Students view: every student with the latest case's step (only with consent), the German level (only
 * with consent) and the partner's own records. Without consent: name, consent: false, nothing else.
 */
export const listStudents = async (partner: { id: string }, q: { search?: string } = {}) => {
  const ids = await studentIdsOf(partner.id);
  if (!ids.length) return [];
  const search = q.search?.trim();
  const users = await prisma.user.findMany({
    where: { id: { in: ids }, ...(search ? { OR: [{ firstName: { contains: search } }, { lastName: { contains: search } }] } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 1000,
    select: { id: true, firstName: true, lastName: true, germanLevel: true, createdAt: true },
  });
  const userIds = users.map((u) => u.id);
  const [consents, cases, records] = await Promise.all([
    partnerSharingConsent(userIds),
    caseListView({ partnerId: partner.id, clientId: { in: userIds } }),
    prisma.partnerStudentRecord.findMany({ where: { partnerId: partner.id, clientId: { in: userIds } }, orderBy: { createdAt: 'desc' } }),
  ]);
  return users.map((u) => {
    const consent = consents.get(u.id) === true;
    const latest = consent ? (cases.find((c) => c.clientId === u.id) ?? null) : null;
    const own = records.filter((r) => r.clientId === u.id);
    return {
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      registeredAt: u.createdAt,
      consent,
      germanLevel: consent ? u.germanLevel : null,
      stage: latest ? { status: latest.status, step: latest.step, refused: latest.refused, updatedAt: latest.updatedAt } : null,
      records: consent ? own.slice(0, 20).map(recordView) : [],
      pendingRecords: consent ? own.filter((r) => r.status === 'PENDING').length : 0,
    };
  });
};

/** Detail of one own student (404 otherwise); stage + records only with consent. */
export const studentDetail = async (partner: { id: string }, clientId: string) => {
  const { user, consent } = await ownStudent(partner.id, clientId);
  if (!consent) return { id: user.id, firstName: user.firstName, lastName: user.lastName, consent: false, germanLevel: null, stage: null, records: [] };
  const [cases, records] = await Promise.all([
    caseListView({ partnerId: partner.id, clientId: user.id }),
    prisma.partnerStudentRecord.findMany({ where: { partnerId: partner.id, clientId: user.id }, orderBy: { createdAt: 'desc' }, take: 200 }),
  ]);
  const latest = cases[0] ?? null;
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    consent: true,
    germanLevel: user.germanLevel,
    stage: latest ? { status: latest.status, step: latest.step, refused: latest.refused, updatedAt: latest.updatedAt } : null,
    records: records.map(recordView),
  };
};

// ─── Certificates ────────────────────────────────────────────────────

export const sendCertificate = (res: Response, r: Pick<PartnerStudentRecord, 'certificateKey' | 'certificateName' | 'certificateMime'>) => {
  if (!r.certificateKey) throw notFound('FILE_NOT_FOUND');
  res.setHeader('Content-Type', r.certificateMime ?? 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(r.certificateName ?? 'certificate')}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.sendFile(path.join(config.uploads.privateDir, path.basename(r.certificateKey)));
};

export const removeCertificate = async (key: string | null | undefined) => {
  if (key) await fs.unlink(path.join(config.uploads.privateDir, path.basename(key))).catch(() => undefined);
};

// ─── Review ──────────────────────────────────────────────────────────

const REVIEW_TEXT: Record<Locale, { confirmed: (n: string) => string; rejected: (n: string) => string; body: (kind: string) => string; cta: string }> = {
  az: {
    confirmed: (n) => `Qeyd təsdiqləndi: ${n}`,
    rejected: (n) => `Qeyd rədd edildi: ${n}`,
    body: (k) => (k === 'EXAM' ? 'İmtahan nəticəsi Triad Vision komandası tərəfindən yoxlanıldı.' : 'Davamiyyət qeydi Triad Vision komandası tərəfindən yoxlanıldı.'),
    cta: 'Tələbələr',
  },
  de: {
    confirmed: (n) => `Eintrag bestätigt: ${n}`,
    rejected: (n) => `Eintrag abgelehnt: ${n}`,
    body: (k) => (k === 'EXAM' ? 'Das Prüfungsergebnis wurde vom Triad-Vision-Team geprüft.' : 'Der Anwesenheitseintrag wurde vom Triad-Vision-Team geprüft.'),
    cta: 'Schüler',
  },
  en: {
    confirmed: (n) => `Record confirmed: ${n}`,
    rejected: (n) => `Record rejected: ${n}`,
    body: (k) => (k === 'EXAM' ? 'The exam result was reviewed by the Triad Vision team.' : 'The attendance record was reviewed by the Triad Vision team.'),
    cta: 'Students',
  },
  ru: {
    confirmed: (n) => `Запись подтверждена: ${n}`,
    rejected: (n) => `Запись отклонена: ${n}`,
    body: (k) => (k === 'EXAM' ? 'Результат экзамена проверен командой Triad Vision.' : 'Запись о посещаемости проверена командой Triad Vision.'),
    cta: 'Студенты',
  },
};

/**
 * Staff decision on a PENDING record. CONFIRM of a passed exam raises the client's German level when higher
 * (the level before / after is kept on the record). Returns the updated record and the level change.
 */
export const reviewRecord = async (id: string, decision: 'CONFIRM' | 'REJECT', actorId: string, note?: string | null) => {
  const r = await prisma.partnerStudentRecord.findUnique({ where: { id } });
  if (!r) throw notFound('RECORD_NOT_FOUND');
  if (r.status !== 'PENDING') throw conflict('RECORD_ALREADY_REVIEWED');
  let levelBefore: string | null = null;
  let levelApplied: string | null = null;
  if (decision === 'CONFIRM') {
    const user = await prisma.user.findUnique({ where: { id: r.clientId }, select: { germanLevel: true } });
    if (!user) throw notFound('STUDENT_NOT_FOUND');
    const next = levelAfterConfirm(user.germanLevel, r);
    if (next) {
      levelBefore = user.germanLevel ?? null;
      levelApplied = next;
      await prisma.user.update({ where: { id: r.clientId }, data: { germanLevel: next } });
    }
  }
  // Only a still-pending row is updated (two reviewers at once: the second one gets "already reviewed").
  const { count } = await prisma.partnerStudentRecord.updateMany({
    where: { id, status: 'PENDING' },
    data: { status: decision === 'CONFIRM' ? 'CONFIRMED' : 'REJECTED', reviewedById: actorId, reviewedAt: new Date(), reviewNote: note?.slice(0, 2000) ?? null, levelBefore, levelApplied },
  });
  if (!count) throw conflict('RECORD_ALREADY_REVIEWED');
  const updated = await prisma.partnerStudentRecord.findUniqueOrThrow({ where: { id } });
  void notifyPartnerOfReview(updated);
  return { record: updated, levelBefore, levelApplied };
};

const notifyPartnerOfReview = async (r: PartnerStudentRecord) => {
  try {
    const [p, client] = await Promise.all([
      prisma.referralPartner.findUnique({ where: { id: r.partnerId }, select: { userId: true, user: { select: { locale: true, role: true } } } }),
      prisma.user.findUnique({ where: { id: r.clientId }, select: { firstName: true, lastName: true } }),
    ]);
    if (!p?.userId || p.user?.role !== 'AGENT' || !client) return;
    const t = REVIEW_TEXT[p.user.locale ?? 'az'] ?? REVIEW_TEXT.az;
    const name = `${client.firstName} ${client.lastName}`.trim();
    await notifyUser(p.userId, {
      type: 'PARTNER_STUDENT_RECORD_REVIEWED',
      title: r.status === 'CONFIRMED' ? t.confirmed(name) : t.rejected(name),
      body: t.body(r.kind),
      link: '/partner/students',
      ctaLabel: t.cta,
      push: false,
    });
  } catch (err) {
    console.error('[partners] student record notification failed', r.id, err);
  }
};

// ─── GDPR ────────────────────────────────────────────────────────────

/** Records about a client (data export). */
export const studentRecordsExport = async (clientId: string) => {
  const rows = await prisma.partnerStudentRecord.findMany({ where: { clientId }, orderBy: { createdAt: 'asc' } });
  const partners = rows.length ? await prisma.referralPartner.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.partnerId))] } }, select: { id: true, name: true } }) : [];
  const names = new Map(partners.map((p) => [p.id, p.name]));
  return rows.map((r) => ({ ...recordView(r), school: names.get(r.partnerId) ?? null }));
};

/** Account deletion: the records about the client and their certificate files. */
export const eraseStudentRecords = async (clientId: string) => {
  const rows = await prisma.partnerStudentRecord.findMany({ where: { clientId }, select: { certificateKey: true } });
  for (const r of rows) await removeCertificate(r.certificateKey);
  await prisma.partnerStudentRecord.deleteMany({ where: { clientId } });
};
