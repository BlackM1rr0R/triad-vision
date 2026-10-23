import type { CaseStatus, Locale, Prisma, VisaType } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { FINAL_STATUSES } from '../caseFlow.js';
import { notifyUser } from '../notifications.js';
import { assignmentTexts } from './texts.js';

/**
 * Automatic case assignment (Setting `autoAssign`, edited in Admin → Automation → Assignment; the older
 * Settings card writes the same key). Strategy "leastLoaded": open cases weighted by status, among eligible
 * staff (pool, auto-assign on, not on leave, language, visa types, max open cases, working days), ties broken
 * round-robin (whoever got a case least recently). "roundRobin" ignores the load. Staff preferences live in
 * StaffPreferences (empty lists = no restriction).
 */

export const AUTO_ASSIGN_KEY = 'autoAssign';

export const OPEN_STATUSES = [
  'DOCUMENTS_PENDING', 'DOCUMENTS_REVIEW', 'CONTRACT_SENT', 'CONTRACT_SIGNED', 'EMBASSY_DOCUMENTS', 'EMBASSY_REVIEW', 'APPOINTMENT_SCHEDULED', 'DECISION_PENDING',
] as const satisfies readonly CaseStatus[];
type OpenStatus = (typeof OPEN_STATUSES)[number];

/** Default weights: statuses where staff has work to do count more than those waiting for the client / embassy. */
export const DEFAULT_WEIGHTS: Record<OpenStatus, number> = {
  DOCUMENTS_PENDING: 0.5,
  DOCUMENTS_REVIEW: 1.5,
  CONTRACT_SENT: 0.5,
  CONTRACT_SIGNED: 1,
  EMBASSY_DOCUMENTS: 1,
  EMBASSY_REVIEW: 1.5,
  APPOINTMENT_SCHEDULED: 1,
  DECISION_PENDING: 0.5,
};

const weightsSchema = z.object(Object.fromEntries(OPEN_STATUSES.map((s) => [s, z.number().min(0).max(10).optional()])) as Record<OpenStatus, z.ZodOptional<z.ZodNumber>>);

export const assignmentConfigSchema = z.object({
  mode: z.enum(['off', 'roundRobin', 'leastLoaded']),
  staffIds: z.array(z.string().max(40)).max(200).optional(),
  matchLanguage: z.boolean().optional(),
  matchVisaType: z.boolean().optional(),
  respectMaxOpen: z.boolean().optional(),
  respectWorkingDays: z.boolean().optional(),
  weights: weightsSchema.optional(),
  /** New inquiries / leads get a follow-up task for an eligible staff member. */
  inquiries: z.boolean().optional(),
  /** Hand open cases over while their owner is on approved leave, and back afterwards. */
  handover: z.boolean().optional(),
});

export interface AssignmentConfig {
  mode: 'off' | 'roundRobin' | 'leastLoaded';
  staffIds?: string[];
  matchLanguage: boolean;
  matchVisaType: boolean;
  respectMaxOpen: boolean;
  respectWorkingDays: boolean;
  weights: Record<OpenStatus, number>;
  inquiries: boolean;
  handover: boolean;
}
/** Kept for the older import path (lib/ops/autoAssign). */
export type AutoAssignConfig = AssignmentConfig;

export const normalizeConfig = (raw: unknown): AssignmentConfig => {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const w = (v.weights && typeof v.weights === 'object' ? v.weights : {}) as Record<string, unknown>;
  const bool = (x: unknown, d: boolean) => (typeof x === 'boolean' ? x : d);
  return {
    mode: v.mode === 'roundRobin' || v.mode === 'leastLoaded' ? v.mode : 'off',
    staffIds: Array.isArray(v.staffIds) ? v.staffIds.filter((s): s is string => typeof s === 'string') : undefined,
    matchLanguage: bool(v.matchLanguage, true),
    matchVisaType: bool(v.matchVisaType, true),
    respectMaxOpen: bool(v.respectMaxOpen, true),
    respectWorkingDays: bool(v.respectWorkingDays, true),
    weights: Object.fromEntries(OPEN_STATUSES.map((s) => [s, typeof w[s] === 'number' && (w[s] as number) >= 0 ? (w[s] as number) : DEFAULT_WEIGHTS[s]])) as Record<OpenStatus, number>,
    inquiries: bool(v.inquiries, false),
    handover: bool(v.handover, false),
  };
};

export const readAssignmentConfig = async (tx: Prisma.TransactionClient = prisma): Promise<AssignmentConfig> =>
  normalizeConfig((await tx.setting.findUnique({ where: { key: AUTO_ASSIGN_KEY } }))?.value);
export const readAutoAssign = readAssignmentConfig;

// ─── Staff preferences ─────────────────────────────────────────────────

export const LOCALE_VALUES = ['az', 'de', 'en', 'ru'] as const;
export const VISA_TYPE_VALUES = ['WORK', 'AUSBILDUNG', 'WEITERBILDUNG', 'JOB_SEEKER', 'STUDY', 'FAMILY', 'TOURIST'] as const;

export const prefsSchema = z.object({
  languages: z.array(z.enum(LOCALE_VALUES)).max(4).optional(),
  visaTypes: z.array(z.enum(VISA_TYPE_VALUES)).max(7).optional(),
  visaCategoryIds: z.array(z.string().max(40)).max(50).optional(),
  maxOpenCases: z.number().int().min(1).max(1000).nullable().optional(),
  workingDays: z.array(z.number().int().min(1).max(7)).max(7).optional(),
  autoAssign: z.boolean().optional(),
});

export interface StaffPrefs {
  languages: Locale[];
  visaTypes: VisaType[];
  visaCategoryIds: string[];
  maxOpenCases: number | null;
  workingDays: number[];
  autoAssign: boolean;
}

const strList = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
export const toPrefs = (row: { languages: unknown; visaTypes: unknown; visaCategoryIds: unknown; maxOpenCases: number | null; workingDays: unknown; autoAssign: boolean } | null | undefined): StaffPrefs => ({
  languages: strList(row?.languages).filter((l): l is Locale => (LOCALE_VALUES as readonly string[]).includes(l)),
  visaTypes: strList(row?.visaTypes).filter((t): t is VisaType => (VISA_TYPE_VALUES as readonly string[]).includes(t)),
  visaCategoryIds: strList(row?.visaCategoryIds),
  maxOpenCases: row?.maxOpenCases ?? null,
  workingDays: Array.isArray(row?.workingDays) ? (row.workingDays as unknown[]).filter((d): d is number => typeof d === 'number' && d >= 1 && d <= 7) : [],
  autoAssign: row?.autoAssign ?? true,
});

export const readPrefs = async (userIds: string[], tx: Prisma.TransactionClient = prisma) => {
  const rows = userIds.length ? await tx.staffPreferences.findMany({ where: { userId: { in: userIds } } }) : [];
  const by = new Map(rows.map((r) => [r.userId, toPrefs(r)]));
  return new Map(userIds.map((id) => [id, by.get(id) ?? toPrefs(null)]));
};

export const savePrefs = async (userId: string, input: z.infer<typeof prefsSchema>) => {
  const data = {
    ...(input.languages ? { languages: [...new Set(input.languages)] } : {}),
    ...(input.visaTypes ? { visaTypes: [...new Set(input.visaTypes)] } : {}),
    ...(input.visaCategoryIds ? { visaCategoryIds: [...new Set(input.visaCategoryIds)] } : {}),
    ...(input.maxOpenCases !== undefined ? { maxOpenCases: input.maxOpenCases } : {}),
    ...(input.workingDays ? { workingDays: [...new Set(input.workingDays)].sort() } : {}),
    ...(input.autoAssign !== undefined ? { autoAssign: input.autoAssign } : {}),
  };
  const row = await prisma.staffPreferences.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  return toPrefs(row);
};

// ─── Absence (approved leave, REMOTE does not count) ──────────────────

export const absences = async (now = new Date(), tx: Prisma.TransactionClient = prisma) => {
  const rows = await tx.leaveRequest.findMany({
    where: { status: 'APPROVED', type: { not: 'REMOTE' }, startsAt: { lte: now }, endsAt: { gte: now } },
    select: { id: true, userId: true, endsAt: true },
    orderBy: { endsAt: 'desc' },
  });
  const by = new Map<string, { leaveId: string; endsAt: Date }>();
  for (const r of rows) if (!by.has(r.userId)) by.set(r.userId, { leaveId: r.id, endsAt: r.endsAt });
  return by;
};

const bakuWeekday = (d: Date) => {
  const w = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Baku', weekday: 'short' }).format(d);
  return ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 } as Record<string, number>)[w] ?? 1;
};

// ─── Load ──────────────────────────────────────────────────────────────

export interface StaffLoad {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  locale: Locale;
  open: number;
  weighted: number;
  lastAssignedAt: number;
}

const round = (n: number) => Math.round(n * 10) / 10;

/** Active STAFF / ADMIN (the assignment pool candidates) with open and weighted load. */
export const staffLoads = async (cfg: AssignmentConfig, tx: Prisma.TransactionClient = prisma, opts: { includeSuper?: boolean } = {}): Promise<StaffLoad[]> => {
  const staff = await tx.user.findMany({
    where: { isActive: true, role: { in: opts.includeSuper ? ['STAFF', 'ADMIN', 'SUPER_ADMIN'] : ['STAFF', 'ADMIN'] } },
    select: { id: true, firstName: true, lastName: true, role: true, locale: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!staff.length) return [];
  const ids = staff.map((s) => s.id);
  const [grouped, last] = await Promise.all([
    tx.case.groupBy({ by: ['assignedStaffId', 'status'], where: { assignedStaffId: { in: ids }, status: { notIn: FINAL_STATUSES } }, _count: { _all: true } }),
    tx.case.findMany({ where: { assignedStaffId: { in: ids } }, distinct: ['assignedStaffId'], orderBy: { createdAt: 'desc' }, select: { assignedStaffId: true, createdAt: true } }),
  ]);
  const open = new Map<string, number>();
  const weighted = new Map<string, number>();
  for (const g of grouped) {
    const sid = g.assignedStaffId as string;
    open.set(sid, (open.get(sid) ?? 0) + g._count._all);
    weighted.set(sid, (weighted.get(sid) ?? 0) + g._count._all * (cfg.weights[g.status as OpenStatus] ?? 1));
  }
  const lastAt = new Map(last.map((c) => [c.assignedStaffId as string, c.createdAt.getTime()]));
  return staff.map((s) => ({ id: s.id, firstName: s.firstName, lastName: s.lastName, role: s.role, locale: s.locale, open: open.get(s.id) ?? 0, weighted: round(weighted.get(s.id) ?? 0), lastAssignedAt: lastAt.get(s.id) ?? 0 }));
};

// ─── Eligibility + pick ────────────────────────────────────────────────

export interface AssignTarget {
  clientLocale?: Locale | null;
  visaType?: VisaType | null;
  visaCategoryId?: string | null;
  /** Never pick these (the absent owner during a handover, the current owner in a rebalance). */
  excludeIds?: string[];
}

export type IneligibleReason = 'NOT_IN_POOL' | 'AUTO_ASSIGN_OFF' | 'ABSENT' | 'LANGUAGE' | 'VISA_TYPE' | 'VISA_CATEGORY' | 'MAX_OPEN' | 'NOT_WORKING_DAY' | 'EXCLUDED';

export const ineligibility = (
  s: StaffLoad,
  prefs: StaffPrefs,
  target: AssignTarget,
  cfg: AssignmentConfig,
  ctx: { absent: Set<string>; weekday: number; usePool?: boolean },
): IneligibleReason[] => {
  const r: IneligibleReason[] = [];
  if (target.excludeIds?.includes(s.id)) r.push('EXCLUDED');
  if (ctx.usePool !== false && cfg.staffIds?.length && !cfg.staffIds.includes(s.id)) r.push('NOT_IN_POOL');
  if (!prefs.autoAssign) r.push('AUTO_ASSIGN_OFF');
  if (ctx.absent.has(s.id)) r.push('ABSENT');
  if (cfg.matchLanguage && target.clientLocale && prefs.languages.length && !prefs.languages.includes(target.clientLocale)) r.push('LANGUAGE');
  if (cfg.matchVisaType && target.visaType && prefs.visaTypes.length && !prefs.visaTypes.includes(target.visaType)) r.push('VISA_TYPE');
  if (cfg.matchVisaType && target.visaCategoryId && prefs.visaCategoryIds.length && !prefs.visaCategoryIds.includes(target.visaCategoryId)) r.push('VISA_CATEGORY');
  if (cfg.respectMaxOpen && prefs.maxOpenCases !== null && s.open >= prefs.maxOpenCases) r.push('MAX_OPEN');
  if (cfg.respectWorkingDays && prefs.workingDays.length && !prefs.workingDays.includes(ctx.weekday)) r.push('NOT_WORKING_DAY');
  return r;
};

/** Orders candidates: least weighted load first (roundRobin: ignore load), then least recently assigned. */
const order = (cands: StaffLoad[], strategy: 'roundRobin' | 'leastLoaded') =>
  [...cands].sort((a, b) => (strategy === 'leastLoaded' ? a.weighted - b.weighted : 0) || a.lastAssignedAt - b.lastAssignedAt);

/**
 * Picks the staff member for a case, or null (mode off / nobody eligible). `force` uses leastLoaded even when the
 * mode is off — explicit "run auto-assignment" actions and absence handovers.
 */
export const pickAssignee = async (
  tx: Prisma.TransactionClient = prisma,
  target: AssignTarget = {},
  opts: { force?: boolean; now?: Date } = {},
): Promise<string | null> => {
  const cfg = await readAssignmentConfig(tx);
  if (cfg.mode === 'off' && !opts.force) return null;
  const strategy = cfg.mode === 'roundRobin' ? 'roundRobin' : 'leastLoaded';
  const now = opts.now ?? new Date();
  const loads = await staffLoads(cfg, tx);
  if (!loads.length) return null;
  const [prefs, absent] = await Promise.all([readPrefs(loads.map((l) => l.id), tx), absences(now, tx)]);
  const ctx = { absent: new Set(absent.keys()), weekday: bakuWeekday(now) };
  const eligible = loads.filter((s) => ineligibility(s, prefs.get(s.id)!, target, cfg, ctx).length === 0);
  return order(eligible, strategy)[0]?.id ?? null;
};

/** Target attributes of an existing case. */
export const targetOfCase = async (caseId: string, tx: Prisma.TransactionClient = prisma): Promise<AssignTarget | null> => {
  const c = await tx.case.findUnique({ where: { id: caseId }, select: { visaType: true, visaCategoryId: true, client: { select: { locale: true } } } });
  return c ? { clientLocale: c.client.locale, visaType: c.visaType, visaCategoryId: c.visaCategoryId } : null;
};

const fullName = (u: { firstName: string; lastName: string } | null | undefined) => (u ? `${u.firstName} ${u.lastName}`.trim() : '');

/**
 * Sets the case owner (internal timeline entry + in-app/push notice to the new owner). `from` guards against a
 * concurrent manual change: the update only happens while the case still has that owner.
 */
export const assignCase = async (
  caseId: string,
  toId: string,
  opts: { actorId?: string | null; reason: 'auto' | 'rebalance' | 'automation' | 'handover' | 'returned'; from?: string | null; notify?: boolean },
) => {
  const res = await prisma.case.updateMany({
    where: { id: caseId, ...(opts.from !== undefined ? { assignedStaffId: opts.from } : {}) },
    data: { assignedStaffId: toId },
  });
  if (!res.count) return false;
  await prisma.caseEvent.create({ data: { caseId, type: 'CASE_UPDATED', note: `assigned (${opts.reason})`, actorId: opts.actorId ?? null, visibleToClient: false } });
  if (opts.notify !== false) {
    const [to, c] = await Promise.all([
      prisma.user.findUnique({ where: { id: toId }, select: { locale: true } }),
      prisma.case.findUnique({ where: { id: caseId }, select: { number: true } }),
    ]);
    if (to && c) {
      const t = assignmentTexts(to.locale);
      await notifyUser(toId, { type: 'CASE_ASSIGNED', ...t.assigned({ number: c.number, reason: t.reasons[opts.reason] }), link: `/admin/cases/${caseId}`, caseId, email: false }).catch((e) =>
        console.error('[assignment] notify failed', e),
      );
    }
  }
  return true;
};

/** Runs the strategy for one existing case (automation action "run auto-assignment"). */
export const autoAssignCase = async (caseId: string, opts: { actorId?: string | null; onlyIfUnassigned?: boolean; force?: boolean } = {}) => {
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { assignedStaffId: true, status: true } });
  if (!c || FINAL_STATUSES.includes(c.status)) return { assigned: null, reason: 'CASE_CLOSED' as const };
  if (opts.onlyIfUnassigned !== false && c.assignedStaffId) return { assigned: null, reason: 'ALREADY_ASSIGNED' as const };
  const target = await targetOfCase(caseId);
  const pick = await pickAssignee(prisma, { ...target, excludeIds: c.assignedStaffId ? [c.assignedStaffId] : [] }, { force: opts.force ?? true });
  if (!pick) return { assigned: null, reason: 'NO_ELIGIBLE_STAFF' as const };
  const ok = await assignCase(caseId, pick, { actorId: opts.actorId, reason: 'automation', from: c.assignedStaffId });
  return ok ? { assigned: pick, reason: null } : { assigned: null, reason: 'CHANGED_CONCURRENTLY' as const };
};

// ─── Dashboard: load, unassigned, rebalance suggestion ────────────────

export interface Move {
  caseId: string;
  number: string;
  fromId: string | null;
  toId: string;
}

export const loadOverview = async (now = new Date()) => {
  const cfg = await readAssignmentConfig();
  const loads = await staffLoads(cfg);
  const [prefs, absent, unassigned] = await Promise.all([
    readPrefs(loads.map((l) => l.id)),
    absences(now),
    prisma.case.findMany({
      where: { assignedStaffId: null, status: { notIn: FINAL_STATUSES } },
      orderBy: { createdAt: 'asc' },
      take: 50,
      select: { id: true, number: true, visaType: true, visaCategoryId: true, status: true, client: { select: { locale: true } } },
    }),
  ]);
  const unassignedCount = await prisma.case.count({ where: { assignedStaffId: null, status: { notIn: FINAL_STATUSES } } });
  const ctx = { absent: new Set(absent.keys()), weekday: bakuWeekday(now) };

  // Simulated rebalance: first give unassigned cases to eligible staff, then move cases from the most to the least
  // loaded while the gap is larger than the heaviest weight (one move can't make it worse).
  const sim = new Map(loads.map((l) => [l.id, { ...l }]));
  const moves: Move[] = [];
  const pool = () => [...sim.values()].filter((s) => (!cfg.staffIds?.length || cfg.staffIds.includes(s.id)) && prefs.get(s.id)!.autoAssign && !ctx.absent.has(s.id));
  for (const u of unassigned.slice(0, 20)) {
    const target = { clientLocale: u.client.locale, visaType: u.visaType, visaCategoryId: u.visaCategoryId };
    const cand = order(pool().filter((s) => ineligibility(s, prefs.get(s.id)!, target, cfg, ctx).length === 0), 'leastLoaded')[0];
    if (!cand) continue;
    moves.push({ caseId: u.id, number: u.number, fromId: null, toId: cand.id });
    cand.open += 1;
    cand.weighted = round(cand.weighted + (cfg.weights[u.status as OpenStatus] ?? 1));
  }
  const maxWeight = Math.max(...Object.values(cfg.weights), 0.5);
  const movedCases = new Set<string>();
  for (let i = 0; i < 15; i++) {
    const p = pool().sort((a, b) => b.weighted - a.weighted);
    if (p.length < 2) break;
    const heavy = p[0];
    const light = p[p.length - 1];
    if (heavy.weighted - light.weighted <= maxWeight) break;
    const candidates = await prisma.case.findMany({
      where: { assignedStaffId: heavy.id, status: { in: [...OPEN_STATUSES] }, id: { notIn: [...movedCases] } },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { id: true, number: true, status: true, visaType: true, visaCategoryId: true, client: { select: { locale: true } } },
    });
    const handedOver = new Set((await prisma.caseHandover.findMany({ where: { status: 'ACTIVE', caseId: { in: candidates.map((c) => c.id) } }, select: { caseId: true } })).map((h) => h.caseId));
    // Prefer early-stage cases (least context lost) the light colleague may take.
    const pick = candidates
      .filter((c) => !handedOver.has(c.id))
      .filter((c) => ineligibility(light, prefs.get(light.id)!, { clientLocale: c.client.locale, visaType: c.visaType, visaCategoryId: c.visaCategoryId }, cfg, ctx).length === 0)
      .sort((a, b) => OPEN_STATUSES.indexOf(a.status as OpenStatus) - OPEN_STATUSES.indexOf(b.status as OpenStatus))[0];
    if (!pick) break;
    const w = cfg.weights[pick.status as OpenStatus] ?? 1;
    moves.push({ caseId: pick.id, number: pick.number, fromId: heavy.id, toId: light.id });
    movedCases.add(pick.id);
    heavy.open -= 1;
    heavy.weighted = round(heavy.weighted - w);
    light.open += 1;
    light.weighted = round(light.weighted + w);
  }

  return {
    config: cfg,
    staff: loads.map((l) => ({
      id: l.id,
      firstName: l.firstName,
      lastName: l.lastName,
      role: l.role,
      open: l.open,
      weighted: l.weighted,
      maxOpenCases: prefs.get(l.id)!.maxOpenCases,
      autoAssign: prefs.get(l.id)!.autoAssign,
      inPool: !cfg.staffIds?.length || cfg.staffIds.includes(l.id),
      absentUntil: absent.get(l.id)?.endsAt ?? null,
      prefs: prefs.get(l.id)!,
    })),
    unassigned: unassignedCount,
    suggestion: moves.map((m) => ({ ...m, fromName: m.fromId ? fullName(sim.get(m.fromId)) : null, toName: fullName(sim.get(m.toId)) })),
  };
};

/** Applies (a subset of) a rebalance suggestion; moves whose case changed owner meanwhile are skipped. */
export const applyMoves = async (moves: { caseId: string; fromId: string | null; toId: string }[], actorId: string) => {
  const staff = new Set((await prisma.user.findMany({ where: { id: { in: moves.map((m) => m.toId) }, isActive: true, role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] } }, select: { id: true } })).map((u) => u.id));
  const applied: string[] = [];
  const skipped: string[] = [];
  for (const m of moves) {
    const c = await prisma.case.findUnique({ where: { id: m.caseId }, select: { status: true, number: true } });
    if (!c || FINAL_STATUSES.includes(c.status) || !staff.has(m.toId)) {
      skipped.push(m.caseId);
      continue;
    }
    const ok = await assignCase(m.caseId, m.toId, { actorId, reason: 'rebalance', from: m.fromId });
    if (!ok) {
      skipped.push(m.caseId);
      continue;
    }
    applied.push(m.caseId);
    if (m.fromId) {
      const [from, to] = await Promise.all([
        prisma.user.findUnique({ where: { id: m.fromId }, select: { locale: true } }),
        prisma.user.findUnique({ where: { id: m.toId }, select: { firstName: true, lastName: true } }),
      ]);
      if (from && to) {
        await notifyUser(m.fromId, { type: 'CASE_REASSIGNED', ...assignmentTexts(from.locale).unassigned({ number: c.number, to: fullName(to) }), link: `/admin/cases/${m.caseId}`, caseId: m.caseId, email: false }).catch(() => undefined);
      }
    }
  }
  return { applied, skipped };
};
