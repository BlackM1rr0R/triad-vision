import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { badRequest, conflict } from '../http.js';
import { createRequest, sendRequest, storedPath, type Actor, type Meta, type SignerInput } from '../esign/service.js';
import { withCountersigner } from '../esign/countersign.js';
import { applyLifecycle, contractsDir, loadContract, ownerValues, removeStored, todayOf, writeContractPdf } from './contracts.js';
import { ownerOfRow } from './owner.js';

/**
 * E-signature of an employer / partner contract through the existing SignatureRequest module: the contract PDF
 * goes to the company's signatory (or the given signer) and Triad Vision's default countersigner (else the acting
 * staff member). The request ↔ contract link lives in a Setting row (partnerContract:sig:<requestId>) because the
 * PartnerContract table has no column for it. When the request completes (lib/esign/service.ts afterCompletion →
 * partnerContractSigned) the signed PDF becomes the contract's signed copy, signedAt is set and the lifecycle runs.
 */

const linkKey = (requestId: string) => `partnerContract:sig:${requestId}`;

export interface SendSignatureInput {
  signer?: { name: string; email: string } | null;
  message?: string | null;
  expiresInDays: number;
}

export const sendContractForSignature = async (contractId: string, input: SendSignatureInput, actor: Actor, meta: Meta) => {
  const c = await loadContract(contractId);
  if (!c.filePath || c.mimeType !== 'application/pdf') throw badRequest('PDF_REQUIRED');
  if (c.status === 'TERMINATED' || c.status === 'EXPIRED') throw conflict('CONTRACT_CLOSED');
  const owner = ownerOfRow(c);
  const party = await ownerValues(owner, 'de');
  const signer = input.signer ?? party.signer;
  if (!signer) throw badRequest('SIGNER_EMAIL_REQUIRED');
  const pdf = await fsp.readFile(path.join(contractsDir(), path.basename(c.filePath)));
  const first: SignerInput = {
    role: owner.companyId ? 'COMPANY' : 'OTHER',
    name: signer.name,
    email: signer.email.toLowerCase(),
    userId: !input.signer && party.signer?.userId ? party.signer.userId : null,
    locale: !input.signer && party.signer ? party.signer.locale : 'de',
    order: 1,
  };
  let signers = await withCountersigner([first], 'CASE_CONTRACT');
  if (signers.length === 1) {
    const me = await prisma.user.findUniqueOrThrow({ where: { id: actor.id }, select: { id: true, firstName: true, lastName: true, email: true, locale: true } });
    if (me.email.toLowerCase() !== first.email) signers = [first, { role: 'STAFF', name: `${me.firstName} ${me.lastName}`.trim(), email: me.email, userId: me.id, locale: me.locale, order: 2 }];
  }
  const created = await createRequest(
    {
      title: `${c.title} · ${party.name}`.slice(0, 200),
      companyId: owner.companyId ?? null,
      message: input.message ?? null,
      expiresAt: new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000),
      order: 'SEQUENTIAL',
      signers,
      pdf,
      fileName: c.fileName ?? 'contract.pdf',
    },
    actor,
    meta,
  );
  try {
    await sendRequest(created.id, actor, meta);
  } catch (err) {
    await prisma.signatureRequest.delete({ where: { id: created.id } }).catch(() => undefined);
    await fsp.unlink(storedPath(created.originalKey)).catch(() => undefined);
    throw err;
  }
  await prisma.setting.upsert({
    where: { key: linkKey(created.id) },
    create: { key: linkKey(created.id), value: { contractId: c.id } as Prisma.InputJsonValue },
    update: { value: { contractId: c.id } as Prisma.InputJsonValue },
  });
  const contract = await prisma.partnerContract.update({ where: { id: c.id }, data: c.status === 'DRAFT' ? { status: 'SENT' } : {} });
  return { contract, signatureRequestId: created.id };
};

/** E-signature completion hook (never throws): the signed PDF becomes the contract's signed copy. */
export const partnerContractSigned = async (requestId: string, pdf: Buffer) => {
  try {
    const link = await prisma.setting.findUnique({ where: { key: linkKey(requestId) } });
    const contractId = (link?.value as { contractId?: string } | null)?.contractId;
    if (!contractId) return;
    const c = await prisma.partnerContract.findUnique({ where: { id: contractId } });
    if (!c) return;
    const key = await writeContractPdf(pdf, 'signed');
    const updated = await prisma.partnerContract.update({
      where: { id: c.id },
      data: { signedFilePath: key, signedFileName: `${(c.fileName ?? 'contract.pdf').replace(/\.pdf$/i, '')}-signed.pdf`.slice(0, 255), signedAt: c.signedAt ?? todayOf() },
    });
    await removeStored(c.signedFilePath);
    await applyLifecycle([updated]);
    await prisma.auditLog.create({ data: { actorId: null, action: 'PARTNER_CONTRACT_SIGNED', target: c.companyId ? `company:${c.companyId}` : `partner:${c.referralPartnerId}`, details: { contractId: c.id, title: c.title, signatureRequestId: requestId } } });
  } catch (err) {
    console.error('[partnerRecords] signed hook failed', requestId, err);
  }
};
