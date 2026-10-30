import crypto from 'node:crypto';
import type { CaseStatus, Locale, Prisma } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { renderEmail, sendMail } from '../mailer.js';
import { notifyUser } from '../notifications.js';
import { normaliseAgentCode, slugPart } from '../agents/referral.js';
import { formatMoney } from '../agents/texts.js';
import { REF_COOKIE } from '../growth/referral.js';
import { PARTNER_CLIENT_TEXT } from '../partnerPortal/clientTexts.js';
import { caseListView } from '../partnerPortal/cases.js';
import { commissionTriggerReached, ensurePartnerCommission } from './commissions.js';
import { assignCases } from './manage.js';

/**
 * Partner-owned clients. A referral partner has a personal sign-up code (`ReferralPartner.code`, link
 * /register?ref=CODE or the short /p/CODE). A client who signs up with it — or whom the partner registers
 * from the portal — belongs to the partner for good (`User.ownerPartnerId`): every new case of the client
 * (family members and renewals included) gets the partner (lib/caseFlow.ts → createCase), with the automatic
 * commission and the drive folder that come with it. Only ADMIN+ reassign a client; every change is kept in
 * PartnerClientChange. The partner sees more than the minimised view only when the partner's visibility is
 * EXTENDED *and* the client agreed to share their data with the partner (consent log type PARTNER_SHARING).
 *
 * Codes share one namespace with agent codes and client "bring a friend" codes; at sign-up a partner code
 * wins, so a partner-owned client never also creates an agent commission or a client-referral reward.
 */

export const PARTNER_VISIBILITY = ['MINIMAL', 'EXTENDED'] as const;
export type PartnerVisibility = (typeof PARTNER_VISIBILITY)[number];
export const OWNERSHIP_SOURCES = ['SIGNUP_LINK', 'PARTNER_PORTAL', 'ADMIN'] as const;
export type OwnershipSource = (typeof OWNERSHIP_SOURCES)[number];

/** Same as caseFlow's FINAL_STATUSES (not imported: caseFlow loads this module lazily). */
const FINAL: CaseStatus[] = ['APPROVED', 'REJECTED', 'CANCELLED'];

/** The partner's sign-up links: the full one (read by the register page and the mobile app) and the short one. */
export const partnerLinks = (code: string) => ({
  shareLink: `${config.clientUrl}/register?ref=${encodeURIComponent(code)}`,
  shortLink: `${config.clientUrl}/p/${encodeURIComponent(code)}`,
});

/** The active partner behind a sign-up code, or null. Never throws. */
export const findPartnerByCode = async (raw: string | null | undefined) => {
  const code = normaliseAgentCode(raw ?? '');
  if (!code) return null;
  try {
    return await prisma.referralPartner.findFirst({ where: { code, active: true }, select: { id: true, name: true, userId: true } });
  } catch (err) {
    console.error('[partners] code lookup failed', err);
    return null;
  }
};

/** Whether a code is used by another partner, an agent or a client's "bring a friend" code. */
export const codeInUse = async (code: string, exceptPartnerId?: string) => {
  const [partner, agent, client] = await Promise.all([
    prisma.referralPartner.findFirst({ where: { code, ...(exceptPartnerId ? { id: { not: exceptPartnerId } } : {}) }, select: { id: true } }),
    prisma.agent.findUnique({ where: { code }, select: { id: true } }),
    prisma.clientReferralCode.findUnique({ where: { code }, select: { id: true } }),
  ]);
  return !!(partner || agent || client);
};

/** A free code from the partner's name ("İlqar Məmmədov" → ILQAR-M, then ILQAR-M-2 …). */
export const suggestPartnerCode = async (name: string, exceptPartnerId?: string) => {
  const parts = name.trim().split(/\s+/).map(slugPart).filter(Boolean);
  const first = parts[0] || 'PARTNER';
  const base = normaliseAgentCode(parts.length > 1 ? `${first}-${parts[parts.length - 1]!.charAt(0)}` : first).slice(0, 26).replace(/-+$/, '') || 'PARTNER';
  if (base.length >= 3 && !(await codeInUse(base, exceptPartnerId))) return base;
  for (let n = 2; n < 1000; n++) {
    const c = `${base}-${n}`;
    if (!(await codeInUse(c, exceptPartnerId))) return c;
  }
  return `${base}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`.slice(0, 32);
};

/** Partner attribution of an anonymous lead (inquiry, booking): the partner code in the tv_ref cookie, or null. */
export const partnerIdFromRequest = async (req: { cookies?: Record<string, unknown> }) => {
  const raw = req.cookies?.[REF_COOKIE];
  if (typeof raw !== 'string' || !raw) return null;
  return (await findPartnerByCode(raw.slice(0, 64)))?.id ?? null;
};

/** Notifies the partner's portal login (fire-and-forget safe). */
const notifyPartner = async (partnerId: string, msg: (t: (typeof PARTNER_CLIENT_TEXT)['az'], locale: Locale) => { title: string; body: string; link: string; cta?: string; type: string }) => {
  try {
    const p = await prisma.referralPartner.findUnique({ where: { id: partnerId }, select: { userId: true, user: { select: { locale: true, role: true } } } });
    if (!p?.userId || p.user?.role !== 'AGENT') return;
    const locale: Locale = p.user.locale ?? 'az';
    const m = msg(PARTNER_CLIENT_TEXT[locale], locale);
    await notifyUser(p.userId, { type: m.type, title: m.title, body: m.body, link: m.link, ctaLabel: m.cta ?? PARTNER_CLIENT_TEXT[locale].clientsCta, push: false });
  } catch (err) {
    console.error('[partners] notification failed', partnerId, err);
  }
};

const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`.trim();

/**
 * Makes `partnerId` the owner of a client who has none yet (first owner wins; a partner cannot own their
 * own login). Writes the history row; open cases without a partner join the partner. Returns true when
 * ownership was set. Never throws.
 */
export const attachPartnerOwner = async (
  userId: string,
  partnerId: string,
  opts: { source: OwnershipSource; actorId?: string | null; note?: string | null; notify?: boolean },
) => {
  try {
    const partner = await prisma.referralPartner.findUnique({ where: { id: partnerId }, select: { id: true, userId: true } });
    if (!partner || partner.userId === userId) return false;
    const { count } = await prisma.user.updateMany({ where: { id: userId, ownerPartnerId: null, role: 'CLIENT' }, data: { ownerPartnerId: partnerId, ownerPartnerAt: new Date() } });
    if (!count) return false;
    await prisma.partnerClientChange.create({ data: { userId, toPartnerId: partnerId, source: opts.source, actorId: opts.actorId ?? null, note: opts.note?.slice(0, 500) ?? null } });
    const open = await prisma.case.findMany({ where: { clientId: userId, partnerId: null, status: { notIn: FINAL } }, select: { id: true } });
    if (open.length) await assignCases(open.map((c) => c.id), partnerId, opts.actorId ?? null);
    if (opts.notify !== false) {
      const u = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
      if (u) void notifyPartner(partnerId, (t) => ({ type: 'PARTNER_NEW_CLIENT', title: t.newClientTitle(fullName(u)), body: t.newClientBody(fullName(u)), link: '/partner/clients' }));
    }
    return true;
  } catch (err) {
    console.error('[partners] attach owner failed', userId, partnerId, err);
    return false;
  }
};

/**
 * ADMIN+: sets (or removes, null) the owning partner of a client, with history. The client's open cases
 * that belonged to the previous owner (or to nobody) move to the new one (commissions and folders follow,
 * lib/partners/manage.ts); closed cases keep their partner.
 */
export const setClientOwner = async (userId: string, toPartnerId: string | null, actorId: string, note?: string | null) => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, ownerPartnerId: true } });
  if (!user) return null;
  const from = user.ownerPartnerId;
  if (from === toPartnerId) return { from, to: toPartnerId, casesMoved: 0, changed: false };
  await prisma.user.update({ where: { id: userId }, data: { ownerPartnerId: toPartnerId, ownerPartnerAt: toPartnerId ? new Date() : null } });
  await prisma.partnerClientChange.create({ data: { userId, fromPartnerId: from, toPartnerId, source: 'ADMIN', actorId, note: note?.slice(0, 500) ?? null } });
  const open = await prisma.case.findMany({
    where: { clientId: userId, status: { notIn: FINAL }, OR: [{ partnerId: null }, ...(from ? [{ partnerId: from }] : [])] },
    select: { id: true },
  });
  const { changed } = open.length ? await assignCases(open.map((c) => c.id), toPartnerId, actorId) : { changed: [] as string[] };
  return { from, to: toPartnerId, casesMoved: changed.length, changed: true };
};

/**
 * Case created (lib/caseFlow.ts → createCase, which already set partnerId): the automatic commission and a
 * "new application" message to the partner. Never throws.
 */
export const onPartnerCaseCreated = async (caseId: string, actorId: string | null) => {
  try {
    const c = await prisma.case.findUnique({ where: { id: caseId }, select: { number: true, partnerId: true, client: { select: { firstName: true, lastName: true } } } });
    if (!c?.partnerId) return;
    await ensurePartnerCommission(c.partnerId, caseId, actorId);
    void notifyPartner(c.partnerId, (t) => ({ type: 'PARTNER_NEW_CASE', title: t.newCaseTitle(fullName(c.client)), body: t.newCaseBody(fullName(c.client), c.number), link: `/partner/clients/${caseId}` }));
  } catch (err) {
    console.error('[partners] case created hook failed', caseId, err);
  }
};

/**
 * Every case transition: a partner whose commission trigger is a later step (CONTRACT_SIGNED / VISA_APPROVED)
 * gets the automatic commission once the case reaches it, and a message. Never throws.
 */
export const partnerCommissionOnStatus = async (caseId: string, to: CaseStatus) => {
  try {
    const c = await prisma.case.findUnique({
      where: { id: caseId },
      select: { number: true, partnerId: true, client: { select: { firstName: true, lastName: true } }, partner: { select: { commissionTrigger: true } } },
    });
    if (!c?.partnerId || !c.partner || c.partner.commissionTrigger === 'ASSIGNED' || !commissionTriggerReached(c.partner.commissionTrigger, to)) return;
    if (!(await ensurePartnerCommission(c.partnerId, caseId, null))) return;
    const row = await prisma.partnerCommission.findUnique({ where: { partnerId_caseId: { partnerId: c.partnerId, caseId } }, select: { amountCents: true, currency: true } });
    if (!row) return;
    void notifyPartner(c.partnerId, (t, locale) => ({
      type: 'PARTNER_COMMISSION_EARNED',
      title: t.earnedTitle(formatMoney(row.amountCents, row.currency, locale)),
      body: t.earnedBody(fullName(c.client), c.number),
      link: '/partner/commissions',
    }));
  } catch (err) {
    console.error('[partners] commission on status failed', caseId, to, err);
  }
};

// ─── Consent and the portal view ─────────────────────────────────────

/** Latest PARTNER_SHARING consent per user (true / false), users without any record are missing. */
export const partnerSharingConsent = async (userIds: string[]) => {
  const out = new Map<string, boolean>();
  if (!userIds.length) return out;
  const rows = await prisma.consentRecord.findMany({
    where: { userId: { in: userIds }, type: 'PARTNER_SHARING' },
    orderBy: { createdAt: 'asc' },
    select: { userId: true, granted: true },
  });
  for (const r of rows) out.set(r.userId!, r.granted);
  return out;
};

/** Extended data only when the admin allowed it for the partner and the client agreed. */
export const showExtended = (visibility: string, consent: boolean | undefined) => visibility === 'EXTENDED' && consent === true;

/** The client's e-mail and phone for a partner's case, or null (minimal visibility or no consent). */
export const extendedContact = async (partner: { id: string; visibility: string }, caseId: string) => {
  if (partner.visibility !== 'EXTENDED') return null;
  const c = await prisma.case.findFirst({ where: { id: caseId, partnerId: partner.id }, select: { client: { select: { id: true, email: true, phone: true } } } });
  if (!c) return null;
  const consent = (await partnerSharingConsent([c.client.id])).get(c.client.id);
  return showExtended(partner.visibility, consent) ? { email: c.client.email, phone: c.client.phone } : null;
};

export type PaymentState = 'NONE' | 'PAID' | 'OPEN' | 'PARTIAL' | 'OVERDUE';

/** Payment state of a client from their invoices (drafts and cancelled ones do not count). */
export const paymentStateOf = (invoices: { status: string; grossCents: number; paidCents: number; dueDate: Date }[], now = new Date()): PaymentState => {
  const live = invoices.filter((i) => i.status !== 'DRAFT' && i.status !== 'CANCELLED');
  if (!live.length) return 'NONE';
  const open = live.filter((i) => i.status !== 'PAID' && i.paidCents < i.grossCents);
  if (!open.length) return 'PAID';
  if (open.some((i) => i.status === 'OVERDUE' || i.dueDate < now)) return 'OVERDUE';
  return open.some((i) => i.paidCents > 0) || live.length > open.length ? 'PARTIAL' : 'OPEN';
};

/** Same masking as the case view: only the last three characters stay readable. */
const mask = (p: string | null) => {
  const v = (p ?? '').trim();
  if (!v) return null;
  return v.length <= 3 ? '*'.repeat(v.length) : `${'*'.repeat(v.length - 3)}${v.slice(-3)}`;
};

const CLIENT_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  passportNumber: true,
  createdAt: true,
  emailVerifiedAt: true,
  ownerPartnerId: true,
  ownerPartnerAt: true,
  sessions: { take: 1, select: { id: true } },
} satisfies Prisma.UserSelect;

/**
 * All clients of a partner for the portal: owned clients plus clients of cases linked to the partner by
 * staff. Per client the latest case (step, missing documents, next action — lib/partnerPortal/cases.ts),
 * the payment state, and contacts / amounts only with extended visibility and consent.
 */
export const listPartnerClients = async (partner: { id: string; visibility: string }, q: { search?: string } = {}) => {
  const caseClients = await prisma.case.findMany({ where: { partnerId: partner.id }, select: { clientId: true }, distinct: ['clientId'] });
  const ids = [...new Set(caseClients.map((c) => c.clientId))];
  const search = q.search?.trim();
  const users = await prisma.user.findMany({
    where: {
      OR: [{ ownerPartnerId: partner.id }, { id: { in: ids } }],
      ...(search ? { AND: [{ OR: [{ firstName: { contains: search } }, { lastName: { contains: search } }] }] } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 1000,
    select: CLIENT_SELECT,
  });
  const userIds = users.map((u) => u.id);
  const [cases, invoices, consents] = await Promise.all([
    caseListView({ partnerId: partner.id, clientId: { in: userIds } }),
    prisma.clientInvoice.findMany({ where: { clientId: { in: userIds } }, select: { clientId: true, status: true, grossCents: true, paidCents: true, dueDate: true, currency: true } }),
    partnerSharingConsent(userIds),
  ]);
  return users.map((u) => {
    const own = cases.filter((c) => c.clientId === u.id);
    const latest = own[0] ?? null;
    const inv = invoices.filter((i) => i.clientId === u.id);
    const extended = showExtended(partner.visibility, consents.get(u.id));
    const live = inv.filter((i) => i.status !== 'DRAFT' && i.status !== 'CANCELLED');
    return {
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      passport: mask(u.passportNumber),
      registeredAt: u.createdAt,
      /** The client belongs to this partner (sign-up link, portal or admin), not just one case. */
      owned: u.ownerPartnerId === partner.id,
      /** Signed in at least once / confirmed the e-mail (a client registered by the partner who did neither is still "invited"). */
      activated: !!u.emailVerifiedAt || u.sessions.length > 0,
      consent: consents.get(u.id) ?? null,
      extended,
      contact: extended ? { email: u.email, phone: u.phone } : null,
      payment: {
        state: paymentStateOf(inv),
        ...(extended
          ? { totalCents: live.reduce((a, i) => a + i.grossCents, 0), paidCents: live.reduce((a, i) => a + i.paidCents, 0), currency: live[0]?.currency ?? 'EUR' }
          : {}),
      },
      cases: own.length,
      latestCase: latest
        ? { id: latest.id, number: latest.number, status: latest.status, step: latest.step, nextAction: latest.nextAction, missingDocuments: latest.missingDocuments, refused: latest.refused, updatedAt: latest.updatedAt }
        : null,
    };
  });
};

/**
 * E-mails a client registered by a partner a 7-day "set your password" link (the regular reset-token flow),
 * naming the partner. Earlier unused tokens are dropped.
 */
export const sendClientInvite = async (user: { id: string; email: string; locale: Locale; firstName: string }, partnerName: string) => {
  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
  const token = crypto.randomBytes(32).toString('hex');
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: crypto.createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
  });
  const t = PARTNER_CLIENT_TEXT[user.locale] ?? PARTNER_CLIENT_TEXT.az;
  void sendMail(user.email, `Triad Vision · ${t.inviteTitle}`, renderEmail(t.inviteTitle, t.inviteBody(user.firstName, partnerName), { label: t.inviteCta, url: `${config.clientUrl}/reset-password?token=${token}` }));
};
