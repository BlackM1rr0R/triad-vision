import type { Locale } from '@prisma/client';
import { prisma } from '../../db.js';
import { FINAL_STATUSES } from '../caseFlow.js';
import { notifyUser } from '../notifications.js';
import { audit } from '../audit.js';
import { STATUS_LABELS } from '../register/labels.js';
import { absences, assignCase, pickAssignee, readAssignmentConfig, targetOfCase } from './index.js';
import { assignmentTexts } from './texts.js';

/**
 * Absence handover (run by the 15-minute automation job):
 *  - when a staff member's approved leave (not REMOTE) has started, their open cases go to eligible colleagues
 *    (CaseHandover rows keep the original owner); owner and substitutes get a summary;
 *  - when the leave is over (ended, cancelled), every ACTIVE handover returns to the original owner unless the
 *    case was reassigned manually meanwhile (then KEPT); substitute and owner get a summary of what happened.
 * Returning also works with the feature switched off, so turning it off never strands cases.
 */

const fullName = (u: { firstName: string; lastName: string } | null | undefined) => (u ? `${u.firstName} ${u.lastName}`.trim() : '');

const fmtDay = (d: Date, l: Locale) =>
  new Intl.DateTimeFormat({ az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' }[l], { dateStyle: 'long', timeZone: 'Asia/Baku' }).format(d);

const users = async (ids: string[]) =>
  new Map((await prisma.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, firstName: true, lastName: true, locale: true, isActive: true } })).map((u) => [u.id, u]));

/** The job acts without a request: audit entries have no actor. */
const SYSTEM = { user: undefined, ip: undefined };

const safeNotify = (userId: string, msg: { title: string; body: string }, type: string) =>
  notifyUser(userId, { type, ...msg, link: '/admin/cases?mine=1' }).catch((e) => console.error('[handover] notify failed', e));

export const runHandovers = async (now = new Date()) => {
  const cfg = await readAssignmentConfig();
  const absent = await absences(now);
  const out = { started: 0, returned: 0, kept: 0, unassignable: 0 };

  // ── Start ────────────────────────────────────────────────────────────
  if (cfg.handover) {
    for (const [ownerId, leave] of absent) {
      const already = new Set((await prisma.caseHandover.findMany({ where: { originalStaffId: ownerId, status: 'ACTIVE' }, select: { caseId: true } })).map((h) => h.caseId));
      const cases = await prisma.case.findMany({
        where: { assignedStaffId: ownerId, status: { notIn: FINAL_STATUSES } },
        select: { id: true, number: true, status: true, client: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: 'asc' },
      });
      const handed: { caseId: string; number: string; client: string; status: string; substituteId: string }[] = [];
      for (const c of cases.filter((x) => !already.has(x.id))) {
        const target = await targetOfCase(c.id);
        const sub = await pickAssignee(prisma, { ...target, excludeIds: [ownerId] }, { force: true, now });
        if (!sub) {
          out.unassignable += 1;
          continue;
        }
        const ok = await assignCase(c.id, sub, { reason: 'handover', from: ownerId, notify: false });
        if (!ok) continue;
        await prisma.caseHandover.create({ data: { caseId: c.id, originalStaffId: ownerId, substituteId: sub, leaveId: leave.leaveId, plannedEndAt: leave.endsAt, startedAt: now } });
        handed.push({ caseId: c.id, number: c.number, client: fullName(c.client), status: c.status, substituteId: sub });
        out.started += 1;
      }
      if (!handed.length) continue;
      const people = await users([ownerId, ...handed.map((h) => h.substituteId)]);
      const owner = people.get(ownerId)!;
      const bySub = new Map<string, typeof handed>();
      for (const h of handed) bySub.set(h.substituteId, [...(bySub.get(h.substituteId) ?? []), h]);
      for (const [subId, list] of bySub) {
        const sub = people.get(subId);
        if (!sub) continue;
        const t = assignmentTexts(sub.locale);
        const lines = list.map((h) => `• ${h.number} (${h.client}) — ${STATUS_LABELS[sub.locale][h.status as keyof (typeof STATUS_LABELS)['az']]}`).join('\n');
        await safeNotify(subId, t.handoverToSubstitute({ owner: fullName(owner), until: fmtDay(leave.endsAt, sub.locale), lines }), 'CASE_HANDOVER');
      }
      await audit(SYSTEM, 'ASSIGNMENT_HANDOVER_STARTED', ownerId, { leaveId: leave.leaveId, cases: handed.map((h) => ({ caseId: h.caseId, substituteId: h.substituteId })) });
      const t = assignmentTexts(owner.locale);
      const lines = handed.map((h) => `• ${h.number} (${h.client}) → ${fullName(people.get(h.substituteId))}`).join('\n');
      await safeNotify(ownerId, t.handoverToOwner({ count: handed.length, until: fmtDay(leave.endsAt, owner.locale), lines }), 'CASE_HANDOVER');
    }
  }

  // ── Return ───────────────────────────────────────────────────────────
  const active = await prisma.caseHandover.findMany({ where: { status: 'ACTIVE' }, orderBy: { startedAt: 'asc' } });
  const ending = active.filter((h) => !absent.has(h.originalStaffId));
  if (!ending.length) return out;
  const people = await users(ending.flatMap((h) => [h.originalStaffId, h.substituteId]));
  type Line = { number: string; client: string; events: number; from: string; to: string; substituteId: string; returned: boolean };
  const byOwner = new Map<string, Line[]>();
  for (const h of ending) {
    const c = await prisma.case.findUnique({ where: { id: h.caseId }, select: { id: true, number: true, status: true, assignedStaffId: true, client: { select: { firstName: true, lastName: true } } } });
    const owner = people.get(h.originalStaffId);
    let returned = false;
    if (c && c.assignedStaffId === h.substituteId && owner?.isActive) {
      returned = await assignCase(c.id, h.originalStaffId, { reason: 'returned', from: h.substituteId, notify: false });
    }
    await prisma.caseHandover.update({ where: { id: h.id }, data: { status: returned ? 'RETURNED' : 'KEPT', endedAt: now } });
    if (returned) out.returned += 1;
    else out.kept += 1;
    if (!c) continue;
    const events = await prisma.caseEvent.findMany({
      where: { caseId: c.id, createdAt: { gte: h.startedAt, lte: now }, NOT: { type: 'CASE_UPDATED' } },
      select: { fromStatus: true, toStatus: true },
      orderBy: { createdAt: 'asc' },
    });
    const firstChange = events.find((e) => e.fromStatus && e.toStatus && e.fromStatus !== e.toStatus);
    byOwner.set(h.originalStaffId, [
      ...(byOwner.get(h.originalStaffId) ?? []),
      { number: c.number, client: fullName(c.client), events: events.length, from: firstChange?.fromStatus ?? c.status, to: c.status, substituteId: h.substituteId, returned },
    ]);
  }
  for (const [ownerId, lines] of byOwner) {
    const owner = people.get(ownerId);
    await audit(SYSTEM, 'ASSIGNMENT_HANDOVER_ENDED', ownerId, { returned: lines.filter((l) => l.returned).length, kept: lines.filter((l) => !l.returned).length });
    const label = (l: Locale, s: string) => STATUS_LABELS[l][s as keyof (typeof STATUS_LABELS)['az']] ?? s;
    const subs = new Map<string, Line[]>();
    for (const l of lines) subs.set(l.substituteId, [...(subs.get(l.substituteId) ?? []), l]);
    for (const [subId, list] of subs) {
      const sub = people.get(subId);
      if (!sub?.isActive) continue;
      const t = assignmentTexts(sub.locale);
      const body = list.map((l) => t.summaryLine({ ...l, from: label(sub.locale, l.from), to: label(sub.locale, l.to) })).join('\n');
      await safeNotify(subId, t.handoverEndSubstitute({ owner: fullName(owner), lines: body }), 'CASE_HANDOVER_END');
    }
    if (owner?.isActive) {
      const t = assignmentTexts(owner.locale);
      const back = lines.filter((l) => l.returned);
      const body = back.map((l) => t.summaryLine({ ...l, from: label(owner.locale, l.from), to: label(owner.locale, l.to) })).join('\n') || '—';
      await safeNotify(ownerId, t.handoverEndOwner({ count: back.length, lines: body, kept: lines.length - back.length }), 'CASE_HANDOVER_END');
    }
  }
  return out;
};
