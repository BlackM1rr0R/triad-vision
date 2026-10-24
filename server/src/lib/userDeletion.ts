import fs from 'node:fs/promises';
import path from 'node:path';
import type { Prisma, Role } from '@prisma/client';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { conflict, forbidden, HttpError, notFound } from './http.js';
import { removeStoredFile } from '../jobs/retention.js';
import { removeMailStored } from './mail/storage.js';
import { ensureSharedRoot } from './drive/roots.js';
import { pickFreeName, safeUploadName } from './drive/names.js';
import { purgeNodes } from './drive/trash.js';

/**
 * Hard delete of a user account by the super admin (Admin → Users → "Delete").
 *
 * Most relations to User cascade or are set to NULL by the database. Everything that other people
 * still need is handled explicitly in one transaction BEFORE the user row is deleted:
 *
 *   Removed with the account (DB cascade):
 *     sessions, push devices, password-reset / email-verification / email-OTP tokens, notifications,
 *     vacancy applications, reviews, the candidate's interviews, doc/drive grants given TO the user,
 *     drive favourites, task assignments, chat memberships and reactions, mailboxes (accounts,
 *     folders, messages, labels, rules, templates), notes, poll votes, announcement reads, calendar
 *     attendance, leave requests, free consultation slots, the legacy /docs workspace rows.
 *   Removed explicitly:
 *     the user's own visa cases (clientId) — with their documents, requirements, contract, events,
 *     messages, onboarding (DB cascade from Case). Their files are deleted from disk after commit.
 *   Kept, reference set to NULL (DB SetNull): audit log actor, case events, case assignment
 *     (assignedStaffId), drive nodes created/deleted by the user, drive file versions, tasks created,
 *     task comments, chat channels created, chat messages, outbound message log, notification
 *     templates, KB articles, API keys, webhooks, contacts (createdBy / linked user), interviews
 *     (staff / createdBy), leave decisions, bookings (they keep name / email of the booker).
 *   Kept, reassigned to the acting super admin (would be lost or blocked otherwise):
 *     - Document.uploadedById in OTHER people's cases (FK is Restrict) — staff uploads stay in the case.
 *     - DocFile.uploadedById (legacy workspaces, FK is Restrict).
 *     - CaseMessage.authorId in other people's cases (FK cascades — the conversation would lose
 *       the staff side otherwise).
 *     - ConsultationSlot.staffId of slots that have a booking (cascade would delete the candidate's
 *       booking). A clash with a slot the super admin already has at that time → 409 SLOT_CONFLICT.
 *     - Announcement / Poll authorId (team-wide content).
 *     - CalendarEvent.ownerId of events other people attend (the meeting stays in their calendars).
 *   Moved: the PERSONAL drive tree ("My files") becomes a folder "Silinmiş istifadəçi — <name>" in the
 *     company drive (owner: nobody, permissions not inherited → visible to the super admin until
 *     shared). An empty "My files" root is simply deleted.
 *
 * Rules: only SUPER_ADMIN (route), never yourself (400 CANNOT_DELETE_SELF), never a SUPER_ADMIN
 * (403 CANNOT_DELETE_SUPER_ADMIN), unknown id 404 USER_NOT_FOUND. A foreign-key violation that slips
 * through (a relation added later and not handled here) answers 409 USER_DELETE_BLOCKED, not 500.
 */

export interface UserDeletionCounts {
  cases: number;
  documents: number;
  files: number;
  bytes: number;
  caseMessages: number;
  applications: number;
  notifications: number;
  interviews: number;
  reviews: number;
  sessions: number;
  assignedCasesUnassigned: number;
  documentsReassigned: number;
  messagesReassigned: number;
  slotsReassigned: number;
  slotsDeleted: number;
  announcementsReassigned: number;
  pollsReassigned: number;
  calendarEventsReassigned: number;
  driveNodesMoved: number;
  driveFolder: string | null;
  mailAttachmentsRemoved: number;
}

export interface UserDeletionTarget {
  id: string;
  email: string;
  role: Role;
  firstName: string;
  lastName: string;
}

const DELETED_FOLDER_PREFIX = 'Gelöschter Benutzer — ';

/** The account to delete, after the rules (404 / self / super admin). */
export const loadDeletionTarget = async (actorId: string, userId: string): Promise<UserDeletionTarget> => {
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, role: true, firstName: true, lastName: true } });
  if (!target) throw notFound('USER_NOT_FOUND');
  if (target.id === actorId) throw new HttpError(400, 'CANNOT_DELETE_SELF');
  if (target.role === 'SUPER_ADMIN') throw forbidden('CANNOT_DELETE_SUPER_ADMIN');
  return target;
};

/** What a deletion would remove / hand over (for the confirmation dialog). Same checks as the delete. */
export const userDeletionPreview = async (actorId: string, userId: string) => {
  const user = await loadDeletionTarget(actorId, userId);
  const ownCases = { clientId: userId };
  const [cases, documents, caseMessages, applications, notifications, interviews, reviews, assignedCases, personalFiles, bookedSlots] = await Promise.all([
    prisma.case.count({ where: ownCases }),
    prisma.document.count({ where: { case: ownCases } }),
    prisma.caseMessage.count({ where: { case: ownCases } }),
    prisma.vacancyApplication.count({ where: { userId } }),
    prisma.notification.count({ where: { userId } }),
    prisma.interview.count({ where: { candidateId: userId } }),
    prisma.review.count({ where: { userId } }),
    prisma.case.count({ where: { assignedStaffId: userId } }),
    prisma.driveNode.count({ where: { space: 'PERSONAL', ownerId: userId, kind: 'FILE' } }),
    prisma.consultationSlot.count({ where: { staffId: userId, booking: { isNot: null } } }),
  ]);
  return {
    user,
    counts: { cases, documents, caseMessages, applications, notifications, interviews, reviews, assignedCases, personalFiles, bookedSlots },
  };
};

const isFkViolation = (err: unknown) => {
  const code = (err as { code?: string })?.code;
  return code === 'P2003' || code === 'P2014';
};

/**
 * Deletes the account. Returns the target and what was done. `ip` is stored on the audit entry,
 * which is written inside the transaction with the super admin as actor.
 */
export const deleteUserAccount = async (actorId: string, userId: string, ip?: string) => {
  const target = await loadDeletionTarget(actorId, userId);
  // The company-drive root must exist before the transaction (it is created lazily, outside of it).
  const sharedId = await ensureSharedRoot();

  // Files that go away with the account; read up front, deleted from disk only after commit.
  const ownCaseRows = await prisma.case.findMany({ where: { clientId: userId }, select: { id: true, driveFolderId: true } });
  const ownCaseIds = ownCaseRows.map((c) => c.id);
  const caseFiles = ownCaseIds.length
    ? await prisma.document.findMany({ where: { caseId: { in: ownCaseIds } }, select: { storedName: true } })
    : [];
  // Vault documents and translation-order files are stored outside the case folder.
  const vaultFiles = await prisma.vaultDocument.findMany({ where: { userId }, select: { storageKey: true } });
  const introVideo = (await prisma.user.findUnique({ where: { id: userId }, select: { introVideoKey: true } }))?.introVideoKey ?? null;
  const translationFiles = await prisma.translationOrderFile.findMany({ where: { storageKey: { not: null }, order: { clientId: userId } }, select: { storageKey: true } });
  const mailFiles = await prisma.mailAttachment.findMany({
    where: { storageKey: { not: null }, message: { account: { userId } } },
    select: { storageKey: true },
  });

  let counts: Omit<UserDeletionCounts, 'files' | 'bytes' | 'mailAttachmentsRemoved'>;
  try {
    counts = await prisma.$transaction(
      async (tx) => {
        const notOwnCase: Prisma.StringFilter = { notIn: ownCaseIds };

        // Kept for others → reassigned to the acting super admin.
        const documentsReassigned = (await tx.document.updateMany({ where: { uploadedById: userId, caseId: notOwnCase }, data: { uploadedById: actorId } })).count;
        const messagesReassigned = (await tx.caseMessage.updateMany({ where: { authorId: userId, caseId: notOwnCase }, data: { authorId: actorId } })).count;
        await tx.docFile.updateMany({ where: { uploadedById: userId }, data: { uploadedById: actorId } });
        const assignedCasesUnassigned = (await tx.case.updateMany({ where: { assignedStaffId: userId }, data: { assignedStaffId: null } })).count;

        // Consultation slots: booked ones move to the super admin (the candidate's booking stays).
        const booked = await tx.consultationSlot.findMany({ where: { staffId: userId, booking: { isNot: null } }, select: { id: true, startsAt: true } });
        if (booked.length) {
          const clash = await tx.consultationSlot.count({ where: { staffId: actorId, startsAt: { in: booked.map((s) => s.startsAt) } } });
          if (clash > 0) throw conflict('SLOT_CONFLICT', 'The super admin already has a consultation slot at the time of a booked slot');
          await tx.consultationSlot.updateMany({ where: { id: { in: booked.map((s) => s.id) } }, data: { staffId: actorId } });
        }
        const slotsDeleted = (await tx.consultationSlot.deleteMany({ where: { staffId: userId } })).count;

        const announcementsReassigned = (await tx.announcement.updateMany({ where: { authorId: userId }, data: { authorId: actorId } })).count;
        const pollsReassigned = (await tx.poll.updateMany({ where: { authorId: userId }, data: { authorId: actorId } })).count;
        const calendarEventsReassigned = (
          await tx.calendarEvent.updateMany({
            where: { ownerId: userId, attendees: { some: { userId: { not: userId } } } },
            data: { ownerId: actorId },
          })
        ).count;

        // "My files" → a folder in the company drive, so nothing is lost.
        const personal = await tx.driveNode.findMany({ where: { space: 'PERSONAL', ownerId: userId }, select: { id: true, parentId: true } });
        const root = personal.find((n) => !n.parentId) ?? null;
        let driveNodesMoved = 0;
        let driveFolder: string | null = null;
        if (personal.some((n) => n.parentId)) {
          const siblings = await tx.driveNode.findMany({ where: { parentId: sharedId, deletedAt: null }, select: { name: true } });
          const taken = new Set(siblings.map((s) => s.name.toLocaleLowerCase('en')));
          const fullName = `${target.firstName} ${target.lastName}`.trim() || target.email;
          driveFolder = pickFreeName(taken, safeUploadName(`${DELETED_FOLDER_PREFIX}${fullName}`), false);
          driveNodesMoved = (await tx.driveNode.updateMany({ where: { space: 'PERSONAL', ownerId: userId }, data: { space: 'SHARED', ownerId: null } })).count;
          if (root) {
            await tx.driveNode.update({
              where: { id: root.id },
              data: { parentId: sharedId, name: driveFolder, system: false, inheritPermissions: false, createdById: actorId },
            });
          }
        }
        // (An empty "My files" root is removed by the cascade from the user row.)

        // Facts for the audit entry (rows that disappear with the account).
        const [documents, caseMessages, applications, notifications, interviews, reviews, sessions] = await Promise.all([
          ownCaseIds.length ? tx.document.count({ where: { caseId: { in: ownCaseIds } } }) : 0,
          ownCaseIds.length ? tx.caseMessage.count({ where: { caseId: { in: ownCaseIds } } }) : 0,
          tx.vacancyApplication.count({ where: { userId } }),
          tx.notification.count({ where: { userId } }),
          tx.interview.count({ where: { candidateId: userId } }),
          tx.review.count({ where: { userId } }),
          tx.session.count({ where: { userId } }),
        ]);

        // The user's own cases (documents, requirements, contract, events, messages cascade with them).
        const cases = ownCaseIds.length ? (await tx.case.deleteMany({ where: { id: { in: ownCaseIds } } })).count : 0;
        // Site features keep plain ids (no cascade): browser push subscriptions and the cases' public status switches.
        await tx.webPushSubscription.deleteMany({ where: { userId } });
        if (ownCaseIds.length) await tx.casePublicStatus.deleteMany({ where: { caseId: { in: ownCaseIds } } });

        await tx.user.delete({ where: { id: userId } });

        const result = {
          cases,
          documents,
          caseMessages,
          applications,
          notifications,
          interviews,
          reviews,
          sessions,
          assignedCasesUnassigned,
          documentsReassigned,
          messagesReassigned,
          slotsReassigned: booked.length,
          slotsDeleted,
          announcementsReassigned,
          pollsReassigned,
          calendarEventsReassigned,
          driveNodesMoved,
          driveFolder,
        };
        // Written in the same transaction: the actor is the super admin, never the deleted id.
        await tx.auditLog.create({
          data: {
            actorId,
            action: 'USER_DELETED',
            target: `user:${userId}`,
            details: { email: target.email, role: target.role, name: `${target.firstName} ${target.lastName}`.trim(), counts: result },
            ip: ip ?? null,
          },
        });
        return result;
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
  } catch (err) {
    if (isFkViolation(err)) throw conflict('USER_DELETE_BLOCKED', 'A record still references this user');
    throw err;
  }

  // After commit: the case files of the deleted cases and the mailbox attachments.
  let files = 0;
  let bytes = 0;
  for (const d of caseFiles) {
    try {
      const size = await removeStoredFile(d.storedName);
      if (size > 0) files++;
      bytes += size;
    } catch (err) {
      console.error('[user-delete] could not remove case file', d.storedName, err);
    }
  }
  await removeMailStored(mailFiles.map((m) => m.storageKey));
  // The client's folders in the shared drive (copies of their case documents) go with the cases.
  const clientFolders = ownCaseRows.map((c) => c.driveFolderId).filter((id): id is string => !!id);
  if (clientFolders.length) {
    const existing = (await prisma.driveNode.findMany({ where: { id: { in: clientFolders } }, select: { id: true } })).map((n) => n.id);
    const r = await purgeNodes(existing).catch((err) => {
      console.error('[user-delete] could not remove client folders from the drive', err);
      return { nodes: 0, bytes: 0 };
    });
    bytes += r.bytes;
  }
  for (const [dir, keys] of [
    ['vault', vaultFiles.map((v) => v.storageKey)],
    ['intro-video', introVideo ? [introVideo] : []],
    ['translations', translationFiles.map((t) => t.storageKey)],
  ] as const) {
    for (const key of keys) {
      if (!key) continue;
      const size = await fs.stat(path.join(config.uploads.privateDir, dir, key)).then((st) => st.size).catch(() => 0);
      await fs.unlink(path.join(config.uploads.privateDir, dir, key)).catch(() => undefined);
      if (size > 0) {
        files++;
        bytes += size;
      }
    }
  }
  // Placement rows keep plain ids (no foreign key): employer share links and interview evaluations of the candidate.
  await prisma.candidateShareLink.deleteMany({ where: { candidateId: userId } });
  await prisma.interviewEvaluation.deleteMany({ where: { candidateId: userId } });
  await prisma.waitingRoomProgress.deleteMany({ where: { userId } }); // waiting room progress (plain id, no foreign key)

  return { user: target, counts: { ...counts, files, bytes, mailAttachmentsRemoved: mailFiles.length } satisfies UserDeletionCounts };
};
