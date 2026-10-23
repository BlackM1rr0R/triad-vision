import type { Call, CallOutcome, CallStatus, Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { badRequest, conflict, HttpError, notFound } from '../http.js';
import { normalizePhone } from '../messaging/providers.js';
import { publish } from '../messaging/realtime.js';
import { staffIds } from '../workspace/team.js';
import { providerFor, type CallEvent } from './providers/index.js';
import { getCallsSettings, providerReady } from './settings.js';
import { callTexts } from './texts.js';

/**
 * Call log + click-to-call. A call row is created before the provider is asked, so every attempt is logged;
 * provider webhooks (routes/callWebhooks.ts) move it through RINGING_STAFF → RINGING → IN_PROGRESS → COMPLETED
 * (or BUSY / NO_ANSWER / FAILED / CANCELED). Realtime: `call.updated` to the staff member of the call.
 */

export const FINAL: CallStatus[] = ['COMPLETED', 'BUSY', 'NO_ANSWER', 'FAILED', 'CANCELED'];

// ─── Phone matching ────────────────────────────────────────────────────

/** Normalised E.164 or null. */
export const normPhone = (raw: string | null | undefined) => normalizePhone(raw ?? '');

/** Same number? Exact E.164, or the last 9 digits when one side was stored without a country code. */
export const samePhone = (a: string | null | undefined, b: string | null | undefined) => {
  const x = normPhone(a);
  const y = normPhone(b);
  if (!x || !y) return false;
  return x === y || (x.length >= 10 && y.length >= 10 && x.slice(-9) === y.slice(-9));
};

/** Finds the client (latest open case) or the latest inquiry behind a phone number. */
export const matchPhone = async (raw: string) => {
  const n = normPhone(raw);
  if (!n) return { clientId: null, caseId: null, inquiryId: null };
  // Stored numbers are free text ("+994 (50) 765-43-21"): compare digits only (MySQL 8 REGEXP_REPLACE).
  const like = `%${n.slice(-7)}`;
  const users = await prisma.$queryRaw<{ id: string; phone: string | null; role: string }[]>`
    SELECT id, phone, role FROM \`User\`
    WHERE phone IS NOT NULL AND mergedIntoId IS NULL AND REGEXP_REPLACE(phone, '[^0-9]', '') LIKE ${like}
    LIMIT 50`;
  const user = users.filter((u) => samePhone(u.phone, n)).sort((a, b) => (a.role === 'CLIENT' ? -1 : 0) - (b.role === 'CLIENT' ? -1 : 0))[0];
  let caseId: string | null = null;
  if (user) {
    const c = await prisma.case.findFirst({ where: { clientId: user.id }, orderBy: [{ updatedAt: 'desc' }], select: { id: true } });
    caseId = c?.id ?? null;
  }
  let inquiryId: string | null = null;
  if (!user) {
    const qs = await prisma.$queryRaw<{ id: string; phone: string | null }[]>`
      SELECT id, phone FROM Inquiry
      WHERE phone IS NOT NULL AND REGEXP_REPLACE(phone, '[^0-9]', '') LIKE ${like}
      ORDER BY createdAt DESC LIMIT 20`;
    inquiryId = qs.find((q) => samePhone(q.phone, n))?.id ?? null;
  }
  return { clientId: user?.id ?? null, caseId, inquiryId };
};

// ─── DTO ───────────────────────────────────────────────────────────────

const personSelect = { id: true, firstName: true, lastName: true } as const;

export const toDto = async (rows: Call[]) => {
  const userIds = [...new Set(rows.flatMap((r) => [r.staffId, r.clientId]).filter((x): x is string => !!x))];
  const caseIds = [...new Set(rows.map((r) => r.caseId).filter((x): x is string => !!x))];
  const inquiryIds = [...new Set(rows.map((r) => r.inquiryId).filter((x): x is string => !!x))];
  const [users, cases, inquiries] = await Promise.all([
    userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: personSelect }) : [],
    caseIds.length ? prisma.case.findMany({ where: { id: { in: caseIds } }, select: { id: true, number: true } }) : [],
    inquiryIds.length ? prisma.inquiry.findMany({ where: { id: { in: inquiryIds } }, select: { id: true, contactName: true } }) : [],
  ]);
  const u = new Map(users.map((x) => [x.id, x]));
  const c = new Map(cases.map((x) => [x.id, x]));
  const q = new Map(inquiries.map((x) => [x.id, x]));
  return rows.map((r) => ({
    id: r.id,
    provider: r.provider,
    direction: r.direction,
    from: r.fromNumber,
    to: r.toNumber,
    status: r.status,
    startedAt: r.startedAt,
    answeredAt: r.answeredAt,
    endedAt: r.endedAt,
    durationSec: r.durationSec,
    recorded: r.recorded,
    hasRecording: !!r.recordingKey,
    transcript: r.transcript,
    summary: r.summary,
    followUps: (r.followUps as { title: string; dueInDays: number | null }[] | null) ?? [],
    outcome: r.outcome,
    note: r.note,
    staff: r.staffId ? (u.get(r.staffId) ?? null) : null,
    client: r.clientId ? (u.get(r.clientId) ?? null) : null,
    case: r.caseId ? (c.get(r.caseId) ?? null) : null,
    inquiry: r.inquiryId ? (q.get(r.inquiryId) ?? null) : null,
    callbackId: r.callbackId,
    liveChatId: r.liveChatId,
  }));
};
export type CallDto = Awaited<ReturnType<typeof toDto>>[number];

const notify = async (call: Call) => {
  const [dto] = await toDto([call]);
  if (call.staffId) publish(call.staffId, 'call.updated', { call: dto as unknown as Record<string, unknown> });
  return dto;
};

// ─── Click-to-call ─────────────────────────────────────────────────────

export interface CallTarget {
  clientId?: string;
  caseId?: string;
  inquiryId?: string;
  callbackId?: string;
  liveChatId?: string;
  phone?: string;
}

/** Fills in the number and the links (client ↔ case, inquiry, callback) of a call target. */
export const resolveTarget = async (t: CallTarget) => {
  let { clientId = null, caseId = null, inquiryId = null } = t as { clientId: string | null; caseId: string | null; inquiryId: string | null };
  const callbackId = t.callbackId ?? null;
  const liveChatId = t.liveChatId ?? null;
  let phone: string | null = t.phone ?? null;
  if (callbackId) {
    const cb = await prisma.callbackRequest.findUnique({ where: { id: callbackId } });
    if (!cb) throw notFound('CALLBACK_NOT_FOUND');
    phone ??= cb.phone;
    clientId ??= cb.clientId;
    inquiryId ??= cb.inquiryId;
  }
  if (liveChatId) {
    const lc = await prisma.liveChat.findUnique({ where: { id: liveChatId } });
    if (!lc) throw notFound('LIVECHAT_NOT_FOUND');
    phone ??= lc.visitorPhone;
    clientId ??= lc.clientId;
    inquiryId ??= lc.inquiryId;
  }
  if (caseId) {
    const c = await prisma.case.findUnique({ where: { id: caseId }, select: { clientId: true, client: { select: { phone: true } } } });
    if (!c) throw notFound('CASE_NOT_FOUND');
    clientId ??= c.clientId;
    phone ??= c.client.phone;
  }
  if (clientId) {
    const u = await prisma.user.findUnique({ where: { id: clientId }, select: { phone: true } });
    if (!u) throw notFound('USER_NOT_FOUND');
    phone ??= u.phone;
    if (!caseId) caseId = (await prisma.case.findFirst({ where: { clientId }, orderBy: { updatedAt: 'desc' }, select: { id: true } }))?.id ?? null;
  }
  if (inquiryId) {
    const q = await prisma.inquiry.findUnique({ where: { id: inquiryId }, select: { phone: true } });
    if (!q) throw notFound('INQUIRY_NOT_FOUND');
    phone ??= q.phone;
  }
  const number = normPhone(phone);
  if (!number) throw badRequest('PHONE_MISSING');
  if (!clientId && !inquiryId) {
    const m = await matchPhone(number);
    clientId = m.clientId;
    caseId ??= m.caseId;
    inquiryId = m.inquiryId;
  }
  return { number, clientId, caseId, inquiryId, callbackId, liveChatId };
};

export const startCall = async (staffId: string, target: CallTarget) => {
  const s = await getCallsSettings();
  const provider = providerFor(s.provider);
  if (!provider || !providerReady(s)) throw conflict('PROVIDER_NOT_CONFIGURED');
  const staff = await prisma.user.findUniqueOrThrow({ where: { id: staffId }, select: { phone: true, locale: true } });
  const staffNumber = normPhone(staff.phone);
  if (!staffNumber) throw badRequest('STAFF_PHONE_MISSING');
  const t = await resolveTarget(target);
  if (t.number === staffNumber) throw badRequest('SAME_NUMBER');
  const callerId = normPhone(s.callerId) ?? staffNumber;
  const call = await prisma.call.create({
    data: {
      provider: provider.name,
      direction: 'OUTBOUND',
      fromNumber: callerId,
      toNumber: t.number,
      staffId,
      clientId: t.clientId,
      caseId: t.caseId,
      inquiryId: t.inquiryId,
      callbackId: t.callbackId,
      liveChatId: t.liveChatId,
      status: 'QUEUED',
      // sipgate starts the recording on answer (webhook); Twilio records via <Dial record>.
      recorded: s.recording && provider.name !== 'sipgate',
    },
  });
  let clientLocale = 'az';
  if (t.clientId) clientLocale = (await prisma.user.findUnique({ where: { id: t.clientId }, select: { locale: true } }))?.locale ?? 'az';
  try {
    const { providerCallId } = await provider.clickToCall(
      { callId: call.id, staffNumber, clientNumber: t.number, callerId, record: s.recording, announcement: s.recording ? s.recordingNotice[clientLocale as 'az'] : '', locale: clientLocale },
      s,
    );
    const updated = await prisma.call.update({ where: { id: call.id }, data: { providerCallId, status: 'RINGING_STAFF' } });
    return notify(updated);
  } catch (err) {
    await prisma.call.update({ where: { id: call.id }, data: { status: 'FAILED', endedAt: new Date(), note: String((err as Error).message ?? err).slice(0, 300) } });
    throw new HttpError(502, 'PROVIDER_ERROR', (err as Error).message);
  }
};

// ─── Status events ─────────────────────────────────────────────────────

const LEG_FAIL: Record<string, CallStatus> = { busy: 'BUSY', 'no-answer': 'NO_ANSWER', failed: 'FAILED', canceled: 'CANCELED' };

/** Applies one provider event; final states are kept (only missing end data is filled in). */
export const applyEvent = async (callId: string, ev: CallEvent, now = new Date()) => {
  const call = await prisma.call.findUnique({ where: { id: callId } });
  if (!call) return null;
  const data: Prisma.CallUpdateInput = {};
  const final = FINAL.includes(call.status);
  if (ev.leg === 'client' && ev.providerLegId && !call.providerLegId) data.providerLegId = ev.providerLegId;
  if (!final) {
    if (ev.leg === 'staff') {
      if (ev.state === 'ringing') data.status = 'RINGING_STAFF';
      else if (ev.state === 'answered' && call.status !== 'IN_PROGRESS') data.status = call.direction === 'INBOUND' ? 'IN_PROGRESS' : 'RINGING';
      else if (ev.state === 'completed') {
        data.status = call.answeredAt ? 'COMPLETED' : 'NO_ANSWER';
        data.endedAt = now;
        if (call.answeredAt && call.durationSec === null) data.durationSec = Math.max(0, Math.round((now.getTime() - call.answeredAt.getTime()) / 1000));
      } else if (LEG_FAIL[ev.state]) {
        data.status = call.answeredAt ? 'COMPLETED' : LEG_FAIL[ev.state];
        data.endedAt = now;
      }
    } else {
      if (ev.state === 'ringing') data.status = 'RINGING';
      else if (ev.state === 'answered') {
        data.status = 'IN_PROGRESS';
        data.answeredAt = call.answeredAt ?? now;
      } else if (ev.state === 'completed') {
        data.status = call.answeredAt ? 'COMPLETED' : 'NO_ANSWER';
        data.endedAt = now;
        data.durationSec = ev.durationSec ?? (call.answeredAt ? Math.max(0, Math.round((now.getTime() - call.answeredAt.getTime()) / 1000)) : 0);
      } else if (LEG_FAIL[ev.state]) {
        data.status = call.answeredAt ? 'COMPLETED' : LEG_FAIL[ev.state];
        data.endedAt = now;
      }
    }
  } else if (ev.state === 'completed' && ev.leg === 'client' && ev.durationSec !== undefined && !call.durationSec) {
    data.durationSec = ev.durationSec;
  }
  if (!Object.keys(data).length) return call;
  const updated = await prisma.call.update({ where: { id: callId }, data });
  await notify(updated);
  if (updated.direction === 'INBOUND' && FINAL.includes(updated.status) && !updated.answeredAt && !final) void notifyMissed(updated);
  return updated;
};

export const findByProviderId = (provider: string, id: string) =>
  prisma.call.findFirst({ where: { provider, OR: [{ providerCallId: id }, { providerLegId: id }] }, orderBy: { startedAt: 'desc' } });

// ─── Inbound ───────────────────────────────────────────────────────────

const whoLabel = async (call: Pick<Call, 'fromNumber' | 'clientId' | 'inquiryId'>) => {
  if (call.clientId) {
    const u = await prisma.user.findUnique({ where: { id: call.clientId }, select: { firstName: true, lastName: true } });
    if (u) return `${u.firstName} ${u.lastName} (${call.fromNumber})`;
  }
  if (call.inquiryId) {
    const q = await prisma.inquiry.findUnique({ where: { id: call.inquiryId }, select: { contactName: true } });
    if (q) return `${q.contactName} (${call.fromNumber})`;
  }
  return call.fromNumber;
};

/** Logs an incoming call and tells the staff members who are online. */
export const logInbound = async (provider: string, o: { providerCallId: string; from: string; to: string }) => {
  const existing = await findByProviderId(provider, o.providerCallId);
  if (existing) return existing;
  const from = normPhone(o.from) ?? o.from.slice(0, 40);
  const m = await matchPhone(from);
  const call = await prisma.call.create({
    data: {
      provider,
      providerCallId: o.providerCallId,
      direction: 'INBOUND',
      fromNumber: from,
      toNumber: (normPhone(o.to) ?? o.to).slice(0, 40),
      clientId: m.clientId,
      caseId: m.caseId,
      inquiryId: m.inquiryId,
      status: 'RINGING',
    },
  });
  const label = await whoLabel(call);
  const [dto] = await toDto([call]);
  publish(await staffIds(), 'call.inbound', { call: dto as unknown as Record<string, unknown>, label });
  return call;
};

const notifyMissed = async (call: Call) => {
  try {
    const label = await whoLabel(call);
    const { notifyStaff } = await import('../notifications.js');
    await notifyStaff(callTexts('az').missedTitle(label), label, { link: '/admin/calls', type: 'CALL_MISSED' });
  } catch (err) {
    console.error('[calls] missed-call notification failed', err);
  }
};

// ─── Notes / outcome / manual log ──────────────────────────────────────

export const canEdit = (call: Call, user: { id: string; role: string }) => call.staffId === user.id || user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' || !call.staffId;

/** Outcome + note after the call; a linked callback request is closed with it. */
export const setOutcome = async (call: Call, staffId: string, input: { outcome?: CallOutcome | null; note?: string | null; transcript?: string | null }) => {
  const updated = await prisma.call.update({
    where: { id: call.id },
    data: {
      ...(input.outcome !== undefined ? { outcome: input.outcome } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
      ...(input.transcript !== undefined ? { transcript: input.transcript } : {}),
      ...(!call.staffId ? { staffId } : {}),
    },
  });
  if (updated.callbackId && input.outcome) {
    const { completeCallback } = await import('./callbacks.js');
    await completeCallback(updated.callbackId, staffId, { outcome: input.outcome, note: input.note ?? null, callId: updated.id });
  }
  return notify(updated);
};

/** A call made outside the provider (own mobile, office line) logged by hand. */
export const logManual = async (staffId: string, target: CallTarget, o: { direction: 'OUTBOUND' | 'INBOUND'; outcome: CallOutcome; note: string | null; durationSec?: number | null }) => {
  const t = await resolveTarget(target);
  const now = new Date();
  const reached = o.outcome === 'REACHED';
  const call = await prisma.call.create({
    data: {
      provider: 'manual',
      direction: o.direction,
      fromNumber: o.direction === 'INBOUND' ? t.number : '',
      toNumber: o.direction === 'INBOUND' ? '' : t.number,
      staffId,
      clientId: t.clientId,
      caseId: t.caseId,
      inquiryId: t.inquiryId,
      callbackId: t.callbackId,
      liveChatId: t.liveChatId,
      status: reached ? 'COMPLETED' : 'NO_ANSWER',
      answeredAt: reached ? now : null,
      endedAt: now,
      durationSec: o.durationSec ?? null,
      outcome: o.outcome,
      note: o.note,
    },
  });
  if (t.callbackId) {
    const { completeCallback } = await import('./callbacks.js');
    await completeCallback(t.callbackId, staffId, { outcome: o.outcome, note: o.note, callId: call.id });
  }
  return notify(call);
};
