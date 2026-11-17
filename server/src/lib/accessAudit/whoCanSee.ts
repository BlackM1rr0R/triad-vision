import type { Role } from '@prisma/client';
import { prisma } from '../../db.js';
import { loadAccess } from '../access/store.js';
import { caseRowInScope, scopeWhere, toMatrix } from '../access/resolve.js';
import { normalizeOverrides } from '../access/templates.js';
import type { Action, Area, CaseScope } from '../access/types.js';
import { MASK_GROUPS, policyForViewer, type MaskGroup } from '../privacy/mask.js';
import { intersectPerms, parsePerms, type PartnerPerms } from '../partnerAccess/permissions.js';
import { loadPartnerPerms } from '../partnerAccess/context.js';
import { memberAccess } from '../companyAccess/service.js';
import type { CompanyPerms } from '../companyAccess/permissions.js';
import { csvSafe } from '../csvSafe.js';

/**
 * "Who can see what" (Access Center > Audit). Read-only: every value comes from the resolvers the enforcement
 * itself uses (lib/access loadAccess, lib/privacy/mask policyForViewer, lib/partnerAccess, lib/companyAccess), so
 * the matrix shown is exactly what the server enforces.
 */

export const STAFF_ROLES: Role[] = ['STAFF', 'ADMIN', 'SUPER_ADMIN'];
export const AUDITED_ROLES: Role[] = [...STAFF_ROLES, 'AGENT', 'COMPANY'];
export const INACTIVE_DAYS = 90;
const DAY = 24 * 60 * 60 * 1000;

export type AccountKind = 'STAFF' | 'PARTNER' | 'COMPANY';

export interface AuditRow {
  userId: string;
  name: string;
  email: string;
  role: Role;
  kind: AccountKind;
  isActive: boolean;
  twoFactor: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  staff?: {
    superAdmin: boolean;
    templateKey: string | null;
    templateId: string | null;
    overrides: number;
    manageAccess: boolean;
    matrix: Record<Area, Action[]>;
    caseScope: CaseScope;
    visibleCases: number;
    sensitive: { visible: MaskGroup[]; masked: MaskGroup[]; hidden: MaskGroup[] };
    breakGlass: { id: string; caseId: string; caseNumber: string | null; expiresAt: Date; reason: string }[];
  };
  partner?: { partnerId: string; partnerName: string; role: 'OWNER' | 'MEMBER'; template: string; perms: PartnerPerms; visibleCases: number; memberActive: boolean };
  company?: { companyId: string; companyName: string | null; role: string | null; isOwner: boolean; perms: CompanyPerms; visibleCases: number };
  reasons: string[];
}

// ─── Pure: why an account counts as "elevated" (access reviews) ─────────────

export const ELEVATED_TEMPLATES = ['legacy_admin', 'manager'];

export const elevatedReasons = (r: Pick<AuditRow, 'role' | 'isActive' | 'lastLoginAt' | 'createdAt' | 'staff' | 'partner' | 'company'>, now = new Date()): string[] => {
  const out: string[] = [];
  if (r.staff) {
    if (r.staff.superAdmin) out.push('SUPER_ADMIN');
    else {
      if (r.staff.manageAccess) out.push('MANAGE_ACCESS');
      if (r.staff.templateKey && ELEVATED_TEMPLATES.includes(r.staff.templateKey)) out.push('ELEVATED_TEMPLATE');
      if (r.staff.caseScope === 'ALL') out.push('SCOPE_ALL');
      if (r.staff.sensitive.visible.length) out.push('SENSITIVE_VISIBLE');
    }
  }
  if (r.partner && (r.partner.template === 'FULL' || r.partner.perms.clientList === 'full')) out.push('PARTNER_FULL');
  if (r.company) {
    if (r.company.isOwner || r.company.role === 'OWNER') out.push('COMPANY_OWNER');
    else if (r.company.role === 'ADMIN') out.push('COMPANY_ADMIN');
  }
  const last = r.lastLoginAt ?? r.createdAt;
  if (r.isActive && now.getTime() - last.getTime() > INACTIVE_DAYS * DAY) out.push('INACTIVE');
  return out;
};

// ─── Database ─────────────────────────────────────────────────────────────

const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`.trim();

const lastLogins = async (ids: string[]) => {
  if (!ids.length) return new Map<string, Date | null>();
  const rows = await prisma.session.groupBy({ by: ['userId'], where: { userId: { in: ids } }, _max: { createdAt: true } });
  return new Map(rows.map((r) => [r.userId, r._max.createdAt]));
};

const staffDetail = async (u: { id: string; role: Role }, now: Date): Promise<NonNullable<AuditRow['staff']>> => {
  const a = await loadAccess(u);
  const [row, visibleCases, policy, grants] = await Promise.all([
    prisma.staffAccess.findUnique({ where: { userId: u.id }, select: { overrides: true } }),
    prisma.case.count({ where: scopeWhere(a) }),
    policyForViewer({ id: u.id, role: u.role }),
    prisma.breakGlassGrant.findMany({ where: { userId: u.id, revokedAt: null, expiresAt: { gt: now } }, select: { id: true, caseId: true, expiresAt: true, reason: true }, orderBy: { expiresAt: 'asc' } }),
  ]);
  const numbers = grants.length ? new Map((await prisma.case.findMany({ where: { id: { in: grants.map((g) => g.caseId) } }, select: { id: true, number: true } })).map((c) => [c.id, c.number])) : new Map<string, string>();
  return {
    superAdmin: a.superAdmin,
    templateKey: a.templateKey,
    templateId: a.templateId,
    overrides: normalizeOverrides(row?.overrides).length,
    manageAccess: a.manageAccess,
    matrix: toMatrix(a),
    caseScope: a.caseScope,
    visibleCases,
    sensitive: {
      visible: MASK_GROUPS.filter((g) => !policy.masked.has(g) && !policy.hidden.has(g)),
      masked: MASK_GROUPS.filter((g) => policy.masked.has(g)),
      hidden: MASK_GROUPS.filter((g) => policy.hidden.has(g)),
    },
    breakGlass: grants.map((g) => ({ ...g, caseNumber: numbers.get(g.caseId) ?? null })),
  };
};

const partnerDetail = async (userId: string): Promise<AuditRow['partner'] | undefined> => {
  const own = await prisma.referralPartner.findUnique({ where: { userId }, select: { id: true, name: true, visibility: true } });
  if (own) {
    const { template, perms } = await loadPartnerPerms(own);
    return { partnerId: own.id, partnerName: own.name, role: 'OWNER', template, perms, visibleCases: await prisma.case.count({ where: { partnerId: own.id } }), memberActive: true };
  }
  const member = await prisma.partnerMember.findUnique({ where: { userId } });
  if (!member) return undefined;
  const partner = await prisma.referralPartner.findUnique({ where: { id: member.partnerId }, select: { id: true, name: true, visibility: true } });
  if (!partner) return undefined;
  const { template, perms: owner } = await loadPartnerPerms(partner);
  const perms = intersectPerms(owner, parsePerms(member.perms));
  return {
    partnerId: partner.id,
    partnerName: partner.name,
    role: 'MEMBER',
    template,
    perms,
    visibleCases: member.active ? await prisma.case.count({ where: { partnerId: partner.id } }) : 0,
    memberActive: member.active,
  };
};

const companyDetail = async (userId: string): Promise<AuditRow['company'] | undefined> => {
  const m = await memberAccess(userId);
  if (!m) return undefined;
  const [company, visibleCases] = await Promise.all([
    prisma.company.findUnique({ where: { id: m.companyId }, select: { name: true } }),
    prisma.case.count({ where: { companyId: m.companyId } }),
  ]);
  return { companyId: m.companyId, companyName: company?.name ?? null, role: m.role, isOwner: m.isOwner, perms: m.perms, visibleCases };
};

export interface AuditListQuery {
  kind?: AccountKind;
  search?: string;
  /** Only accounts with at least one elevated reason. */
  elevated?: boolean;
  includeInactive?: boolean;
  limit?: number;
}

const kindOf = (role: Role): AccountKind => (role === 'AGENT' ? 'PARTNER' : role === 'COMPANY' ? 'COMPANY' : 'STAFF');
const rolesOf = (kind?: AccountKind): Role[] => (kind === 'PARTNER' ? ['AGENT'] : kind === 'COMPANY' ? ['COMPANY'] : kind === 'STAFF' ? STAFF_ROLES : AUDITED_ROLES);

/** One audit row per account (staff, partner logins, company logins). */
export const auditRows = async (q: AuditListQuery = {}, now = new Date()): Promise<AuditRow[]> => {
  const users = await prisma.user.findMany({
    where: {
      role: { in: rolesOf(q.kind) },
      ...(q.includeInactive ? {} : { isActive: true }),
      ...(q.search ? { OR: [{ email: { contains: q.search } }, { firstName: { contains: q.search } }, { lastName: { contains: q.search } }] } : {}),
    },
    select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true, totpEnabledAt: true, createdAt: true },
    orderBy: [{ role: 'asc' }, { firstName: 'asc' }],
    take: Math.min(q.limit ?? 500, 2000),
  });
  const logins = await lastLogins(users.map((u) => u.id));
  const rows: AuditRow[] = [];
  for (const u of users) {
    const kind = kindOf(u.role);
    const base = {
      userId: u.id,
      name: fullName(u),
      email: u.email,
      role: u.role,
      kind,
      isActive: u.isActive,
      twoFactor: !!u.totpEnabledAt,
      lastLoginAt: logins.get(u.id) ?? null,
      createdAt: u.createdAt,
    };
    const row: AuditRow = {
      ...base,
      ...(kind === 'STAFF' ? { staff: await staffDetail(u, now) } : {}),
      ...(kind === 'PARTNER' ? { partner: await partnerDetail(u.id) } : {}),
      ...(kind === 'COMPANY' ? { company: await companyDetail(u.id) } : {}),
      reasons: [],
    };
    row.reasons = elevatedReasons(row, now);
    if (q.elevated && !row.reasons.length) continue;
    rows.push(row);
  }
  return rows;
};

/** Reverse view: who can open a case (or every case of a client). */
export const whoCanAccessCase = async (caseId: string, now = new Date()) => {
  const c = await prisma.case.findUnique({
    where: { id: caseId },
    select: { id: true, number: true, clientId: true, assignedStaffId: true, processingAssigneeId: true, partnerId: true, companyId: true },
  });
  if (!c) return null;
  const staff = await prisma.user.findMany({ where: { role: { in: STAFF_ROLES }, isActive: true }, select: { id: true, email: true, firstName: true, lastName: true, role: true }, orderBy: { firstName: 'asc' } });
  const staffOut: { userId: string; name: string; role: Role; via: string; canView: boolean }[] = [];
  for (const u of staff) {
    const a = await loadAccess(u);
    const inScope = caseRowInScope(a, c);
    const canView = inScope && (a.superAdmin || a.allowed.has('cases:view'));
    if (!canView) continue;
    const via = a.superAdmin
      ? 'SUPER_ADMIN'
      : a.breakGlassCaseIds.includes(c.id) && a.caseScope !== 'ALL' && c.assignedStaffId !== u.id && c.processingAssigneeId !== u.id
        ? 'BREAK_GLASS'
        : a.caseScope === 'ALL'
          ? 'SCOPE_ALL'
          : a.caseScope === 'TEAM'
            ? 'TEAM'
            : 'ASSIGNED';
    staffOut.push({ userId: u.id, name: fullName(u), role: u.role, via, canView });
  }
  const partners: { userId: string; name: string; role: 'OWNER' | 'MEMBER'; partnerName: string; perms: PartnerPerms }[] = [];
  if (c.partnerId) {
    const p = await prisma.referralPartner.findUnique({ where: { id: c.partnerId }, select: { id: true, name: true, visibility: true, userId: true, user: { select: { id: true, firstName: true, lastName: true, isActive: true } } } });
    if (p) {
      const { perms } = await loadPartnerPerms(p);
      if (p.user?.isActive) partners.push({ userId: p.user.id, name: fullName(p.user), role: 'OWNER', partnerName: p.name, perms });
      const members = await prisma.partnerMember.findMany({ where: { partnerId: p.id, active: true } });
      const mu = members.length ? await prisma.user.findMany({ where: { id: { in: members.map((m) => m.userId) }, isActive: true }, select: { id: true, firstName: true, lastName: true } }) : [];
      const byId = new Map(mu.map((u) => [u.id, u]));
      for (const m of members) {
        const u = byId.get(m.userId);
        if (u) partners.push({ userId: u.id, name: fullName(u), role: 'MEMBER', partnerName: p.name, perms: intersectPerms(perms, parsePerms(m.perms)) });
      }
    }
  }
  const company: { userId: string; name: string; role: string | null; isOwner: boolean; viewWorkers: boolean; viewPersonalDocuments: boolean }[] = [];
  if (c.companyId) {
    const logins = await prisma.user.findMany({ where: { role: 'COMPANY', companyId: c.companyId, isActive: true }, select: { id: true, firstName: true, lastName: true } });
    for (const u of logins) {
      const m = await memberAccess(u.id);
      if (m) company.push({ userId: u.id, name: fullName(u), role: m.role, isOwner: m.isOwner, viewWorkers: m.perms.viewWorkers, viewPersonalDocuments: m.perms.viewPersonalDocuments });
    }
  }
  void now;
  return { case: { id: c.id, number: c.number, clientId: c.clientId }, staff: staffOut, partners, company };
};

/** Reverse view for a client: the union over the client's cases. */
export const whoCanAccessClient = async (clientId: string) => {
  const cases = await prisma.case.findMany({ where: { clientId }, select: { id: true }, orderBy: { createdAt: 'desc' }, take: 20 });
  const out = [];
  for (const c of cases) {
    const r = await whoCanAccessCase(c.id);
    if (r) out.push(r);
  }
  return out;
};

// ─── CSV ──────────────────────────────────────────────────────────────────

const cell = (v: unknown) => {
  const s = csvSafe(v == null ? '' : v instanceof Date ? v.toISOString() : String(v));
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * CSV of the audit rows (semicolon, UTF-8 BOM, like the other admin exports). No personal data beyond the account
 * itself; e-mail addresses go through `maskEmail` when the viewer's policy masks contact data.
 */
export const auditCsv = (rows: AuditRow[], opts: { maskEmail?: (e: string) => string } = {}) => {
  const head = ['name', 'email', 'role', 'kind', 'active', '2fa', 'lastLogin', 'template', 'overrides', 'manageAccess', 'caseScope', 'visibleCases', 'permissions', 'sensitiveVisible', 'sensitiveMasked', 'sensitiveHidden', 'breakGlassActive', 'partner', 'company', 'reasons'];
  const lines = rows.map((r) => {
    const perms = r.staff
      ? Object.entries(r.staff.matrix)
          .filter(([, a]) => a.length)
          .map(([k, a]) => `${k}:${a.join('/')}`)
          .join(' ')
      : r.partner
        ? Object.entries(r.partner.perms)
            .map(([k, v]) => `${k}:${String(v)}`)
            .join(' ')
        : r.company
          ? Object.entries(r.company.perms)
              .filter(([, v]) => v)
              .map(([k]) => k)
              .join(' ')
          : '';
    return [
      r.name,
      opts.maskEmail ? opts.maskEmail(r.email) : r.email,
      r.role,
      r.kind,
      r.isActive ? 'yes' : 'no',
      r.twoFactor ? 'yes' : 'no',
      r.lastLoginAt,
      r.staff ? (r.staff.superAdmin ? 'SUPER_ADMIN' : (r.staff.templateKey ?? r.staff.templateId ?? '')) : (r.partner?.template ?? r.company?.role ?? ''),
      r.staff?.overrides ?? '',
      r.staff ? (r.staff.manageAccess ? 'yes' : 'no') : '',
      r.staff?.caseScope ?? '',
      r.staff?.visibleCases ?? r.partner?.visibleCases ?? r.company?.visibleCases ?? '',
      perms,
      r.staff?.sensitive.visible.join(' ') ?? '',
      r.staff?.sensitive.masked.join(' ') ?? '',
      r.staff?.sensitive.hidden.join(' ') ?? '',
      r.staff?.breakGlass.length ?? '',
      r.partner ? `${r.partner.partnerName} (${r.partner.role})` : '',
      r.company ? `${r.company.companyName ?? ''}${r.company.isOwner ? ' (owner)' : ''}` : '',
      r.reasons.join(' '),
    ]
      .map(cell)
      .join(';');
  });
  return `﻿${[head.join(';'), ...lines].join('\r\n')}\r\n`;
};
