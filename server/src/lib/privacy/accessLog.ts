import type { Prisma, Role } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { bakuDay, dayRange } from '../reports/dates.js';
import { isImpersonating } from './impersonationContext.js';

/**
 * "Sənədlərimə kim baxıb?" — who accessed a client's documents and sensitive data.
 *
 * Sources (all derived, nothing duplicated):
 *  - DocumentAccessLog: staff previews / downloads of the client's case documents (GET /api/files/:id and drive
 *    copies of case documents). Logging is cheap: repeated views of the same document by the same person
 *    within 10 minutes only bump `count` / `lastAt` of one row.
 *  - AuditLog: masked-field reveals with their reason (SENSITIVE_REVEALED), embassy package builds, AI checks
 *    of the case or of a document.
 *  - ImpersonationSession: "view as client" support sessions (with the reason).
 * The client's own actions and system jobs (no actor) are never listed. Names are shown as first name +
 * last initial with the role ("Tofiq A., əməkdaş").
 */

export const AGGREGATE_MS = 10 * 60 * 1000;
export const ACCESS_KINDS = ['VIEW', 'DOWNLOAD', 'REVEAL', 'EMBASSY_PACKAGE', 'AI_CHECK', 'SUPPORT_VIEW'] as const;
export type AccessKind = (typeof ACCESS_KINDS)[number];

const AUDIT_KIND: Record<string, AccessKind> = {
  SENSITIVE_REVEALED: 'REVEAL',
  EMBASSY_PACKAGE_BUILT: 'EMBASSY_PACKAGE',
  AI_CASE_CONSISTENCY_RUN: 'AI_CHECK',
  AI_CASE_CONTRACT_RUN: 'AI_CHECK',
  AI_CASE_VIDEX_RUN: 'AI_CHECK',
  AI_CASE_VIDEX_PDF: 'AI_CHECK',
  AI_DOC_CHECK_RUN: 'AI_CHECK',
};
const AI_CHECK_NAME: Record<string, string> = {
  AI_CASE_CONSISTENCY_RUN: 'CONSISTENCY',
  AI_CASE_CONTRACT_RUN: 'CONTRACT',
  AI_CASE_VIDEX_RUN: 'VIDEX',
  AI_CASE_VIDEX_PDF: 'VIDEX',
  AI_DOC_CHECK_RUN: 'DOCUMENT',
};

/**
 * Records a staff preview / download of a client's document (fire and forget — never throws).
 * Skipped for the client themself, anonymous requests and "view as client" sessions (those are listed as
 * support views).
 */
export const logDocumentAccess = async (
  actor: { id: string; role: Role } | null | undefined,
  doc: { id: string; caseId: string | null; name: string; clientId: string },
  action: 'VIEW' | 'DOWNLOAD',
  source: 'FILES' | 'DRIVE',
  now = new Date(),
) => {
  try {
    if (!actor || actor.id === doc.clientId || isImpersonating()) return;
    const recent = await prisma.documentAccessLog.findFirst({
      where: { actorId: actor.id, documentId: doc.id, action, lastAt: { gte: new Date(now.getTime() - AGGREGATE_MS) } },
      orderBy: { lastAt: 'desc' },
      select: { id: true },
    });
    if (recent) {
      await prisma.documentAccessLog.update({ where: { id: recent.id }, data: { count: { increment: 1 }, lastAt: now } });
      return;
    }
    await prisma.documentAccessLog.create({
      data: { clientId: doc.clientId, actorId: actor.id, actorRole: actor.role, documentId: doc.id, caseId: doc.caseId, action, source, name: doc.name.slice(0, 255), firstAt: now, lastAt: now },
    });
  } catch (err) {
    console.error('[access-log] failed', err);
  }
};

/** Drive copy of a case document (DriveNode.documentId): resolves the client, then logs like a document view. */
export const logDriveDocumentAccess = async (actor: { id: string; role: Role } | null | undefined, documentId: string, name: string, action: 'VIEW' | 'DOWNLOAD') => {
  try {
    if (!actor || isImpersonating()) return;
    const doc = await prisma.document.findUnique({ where: { id: documentId }, select: { id: true, caseId: true, case: { select: { clientId: true } } } });
    if (doc) await logDocumentAccess(actor, { id: doc.id, caseId: doc.caseId, name, clientId: doc.case.clientId }, action, 'DRIVE');
  } catch (err) {
    console.error('[access-log] drive failed', err);
  }
};

export const accessQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  kind: z.enum(ACCESS_KINDS).optional(),
});

export interface AccessItem {
  id: string;
  at: Date;
  kind: AccessKind;
  actor: { name: string; role: Role | string | null; id?: string };
  /** Document name, field or case number. */
  what: string | null;
  /** Masked field name (reveals) or AI check type. */
  detail: string | null;
  reason: string | null;
  count: number;
}

const shortName = (u: { firstName: string; lastName: string } | null | undefined) => {
  if (!u) return '—';
  const last = u.lastName.trim();
  return `${u.firstName.trim()}${last ? ` ${last[0].toUpperCase()}.` : ''}`.trim();
};

const LIMIT = 1000;

/** The access log of one client, newest first (optionally with the full staff name for admins). */
export const buildAccessLog = async (clientId: string, q: z.infer<typeof accessQuery> = {}, opts: { fullNames?: boolean } = {}) => {
  const range = q.from || q.to ? dayRange(q.from ?? '1970-01-01', q.to ?? '2999-12-31') : null;
  const at = range ? { ...(q.from ? { gte: range.start } : {}), ...(q.to ? { lt: range.end } : {}) } : undefined;

  const cases = await prisma.case.findMany({ where: { clientId }, select: { id: true, number: true } });
  const caseIds = cases.map((c) => c.id);
  const caseNo = new Map(cases.map((c) => [c.id, c.number]));
  const [docs, insights] = await Promise.all([
    caseIds.length ? prisma.document.findMany({ where: { caseId: { in: caseIds } }, select: { id: true, originalName: true } }) : [],
    caseIds.length ? prisma.documentInsight.findMany({ where: { caseId: { in: caseIds } }, select: { id: true, documentId: true } }) : [],
  ]);
  const docName = new Map(docs.map((d) => [d.id, d.originalName]));
  const targets = [`user:${clientId}`, ...caseIds, ...docs.flatMap((d) => [d.id, `document:${d.id}`]), ...insights.map((i) => `insight:${i.id}`)];
  const insightDoc = new Map(insights.map((i) => [i.id, i.documentId]));

  const want = (k: AccessKind) => !q.kind || q.kind === k;
  const auditActions = Object.entries(AUDIT_KIND).filter(([, k]) => want(k)).map(([a]) => a);
  const actorSel = { select: { id: true, firstName: true, lastName: true, role: true } } as const;

  const [views, audits, sessions] = await Promise.all([
    want('VIEW') || want('DOWNLOAD')
      ? prisma.documentAccessLog.findMany({
          where: { clientId, actorId: { not: null }, NOT: { actorId: clientId }, ...(q.kind ? { action: q.kind } : {}), ...(at ? { lastAt: at } : {}) },
          orderBy: { lastAt: 'desc' },
          take: LIMIT,
        })
      : [],
    auditActions.length
      ? prisma.auditLog.findMany({
          where: { action: { in: auditActions }, target: { in: targets }, actorId: { not: null }, NOT: { actorId: clientId }, ...(at ? { createdAt: at } : {}) } satisfies Prisma.AuditLogWhereInput,
          orderBy: { createdAt: 'desc' },
          take: LIMIT,
          include: { actor: actorSel },
        })
      : [],
    want('SUPPORT_VIEW') ? prisma.impersonationSession.findMany({ where: { targetUserId: clientId, ...(at ? { startedAt: at } : {}) }, orderBy: { startedAt: 'desc' }, take: 200 }) : [],
  ]);

  const actorIds = [...new Set([...views.map((v) => v.actorId!), ...sessions.map((s) => s.adminId)])];
  const actors = new Map((actorIds.length ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, firstName: true, lastName: true, role: true } }) : []).map((u) => [u.id, u]));
  const actorOf = (u: { id: string; firstName: string; lastName: string; role: Role } | null | undefined, fallbackRole: string | null = null) => ({
    name: u ? (opts.fullNames ? `${u.firstName} ${u.lastName}`.trim() : shortName(u)) : '—',
    role: u?.role ?? fallbackRole,
    ...(opts.fullNames && u ? { id: u.id } : {}),
  });

  const items: AccessItem[] = [];
  for (const v of views) {
    items.push({ id: `doc:${v.id}`, at: v.lastAt, kind: v.action as AccessKind, actor: actorOf(actors.get(v.actorId!), v.actorRole), what: v.name, detail: v.source === 'DRIVE' ? 'DRIVE' : null, reason: null, count: v.count });
  }
  for (const a of audits) {
    if (!a.actor || a.actor.role === 'CLIENT') continue;
    const kind = AUDIT_KIND[a.action];
    const d = (a.details ?? {}) as Record<string, unknown>;
    const target = a.target ?? '';
    let what: string | null = null;
    let detail: string | null = null;
    if (a.action === 'SENSITIVE_REVEALED') {
      const [entity, id] = target.split(':');
      detail = typeof d.field === 'string' ? d.field : null;
      what = entity === 'document' ? (docName.get(id) ?? null) : entity === 'insight' ? (docName.get(insightDoc.get(id) ?? '') ?? null) : null;
    } else if (a.action === 'AI_DOC_CHECK_RUN') {
      what = docName.get(target) ?? null;
      detail = AI_CHECK_NAME[a.action];
    } else {
      what = caseNo.get(target) ?? null;
      detail = AI_CHECK_NAME[a.action] ?? null;
    }
    items.push({ id: `audit:${a.id}`, at: a.createdAt, kind, actor: actorOf(a.actor), what, detail, reason: typeof d.reason === 'string' && a.action === 'SENSITIVE_REVEALED' ? d.reason : null, count: 1 });
  }
  for (const s of sessions) {
    items.push({ id: `support:${s.id}`, at: s.startedAt, kind: 'SUPPORT_VIEW', actor: actorOf(actors.get(s.adminId)), what: null, detail: s.reason, reason: s.note ?? null, count: Math.max(1, s.requestCount) });
  }
  items.sort((a, b) => b.at.getTime() - a.at.getTime() || a.id.localeCompare(b.id));
  const list = items.slice(0, LIMIT);

  const days: { day: string; items: AccessItem[] }[] = [];
  for (const it of list) {
    const day = bakuDay(it.at);
    const last = days[days.length - 1];
    if (last?.day === day) last.items.push(it);
    else days.push({ day, items: [it] });
  }
  const counts = Object.fromEntries(ACCESS_KINDS.map((k) => [k, list.filter((i) => i.kind === k).length])) as Record<AccessKind, number>;
  return { total: list.length, counts, days };
};
