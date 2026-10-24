import crypto from 'node:crypto';
import type { EmbassyPackageApproval, Locale, Prisma, Role } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { hasMinRole } from '../../middleware/auth.js';
import { badRequest, conflict, forbidden, HttpError, notFound } from '../http.js';
import { invalidateMyWork } from '../myWork.js';
import { notifyUser } from '../notifications.js';
import { packagePreview } from './embassyPackage.js';
import { fourEyesTexts } from './fourEyesTexts.js';

/**
 * Four-eyes check of the embassy package ("4 göz yoxlaması") before the case is lodged at the embassy.
 *
 * The builder requests a review (EmbassyPackageApproval PENDING, with the package fingerprint); a DIFFERENT
 * staff member goes through a short checklist and approves or sends it back with a comment; both sides are
 * notified. The gate (`assertFourEyes`) refuses moving the case to DECISION_PENDING (staffMarkLodged) and
 * moving a drive file of the case to SENT_TO_EMBASSY with 409 FOUR_EYES_REQUIRED unless the latest
 * approval is APPROVED for the package as it is now — a changed package (another document, a new version,
 * a rebuilt PDF) answers 409 FOUR_EYES_PACKAGE_CHANGED and needs a new review. A SUPER_ADMIN can override
 * with a mandatory reason (row OVERRIDDEN, audited by the route). Setting `fourEyes` { enabled } (default on).
 */

export const FOUR_EYES_SETTING_KEY = 'fourEyes';
export const CHECKLIST_KEYS = ['DOCS_COMPLETE', 'TRANSLATIONS_APOSTILLE', 'NAMES_MATCH_PASSPORT', 'PHOTOS_SPEC', 'FORMS_SIGNED'] as const;
export type ChecklistKey = (typeof CHECKLIST_KEYS)[number];
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'OVERRIDDEN';

export const fourEyesSettingsSchema = z.object({ enabled: z.boolean() });
export type FourEyesSettings = z.infer<typeof fourEyesSettingsSchema>;

export const getFourEyesSettings = async (): Promise<FourEyesSettings> => {
  const row = await prisma.setting.findUnique({ where: { key: FOUR_EYES_SETTING_KEY } });
  const parsed = fourEyesSettingsSchema.safeParse({ enabled: true, ...((row?.value ?? {}) as object) });
  return parsed.success ? parsed.data : { enabled: true };
};

export const saveFourEyesSettings = async (s: FourEyesSettings) => {
  await prisma.setting.upsert({ where: { key: FOUR_EYES_SETTING_KEY }, create: { key: FOUR_EYES_SETTING_KEY, value: s }, update: { value: s } });
  return s;
};

// ─── Package fingerprint ──────────────────────────────────────────────

/**
 * sha256 over what goes to the embassy: every included document of the case (and of its family members)
 * with its id and review status, plus the built package file. Uploading / swapping / re-reviewing a document
 * or rebuilding the package changes it.
 */
export const packageFingerprint = async (caseId: string) => {
  const preview = await packagePreview(caseId);
  const lines = preview.items.filter((i) => i.include && i.document).map((i) => `${i.key}:${i.document!.id}:${i.document!.status}`);
  for (const m of preview.family) {
    const mp = await packagePreview(m.caseId);
    for (const i of mp.items) if (i.include && i.document) lines.push(`family:${m.caseId}:${i.key}:${i.document.id}:${i.document.status}`);
  }
  if (preview.lastPackage) lines.push(`package:${preview.lastPackage.documentId}`);
  lines.sort();
  const hash = crypto.createHash('sha256').update(lines.join('\n')).digest('hex');
  const node = preview.lastPackage ? await prisma.driveNode.findUnique({ where: { documentId: preview.lastPackage.documentId }, select: { id: true } }) : null;
  return { hash, packageNodeId: node?.id ?? null, lastPackage: preview.lastPackage, documents: lines.filter((l) => !l.startsWith('package:')).length };
};

// ─── Gate ─────────────────────────────────────────────────────────────

export const latestApproval = (caseId: string) => prisma.embassyPackageApproval.findFirst({ where: { caseId }, orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }] });

/** Throws 409 unless the case may go to the embassy (gate off, OVERRIDDEN, or APPROVED for the current package). */
export const assertFourEyes = async (caseId: string) => {
  if (!(await getFourEyesSettings()).enabled) return;
  const a = await latestApproval(caseId);
  if (a?.status === 'OVERRIDDEN') return;
  if (!a || a.status !== 'APPROVED') throw conflict('FOUR_EYES_REQUIRED', 'The embassy package needs an approved four-eyes check by a second staff member.');
  if ((await packageFingerprint(caseId)).hash !== a.packageHash) throw conflict('FOUR_EYES_PACKAGE_CHANGED', 'The embassy package changed after the four-eyes approval; it needs a new review.');
};

/** Case of a drive node: the case document it copies, else the case whose client folder contains it. */
export const caseForDriveNode = async (nodeId: string) => {
  let id: string | null = nodeId;
  const seen = new Set<string>();
  for (let depth = 0; id && depth < 12 && !seen.has(id); depth++) {
    seen.add(id);
    const node: { id: string; parentId: string | null; documentId: string | null } | null = await prisma.driveNode.findUnique({ where: { id }, select: { id: true, parentId: true, documentId: true } });
    if (!node) return null;
    if (node.documentId) {
      const doc = await prisma.document.findUnique({ where: { id: node.documentId }, select: { caseId: true } });
      if (doc) return doc.caseId;
    }
    const c = await prisma.case.findUnique({ where: { driveFolderId: node.id }, select: { id: true } });
    if (c) return c.id;
    id = node.parentId;
  }
  return null;
};

// ─── Flow ─────────────────────────────────────────────────────────────

const fullName = (u: { firstName: string; lastName: string } | null | undefined) => (u ? `${u.firstName} ${u.lastName}`.trim() : '');
const STAFF_ROLES: Role[] = ['STAFF', 'ADMIN', 'SUPER_ADMIN'];

const caseInfo = async (caseId: string) => {
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, number: true, status: true, client: { select: { firstName: true, lastName: true } } } });
  if (!c) throw notFound('CASE_NOT_FOUND');
  return { ...c, worker: fullName(c.client) || c.number };
};

const notifyAll = async (users: { id: string; locale: Locale }[], caseId: string, make: (l: Locale) => { title: string; body: string }, link: string) => {
  await Promise.all(users.map((u) => notifyUser(u.id, { type: 'FOUR_EYES', ...make(u.locale), link, caseId }).catch(() => undefined)));
  for (const u of users) invalidateMyWork(u.id);
};

export const requestSchema = z.object({ reviewerId: z.string().trim().min(1).max(40).nullish(), note: z.string().trim().max(1000).nullish() });

/** The builder asks for the review (refreshes a pending request whose package changed meanwhile). */
export const requestReview = async (caseId: string, actor: { id: string; firstName: string; lastName: string }, input: z.infer<typeof requestSchema>) => {
  const c = await caseInfo(caseId);
  const fp = await packageFingerprint(caseId);
  if (!fp.lastPackage) throw conflict('PACKAGE_NOT_BUILT', 'Build the embassy package first.');
  let reviewer: { id: string; locale: Locale } | null = null;
  if (input.reviewerId) {
    if (input.reviewerId === actor.id) throw badRequest('FOUR_EYES_SAME_PERSON');
    reviewer = await prisma.user.findFirst({ where: { id: input.reviewerId, isActive: true, role: { in: STAFF_ROLES } }, select: { id: true, locale: true } });
    if (!reviewer) throw badRequest('INVALID_REVIEWER');
  }
  const last = await latestApproval(caseId);
  if (last?.status === 'APPROVED' && last.packageHash === fp.hash) throw conflict('FOUR_EYES_ALREADY_APPROVED');
  let row: EmbassyPackageApproval;
  if (last?.status === 'PENDING') {
    if (last.packageHash === fp.hash && (!reviewer || reviewer.id === last.reviewerId)) throw conflict('FOUR_EYES_PENDING');
    row = await prisma.embassyPackageApproval.update({
      where: { id: last.id },
      data: { packageHash: fp.hash, packageNodeId: fp.packageNodeId, requestedById: actor.id, requestedAt: new Date(), reviewerId: reviewer?.id ?? last.reviewerId, comment: input.note || last.comment },
    });
  } else {
    row = await prisma.embassyPackageApproval.create({
      data: { caseId, status: 'PENDING', packageHash: fp.hash, packageNodeId: fp.packageNodeId, requestedById: actor.id, reviewerId: reviewer?.id ?? null, comment: input.note || null },
    });
  }
  await prisma.caseEvent.create({ data: { caseId, type: 'FOUR_EYES_REQUESTED', note: input.note || null, actorId: actor.id, visibleToClient: false } });
  // The chosen reviewer, else every other ADMIN+ (any staff member can still take it from "my work").
  const recipients = reviewer ? [reviewer] : await prisma.user.findMany({ where: { isActive: true, role: { in: ['ADMIN', 'SUPER_ADMIN'] }, id: { not: actor.id } }, select: { id: true, locale: true } });
  const p = { number: c.number, worker: c.worker, by: fullName(actor), comment: input.note ?? null };
  await notifyAll(recipients, caseId, (l) => ({ title: fourEyesTexts(l).requestTitle(p), body: fourEyesTexts(l).requestBody(p) }), `/admin/cases/${caseId}?tab=documents#case-four-eyes`);
  invalidateMyWork();
  return row;
};

export const reviewSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  comment: z.string().trim().max(2000).nullish(),
  checklist: z.array(z.object({ key: z.enum(CHECKLIST_KEYS), ok: z.boolean(), note: z.string().trim().max(300).nullish() })).max(CHECKLIST_KEYS.length).default([]),
});

/** A second staff member approves (every checklist point ticked) or sends it back (with a comment). */
export const reviewPackage = async (approvalId: string, actor: { id: string; role: Role; firstName: string; lastName: string }, input: z.infer<typeof reviewSchema>) => {
  const a = await prisma.embassyPackageApproval.findUnique({ where: { id: approvalId } });
  if (!a) throw notFound('APPROVAL_NOT_FOUND');
  if (a.status !== 'PENDING') throw conflict('APPROVAL_NOT_PENDING');
  if (a.requestedById === actor.id) throw forbidden('FOUR_EYES_SAME_PERSON');
  if (a.reviewerId && a.reviewerId !== actor.id && !hasMinRole(actor.role, 'ADMIN')) throw forbidden('NOT_ASSIGNED_REVIEWER');
  const checklist = CHECKLIST_KEYS.map((key) => {
    const item = input.checklist.find((i) => i.key === key);
    return { key, ok: !!item?.ok, note: item?.note || null };
  });
  if (input.decision === 'APPROVE') {
    if (checklist.some((i) => !i.ok)) throw badRequest('CHECKLIST_INCOMPLETE');
    // The reviewer must have seen the package as it is now.
    if ((await packageFingerprint(a.caseId)).hash !== a.packageHash) throw conflict('FOUR_EYES_PACKAGE_CHANGED', 'The package changed after the review was requested; ask for a new review.');
  } else if (!input.comment) throw badRequest('COMMENT_REQUIRED');
  const res = await prisma.embassyPackageApproval.updateMany({
    where: { id: a.id, status: 'PENDING' },
    data: { status: input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED', reviewerId: actor.id, reviewedAt: new Date(), comment: input.comment || null, checklist: checklist as unknown as Prisma.InputJsonValue },
  });
  if (!res.count) throw conflict('APPROVAL_NOT_PENDING');
  const c = await caseInfo(a.caseId);
  await prisma.caseEvent.create({ data: { caseId: a.caseId, type: input.decision === 'APPROVE' ? 'FOUR_EYES_APPROVED' : 'FOUR_EYES_REJECTED', note: input.comment || null, actorId: actor.id, visibleToClient: false } });
  const requester = await prisma.user.findFirst({ where: { id: a.requestedById, isActive: true }, select: { id: true, locale: true } });
  const p = { number: c.number, worker: c.worker, by: fullName(actor), comment: input.comment ?? null };
  if (requester) {
    await notifyAll([requester], a.caseId, (l) => ({ title: input.decision === 'APPROVE' ? fourEyesTexts(l).approvedTitle(p) : fourEyesTexts(l).rejectedTitle(p), body: fourEyesTexts(l).decisionBody(p) }), `/admin/cases/${a.caseId}?tab=documents#case-four-eyes`);
  }
  invalidateMyWork();
  return prisma.embassyPackageApproval.findUniqueOrThrow({ where: { id: a.id } });
};

export const overrideSchema = z.object({ reason: z.string().trim().min(5).max(2000) });

/** SUPER_ADMIN only (checked by the route): lets the case go to the embassy without a second review. */
export const overrideFourEyes = async (caseId: string, actor: { id: string; firstName: string; lastName: string }, reason: string) => {
  const c = await caseInfo(caseId);
  const fp = await packageFingerprint(caseId);
  const row = await prisma.embassyPackageApproval.create({
    data: { caseId, status: 'OVERRIDDEN', packageHash: fp.hash, packageNodeId: fp.packageNodeId, requestedById: actor.id, reviewerId: actor.id, reviewedAt: new Date(), comment: reason },
  });
  await prisma.caseEvent.create({ data: { caseId, type: 'FOUR_EYES_OVERRIDDEN', note: reason, actorId: actor.id, visibleToClient: false } });
  const pending = await prisma.embassyPackageApproval.findMany({ where: { caseId, status: 'PENDING' }, select: { requestedById: true } });
  const requesters = await prisma.user.findMany({ where: { id: { in: [...new Set(pending.map((x) => x.requestedById))].filter((id) => id !== actor.id) }, isActive: true }, select: { id: true, locale: true } });
  // The open request is settled by the override.
  await prisma.embassyPackageApproval.updateMany({ where: { caseId, status: 'PENDING' }, data: { status: 'REJECTED', reviewerId: actor.id, reviewedAt: new Date(), comment: reason } });
  const p = { number: c.number, worker: c.worker, by: fullName(actor), comment: reason };
  await notifyAll(requesters, caseId, (l) => ({ title: fourEyesTexts(l).overriddenTitle(p), body: fourEyesTexts(l).decisionBody(p) }), `/admin/cases/${caseId}?tab=documents#case-four-eyes`);
  invalidateMyWork();
  return row;
};

// ─── Reads ────────────────────────────────────────────────────────────

const people = async (ids: (string | null)[]) => {
  const list = [...new Set(ids.filter((x): x is string => !!x))];
  const rows = list.length ? await prisma.user.findMany({ where: { id: { in: list } }, select: { id: true, firstName: true, lastName: true } }) : [];
  return new Map(rows.map((u) => [u.id, { id: u.id, name: fullName(u) }]));
};

const serialize = (a: EmbassyPackageApproval, who: Map<string, { id: string; name: string }>) => ({
  id: a.id,
  status: a.status as ApprovalStatus,
  packageHash: a.packageHash,
  packageNodeId: a.packageNodeId,
  requestedBy: who.get(a.requestedById) ?? { id: a.requestedById, name: '—' },
  requestedAt: a.requestedAt,
  reviewer: a.reviewerId ? (who.get(a.reviewerId) ?? { id: a.reviewerId, name: '—' }) : null,
  reviewedAt: a.reviewedAt,
  comment: a.comment,
  checklist: (a.checklist as { key: ChecklistKey; ok: boolean; note: string | null }[] | null) ?? [],
});

/** Panel of the admin case page: state of the gate for this case + history. */
export const fourEyesState = async (caseId: string, viewer: { id: string; role: Role }) => {
  await caseInfo(caseId);
  const [settings, rows, fp] = await Promise.all([
    getFourEyesSettings(),
    prisma.embassyPackageApproval.findMany({ where: { caseId }, orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }], take: 10 }),
    packageFingerprint(caseId),
  ]);
  const who = await people(rows.flatMap((r) => [r.requestedById, r.reviewerId]));
  const latest = rows[0] ?? null;
  const stale = !!latest && latest.status === 'APPROVED' && latest.packageHash !== fp.hash;
  const state = !latest ? 'NONE' : stale ? 'STALE' : (latest.status as ApprovalStatus);
  return {
    enabled: settings.enabled,
    state,
    /** May the case go to the embassy now? */
    cleared: !settings.enabled || state === 'APPROVED' || state === 'OVERRIDDEN',
    current: { hash: fp.hash, packageBuilt: !!fp.lastPackage, lastPackage: fp.lastPackage, packageNodeId: fp.packageNodeId, documents: fp.documents, changedSinceRequest: !!latest && latest.status === 'PENDING' && latest.packageHash !== fp.hash },
    latest: latest ? serialize(latest, who) : null,
    history: rows.map((r) => serialize(r, who)),
    checklistKeys: CHECKLIST_KEYS,
    canReview: !!latest && latest.status === 'PENDING' && latest.requestedById !== viewer.id && (!latest.reviewerId || latest.reviewerId === viewer.id || hasMinRole(viewer.role, 'ADMIN')),
    canOverride: viewer.role === 'SUPER_ADMIN',
  };
};

/** "Waiting for my review": pending requests assigned to the viewer, or unassigned ones someone else asked for. */
export const reviewQueueWhere = (viewerId: string): Prisma.EmbassyPackageApprovalWhereInput => ({
  status: 'PENDING',
  requestedById: { not: viewerId },
  OR: [{ reviewerId: viewerId }, { reviewerId: null }],
});

export const reviewQueue = async (viewerId: string, take = 50) => {
  const rows = await prisma.embassyPackageApproval.findMany({ where: reviewQueueWhere(viewerId), orderBy: { requestedAt: 'asc' }, take });
  const [who, cases] = await Promise.all([
    people(rows.flatMap((r) => [r.requestedById, r.reviewerId])),
    prisma.case.findMany({ where: { id: { in: rows.map((r) => r.caseId) } }, select: { id: true, number: true, status: true, appointmentAt: true, client: { select: { firstName: true, lastName: true } } } }),
  ]);
  const byId = new Map(cases.map((c) => [c.id, c]));
  return rows
    .filter((r) => byId.has(r.caseId))
    .map((r) => {
      const c = byId.get(r.caseId)!;
      return { ...serialize(r, who), case: { id: c.id, number: c.number, status: c.status, appointmentAt: c.appointmentAt, client: fullName(c.client) } };
    });
};

export const isFourEyesError = (err: unknown) => err instanceof HttpError && (err.code === 'FOUR_EYES_REQUIRED' || err.code === 'FOUR_EYES_PACKAGE_CHANGED');
