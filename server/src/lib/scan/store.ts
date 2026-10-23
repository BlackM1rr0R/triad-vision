import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { DocStage } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { CLIENT_UPLOAD_STAGE } from '../caseFlow.js';
import { badRequest, conflict, forbidden, notFound } from '../http.js';
import { checkCaseDocument } from '../docCheck/index.js';
import { copyDocumentToDrive } from '../drive/caseFolders.js';
import { fillExpiryFromOcr } from '../expiry/index.js';
import { emitAutomationEvent } from '../automation/events.js';

/**
 * Stores a generated PDF as a normal case Document, following the same rules as the two upload routes:
 *   - the client (case owner): the stage the case currently accepts, a requirement of that stage, PENDING,
 *     automatic quality checks;
 *   - staff (with 2FA): any case, stage INITIAL/EMBASSY (requirement required) or VISA/OTHER, auto-accepted
 *     and copied into the client's drive folder.
 * Throws HttpErrors (404 for someone else's case) before anything is written.
 */

export type ScanActor = { id: string; staff: boolean; twoFactorEnabled: boolean };
export const STAFF_SCAN_STAGES = ['INITIAL', 'EMBASSY', 'VISA', 'OTHER'] as const;

export interface ScanTarget {
  caseId: string;
  requirementId?: string;
  stage?: (typeof STAFF_SCAN_STAGES)[number];
}

/** Validates where the scan goes; returns the case, stage and requirement to use. */
export const resolveScanTarget = async (actor: ScanActor, target: ScanTarget) => {
  const c = await prisma.case.findUnique({ where: { id: target.caseId } });
  if (!c) throw notFound('CASE_NOT_FOUND');
  const own = c.clientId === actor.id;
  if (!own && !actor.staff) throw notFound('CASE_NOT_FOUND');
  if (!own && !actor.twoFactorEnabled) throw forbidden('TWO_FACTOR_ENROLLMENT_REQUIRED');

  const requirement = target.requirementId ? await prisma.documentRequirement.findUnique({ where: { id: target.requirementId } }) : null;
  if (target.requirementId && (!requirement || requirement.caseId !== c.id)) throw badRequest('INVALID_REQUIREMENT');

  if (own) {
    const stage = CLIENT_UPLOAD_STAGE[c.status];
    if (!stage) throw conflict('UPLOAD_NOT_ALLOWED');
    if (!requirement || requirement.stage !== stage) throw badRequest('INVALID_REQUIREMENT');
    return { c, stage: stage as DocStage, requirement, asStaff: false };
  }
  const stage = (target.stage ?? requirement?.stage) as DocStage | undefined;
  if (!stage || !(STAFF_SCAN_STAGES as readonly string[]).includes(stage)) throw badRequest('INVALID_STAGE');
  if (requirement && requirement.stage !== stage) throw badRequest('INVALID_REQUIREMENT');
  if (!requirement && (stage === 'INITIAL' || stage === 'EMBASSY')) throw badRequest('REQUIREMENT_REQUIRED');
  return { c, stage, requirement, asStaff: true };
};

export const storeScanDocument = async (
  actor: ScanActor,
  resolved: Awaited<ReturnType<typeof resolveScanTarget>>,
  pdf: Buffer,
  originalName: string,
  pages: number,
) => {
  const storedName = `${Date.now()}-${crypto.randomBytes(12).toString('hex')}.pdf`;
  const filePath = path.join(config.uploads.privateDir, storedName);
  await fs.writeFile(filePath, pdf);
  try {
    const doc = await prisma.document.create({
      data: {
        caseId: resolved.c.id,
        requirementId: resolved.requirement?.id ?? null,
        stage: resolved.stage,
        originalName: originalName.slice(0, 200),
        storedName,
        mimeType: 'application/pdf',
        size: pdf.length,
        status: resolved.asStaff ? 'ACCEPTED' : 'PENDING',
        uploadedById: actor.id,
      },
    });
    await prisma.caseEvent.create({
      data: resolved.asStaff
        ? { caseId: resolved.c.id, type: 'STAFF_DOCUMENT_UPLOADED', note: `${doc.originalName} (${pages})`, actorId: actor.id, visibleToClient: resolved.stage === 'VISA' || resolved.stage === 'OTHER' }
        : { caseId: resolved.c.id, type: 'DOCUMENT_UPLOADED', note: `${doc.originalName} (${pages})`, actorId: actor.id, visibleToClient: false },
    });
    void emitAutomationEvent({ type: 'DOCUMENT_UPLOADED', entityType: 'document', entityId: doc.id, caseId: resolved.c.id }); // automation hook
    if (doc.status === 'ACCEPTED') void copyDocumentToDrive(doc.id); // a copy in the client's drive folder
    // Automatic quality checks (PDF readable, …); never throws.
    const checks = await checkCaseDocument(doc.id);
    if (checks) await fillExpiryFromOcr(doc.id, null, checks);
    return { document: { ...doc, checks }, checks };
  } catch (err) {
    await fs.unlink(filePath).catch(() => undefined);
    throw err;
  }
};

/** "scan-2026-10-18.pdf", or the given name with a .pdf extension (path parts stripped). */
export const scanFileName = (name: string | undefined, now = new Date()) => {
  const base = (name ?? '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').trim().replace(/\.(pdf|jpe?g|png)$/i, '').slice(0, 180).trim();
  return `${base || `scan-${now.toISOString().slice(0, 10)}`}.pdf`;
};
