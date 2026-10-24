import type { Locale } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { formatDay } from '../growthTexts.js';
import { invalidateMyWork } from '../myWork.js';
import { notifyUser } from '../notifications.js';
import { ACCEL_FINAL, FINAL_PROCESS_STATUSES, accelDeadlines, effectiveDeadline } from './rules.js';
import { DAY, admins, claimReminder, daysUntil, fullName, responsible, staffTask } from './common.js';
import { openReplyDue, syncPowerOfAttorney } from './accelerated.js';
import { recognitionTexts, type DeadlineP } from './texts.js';

/**
 * Deadline reminders of the recognition tracker and the § 81a procedure (daily job `recognition-deadlines`,
 * idempotent through ReminderLog keys that contain the deadline itself — a moved deadline is reminded again):
 *   - `leadDays` (default 7) before a deadline: a task + notification for the responsible staff member
 *     (the assigned one, else every admin);
 *   - once a deadline has passed: an escalation (HIGH task, notification to the responsible staff member
 *     and every admin).
 * Recognition: RecognitionProcess.nextDeadline (else adaptationUntil while the adaptation measure runs).
 * § 81a: embassy appointment / decision deadlines, the fee, the reply date of the latest incoming letter.
 * The job also picks up a signed Vollmacht (e-signature) for procedures still waiting for it.
 */

export const DEADLINE_SETTING_KEY = 'recognitionDeadlines';
export const deadlineSettingsSchema = z.object({ enabled: z.boolean(), leadDays: z.number().int().min(1).max(60) });
export type DeadlineSettings = z.infer<typeof deadlineSettingsSchema>;
export const DEFAULT_DEADLINE_SETTINGS: DeadlineSettings = { enabled: true, leadDays: 7 };

export const getDeadlineSettings = async (): Promise<DeadlineSettings> => {
  const row = await prisma.setting.findUnique({ where: { key: DEADLINE_SETTING_KEY } });
  const parsed = deadlineSettingsSchema.safeParse({ ...DEFAULT_DEADLINE_SETTINGS, ...((row?.value ?? {}) as object) });
  return parsed.success ? parsed.data : DEFAULT_DEADLINE_SETTINGS;
};

export const saveDeadlineSettings = async (s: DeadlineSettings) => {
  await prisma.setting.upsert({ where: { key: DEADLINE_SETTING_KEY }, create: { key: DEADLINE_SETTING_KEY, value: s }, update: { value: s } });
  return s;
};

interface Due {
  key: string;
  caseId: string;
  at: Date;
  what: (l: Locale) => string;
  anchor: 'case-recognition' | 'case-81a';
}

const remind = async (d: Due, now: Date, leadDays: number) => {
  const left = daysUntil(d.at, now);
  const overdue = d.at.getTime() < now.getTime();
  if (!overdue && left > leadDays) return false;
  const claimed = await claimReminder(`${overdue ? 'overdue' : 'due'}:${d.key}:${d.at.toISOString().slice(0, 10)}`, now);
  if (!claimed) return false;
  const c = await prisma.case.findUnique({ where: { id: d.caseId }, select: { id: true, number: true, status: true, assignedStaffId: true, client: { select: { firstName: true, lastName: true } } } });
  if (!c || c.status === 'CANCELLED') return false;
  const owners = await responsible(c.assignedStaffId);
  const recipients = overdue ? [...owners, ...(await admins()).filter((a) => !owners.some((o) => o.id === a.id))] : owners;
  const p = (l: Locale): DeadlineP => ({ worker: fullName(c.client) || c.number, number: c.number, what: d.what(l), date: formatDay(d.at, l), days: Math.max(0, left) });
  const locale: Locale = owners[0]?.locale ?? 'az';
  const t0 = recognitionTexts(locale);
  await staffTask({
    caseId: c.id,
    title: overdue ? t0.overdueTitle(p(locale)) : t0.dueTask(p(locale)),
    description: overdue ? t0.overdueBody(p(locale)) : t0.dueBody(p(locale)),
    dueAt: overdue ? new Date(now.getTime() + DAY) : d.at,
    priority: overdue ? 'HIGH' : 'NORMAL',
    userIds: owners.map((u) => u.id),
  });
  for (const u of recipients) {
    const t = recognitionTexts(u.locale);
    await notifyUser(u.id, {
      type: overdue ? 'RECOGNITION_DEADLINE_OVERDUE' : 'RECOGNITION_DEADLINE',
      title: overdue ? t.overdueTitle(p(u.locale)) : t.dueTitle(p(u.locale)),
      body: overdue ? t.overdueBody(p(u.locale)) : t.dueBody(p(u.locale)),
      link: `/admin/cases/${c.id}#${d.anchor}`,
      caseId: c.id,
    }).catch(() => undefined);
    invalidateMyWork(u.id);
  }
  return true;
};

export const runRecognitionDeadlines = async (now = new Date()) => {
  const s = await getDeadlineSettings();
  const result = { recognition: 0, accelerated: 0, vollmacht: 0 };
  // Signed powers of attorney first (also when reminders are switched off).
  const waiting = await prisma.acceleratedProcedure.findMany({ where: { powerOfAttorneyAt: null, status: { notIn: [...ACCEL_FINAL] } }, take: 500 });
  for (const p of waiting) if ((await syncPowerOfAttorney(p).catch(() => p)).powerOfAttorneyAt) result.vollmacht++;
  if (!s.enabled) return result;

  const horizon = new Date(now.getTime() + s.leadDays * DAY);
  const processes = await prisma.recognitionProcess.findMany({
    where: { status: { notIn: [...FINAL_PROCESS_STATUSES] }, OR: [{ nextDeadline: { lte: horizon } }, { status: 'ADAPTATION', nextDeadline: null, adaptationUntil: { lte: horizon } }] },
    take: 1000,
  });
  for (const r of processes) {
    const d = effectiveDeadline(r);
    if (!d) continue;
    const ok = await remind(
      { key: `recog:${r.id}:${d.kind}`, caseId: r.caseId, at: d.at, anchor: 'case-recognition', what: (l) => [recognitionTexts(l).recognitionDeadline[d.kind], d.kind === 'NEXT' ? r.nextDeadlineNote : null].filter(Boolean).join(': ') },
      now,
      s.leadDays,
    ).catch((e) => (console.error('[recognition] reminder failed', r.id, e), false));
    if (ok) result.recognition++;
  }

  const procedures = await prisma.acceleratedProcedure.findMany({ where: { status: { notIn: [...ACCEL_FINAL] } }, take: 1000 });
  for (const p of procedures) {
    for (const d of accelDeadlines(p, await openReplyDue(p.id))) {
      const ok = await remind({ key: `accel:${p.id}:${d.kind}`, caseId: p.caseId, at: d.at, anchor: 'case-81a', what: (l) => recognitionTexts(l).accelDeadline[d.kind] }, now, s.leadDays).catch(
        (e) => (console.error('[accelerated] reminder failed', p.id, e), false),
      );
      if (ok) result.accelerated++;
    }
  }
  return result;
};

/** Expiring page: recognition and § 81a deadlines within `days` (overdue ones included). */
export const upcomingDeadlines = async (days: number, opts: { staffId?: string; now?: Date } = {}) => {
  const now = opts.now ?? new Date();
  const until = new Date(now.getTime() + days * DAY);
  const [processes, procedures] = await Promise.all([
    prisma.recognitionProcess.findMany({ where: { status: { notIn: [...FINAL_PROCESS_STATUSES] }, OR: [{ nextDeadline: { lte: until } }, { status: 'ADAPTATION', nextDeadline: null, adaptationUntil: { lte: until } }] }, take: 300 }),
    prisma.acceleratedProcedure.findMany({ where: { status: { notIn: [...ACCEL_FINAL] } }, take: 500 }),
  ]);
  const rows: { source: 'RECOGNITION' | 'ACCELERATED'; id: string; caseId: string; kind: string; at: Date; note: string | null }[] = [];
  for (const r of processes) {
    const d = effectiveDeadline(r);
    if (d) rows.push({ source: 'RECOGNITION', id: r.id, caseId: r.caseId, kind: d.kind, at: d.at, note: d.kind === 'NEXT' ? r.nextDeadlineNote : r.adaptationMeasure });
  }
  for (const p of procedures) for (const d of accelDeadlines(p, await openReplyDue(p.id))) if (d.at <= until) rows.push({ source: 'ACCELERATED', id: p.id, caseId: p.caseId, kind: d.kind, at: d.at, note: p.authority });
  const staffWhere = opts.staffId === 'none' ? { assignedStaffId: null } : opts.staffId ? { assignedStaffId: opts.staffId } : {};
  const cases = rows.length
    ? await prisma.case.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.caseId))] }, ...staffWhere }, select: { id: true, number: true, status: true, client: { select: { id: true, firstName: true, lastName: true } }, assignedStaff: { select: { id: true, firstName: true, lastName: true } } } })
    : [];
  const caseOf = new Map(cases.map((c) => [c.id, c]));
  return rows
    .filter((r) => caseOf.has(r.caseId))
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .map((r) => {
      const c = caseOf.get(r.caseId)!;
      return {
        ...r,
        daysLeft: Math.ceil((r.at.getTime() - now.getTime()) / DAY),
        case: { id: c.id, number: c.number, status: c.status },
        client: { id: c.client.id, name: fullName(c.client) },
        staff: c.assignedStaff ? { id: c.assignedStaff.id, name: fullName(c.assignedStaff) } : null,
      };
    });
};
