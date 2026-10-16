import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Locale, Prisma, Role, SignatureEventType, SignatureOrder, SignatureRequest, SignatureSigner, SignerRole } from '@prisma/client';
import { PDFDocument } from 'pdf-lib';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { badRequest, conflict, HttpError, notFound } from '../http.js';
import { renderEmail, sendMail } from '../mailer.js';
import { notifyUser } from '../notifications.js';
import { clientSignContract, staffSendContract } from '../caseFlow.js';
import { buildFinalPdf } from './pdf.js';
import { esignText, formatDay } from './texts.js';
import { maskEmail } from './otp.js';

/**
 * Multi-party online signatures ("Signature requests").
 *
 *  - Staff create a request (PDF + signers + order) and send it.
 *  - Every signer whose turn it is gets an email with a personal link /sign/<token> (32 random
 *    bytes, only the SHA-256 is stored, new link on every reminder) and, with a portal account,
 *    an in-app notification. Portal users can also sign from their portal.
 *  - Sequential: the lowest pending order number signs first (equal numbers sign in parallel).
 *  - When the last signer signs, the final PDF (original + signature page + certificate of
 *    completion) is generated, stored, emailed to everyone and — for a case — stored as a case
 *    Document; for the case's employment contract the case moves to CONTRACT_SIGNED.
 */

export const MAX_PDF_BYTES = 20 * 1024 * 1024;
export const DEFAULT_EXPIRY_DAYS = 14;
export const MAX_SIGNERS = 10;
const DAY = 24 * 60 * 60 * 1000;

export interface Meta {
  ip?: string | null;
  userAgent?: string | null;
  actorId?: string | null;
}

export interface Actor {
  id: string;
  role: Role;
  firstName: string;
  lastName: string;
}

// ─── Files ─────────────────────────────────────────────────────────────

export const storedPath = (key: string) => path.join(config.uploads.privateDir, path.basename(key));
export const sha256 = (b: Buffer | string) => crypto.createHash('sha256').update(b).digest('hex');
const newKey = (kind: string, ext: string) => `${Date.now()}-esign-${kind}-${crypto.randomBytes(12).toString('hex')}${ext}`;

const writeStored = async (kind: string, ext: string, data: Buffer) => {
  const key = newKey(kind, ext);
  await fs.writeFile(storedPath(key), data);
  return key;
};

export const readStored = (key: string) => fs.readFile(storedPath(key));
const removeStored = (key: string | null | undefined) => (key ? fs.unlink(storedPath(key)).catch(() => undefined) : Promise.resolve());

/** Checks a PDF: magic bytes, size, loads with pdf-lib (rejects encrypted / broken files). Returns the page count. */
export const inspectPdf = async (buf: Buffer) => {
  if (buf.length > MAX_PDF_BYTES) throw new HttpError(413, 'FILE_TOO_LARGE');
  if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') throw badRequest('INVALID_PDF', 'Not a PDF file');
  try {
    const doc = await PDFDocument.load(buf);
    const pages = doc.getPageCount();
    if (pages < 1) throw new Error('empty');
    return pages;
  } catch {
    throw badRequest('INVALID_PDF', 'The document must be an unencrypted, well-formed PDF');
  }
};

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export const PNG_DATA_URL = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/;

/** Decodes and verifies a drawn signature (PNG data URL); pdf-lib must be able to embed it. */
export const decodeSignaturePng = async (dataUrl: string) => {
  const m = PNG_DATA_URL.exec(dataUrl);
  if (!m) throw badRequest('INVALID_SIGNATURE');
  const png = Buffer.from(m[1], 'base64');
  if (!png.subarray(0, 8).equals(PNG_MAGIC)) throw badRequest('INVALID_SIGNATURE');
  try {
    await (await PDFDocument.create()).embedPng(png);
  } catch {
    throw badRequest('INVALID_SIGNATURE');
  }
  return png;
};

// ─── Events ────────────────────────────────────────────────────────────

export const logEvent = (
  requestId: string,
  type: SignatureEventType,
  opts: Meta & { signerId?: string | null; note?: string | null } = {},
  db: Prisma.TransactionClient | typeof prisma = prisma,
) =>
  db.signatureEvent.create({
    data: {
      requestId,
      type,
      signerId: opts.signerId ?? null,
      actorId: opts.actorId ?? null,
      note: opts.note?.slice(0, 2000) ?? null,
      ip: opts.ip?.slice(0, 64) ?? null,
      userAgent: opts.userAgent?.slice(0, 1000) ?? null,
    },
  });

// ─── Turn order ────────────────────────────────────────────────────────

type SignerLite = Pick<SignatureSigner, 'id' | 'order' | 'status'>;
const open = (s: SignerLite) => s.status === 'PENDING' || s.status === 'VIEWED';

/** Signers who may sign now: every open signer (parallel) or the lowest open order step (sequential). */
export const currentTurn = <S extends SignerLite>(signers: S[], order: SignatureOrder): S[] => {
  const pending = signers.filter(open);
  if (order === 'PARALLEL' || pending.length === 0) return pending;
  const min = Math.min(...pending.map((s) => s.order));
  return pending.filter((s) => s.order === min);
};

export const isExpired = (r: Pick<SignatureRequest, 'status' | 'expiresAt'>, now = new Date()) =>
  r.status === 'SENT' && !!r.expiresAt && r.expiresAt.getTime() <= now.getTime();

// ─── Links and emails ──────────────────────────────────────────────────

export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export const signUrl = (token: string) => `${config.clientUrl}/sign/${token}`;

/** Where a portal user signs (in-app link). */
export const portalSignLink = (role: Role, signerId: string) =>
  role === 'COMPANY' ? `/company/contracts/${signerId}` : role === 'CLIENT' ? `/account/signatures/${signerId}` : `/admin/signatures/sign/${signerId}`;

const fullName = (u: { firstName: string; lastName: string } | null | undefined) => (u ? `${u.firstName} ${u.lastName}`.trim() : 'Triad Vision');

type RequestWithSigners = SignatureRequest & {
  signers: SignatureSigner[];
  createdBy: { id: string; firstName: string; lastName: string; email: string; locale: Locale; role: Role; isActive: boolean } | null;
};

const loadFull = (id: string) =>
  prisma.signatureRequest.findUnique({
    where: { id },
    include: {
      signers: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] },
      createdBy: { select: { id: true, firstName: true, lastName: true, email: true, locale: true, role: true, isActive: true } },
    },
  });

/**
 * Issues a fresh link token for the signer (the previous link stops working) and emails it.
 * kind INVITE also sets invitedAt and posts an in-app notification for portal users.
 */
const deliverLink = async (r: RequestWithSigners, s: SignatureSigner, kind: 'INVITE' | 'REMIND', meta: Meta = {}) => {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = new Date();
  // a new link starts a new identity check
  const data = { tokenHash: sha256(token), sessionHash: null, sessionExpiresAt: null };
  if (kind === 'INVITE' && !s.invitedAt) {
    // Conditional: two parallel signatures that both open the next step invite it only once.
    const { count } = await prisma.signatureSigner.updateMany({ where: { id: s.id, invitedAt: null }, data: { ...data, invitedAt: now } });
    if (!count) return null;
  } else {
    await prisma.signatureSigner.update({ where: { id: s.id }, data });
  }
  const t = esignText(s.locale);
  const until = r.expiresAt ? formatDay(r.expiresAt, s.locale) : null;
  const body =
    kind === 'INVITE'
      ? t.inviteBody({ sender: fullName(r.createdBy), title: r.title, message: r.message, until })
      : t.reminderBody({ title: r.title, until });
  const html = renderEmail(kind === 'INVITE' ? t.inviteTitle : t.reminderTitle, `${body}\n\n${t.linkNote}\n\n${t.legalNote}`, { label: t.cta, url: signUrl(token) });
  void sendMail(s.email, kind === 'INVITE' ? t.inviteSubject(r.title) : t.reminderSubject(r.title), html);
  if (s.userId && kind === 'INVITE') {
    const user = await prisma.user.findUnique({ where: { id: s.userId }, select: { role: true } });
    if (user) {
      await notifyUser(s.userId, {
        type: 'SIGNATURE_REQUEST',
        title: t.portalTitle,
        body: t.portalBody({ title: r.title }),
        link: portalSignLink(user.role, s.id),
        caseId: r.caseId ?? undefined,
        email: false,
      });
    }
  }
  await logEvent(r.id, kind === 'INVITE' ? 'SENT' : 'REMINDED', { ...meta, signerId: s.id, note: kind === 'INVITE' ? 'invited' : null });
  return token;
};

/** Invites every signer whose turn it is and who has not been invited yet. */
export const inviteActive = async (requestId: string, meta: Meta = {}) => {
  const r = await loadFull(requestId);
  if (!r || r.status !== 'SENT') return;
  for (const s of currentTurn(r.signers, r.order)) {
    if (!s.invitedAt) await deliverLink(r, s, 'INVITE', meta);
  }
};

const notifyCreator = async (r: RequestWithSigners, pick: (t: ReturnType<typeof esignText>) => { title: string; body: string }, email = false) => {
  if (!r.createdBy?.isActive) return;
  const t = pick(esignText(r.createdBy.locale));
  await notifyUser(r.createdBy.id, {
    type: 'SIGNATURE_STATUS',
    title: t.title,
    body: t.body,
    link: `/admin/signatures?open=${r.id}`,
    caseId: r.caseId ?? undefined,
    email,
  });
};

// ─── Create / send ─────────────────────────────────────────────────────

export interface SignerInput {
  role: SignerRole;
  name: string;
  email: string;
  userId?: string | null;
  locale?: Locale | null;
  order?: number | null;
}

export interface CreateInput {
  title: string;
  caseId?: string | null;
  companyId?: string | null;
  message?: string | null;
  expiresAt?: Date | null;
  order: SignatureOrder;
  caseContract?: boolean;
  signers: SignerInput[];
  pdf: Buffer;
  fileName: string;
}

export const createRequest = async (input: CreateInput, actor: Actor, meta: Meta = {}) => {
  if (!input.signers.length) throw badRequest('SIGNERS_REQUIRED');
  if (input.signers.length > MAX_SIGNERS) throw badRequest('TOO_MANY_SIGNERS');
  const emails = input.signers.map((s) => s.email.trim().toLowerCase());
  if (new Set(emails).size !== emails.length) throw badRequest('DUPLICATE_SIGNER');
  if (input.caseContract && !input.caseId) throw badRequest('CASE_REQUIRED');
  if (input.expiresAt && input.expiresAt.getTime() <= Date.now()) throw badRequest('INVALID_EXPIRY');

  let companyId = input.companyId ?? null;
  if (input.caseId) {
    const c = await prisma.case.findUnique({ where: { id: input.caseId }, select: { id: true, companyId: true } });
    if (!c) throw notFound('CASE_NOT_FOUND');
    companyId = companyId ?? c.companyId;
  }
  if (companyId && !(await prisma.company.count({ where: { id: companyId } }))) throw notFound('COMPANY_NOT_FOUND');

  // Resolve portal accounts: an explicit userId must exist; otherwise link by email when an active account has it.
  const resolved = [];
  for (const [i, s] of input.signers.entries()) {
    const email = emails[i];
    let user = s.userId ? await prisma.user.findUnique({ where: { id: s.userId } }) : await prisma.user.findUnique({ where: { email } });
    if (s.userId && (!user || !user.isActive)) throw badRequest('INVALID_SIGNER_USER');
    if (user && !user.isActive) user = null;
    resolved.push({
      role: s.role,
      name: s.name.trim().slice(0, 160),
      email: user?.email ?? email,
      userId: user?.id ?? null,
      locale: (user?.locale ?? s.locale ?? (s.role === 'COMPANY' ? 'de' : s.role === 'CANDIDATE' ? 'az' : 'en')) as Locale,
      order: input.order === 'PARALLEL' ? 1 : Math.max(1, Math.min(99, s.order ?? i + 1)),
    });
  }

  const pages = await inspectPdf(input.pdf);
  const key = await writeStored('orig', '.pdf', input.pdf);
  try {
    const created = await prisma.signatureRequest.create({
      data: {
        title: input.title.trim().slice(0, 200),
        caseId: input.caseId ?? null,
        companyId,
        createdById: actor.id,
        order: input.order,
        isCaseContract: !!input.caseContract,
        originalName: input.fileName.slice(0, 255) || 'document.pdf',
        originalKey: key,
        originalSha256: sha256(input.pdf),
        originalSize: input.pdf.length,
        originalPages: pages,
        message: input.message?.trim() || null,
        expiresAt: input.expiresAt ?? null,
        signers: { create: resolved },
      },
    });
    await logEvent(created.id, 'CREATED', { ...meta, actorId: actor.id, note: fullName(actor) });
    return created;
  } catch (err) {
    await removeStored(key);
    throw err;
  }
};

/** DRAFT → SENT: for the case contract the case moves to CONTRACT_SENT; the first signers are invited. */
export const sendRequest = async (id: string, actor: Actor, meta: Meta = {}) => {
  const r = await loadFull(id);
  if (!r) throw notFound('SIGNATURE_REQUEST_NOT_FOUND');
  if (r.status !== 'DRAFT') throw conflict('INVALID_STATUS');
  const expiresAt = r.expiresAt ?? new Date(Date.now() + DEFAULT_EXPIRY_DAYS * DAY);

  let contractDocId: string | null = null;
  if (r.isCaseContract && r.caseId) {
    // The case keeps its own copy (retention / case views work on case Documents).
    const storedName = await writeStored('contract', '.pdf', await readStored(r.originalKey));
    const doc = await prisma.document.create({
      data: {
        caseId: r.caseId,
        stage: 'CONTRACT',
        originalName: r.originalName,
        storedName,
        mimeType: 'application/pdf',
        size: r.originalSize,
        status: 'PENDING',
        uploadedById: actor.id,
      },
    });
    contractDocId = doc.id;
    try {
      await staffSendContract(r.caseId, actor.id, doc.id, { notify: false, signatureRequestId: r.id });
    } catch (err) {
      await prisma.document.delete({ where: { id: doc.id } }).catch(() => undefined);
      await removeStored(storedName);
      throw err;
    }
  }

  const { count } = await prisma.signatureRequest.updateMany({
    where: { id: r.id, status: 'DRAFT' },
    data: { status: 'SENT', sentAt: new Date(), expiresAt },
  });
  if (!count) throw conflict('INVALID_STATUS');
  await logEvent(r.id, 'SENT', { ...meta, actorId: actor.id, note: contractDocId ? 'case contract' : null });

  if (r.isCaseContract && r.caseId) {
    // A newer contract supersedes any other open contract request of the case.
    const others = await prisma.signatureRequest.findMany({
      where: { caseId: r.caseId, isCaseContract: true, status: { in: ['DRAFT', 'SENT'] }, id: { not: r.id } },
      select: { id: true },
    });
    for (const o of others) await cancelRequest(o.id, actor, 'Superseded by a newer contract', meta);
  }
  await inviteActive(r.id, meta);
  return loadFull(r.id);
};

// ─── Signing ───────────────────────────────────────────────────────────

const loadSigner = async (signerId: string) => {
  const s = await prisma.signatureSigner.findUnique({ where: { id: signerId } });
  if (!s) throw notFound('SIGNER_NOT_FOUND');
  const r = await loadFull(s.requestId);
  if (!r) throw notFound('SIGNER_NOT_FOUND');
  return { s, r };
};

/** Marks a running request as expired when its deadline passed (lazy check on access). */
export const expireIfDue = async (r: Pick<SignatureRequest, 'id' | 'status' | 'expiresAt'>, now = new Date()) => {
  if (!isExpired(r, now)) return false;
  const { count } = await prisma.signatureRequest.updateMany({ where: { id: r.id, status: 'SENT' }, data: { status: 'EXPIRED' } });
  if (count) {
    await logEvent(r.id, 'EXPIRED');
    const full = await loadFull(r.id);
    if (full) await notifyCreator(full, (t) => ({ title: t.expiredTitle, body: t.expiredBody({ title: full.title }) }), true);
  }
  return true;
};

/** Signer may act now: request running, not expired, signer open and in the current step. */
const assertCanAct = async (r: RequestWithSigners, s: SignatureSigner) => {
  if (await expireIfDue(r)) throw conflict('REQUEST_EXPIRED');
  if (r.status !== 'SENT') throw conflict('REQUEST_NOT_ACTIVE');
  if (s.status === 'SIGNED') throw conflict('ALREADY_SIGNED');
  if (s.status === 'DECLINED') throw conflict('ALREADY_DECLINED');
  if (!currentTurn(r.signers, r.order).some((x) => x.id === s.id)) throw conflict('NOT_YOUR_TURN');
};

export const markViewed = async (signerId: string, meta: Meta) => {
  const { count } = await prisma.signatureSigner.updateMany({
    where: { id: signerId, status: 'PENDING' },
    data: { status: 'VIEWED', viewedAt: new Date() },
  });
  if (count) {
    const s = await prisma.signatureSigner.findUniqueOrThrow({ where: { id: signerId }, select: { requestId: true } });
    await logEvent(s.requestId, 'VIEWED', { ...meta, signerId });
  }
};

export interface SignInput {
  mode: 'DRAW' | 'TYPE';
  signature?: string;
  typedName?: string;
}

export const signAsSigner = async (signerId: string, input: SignInput, authMethod: 'EMAIL_OTP' | 'PORTAL', meta: Meta) => {
  const { s, r } = await loadSigner(signerId);
  await assertCanAct(r, s);

  let imageKey: string | null = null;
  let typedName: string | null = null;
  if (input.mode === 'DRAW') {
    if (!input.signature) throw badRequest('SIGNATURE_REQUIRED');
    imageKey = await writeStored('sig', '.png', await decodeSignaturePng(input.signature));
  } else {
    typedName = (input.typedName ?? '').trim();
    if (typedName.length < 2) throw badRequest('TYPED_NAME_REQUIRED');
    typedName = typedName.slice(0, 160);
  }

  const { count } = await prisma.signatureSigner.updateMany({
    where: { id: s.id, status: { in: ['PENDING', 'VIEWED'] } },
    data: {
      status: 'SIGNED',
      signedAt: new Date(),
      viewedAt: s.viewedAt ?? new Date(),
      signatureMode: input.mode,
      signatureImageKey: imageKey,
      typedName,
      authMethod,
      ip: meta.ip?.slice(0, 64) ?? null,
      userAgent: meta.userAgent?.slice(0, 1000) ?? null,
      // the link has done its job: the signing session ends
      sessionHash: null,
      sessionExpiresAt: null,
    },
  });
  if (!count) {
    await removeStored(imageKey);
    throw conflict('ALREADY_SIGNED');
  }
  await logEvent(r.id, 'SIGNED', { ...meta, signerId: s.id, note: `${input.mode}${authMethod === 'PORTAL' ? ' · portal' : ' · email code'}` });
  await afterSignature(r.id, s.id);
  return loadFull(r.id);
};

/** After a signature: complete the request, or invite the next step and tell the creator. */
const afterSignature = async (requestId: string, signerId: string) => {
  const r = await loadFull(requestId);
  if (!r) return;
  const done = r.signers.filter((x) => x.status === 'SIGNED').length;
  if (done === r.signers.length) {
    try {
      await completeRequest(r.id);
    } catch (err) {
      // The job retries the completion; the signature itself is recorded.
      console.error('[esign] completion failed', r.id, err);
    }
    return;
  }
  await inviteActive(r.id);
  const signer = r.signers.find((x) => x.id === signerId);
  await notifyCreator(r, (t) => ({ title: t.signedTitle, body: t.signedBody({ title: r.title, name: signer?.name ?? '', done, total: r.signers.length }) }));
};

export const declineAsSigner = async (signerId: string, reason: string, authMethod: 'EMAIL_OTP' | 'PORTAL', meta: Meta) => {
  const { s, r } = await loadSigner(signerId);
  await assertCanAct(r, s);
  const now = new Date();
  const ok = await prisma.$transaction(async (tx) => {
    const a = await tx.signatureSigner.updateMany({
      where: { id: s.id, status: { in: ['PENDING', 'VIEWED'] } },
      data: { status: 'DECLINED', declinedAt: now, declinedReason: reason, authMethod, ip: meta.ip?.slice(0, 64) ?? null, userAgent: meta.userAgent?.slice(0, 1000) ?? null, sessionHash: null, sessionExpiresAt: null },
    });
    if (!a.count) return false;
    const b = await tx.signatureRequest.updateMany({ where: { id: r.id, status: 'SENT' }, data: { status: 'DECLINED' } });
    if (!b.count) throw conflict('REQUEST_NOT_ACTIVE');
    await logEvent(r.id, 'DECLINED', { ...meta, signerId: s.id, note: reason }, tx);
    return true;
  });
  if (!ok) throw conflict('ALREADY_DECLINED');

  const full = (await loadFull(r.id))!;
  await notifyCreator(full, (t) => ({ title: t.declinedTitle, body: t.declinedBody({ title: r.title, name: s.name, reason }) }), true);
  await mailClosed(full, (x) => x.id !== s.id);
  return full;
};

/** Tells invited signers who still had something to do that the request is closed. */
const mailClosed = async (r: RequestWithSigners, filter: (s: SignatureSigner) => boolean = () => true) => {
  for (const s of r.signers) {
    if (!s.invitedAt || s.status === 'DECLINED' || !filter(s)) continue;
    const t = esignText(s.locale);
    void sendMail(s.email, t.closedSubject(r.title), renderEmail(t.closedTitle, t.closedBody({ title: r.title })));
  }
};

// ─── Staff actions ─────────────────────────────────────────────────────

export const cancelRequest = async (id: string, actor: Actor, reason: string | null, meta: Meta = {}) => {
  const { count } = await prisma.signatureRequest.updateMany({
    where: { id, status: { in: ['DRAFT', 'SENT'] } },
    data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason },
  });
  if (!count) {
    if (!(await prisma.signatureRequest.count({ where: { id } }))) throw notFound('SIGNATURE_REQUEST_NOT_FOUND');
    throw conflict('INVALID_STATUS');
  }
  await logEvent(id, 'CANCELLED', { ...meta, actorId: actor.id, note: reason });
  const r = (await loadFull(id))!;
  await mailClosed(r, (s) => s.status !== 'SIGNED');
  return r;
};

/** New link by email for the given (or every) signer whose turn it is. */
export const remindRequest = async (id: string, actor: Actor, signerId: string | null, meta: Meta = {}) => {
  const r = await loadFull(id);
  if (!r) throw notFound('SIGNATURE_REQUEST_NOT_FOUND');
  if (await expireIfDue(r)) throw conflict('REQUEST_EXPIRED');
  if (r.status !== 'SENT') throw conflict('INVALID_STATUS');
  const turn = currentTurn(r.signers, r.order);
  const targets = signerId ? turn.filter((s) => s.id === signerId) : turn;
  if (signerId && !targets.length) {
    if (!r.signers.some((s) => s.id === signerId)) throw notFound('SIGNER_NOT_FOUND');
    throw conflict('NOT_YOUR_TURN');
  }
  for (const s of targets) await deliverLink(r, s, s.invitedAt ? 'REMIND' : 'INVITE', { ...meta, actorId: actor.id });
  return { reminded: targets.length };
};

/** Corrects a signer's email (no portal account, not signed yet). The next link goes to the new address. */
export const updateSignerEmail = async (id: string, signerId: string, email: string) => {
  const s = await prisma.signatureSigner.findUnique({ where: { id: signerId } });
  if (!s || s.requestId !== id) throw notFound('SIGNER_NOT_FOUND');
  if (s.userId) throw conflict('SIGNER_HAS_ACCOUNT');
  if (!open(s)) throw conflict('INVALID_STATUS');
  const clash = await prisma.signatureSigner.count({ where: { requestId: id, email, id: { not: s.id } } });
  if (clash) throw badRequest('DUPLICATE_SIGNER');
  await prisma.signatureSigner.update({ where: { id: s.id }, data: { email, tokenHash: null, sessionHash: null, sessionExpiresAt: null, otpHash: null } });
};

// ─── Completion ────────────────────────────────────────────────────────

const safeFileBase = (title: string) =>
  title
    .normalize('NFKD')
    .replace(/[^\w\s.-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'document';

/**
 * Builds and stores the final PDF, emails it, files it on the case and — for the employment
 * contract — runs the same case transition as the single-signer flow. Safe to call twice:
 * only the call that claims the request (finalKey still empty) does the work.
 */
export const completeRequest = async (id: string) => {
  const r = await loadFull(id);
  if (!r || r.status !== 'SENT' || r.finalKey) return null;
  if (r.signers.some((s) => s.status !== 'SIGNED')) return null;
  const completedAt = new Date();
  const claimed = await prisma.signatureRequest.updateMany({ where: { id, status: 'SENT', finalKey: null }, data: { status: 'COMPLETED', completedAt } });
  if (!claimed.count) return null;

  let finalKey: string | null = null;
  let built: Awaited<ReturnType<typeof buildFinalPdf>>;
  const completedEvent = await logEvent(id, 'COMPLETED');
  try {
    const events = await prisma.signatureEvent.findMany({ where: { requestId: id }, orderBy: [{ at: 'asc' }, { id: 'asc' }] });
    const actorIds = [...new Set(events.map((e) => e.actorId).filter((x): x is string => !!x))];
    const actors = new Map((await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, firstName: true, lastName: true, email: true } })).map((u) => [u.id, u]));
    const byId = new Map(r.signers.map((s) => [s.id, s]));
    const signers = [];
    for (const s of r.signers) {
      signers.push({
        name: s.name,
        email: s.email,
        role: s.role,
        order: s.order,
        signedAt: s.signedAt,
        mode: (s.signatureMode === 'TYPE' ? 'TYPE' : 'DRAW') as 'DRAW' | 'TYPE',
        imagePng: s.signatureImageKey ? await readStored(s.signatureImageKey).catch(() => null) : null,
        typedName: s.typedName ?? (s.signatureImageKey ? null : s.name),
        authMethod: s.authMethod,
        ip: s.ip,
        userAgent: s.userAgent,
      });
    }
    built = await buildFinalPdf({
      original: await readStored(r.originalKey),
      requestId: r.id,
      title: r.title,
      originalName: r.originalName,
      originalSha256: r.originalSha256,
      createdAt: r.createdAt,
      sentAt: r.sentAt,
      completedAt,
      order: r.order,
      signers,
      events: events.map((e) => {
        const signer = e.signerId ? byId.get(e.signerId) : undefined;
        const actor = e.actorId ? actors.get(e.actorId) : undefined;
        return {
          at: e.at,
          type: e.type,
          who: signer ? signer.name : actor ? `${fullName(actor)} (Triad Vision)` : 'System',
          email: signer?.email ?? actor?.email ?? null,
          ip: e.ip,
          userAgent: e.userAgent,
        };
      }),
    });
    finalKey = await writeStored('final', '.pdf', built.pdf);
    await prisma.signatureRequest.update({ where: { id }, data: { finalKey, finalSha256: built.sha256, finalSize: built.pdf.length } });
  } catch (err) {
    // Give the request back so the job can retry.
    await removeStored(finalKey);
    await prisma.signatureEvent.delete({ where: { id: completedEvent.id } }).catch(() => undefined);
    await prisma.signatureRequest.update({ where: { id }, data: { status: 'SENT', completedAt: null, finalKey: null, finalSha256: null, finalSize: null } });
    throw err;
  }
  try {
    await afterCompletion(r, built);
  } catch (err) {
    // The final PDF is stored; a failing follow-up (mail, notification) must not undo the completion.
    console.error('[esign] post-completion step failed', id, err);
  }
  return built;
};

const afterCompletion = async (r: RequestWithSigners, built: { pdf: Buffer; sha256: string }) => {
  const id = r.id;
  {
    // Case: keep a copy as a case Document; the employment contract also moves the case on.
    if (r.caseId) {
      const c = await prisma.case.findUnique({ where: { id: r.caseId }, include: { contract: true } });
      if (c) {
        const storedName = await writeStored('case', '.pdf', built.pdf);
        const version = c.contract?.version ?? 1;
        const doc = await prisma.document.create({
          data: {
            caseId: c.id,
            stage: 'CONTRACT_SIGNED',
            originalName: r.isCaseContract ? `${c.number}-contract-signed-v${version}.pdf` : `${c.number}-${safeFileBase(r.title)}-signed.pdf`,
            storedName,
            mimeType: 'application/pdf',
            size: built.pdf.length,
            uploadedById: r.createdById ?? c.clientId,
          },
        });
        await prisma.signatureRequest.update({ where: { id }, data: { finalDocumentId: doc.id } });
        if (r.isCaseContract && c.contract?.signatureRequestId === r.id) {
          const candidate = r.signers.find((s) => s.role === 'CANDIDATE' && s.userId === c.clientId) ?? r.signers.find((s) => s.role === 'CANDIDATE') ?? r.signers[0];
          try {
            await clientSignContract(c.id, c.clientId, {
              signerName: candidate.name,
              signedDocumentId: doc.id,
              ip: candidate.ip ?? 'unknown',
              userAgent: candidate.userAgent ?? 'unknown',
            });
          } catch (err) {
            // e.g. staff moved the case meanwhile: the signed PDF is still filed on the case.
            console.warn('[esign] case contract transition skipped', c.id, (err as Error).message);
          }
        }
      }
    }

    // Everyone gets the signed PDF.
    const attachment = { filename: `${safeFileBase(r.title)}-signed.pdf`, content: built.pdf, contentType: 'application/pdf' };
    const recipients = new Map<string, Locale>();
    for (const s of r.signers) recipients.set(s.email.toLowerCase(), s.locale);
    if (r.createdBy?.isActive && !recipients.has(r.createdBy.email.toLowerCase())) recipients.set(r.createdBy.email.toLowerCase(), r.createdBy.locale);
    for (const [email, locale] of recipients) {
      const t = esignText(locale);
      void sendMail(email, t.completedSubject(r.title), renderEmail(t.completedTitle, `${t.completedBody({ title: r.title, sha: built.sha256 })}\n\n${t.legalNote}`), [attachment]);
    }
    for (const s of r.signers) {
      if (!s.userId) continue;
      const user = await prisma.user.findUnique({ where: { id: s.userId }, select: { role: true } });
      if (!user) continue;
      const t = esignText(s.locale);
      await notifyUser(s.userId, { type: 'SIGNATURE_COMPLETED', title: t.completedTitle, body: t.completedBody({ title: r.title, sha: built.sha256 }), link: portalSignLink(user.role, s.id), caseId: r.caseId ?? undefined, email: false });
    }
    await notifyCreator(r, (t) => ({ title: t.completedTitle, body: t.completedBody({ title: r.title, sha: built.sha256 }) }));
  }
};

// ─── Views ─────────────────────────────────────────────────────────────

/** What a signer sees: names and statuses of the other parties only (no emails / IPs). */
export const signerView = async (signerId: string, auth: { method: 'token' | 'portal'; verified: boolean }) => {
  const { s, r } = await loadSigner(signerId);
  await expireIfDue(r);
  const fresh = (await loadFull(r.id))!;
  const me = fresh.signers.find((x) => x.id === s.id)!;
  const turn = currentTurn(fresh.signers, fresh.order);
  const [caseRow, company] = await Promise.all([
    fresh.caseId ? prisma.case.findUnique({ where: { id: fresh.caseId }, select: { id: true, number: true } }) : null,
    fresh.companyId ? prisma.company.findUnique({ where: { id: fresh.companyId }, select: { name: true } }) : null,
  ]);
  return {
    request: {
      id: fresh.id,
      title: fresh.title,
      message: fresh.message,
      status: fresh.status,
      order: fresh.order,
      expiresAt: fresh.expiresAt,
      completedAt: fresh.completedAt,
      originalName: fresh.originalName,
      pages: fresh.originalPages,
      originalSha256: fresh.originalSha256,
      finalSha256: fresh.status === 'COMPLETED' ? fresh.finalSha256 : null,
      hasFinal: fresh.status === 'COMPLETED' && !!fresh.finalKey,
      sender: fullName(fresh.createdBy),
      case: caseRow ? { number: caseRow.number } : null,
      company: company ? { name: company.name } : null,
    },
    me: {
      id: me.id,
      name: me.name,
      role: me.role,
      status: me.status,
      email: maskEmail(me.email),
      signedAt: me.signedAt,
      declinedReason: me.declinedReason,
      myTurn: fresh.status === 'SENT' && turn.some((x) => x.id === me.id),
    },
    signers: fresh.signers.map((x) => ({ id: x.id, name: x.name, role: x.role, order: x.order, status: x.status, signedAt: x.signedAt, isMe: x.id === me.id })),
    auth: { method: auth.method, otpRequired: auth.method === 'token', verified: auth.verified },
  };
};

const staffSigner = (s: SignatureSigner) => ({
  id: s.id,
  role: s.role,
  name: s.name,
  email: s.email,
  userId: s.userId,
  locale: s.locale,
  order: s.order,
  status: s.status,
  invitedAt: s.invitedAt,
  viewedAt: s.viewedAt,
  signedAt: s.signedAt,
  declinedAt: s.declinedAt,
  declinedReason: s.declinedReason,
  signatureMode: s.signatureMode,
  authMethod: s.authMethod,
  otpVerifiedAt: s.otpVerifiedAt,
  ip: s.ip,
  userAgent: s.userAgent,
});

export const staffSummary = (
  r: SignatureRequest & {
    signers: SignatureSigner[];
    case?: { id: string; number: string } | null;
    company?: { id: string; name: string } | null;
    createdBy?: { id: string; firstName: string; lastName: string } | null;
  },
) => ({
  id: r.id,
  title: r.title,
  status: r.status,
  order: r.order,
  isCaseContract: r.isCaseContract,
  case: r.case ? { id: r.case.id, number: r.case.number } : null,
  company: r.company ? { id: r.company.id, name: r.company.name } : null,
  createdBy: r.createdBy ? { id: r.createdBy.id, name: fullName(r.createdBy) } : null,
  originalName: r.originalName,
  originalSha256: r.originalSha256,
  originalSize: r.originalSize,
  originalPages: r.originalPages,
  finalSha256: r.finalSha256,
  finalSize: r.finalSize,
  hasFinal: !!r.finalKey,
  message: r.message,
  expiresAt: r.expiresAt,
  sentAt: r.sentAt,
  completedAt: r.completedAt,
  cancelledAt: r.cancelledAt,
  cancelReason: r.cancelReason,
  createdAt: r.createdAt,
  currentTurn: r.status === 'SENT' ? currentTurn(r.signers, r.order).map((s) => s.id) : [],
  signers: [...r.signers].sort((a, b) => a.order - b.order || a.createdAt.getTime() - b.createdAt.getTime()).map(staffSigner),
});

export const staffDetail = async (id: string) => {
  const head = await prisma.signatureRequest.findUnique({ where: { id }, select: { id: true, status: true, expiresAt: true } });
  if (!head) throw notFound('SIGNATURE_REQUEST_NOT_FOUND');
  await expireIfDue(head);
  const r = await prisma.signatureRequest.findUnique({
    where: { id },
    include: {
      signers: true,
      case: { select: { id: true, number: true } },
      company: { select: { id: true, name: true } },
      createdBy: { select: { id: true, firstName: true, lastName: true } },
      events: { orderBy: [{ at: 'asc' }, { id: 'asc' }] },
    },
  });
  if (!r) throw notFound('SIGNATURE_REQUEST_NOT_FOUND');
  const actorIds = [...new Set(r.events.map((e) => e.actorId).filter((x): x is string => !!x))];
  const actors = new Map((await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, firstName: true, lastName: true } })).map((u) => [u.id, fullName(u)]));
  const names = new Map(r.signers.map((s) => [s.id, s.name]));
  return {
    ...staffSummary(r),
    events: r.events.map((e) => ({
      id: e.id,
      type: e.type,
      at: e.at,
      note: e.note,
      ip: e.ip,
      userAgent: e.userAgent,
      signer: e.signerId ? { id: e.signerId, name: names.get(e.signerId) ?? '' } : null,
      actor: e.actorId ? { id: e.actorId, name: actors.get(e.actorId) ?? '' } : null,
    })),
  };
};

// ─── Jobs ──────────────────────────────────────────────────────────────

export const REMINDER_DAYS = [3, 7] as const;

const claimKey = async (key: string, now: Date) => {
  try {
    await prisma.reminderLog.create({ data: { key: key.slice(0, 191), sentAt: now } });
    return true;
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') return false;
    throw err;
  }
};

/**
 * Expires overdue requests, reminds pending signers 3 and 7 days after their invitation and
 * retries completions that failed. `now` is injectable for tests.
 */
export const runSignatureJobs = async (now = new Date()) => {
  const result = { expired: 0, reminded: 0, completed: 0 };
  const due = await prisma.signatureRequest.findMany({ where: { status: 'SENT', expiresAt: { lte: now } }, select: { id: true, status: true, expiresAt: true } });
  for (const r of due) if (await expireIfDue(r, now)) result.expired++;

  const running = await prisma.signatureRequest.findMany({
    where: { status: 'SENT' },
    include: {
      signers: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] },
      createdBy: { select: { id: true, firstName: true, lastName: true, email: true, locale: true, role: true, isActive: true } },
    },
  });
  for (const r of running) {
    if (r.signers.length && r.signers.every((s) => s.status === 'SIGNED')) {
      if (await completeRequest(r.id).catch((err) => console.error('[esign] retry completion failed', r.id, err))) result.completed++;
      continue;
    }
    for (const s of currentTurn(r.signers, r.order)) {
      if (!s.invitedAt) continue;
      const age = now.getTime() - s.invitedAt.getTime();
      const step = [...REMINDER_DAYS].reverse().find((d) => age >= d * DAY);
      if (!step) continue;
      const base = `esign-remind:${s.id}:${s.invitedAt.toISOString()}`;
      if (!(await claimKey(`${base}:${step}`, now))) continue;
      // A later reminder also covers the earlier one (e.g. after downtime): never send both.
      for (const d of REMINDER_DAYS) if (d < step) await claimKey(`${base}:${d}`, now);
      await deliverLink(r, s, 'REMIND');
      result.reminded++;
    }
  }
  return result;
};
