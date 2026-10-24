import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { beforeEach, describe, expect, it } from 'vitest';
import { TEST_UPLOADS_DIR } from '../helpers/testEnv';
import { anon, asAdmin, asClient, asStaff, sessionAgent } from '../helpers/api';
import { prisma, waitFor } from '../helpers/db';
import { createUser } from '../helpers/factories';
import { binaryParser, makePdf, PDF } from '../helpers/files';
import { act, adminCase, approveFourEyes, clientCase, createCaseVia, driveCaseTo, expectStatus } from '../helpers/workflow';

// Other suites running at the same time may clear the shared temp upload dir; make sure it exists.
beforeEach(() => {
  fs.mkdirSync(path.join(TEST_UPLOADS_DIR, 'private'), { recursive: true });
  fs.mkdirSync(path.join(TEST_UPLOADS_DIR, 'public'), { recursive: true });
});

/** A referral partner with a portal login (AGENT user linked as ReferralPartner.userId). */
const asPartner = async (name = 'İlqar Məmmədov', locale: 'az' | 'de' | 'en' | 'ru' = 'en') => {
  const u = await createUser({ role: 'AGENT', firstName: 'İlqar', lastName: 'Məmmədov', locale });
  const partner = await prisma.referralPartner.create({ data: { name, userId: u.user.id, commissionCents: 10000 } });
  return { ...u, partner, agent: sessionAgent(u.token) };
};

/** A client case linked to the partner through the admin API (as staff do it). */
const partnerCase = async (admin: Awaited<ReturnType<typeof asAdmin>>, partnerId: string, opts: { firstName?: string; lastName?: string; passport?: string } = {}) => {
  const client = await asClient({ firstName: opts.firstName ?? 'Ayan', lastName: opts.lastName ?? 'Quliyeva' });
  if (opts.passport !== undefined) await prisma.user.update({ where: { id: client.user.id }, data: { passportNumber: opts.passport } });
  const c = await createCaseVia(client.agent);
  expectStatus(await admin.agent.patch('/api/admin/partners/assign').send({ caseIds: [c.id], partnerId }), 200);
  return { client, case: c };
};

describe('partner portal: access control', () => {
  it('requires an AGENT login linked to a partner and shows only the partner’s own cases', async () => {
    const admin = await asAdmin();
    const p = await asPartner();
    const other = await asPartner('Ənvər');
    const mine = await partnerCase(admin, p.partner.id);
    const theirs = await partnerCase(admin, other.partner.id, { firstName: 'Kamran', lastName: 'Əliyev' });

    expect((await anon().get('/api/partner/me')).status).toBe(401);
    const client = await asClient();
    expect((await client.agent.get('/api/partner/me')).status).toBe(403);
    expect((await (await asStaff()).agent.get('/api/partner/cases')).status).toBe(403);
    // An AGENT without a partner link (agent programme only, or an unlinked login).
    const lone = await createUser({ role: 'AGENT' });
    const res = await sessionAgent(lone.token).get('/api/partner/me');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('NO_PARTNER_PROFILE');

    const me = expectStatus(await p.agent.get('/api/partner/me'), 200).body;
    expect(me.partner).toMatchObject({ id: p.partner.id, name: 'İlqar Məmmədov', commissionCents: 10000 });
    expect(me.alsoAgent).toBe(false);

    const list = expectStatus(await p.agent.get('/api/partner/cases'), 200).body.items;
    expect(list.map((c: { id: string }) => c.id)).toEqual([mine.case.id]);
    expect((await p.agent.get(`/api/partner/cases/${theirs.case.id}`)).status).toBe(404);
    expect((await p.agent.get(`/api/partner/cases/${mine.case.id}`)).status).toBe(200);
    const theirReq = (await clientCase(theirs.client.agent, theirs.case.id)).requirements[0]!;
    const up = await p.agent
      .post(`/api/partner/cases/${theirs.case.id}/documents`)
      .field('requirementId', theirReq.id)
      .attach('file', await makePdf('x'), { filename: 'x.pdf', ...PDF });
    expect(up.status).toBe(404);
    expect(await prisma.document.count({ where: { caseId: theirs.case.id } })).toBe(0);

    // The same login may also be an agent: the portal says so (the client links both portals).
    await prisma.agent.create({ data: { userId: p.user.id, code: 'ILQAR-1' } });
    expect((await p.agent.get('/api/partner/me')).body.alsoAgent).toBe(true);
    // Agent pages still guard on the Agent row: a partner-only login gets NO_AGENT_PROFILE there.
    expect((await other.agent.get('/api/agent/me')).body.error).toBe('NO_AGENT_PROFILE');
  });
});

describe('partner portal: data minimisation', () => {
  it('masks the passport and never returns staff notes, event notes, contacts or other uploads', async () => {
    const admin = await asAdmin();
    const p = await asPartner();
    const { client, case: c } = await partnerCase(admin, p.partner.id, { passport: 'C01234567' });
    await prisma.case.update({ where: { id: c.id }, data: { staffNote: 'INTERNAL-STAFF-NOTE' } });
    await prisma.caseEvent.create({ data: { caseId: c.id, type: 'NOTE', note: 'SECRET-EVENT-NOTE', visibleToClient: true, actorId: admin.user.id } });
    await prisma.caseEvent.create({ data: { caseId: c.id, type: 'INTERNAL', note: 'HIDDEN', visibleToClient: false, actorId: admin.user.id } });
    // The client's own upload: the partner sees the status, not the file name.
    const req = (await clientCase(client.agent, c.id)).requirements.find((r) => r.stage === 'INITIAL' && r.required)!;
    expectStatus(
      await client.agent.post(`/api/cases/${c.id}/documents`).field('requirementId', req.id).attach('file', await makePdf('p'), { filename: 'client-private-name.pdf', ...PDF }),
      201,
    );

    const list = expectStatus(await p.agent.get('/api/partner/cases'), 200);
    const detail = expectStatus(await p.agent.get(`/api/partner/cases/${c.id}`), 200);
    for (const body of [JSON.stringify(list.body), JSON.stringify(detail.body)]) {
      expect(body).not.toContain('C01234567');
      expect(body).not.toContain('INTERNAL-STAFF-NOTE');
      expect(body).not.toContain('SECRET-EVENT-NOTE');
      expect(body).not.toContain('HIDDEN');
      expect(body).not.toContain('client-private-name');
      expect(body).not.toContain(client.user.email);
      expect(body).not.toContain('staffNote');
    }
    const d = detail.body.case;
    expect(d.client).toEqual({ firstName: 'Ayan', lastName: 'Quliyeva', passport: '******567' });
    expect(d).toMatchObject({ status: 'DOCUMENTS_PENDING', step: 'DOCUMENTS', nextAction: 'UPLOAD_DOCUMENTS', uploadStage: 'INITIAL' });
    expect(d.timeline.every((e: Record<string, unknown>) => !('note' in e) && !('actorId' in e))).toBe(true);
    expect(d.timeline.some((e: { type: string }) => e.type === 'INTERNAL')).toBe(false);
    const r = d.requirements.find((x: { id: string }) => x.id === req.id);
    expect(r).toMatchObject({ state: 'UPLOADED', myUploads: [], documentCount: 1 });
  });
});

describe('partner portal: upload on behalf of the client', () => {
  it('stores the file as the partner’s upload, pending staff review, with the client-facing rejection reason', async () => {
    const admin = await asAdmin();
    const p = await asPartner();
    const { client, case: c } = await partnerCase(admin, p.partner.id);
    const reqs = (await clientCase(client.agent, c.id)).requirements;
    const initial = reqs.find((r) => r.stage === 'INITIAL' && r.required)!;

    const missing = await p.agent.post(`/api/partner/cases/${c.id}/documents`).field('requirementId', initial.id);
    expect(missing.status).toBe(400);
    const res = await p.agent
      .post(`/api/partner/cases/${c.id}/documents`)
      .field('requirementId', initial.id)
      .attach('file', await makePdf('passport'), { filename: 'pasport.pdf', ...PDF });
    expect(res.status).toBe(201);
    const doc = await prisma.document.findUniqueOrThrow({ where: { id: res.body.document.id } });
    expect(doc).toMatchObject({ uploadedById: p.user.id, status: 'PENDING', stage: 'INITIAL', requirementId: initial.id, caseId: c.id });
    expect(await prisma.auditLog.count({ where: { action: 'PARTNER_DOCUMENT_UPLOADED', actorId: p.user.id } })).toBe(1);

    // Staff see it in the normal review queue and reject it with a reason.
    const staffView = await adminCase(admin.agent, c.id);
    expect(staffView.requirements.find((r) => r.id === initial.id)!.documents.map((x) => x.id)).toContain(doc.id);
    expectStatus(await admin.agent.post(`/api/admin/cases/${c.id}/documents/${doc.id}/review`).send({ status: 'REJECTED', note: 'Şəkil bulanıqdır' }), 200);
    const d = expectStatus(await p.agent.get(`/api/partner/cases/${c.id}`), 200).body.case;
    const r = d.requirements.find((x: { id: string }) => x.id === initial.id);
    expect(r).toMatchObject({ state: 'REJECTED', rejectionReason: 'Şəkil bulanıqdır', canUpload: true });
    expect(r.myUploads).toEqual([expect.objectContaining({ id: doc.id, name: 'pasport.pdf', status: 'REJECTED' })]);

    // Only the requirement of the current upload stage; a closed stage refuses uploads.
    const embassy = await prisma.documentRequirement.create({ data: { caseId: c.id, stage: 'EMBASSY', title: { az: 'X', de: 'X', en: 'X', ru: 'X' } } });
    const wrong = await p.agent.post(`/api/partner/cases/${c.id}/documents`).field('requirementId', embassy.id).attach('file', await makePdf('e'), { filename: 'e.pdf', ...PDF });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error).toBe('INVALID_REQUIREMENT');
    await prisma.case.update({ where: { id: c.id }, data: { status: 'DOCUMENTS_REVIEW' } });
    const closed = await p.agent.post(`/api/partner/cases/${c.id}/documents`).field('requirementId', initial.id).attach('file', await makePdf('c'), { filename: 'c.pdf', ...PDF });
    expect(closed.status).toBe(409);
    // A fake PDF is refused by the content check (same as the client upload).
    await prisma.case.update({ where: { id: c.id }, data: { status: 'DOCUMENTS_PENDING' } });
    const fake = await p.agent.post(`/api/partner/cases/${c.id}/documents`).field('requirementId', initial.id).attach('file', Buffer.from('not a pdf at all'), { filename: 'f.pdf', ...PDF });
    expect(fake.status).toBe(400);
  });
});

describe('partner portal: dashboard, commissions and notifications', () => {
  it('notifies the partner about appointment and decision, shows counts and commissions, exports own rows', async () => {
    const admin = await asAdmin();
    const p = await asPartner('İlqar Məmmədov', 'en');
    const client = await asClient({ firstName: 'Rəşad', lastName: 'Həsənov' });
    const c = await driveCaseTo('APPOINTMENT_SCHEDULED', { client: client.agent, admin: admin.agent });
    expectStatus(await admin.agent.patch('/api/admin/partners/assign').send({ caseIds: [c.id], partnerId: p.partner.id }), 200);

    expectStatus(await act(admin.agent, c.id, { action: 'SCHEDULE_APPOINTMENT', at: '2026-12-01T09:30:00+04:00', place: 'Embassy Baku' }), 200);
    const moved = await waitFor(() => prisma.notification.findFirst({ where: { userId: p.user.id, type: 'PARTNER_APPOINTMENT_MOVED' } }));
    expect(moved.title).toBe('Embassy appointment set: Rəşad Həsənov');
    expect(moved.link).toBe(`/partner/clients/${c.id}`);
    await waitFor(() => prisma.emailLog.findFirst({ where: { to: p.user.email, subject: `Triad Vision · ${moved.title}` } }));

    await approveFourEyes(c.id);
    expectStatus(await act(admin.agent, c.id, { action: 'MARK_LODGED' }), 200);
    expectStatus(await act(admin.agent, c.id, { action: 'DECIDE', decision: 'APPROVED' }), 200);
    const approved = await waitFor(() => prisma.notification.findFirst({ where: { userId: p.user.id, type: 'PARTNER_CASE_APPROVED' } }));
    expect(approved.title).toBe('Visa approved: Rəşad Həsənov');
    // No message for steps that do not concern the partner (e.g. lodged at the embassy).
    expect(await prisma.notification.count({ where: { userId: p.user.id } })).toBe(2);

    // Commission created on assign (default 100.00), then paid → partner notified.
    const row = await prisma.partnerCommission.findFirstOrThrow({ where: { partnerId: p.partner.id, caseId: c.id } });
    expect(row).toMatchObject({ status: 'PENDING', amountCents: 10000 });
    await prisma.partnerCommission.update({ where: { id: row.id }, data: { note: 'internal remark' } });
    expectStatus(await admin.agent.post(`/api/admin/partners/commissions/${row.id}/pay`).send({ note: 'Bank köçürməsi #77' }), 200);
    const paid = await waitFor(() => prisma.notification.findFirst({ where: { userId: p.user.id, type: 'PARTNER_COMMISSION_PAID' } }));
    expect(paid.title).toMatch(/^Commission paid: /);
    expect(paid.link).toBe('/partner/commissions');

    const dash = expectStatus(await p.agent.get('/api/partner/dashboard'), 200).body;
    expect(dash.counts).toEqual({ clients: 1, cases: 1, activeCases: 0, approvedVisas: 1 });
    expect(dash.commissions).toMatchObject({ paidCents: 10000, pendingCents: 0 });
    expect(dash.recent.length).toBeGreaterThan(0);
    expect(dash.recent[0]).toMatchObject({ caseId: c.id, client: 'Rəşad Həsənov' });

    const com = expectStatus(await p.agent.get('/api/partner/commissions'), 200).body;
    expect(com.items).toHaveLength(1);
    expect(com.items[0]).toMatchObject({ status: 'PAID', amountCents: 10000, note: 'Bank köçürməsi #77', case: { id: c.id, client: 'Rəşad Həsənov' } });
    expect(com.totals).toMatchObject({ paidCents: 10000 });

    const xlsx = await p.agent.get('/api/partner/commissions/export.xlsx').buffer(true).parse(binaryParser);
    expect(xlsx.status).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlsx.body as unknown as ExcelJS.Buffer);
    const det = wb.getWorksheet('Ətraflı')!;
    expect(det.rowCount).toBe(2);
    expect(det.getRow(1).values).not.toContain('Partnyor');
    expect(det.getRow(2).getCell(4).value).toBe(100);

    // Another partner's rows never show up.
    const other = await asPartner('Ənvər');
    expect((await other.agent.get('/api/partner/commissions')).body.items).toHaveLength(0);
  });
});
