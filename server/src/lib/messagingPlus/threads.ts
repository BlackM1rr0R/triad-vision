import crypto from 'node:crypto';
import type { Locale, PartyMessageStatus, PartySide, Prisma, Role } from '@prisma/client';
import { prisma } from '../../db.js';
import { HttpError, conflict, forbidden, notFound } from '../http.js';
import { hasMinRole } from '../../middleware/auth.js';
import { notifyUser } from '../notifications.js';
import { publish } from '../messaging/realtime.js';
import { anonymisedName } from '../vacancies.js';
import { detectLanguage, findContactDetails } from './language.js';
import { EMPLOYER_LABEL, partyNotice, type PartyNotice } from './copy.js';
import { removeVoiceFile, serializeVoice, transcriptionStatus, VOICE_SELECT } from './voice.js';
import { cachedTranslations, needsTranslation, type MessageRef } from './translate.js';

/**
 * Three-party thread: candidate + employer (company users) + Triad Vision staff, per vacancy application
 * (from PROPOSED on) or per case placed with a company. Opened by staff, moderated by staff.
 *
 * Privacy rules (enforced here, for every response and every realtime event):
 *  - the employer sees the candidate only as "Ali M." — never e-mail, phone or address;
 *  - the candidate sees the employer's name only when `showCompany` is on (staff decide);
 *  - contact details typed by the candidate or the employer (e-mail, phone, messenger links) are held
 *    for staff review; voice messages of those two sides are held until their transcript is clean
 *    (or staff approve them when no transcription is configured). Staff messages are never held.
 * Realtime events carry only the thread id; each participant reloads its own (filtered) view.
 */

export type Viewer = { id: string; role: Role; firstName: string; lastName: string; locale: Locale; twoFactorEnabled?: boolean };

export const OPENABLE_APPLICATION_STATUSES = ['PROPOSED', 'INTERVIEW', 'ACCEPTED'] as const;
export const PIN_TOPICS = ['INTERVIEW_TIME', 'START_DATE', 'ACCOMMODATION', 'OTHER'] as const;
export type PinTopic = (typeof PIN_TOPICS)[number];
export type Pin = { id: string; topic: PinTopic; text: string; at: string; byId: string };
export const MAX_PINS = 10;

const THREAD_INCLUDE = {
  company: { select: { id: true, name: true, status: true } },
  candidate: { select: { id: true, firstName: true, lastName: true, locale: true } },
  application: { select: { id: true, status: true, vacancy: { select: { id: true, title: true, slug: true } } } },
  case: { select: { id: true, number: true, profession: true, assignedStaffId: true } },
} satisfies Prisma.PartyThreadInclude;

export type LoadedThread = Prisma.PartyThreadGetPayload<{ include: typeof THREAD_INCLUDE }>;

const isStaffRole = (role: Role) => hasMinRole(role, 'STAFF');

/** Which side the viewer is on, or null when they are not a participant. Staff need 2FA (as for /api/admin). */
export const sideOf = async (t: Pick<LoadedThread, 'candidateId' | 'companyId' | 'company'>, viewer: Viewer): Promise<PartySide | null> => {
  if (isStaffRole(viewer.role)) {
    if (!viewer.twoFactorEnabled) throw new HttpError(403, 'TWO_FACTOR_ENROLLMENT_REQUIRED');
    return 'STAFF';
  }
  if (viewer.role === 'CLIENT' && viewer.id === t.candidateId) return 'CANDIDATE';
  if (viewer.role === 'COMPANY') {
    if (t.company.status !== 'ACTIVE') return null;
    const u = await prisma.user.findUnique({ where: { id: viewer.id }, select: { companyId: true } });
    if (u?.companyId === t.companyId) return 'COMPANY';
  }
  return null;
};

/** Loads a thread the viewer takes part in (404 for everybody else — existence is not revealed). */
export const loadThreadFor = async (threadId: string, viewer: Viewer) => {
  const t = await prisma.partyThread.findUnique({ where: { id: threadId }, include: THREAD_INCLUDE });
  if (!t) throw notFound('THREAD_NOT_FOUND');
  const side = await sideOf(t, viewer);
  if (!side) throw notFound('THREAD_NOT_FOUND');
  return { thread: t, side };
};

// ─── Labels per viewer ────────────────────────────────────────────────

const l10nPick = (v: unknown, locale: Locale) => {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, string | undefined>;
  return o[locale] || o.az || o.de || o.en || o.ru || '';
};

const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`.trim();

/** Short title of the thread in a language: vacancy title, else the case's profession. */
export const threadTitle = (t: LoadedThread, locale: Locale) => (t.application ? l10nPick(t.application.vacancy.title, locale) : t.case?.profession || t.case?.number || '');

/** Name of the candidate as `side` may see it. */
const candidateName = (t: LoadedThread, side: PartySide) => (side === 'COMPANY' ? anonymisedName(t.candidate) : fullName(t.candidate));
/** Employer name as `side` may see it (null = "Employer" in the UI). */
const companyName = (t: LoadedThread, side: PartySide) => (side === 'CANDIDATE' && !t.showCompany ? null : t.company.name);

type AuthorRow = { id: string; firstName: string; lastName: string };

const authorLabel = (t: LoadedThread, viewerSide: PartySide, side: PartySide, author: AuthorRow) => {
  if (side === 'STAFF') return viewerSide === 'STAFF' ? fullName(author) : `${author.firstName} · Triad Vision`;
  if (side === 'CANDIDATE') return candidateName(t, viewerSide);
  // Company user: colleagues and staff see the person; the candidate sees the company (or nothing).
  if (viewerSide === 'CANDIDATE') return companyName(t, 'CANDIDATE');
  return viewerSide === 'STAFF' ? `${fullName(author)} (${t.company.name})` : fullName(author);
};

// ─── Messages ─────────────────────────────────────────────────────────

const MESSAGE_INCLUDE = { author: { select: { id: true, firstName: true, lastName: true } }, voice: { select: VOICE_SELECT } } satisfies Prisma.PartyThreadMessageInclude;
type MessageRow = Prisma.PartyThreadMessageGetPayload<{ include: typeof MESSAGE_INCLUDE }>;

/** May the viewer see this message's content? */
export const canSeeMessage = (m: Pick<MessageRow, 'status' | 'authorId'>, side: PartySide, viewerId: string) => {
  if (side === 'STAFF') return true;
  if (m.status === 'VISIBLE' || m.status === 'DELETED') return true;
  if (m.status === 'HELD' || m.status === 'REJECTED') return m.authorId === viewerId;
  return false; // HIDDEN
};

export const serializePartyMessage = (t: LoadedThread, m: MessageRow, side: PartySide, viewerId: string) => {
  const deleted = m.status === 'DELETED';
  return {
    id: m.id,
    threadId: m.threadId,
    side: m.side,
    mine: m.authorId === viewerId,
    authorId: side === 'STAFF' ? m.authorId : undefined,
    authorName: authorLabel(t, side, m.side, m.author),
    body: deleted ? '' : m.body,
    lang: deleted ? null : m.lang,
    voice: deleted ? null : serializeVoice(m.voice),
    status: m.status,
    holdReason: side === 'STAFF' || m.authorId === viewerId ? m.holdReason : null,
    createdAt: m.createdAt,
  };
};

const messageRef = (m: MessageRow): MessageRef => ({ kind: 'party', id: m.id, text: m.body || (m.voice?.transcriptStatus === 'DONE' ? m.voice.transcript ?? '' : ''), lang: m.lang ?? m.voice?.transcriptLang ?? null });

/** Messages of a thread the viewer may see (content), oldest first. */
export const visibleMessages = async (t: LoadedThread, side: PartySide, viewerId: string) => {
  const rows = await prisma.partyThreadMessage.findMany({ where: { threadId: t.id }, orderBy: { createdAt: 'asc' }, include: MESSAGE_INCLUDE, take: 500 });
  return rows.filter((m) => canSeeMessage(m, side, viewerId));
};

/** Refs for translation (only what the viewer may read; deleted messages have nothing to translate). */
export const translationRefs = (rows: MessageRow[]) => rows.filter((m) => m.status !== 'DELETED').map(messageRef);

const parsePins = (v: unknown): Pin[] => (Array.isArray(v) ? (v as Pin[]).filter((p) => p && typeof p.id === 'string' && typeof p.text === 'string') : []);

/** The whole thread as one participant sees it (+ cached translations into `lang`). */
export const threadView = async (t: LoadedThread, side: PartySide, viewer: Viewer, lang: Locale) => {
  const rows = await visibleMessages(t, side, viewer.id);
  const refs = translationRefs(rows).filter((r) => needsTranslation(r, lang));
  const [translations, pref, member, transcription] = await Promise.all([
    cachedTranslations(refs, lang),
    prisma.user.findUnique({ where: { id: viewer.id }, select: { showOriginalMessages: true } }),
    prisma.partyThreadMember.findUnique({ where: { threadId_userId: { threadId: t.id, userId: viewer.id } }, select: { lastReadAt: true } }),
    transcriptionStatus(),
  ]);
  const staffMembers = await prisma.partyThreadMember.findMany({ where: { threadId: t.id, side: 'STAFF' }, include: { user: { select: { firstName: true, lastName: true } } } });
  return {
    thread: {
      id: t.id,
      applicationId: t.applicationId,
      caseId: side === 'STAFF' ? t.caseId : t.caseId ? t.caseId : null,
      caseNumber: side === 'STAFF' ? t.case?.number ?? null : null,
      candidateId: side === 'STAFF' ? t.candidateId : undefined,
      companyId: side === 'COMPANY' || side === 'STAFF' ? t.companyId : undefined,
      title: threadTitle(t, lang),
      vacancyTitle: t.application?.vacancy.title ?? null,
      applicationStatus: t.application?.status ?? null,
      status: t.status,
      showCompany: t.showCompany,
      candidateName: side === 'CANDIDATE' ? null : candidateName(t, side),
      companyName: companyName(t, side),
      staff: staffMembers.map((s) => (side === 'STAFF' ? fullName(s.user) : `${s.user.firstName} · Triad Vision`)),
      pins: parsePins(t.pins),
      closedAt: t.closedAt,
      createdAt: t.createdAt,
      lastReadAt: member?.lastReadAt ?? null,
    },
    side,
    lang,
    showOriginals: !!pref?.showOriginalMessages,
    transcription: { enabled: transcription.enabled },
    messages: rows.map((m) => serializePartyMessage(t, m, side, viewer.id)),
    translations,
    heldCount: side === 'STAFF' ? rows.filter((m) => m.status === 'HELD').length : undefined,
  };
};

// ─── Participants, realtime, notifications ────────────────────────────

type Recipient = { id: string; side: PartySide; locale: Locale; isActive: boolean };

export const participants = async (t: Pick<LoadedThread, 'id' | 'candidateId' | 'companyId'>): Promise<Recipient[]> => {
  const [candidate, companyUsers, staff] = await Promise.all([
    prisma.user.findUnique({ where: { id: t.candidateId }, select: { id: true, locale: true, isActive: true } }),
    prisma.user.findMany({ where: { companyId: t.companyId, role: 'COMPANY', isActive: true }, select: { id: true, locale: true, isActive: true } }),
    prisma.partyThreadMember.findMany({ where: { threadId: t.id, side: 'STAFF' }, include: { user: { select: { id: true, locale: true, isActive: true } } } }),
  ]);
  const out: Recipient[] = [];
  if (candidate) out.push({ ...candidate, side: 'CANDIDATE' });
  for (const u of companyUsers) out.push({ ...u, side: 'COMPANY' });
  for (const s of staff) out.push({ ...s.user, side: 'STAFF' });
  return out.filter((r) => r.isActive);
};

/** Tells every participant (or only staff + one author) that the thread changed; payload = ids only. */
export const publishThread = async (t: LoadedThread, opts: { only?: 'staff-and'; authorId?: string } = {}) => {
  const people = await participants(t);
  const ids = opts.only ? people.filter((p) => p.side === 'STAFF' || p.id === opts.authorId).map((p) => p.id) : people.map((p) => p.id);
  publish([...new Set(ids)], 'party.updated', { threadId: t.id });
};

export const linkFor = (t: Pick<LoadedThread, 'id' | 'applicationId' | 'caseId' | 'candidateId'>, side: PartySide) => {
  if (side === 'CANDIDATE') return `/account/applications?thread=${t.id}`;
  if (side === 'COMPANY') return `/company/candidates?thread=${t.id}`;
  return t.caseId && !t.applicationId ? `/admin/cases/${t.caseId}?thread=${t.id}` : `/admin/candidates?id=${t.candidateId}&thread=${t.id}`;
};

const noticeTitle = (t: LoadedThread, r: Recipient) => {
  const title = threadTitle(t, r.locale);
  if (r.side === 'COMPANY') return `${anonymisedName(t.candidate)} · ${title}`;
  if (r.side === 'STAFF') return `${fullName(t.candidate)} · ${t.company.name}`;
  return `${t.showCompany ? t.company.name : EMPLOYER_LABEL[r.locale]} · ${title}`;
};

/** A user is notified at most once per 15 minutes per thread unless they read the thread since. */
export const NOTIFY_QUIET_MS = 15 * 60 * 1000;

export const notifyParticipants = async (t: LoadedThread, kind: PartyNotice, recipients: Recipient[], opts: { throttle?: boolean } = {}) => {
  const now = new Date();
  for (const r of recipients) {
    const member = await prisma.partyThreadMember.upsert({
      where: { threadId_userId: { threadId: t.id, userId: r.id } },
      create: { threadId: t.id, userId: r.id, side: r.side },
      update: {},
    });
    if (opts.throttle && member.notifiedAt && now.getTime() - member.notifiedAt.getTime() < NOTIFY_QUIET_MS && !(member.lastReadAt && member.lastReadAt > member.notifiedAt)) continue;
    const { title, body } = partyNotice(kind, r.locale, { title: noticeTitle(t, r) });
    await notifyUser(r.id, { type: `PARTY_${kind}`, title, body, link: linkFor(t, r.side) });
    // Only message notices count for the quiet period (an "opened" / "closed" notice never silences the next message).
    if (opts.throttle) await prisma.partyThreadMember.update({ where: { id: member.id }, data: { notifiedAt: now } });
  }
};

// ─── Opening, sending, moderation ─────────────────────────────────────

/** Opens (or returns) the thread of an application or a company case. Staff only (checked by the route). */
export const openThread = async (target: { applicationId?: string; caseId?: string }, staff: Viewer) => {
  let data: { applicationId?: string; caseId?: string; companyId: string; candidateId: string; showCompany: boolean; assignedStaffId?: string | null };
  if (target.applicationId) {
    const existing = await prisma.partyThread.findUnique({ where: { applicationId: target.applicationId }, include: THREAD_INCLUDE });
    if (existing) return { thread: existing, created: false };
    const app = await prisma.vacancyApplication.findUnique({ where: { id: target.applicationId }, include: { vacancy: { select: { companyId: true, showCompany: true } } } });
    if (!app) throw notFound('APPLICATION_NOT_FOUND');
    if (!app.vacancy.companyId) throw conflict('NO_COMPANY');
    if (!(OPENABLE_APPLICATION_STATUSES as readonly string[]).includes(app.status)) throw conflict('APPLICATION_NOT_PROPOSED');
    data = { applicationId: app.id, companyId: app.vacancy.companyId, candidateId: app.userId, showCompany: app.vacancy.showCompany };
  } else {
    const caseId = target.caseId!;
    const existing = await prisma.partyThread.findUnique({ where: { caseId }, include: THREAD_INCLUDE });
    if (existing) return { thread: existing, created: false };
    const c = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, clientId: true, companyId: true, assignedStaffId: true, vacancy: { select: { showCompany: true } } } });
    if (!c) throw notFound('CASE_NOT_FOUND');
    if (!c.companyId) throw conflict('NO_COMPANY');
    data = { caseId: c.id, companyId: c.companyId, candidateId: c.clientId, showCompany: c.vacancy?.showCompany ?? false, assignedStaffId: c.assignedStaffId };
  }
  const { assignedStaffId, ...threadData } = data;
  let thread: LoadedThread;
  try {
    thread = await prisma.partyThread.create({ data: { ...threadData, createdById: staff.id }, include: THREAD_INCLUDE });
  } catch (err) {
    // Two staff members opened it at the same moment: return the one that won.
    if ((err as { code?: string }).code !== 'P2002') throw err;
    const again = await prisma.partyThread.findFirst({ where: target.applicationId ? { applicationId: target.applicationId } : { caseId: target.caseId }, include: THREAD_INCLUDE });
    if (!again) throw err;
    return { thread: again, created: false };
  }
  const staffIds = [...new Set([staff.id, ...(assignedStaffId ? [assignedStaffId] : [])])];
  await prisma.partyThreadMember.createMany({
    data: [...staffIds.map((userId) => ({ threadId: thread.id, userId, side: 'STAFF' as const })), { threadId: thread.id, userId: thread.candidateId, side: 'CANDIDATE' as const }],
    skipDuplicates: true,
  });
  const people = await participants(thread);
  await notifyParticipants(thread, 'OPENED', people.filter((p) => p.side !== 'STAFF'));
  await publishThread(thread);
  return { thread, created: true };
};

/** Delivers a visible message: realtime to everyone, throttled notifications to the other participants. */
const deliver = async (t: LoadedThread, authorId: string) => {
  await publishThread(t);
  const people = await participants(t);
  await notifyParticipants(t, 'NEW_MESSAGE', people.filter((p) => p.id !== authorId), { throttle: true });
};

const holdForReview = async (t: LoadedThread, authorId: string) => {
  await publishThread(t, { only: 'staff-and', authorId });
  const people = await participants(t);
  const staff = people.filter((p) => p.side === 'STAFF');
  if (staff.length) await notifyParticipants(t, 'HELD', staff, { throttle: true });
};

export const sendPartyMessage = async (t: LoadedThread, side: PartySide, viewer: Viewer, input: { body: string; voiceId?: string | null }) => {
  if (t.status === 'CLOSED') throw conflict('THREAD_CLOSED');
  const body = input.body.trim();
  let status: PartyMessageStatus = 'VISIBLE';
  let holdReason: string | null = null;
  if (side !== 'STAFF') {
    if (body && findContactDetails(body).length) {
      status = 'HELD';
      holdReason = 'CONTACT_DETAILS';
    } else if (input.voiceId) {
      // Spoken contact details cannot be checked before the transcript exists.
      status = 'HELD';
      holdReason = 'VOICE_REVIEW';
    }
  }
  const lang = body ? detectLanguage(body) ?? viewer.locale : null;
  const m = await prisma.partyThreadMessage.create({
    data: { threadId: t.id, authorId: viewer.id, side, body, lang, voiceId: input.voiceId ?? null, status, holdReason },
    include: MESSAGE_INCLUDE,
  });
  await prisma.partyThread.update({ where: { id: t.id }, data: { lastMessageAt: m.createdAt } });
  await prisma.partyThreadMember.upsert({
    where: { threadId_userId: { threadId: t.id, userId: viewer.id } },
    create: { threadId: t.id, userId: viewer.id, side, lastReadAt: m.createdAt },
    update: { lastReadAt: m.createdAt },
  });
  if (status === 'VISIBLE') await deliver(t, viewer.id);
  else await holdForReview(t, viewer.id);
  return serializePartyMessage(t, m, side, viewer.id);
};

/**
 * After a voice message of the candidate / employer got its transcript: a clean transcript releases a
 * message held only for VOICE_REVIEW; spoken contact details keep it held (CONTACT_DETAILS).
 * Without a usable transcript it stays held for a person to listen to.
 */
export const afterPartyTranscript = async (messageId: string) => {
  const m = await prisma.partyThreadMessage.findUnique({ where: { id: messageId }, include: { voice: { select: VOICE_SELECT } } });
  if (!m) return;
  const t = await prisma.partyThread.findUnique({ where: { id: m.threadId }, include: THREAD_INCLUDE });
  if (!t) return;
  const transcript = m.voice?.transcriptStatus === 'DONE' ? m.voice.transcript ?? '' : null;
  if (m.status === 'HELD' && m.holdReason === 'VOICE_REVIEW' && transcript !== null) {
    const contact = findContactDetails(transcript).length > 0;
    const updated = await prisma.partyThreadMessage.update({
      where: { id: m.id },
      data: contact ? { holdReason: 'CONTACT_DETAILS', lang: m.voice?.transcriptLang ?? m.lang } : { status: 'VISIBLE', holdReason: null, lang: m.voice?.transcriptLang ?? m.lang },
    });
    if (updated.status === 'VISIBLE') return deliver(t, m.authorId);
    return holdForReview(t, m.authorId);
  }
  if (m.voice?.transcriptLang && !m.lang) await prisma.partyThreadMessage.update({ where: { id: m.id }, data: { lang: m.voice.transcriptLang } });
  // Visible to whoever could see it before: refresh their views.
  await publishThread(t, m.status === 'VISIBLE' ? {} : { only: 'staff-and', authorId: m.authorId });
};

export const MODERATION_ACTIONS = ['APPROVE', 'REJECT', 'HIDE', 'UNHIDE', 'DELETE'] as const;
export type ModerationAction = (typeof MODERATION_ACTIONS)[number];

const ALLOWED_FROM: Record<ModerationAction, PartyMessageStatus[]> = {
  APPROVE: ['HELD', 'REJECTED'],
  REJECT: ['HELD'],
  HIDE: ['VISIBLE'],
  UNHIDE: ['HIDDEN'],
  DELETE: ['VISIBLE', 'HELD', 'REJECTED', 'HIDDEN'],
};

export const moderateMessage = async (t: LoadedThread, messageId: string, action: ModerationAction, staff: Viewer) => {
  const m = await prisma.partyThreadMessage.findFirst({ where: { id: messageId, threadId: t.id }, include: { voice: true } });
  if (!m) throw notFound('MESSAGE_NOT_FOUND');
  if (!ALLOWED_FROM[action].includes(m.status)) throw conflict('INVALID_TRANSITION');
  const review = { reviewedById: staff.id, reviewedAt: new Date() };
  if (action === 'DELETE') {
    await prisma.$transaction([
      prisma.messageTranslation.deleteMany({ where: { partyMessageId: m.id } }),
      prisma.partyThreadMessage.update({ where: { id: m.id }, data: { status: 'DELETED', body: '', voiceId: null, holdReason: null, ...review } }),
      ...(m.voice ? [prisma.voiceClip.delete({ where: { id: m.voice.id } })] : []),
    ]);
    if (m.voice) await removeVoiceFile(m.voice);
  } else {
    const status: PartyMessageStatus = { APPROVE: 'VISIBLE', REJECT: 'REJECTED', HIDE: 'HIDDEN', UNHIDE: 'VISIBLE' }[action] as PartyMessageStatus;
    await prisma.partyThreadMessage.update({ where: { id: m.id }, data: { status, ...(action === 'APPROVE' ? { holdReason: null } : {}), ...review } });
  }
  if (action === 'APPROVE' || action === 'UNHIDE') {
    await deliver(t, m.authorId);
  } else {
    await publishThread(t);
    if (action === 'REJECT') {
      const author = (await participants(t)).find((p) => p.id === m.authorId);
      if (author) await notifyParticipants(t, 'REJECTED', [author]);
    }
  }
  return { status: action === 'DELETE' ? 'DELETED' : undefined };
};

export const markThreadRead = async (t: LoadedThread, side: PartySide, viewer: Viewer) => {
  await prisma.partyThreadMember.upsert({
    where: { threadId_userId: { threadId: t.id, userId: viewer.id } },
    create: { threadId: t.id, userId: viewer.id, side, lastReadAt: new Date() },
    update: { lastReadAt: new Date() },
  });
};

export const addPin = async (t: LoadedThread, staff: Viewer, topic: PinTopic, text: string) => {
  const pins = parsePins(t.pins);
  if (pins.length >= MAX_PINS) throw conflict('TOO_MANY_PINS');
  const pin: Pin = { id: crypto.randomBytes(6).toString('hex'), topic, text, at: new Date().toISOString(), byId: staff.id };
  await prisma.partyThread.update({ where: { id: t.id }, data: { pins: [...pins, pin] as unknown as Prisma.InputJsonValue } });
  await publishThread(t);
  return pin;
};

export const removePin = async (t: LoadedThread, pinId: string) => {
  const pins = parsePins(t.pins);
  if (!pins.some((p) => p.id === pinId)) throw notFound('PIN_NOT_FOUND');
  await prisma.partyThread.update({ where: { id: t.id }, data: { pins: pins.filter((p) => p.id !== pinId) as unknown as Prisma.InputJsonValue } });
  await publishThread(t);
};

export const updateThread = async (t: LoadedThread, patch: { status?: 'OPEN' | 'CLOSED'; showCompany?: boolean }) => {
  const closing = patch.status === 'CLOSED' && t.status !== 'CLOSED';
  const updated = await prisma.partyThread.update({
    where: { id: t.id },
    data: { ...patch, ...(patch.status ? { closedAt: patch.status === 'CLOSED' ? t.closedAt ?? new Date() : null } : {}) },
    include: THREAD_INCLUDE,
  });
  await publishThread(updated);
  if (closing) {
    const people = await participants(updated);
    await notifyParticipants(updated, 'CLOSED', people.filter((p) => p.side !== 'STAFF'));
  }
  return updated;
};

/** Threads of a viewer (candidate: own; employer: own company; staff: all, newest activity first). */
export const listThreads = async (viewer: Viewer, opts: { status?: 'OPEN' | 'CLOSED'; held?: boolean; lang: Locale }) => {
  let where: Prisma.PartyThreadWhereInput;
  let side: PartySide;
  if (isStaffRole(viewer.role)) {
    if (!viewer.twoFactorEnabled) throw new HttpError(403, 'TWO_FACTOR_ENROLLMENT_REQUIRED');
    side = 'STAFF';
    where = { ...(opts.status ? { status: opts.status } : {}), ...(opts.held ? { messages: { some: { status: 'HELD' } } } : {}) };
  } else if (viewer.role === 'CLIENT') {
    side = 'CANDIDATE';
    where = { candidateId: viewer.id };
  } else if (viewer.role === 'COMPANY') {
    side = 'COMPANY';
    const u = await prisma.user.findUnique({ where: { id: viewer.id }, select: { companyId: true, company: { select: { status: true } } } });
    if (!u?.companyId || u.company?.status !== 'ACTIVE') return [];
    where = { companyId: u.companyId };
  } else {
    throw forbidden('FORBIDDEN');
  }
  const threads = await prisma.partyThread.findMany({ where, include: THREAD_INCLUDE, orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }], take: 100 });
  const members = await prisma.partyThreadMember.findMany({ where: { userId: viewer.id, threadId: { in: threads.map((t) => t.id) } }, select: { threadId: true, lastReadAt: true } });
  const readAt = new Map(members.map((m) => [m.threadId, m.lastReadAt]));
  const out = [];
  for (const t of threads) {
    const since = readAt.get(t.id);
    const visibleWhere: Prisma.PartyThreadMessageWhereInput =
      side === 'STAFF' ? { status: { not: 'DELETED' } } : { status: 'VISIBLE' };
    const [unread, held] = await Promise.all([
      prisma.partyThreadMessage.count({ where: { threadId: t.id, authorId: { not: viewer.id }, ...visibleWhere, ...(since ? { createdAt: { gt: since } } : {}) } }),
      side === 'STAFF' ? prisma.partyThreadMessage.count({ where: { threadId: t.id, status: 'HELD' } }) : Promise.resolve(0),
    ]);
    out.push({
      id: t.id,
      applicationId: t.applicationId,
      caseId: t.caseId,
      title: threadTitle(t, opts.lang),
      candidateName: side === 'CANDIDATE' ? null : candidateName(t, side),
      companyName: companyName(t, side),
      status: t.status,
      lastMessageAt: t.lastMessageAt,
      createdAt: t.createdAt,
      unread,
      heldCount: side === 'STAFF' ? held : undefined,
    });
  }
  return out;
};
