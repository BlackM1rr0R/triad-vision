import { z } from 'zod';
import type { Locale, Role, SignerStatus } from '@prisma/client';
import { prisma } from '../../db.js';
import { badRequest, conflict, forbidden, notFound } from '../http.js';
import { hasMinRole } from '../../middleware/auth.js';
import { notifyUser } from '../notifications.js';
import type { Actor, Meta, SignInput, SignerInput } from './service.js';

/**
 * Countersignature of service contracts by Triad Vision (Setting `esignCountersign`).
 *
 *  - Admins mark ADMIN+ users as "authorised signatories" and pick a default signer.
 *  - Service contracts — package order contracts (lib/billing/packages.ts) and case contracts (service contract
 *    templates / signature requests marked as the case contract) — get the default signer appended as a STAFF
 *    signer AFTER the client (sequential: client → Triad Vision), unless the request already has a STAFF signer.
 *  - Once every other party has signed, the request waits for the countersignature: its deadline is extended
 *    (COUNTERSIGN_EXTEND_DAYS) so it cannot expire on Triad Vision's side, staff see it under "to countersign"
 *    (my-work + Admin › Countersign), and any authorised signatory can countersign with one click (drawn or typed
 *    signature); the signer row is then handed over to that person (audit event). The final PDF (signature page +
 *    certificate with the audit trail) is built as usual when the last signature arrives — it carries both.
 *  - Package orders are activated at the CLIENT's signature (account, case, payment plan, first invoice — the
 *    client is not kept waiting); the contract shows as "pending countersignature" until Triad Vision signs.
 *    Case contracts move the case to CONTRACT_SIGNED at completion (after the countersignature), as before,
 *    because that step files the final signed PDF on the case.
 *  - Reminders: every `reminderDays` (default 2) days while a countersignature is pending, the assigned signer
 *    (e-mail + in-app) and the other authorised signatories (in-app) are reminded (hourly e-sign job).
 *  - Without an authorised signatory / with the feature off nothing changes (no extra signer is added).
 */

export const COUNTERSIGN_KEY = 'esignCountersign';
export const COUNTERSIGN_EXTEND_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

export const countersignSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  signatoryIds: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  defaultSignerId: z.string().trim().max(40).nullable().default(null),
  packageOrders: z.boolean().default(true),
  caseContracts: z.boolean().default(true),
  reminderDays: z.coerce.number().int().min(1).max(14).default(2),
});
export type CountersignSettings = z.infer<typeof countersignSettingsSchema>;
export const COUNTERSIGN_DEFAULTS: CountersignSettings = countersignSettingsSchema.parse({});

export const getCountersignSettings = async (): Promise<CountersignSettings> => {
  const row = await prisma.setting.findUnique({ where: { key: COUNTERSIGN_KEY } });
  const parsed = countersignSettingsSchema.safeParse(row?.value ?? {});
  return parsed.success ? parsed.data : COUNTERSIGN_DEFAULTS;
};

/** Saves the settings: signatories must be active ADMIN+ users; the default signer must be one of them. */
export const saveCountersignSettings = async (input: unknown) => {
  const parsed = countersignSettingsSchema.safeParse(input);
  if (!parsed.success) throw badRequest('VALIDATION_ERROR');
  const v = parsed.data;
  const ids = [...new Set(v.signatoryIds)];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, role: true, isActive: true } }) : [];
  if (users.length !== ids.length || users.some((u) => !u.isActive || !hasMinRole(u.role, 'ADMIN'))) throw badRequest('SIGNATORY_NOT_ADMIN');
  const defaultSignerId = v.defaultSignerId && ids.includes(v.defaultSignerId) ? v.defaultSignerId : (ids[0] ?? null);
  if (v.enabled && !defaultSignerId) throw badRequest('SIGNATORY_REQUIRED');
  const value: CountersignSettings = { ...v, signatoryIds: ids, defaultSignerId };
  await prisma.setting.upsert({ where: { key: COUNTERSIGN_KEY }, create: { key: COUNTERSIGN_KEY, value }, update: { value } });
  return value;
};

export const isAuthorisedSignatory = (user: { id: string; role: Role }, s: CountersignSettings) => hasMinRole(user.role, 'ADMIN') && s.signatoryIds.includes(user.id);

type SignerLite = { role: string; status: SignerStatus | string };
const isOpen = (s: SignerLite) => s.status === 'PENDING' || s.status === 'VIEWED';

/** Every non-Triad-Vision party has signed and a STAFF signer is still open ("pending countersignature"). */
export const awaitingCountersign = (signers: SignerLite[]) => {
  const others = signers.filter((s) => s.role !== 'STAFF');
  return others.length > 0 && others.every((s) => s.status === 'SIGNED') && signers.some((s) => s.role === 'STAFF' && isOpen(s));
};

/** The default signer's account when the feature applies to this kind of contract (else null). */
export const defaultCountersigner = async (kind: 'PACKAGE' | 'CASE_CONTRACT') => {
  const s = await getCountersignSettings();
  if (!s.enabled || (kind === 'PACKAGE' && !s.packageOrders) || (kind === 'CASE_CONTRACT' && !s.caseContracts)) return null;
  const candidates = [s.defaultSignerId, ...s.signatoryIds].filter((x): x is string => !!x);
  for (const id of candidates) {
    const u = await prisma.user.findUnique({ where: { id }, select: { id: true, firstName: true, lastName: true, email: true, locale: true, role: true, isActive: true } });
    if (u?.isActive && hasMinRole(u.role, 'ADMIN')) return u;
  }
  return null;
};

/**
 * Appends the default authorised signatory as the last (STAFF) signer. Unchanged when the feature is off for
 * this kind, nobody is configured, a STAFF signer is already present or the signer's e-mail is already a party.
 */
export const withCountersigner = async (signers: SignerInput[], kind: 'PACKAGE' | 'CASE_CONTRACT'): Promise<SignerInput[]> => {
  if (signers.some((s) => s.role === 'STAFF')) return signers;
  const u = await defaultCountersigner(kind);
  if (!u) return signers;
  if (signers.some((s) => s.email.trim().toLowerCase() === u.email.toLowerCase())) return signers;
  const last = Math.max(1, ...signers.map((s, i) => s.order ?? i + 1));
  return [...signers, { role: 'STAFF', name: `${u.firstName} ${u.lastName}`.trim(), email: u.email, userId: u.id, locale: u.locale as Locale, order: Math.min(99, last + 1) }];
};

/**
 * After a signature (esign service): when only the countersignature is missing, the deadline is extended so the
 * request cannot expire on Triad Vision's side, and the package order hook runs (activation at client signature).
 */
export const onClientPartSigned = async (requestId: string) => {
  try {
    const r = await prisma.signatureRequest.findUnique({ where: { id: requestId }, select: { id: true, status: true, expiresAt: true, signers: { select: { role: true, status: true } } } });
    if (!r || r.status !== 'SENT' || !awaitingCountersign(r.signers)) return false;
    const until = new Date(Date.now() + COUNTERSIGN_EXTEND_DAYS * DAY);
    if (!r.expiresAt || r.expiresAt < until) await prisma.signatureRequest.updateMany({ where: { id: r.id, status: 'SENT' }, data: { expiresAt: until } });
    await (await import('../billing/packages.js')).onSignatureCompleted(r.id);
    return true;
  } catch (err) {
    console.error('[esign] countersign hook failed', requestId, err);
    return false;
  }
};

// ─── Pending list ────────────────────────────────────────────────────

/** Requests waiting for a Triad Vision countersignature, oldest first. */
export const pendingCountersignatures = async (viewer: { id: string; role: Role }) => {
  const s = await getCountersignSettings();
  const now = new Date();
  const rows = await prisma.signatureRequest.findMany({
    where: { status: 'SENT', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }], signers: { some: { role: 'STAFF', status: { in: ['PENDING', 'VIEWED'] } } } },
    select: {
      id: true,
      title: true,
      isCaseContract: true,
      sentAt: true,
      expiresAt: true,
      case: { select: { id: true, number: true } },
      signers: { select: { id: true, role: true, status: true, name: true, userId: true, signedAt: true, order: true }, orderBy: { order: 'asc' } },
    },
    orderBy: { sentAt: 'asc' },
    take: 300,
  });
  const orders = await prisma.packageOrder.findMany({ where: { signatureRequestId: { in: rows.map((r) => r.id) } }, select: { id: true, signatureRequestId: true, status: true } });
  const orderOf = new Map(orders.map((o) => [o.signatureRequestId, o]));
  const canSignAny = isAuthorisedSignatory(viewer, s);
  return rows
    .filter((r) => awaitingCountersign(r.signers))
    .map((r) => {
      const staff = r.signers.find((x) => x.role === 'STAFF' && isOpen(x))!;
      const others = r.signers.filter((x) => x.role !== 'STAFF');
      const since = others.reduce<Date | null>((m, x) => (x.signedAt && (!m || x.signedAt > m) ? x.signedAt : m), null) ?? r.sentAt ?? now;
      const order = orderOf.get(r.id);
      return {
        requestId: r.id,
        signerId: staff.id,
        title: r.title,
        kind: order ? ('PACKAGE' as const) : r.isCaseContract ? ('CASE_CONTRACT' as const) : ('OTHER' as const),
        packageOrderId: order?.id ?? null,
        packageOrderStatus: order?.status ?? null,
        case: r.case,
        clientSigners: others.map((x) => ({ name: x.name, role: x.role, signedAt: x.signedAt })),
        assignedTo: { userId: staff.userId, name: staff.name },
        mine: staff.userId === viewer.id,
        canSign: staff.userId === viewer.id || canSignAny,
        since,
        waitingDays: Math.floor((now.getTime() - since.getTime()) / DAY),
        overdue: now.getTime() - since.getTime() >= s.reminderDays * DAY,
        expiresAt: r.expiresAt,
      };
    });
};

// ─── One-click countersignature ──────────────────────────────────────

/**
 * Countersigns as the acting staff member. The designated signer may always sign; any other authorised signatory
 * takes the signer row over first (name / e-mail / account change, recorded in the audit trail).
 */
export const countersign = async (signerId: string, actor: Actor & { email: string }, input: SignInput, meta: Meta) => {
  const svc = await import('./service.js');
  const s = await prisma.signatureSigner.findUnique({ where: { id: signerId }, include: { request: { select: { id: true, status: true, order: true, signers: { select: { id: true, role: true, status: true, order: true, email: true } } } } } });
  if (!s) throw notFound('SIGNER_NOT_FOUND');
  if (s.role !== 'STAFF') throw badRequest('NOT_A_COUNTERSIGNATURE');
  if (s.request.status !== 'SENT') throw conflict('REQUEST_NOT_ACTIVE');
  if (!awaitingCountersign(s.request.signers)) throw conflict('NOT_YOUR_TURN');
  if (s.userId !== actor.id) {
    const settings = await getCountersignSettings();
    if (!isAuthorisedSignatory(actor, settings)) throw forbidden('NOT_AUTHORISED_SIGNATORY');
    if (s.request.signers.some((x) => x.id !== s.id && x.email.toLowerCase() === actor.email.toLowerCase())) throw conflict('DUPLICATE_SIGNER');
    const name = `${actor.firstName} ${actor.lastName}`.trim();
    const { count } = await prisma.signatureSigner.updateMany({
      where: { id: s.id, status: { in: ['PENDING', 'VIEWED'] } },
      data: { userId: actor.id, name: name.slice(0, 160), email: actor.email, tokenHash: null, sessionHash: null, sessionExpiresAt: null, otpHash: null },
    });
    if (!count) throw conflict('ALREADY_SIGNED');
    await svc.logEvent(s.requestId, 'VIEWED', { ...meta, actorId: actor.id, signerId: s.id, note: `countersignature taken over from ${s.name}` });
  }
  await svc.signAsSigner(s.id, input, 'PORTAL', { ...meta, actorId: actor.id });
  return svc.staffDetail(s.requestId);
};

// ─── Reminders ───────────────────────────────────────────────────────

const REMIND: Record<Locale, { title: string; body: (title: string, days: number) => string }> = {
  az: { title: 'Müqavilə Triad Vision imzasını gözləyir', body: (t, d) => `«${t}» müştəri tərəfindən imzalanıb və ${d} gündür Triad Vision-un ikinci imzasını gözləyir.` },
  de: { title: 'Vertrag wartet auf die Gegenzeichnung', body: (t, d) => `„${t}“ wurde vom Kunden unterschrieben und wartet seit ${d} Tagen auf die Gegenzeichnung durch Triad Vision.` },
  en: { title: 'Contract waiting for countersignature', body: (t, d) => `"${t}" was signed by the client and has been waiting ${d} days for the Triad Vision countersignature.` },
  ru: { title: 'Договор ждёт второй подписи', body: (t, d) => `«${t}» подписан клиентом и ${d} дн. ждёт подписи Triad Vision.` },
};

const claim = async (key: string) => {
  try {
    await prisma.reminderLog.create({ data: { key: key.slice(0, 191) } });
    return true;
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') return false;
    throw err;
  }
};

/** Every `reminderDays` while pending: the assigned signer (e-mail + in-app) and the other signatories (in-app). */
export const runCountersignReminders = async (now = new Date()) => {
  const s = await getCountersignSettings();
  const pending = await pendingCountersignatures({ id: '', role: 'SUPER_ADMIN' });
  let reminded = 0;
  for (const p of pending) {
    const age = now.getTime() - new Date(p.since).getTime();
    const period = Math.floor(age / (s.reminderDays * DAY));
    if (period < 1) continue;
    if (!(await claim(`countersign-remind:${p.signerId}:${period}`))) continue;
    const days = Math.floor(age / DAY);
    const recipients = new Set<string>([...(p.assignedTo.userId ? [p.assignedTo.userId] : []), ...s.signatoryIds]);
    const users = await prisma.user.findMany({ where: { id: { in: [...recipients] }, isActive: true }, select: { id: true, locale: true } });
    for (const u of users) {
      const t = REMIND[u.locale] ?? REMIND.de;
      await notifyUser(u.id, { type: 'COUNTERSIGN_PENDING', title: t.title, body: t.body(p.title, days), link: '/admin/countersign', caseId: p.case?.id, email: u.id === p.assignedTo.userId }).catch(() => undefined);
    }
    reminded++;
  }
  return reminded;
};
