import fs from 'node:fs/promises';
import type { Locale, Prisma, Role } from '@prisma/client';
import { prisma } from '../../db.js';
import { badRequest, conflict, forbidden, notFound } from '../http.js';
import { hasMinRole } from '../../middleware/auth.js';
import { notifyStaff, notifyUser } from '../notifications.js';
import { renderContract } from '../contracts/render.js';
import { asContractLang, contractValues, loadContractCase } from '../contracts/values.js';
import { renderContractPdf } from '../contracts/pdf.js';
import { clientSignContract, staffConfirmContract } from '../caseFlow.js';
import { ensureCaseFolder } from '../drive/caseFolders.js';
import { createFileIn } from '../drive/files.js';
import { nodeLiteSelect } from '../drive/access.js';
import { cancelRequest, createRequest, DEFAULT_EXPIRY_DAYS, logEvent, sendRequest, signAsSigner, storedPath, type Actor, type Meta, type SignInput } from '../esign/service.js';
import { defaultCountersigner } from '../esign/countersign.js';
import {
  canApprove,
  DRIVE_FOLDER,
  isCaseContractFor,
  latestOf,
  sendBlockReason,
  signedFileName,
  STEP_TEMPLATE_KINDS,
  STEPS,
  stepOfKind,
  stepState,
  triadFirstSigners,
  type Step,
  type StepState,
} from './flow.js';
import { CLIENT_TEXT, STAFF_TEXT, STEP_NAME } from './texts.js';

/**
 * Two-step case contracts (see flow.ts for the rules):
 *
 *   send       staff pick a template of the step → PDF → signature request with Triad Vision's signatory first
 *              (the default authorised signatory of Admin › Countersign, else the sender) and the client second.
 *              Step 1 sent while the case is in its contract step is the case contract (CONTRACT_SENT, and
 *              CONTRACT_SIGNED at completion — the existing case flow). The employer is never a signer and the
 *              request is not linked to the employer's company.
 *   triadSign  Triad Vision signs in the admin panel (the e-sign service enforces the order: the client is
 *              invited — email + portal notification — only after this signature).
 *   completion (hook from the e-sign service) the signed PDF is filed as a case document (e-sign service) and
 *              saved into "<client folder>/<Əmək müqaviləsi | İş müqaviləsi>"; staff are told to approve.
 *   approve    staff approve the signed contract; for step 1 the case's contract step is confirmed
 *              (CONTRACT_SIGNED → EMBASSY_DOCUMENTS, as "Confirm contract" did) and step 2 becomes available.
 */

const reqInclude = {
  signers: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] },
} satisfies Prisma.SignatureRequestInclude;
type Req = Prisma.SignatureRequestGetPayload<{ include: typeof reqInclude }>;

const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`.trim();

const caseRequests = (caseId: string) =>
  prisma.signatureRequest.findMany({ where: { caseId, contractKind: { not: null } }, include: reqInclude, orderBy: { createdAt: 'desc' } });

const byStep = (rows: Req[]) => {
  const out = {} as Record<Step, { latest: Req | null; all: Req[] }>;
  for (const step of STEPS) {
    const all = rows.filter((r) => stepOfKind(r.contractKind) === step);
    out[step] = { latest: latestOf(all), all };
  }
  return out;
};

const statesOf = (steps: Record<Step, { latest: Req | null }>, now = new Date()) =>
  Object.fromEntries(STEPS.map((s) => [s, stepState(steps[s].latest, now)])) as Record<Step, StepState>;

const signerView = (s: Req['signers'][number] | undefined) =>
  s ? { signerId: s.id, name: s.name, userId: s.userId, status: s.status, signedAt: s.signedAt, invitedAt: s.invitedAt } : null;

const requestView = (r: Req) => ({
  id: r.id,
  title: r.title,
  status: r.status,
  contractKind: r.contractKind,
  isCaseContract: r.isCaseContract,
  sentAt: r.sentAt,
  expiresAt: r.expiresAt,
  completedAt: r.completedAt,
  approvedAt: r.approvedAt,
  finalDocumentId: r.finalDocumentId,
  driveNodeId: r.driveNodeId,
  triad: signerView(r.signers.find((s) => s.role === 'STAFF')),
  client: signerView(r.signers.find((s) => s.role === 'CANDIDATE')),
  // in-flight requests from before the two-step flow may carry other parties: shown read-only
  others: r.signers.filter((s) => s.role !== 'STAFF' && s.role !== 'CANDIDATE').map((s) => ({ name: s.name, role: s.role, status: s.status, signedAt: s.signedAt })),
});

// ─── Staff overview ────────────────────────────────────────────────────

/** Both steps of a case for the admin panel (state, latest request, why sending is blocked, usable templates). */
export const staffOverview = async (caseId: string, viewer: { id: string; role: Role }) => {
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, number: true, status: true, driveFolderId: true } });
  if (!c) throw notFound('CASE_NOT_FOUND');
  const steps = byStep(await caseRequests(caseId));
  const states = statesOf(steps);
  const [templates, signatory] = await Promise.all([
    prisma.contractTemplate.findMany({
      where: { active: true, kind: { in: [...STEP_TEMPLATE_KINDS.LABOUR, ...STEP_TEMPLATE_KINDS.WORK] } },
      select: { id: true, name: true, kind: true, language: true, isDefault: true },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    }),
    defaultCountersigner('CASE_CONTRACT'),
  ]);
  const approvers = new Set(STEPS.map((s) => steps[s].latest?.approvedById).filter((x): x is string => !!x));
  const names = new Map((await prisma.user.findMany({ where: { id: { in: [...approvers] } }, select: { id: true, firstName: true, lastName: true } })).map((u) => [u.id, fullName(u)]));
  // The drive folder holding each signed copy (link "open in the drive"); a deleted copy has none.
  const nodeIds = STEPS.map((s) => steps[s].latest?.driveNodeId).filter((x): x is string => !!x);
  const parents = new Map((await prisma.driveNode.findMany({ where: { id: { in: nodeIds }, deletedAt: null }, select: { id: true, parentId: true } })).map((n) => [n.id, n.parentId]));
  return {
    caseId: c.id,
    caseStatus: c.status,
    driveFolderId: c.driveFolderId,
    /** Who signs for Triad Vision on a new contract: the default authorised signatory, else the sender. */
    triadSignatory: signatory ? { id: signatory.id, name: fullName(signatory) } : null,
    steps: STEPS.map((step) => {
      const r = steps[step].latest;
      const triad = r?.signers.find((s) => s.role === 'STAFF');
      const triadTurn = states[step] === 'TRIAD_TO_SIGN';
      return {
        step,
        state: states[step],
        driveFolder: DRIVE_FOLDER[step],
        blockedReason: sendBlockReason(step, states, c.status),
        templates: templates.filter((t) => STEP_TEMPLATE_KINDS[step].includes(t.kind)),
        request: r
          ? { ...requestView(r), approvedBy: r.approvedById ? (names.get(r.approvedById) ?? null) : null, driveFolderNodeId: r.driveNodeId ? (parents.get(r.driveNodeId) ?? null) : null }
          : null,
        versions: steps[step].all.filter((x) => x.status !== 'DRAFT').length,
        canTriadSign: triadTurn && !!triad && (triad.userId === viewer.id || hasMinRole(viewer.role, 'ADMIN')),
        canApprove: canApprove(states[step]),
      };
    }),
  };
};

// ─── Send ──────────────────────────────────────────────────────────────

export interface SendInput {
  step: Step;
  templateId: string;
  inputs: Record<string, string | undefined>;
  message?: string | null;
  expiresInDays?: number;
}

const safeBase = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'Vertrag';

export const sendStep = async (caseId: string, input: SendInput, actor: Actor, meta: Meta = {}) => {
  const c = await loadContractCase(caseId);
  const steps = byStep(await caseRequests(caseId));
  const block = sendBlockReason(input.step, statesOf(steps), c.status);
  if (block) throw conflict(block);

  const t = await prisma.contractTemplate.findUnique({ where: { id: input.templateId } });
  if (!t) throw notFound('TEMPLATE_NOT_FOUND');
  if (!STEP_TEMPLATE_KINDS[input.step].includes(t.kind)) throw badRequest('TEMPLATE_WRONG_KIND');
  if (!t.active) throw badRequest('TEMPLATE_INACTIVE');

  const lang = asContractLang(t.language);
  const values = await contractValues(c, input.inputs, lang, { firstName: actor.firstName, lastName: actor.lastName });
  const rendered = renderContract(t.body, values);
  // Signature lines: Triad Vision | client (no employer line), for both steps.
  const pdf = await renderContractPdf({ title: t.name, text: rendered.text, kind: 'LABOUR', language: lang, parties: [values['triad.name'], values['client.fullName']] });

  const signatory = await defaultCountersigner('CASE_CONTRACT');
  const me = signatory ?? (await prisma.user.findUniqueOrThrow({ where: { id: actor.id }, select: { id: true, firstName: true, lastName: true, email: true, locale: true } }));
  const signers = triadFirstSigners(
    { name: fullName(me), email: me.email, userId: me.id, locale: me.locale as Locale },
    { name: fullName(c.client), email: c.client.email, phone: c.client.phone, userId: c.client.id, locale: c.client.locale },
  );
  const caseContract = isCaseContractFor(input.step, c.status);
  const created = await createRequest(
    {
      title: `${STEP_NAME.az[input.step]} · ${c.number}`.slice(0, 200),
      caseId: c.id,
      message: input.message ?? null,
      expiresAt: new Date(Date.now() + (input.expiresInDays ?? DEFAULT_EXPIRY_DAYS) * 24 * 60 * 60 * 1000),
      order: 'SEQUENTIAL',
      caseContract,
      signers,
      pdf,
      fileName: `${safeBase(t.name)}-${c.number}.pdf`,
    },
    actor,
    meta,
  );
  // Which step it is; never tied to the employer's company (Triad Vision handles these contracts).
  await prisma.signatureRequest.update({ where: { id: created.id }, data: { contractKind: input.step === 'LABOUR' ? 'LABOUR' : t.kind, companyId: null } });
  try {
    await sendRequest(created.id, actor, meta);
  } catch (err) {
    await prisma.signatureRequest.delete({ where: { id: created.id } }).catch(() => undefined);
    await fs.unlink(storedPath(created.originalKey)).catch(() => undefined);
    throw err;
  }
  // A new version supersedes the open request of the same step.
  for (const old of steps[input.step].all) {
    if (old.id !== created.id && (old.status === 'SENT' || old.status === 'DRAFT')) await cancelRequest(old.id, actor, 'Superseded by a newer version', meta).catch(() => undefined);
  }
  return { signatureRequestId: created.id, caseContract, missing: rendered.missing, triadSignerId: me.id };
};

// ─── Triad Vision signature (first) ────────────────────────────────────

const latestOpen = async (caseId: string, step: Step) => {
  const r = byStep(await caseRequests(caseId))[step].latest;
  if (!r || r.status !== 'SENT') throw conflict('NOTHING_TO_SIGN');
  return r;
};

/**
 * Triad Vision signs first. The designated signer may always sign; another ADMIN+ takes the signer row over
 * (recorded in the audit trail), like the countersignature. The client is invited by the e-sign service afterwards.
 */
export const triadSign = async (caseId: string, step: Step, actor: Actor & { email: string }, input: SignInput, meta: Meta = {}) => {
  const r = await latestOpen(caseId, step);
  const s = r.signers.find((x) => x.role === 'STAFF' && (x.status === 'PENDING' || x.status === 'VIEWED'));
  if (!s) throw conflict('ALREADY_SIGNED');
  if (s.userId !== actor.id) {
    if (!hasMinRole(actor.role, 'ADMIN')) throw forbidden('NOT_TRIAD_SIGNER');
    if (r.signers.some((x) => x.id !== s.id && x.email.toLowerCase() === actor.email.toLowerCase())) throw conflict('DUPLICATE_SIGNER');
    const { count } = await prisma.signatureSigner.updateMany({
      where: { id: s.id, status: { in: ['PENDING', 'VIEWED'] } },
      data: { userId: actor.id, name: fullName(actor).slice(0, 160), email: actor.email, tokenHash: null, sessionHash: null, sessionExpiresAt: null, otpHash: null },
    });
    if (!count) throw conflict('ALREADY_SIGNED');
    await logEvent(r.id, 'VIEWED', { ...meta, actorId: actor.id, signerId: s.id, note: `Triad Vision signature taken over from ${s.name}` });
  }
  await signAsSigner(s.id, input, 'PORTAL', { ...meta, actorId: actor.id });
  return r.id;
};

// ─── Approve ───────────────────────────────────────────────────────────

const notifyClientApproved = async (caseId: string, step: Step) => {
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, number: true, client: { select: { id: true, locale: true } } } });
  if (!c) return;
  const loc = c.client.locale;
  const name = STEP_NAME[loc][step];
  await notifyUser(c.client.id, {
    type: 'CASE_CONTRACT_APPROVED',
    title: CLIENT_TEXT[loc].approvedTitle(name),
    body: CLIENT_TEXT[loc].approvedBody({ name, number: c.number, next: step === 'LABOUR' }),
    link: `/account/cases/${c.id}#contract`,
    caseId: c.id,
    email: true,
  }).catch(() => undefined);
};

/** Marks a request approved (once) and files the signed case document as accepted. */
const markApproved = async (r: Req, actorId: string) => {
  const { count } = await prisma.signatureRequest.updateMany({ where: { id: r.id, status: 'COMPLETED', approvedAt: null }, data: { approvedAt: new Date(), approvedById: actorId } });
  if (!count) return false;
  if (r.finalDocumentId) await prisma.document.updateMany({ where: { id: r.finalDocumentId, status: 'PENDING' }, data: { status: 'ACCEPTED' } });
  const step = stepOfKind(r.contractKind)!;
  await prisma.caseEvent.create({ data: { caseId: r.caseId!, type: 'CONTRACT_APPROVED', note: STEP_NAME.az[step], actorId } }).catch(() => undefined);
  return true;
};

/**
 * Staff approve a fully signed step. Step 1 as the case contract also confirms the case's contract step
 * (CONTRACT_SIGNED → EMBASSY_DOCUMENTS, same as "Confirm contract"). The client is notified.
 */
export const approveStep = async (caseId: string, step: Step, actor: Actor) => {
  const steps = byStep(await caseRequests(caseId));
  const r = steps[step].latest;
  const state = stepState(r);
  if (!r || state === 'APPROVED') throw conflict(r ? 'ALREADY_APPROVED' : 'NOTHING_TO_APPROVE');
  if (!canApprove(state)) throw conflict('NOT_FULLY_SIGNED');
  if (!(await markApproved(r, actor.id))) throw conflict('ALREADY_APPROVED');
  if (step === 'LABOUR' && r.isCaseContract) {
    const c = await prisma.case.findUnique({ where: { id: caseId }, select: { status: true, clientId: true, contract: { select: { signatureRequestId: true } } } });
    // The completion did not move the case (e.g. it was skipped): this signed request is still the case contract,
    // so it takes the case through CONTRACT_SIGNED now instead of stranding it in CONTRACT_SENT.
    if (c?.status === 'CONTRACT_SENT' && c.contract?.signatureRequestId === r.id && r.finalDocumentId) {
      const cand = r.signers.find((s) => s.role === 'CANDIDATE');
      await clientSignContract(caseId, c.clientId, { signerName: cand?.name ?? 'Client', signedDocumentId: r.finalDocumentId, ip: cand?.ip ?? 'unknown', userAgent: cand?.userAgent ?? 'unknown' }).catch((err) =>
        console.warn('[caseContracts] contract step not signed', caseId, (err as Error).message),
      );
      c.status = (await prisma.case.findUnique({ where: { id: caseId }, select: { status: true } }))?.status ?? c.status;
    }
    if (c?.status === 'CONTRACT_SIGNED') {
      await staffConfirmContract(caseId, actor.id).catch((err) => console.warn('[caseContracts] contract step not confirmed', caseId, (err as Error).message));
    }
  }
  if (!r.driveNodeId) await saveSignedToDrive(r.id).catch(() => null); // retry a failed drive copy
  await notifyClientApproved(caseId, step);
  return r.id;
};

/**
 * Hook from caseFlow.staffConfirmContract ("Confirm contract" on the case / bulk): a signed, not yet approved
 * Əmək müqaviləsi counts as approved by that step. Never throws.
 */
export const onContractConfirmed = async (caseId: string, actorId: string) => {
  try {
    const r = byStep(await caseRequests(caseId)).LABOUR.latest;
    if (r && stepState(r) === 'SIGNED' && (await markApproved(r, actorId))) await notifyClientApproved(caseId, 'LABOUR');
  } catch (err) {
    console.error('[caseContracts] confirm hook failed', caseId, err);
  }
};

// ─── Completion: drive copy + staff notification ───────────────────────

/** "<client folder>/<Əmək müqaviləsi | İş müqaviləsi>", created when missing. */
const stepFolder = async (caseId: string, step: Step) => {
  const folderId = await ensureCaseFolder(caseId);
  if (!folderId) return null;
  const name = DRIVE_FOLDER[step];
  const rows = await prisma.driveNode.findMany({ where: { parentId: folderId, kind: 'FOLDER', deletedAt: null, name }, select: nodeLiteSelect, orderBy: { createdAt: 'asc' } });
  const hit = rows.find((x) => x.name.toLocaleLowerCase('az') === name.toLocaleLowerCase('az'));
  if (hit) return hit;
  return prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FOLDER', name, parentId: folderId }, select: nodeLiteSelect });
};

/**
 * Saves the final signed PDF of a two-step contract into the client's drive folder (idempotent: once per request,
 * a copy that is still alive is never duplicated). The drive file is linked to the case document, so the
 * ordinary document copy never puts a second one into "Unterschriebener Vertrag". Returns the node id.
 */
export const saveSignedToDrive = async (requestId: string, pdf?: Buffer): Promise<string | null> => {
  const r = await prisma.signatureRequest.findUnique({ where: { id: requestId }, include: { case: { select: { id: true, number: true, clientId: true } } } });
  const step = stepOfKind(r?.contractKind);
  if (!r || !step || !r.case || r.status !== 'COMPLETED' || !r.finalKey) return null;
  if (r.driveNodeId) {
    const alive = await prisma.driveNode.findUnique({ where: { id: r.driveNodeId }, select: { deletedAt: true } });
    if (alive && !alive.deletedAt) return r.driveNodeId;
  }
  const buf = pdf ?? (await fs.readFile(storedPath(r.finalKey)));
  const folder = await stepFolder(r.case.id, step);
  if (!folder) return null;
  const created = await createFileIn(folder, signedFileName(step, r.case.number), buf, 'application/pdf', r.createdById ?? r.case.clientId);
  const linked = r.finalDocumentId && !(await prisma.driveNode.count({ where: { documentId: r.finalDocumentId } }));
  // A signed copy is "Final" right away (nobody changes it any more), like the drive's own signed copies.
  await prisma.driveNode.update({ where: { id: created.id }, data: { finalAt: new Date(), finalById: null, ...(linked ? { documentId: r.finalDocumentId } : {}) } });
  await prisma.signatureRequest.update({ where: { id: r.id }, data: { driveNodeId: created.id } });
  await prisma.auditLog
    .create({ data: { actorId: null, action: 'CASE_CONTRACT_DRIVE_SAVED', target: `drive:${created.id}`, details: { requestId: r.id, caseId: r.case.id, step, name: created.name } } })
    .catch(() => undefined);
  return created.id;
};

/** E-sign completion hook: drive copy + "client signed, please approve" to the case's staff. Never throws. */
export const caseContractCompleted = async (requestId: string, pdf: Buffer) => {
  try {
    const r = await prisma.signatureRequest.findUnique({
      where: { id: requestId },
      select: { id: true, caseId: true, contractKind: true, case: { select: { number: true, client: { select: { firstName: true, lastName: true } } } } },
    });
    const step = stepOfKind(r?.contractKind);
    if (!r || !step || !r.caseId || !r.case) return;
    await saveSignedToDrive(r.id, pdf).catch((err) => console.error('[caseContracts] drive copy failed', r.id, err));
    const name = STEP_NAME.az[step];
    await notifyStaff(STAFF_TEXT.clientSignedTitle(r.case.number, name), STAFF_TEXT.clientSignedBody(name, fullName(r.case.client)), {
      caseId: r.caseId,
      link: `/admin/cases/${r.caseId}?tab=documents#case-contract`,
      type: 'CASE_CONTRACT_SIGNED',
    });
  } catch (err) {
    console.error('[caseContracts] completion hook failed', requestId, err);
  }
};

// ─── Client portal ─────────────────────────────────────────────────────

/** Both contracts of the client's own case: state, dates, the client's signer row and the signed PDF. */
export const clientOverview = async (caseId: string, clientId: string) => {
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, clientId: true } });
  if (!c || c.clientId !== clientId) throw notFound('CASE_NOT_FOUND');
  const steps = byStep(await caseRequests(caseId));
  const states = statesOf(steps);
  return {
    steps: STEPS.map((step) => {
      const r = steps[step].latest;
      const me = r?.signers.find((s) => s.role === 'CANDIDATE' && s.userId === clientId);
      const triad = r?.signers.find((s) => s.role === 'STAFF');
      return {
        step,
        state: states[step],
        title: r?.title ?? null,
        sentAt: r?.sentAt ?? null,
        expiresAt: r?.expiresAt ?? null,
        triadSignedAt: triad?.signedAt ?? null,
        clientSignedAt: me?.signedAt ?? null,
        approvedAt: r?.approvedAt ?? null,
        signerId: me?.id ?? null,
        myTurn: states[step] === 'CLIENT_TO_SIGN' && !!me && (me.status === 'PENDING' || me.status === 'VIEWED'),
        signedDocumentId: r?.status === 'COMPLETED' ? r.finalDocumentId : null,
      };
    }),
  };
};
