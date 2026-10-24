import { Prisma, type ArrivalCheckIn, type Locale } from '@prisma/client';
import { prisma } from '../../db.js';
import { invalidateMyWork } from '../myWork.js';
import { notifyUser } from '../notifications.js';
import { createNumbered, taskKey } from '../tasks/core.js';
import { riskTexts } from './riskTexts.js';
import type { Topic } from './texts.js';

/**
 * Churn risk of an arrived worker (ArrivalFollowUp.riskScore 0–100, riskLevel, riskReasons, riskAt).
 *
 * Deterministic rules on the check-in answers — no AI, the same answers always give the same score:
 *   - every "Problem var" answer (the employer's weighs more), older than 120 days counts half;
 *   - unresolved problems on top;
 *   - the problem topics (homesickness, salary, team … weigh differently);
 *   - check-ins sent more than a week ago that nobody answered;
 *   - the trend of the last two answers (OK → problem raises, problem → OK lowers);
 *   - the probation period (EmploymentContract.probationEndsAt) ending within 30 days.
 *
 * Recomputed on every answer (answerCheckIn) and nightly (job arrival-churn-risk, the unanswered /
 * probation rules move with time). The first time a follow-up reaches HIGH, the responsible staff member
 * (else the admins) gets ONE task + notification; a new alert needs 30 quiet days (CaseEvent CHURN_RISK_HIGH).
 */

const DAY = 24 * 60 * 60 * 1000;
export const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];
export const RISK_CODES = ['WORKER_ISSUE', 'EMPLOYER_ISSUE', 'OPEN_ISSUE', 'TOPIC', 'NO_ANSWER', 'TREND_WORSE', 'TREND_BETTER', 'PROBATION_SOON'] as const;
export type RiskCode = (typeof RISK_CODES)[number];

export interface RiskReason {
  code: RiskCode;
  points: number;
  params?: Record<string, string | number>;
}

export const RISK_RULES = {
  workerIssue: 15,
  employerIssue: 25,
  openIssue: 10,
  noAnswer: 8,
  noAnswerMax: 24,
  /** A check-in counts as unanswered this long after it was sent. */
  noAnswerAfterDays: 7,
  trend: 10,
  probationSoonDays: 30,
  probationWithIssues: 15,
  probationQuiet: 5,
  /** Answers older than this count half. */
  recentDays: 120,
  high: 55,
  medium: 25,
} as const;

export const TOPIC_WEIGHT: Record<Topic, number> = { HOMESICK: 12, SALARY: 10, TEAM: 10, HOUSING: 8, WORKPLACE: 8, LANGUAGE: 6, HEALTH: 6, DOCUMENTS: 4, OTHER: 3 };
export const HIGH_ALERT_QUIET_DAYS = 30;
export const HIGH_RISK_EVENT = 'CHURN_RISK_HIGH';

export type RiskCheckIn = Pick<ArrivalCheckIn, 'audience' | 'offsetDays' | 'sentAt' | 'answer' | 'topics' | 'answeredAt' | 'resolvedAt' | 'createdAt'>;

export const levelOf = (score: number): RiskLevel => (score >= RISK_RULES.high ? 'HIGH' : score >= RISK_RULES.medium ? 'MEDIUM' : 'LOW');

/** Pure scoring (unit-tested): reasons sorted by weight, score clamped to 0–100. */
export const scoreRisk = (checkIns: RiskCheckIn[], probationEndsAt: Date | null, now = new Date()) => {
  const reasons: RiskReason[] = [];
  const recentFrom = now.getTime() - RISK_RULES.recentDays * DAY;
  const weight = (c: RiskCheckIn) => ((c.answeredAt ?? c.createdAt).getTime() >= recentFrom ? 1 : 0.5);
  const issues = checkIns.filter((c) => c.answer === 'ISSUE');

  for (const audience of ['WORKER', 'EMPLOYER'] as const) {
    const list = issues.filter((c) => c.audience === audience);
    if (!list.length) continue;
    const per = audience === 'WORKER' ? RISK_RULES.workerIssue : RISK_RULES.employerIssue;
    reasons.push({ code: audience === 'WORKER' ? 'WORKER_ISSUE' : 'EMPLOYER_ISSUE', points: Math.round(list.reduce((a, c) => a + per * weight(c), 0)), params: { count: list.length } });
  }
  const open = issues.filter((c) => !c.resolvedAt);
  if (open.length) reasons.push({ code: 'OPEN_ISSUE', points: open.length * RISK_RULES.openIssue, params: { count: open.length } });

  // Each topic once, with the weight of its most recent mention.
  const topics = new Map<Topic, number>();
  for (const c of issues) for (const t of ((c.topics as string[] | null) ?? []) as Topic[]) if (TOPIC_WEIGHT[t]) topics.set(t, Math.max(topics.get(t) ?? 0, TOPIC_WEIGHT[t] * weight(c)));
  for (const [topic, points] of topics) reasons.push({ code: 'TOPIC', points: Math.round(points), params: { topic } });

  const unanswered = checkIns.filter((c) => c.sentAt && !c.answeredAt && c.sentAt.getTime() < now.getTime() - RISK_RULES.noAnswerAfterDays * DAY);
  if (unanswered.length) reasons.push({ code: 'NO_ANSWER', points: Math.min(RISK_RULES.noAnswerMax, unanswered.length * RISK_RULES.noAnswer), params: { count: unanswered.length } });

  const answered = checkIns.filter((c) => c.answeredAt).sort((a, b) => a.answeredAt!.getTime() - b.answeredAt!.getTime());
  const [prev, last] = answered.slice(-2);
  if (prev && last && prev.answer === 'OK' && last.answer === 'ISSUE') reasons.push({ code: 'TREND_WORSE', points: RISK_RULES.trend });
  if (prev && last && prev.answer === 'ISSUE' && last.answer === 'OK') reasons.push({ code: 'TREND_BETTER', points: -RISK_RULES.trend });

  if (probationEndsAt) {
    const left = Math.ceil((probationEndsAt.getTime() - now.getTime()) / DAY);
    if (left >= 0 && left <= RISK_RULES.probationSoonDays) reasons.push({ code: 'PROBATION_SOON', points: issues.length ? RISK_RULES.probationWithIssues : RISK_RULES.probationQuiet, params: { days: left } });
  }

  reasons.sort((a, b) => b.points - a.points);
  const score = Math.max(0, Math.min(100, reasons.reduce((a, r) => a + r.points, 0)));
  return { score, level: levelOf(score), reasons };
};

const fullName = (u: { firstName: string; lastName: string } | null | undefined) => (u ? `${u.firstName} ${u.lastName}`.trim() : '');

/** Recomputes and stores the risk of one follow-up; a new HIGH alerts the responsible staff member once. */
export const recomputeRisk = async (followUpId: string, now = new Date()) => {
  const f = await prisma.arrivalFollowUp.findUnique({ where: { id: followUpId }, include: { checkIns: true } });
  if (!f) return null;
  if (f.leftJobAt) {
    // Left the job: nothing to predict any more.
    if (f.riskScore !== null) await prisma.arrivalFollowUp.update({ where: { id: f.id }, data: { riskScore: null, riskLevel: null, riskReasons: Prisma.DbNull, riskAt: now } });
    return null;
  }
  const contract = await prisma.employmentContract.findUnique({ where: { caseId: f.caseId }, select: { probationEndsAt: true } });
  const r = scoreRisk(f.checkIns, contract?.probationEndsAt ?? null, now);
  await prisma.arrivalFollowUp.update({ where: { id: f.id }, data: { riskScore: r.score, riskLevel: r.level, riskReasons: r.reasons as unknown as Prisma.InputJsonValue, riskAt: now } });
  if (r.level === 'HIGH' && f.riskLevel !== 'HIGH') await alertHighRisk(f.caseId, r, now).catch((e) => console.error('[checkins] high risk alert failed', e));
  if (r.level !== f.riskLevel) invalidateMyWork();
  return r;
};

/** Nightly: every follow-up of a worker still employed (the time-based rules move without answers). */
export const runRiskRecompute = async (now = new Date()) => {
  const rows = await prisma.arrivalFollowUp.findMany({ where: { leftJobAt: null, arrivedAt: { gte: new Date(now.getTime() - 400 * DAY) } }, select: { id: true }, take: 5000 });
  let changed = 0;
  for (const row of rows) if (await recomputeRisk(row.id, now).catch((e) => (console.error('[checkins] risk recompute failed', e), null))) changed++;
  return { followUps: rows.length, computed: changed };
};

const alertHighRisk = async (caseId: string, r: ReturnType<typeof scoreRisk>, now: Date) => {
  const recent = await prisma.caseEvent.count({ where: { caseId, type: HIGH_RISK_EVENT, createdAt: { gte: new Date(now.getTime() - HIGH_ALERT_QUIET_DAYS * DAY) } } });
  if (recent) return;
  const kase = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, number: true, assignedStaffId: true, client: { select: { firstName: true, lastName: true } } } });
  if (!kase) return;
  const staff = kase.assignedStaffId ? await prisma.user.findFirst({ where: { id: kase.assignedStaffId, isActive: true, role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] } }, select: { id: true, locale: true } }) : null;
  const recipients = staff ? [staff] : await prisma.user.findMany({ where: { isActive: true, role: { in: ['ADMIN', 'SUPER_ADMIN'] } }, select: { id: true, locale: true } });
  if (!recipients.length) return;
  const params = (l: Locale) => ({ worker: fullName(kase.client) || kase.number, number: kase.number, score: r.score, reasons: riskTexts(l).reasonList(r.reasons) });
  const taskLocale: Locale = recipients[0].locale;
  const tx = riskTexts(taskLocale);
  // Claim first (the event is the "once" marker), then create the task.
  const event = await prisma.caseEvent.create({ data: { caseId, type: HIGH_RISK_EVENT, note: tx.body(params(taskLocale)).slice(0, 2000), visibleToClient: false } });
  const task = await createNumbered(async (txn, number) => {
    const min = await txn.task.aggregate({ where: { status: 'TODO' }, _min: { sortOrder: true } });
    return txn.task.create({
      data: {
        number,
        title: tx.taskTitle(params(taskLocale)).slice(0, 200),
        description: tx.body(params(taskLocale)).slice(0, 8000),
        status: 'TODO',
        priority: 'HIGH',
        dueAt: new Date(now.getTime() + 2 * DAY),
        sortOrder: min._min.sortOrder === null ? 0 : min._min.sortOrder - 1024,
        caseId,
        assignees: { create: recipients.map((u) => ({ userId: u.id })) },
      },
    });
  });
  await prisma.caseEvent.update({ where: { id: event.id }, data: { note: `${tx.body(params(taskLocale))}\n${taskKey(task.number)}`.slice(0, 2000) } });
  await Promise.all(
    recipients.map((u) => {
      const t = riskTexts(u.locale);
      return notifyUser(u.id, { type: 'CHURN_RISK_HIGH', title: t.title(params(u.locale)), body: t.body(params(u.locale)), link: `/admin/check-ins?risk=HIGH`, caseId, forceEmail: true }).catch(() => undefined);
    }),
  );
  for (const u of recipients) invalidateMyWork(u.id);
};
