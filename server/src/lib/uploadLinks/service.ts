import fs from 'node:fs/promises';
import path from 'node:path';
import type { CaseUploadLink, Locale } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { FINAL_STATUSES } from '../caseFlow.js';
import { badRequest, conflict, HttpError, notFound } from '../http.js';
import { renderEmail, sendMail } from '../mailer.js';
import { notifyUser } from '../notifications.js';
import { checkCaseDocument } from '../docCheck/index.js';
import { prepareCaseDocument, publicQuality } from '../uploadAi/index.js';
import { photoCheckOnUpload } from '../photoCheck/index.js';
import { emitAutomationEvent } from '../automation/events.js';
import { completeTasksForUpload } from '../clientProcess/tasks.js';
import { copyDocumentToDrive } from '../drive/caseFolders.js';
import { decodeOriginalName, verifyUploadedFile } from '../../middleware/upload.js';
import { CASE_DOC_MIME, HEIF_MIME } from '../fileCheck.js';
import { initialsOf } from '../originals/receipts.js';
import {
  UPLOAD_LINK_MAX_FILES,
  UPLOAD_TOKEN_RE,
  expiryFrom,
  hashUploadToken,
  newUploadToken,
  requirementIdsOf,
  tokenPrefixOf,
  uploadLinkState,
  uploadPageUrl,
} from './token.js';
import { UPLOAD_LINK_MAIL, staffUploadNotice } from './texts.js';

/**
 * "Request documents via link": staff pick requirements of ONE case, an expiry (default 7 days) and send the
 * link by e-mail and/or copy it (WhatsApp). The public page /upload/:token needs no login and shows only the
 * client's initials and the requested items. Uploaded files go through the same checks as portal uploads
 * (MIME + magic bytes in lib/fileCheck.ts, size limit, HEIC → JPEG, scan quality, passport / photo checks) and
 * land in the case as PENDING documents of the chosen requirement, uploaded "by the client".
 */

type L10n = Partial<Record<Locale, string>>;
const pick = (v: unknown, locale: Locale) => {
  const o = (v && typeof v === 'object' ? v : {}) as L10n;
  return o[locale] || o.az || o.de || o.en || Object.values(o).find(Boolean) || '';
};

const DAY = 24 * 60 * 60 * 1000;

export const staffLinkDto = (l: CaseUploadLink, now = new Date()) => ({
  id: l.id,
  caseId: l.caseId,
  tokenPrefix: l.tokenPrefix,
  requirementIds: requirementIdsOf(l.requirementIds),
  note: l.note,
  sentTo: l.sentTo,
  createdById: l.createdById,
  createdAt: l.createdAt,
  expiresAt: l.expiresAt,
  revokedAt: l.revokedAt,
  uploadCount: l.uploadCount,
  lastUsedAt: l.lastUsedAt,
  state: uploadLinkState(l, now),
});

export const listUploadLinks = async (caseId: string) => {
  const rows = await prisma.caseUploadLink.findMany({ where: { caseId }, orderBy: { createdAt: 'desc' }, take: 50 });
  return rows.map((r) => staffLinkDto(r));
};

export interface NewUploadLink {
  caseId: string;
  requirementIds: string[];
  days?: number | null;
  note?: string | null;
  email?: boolean;
  actorId: string;
}

/** Creates a link; the plain token is returned ONLY here (never stored). */
export const createUploadLink = async (input: NewUploadLink, now = new Date()) => {
  const c = await prisma.case.findUnique({
    where: { id: input.caseId },
    select: { id: true, number: true, status: true, client: { select: { email: true, locale: true, firstName: true } } },
  });
  if (!c) throw notFound('CASE_NOT_FOUND');
  if (FINAL_STATUSES.includes(c.status)) throw conflict('CASE_CLOSED');
  const ids = [...new Set(input.requirementIds)];
  const reqs = await prisma.documentRequirement.findMany({ where: { id: { in: ids }, caseId: c.id }, select: { id: true, title: true }, orderBy: { sortOrder: 'asc' } });
  if (!ids.length || reqs.length !== ids.length) throw badRequest('INVALID_REQUIREMENT');

  const token = newUploadToken();
  const expiresAt = expiryFrom(now, input.days);
  const link = await prisma.caseUploadLink.create({
    data: {
      caseId: c.id,
      tokenHash: hashUploadToken(token),
      tokenPrefix: tokenPrefixOf(token),
      requirementIds: ids,
      note: input.note?.trim() || null,
      createdById: input.actorId,
      expiresAt,
      sentTo: input.email && c.client.email ? c.client.email : null,
    },
  });
  const url = uploadPageUrl(config.clientUrl, token);
  let emailed = false;
  if (input.email && c.client.email) {
    const t = UPLOAD_LINK_MAIL[c.client.locale] ?? UPLOAD_LINK_MAIL.az;
    const days = Math.round((expiresAt.getTime() - now.getTime()) / DAY);
    const items = reqs.map((r) => `• ${pick(r.title, c.client.locale)}`).join('\n');
    const html = renderEmail(t.title, `${t.body({ items, days })}${link.note ? `\n\n${link.note}` : ''}`, { label: t.cta, url });
    await sendMail(c.client.email, `Triad Vision · ${t.subject} (${c.number})`, html);
    emailed = true;
  }
  return { link: staffLinkDto(link, now), token, url, emailed };
};

export const revokeUploadLink = async (id: string, actorId: string) => {
  const l = await prisma.caseUploadLink.findUnique({ where: { id } });
  if (!l) throw notFound('UPLOAD_LINK_NOT_FOUND');
  const row = l.revokedAt ? l : await prisma.caseUploadLink.update({ where: { id }, data: { revokedAt: new Date(), revokedById: actorId } });
  return staffLinkDto(row);
};

/** Resolves a public token to an ACTIVE link (404 unknown, 410 expired / revoked / used up). */
export const resolveUploadToken = async (token: string, now = new Date()) => {
  if (!UPLOAD_TOKEN_RE.test(token)) throw notFound('UPLOAD_LINK_NOT_FOUND');
  const link = await prisma.caseUploadLink.findUnique({ where: { tokenHash: hashUploadToken(token) } });
  if (!link) throw notFound('UPLOAD_LINK_NOT_FOUND');
  const state = uploadLinkState(link, now);
  if (state !== 'ACTIVE') throw new HttpError(410, `UPLOAD_LINK_${state}`);
  const c = await prisma.case.findUnique({ where: { id: link.caseId }, select: { id: true, number: true, status: true, clientId: true, assignedStaffId: true, client: { select: { firstName: true, lastName: true, locale: true } } } });
  if (!c || FINAL_STATUSES.includes(c.status)) throw new HttpError(410, 'UPLOAD_LINK_EXPIRED');
  return { link, c };
};

/** What the public page shows: initials, the requested items (with how many files arrived), expiry, limits. */
export const publicUploadView = async (token: string) => {
  const { link, c } = await resolveUploadToken(token);
  const ids = requirementIdsOf(link.requirementIds);
  const reqs = await prisma.documentRequirement.findMany({
    where: { id: { in: ids }, caseId: c.id },
    select: { id: true, title: true, description: true, sortOrder: true, documents: { select: { status: true } } },
    orderBy: { sortOrder: 'asc' },
  });
  return {
    client: initialsOf(c.client.firstName, c.client.lastName),
    locale: c.client.locale,
    note: link.note,
    expiresAt: link.expiresAt,
    remainingFiles: Math.max(0, UPLOAD_LINK_MAX_FILES - link.uploadCount),
    maxFileSize: config.uploads.maxFileSize,
    accept: [...CASE_DOC_MIME, ...HEIF_MIME],
    items: reqs.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      uploaded: r.documents.filter((d) => d.status !== 'REJECTED').length,
      accepted: r.documents.some((d) => d.status === 'ACCEPTED'),
    })),
  };
};

const removeStored = (name: string) => fs.unlink(path.join(config.uploads.privateDir, name)).catch(() => undefined);

/**
 * One uploaded file → a case document of the requirement (PENDING, uploaded by the client), with the usual
 * checks. The file is removed on any error. Staff (link creator + assigned staff) get a notification, at most
 * one per link every 10 minutes so a batch of files does not ring ten times.
 */
export const ingestLinkUpload = async (token: string, file: Express.Multer.File, requirementId: string, now = new Date()) => {
  try {
    const { link, c } = await resolveUploadToken(token, now);
    if (!requirementIdsOf(link.requirementIds).includes(requirementId)) throw badRequest('INVALID_REQUIREMENT');
    const requirement = await prisma.documentRequirement.findUnique({ where: { id: requirementId }, select: { id: true, caseId: true, stage: true, title: true } });
    if (!requirement || requirement.caseId !== c.id) throw badRequest('INVALID_REQUIREMENT');
    await verifyUploadedFile(file); // magic bytes vs. MIME type, HEIC → JPEG (removes the file on mismatch)

    // Count first (atomic, guarded): the link never takes more than UPLOAD_LINK_MAX_FILES files.
    const claimed = await prisma.caseUploadLink.updateMany({
      where: { id: link.id, revokedAt: null, expiresAt: { gt: now }, uploadCount: { lt: UPLOAD_LINK_MAX_FILES } },
      data: { uploadCount: { increment: 1 }, lastUsedAt: now },
    });
    if (claimed.count !== 1) throw new HttpError(410, 'UPLOAD_LINK_EXHAUSTED');

    const doc = await prisma.document.create({
      data: {
        caseId: c.id,
        requirementId: requirement.id,
        stage: requirement.stage,
        originalName: decodeOriginalName(file.originalname).slice(0, 200),
        storedName: file.filename,
        mimeType: file.mimetype,
        size: file.size,
        uploadedById: c.clientId,
      },
    });
    await prisma.caseEvent.create({ data: { caseId: c.id, type: 'DOCUMENT_UPLOADED', note: `${doc.originalName} (link)`, actorId: c.clientId, visibleToClient: false } });
    void emitAutomationEvent({ type: 'DOCUMENT_UPLOADED', entityType: 'document', entityId: doc.id, caseId: c.id });
    void copyDocumentToDrive(doc.id, { pending: true });
    const checks = await checkCaseDocument(doc.id); // PDF readable, image, resolution, passport MRZ / expiry (never throws)
    const quality = publicQuality(await prepareCaseDocument(doc.id)); // blur / darkness / cut-off (never throws)
    const photoCheck = await photoCheckOnUpload(doc.id); // biometric photo rules for PHOTO requirements (never throws)
    void completeTasksForUpload(doc.id);

    const quiet = link.lastUsedAt && now.getTime() - link.lastUsedAt.getTime() < 10 * 60 * 1000;
    if (!quiet) {
      const notice = staffUploadNotice(c.number, pick(requirement.title, 'az'), doc.originalName);
      const to = [...new Set([link.createdById, c.assignedStaffId].filter((x): x is string => !!x))];
      await Promise.all(
        to.map((userId) =>
          notifyUser(userId, { type: 'DOCUMENT_UPLOAD_LINK', title: notice.title, body: notice.body, link: `/admin/cases/${c.id}`, caseId: c.id, email: false }).catch(() => undefined),
        ),
      );
    }
    return {
      link,
      caseId: c.id,
      document: { id: doc.id, requirementId: doc.requirementId, originalName: doc.originalName, size: doc.size, mimeType: doc.mimeType },
      // Codes only (no OCR values: whoever holds the link sees the result).
      checks: checks ? { level: checks.level, issues: checks.issues.map((i) => ({ code: i.code, level: i.level })) } : null,
      quality,
      photoCheck: photoCheck ? { ok: photoCheck.ok, level: photoCheck.level, failed: photoCheck.checks.filter((x) => !x.ok).map((x) => x.key) } : null,
    };
  } catch (err) {
    await removeStored(file.filename);
    throw err;
  }
};
