import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DocStage } from '@prisma/client';
import { anon, asAdmin, asClient, asStaff, asSuperAdmin } from '../helpers/api';
import { prisma, settle } from '../helpers/db';
import { createUser, createVisaCategory, uniq } from '../helpers/factories';
import { makePdf } from '../helpers/files';
import { expectStatus } from '../helpers/workflow';
import { config } from '../../src/config.js';
import { createCase, staffMarkLodged } from '../../src/lib/caseFlow.js';
import { createRequirements } from '../../src/lib/docsIntel/requirementTemplates.js';
import { ensureCaseFolder } from '../../src/lib/drive/caseFolders.js';
import { answerCheckIn, runCheckIns } from '../../src/lib/checkIns/service.js';
import { recomputeRisk, runRiskRecompute } from '../../src/lib/checkIns/risk.js';
import { runRenewals } from '../../src/lib/renewals/service.js';
import { caseForDriveNode, packageFingerprint } from '../../src/lib/caseNext/fourEyes.js';
import { buildMyWork } from '../../src/lib/myWork.js';
import { clearCaseAiSettingsCache } from '../../src/lib/ai/features/caseAi/config.js';

const DAY = 24 * 60 * 60 * 1000;
const day = (d: Date) => d.toISOString().slice(0, 10);
type Agent = Awaited<ReturnType<typeof asStaff>>['agent'];

const writeUpload = async (buf: Buffer, ext = '.pdf') => {
  const storedName = `care-${crypto.randomBytes(8).toString('hex')}${ext}`;
  await fs.mkdir(config.uploads.privateDir, { recursive: true });
  await fs.writeFile(path.join(config.uploads.privateDir, storedName), buf);
  return storedName;
};

/** An ACCEPTED document in the requirement with `key` (created when the case has none). */
const acceptedDoc = async (caseId: string, key: string | null, uploadedById: string, opts: { stage?: DocStage; name?: string } = {}) => {
  const stage = opts.stage ?? 'INITIAL';
  let req = key ? await prisma.documentRequirement.findFirst({ where: { caseId, key } }) : null;
  if (key && !req) req = await prisma.documentRequirement.create({ data: { caseId, key, stage, title: { az: key, de: key, en: key, ru: key } } });
  const buf = await makePdf(`${key ?? 'visa'} document`);
  return prisma.document.create({
    data: { caseId, requirementId: req?.id ?? null, stage: req ? req.stage : stage, originalName: opts.name ?? `${(key ?? 'visa').toLowerCase()}.pdf`, storedName: await writeUpload(buf), mimeType: 'application/pdf', size: buf.length, status: 'ACCEPTED', uploadedById },
  });
};

// ─── Churn risk ───────────────────────────────────────────────────────

const arrived = async (daysAgo: number, opts: { staffId?: string; companyId?: string } = {}) => {
  const client = await asClient({ firstName: 'Kamran', lastName: 'Əliyev' });
  const c = await prisma.case.create({ data: { clientId: client.user.id, number: uniq('TV-R-'), profession: 'Aşpaz', status: 'APPROVED', assignedStaffId: opts.staffId ?? null, companyId: opts.companyId ?? null } });
  await prisma.arrivalPlan.create({ data: { caseId: c.id, clientId: client.user.id, status: 'COMPLETED', arrivalTime: new Date(Date.now() - daysAgo * DAY) } });
  return { client, c };
};

describe('post-arrival care: churn risk', () => {
  it('worker + employer problems make the risk HIGH: badge data, sort / filter, ONE task for the responsible staff member', async () => {
    const staff = await asStaff({ locale: 'en' });
    const company = await prisma.company.create({ data: { name: 'Hotel Adler GmbH', status: 'ACTIVE' } });
    const employer = await createUser({ role: 'COMPANY', locale: 'de' });
    await prisma.user.update({ where: { id: employer.user.id }, data: { companyId: company.id } });
    const risky = await arrived(31, { staffId: staff.user.id, companyId: company.id });
    const calm = await arrived(31, { staffId: staff.user.id });
    await runCheckIns();

    const rows = await prisma.arrivalCheckIn.findMany({ where: { caseId: risky.c.id } });
    const worker = rows.find((r) => r.audience === 'WORKER')!;
    const emp = rows.find((r) => r.audience === 'EMPLOYER')!;
    await answerCheckIn(worker, { answer: 'ISSUE', topics: ['HOMESICK', 'SALARY'], comment: 'Ailəmi çox darıxıram' }, risky.client.user.id);
    let f = await prisma.arrivalFollowUp.findUniqueOrThrow({ where: { caseId: risky.c.id } });
    expect(f).toMatchObject({ riskLevel: 'MEDIUM' });
    await answerCheckIn(emp, { answer: 'ISSUE', topics: ['TEAM'], comment: 'Konflikte im Team' }, employer.user.id);
    f = await prisma.arrivalFollowUp.findUniqueOrThrow({ where: { caseId: risky.c.id } });
    expect(f.riskLevel).toBe('HIGH');
    expect(f.riskScore).toBeGreaterThanOrEqual(55);
    expect((f.riskReasons as { code: string }[]).map((r) => r.code)).toEqual(expect.arrayContaining(['EMPLOYER_ISSUE', 'WORKER_ISSUE', 'OPEN_ISSUE', 'TOPIC']));

    // Two "problem" tasks (lib/checkIns) + exactly one churn-risk task.
    const event = await prisma.caseEvent.findFirstOrThrow({ where: { caseId: risky.c.id, type: 'CHURN_RISK_HIGH' } });
    const tasks = await prisma.task.findMany({ where: { caseId: risky.c.id }, include: { assignees: true } });
    const riskTask = tasks.find((t) => t.title.startsWith('Churn risk HIGH'))!;
    expect(tasks).toHaveLength(3);
    expect(riskTask.assignees.map((a) => a.userId)).toEqual([staff.user.id]);
    expect(event.note).toContain(`T-${String(riskTask.number).padStart(4, '0')}`);
    expect(await prisma.notification.count({ where: { userId: staff.user.id, type: 'CHURN_RISK_HIGH' } })).toBe(1);
    // In the staff member's "my work" (through the task).
    const viewer = { id: staff.user.id, role: 'STAFF' as const, locale: 'en' as const, firstName: 'S', lastName: 'T' };
    expect((await buildMyWork(viewer, { team: false })).items.some((i) => i.kind === 'task' && i.title === riskTask.title)).toBe(true);

    // Recomputing (nightly / another answer) never alerts twice.
    expect((await runRiskRecompute()).followUps).toBe(2);
    await recomputeRisk(f.id);
    expect(await prisma.caseEvent.count({ where: { type: 'CHURN_RISK_HIGH' } })).toBe(1);
    expect(await prisma.task.count({ where: { caseId: risky.c.id } })).toBe(3);

    // Overview: risk fields, sort by risk, filter.
    const ov = (await staff.agent.get('/api/admin/check-ins/overview?sort=risk')).body;
    expect(ov.workers[0]).toMatchObject({ caseId: risky.c.id, riskLevel: 'HIGH' });
    expect(ov.workers[0].riskReasons.length).toBeGreaterThan(0);
    expect(ov.totals.highRisk).toBe(1);
    const high = (await staff.agent.get('/api/admin/check-ins/overview?risk=HIGH')).body.workers;
    expect(high.map((w: { caseId: string }) => w.caseId)).toEqual([risky.c.id]);
    expect((await staff.agent.get('/api/admin/check-ins/overview?risk=LOW')).body.workers.map((w: { caseId: string }) => w.caseId)).toEqual([calm.c.id]);
    expect((await staff.agent.get('/api/admin/check-ins/overview?risk=SOMETIMES')).status).toBe(400);

    // Resolving the problems lowers the score; "left the job" clears it.
    for (const r of await prisma.arrivalCheckIn.findMany({ where: { caseId: risky.c.id, answer: 'ISSUE' } })) expectStatus(await staff.agent.post(`/api/admin/check-ins/${r.id}/resolve`).send({}), 200);
    const lowered = await prisma.arrivalFollowUp.findUniqueOrThrow({ where: { id: f.id } });
    expect(lowered.riskScore!).toBeLessThan(f.riskScore!);
    expectStatus(await staff.agent.patch(`/api/admin/check-ins/follow-ups/${f.id}/left`).send({ left: true, reason: 'QUIT' }), 200);
    expect(await prisma.arrivalFollowUp.findUniqueOrThrow({ where: { id: f.id } })).toMatchObject({ riskScore: null, riskLevel: null });
  });

  it('the public answer page offers the new topics; a probation end within 30 days is a reason', async () => {
    const { c } = await arrived(31);
    await runCheckIns();
    const row = await prisma.arrivalCheckIn.findFirstOrThrow({ where: { caseId: c.id } });
    const token = 'R'.repeat(43);
    const { hashToken } = await import('../../src/lib/checkIns/service.js');
    await prisma.arrivalCheckIn.update({ where: { id: row.id }, data: { tokenHash: hashToken(token) } });
    const view = (await anon().get(`/api/check-ins/${token}`)).body.checkIn;
    expect(view.topics).toEqual(expect.arrayContaining(['TEAM', 'LANGUAGE', 'HOMESICK']));
    await prisma.employmentContract.create({ data: { caseId: c.id, probationEndsAt: new Date(Date.now() + 10 * DAY) } });
    expectStatus(await anon().post(`/api/check-ins/${token}`).send({ answer: 'ISSUE', topics: ['LANGUAGE'] }), 200);
    const f = await prisma.arrivalFollowUp.findUniqueOrThrow({ where: { caseId: c.id } });
    expect((f.riskReasons as { code: string; points: number }[]).find((r) => r.code === 'PROBATION_SOON')).toMatchObject({ points: 15 });
  });
});

// ─── Residence title renewal + probation ──────────────────────────────

const approvedCase = async (opts: { staffId?: string; companyId?: string } = {}) => {
  const client = await asClient({ firstName: 'Nərmin', lastName: 'Quliyeva', locale: 'de' });
  const cat = await createVisaCategory();
  const c = await createCase(client.user.id, { profession: 'Pflegefachkraft', visaType: 'WORK', visaCategoryId: cat.id });
  await prisma.case.update({ where: { id: c.id }, data: { status: 'APPROVED', closedAt: new Date(), assignedStaffId: opts.staffId ?? null, companyId: opts.companyId ?? null } });
  return { client, c: await prisma.case.findUniqueOrThrow({ where: { id: c.id } }), cat };
};

describe('post-arrival care: residence title renewal', () => {
  it('staff set the expiry; 90 days ahead the job opens ONE renewal case (same client / type / staff), notifies both sides, links both ways', async () => {
    const staff = await asStaff({ locale: 'en' });
    const { client, c, cat } = await approvedCase({ staffId: staff.user.id });
    await prisma.notification.deleteMany();

    const far = day(new Date(Date.now() + 120 * DAY));
    const set = expectStatus(await staff.agent.patch(`/api/admin/renewals/cases/${c.id}`).send({ residenceTitleExpiresAt: far }), 200).body.care;
    expect(set.residenceTitleExpiresAt.slice(0, 10)).toBe(far);
    expect(set.renewalDueAt.slice(0, 10)).toBe(day(new Date(Date.parse(`${far}T00:00:00Z`) - 90 * DAY)));
    expect(await prisma.auditLog.count({ where: { action: 'RESIDENCE_TITLE_EXPIRY_SET' } })).toBe(1);
    expect((await staff.agent.patch(`/api/admin/renewals/cases/${c.id}`).send({ residenceTitleExpiresAt: '2027-02-30' })).status).toBe(400);
    expect(await runRenewals()).toEqual({ renewals: 0, probation: 0 }); // not due yet

    const soon = day(new Date(Date.now() + 80 * DAY));
    expectStatus(await staff.agent.patch(`/api/admin/renewals/cases/${c.id}`).send({ residenceTitleExpiresAt: soon }), 200);
    expect(await runRenewals()).toEqual({ renewals: 1, probation: 0 });
    expect(await runRenewals()).toEqual({ renewals: 0, probation: 0 });

    const renewal = await prisma.case.findFirstOrThrow({ where: { renewalOfCaseId: c.id } });
    expect(renewal).toMatchObject({ clientId: client.user.id, visaType: 'WORK', visaCategoryId: cat.id, assignedStaffId: staff.user.id, status: 'DOCUMENTS_PENDING', profession: 'Pflegefachkraft' });
    expect((await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).renewalCaseCreatedAt).toBeTruthy();
    expect(await prisma.documentRequirement.count({ where: { caseId: renewal.id } })).toBeGreaterThan(0);
    const ev = await prisma.caseEvent.findFirstOrThrow({ where: { caseId: renewal.id, type: 'RENEWAL_OPENED' } });
    expect(ev.note).toContain(`Verlängerung von ${c.number}`);
    expect(await prisma.caseEvent.count({ where: { caseId: c.id, type: 'RENEWAL_CASE_CREATED' } })).toBe(1);
    const cn = await prisma.notification.findFirstOrThrow({ where: { userId: client.user.id, type: 'RENEWAL_OPENED' } });
    expect(cn.title).toBe('Zeit für die Verlängerung Ihres Aufenthaltstitels');
    expect(cn.body).toContain(renewal.number);
    const sn = await prisma.notification.findFirstOrThrow({ where: { userId: staff.user.id, type: 'RENEWAL_OPENED' } });
    expect(sn.title).toBe(`Renewal case opened: Nərmin Quliyeva (${renewal.number})`);

    // Links both ways (admin case page card).
    const oldCare = expectStatus(await staff.agent.get(`/api/admin/renewals/cases/${c.id}`), 200).body.care;
    expect(oldCare.renewals.map((r: { id: string }) => r.id)).toEqual([renewal.id]);
    expect(oldCare.renewalDueAt).toBeNull();
    const newCare = expectStatus(await staff.agent.get(`/api/admin/renewals/cases/${renewal.id}`), 200).body.care;
    expect(newCare.renewalOf).toMatchObject({ id: c.id, number: c.number });
    // Manual open after the job: refused.
    expect((await staff.agent.post(`/api/admin/renewals/cases/${c.id}/open`)).body.error).toBe('RENEWAL_EXISTS');

    // Expiring page section.
    const up = expectStatus(await staff.agent.get('/api/admin/renewals/upcoming?days=90'), 200).body;
    expect(up.residence).toHaveLength(1);
    expect(up.residence[0]).toMatchObject({ case: { id: c.id }, renewal: { id: renewal.id } });
  });

  it('a client with another open case is skipped (retried later); the button opens it once that case is closed', async () => {
    const staff = await asStaff();
    const { client, c } = await approvedCase();
    await prisma.case.update({ where: { id: c.id }, data: { residenceTitleExpiresAt: new Date(Date.now() + 30 * DAY) } });
    const other = await createCase(client.user.id, { profession: 'Other', visaType: 'WORK' });
    expect(await runRenewals()).toEqual({ renewals: 0, probation: 0 });
    expect((await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).renewalCaseCreatedAt).toBeNull();
    expect((await staff.agent.post(`/api/admin/renewals/cases/${c.id}/open`)).body.error).toBe('ACTIVE_CASE_EXISTS');
    await prisma.case.update({ where: { id: other.id }, data: { status: 'CANCELLED' } });
    const opened = expectStatus(await staff.agent.post(`/api/admin/renewals/cases/${c.id}/open`), 201).body;
    expect(opened.care.renewals).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { action: 'RENEWAL_CASE_OPENED' } })).toBe(1);
  });

  it('14 days before the probation end: one staff task + notification and an employer check-in', async () => {
    const staff = await asStaff();
    const company = await prisma.company.create({ data: { name: 'Pflege Nord GmbH', status: 'ACTIVE' } });
    const employer = await createUser({ role: 'COMPANY', locale: 'de' });
    await prisma.user.update({ where: { id: employer.user.id }, data: { companyId: company.id } });
    const { c } = await arrived(150, { staffId: staff.user.id, companyId: company.id });
    await runCheckIns(new Date(Date.now() - 200 * DAY)); // creates the follow-up only (nothing due then)
    await prisma.arrivalFollowUp.findUniqueOrThrow({ where: { caseId: c.id } });
    await prisma.employmentContract.create({ data: { caseId: c.id, companyId: company.id, probationEndsAt: new Date(Date.now() + 12 * DAY) } });
    const far = await arrived(10);
    await prisma.employmentContract.create({ data: { caseId: far.c.id, probationEndsAt: new Date(Date.now() + 40 * DAY) } });

    expect(await runRenewals()).toEqual({ renewals: 0, probation: 1 });
    expect(await runRenewals()).toEqual({ renewals: 0, probation: 0 });
    const kase = await prisma.case.findUniqueOrThrow({ where: { id: c.id } });
    expect(kase.probationReminderAt).toBeTruthy();
    const task = await prisma.task.findFirstOrThrow({ where: { caseId: c.id }, include: { assignees: true } });
    expect(task.title).toContain('Sınaq müddəti');
    expect(task.assignees.map((a) => a.userId)).toEqual([staff.user.id]);
    expect(await prisma.notification.count({ where: { userId: staff.user.id, type: 'PROBATION_ENDING' } })).toBe(1);
    expect(await prisma.arrivalCheckIn.count({ where: { caseId: c.id, audience: 'EMPLOYER' } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: employer.user.id, type: 'CHECKIN_EMPLOYER' } })).toBe(1);
    const up = expectStatus(await staff.agent.get('/api/admin/renewals/upcoming?days=30'), 200).body;
    expect(up.probation.map((p: { case: { id: string } }) => p.case.id)).toEqual([c.id]);
    expect(up.probation[0]).toMatchObject({ employer: 'Pflege Nord GmbH' });
    expect(up.probation[0].remindedAt).toBeTruthy();
  });

  it('settings: lead days are configurable (ADMIN+)', async () => {
    const staff = await asStaff();
    const admin = await asAdmin();
    expect((await staff.agent.get('/api/admin/renewals/settings')).body.settings).toEqual({ enabled: true, residenceLeadDays: 90, probationLeadDays: 14, probationEmployerCheckIn: true });
    expect((await staff.agent.put('/api/admin/renewals/settings').send({ enabled: true, residenceLeadDays: 120, probationLeadDays: 21, probationEmployerCheckIn: false })).status).toBe(403);
    expectStatus(await admin.agent.put('/api/admin/renewals/settings').send({ enabled: true, residenceLeadDays: 120, probationLeadDays: 21, probationEmployerCheckIn: false }), 200);
    const { c } = await approvedCase();
    await prisma.case.update({ where: { id: c.id }, data: { residenceTitleExpiresAt: new Date(Date.now() + 110 * DAY) } });
    expect((await runRenewals()).renewals).toBe(1);
  });
});

// ─── Family reunion ───────────────────────────────────────────────────

describe('post-arrival care: family reunion (Familiennachzug)', () => {
  const memberBody = (over: Record<string, unknown> = {}) => ({ relation: 'spouse', firstName: 'Aysel', lastName: 'Quliyeva', joinsWhen: 'LATER', ...over });

  it('copies reusable main-case documents into a member case when added (same bytes, idempotent, docsCopiedAt + event)', async () => {
    const staff = await asStaff();
    const { client, c } = await approvedCase({ staffId: staff.user.id });
    const passport = await acceptedDoc(c.id, 'PASSPORT', client.user.id);
    await acceptedDoc(c.id, 'MARRIAGE_CERT', client.user.id, { name: 'heiratsurkunde.pdf' });
    await acceptedDoc(c.id, null, staff.user.id, { stage: 'VISA', name: 'visum.pdf' });
    await acceptedDoc(c.id, 'SALARY_SLIPS', client.user.id, { name: 'lohn-08.pdf' });
    await acceptedDoc(c.id, 'SALARY_SLIPS', client.user.id, { name: 'lohn-09.pdf' });
    const pending = await acceptedDoc(c.id, 'SIGNED_CONTRACT', client.user.id);
    await prisma.document.update({ where: { id: pending.id }, data: { status: 'PENDING' } }); // not approved: not copied

    const res = expectStatus(await staff.agent.post(`/api/family/cases/${c.id}/members`).send(memberBody()), 201).body;
    const memberId = res.memberCaseId as string;
    const docs = await prisma.document.findMany({ where: { caseId: memberId }, include: { requirement: { select: { key: true, required: true } } } });
    expect(docs.map((d) => d.requirement?.key).sort()).toEqual(['MARRIAGE_CERT', 'SPONSOR_PASSPORT', 'SPONSOR_RESIDENCE_TITLE', 'SPONSOR_SALARY', 'SPONSOR_SALARY']);
    expect(docs.every((d) => d.status === 'ACCEPTED')).toBe(true);
    // The marriage certificate fills the spouse's own (required) requirement → provided.
    expect(docs.find((d) => d.requirement?.key === 'MARRIAGE_CERT')!.requirement!.required).toBe(true);
    const copy = docs.find((d) => d.requirement?.key === 'SPONSOR_PASSPORT')!;
    expect(copy.storedName).not.toBe(passport.storedName);
    const [a, b] = await Promise.all([fs.readFile(path.join(config.uploads.privateDir, copy.storedName)), fs.readFile(path.join(config.uploads.privateDir, passport.storedName))]);
    expect(a.equals(b)).toBe(true);
    const profile = await prisma.familyMember.findUniqueOrThrow({ where: { memberCaseId: memberId } });
    expect(profile.docsCopiedAt).toBeTruthy();
    expect(await prisma.caseEvent.count({ where: { caseId: memberId, type: 'FAMILY_DOCS_COPIED' } })).toBe(1);

    // Running again copies nothing new; a newly approved document is picked up.
    expect(expectStatus(await staff.agent.post(`/api/family/cases/${c.id}/copy-documents`), 200).body.copied).toEqual([{ caseId: memberId, number: expect.any(String), copied: 0 }]);
    await prisma.document.update({ where: { id: pending.id }, data: { status: 'ACCEPTED' } });
    expect(expectStatus(await staff.agent.post(`/api/family/cases/${c.id}/copy-documents`), 200).body.copied[0].copied).toBe(1);
    expect(await prisma.document.count({ where: { caseId: memberId } })).toBe(6);
    // Clients cannot trigger copies.
    expect((await client.agent.post(`/api/family/cases/${c.id}/copy-documents`)).status).toBe(403);
  });

  it('"Start Familiennachzug": only after approval, opens LATER members (also a cancelled one), notifies the client, once', async () => {
    const staff = await asStaff();
    const { client, c } = await approvedCase({ staffId: staff.user.id });
    await prisma.case.update({ where: { id: c.id }, data: { status: 'APPOINTMENT_SCHEDULED', closedAt: null } });
    const later = expectStatus(await staff.agent.post(`/api/family/cases/${c.id}/members`).send(memberBody()), 201).body.memberCaseId as string;
    const child = expectStatus(await staff.agent.post(`/api/family/cases/${c.id}/members`).send(memberBody({ relation: 'child', firstName: 'Murad', birthDate: '2019-04-02' })), 201).body.memberCaseId as string;
    const withMain = expectStatus(await staff.agent.post(`/api/family/cases/${c.id}/members`).send(memberBody({ firstName: 'Səbinə', relation: 'parent', joinsWhen: 'WITH_MAIN' })), 201).body.memberCaseId as string;
    await prisma.case.update({ where: { id: child }, data: { status: 'CANCELLED', cancelReason: 'Später', closedAt: new Date() } });

    let ov = expectStatus(await client.agent.get(`/api/family/cases/${c.id}`), 200).body;
    expect(ov.reunion).toMatchObject({ ready: false, startedAt: null, laterCount: 2 });
    expect((await staff.agent.post(`/api/family/cases/${c.id}/reunion/start`)).body.error).toBe('MAIN_CASE_NOT_READY');
    // Arrival (plan completed) is enough.
    await prisma.arrivalPlan.create({ data: { caseId: c.id, clientId: client.user.id, status: 'COMPLETED', arrivalTime: new Date() } });
    expect((await client.agent.post(`/api/family/cases/${c.id}/reunion/start`)).status).toBe(403);
    await prisma.notification.deleteMany();

    const started = expectStatus(await staff.agent.post(`/api/family/cases/${c.id}/reunion/start`), 200).body;
    expect(started.started.map((s: { caseId: string }) => s.caseId).sort()).toEqual([later, child].sort());
    expect(started.started.find((s: { caseId: string }) => s.caseId === child)).toMatchObject({ reopened: true });
    const childCase = await prisma.case.findUniqueOrThrow({ where: { id: child } });
    expect(childCase).toMatchObject({ status: 'DOCUMENTS_PENDING', visaType: 'FAMILY', cancelReason: null, closedAt: null });
    expect(await prisma.documentRequirement.count({ where: { caseId: child, key: 'BIRTH_CERT' } })).toBe(1);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: withMain } })).status).toBe('DOCUMENTS_PENDING');
    expect(await prisma.caseEvent.count({ where: { caseId: withMain, type: 'FAMILY_REUNION_STARTED' } })).toBe(0);
    expect(await prisma.caseEvent.count({ where: { caseId: later, type: 'FAMILY_REUNION_STARTED', visibleToClient: true } })).toBe(1);
    const n = await prisma.notification.findFirstOrThrow({ where: { userId: client.user.id, type: 'FAMILY_REUNION_STARTED' } });
    expect(n.title).toBe('Familiennachzug gestartet');
    expect(n.body).toContain('Aysel Quliyeva');
    expect(await prisma.auditLog.count({ where: { action: 'FAMILY_REUNION_STARTED' } })).toBe(1);

    ov = expectStatus(await client.agent.get(`/api/family/cases/${c.id}`), 200).body;
    expect(ov.reunion.startedAt).toBeTruthy();
    expect(ov.reunion.startable).toEqual([]);
    expect(ov.reunion.members.find((m: { caseId: string }) => m.caseId === later).startedAt).toBeTruthy();
    expect((await staff.agent.post(`/api/family/cases/${c.id}/reunion/start`)).body.error).toBe('NOTHING_TO_START');
  });
});

// ─── Four-eyes check ──────────────────────────────────────────────────

/** WORK case at APPOINTMENT_SCHEDULED with accepted embassy documents. */
const embassyCase = async () => {
  clearCaseAiSettingsCache();
  const client = await asClient({ firstName: 'Elvin', lastName: 'Məmmədov', locale: 'de' });
  const c = await createCase(client.user.id, { profession: 'LKW sürücüsü', visaType: 'WORK' });
  await prisma.$transaction((tx) => createRequirements(tx, c.id, 'EMBASSY', null));
  await prisma.case.update({ where: { id: c.id }, data: { status: 'APPOINTMENT_SCHEDULED', appointmentAt: new Date(Date.now() + 10 * DAY), appointmentPlace: 'Deutsche Botschaft Baku' } });
  for (const key of ['VIDEX', 'PASSPORT', 'PHOTO_2']) await acceptedDoc(c.id, key, client.user.id);
  return { client, c };
};

const lodge = (agent: Agent, caseId: string) => agent.post(`/api/admin/cases/${caseId}/actions`).send({ action: 'MARK_LODGED' });
const fullChecklist = ['DOCS_COMPLETE', 'TRANSLATIONS_APOSTILLE', 'NAMES_MATCH_PASSPORT', 'PHOTOS_SPEC', 'FORMS_SIGNED'].map((key) => ({ key, ok: true }));

describe('post-arrival care: four-eyes check before the embassy', () => {
  it('builder requests, a DIFFERENT staff member approves with the checklist; the gate opens only for the approved package', async () => {
    const builder = await asStaff({ firstName: 'Tofiq', lastName: 'Abbasov', locale: 'en' });
    const reviewer = await asStaff({ firstName: 'Nigar', lastName: 'Bayramova', locale: 'en' });
    const { c, client } = await embassyCase();

    expect((await lodge(builder.agent, c.id)).body.error).toBe('FOUR_EYES_REQUIRED');
    expect((await builder.agent.post(`/api/admin/cases/${c.id}/four-eyes/request`).send({})).body.error).toBe('PACKAGE_NOT_BUILT');
    expectStatus(await builder.agent.post(`/api/admin/cases/${c.id}/embassy-package`).send({}), 201);
    expect((await builder.agent.post(`/api/admin/cases/${c.id}/four-eyes/request`).send({ reviewerId: builder.user.id })).body.error).toBe('FOUR_EYES_SAME_PERSON');
    const req = expectStatus(await builder.agent.post(`/api/admin/cases/${c.id}/four-eyes/request`).send({ reviewerId: reviewer.user.id, note: 'Bitte prüfen' }), 201).body.fourEyes;
    expect(req).toMatchObject({ state: 'PENDING', cleared: false, canReview: false, latest: { requestedBy: { id: builder.user.id }, reviewer: { id: reviewer.user.id } } });
    expect(req.latest.packageHash).toBe((await packageFingerprint(c.id)).hash);
    expect((await builder.agent.post(`/api/admin/cases/${c.id}/four-eyes/request`).send({ reviewerId: reviewer.user.id })).body.error).toBe('FOUR_EYES_PENDING');
    expect(await prisma.notification.count({ where: { userId: reviewer.user.id, type: 'FOUR_EYES' } })).toBe(1);

    // "Waiting for my review": the reviewer's queue / my work, not the builder's.
    expect(expectStatus(await reviewer.agent.get('/api/admin/four-eyes/queue'), 200).body.items.map((i: { case: { id: string } }) => i.case.id)).toEqual([c.id]);
    expect((await builder.agent.get('/api/admin/four-eyes/queue')).body.items).toEqual([]);
    const work = await buildMyWork({ id: reviewer.user.id, role: 'STAFF', locale: 'en', firstName: 'N', lastName: 'B' }, { team: false });
    expect(work.items.find((i) => i.kind === 'embassy_review')).toMatchObject({ refs: { caseId: c.id, approvalId: req.latest.id }, category: 'documents' });
    expect((await buildMyWork({ id: builder.user.id, role: 'STAFF', locale: 'en', firstName: 'T', lastName: 'A' }, { team: false })).items.some((i) => i.kind === 'embassy_review')).toBe(false);

    const review = (agent: Agent, body: Record<string, unknown>) => agent.post(`/api/admin/four-eyes/${req.latest.id}/review`).send(body);
    expect((await review(builder.agent, { decision: 'APPROVE', checklist: fullChecklist })).body.error).toBe('FOUR_EYES_SAME_PERSON');
    const other = await asStaff();
    expect((await review(other.agent, { decision: 'APPROVE', checklist: fullChecklist })).body.error).toBe('NOT_ASSIGNED_REVIEWER');
    expect((await review(reviewer.agent, { decision: 'APPROVE', checklist: fullChecklist.slice(1) })).body.error).toBe('CHECKLIST_INCOMPLETE');
    expect((await review(reviewer.agent, { decision: 'REJECT' })).body.error).toBe('COMMENT_REQUIRED');
    const ok = expectStatus(await review(reviewer.agent, { decision: 'APPROVE', checklist: fullChecklist, comment: 'Alles vollständig' }), 200).body.fourEyes;
    expect(ok).toMatchObject({ state: 'APPROVED', cleared: true, latest: { reviewer: { id: reviewer.user.id }, comment: 'Alles vollständig' } });
    expect(ok.latest.checklist.every((i: { ok: boolean }) => i.ok)).toBe(true);
    const back = await prisma.notification.findFirstOrThrow({ where: { userId: builder.user.id, type: 'FOUR_EYES' } });
    expect(back.title).toBe(`Embassy package approved: ${c.number}`);
    expect(await prisma.auditLog.count({ where: { action: { in: ['FOUR_EYES_REQUESTED', 'FOUR_EYES_APPROVED'] } } })).toBe(2);

    // The package changes after the approval → re-approval needed.
    await acceptedDoc(c.id, 'HEALTH_INSURANCE', client.user.id);
    expect((await builder.agent.get(`/api/admin/cases/${c.id}/four-eyes`)).body.fourEyes).toMatchObject({ state: 'STALE', cleared: false });
    expect((await lodge(builder.agent, c.id)).body.error).toBe('FOUR_EYES_PACKAGE_CHANGED');
    const again = expectStatus(await builder.agent.post(`/api/admin/cases/${c.id}/four-eyes/request`).send({}), 201).body.fourEyes;
    // Unassigned: any other staff member may review it.
    expectStatus(await other.agent.post(`/api/admin/four-eyes/${again.latest.id}/review`).send({ decision: 'APPROVE', checklist: fullChecklist }), 200);
    expectStatus(await lodge(builder.agent, c.id), 200);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('DECISION_PENDING');
  });

  it('a rejected review keeps the gate closed; the package changing between request and review blocks the approval', async () => {
    const builder = await asStaff();
    const reviewer = await asAdmin();
    const { c, client } = await embassyCase();
    expectStatus(await builder.agent.post(`/api/admin/cases/${c.id}/embassy-package`).send({}), 201);
    const r1 = expectStatus(await builder.agent.post(`/api/admin/cases/${c.id}/four-eyes/request`).send({}), 201).body.fourEyes.latest;
    expectStatus(await reviewer.agent.post(`/api/admin/four-eyes/${r1.id}/review`).send({ decision: 'REJECT', comment: 'Foto entspricht nicht den Vorgaben' }), 200);
    expect((await lodge(builder.agent, c.id)).body.error).toBe('FOUR_EYES_REQUIRED');
    expect((await prisma.notification.findFirstOrThrow({ where: { userId: builder.user.id, type: 'FOUR_EYES' } })).body).toContain('Foto entspricht nicht den Vorgaben');

    const r2 = expectStatus(await builder.agent.post(`/api/admin/cases/${c.id}/four-eyes/request`).send({}), 201).body.fourEyes.latest;
    await acceptedDoc(c.id, 'HEALTH_INSURANCE', client.user.id);
    expect((await reviewer.agent.post(`/api/admin/four-eyes/${r2.id}/review`).send({ decision: 'APPROVE', checklist: fullChecklist })).body.error).toBe('FOUR_EYES_PACKAGE_CHANGED');
    // Re-requesting refreshes the pending request with the new package.
    const r3 = expectStatus(await builder.agent.post(`/api/admin/cases/${c.id}/four-eyes/request`).send({}), 201).body.fourEyes;
    expect(r3.latest.id).toBe(r2.id);
    expect(r3.current.changedSinceRequest).toBe(false);
    expectStatus(await reviewer.agent.post(`/api/admin/four-eyes/${r2.id}/review`).send({ decision: 'APPROVE', checklist: fullChecklist }), 200);
    await staffMarkLodged(c.id, builder.user.id);
  });

  it('SUPER_ADMIN override needs a reason (audited); the setting switches the gate off', async () => {
    const staff = await asStaff();
    const admin = await asAdmin();
    const su = await asSuperAdmin();
    const { c } = await embassyCase();
    expect((await staff.agent.post(`/api/admin/cases/${c.id}/four-eyes/override`).send({ reason: 'Termin morgen früh' })).status).toBe(403);
    expect((await admin.agent.post(`/api/admin/cases/${c.id}/four-eyes/override`).send({ reason: 'Termin morgen früh' })).status).toBe(403);
    expect((await su.agent.post(`/api/admin/cases/${c.id}/four-eyes/override`).send({})).status).toBe(400);
    const o = expectStatus(await su.agent.post(`/api/admin/cases/${c.id}/four-eyes/override`).send({ reason: 'Termin morgen früh, Prüfer krank' }), 201).body.fourEyes;
    expect(o).toMatchObject({ state: 'OVERRIDDEN', cleared: true, latest: { comment: 'Termin morgen früh, Prüfer krank' } });
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'FOUR_EYES_OVERRIDDEN' } });
    expect(log.details).toMatchObject({ reason: 'Termin morgen früh, Prüfer krank' });
    expectStatus(await lodge(staff.agent, c.id), 200);

    // Gate off (ADMIN+): no review needed.
    const second = await embassyCase();
    expect((await staff.agent.put('/api/admin/four-eyes/settings').send({ enabled: false })).status).toBe(403);
    expectStatus(await admin.agent.put('/api/admin/four-eyes/settings').send({ enabled: false }), 200);
    expect((await staff.agent.get(`/api/admin/cases/${second.c.id}/four-eyes`)).body.fourEyes).toMatchObject({ enabled: false, cleared: true });
    expectStatus(await lodge(staff.agent, second.c.id), 200);
  });

  it('a drive file of the case cannot move to SENT_TO_EMBASSY without the approval', async () => {
    const staff = await asStaff();
    const su = await asSuperAdmin();
    const { c } = await embassyCase();
    const folderId = await ensureCaseFolder(c.id);
    expect(folderId).toBeTruthy();
    const up = await staff.agent.post(`/api/drive/nodes/${folderId}/files`).attach('file', await makePdf('Paket'), { filename: 'paket.pdf', contentType: 'application/pdf' });
    expectStatus(up, 201);
    const fileId = up.body.item.id as string;
    expect(await caseForDriveNode(fileId)).toBe(c.id);
    expectStatus(await staff.agent.patch(`/api/drive/nodes/${fileId}/stage`).send({ stage: 'READY' }), 200);
    const refused = await staff.agent.patch(`/api/drive/nodes/${fileId}/stage`).send({ stage: 'SENT_TO_EMBASSY' });
    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe('FOUR_EYES_REQUIRED');
    const bulk = expectStatus(await staff.agent.post('/api/drive/stage/bulk').send({ ids: [fileId], stage: 'SENT_TO_EMBASSY' }), 200).body;
    expect(bulk.results[0]).toMatchObject({ ok: false, error: 'FOUR_EYES_REQUIRED' });
    expectStatus(await su.agent.post(`/api/admin/cases/${c.id}/four-eyes/override`).send({ reason: 'Original bereits abgegeben' }), 201);
    expectStatus(await staff.agent.patch(`/api/drive/nodes/${fileId}/stage`).send({ stage: 'SENT_TO_EMBASSY' }), 200);
    await settle();
  });
});
