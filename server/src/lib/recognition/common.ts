import fs from 'node:fs/promises';
import path from 'node:path';
import type { Locale } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { decodeOriginalName, verifyUploadedFile } from '../../middleware/upload.js';
import { copyDocumentToDrive } from '../drive/caseFolders.js';
import { createNumbered } from '../tasks/core.js';

/** Helpers shared by the recognition tracker and the § 81a procedure. */

export const DAY = 24 * 60 * 60 * 1000;
export const fullName = (u: { firstName: string; lastName: string } | null | undefined) => (u ? `${u.firstName} ${u.lastName}`.trim() : '');
export const daysUntil = (d: Date, now: Date) => Math.ceil((d.getTime() - now.getTime()) / DAY);

/** The assigned staff member when active, else every active admin. */
export const responsible = async (assignedStaffId: string | null): Promise<{ id: string; locale: Locale }[]> => {
  const staff = assignedStaffId
    ? await prisma.user.findFirst({ where: { id: assignedStaffId, isActive: true, role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] } }, select: { id: true, locale: true } })
    : null;
  return staff ? [staff] : prisma.user.findMany({ where: { isActive: true, role: { in: ['ADMIN', 'SUPER_ADMIN'] } }, select: { id: true, locale: true } });
};

export const admins = () => prisma.user.findMany({ where: { isActive: true, role: { in: ['ADMIN', 'SUPER_ADMIN'] } }, select: { id: true, locale: true } });

/** Records that a reminder was sent (ReminderLog, unique key); false when it was sent already. */
export const claimReminder = async (key: string, now = new Date()) => {
  try {
    await prisma.reminderLog.create({ data: { key: key.slice(0, 191), sentAt: now } });
    return true;
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') return false;
    throw err;
  }
};

/** A staff task on the case for the given users (top of the TODO column). */
export const staffTask = async (o: { caseId: string; title: string; description: string; dueAt: Date; priority: 'NORMAL' | 'HIGH' | 'URGENT'; userIds: string[] }) => {
  if (!o.userIds.length) return null;
  return createNumbered(async (txn, number) => {
    const min = await txn.task.aggregate({ where: { status: 'TODO' }, _min: { sortOrder: true } });
    return txn.task.create({
      data: {
        number,
        title: o.title.slice(0, 200),
        description: o.description.slice(0, 8000),
        status: 'TODO',
        priority: o.priority,
        dueAt: o.dueAt,
        sortOrder: min._min.sortOrder === null ? 0 : min._min.sortOrder - 1024,
        caseId: o.caseId,
        assignees: { create: o.userIds.map((userId) => ({ userId })) },
      },
    });
  });
};

/**
 * Stores an uploaded letter / form as a case document (stage OTHER, accepted) and copies it to the
 * client's drive folder. The multer temp file is removed when anything fails.
 */
export const storeCaseDocument = async (caseId: string, file: Express.Multer.File, actorId: string, note: string) => {
  try {
    await verifyUploadedFile(file);
    const doc = await prisma.document.create({
      data: {
        caseId,
        stage: 'OTHER',
        originalName: decodeOriginalName(file.originalname).slice(0, 200),
        storedName: file.filename,
        mimeType: file.mimetype,
        size: file.size,
        status: 'ACCEPTED',
        uploadedById: actorId,
      },
    });
    await prisma.caseEvent.create({ data: { caseId, type: 'STAFF_DOCUMENT_UPLOADED', note: `${note}: ${doc.originalName}`.slice(0, 2000), actorId, visibleToClient: false } });
    void copyDocumentToDrive(doc.id).catch(() => undefined);
    return doc;
  } catch (err) {
    await fs.unlink(path.join(config.uploads.privateDir, file.filename)).catch(() => undefined);
    throw err;
  }
};

/** Case documents a checklist item / e-mail attachment can point at (rejected ones left out). */
export const linkableDocuments = (caseId: string) =>
  prisma.document.findMany({
    where: { caseId, status: { not: 'REJECTED' } },
    orderBy: { createdAt: 'desc' },
    take: 300,
    select: { id: true, originalName: true, stage: true, status: true, mimeType: true, size: true, createdAt: true, requirement: { select: { key: true, title: true } } },
  });

/** Reads a stored case document (for e-mail attachments). */
export const readDocument = (storedName: string) => fs.readFile(path.join(config.uploads.privateDir, path.basename(storedName)));

/** 'YYYY-MM-DD' → noon UTC (calendar days never shift a day in any time zone). */
export const atNoon = (s: string) => new Date(`${s}T12:00:00Z`);
