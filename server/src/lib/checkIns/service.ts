import crypto from 'node:crypto';
import type { ArrivalCheckIn, CheckInAudience, Locale, Prisma } from '@prisma/client';
import { z } from 'zod';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { conflict, HttpError } from '../http.js';
import { renderEmail, sendMail } from '../mailer.js';
import { invalidateMyWork } from '../myWork.js';
import { notifyUser } from '../notifications.js';
import { createNumbered } from '../tasks/core.js';
import { checkInTexts, LEFT_REASONS, TOPICS, topicLabels } from './texts.js';
import { RISK_LEVELS, recomputeRisk, type RiskReason } from './risk.js';

/**
 * Post-arrival check-ins (Gəlişdən sonra yoxlama).
 *
 * When an arrival plan is COMPLETED (the worker arrived), the job creates one ArrivalFollowUp per main case
 * (family member cases are not asked) with arrivedAt = the planned arrival time (else the flight date, else
 * the moment it was marked completed). Check-ins go out after 1 / 3 / 6 months (+30 / +90 / +180 days, Setting
 * `checkIns`), in the worker's language: in-app + push (notifyUser) and an e-mail with a tokenised one-tap link.
 * An optional short employer check-in goes to the company's portal users (+ the company e-mail) at its own
 * offsets (default also +30 / +90 / +180; settings saved with the older single `employerOffset` keep working).
 * Every answer recomputes the churn risk of the follow-up (lib/checkIns/risk.ts).
 *
 * Idempotency: one row per (follow-up, audience, offset) — unique in the database — so a re-run never sends
 * twice; a check-in that is more than 14 days overdue (e.g. old arrivals when the feature starts) is skipped.
 *
 * "Problem var" alerts the assigned staff member (and every ADMIN+) with the topics, creates a task on the
 * case and shows in "my work" (kind arrival_issue) until a staff member marks it resolved.
 * Retention: staff can mark "left the job" with a reason; the overview counts who is still employed after
 * 3 / 6 / 12 months.
 */

const DAY = 24 * 60 * 60 * 1000;
export const GRACE_DAYS = 14;
export const ANSWER_TTL_DAYS = 60;
export const CHECKIN_SETTING_KEY = 'checkIns';

const offsetList = z.array(z.number().int().min(1).max(730)).min(1).max(6);
export const settingsSchema = z.object({
  enabled: z.boolean(),
  workerOffsets: offsetList,
  employerEnabled: z.boolean(),
  employerOffsets: offsetList,
});
export type CheckInSettings = z.infer<typeof settingsSchema>;
/** PUT body: also accepts the older single `employerOffset` (number) instead of the list. */
export const settingsInputSchema = settingsSchema
  .extend({ employerOffsets: offsetList.optional(), employerOffset: z.number().int().min(1).max(730).optional() })
  .transform(({ employerOffset, employerOffsets, ...rest }) => ({ ...rest, employerOffsets: employerOffsets ?? (employerOffset ? [employerOffset] : DEFAULT_SETTINGS.employerOffsets) }));
export const DEFAULT_SETTINGS: CheckInSettings = { enabled: true, workerOffsets: [30, 90, 180], employerEnabled: true, employerOffsets: [30, 90, 180] };

const sortedOffsets = (list: number[]) => [...new Set(list)].sort((a, b) => a - b);

/** Stored value → settings; the older shape `{ employerOffset: 30 }` becomes `employerOffsets: [30]`. */
export const getCheckInSettings = async (): Promise<CheckInSettings> => {
  const row = await prisma.setting.findUnique({ where: { key: CHECKIN_SETTING_KEY } });
  const stored = { ...((row?.value ?? {}) as Record<string, unknown>) };
  if (!Array.isArray(stored.employerOffsets) && typeof stored.employerOffset === 'number') stored.employerOffsets = [stored.employerOffset];
  delete stored.employerOffset;
  const parsed = settingsSchema.safeParse({ ...DEFAULT_SETTINGS, ...stored });
  return parsed.success ? { ...parsed.data, workerOffsets: sortedOffsets(parsed.data.workerOffsets), employerOffsets: sortedOffsets(parsed.data.employerOffsets) } : DEFAULT_SETTINGS;
};

export const saveCheckInSettings = async (s: CheckInSettings) => {
  const value = { enabled: s.enabled, workerOffsets: sortedOffsets(s.workerOffsets), employerEnabled: s.employerEnabled, employerOffsets: sortedOffsets(s.employerOffsets) };
  await prisma.setting.upsert({ where: { key: CHECKIN_SETTING_KEY }, create: { key: CHECKIN_SETTING_KEY, value }, update: { value } });
  return value;
};

export const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export const checkInUrl = (token: string) => `${config.clientUrl}/check-in/${token}`;

const fullName = (u: { firstName: string; lastName: string } | null | undefined) => (u ? `${u.firstName} ${u.lastName}`.trim() : '');

// ─── Follow-ups ───────────────────────────────────────────────────────

/** Creates the follow-up of every COMPLETED arrival plan that has none yet (main cases only). */
export const syncFollowUps = async (now = new Date()) => {
  const plans = await prisma.arrivalPlan.findMany({
    where: { status: 'COMPLETED', case: { arrivalFollowUp: { is: null }, parentCaseId: null } },
    select: { caseId: true, clientId: true, arrivalTime: true, flightDate: true, updatedAt: true, case: { select: { companyId: true } } },
    take: 500,
  });
  if (!plans.length) return 0;
  const res = await prisma.arrivalFollowUp.createMany({
    data: plans.map((p) => ({ caseId: p.caseId, clientId: p.clientId, companyId: p.case.companyId, arrivedAt: p.arrivalTime ?? p.flightDate ?? (p.updatedAt < now ? p.updatedAt : now) })),
    skipDuplicates: true,
  });
  return res.count;
};

// ─── Sending ──────────────────────────────────────────────────────────

/** Creates the check-in row (null when it exists already) and returns it with its one-time link token. */
const claimCheckIn = async (followUpId: string, caseId: string, audience: CheckInAudience, offsetDays: number, dueAt: Date, now: Date) => {
  const token = crypto.randomBytes(32).toString('base64url');
  try {
    const row = await prisma.arrivalCheckIn.create({ data: { followUpId, caseId, audience, offsetDays, dueAt, sentAt: now, tokenHash: hashToken(token) } });
    return { row, token };
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') return null;
    throw err;
  }
};

const deliverWorker = async (c: ArrivalCheckIn, token: string) => {
  const client = await prisma.user.findFirst({ where: { cases: { some: { id: c.caseId } } }, select: { id: true, firstName: true, email: true, locale: true, isActive: true, emailNotifications: true } });
  if (!client?.isActive) return false;
  const tx = checkInTexts(client.locale);
  const body = tx.workerBody({ firstName: client.firstName, days: c.offsetDays });
  // In-app + push link with the id (the logged-in client is recognised by the session; no raw token stored).
  await notifyUser(client.id, { type: 'CHECKIN', title: tx.workerTitle, body, link: `/check-in/${c.id}`, caseId: c.caseId, email: false });
  if (client.emailNotifications !== false) void sendMail(client.email, `Triad Vision · ${tx.workerTitle}`, renderEmail(tx.workerTitle, body, { label: tx.cta, url: checkInUrl(token) }));
  return true;
};

const deliverEmployer = async (c: ArrivalCheckIn, token: string, companyId: string) => {
  const [company, users, kase] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { name: true, email: true } }),
    prisma.user.findMany({ where: { companyId, role: 'COMPANY', isActive: true }, select: { id: true, email: true, locale: true, emailNotifications: true } }),
    prisma.case.findUnique({ where: { id: c.caseId }, select: { client: { select: { firstName: true, lastName: true } } } }),
  ]);
  if (!company) return false;
  const worker = fullName(kase?.client);
  const sent = new Set<string>();
  for (const u of users) {
    const tx = checkInTexts(u.locale);
    const body = tx.employerBody({ company: company.name, worker, days: c.offsetDays });
    await notifyUser(u.id, { type: 'CHECKIN_EMPLOYER', title: tx.employerTitle, body, link: `/check-in/${c.id}`, caseId: c.caseId, email: false });
    if (u.emailNotifications !== false) {
      void sendMail(u.email, `Triad Vision · ${tx.employerTitle}`, renderEmail(tx.employerTitle, body, { label: tx.employerCta, url: checkInUrl(token) }));
      sent.add(u.email.toLowerCase());
    }
  }
  if (company.email && !sent.has(company.email.toLowerCase())) {
    const tx = checkInTexts('de');
    void sendMail(company.email, `Triad Vision · ${tx.employerTitle}`, renderEmail(tx.employerTitle, tx.employerBody({ company: company.name, worker, days: c.offsetDays }), { label: tx.employerCta, url: checkInUrl(token) }));
    sent.add(company.email.toLowerCase());
  }
  return users.length > 0 || sent.size > 0;
};

/** Hourly: creates follow-ups, then sends every check-in that is due (each exactly once). */
export const runCheckIns = async (now = new Date()) => {
  const s = await getCheckInSettings();
  if (!s.enabled) return { followUps: 0, worker: 0, employer: 0 };
  const followUps = await syncFollowUps(now);
  const offsets = [...s.workerOffsets, ...(s.employerEnabled ? s.employerOffsets : [])];
  const maxOffset = Math.max(...offsets);
  const minOffset = Math.min(...offsets);
  const rows = await prisma.arrivalFollowUp.findMany({
    where: { leftJobAt: null, arrivedAt: { gte: new Date(now.getTime() - (maxOffset + GRACE_DAYS) * DAY), lte: new Date(now.getTime() - minOffset * DAY) } },
    select: { id: true, caseId: true, companyId: true, arrivedAt: true, case: { select: { status: true, companyId: true } } },
  });
  let worker = 0;
  let employer = 0;
  const due = (arrivedAt: Date, offset: number) => {
    const at = new Date(arrivedAt.getTime() + offset * DAY);
    return at <= now && at.getTime() >= now.getTime() - GRACE_DAYS * DAY ? at : null;
  };
  for (const f of rows) {
    if (f.case.status === 'CANCELLED') continue;
    for (const offset of s.workerOffsets) {
      const at = due(f.arrivedAt, offset);
      if (!at) continue;
      const claimed = await claimCheckIn(f.id, f.caseId, 'WORKER', offset, at, now);
      if (claimed && (await deliverWorker(claimed.row, claimed.token).catch((e) => (console.error('[checkins] worker delivery failed', e), false)))) worker++;
    }
    const companyId = f.case.companyId ?? f.companyId;
    if (s.employerEnabled && companyId) {
      for (const offset of s.employerOffsets) {
        const at = due(f.arrivedAt, offset);
        if (!at) continue;
        const claimed = await claimCheckIn(f.id, f.caseId, 'EMPLOYER', offset, at, now);
        if (claimed && (await deliverEmployer(claimed.row, claimed.token, companyId).catch((e) => (console.error('[checkins] employer delivery failed', e), false)))) employer++;
      }
    }
  }
  return { followUps, worker, employer };
};

/**
 * An extra employer check-in outside the regular offsets (e.g. 14 days before the probation ends,
 * lib/renewals). Returns false when there is no follow-up / employer or a check-in for today's offset exists.
 */
export const promptEmployerCheckIn = async (caseId: string, now = new Date()) => {
  const f = await prisma.arrivalFollowUp.findUnique({ where: { caseId }, select: { id: true, caseId: true, companyId: true, arrivedAt: true, leftJobAt: true, case: { select: { companyId: true, status: true } } } });
  const companyId = f?.case.companyId ?? f?.companyId;
  if (!f || !companyId || f.leftJobAt || f.case.status === 'CANCELLED') return false;
  const offset = Math.max(1, Math.round((now.getTime() - f.arrivedAt.getTime()) / DAY));
  const claimed = await claimCheckIn(f.id, f.caseId, 'EMPLOYER', offset, now, now);
  if (!claimed) return false;
  return deliverEmployer(claimed.row, claimed.token, companyId).catch((e) => (console.error('[checkins] employer delivery failed', e), false));
};

// ─── Answering ────────────────────────────────────────────────────────

export const answerSchema = z.object({
  answer: z.enum(['OK', 'ISSUE']),
  topics: z.array(z.enum(TOPICS)).max(TOPICS.length).default([]),
  comment: z.string().trim().max(2000).nullish(),
});

export const isExpired = (c: Pick<ArrivalCheckIn, 'sentAt' | 'createdAt'>, now = new Date()) => now.getTime() - (c.sentAt ?? c.createdAt).getTime() > ANSWER_TTL_DAYS * DAY;

/** What the answer page shows (no personal data beyond the worker's / company's first name). */
export const publicView = async (c: ArrivalCheckIn, now = new Date()) => {
  const kase = await prisma.case.findUnique({ where: { id: c.caseId }, select: { number: true, client: { select: { firstName: true, locale: true } }, company: { select: { name: true } } } });
  return {
    id: c.id,
    audience: c.audience,
    offsetDays: c.offsetDays,
    caseNumber: kase?.number ?? null,
    firstName: c.audience === 'WORKER' ? (kase?.client.firstName ?? null) : null,
    workerFirstName: c.audience === 'EMPLOYER' ? (kase?.client.firstName ?? null) : null,
    company: c.audience === 'EMPLOYER' ? (kase?.company?.name ?? null) : null,
    locale: kase?.client.locale ?? 'az',
    topics: TOPICS,
    answered: !!c.answeredAt,
    answer: c.answer,
    expired: !c.answeredAt && isExpired(c, now),
  };
};

/** Records the answer; "ISSUE" alerts staff + admins, creates a task and puts the case into "my work". */
export const answerCheckIn = async (c: ArrivalCheckIn, input: z.infer<typeof answerSchema>, answeredById: string | null, now = new Date()) => {
  if (c.answeredAt) throw conflict('ALREADY_ANSWERED');
  if (isExpired(c, now)) throw new HttpError(410, 'CHECKIN_EXPIRED');
  const topics = input.answer === 'ISSUE' ? [...new Set(input.topics)] : [];
  const res = await prisma.arrivalCheckIn.updateMany({
    where: { id: c.id, answeredAt: null },
    data: { answer: input.answer, topics, comment: input.comment || null, answeredAt: now, answeredById },
  });
  if (!res.count) throw conflict('ALREADY_ANSWERED');
  const saved = await prisma.arrivalCheckIn.findUniqueOrThrow({ where: { id: c.id } });
  if (input.answer === 'ISSUE') await raiseIssue(saved).catch((e) => console.error('[checkins] issue alert failed', e));
  await recomputeRisk(saved.followUpId, now).catch((e) => console.error('[checkins] churn risk failed', e));
  return saved;
};

const raiseIssue = async (c: ArrivalCheckIn) => {
  const kase = await prisma.case.findUnique({
    where: { id: c.caseId },
    select: { id: true, number: true, assignedStaffId: true, client: { select: { firstName: true, lastName: true } } },
  });
  if (!kase) return;
  const staff = kase.assignedStaffId ? await prisma.user.findFirst({ where: { id: kase.assignedStaffId, isActive: true, role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] } }, select: { id: true, locale: true } }) : null;
  const admins = await prisma.user.findMany({ where: { isActive: true, role: { in: ['ADMIN', 'SUPER_ADMIN'] } }, select: { id: true, locale: true } });
  const recipients = new Map<string, Locale>([...(staff ? [[staff.id, staff.locale] as const] : []), ...admins.map((a) => [a.id, a.locale] as const)]);
  const topics = (c.topics as string[] | null) ?? [];
  const params = (l: Locale) => ({ worker: fullName(kase.client), number: kase.number, days: c.offsetDays, topics: topicLabels(topics, l), comment: c.comment, employer: c.audience === 'EMPLOYER' });

  // The task goes to the assigned staff member (else the admins), in the assignee's language.
  const assignees = staff ? [staff.id] : admins.map((a) => a.id);
  const taskLocale: Locale = staff?.locale ?? admins[0]?.locale ?? 'az';
  const tx = checkInTexts(taskLocale);
  const task = await createNumbered(async (txn, number) => {
    const min = await txn.task.aggregate({ where: { status: 'TODO' }, _min: { sortOrder: true } });
    return txn.task.create({
      data: {
        number,
        title: tx.taskTitle(params(taskLocale)).slice(0, 200),
        description: tx.issueBody(params(taskLocale)).slice(0, 8000),
        status: 'TODO',
        priority: 'HIGH',
        dueAt: new Date(Date.now() + DAY),
        sortOrder: min._min.sortOrder === null ? 0 : min._min.sortOrder - 1024,
        caseId: kase.id,
        assignees: { create: assignees.map((userId) => ({ userId })) },
      },
    });
  });
  await prisma.arrivalCheckIn.update({ where: { id: c.id }, data: { taskId: task.id } });
  await prisma.caseEvent.create({ data: { caseId: kase.id, type: 'CHECKIN_ISSUE', note: tx.issueBody(params(taskLocale)).slice(0, 2000), visibleToClient: false } }).catch(() => undefined);
  await Promise.all(
    [...recipients].map(([id, l]) => {
      const t = checkInTexts(l);
      return notifyUser(id, { type: 'CHECKIN_ISSUE', title: t.issueTitle(params(l)), body: t.issueBody(params(l)), link: `/admin/cases/${kase.id}`, caseId: kase.id, forceEmail: true }).catch(() => undefined);
    }),
  );
  for (const id of recipients.keys()) invalidateMyWork(id);
};

// ─── Staff side ───────────────────────────────────────────────────────

export const leftSchema = z.object({
  left: z.boolean(),
  leftAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  reason: z.enum(LEFT_REASONS).optional(),
  note: z.string().trim().max(1000).nullish(),
});

const MONTH = 30.4375 * DAY;
const MONTHS = [3, 6, 12] as const;

export const overviewQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  companyId: z.string().max(40).optional(),
  status: z.enum(['all', 'issue', 'left', 'employed', 'noAnswer']).default('all'),
  risk: z.enum(['all', ...RISK_LEVELS]).default('all'),
  sort: z.enum(['arrived', 'risk']).default('arrived'),
});

/** Retention dashboard: answers, issues by topic, still employed after 3 / 6 / 12 months, worker list. */
export const overview = async (q: z.infer<typeof overviewQuery>, now = new Date()) => {
  const where: Prisma.ArrivalFollowUpWhereInput = {
    ...(q.companyId ? { companyId: q.companyId } : {}),
    ...(q.from || q.to ? { arrivedAt: { ...(q.from ? { gte: new Date(`${q.from}T00:00:00Z`) } : {}), ...(q.to ? { lte: new Date(`${q.to}T23:59:59.999Z`) } : {}) } } : {}),
  };
  const rows = await prisma.arrivalFollowUp.findMany({
    where,
    orderBy: { arrivedAt: 'desc' },
    take: 2000,
    include: {
      checkIns: { orderBy: [{ audience: 'asc' }, { offsetDays: 'asc' }] },
      case: { select: { id: true, number: true, client: { select: { firstName: true, lastName: true } }, company: { select: { id: true, name: true } }, assignedStaff: { select: { firstName: true, lastName: true } } } },
    },
  });
  const all = rows.flatMap((r) => r.checkIns);
  const sent = all.filter((c) => c.sentAt);
  const answered = all.filter((c) => c.answeredAt);
  const byOffset = new Map<string, { audience: CheckInAudience; offsetDays: number; sent: number; answered: number; ok: number; issue: number }>();
  for (const c of sent) {
    const k = `${c.audience}:${c.offsetDays}`;
    const b = byOffset.get(k) ?? { audience: c.audience, offsetDays: c.offsetDays, sent: 0, answered: 0, ok: 0, issue: 0 };
    b.sent++;
    if (c.answeredAt) b.answered++;
    if (c.answer === 'OK') b.ok++;
    if (c.answer === 'ISSUE') b.issue++;
    byOffset.set(k, b);
  }
  const topics = Object.fromEntries(TOPICS.map((t) => [t, 0])) as Record<string, number>;
  for (const c of answered) if (c.answer === 'ISSUE') for (const t of (c.topics as string[] | null) ?? []) topics[t] = (topics[t] ?? 0) + 1;
  const retention = MONTHS.map((m) => {
    const eligible = rows.filter((r) => r.arrivedAt.getTime() + m * MONTH <= now.getTime());
    const employed = eligible.filter((r) => !r.leftJobAt || r.leftJobAt.getTime() > r.arrivedAt.getTime() + m * MONTH);
    return { months: m, eligible: eligible.length, employed: employed.length, pct: eligible.length ? Math.round((employed.length / eligible.length) * 1000) / 10 : null };
  });
  const leftReasons = Object.fromEntries(LEFT_REASONS.map((r) => [r, rows.filter((x) => x.leftJobAt && x.leftReason === r).length]));

  const workers = rows
    .map((r) => {
      const openIssue = r.checkIns.some((c) => c.answer === 'ISSUE' && !c.resolvedAt);
      return {
        id: r.id,
        caseId: r.caseId,
        caseNumber: r.case.number,
        worker: fullName(r.case.client),
        company: r.case.company?.name ?? null,
        staff: r.case.assignedStaff ? fullName(r.case.assignedStaff) : null,
        arrivedAt: r.arrivedAt,
        leftJobAt: r.leftJobAt,
        leftReason: r.leftReason,
        leftNote: r.leftNote,
        openIssue,
        riskScore: r.riskScore,
        riskLevel: r.riskLevel,
        riskReasons: (r.riskReasons as RiskReason[] | null) ?? [],
        riskAt: r.riskAt,
        checkIns: r.checkIns.map((c) => ({ id: c.id, audience: c.audience, offsetDays: c.offsetDays, sentAt: c.sentAt, answer: c.answer, topics: (c.topics as string[] | null) ?? [], comment: c.comment, answeredAt: c.answeredAt, resolvedAt: c.resolvedAt, taskId: c.taskId })),
      };
    })
    .filter((w) =>
      q.status === 'issue' ? w.openIssue : q.status === 'left' ? !!w.leftJobAt : q.status === 'employed' ? !w.leftJobAt : q.status === 'noAnswer' ? w.checkIns.some((c) => c.sentAt && !c.answeredAt) : true,
    )
    .filter((w) => q.risk === 'all' || w.riskLevel === q.risk);
  // Highest churn risk first (no score yet = last), ties by the latest arrival.
  if (q.sort === 'risk') workers.sort((a, b) => (b.riskScore ?? -1) - (a.riskScore ?? -1) || b.arrivedAt.getTime() - a.arrivedAt.getTime());

  return {
    totals: {
      followUps: rows.length,
      sent: sent.length,
      answered: answered.length,
      ok: answered.filter((c) => c.answer === 'OK').length,
      issue: answered.filter((c) => c.answer === 'ISSUE').length,
      openIssues: all.filter((c) => c.answer === 'ISSUE' && !c.resolvedAt).length,
      responseRate: sent.length ? Math.round((answered.length / sent.length) * 1000) / 10 : null,
      left: rows.filter((r) => r.leftJobAt).length,
      highRisk: rows.filter((r) => !r.leftJobAt && r.riskLevel === 'HIGH').length,
      mediumRisk: rows.filter((r) => !r.leftJobAt && r.riskLevel === 'MEDIUM').length,
    },
    byOffset: [...byOffset.values()].sort((a, b) => a.audience.localeCompare(b.audience) || a.offsetDays - b.offsetDays),
    topics,
    retention,
    leftReasons,
    workers: workers.slice(0, 300),
  };
};
