import { describe, expect, it } from 'vitest';
import type { CaseStatus } from '@prisma/client';
import { anon, asAdmin, asClient, asStaff, type Actor } from '../helpers/api';
import { prisma, settle, waitFor } from '../helpers/db';
import { createCaseVia, expectStatus } from '../helpers/workflow';
import { runHandovers } from '../../src/lib/assignment/handover.js';
import { runAutomationQueue } from '../../src/lib/automation/engine.js';

const DAY = 24 * 60 * 60 * 1000;

const configure = async (admin: Actor, value: Record<string, unknown>) =>
  expectStatus(await admin.agent.put('/api/admin/assignment/config').send({ mode: 'leastLoaded', ...value }), 200).body.config;

const prefs = async (admin: Actor, userId: string, value: Record<string, unknown>) =>
  expectStatus(await admin.agent.put(`/api/admin/assignment/staff/${userId}/prefs`).send(value), 200).body.prefs;

const newCase = async (opts: { locale?: 'az' | 'de' | 'en' | 'ru'; visaType?: string } = {}) => {
  const client = await asClient({ locale: opts.locale ?? 'az' });
  const res = expectStatus(await client.agent.post('/api/cases').send({ profession: 'Sürücü', visaType: opts.visaType ?? 'WORK' }), 201);
  return prisma.case.findUniqueOrThrow({ where: { id: res.body.case.id } });
};

/** Gives `staffId` `n` open cases in `status` (created through the API, then moved directly). */
const load = async (staffId: string, n: number, status: CaseStatus = 'DOCUMENTS_PENDING') => {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const c = await createCaseVia((await asClient()).agent);
    await prisma.case.update({ where: { id: c.id }, data: { assignedStaffId: staffId, status } });
    ids.push(c.id);
  }
  return ids;
};

const bakuWeekday = () => ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 } as Record<string, number>)[new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Baku', weekday: 'short' }).format(new Date())];

describe('automatic assignment: strategy and eligibility', () => {
  it('least loaded by weighted status, not by raw count', async () => {
    const admin = await asAdmin();
    const s1 = await asStaff();
    const s2 = await asStaff();
    await configure(admin, { staffIds: [s1.user.id, s2.user.id] });
    await load(s1.user.id, 1, 'DOCUMENTS_REVIEW'); // weight 1.5
    await load(s2.user.id, 2, 'DOCUMENTS_PENDING'); // 2 × 0.5 = 1
    expect((await newCase()).assignedStaffId).toBe(s2.user.id);

    // Custom weights flip it.
    await configure(admin, { staffIds: [s1.user.id, s2.user.id], weights: { DOCUMENTS_REVIEW: 0.2 } });
    expect((await newCase()).assignedStaffId).toBe(s1.user.id);
  });

  it('round-robin tie-break: equal load → whoever got a case least recently', async () => {
    const admin = await asAdmin();
    const s1 = await asStaff();
    const s2 = await asStaff();
    await configure(admin, { staffIds: [s1.user.id, s2.user.id] });
    const a = await newCase();
    const b = await newCase();
    expect([a.assignedStaffId, b.assignedStaffId].sort()).toEqual([s1.user.id, s2.user.id].sort());
    // Equal again (0.5 each): the next goes to the one who received the first case.
    expect((await newCase()).assignedStaffId).toBe(a.assignedStaffId);
  });

  it('eligibility: language, visa types, max open cases, working days, auto-assign off, leave', async () => {
    const admin = await asAdmin();
    const s1 = await asStaff();
    const s2 = await asStaff();
    await configure(admin, { staffIds: [s1.user.id, s2.user.id] });
    await load(s1.user.id, 3); // s1 is busier, so s1 is only picked where s2 is not eligible

    await prefs(admin, s2.user.id, { languages: ['az', 'ru'] });
    expect((await newCase({ locale: 'de' })).assignedStaffId).toBe(s1.user.id);
    expect((await newCase({ locale: 'ru' })).assignedStaffId).toBe(s2.user.id);

    await prefs(admin, s2.user.id, { languages: [], visaTypes: ['STUDY'] });
    expect((await newCase({ visaType: 'WORK' })).assignedStaffId).toBe(s1.user.id);
    expect((await newCase({ visaType: 'STUDY' })).assignedStaffId).toBe(s2.user.id);

    await prefs(admin, s2.user.id, { visaTypes: [], maxOpenCases: 1 }); // s2 already has one open case
    expect((await newCase()).assignedStaffId).toBe(s1.user.id);

    await prefs(admin, s2.user.id, { maxOpenCases: null, workingDays: [1, 2, 3, 4, 5, 6, 7].filter((d) => d !== bakuWeekday()) });
    expect((await newCase()).assignedStaffId).toBe(s1.user.id);

    await prefs(admin, s2.user.id, { workingDays: [], autoAssign: false });
    expect((await newCase()).assignedStaffId).toBe(s1.user.id);

    await prefs(admin, s2.user.id, { autoAssign: true });
    await prisma.leaveRequest.create({ data: { userId: s2.user.id, type: 'VACATION', status: 'APPROVED', startsAt: new Date(Date.now() - DAY), endsAt: new Date(Date.now() + DAY) } });
    expect((await newCase()).assignedStaffId).toBe(s1.user.id);

    // Nobody eligible → stays unassigned (the dashboard counts it).
    await prefs(admin, s1.user.id, { autoAssign: false });
    expect((await newCase()).assignedStaffId).toBeNull();
  });

  it('settings API: admin only, validated; staff edit their own preferences; the old Settings key keeps working', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    expectStatus(await staff.agent.put('/api/admin/assignment/config').send({ mode: 'leastLoaded' }), 403);
    expectStatus(await staff.agent.get('/api/admin/assignment'), 403);
    expect((await admin.agent.put('/api/admin/assignment/config').send({ mode: 'sometimes' })).status).toBe(400);
    expect((await admin.agent.put('/api/admin/assignment/config').send({ mode: 'leastLoaded', staffIds: ['nope'] })).status).toBe(400);

    const me = expectStatus(await staff.agent.put('/api/admin/assignment/me').send({ languages: ['de', 'en'], maxOpenCases: 12 }), 200).body.prefs;
    expect(me).toMatchObject({ languages: ['de', 'en'], maxOpenCases: 12, autoAssign: true });
    expect(expectStatus(await staff.agent.get('/api/admin/assignment/me'), 200).body.prefs.languages).toEqual(['de', 'en']);

    const cfg = await configure(admin, { matchLanguage: false, handover: true });
    expect(cfg).toMatchObject({ mode: 'leastLoaded', matchLanguage: false, handover: true, inquiries: false });
    expect(await prisma.auditLog.count({ where: { action: { in: ['ASSIGNMENT_SETTINGS_UPDATED', 'ASSIGNMENT_PREFS_UPDATED'] } } })).toBe(2);

    // Settings → older card (generic setting route) still drives the strategy.
    expectStatus(await admin.agent.put('/api/admin/settings/autoAssign').send({ value: { mode: 'off' } }), 200);
    expect((await newCase()).assignedStaffId).toBeNull();
  });

  it('new inquiries become a follow-up task for an eligible staff member (optional)', async () => {
    const admin = await asAdmin();
    const s1 = await asStaff({ locale: 'de' });
    await configure(admin, { staffIds: [s1.user.id], inquiries: true });
    expectStatus(await anon().post('/api/public/inquiries').send({ kind: 'company', companyName: 'Nord GmbH', contactName: 'Hans Becker', email: 'hans@nord.test', message: 'Wir suchen fünf Fahrer für Hamburg.', locale: 'de' }), 201);
    const task = await waitFor(() => prisma.task.findFirst({ include: { assignees: true } }));
    expect(task.title).toBe('Anfrage: Hans Becker (Nord GmbH) kontaktieren');
    expect(task.assignees.map((a) => a.userId)).toEqual([s1.user.id]);
  });

  it('automation action "run auto-assignment" uses the strategy even when automatic assignment is off', async () => {
    const admin = await asAdmin();
    const s1 = await asStaff();
    await configure(admin, { mode: 'off', staffIds: [s1.user.id] });
    expectStatus(await admin.agent.post('/api/admin/automation/rules').send({ name: 'Assign', enabled: true, trigger: { type: 'CASE_CREATED' }, conditions: [], actions: [{ type: 'ASSIGN', mode: 'AUTO', onlyIfUnassigned: true }] }), 201);
    const c = await newCase();
    expect(c.assignedStaffId).toBeNull();
    await settle();
    await runAutomationQueue();
    expect((await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).assignedStaffId).toBe(s1.user.id);
    expect(await prisma.notification.count({ where: { userId: s1.user.id, type: 'CASE_ASSIGNED' } })).toBe(1);
  });
});

describe('automatic assignment: dashboard and rebalance', () => {
  it('shows load per staff + unassigned and applies a rebalance suggestion (stale moves are skipped)', async () => {
    const admin = await asAdmin();
    const s1 = await asStaff({ firstName: 'Busy' });
    const s2 = await asStaff({ firstName: 'Free' });
    await configure(admin, { mode: 'off', staffIds: [s1.user.id, s2.user.id] });
    const busy = await load(s1.user.id, 6); // weighted 3.0
    await createCaseVia((await asClient()).agent); // unassigned (mode off)

    const view = expectStatus(await admin.agent.get('/api/admin/assignment'), 200).body;
    expect(view.unassigned).toBe(1);
    const row = view.staff.find((s: { id: string }) => s.id === s1.user.id);
    expect(row).toMatchObject({ open: 6, weighted: 3 });
    const moves = view.suggestion as { caseId: string; fromId: string | null; toId: string }[];
    expect(moves.length).toBe(2);
    expect(moves[0]).toMatchObject({ fromId: null, toId: s2.user.id });
    expect(moves[1]).toMatchObject({ fromId: s1.user.id, toId: s2.user.id });
    expect(busy).toContain(moves[1].caseId);

    const stale = { caseId: busy[0] === moves[1].caseId ? busy[1] : busy[0], fromId: s2.user.id, toId: s2.user.id };
    const res = expectStatus(await admin.agent.post('/api/admin/assignment/rebalance').send({ moves: [...moves, stale] }), 200).body;
    expect(res.applied).toHaveLength(2);
    expect(res.skipped).toEqual([stale.caseId]);
    expect(await prisma.case.count({ where: { assignedStaffId: s2.user.id } })).toBe(2);
    expect(await prisma.notification.count({ where: { userId: s1.user.id, type: 'CASE_REASSIGNED' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'ASSIGNMENT_REBALANCED' } })).toBe(1);

    const again = expectStatus(await admin.agent.get('/api/admin/assignment'), 200).body;
    expect(again.unassigned).toBe(0);
    expect(again.suggestion).toEqual([]);
  });
});

describe('absence handover', () => {
  it('hands open cases over when leave starts and returns them afterwards (unless reassigned manually)', async () => {
    const admin = await asAdmin();
    const owner = await asStaff({ firstName: 'Aynur', lastName: 'Owner', locale: 'de' });
    const sub1 = await asStaff({ firstName: 'Sub', lastName: 'One' });
    const sub2 = await asStaff({ firstName: 'Sub', lastName: 'Two' });
    await configure(admin, { mode: 'leastLoaded', handover: true, staffIds: [owner.user.id, sub1.user.id, sub2.user.id] });
    const owned = await load(owner.user.id, 2);
    const closed = (await load(owner.user.id, 1, 'APPROVED'))[0];

    // Remote work is not an absence.
    const remote = await prisma.leaveRequest.create({ data: { userId: owner.user.id, type: 'REMOTE', status: 'APPROVED', startsAt: new Date(Date.now() - DAY), endsAt: new Date(Date.now() + DAY) } });
    expect((await runHandovers()).started).toBe(0);
    await prisma.leaveRequest.delete({ where: { id: remote.id } });

    const leave = await prisma.leaveRequest.create({ data: { userId: owner.user.id, type: 'VACATION', status: 'APPROVED', startsAt: new Date(Date.now() - 60_000), endsAt: new Date(Date.now() + 5 * DAY) } });
    expect((await runHandovers()).started).toBe(2);
    expect((await runHandovers()).started).toBe(0); // idempotent

    const rows = await prisma.case.findMany({ where: { id: { in: owned } } });
    expect(rows.every((r) => r.assignedStaffId === sub1.user.id || r.assignedStaffId === sub2.user.id)).toBe(true);
    expect(new Set(rows.map((r) => r.assignedStaffId)).size).toBe(2); // spread by load
    expect((await prisma.case.findUniqueOrThrow({ where: { id: closed } })).assignedStaffId).toBe(owner.user.id);
    const hs = await prisma.caseHandover.findMany({ where: { status: 'ACTIVE' } });
    expect(hs).toHaveLength(2);
    expect(hs.every((h) => h.originalStaffId === owner.user.id && h.leaveId === leave.id)).toBe(true);
    const ownerNote = await prisma.notification.findFirstOrThrow({ where: { userId: owner.user.id, type: 'CASE_HANDOVER' } });
    expect(ownerNote.title).toBe('Abwesenheit: 2 Anträge vorübergehend übergeben');
    expect(await prisma.notification.count({ where: { userId: { in: [sub1.user.id, sub2.user.id] }, type: 'CASE_HANDOVER' } })).toBe(2);

    // New cases skip the absent owner.
    expect((await newCase()).assignedStaffId).not.toBe(owner.user.id);

    // Meanwhile: one case is reassigned manually; the other one moves on in the workflow.
    const [keptId, returnedId] = owned;
    const keptRow = rows.find((r) => r.id === keptId)!;
    const other = keptRow.assignedStaffId === sub1.user.id ? sub2.user.id : sub1.user.id;
    await prisma.case.update({ where: { id: keptId }, data: { assignedStaffId: other } });
    await prisma.caseEvent.create({ data: { caseId: returnedId, type: 'STATUS_CHANGED', fromStatus: 'DOCUMENTS_PENDING', toStatus: 'DOCUMENTS_REVIEW', actorId: null } });
    await prisma.case.update({ where: { id: returnedId }, data: { status: 'DOCUMENTS_REVIEW' } });

    // Leave ends (shortened) → return.
    await prisma.leaveRequest.update({ where: { id: leave.id }, data: { endsAt: new Date(Date.now() - 1000) } });
    const back = await runHandovers();
    expect(back).toMatchObject({ returned: 1, kept: 1 });
    expect((await prisma.case.findUniqueOrThrow({ where: { id: returnedId } })).assignedStaffId).toBe(owner.user.id);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: keptId } })).assignedStaffId).toBe(other);
    expect((await prisma.caseHandover.findMany({ orderBy: { caseId: 'asc' } })).map((h) => h.status).sort()).toEqual(['KEPT', 'RETURNED']);

    const welcome = await prisma.notification.findFirstOrThrow({ where: { userId: owner.user.id, type: 'CASE_HANDOVER_END' } });
    expect(welcome.title).toBe('Willkommen zurück! 1 Anträge sind wieder bei Ihnen');
    expect(welcome.body).toContain('1 Anträge wurden in der Zwischenzeit manuell neu zugewiesen');
    const subId = rows.find((r) => r.id === returnedId)!.assignedStaffId!;
    const summary = await prisma.notification.findFirstOrThrow({ where: { userId: subId, type: 'CASE_HANDOVER_END' } });
    expect(summary.body).toContain('→');
    expect(summary.body).toMatch(/1 hadisə/);

    const list = expectStatus(await admin.agent.get('/api/admin/assignment/handovers'), 200).body.handovers;
    expect(list).toHaveLength(2);
    expect(list[0].originalName).toBe('Aynur Owner');
  });

  it('does nothing while the handover switch is off (but returns active handovers when switched off)', async () => {
    const admin = await asAdmin();
    const owner = await asStaff();
    const sub = await asStaff();
    await configure(admin, { handover: false, staffIds: [owner.user.id, sub.user.id] });
    const [id] = await load(owner.user.id, 1);
    await prisma.leaveRequest.create({ data: { userId: owner.user.id, type: 'SICK', status: 'APPROVED', startsAt: new Date(Date.now() - 60_000), endsAt: new Date(Date.now() + DAY) } });
    expect((await runHandovers()).started).toBe(0);
    expect((await prisma.case.findUniqueOrThrow({ where: { id } })).assignedStaffId).toBe(owner.user.id);
  });
});
