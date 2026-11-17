import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../../db.js';
import { HttpError } from '../http.js';
import { caseRowInScope, canWith, scopeWhere, withCaseScope } from './resolve.js';
import { classifyRoute } from './routeMap.js';
import { loadAccess } from './store.js';
import type { Action, Area, ResolvedAccess } from './types.js';

/**
 * Server-side enforcement. staffAccessGuard is mounted once on /api (app.ts) and runs for STAFF / ADMIN users
 * only: SUPER_ADMIN is never restricted and clients / employers / partners never reach a staff area check.
 *
 *  1. Area × action of the route (lib/access/routeMap.ts) against the user's permissions → 403 NO_PERMISSION.
 *  2. With a restricted case scope (ASSIGNED / TEAM), any case, document or client the request names (path,
 *     ?caseId=, body caseId / caseIds) must be in scope → 403 OUT_OF_SCOPE (+ caseId, so the UI can offer
 *     break-glass). Lists are filtered in the handlers with caseScopeWhere().
 *
 * With today's defaults (legacy template = every area, scope ALL) both steps always pass: zero behaviour change.
 */

/** A 403 HttpError (handlers may simply throw it); the guard also sends `extra` (area / action / caseId). */
export class AccessDenied extends HttpError {
  constructor(
    code: 'NO_PERMISSION' | 'OUT_OF_SCOPE',
    public extra: Record<string, unknown>,
  ) {
    super(403, code);
  }
}

const sendDenied = (res: Response, e: AccessDenied) => res.status(403).json({ error: e.code, message: e.code, ...e.extra });

const isRestrictable = (role: string | undefined) => role === 'STAFF' || role === 'ADMIN';

/** Paths that must never be scope-checked: the Access Center itself (break-glass names an out-of-scope case on purpose). */
const SCOPE_EXEMPT = /^\/admin\/(?:access|me\/permissions)(?:\/|$)/;

const CASE_ID_IN_PATH = /\/cases\/([^/?#]+)/g;
const CLIENT_ID_IN_PATH = /^\/admin\/(?:clients|german\/users|placement\/candidates)\/([^/?#]+)/;
const DOC_ID_IN_PATH = /^\/(?:files|documents)\/([^/?#]+)/;

const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;
const asIds = (v: unknown): string[] => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []).filter((x) => ID_RE.test(x)).slice(0, 500);

const outOfScope = (caseId: string) => new AccessDenied('OUT_OF_SCOPE', { caseId });

/** Throws OUT_OF_SCOPE when one of the cases exists and lies outside the user's scope (unknown ids: the route answers 404). */
export const assertCasesInScope = async (access: ResolvedAccess, caseIds: string[]) => {
  if (access.superAdmin || access.caseScope === 'ALL' || !caseIds.length) return;
  const rows = await prisma.case.findMany({ where: { id: { in: [...new Set(caseIds)] } }, select: { id: true, assignedStaffId: true, processingAssigneeId: true } });
  const bad = rows.find((c) => !caseRowInScope(access, c));
  if (bad) throw outOfScope(bad.id);
};

const assertClientInScope = async (access: ResolvedAccess, clientId: string) => {
  const client = await prisma.user.findUnique({ where: { id: clientId }, select: { id: true, role: true } });
  if (!client || client.role !== 'CLIENT') return; // not a client (or unknown): the route decides
  const visible = await prisma.case.count({ where: withCaseScope({ clientId }, scopeWhere(access)) });
  if (!visible) {
    const any = await prisma.case.findFirst({ where: { clientId }, select: { id: true }, orderBy: { createdAt: 'desc' } });
    throw new AccessDenied('OUT_OF_SCOPE', { clientId, ...(any ? { caseId: any.id } : {}) });
  }
};

export const enforceScope = async (req: Request, access: ResolvedAccess) => {
  if (access.superAdmin || access.caseScope === 'ALL') return;
  const path = req.path;
  if (SCOPE_EXEMPT.test(path)) return;
  const caseIds: string[] = [];
  for (const m of path.matchAll(CASE_ID_IN_PATH)) if (ID_RE.test(m[1])) caseIds.push(m[1]);
  caseIds.push(...asIds((req.query as Record<string, unknown> | undefined)?.caseId));
  const body = req.body as Record<string, unknown> | undefined;
  if (body && typeof body === 'object' && !Array.isArray(body)) caseIds.push(...asIds(body.caseId), ...asIds(body.caseIds));
  const doc = DOC_ID_IN_PATH.exec(path);
  if (doc && doc[1] !== 'cases' && ID_RE.test(doc[1])) {
    const d = await prisma.document.findUnique({ where: { id: doc[1] }, select: { caseId: true } });
    if (d) caseIds.push(d.caseId);
  }
  await assertCasesInScope(access, caseIds);
  const client = CLIENT_ID_IN_PATH.exec(path);
  if (client && ID_RE.test(client[1])) await assertClientInScope(access, client[1]);
};

export const staffAccessGuard = async (req: Request, res: Response, next: NextFunction) => {
  const user = req.user;
  if (!user || !isRestrictable(user.role)) return next();
  const cls = classifyRoute(req.method, req.path, req.query as Record<string, unknown>);
  if (!cls) return next(); // not a staff route (or unmapped: today's behaviour, reported by the unit test)
  try {
    const access = await loadAccess(user);
    if ('area' in cls && !canWith(access, cls.area, cls.action)) throw new AccessDenied('NO_PERMISSION', { area: cls.area, action: cls.action });
    await enforceScope(req, access);
    next();
  } catch (e) {
    if (e instanceof AccessDenied) return void sendDenied(res, e);
    next(e);
  }
};

/** Route-level check for code that needs a specific permission beyond the route map. */
export const requirePerm = (area: Area, action: Action) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return void res.status(401).json({ error: 'UNAUTHENTICATED', message: 'UNAUTHENTICATED' });
    const access = await loadAccess(req.user);
    if (!canWith(access, area, action)) throw new AccessDenied('NO_PERMISSION', { area, action });
    next();
  } catch (e) {
    if (e instanceof AccessDenied) return void sendDenied(res, e);
    next(e);
  }
};
