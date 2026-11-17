import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../../db.js';
import { forbidden } from '../http.js';
import { memberAccess } from './service.js';
import { allowedByNeed, isGuardedPath, isSalaryKey, matchRule, redactSalaries, signerAllowed, type SignKind } from './rules.js';
import { hasAllPerms, type CompanyPerms } from './permissions.js';

/**
 * Employer roles, enforced for every request of a COMPANY login to the employer endpoints (mounted once in app.ts,
 * after loadUser / impersonation). Other users pass straight through. Members with every permission (the owner,
 * OWNER / ADMIN roles) and STANDARD members (no role stored = today's access) see no difference at all.
 *
 * Restricted members get:
 *   - 403 COMPANY_PERMISSION_REQUIRED on endpoints whose permission they lack (rules.ts; unmapped → refused),
 *   - salary figures removed from JSON responses and ignored in request bodies without `viewSalaries`,
 *   - worker documents cut from the worker drawer without `viewPersonalDocuments` / `viewContracts`,
 *   - only the signature requests they may see in /api/signatures/my.
 */

const apiPathOf = (req: Request) => {
  const p = req.path;
  return p.toLowerCase().startsWith('/api/') ? p.slice(4) : null;
};

/** What a signature request is about: AVV, EzB (official form) or a contract / other document. */
export const signKindOf = async (requestIds: string[]): Promise<Map<string, SignKind>> => {
  const ids = [...new Set(requestIds)];
  const out = new Map<string, SignKind>(ids.map((id) => [id, 'CONTRACT']));
  if (!ids.length) return out;
  const [avv, forms] = await Promise.all([
    prisma.avvAgreement.findMany({ where: { signatureRequestId: { in: ids } }, select: { signatureRequestId: true } }),
    prisma.officialFormFill.findMany({ where: { signatureRequestId: { in: ids } }, select: { signatureRequestId: true } }),
  ]);
  for (const f of forms) if (f.signatureRequestId) out.set(f.signatureRequestId, 'EZB');
  for (const a of avv) if (a.signatureRequestId) out.set(a.signatureRequestId, 'AVV');
  return out;
};

const deny = () => forbidden('COMPANY_PERMISSION_REQUIRED');

const stripBodySalaries = (req: Request) => {
  const body = req.body as unknown;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return;
  for (const k of Object.keys(body as Record<string, unknown>)) if (isSalaryKey(k)) delete (body as Record<string, unknown>)[k];
};

/** Rewrites res.json once (other wrappers, e.g. masking, keep working on the result). */
const transformJson = (res: Response, fn: (body: unknown) => unknown) => {
  const json = res.json.bind(res);
  res.json = (body: unknown) => json(res.statusCode < 400 ? fn(body) : body);
};

/** GET /company/workers (panel) and /company/workers/:caseId (drawer). */
const workersPath = /^\/company\/workers(\/[^/]+)?\/?$/i;

type Item = { kind?: string };
const itemAllowed = (i: Item, perms: CompanyPerms, documents: boolean) => {
  if (i.kind === 'SIGNATURE') return perms.viewContracts && (!documents || perms.viewPersonalDocuments);
  if (i.kind === 'FORM') return documents ? perms.viewPersonalDocuments : perms.fillEzb;
  return true;
};

/**
 * Worker panel / drawer of a restricted member: contract and form entries (titles, sign links) only with the
 * matching permission; the drawer's document list only with `viewPersonalDocuments`.
 */
export const trimWorkerItems = (body: unknown, perms: CompanyPerms): unknown => {
  if (!body || typeof body !== 'object') return body;
  const trimRow = (row: unknown) => {
    const r = row as { openItems?: Item[] } | null;
    return r && Array.isArray(r.openItems) ? { ...r, openItems: r.openItems.filter((i) => itemAllowed(i, perms, false)) } : row;
  };
  const b = body as { items?: unknown[]; worker?: unknown; documents?: Item[] };
  const out: Record<string, unknown> = { ...b };
  if (Array.isArray(b.items)) out.items = b.items.map(trimRow);
  if (b.worker) out.worker = trimRow(b.worker);
  if (Array.isArray(b.documents)) out.documents = b.documents.filter((d) => itemAllowed(d, perms, true));
  return out;
};

export const companyAccessGuard = async (req: Request, res: Response, next: NextFunction) => {
  if (req.user?.role !== 'COMPANY' || req.method === 'OPTIONS') return next();
  const path = apiPathOf(req);
  if (!path || !isGuardedPath(path)) return next();
  try {
    const access = await memberAccess(req.user.id);
    // No company: the routers answer NO_COMPANY themselves.
    if (!access) return next();
    const perms: CompanyPerms = access.perms;
    res.locals.companyAccess = access;
    // STANDARD (no role stored) is today's access, untouched; so is everyone with every permission.
    if (access.role === null || hasAllPerms(perms)) return next();

    const rule = matchRule(req.method, path);
    const need = rule?.need ?? null;

    if (need?.kind === 'signer') {
      const signerId = path.split('/').filter(Boolean)[2] ?? '';
      const s = await prisma.signatureSigner.findUnique({ where: { id: signerId }, select: { userId: true, requestId: true } });
      // Not the caller's signer: the router answers 404 as for everyone.
      if (s && s.userId === req.user.id) {
        const kind = (await signKindOf([s.requestId])).get(s.requestId) ?? 'CONTRACT';
        if (!signerAllowed(kind, need.action, perms)) return next(deny());
      }
      return next();
    }

    if (need?.kind === 'signerList') {
      const mine = await prisma.signatureSigner.findMany({ where: { userId: req.user.id }, select: { requestId: true } });
      const kinds = await signKindOf(mine.map((m) => m.requestId));
      const hidden = new Set([...kinds].filter(([, k]) => !signerAllowed(k, 'view', perms)).map(([id]) => id));
      if (hidden.size) {
        transformJson(res, (body) => {
          const b = body as { items?: { requestId?: string }[] } | null;
          return b && Array.isArray(b.items) ? { ...b, items: b.items.filter((i) => !hidden.has(String(i.requestId))) } : body;
        });
      }
      return next();
    }

    if (!allowedByNeed(need, perms)) return next(deny());

    const isCompanyApi = path.toLowerCase().startsWith('/company');
    if (isCompanyApi && !perms.viewSalaries) {
      if (req.method !== 'GET' && req.method !== 'HEAD') stripBodySalaries(req);
      transformJson(res, redactSalaries);
    }
    if (req.method === 'GET' && workersPath.test(path)) transformJson(res, (body) => trimWorkerItems(body, perms));
    // Dashboard: the "awaiting your decision" candidate cards only with candidate access.
    if (req.method === 'GET' && /^\/company\/dashboard\/?$/i.test(path) && !perms.viewCandidatePool) {
      transformJson(res, (body) => (body && typeof body === 'object' ? { ...(body as Record<string, unknown>), awaitingDecision: [] } : body));
    }
    next();
  } catch (err) {
    next(err);
  }
};
