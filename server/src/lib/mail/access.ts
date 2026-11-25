import type { Request } from 'express';
import type { MailAccount, MailGrantLevel } from '@prisma/client';
import { prisma } from '../../db.js';
import { hasMinRole, type AuthUser } from '../../middleware/auth.js';
import { audit } from '../audit.js';
import { HttpError, notFound } from '../http.js';
import { publish } from '../messaging/realtime.js';
import { isImpersonating } from '../privacy/impersonationContext.js';

/**
 * Who may open which workspace mailbox (MailAccount). One rule, used by every /api/mail route:
 *
 *  - OWNER  the staff member who added the mailbox: everything (settings, rules, labels, send, delete).
 *  - SEND   a colleague with an "Oxu və göndər" grant: read, reply / send as the mailbox, drafts, message actions
 *           (read/unread, flag, move, archive, snooze, link to a case). No settings, rules, labels, and no deleting
 *           (trash, delete, draft delete: owner only, 403 MAIL_DELETE_OWNER_ONLY).
 *  - READ   a colleague with an "Oxu" grant, and every SUPER_ADMIN without a grant: list, open, search, download
 *           attachments, see sync status. Nothing that changes the mailbox (not even "mark as read").
 *  - null   no access: the mailbox is indistinguishable from a missing one (404, as before).
 *
 * Grants are given and revoked only by a SUPER_ADMIN (routes/admin/accessMailboxes.ts) and audit-logged; opening a
 * mailbox that is not one's own is audit-logged once per day per mailbox (MAIL_MAILBOX_OPENED).
 */
export type MailAccessLevel = 'OWNER' | 'SEND' | 'READ';
export const GRANT_LEVELS = ['READ', 'SEND'] as const satisfies readonly MailGrantLevel[];

type Viewer = Pick<AuthUser, 'id' | 'role'>;

/** Pure rule (unit-tested): the viewer's level on a mailbox owned by `ownerId`, given the viewer's grant (if any). */
export const resolveMailAccess = (viewer: Viewer, ownerId: string, grant: MailGrantLevel | null | undefined): MailAccessLevel | null => {
  if (!hasMinRole(viewer.role, 'STAFF')) return null; // clients, employers, partners: never (the router is STAFF+ anyway)
  if (ownerId === viewer.id) return 'OWNER';
  if (grant === 'SEND') return 'SEND';
  if (grant === 'READ') return 'READ';
  if (viewer.role === 'SUPER_ADMIN') return 'READ';
  return null;
};

/** Reply / send as the mailbox, drafts, message actions. */
export const canSend = (level: MailAccessLevel | null | undefined) => level === 'OWNER' || level === 'SEND';
/** Trash, delete, delete a draft: the owner only (a SEND grant never deletes). */
export const canDelete = (level: MailAccessLevel | null | undefined) => level === 'OWNER';
export const canRead = (level: MailAccessLevel | null | undefined) => !!level;

export class MailReadOnlyError extends HttpError {
  constructor() {
    super(403, 'MAIL_READ_ONLY', 'You may only read this mailbox.');
  }
}

/** Levels of the viewer on the given mailboxes (missing / no access = null). */
export const mailAccessMap = async (viewer: Viewer, accountIds: string[]) => {
  const ids = [...new Set(accountIds)];
  const out = new Map<string, MailAccessLevel | null>();
  if (!ids.length) return out;
  const [accounts, grants] = await Promise.all([
    prisma.mailAccount.findMany({ where: { id: { in: ids } }, select: { id: true, userId: true } }),
    prisma.mailAccountGrant.findMany({ where: { accountId: { in: ids }, userId: viewer.id }, select: { accountId: true, level: true } }),
  ]);
  const grantOf = new Map(grants.map((g) => [g.accountId, g.level]));
  for (const id of ids) {
    const a = accounts.find((x) => x.id === id);
    out.set(id, a ? resolveMailAccess(viewer, a.userId, grantOf.get(id)) : null);
  }
  return out;
};

/**
 * Throws unless the viewer has at least `need` on every mailbox: no access at all → 404 (as for a missing mailbox),
 * read-only → 403 MAIL_READ_ONLY.
 */
export const assertMailAccess = async (viewer: Viewer, accountIds: string[], need: 'read' | 'send' | 'owner' | 'delete', notFoundCode = 'MAIL_MESSAGE_NOT_FOUND') => {
  const map = await mailAccessMap(viewer, accountIds);
  for (const level of map.values()) {
    if (!level) throw notFound(notFoundCode);
    if (need === 'send' && !canSend(level)) throw new MailReadOnlyError();
    if (need === 'owner' && level !== 'OWNER') throw new HttpError(403, 'MAIL_OWNER_ONLY');
    if (need === 'delete' && !canDelete(level)) throw new HttpError(403, 'MAIL_DELETE_OWNER_ONLY', 'Only the mailbox owner may delete messages.');
  }
  return map;
};

/** One mailbox with the viewer's level, or 404 / 403 as in assertMailAccess. */
export const loadMailAccount = async (accountId: string, viewer: Viewer, need: 'read' | 'send' = 'read'): Promise<{ account: MailAccount; level: MailAccessLevel }> => {
  const account = await prisma.mailAccount.findUnique({ where: { id: accountId } });
  if (!account) throw notFound('MAIL_ACCOUNT_NOT_FOUND');
  const grant = account.userId === viewer.id ? null : await prisma.mailAccountGrant.findUnique({ where: { accountId_userId: { accountId, userId: viewer.id } }, select: { level: true } });
  const level = resolveMailAccess(viewer, account.userId, grant?.level);
  if (!level) throw notFound('MAIL_ACCOUNT_NOT_FOUND');
  if (need === 'send' && !canSend(level)) throw new MailReadOnlyError();
  return { account, level };
};

export interface SharedMailbox {
  id: string;
  email: string;
  displayName: string | null;
  access: MailAccessLevel;
  owner: { id: string; firstName: string; lastName: string };
}

/** Every mailbox the viewer may open that is not their own (grants; a SUPER_ADMIN sees every mailbox). */
export const sharedMailboxes = async (viewer: Viewer): Promise<SharedMailbox[]> => {
  if (!hasMinRole(viewer.role, 'STAFF')) return [];
  const grants = await prisma.mailAccountGrant.findMany({ where: { userId: viewer.id }, select: { accountId: true, level: true } });
  const grantOf = new Map(grants.map((g) => [g.accountId, g.level]));
  const superAdmin = viewer.role === 'SUPER_ADMIN';
  if (!superAdmin && !grants.length) return [];
  const rows = await prisma.mailAccount.findMany({
    where: { userId: { not: viewer.id }, ...(superAdmin ? {} : { id: { in: [...grantOf.keys()] } }) },
    select: { id: true, email: true, displayName: true, userId: true, user: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: [{ user: { firstName: 'asc' } }, { email: 'asc' }],
  });
  const out: SharedMailbox[] = [];
  for (const r of rows) {
    const access = resolveMailAccess(viewer, r.userId, grantOf.get(r.id));
    if (access) out.push({ id: r.id, email: r.email, displayName: r.displayName, access, owner: r.user });
  }
  return out;
};

// ─── Realtime audience ─────────────────────────────────────────────────

/**
 * Who gets the realtime events of a mailbox ('mail.new', 'mail.updated'): its owner and every colleague with a READ or
 * SEND grant who is still staff — the owner's events with the same payloads (sender and subject at most, never a
 * body). A SUPER_ADMIN without a grant reads every mailbox but is not pushed to (the mail page polls). Never throws:
 * the owner alone when the grants cannot be read.
 */
export const mailboxAudience = async (accountId: string, ownerId: string): Promise<string[]> => {
  try {
    const grants = await prisma.mailAccountGrant.findMany({ where: { accountId }, select: { userId: true, user: { select: { role: true } } } });
    return [...new Set([ownerId, ...grants.filter((g) => hasMinRole(g.user.role, 'STAFF')).map((g) => g.userId)])];
  } catch (err) {
    console.error('[mail] grants of a mailbox could not be read', accountId, err);
    return [ownerId];
  }
};

/** Publishes a mail event of a mailbox to its owner and grantees (mailboxAudience). */
export const publishMailbox = async (account: { id: string; userId: string }, type: 'mail.new' | 'mail.updated', payload: Record<string, unknown>) => {
  publish(await mailboxAudience(account.id, account.userId), type, payload);
};

// ─── "Opened someone else's mailbox" audit (once per viewer, mailbox and day) ───

const opened = new Set<string>();
let openedDay = '';
const dayOf = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Audit-logs MAIL_MAILBOX_OPENED the first time a day the viewer opens a mailbox that is not their own (list, message,
 * attachment). Owners are never logged; "view as client" never writes (the mail router is staff-only anyway).
 */
export const noteMailboxOpened = async (req: Pick<Request, 'user' | 'ip' | 'impersonator'>, accountId: string, level: MailAccessLevel) => {
  if (level === 'OWNER' || !req.user || isImpersonating() || req.impersonator) return;
  const now = new Date();
  const day = dayOf(now);
  if (day !== openedDay) {
    opened.clear();
    openedDay = day;
  }
  const key = `${req.user.id}|${accountId}`;
  if (opened.has(key)) return;
  opened.add(key);
  // Another process (or a restart) may have written today's row already.
  const since = new Date(`${day}T00:00:00.000Z`);
  const existing = await prisma.auditLog.findFirst({ where: { action: 'MAIL_MAILBOX_OPENED', actorId: req.user.id, target: accountId, createdAt: { gte: since } }, select: { id: true } });
  if (existing) return;
  const account = await prisma.mailAccount.findUnique({ where: { id: accountId }, select: { email: true, userId: true } });
  if (!account) return;
  await audit(req, 'MAIL_MAILBOX_OPENED', accountId, { email: account.email, ownerId: account.userId, access: level });
};

/** Tests: forget the in-memory "already logged today" set. */
export const resetMailboxOpenLog = () => {
  opened.clear();
  openedDay = '';
};
