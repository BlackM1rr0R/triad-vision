import { describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { asAdmin, asStaff } from '../helpers/api';
import { createUser } from '../helpers/factories';
import { emailsTo, prisma, settle } from '../helpers/db';

const lead = (over: Partial<Prisma.InquiryUncheckedCreateInput> = {}) =>
  prisma.inquiry.create({ data: { kind: 'contact', contactName: 'Lead Person', email: `l${Math.random().toString(36).slice(2, 8)}@x.test`, message: 'hello there', locale: 'az', ...over } });

const makeAgent = async () => {
  const u = await createUser({ role: 'AGENT', firstName: 'Ali', lastName: 'Agentov' });
  return prisma.agent.create({ data: { userId: u.user.id, code: `GANJA-${Math.random().toString(36).slice(2, 6).toUpperCase()}` } });
};

describe('admin inquiries: server-side list', () => {
  it('pages, searches, filters and sums workers over the filter', async () => {
    const staff = await asStaff();
    const other = await asStaff();
    const agent = await makeAgent();
    for (let i = 0; i < 7; i++) await lead({ contactName: `Bulk ${i}`, createdAt: new Date(Date.now() - i * 60_000) });
    const a = await lead({ kind: 'company', companyName: 'Nord Spedition GmbH', contactName: 'Hans', workersNeeded: 12, assignedStaffId: staff.user.id, scoreLevel: 'HOT', score: 80 });
    const b = await lead({ kind: 'company', companyName: 'Süd Bau', contactName: 'Karl', workersNeeded: 5, status: 'DONE', assignedStaffId: other.user.id });
    const c = await lead({ contactName: 'Agent Lead', phone: '+994501112233', agentId: agent.id, source: `agent:${agent.id}`, createdAt: new Date('2026-03-10T08:00:00Z') });

    const p1 = (await staff.agent.get('/api/admin/inquiries?pageSize=4&sort=newest').expect(200)).body;
    expect(p1.items).toHaveLength(4);
    expect(p1.total).toBe(10);
    expect(p1.summary).toMatchObject({ total: 10, workersRequested: 17, byKind: { company: 2, contact: 8 }, byStatus: { NEW: 9, DONE: 1 }, hotOpen: 1, mine: 1, unassigned: 8 });
    const p3 = (await staff.agent.get('/api/admin/inquiries?pageSize=4&sort=newest&page=3').expect(200)).body;
    expect(p3.items).toHaveLength(2);
    expect(new Set([...p1.items, ...p3.items].map((i: { id: string }) => i.id)).size).toBe(6);

    // Search over company name / phone / message.
    expect((await staff.agent.get('/api/admin/inquiries?q=spedition').expect(200)).body.items.map((i: { id: string }) => i.id)).toEqual([a.id]);
    expect((await staff.agent.get('/api/admin/inquiries?q=1112233').expect(200)).body.items.map((i: { id: string }) => i.id)).toEqual([c.id]);

    // Kind filter: workers sum and status chips follow it; chips ignore the status filter itself.
    const companies = (await staff.agent.get('/api/admin/inquiries?kind=company&status=NEW').expect(200)).body;
    expect(companies.items.map((i: { id: string }) => i.id)).toEqual([a.id]);
    expect(companies.summary).toMatchObject({ total: 1, workersRequested: 12, byStatus: { NEW: 1, DONE: 1 } });

    // Assignee: mine / unassigned / a staff id.
    expect((await staff.agent.get('/api/admin/inquiries?assignee=me').expect(200)).body.items.map((i: { id: string }) => i.id)).toEqual([a.id]);
    expect((await staff.agent.get(`/api/admin/inquiries?assignee=${other.user.id}`).expect(200)).body.items.map((i: { id: string }) => i.id)).toEqual([b.id]);
    expect((await staff.agent.get('/api/admin/inquiries?assignee=none').expect(200)).body.total).toBe(8);

    // Agent: badge data, the "via" filter, source group, date range.
    const viaAgent = (await staff.agent.get(`/api/admin/inquiries?via=agent:${agent.id}`).expect(200)).body;
    expect(viaAgent.items).toHaveLength(1);
    expect(viaAgent.items[0].agent).toMatchObject({ id: agent.id, name: 'Ali Agentov', code: agent.code });
    expect(viaAgent.facets.agents).toEqual([expect.objectContaining({ id: agent.id, count: 1 })]);
    expect(viaAgent.facets.sources).toEqual(expect.arrayContaining([{ key: 'agent', count: 1 }, { key: 'web', count: 9 }]));
    expect((await staff.agent.get('/api/admin/inquiries?source=agent').expect(200)).body.total).toBe(1);
    expect((await staff.agent.get('/api/admin/inquiries?from=2026-03-10&to=2026-03-10').expect(200)).body.items.map((i: { id: string }) => i.id)).toEqual([c.id]);

    // Level + owner name; "hot" sort puts the HOT open lead first.
    const hot = (await staff.agent.get('/api/admin/inquiries').expect(200)).body;
    expect(hot.items[0]).toMatchObject({ id: a.id, assignedStaff: { id: staff.user.id } });
    expect((await staff.agent.get('/api/admin/inquiries?level=HOT').expect(200)).body.total).toBe(1);
    expect((await staff.agent.get('/api/admin/inquiries?sort=workers&pageSize=1').expect(200)).body.items[0].id).toBe(a.id);

    expect((await staff.agent.get('/api/admin/inquiries?pageSize=500').expect(400)).body.error).toBeTruthy();
    expect((await staff.agent.get(`/api/admin/inquiries/${c.id}`).expect(200)).body.item.agent.name).toBe('Ali Agentov');
  });
});

describe('admin inquiries: owner, notes, take', () => {
  it('assigns with a notification, unassigns, takes and audits', async () => {
    const admin = await asAdmin();
    const staff = await asStaff({ locale: 'de' });
    const q = await lead({ companyName: 'Muster AG', kind: 'company' });

    const r = (await admin.agent.put(`/api/admin/inquiries/${q.id}/assignee`).send({ staffId: staff.user.id }).expect(200)).body;
    expect(r.item).toMatchObject({ assignedStaffId: staff.user.id, assignedStaff: { id: staff.user.id } });
    const n = await prisma.notification.findFirstOrThrow({ where: { userId: staff.user.id, type: 'INQUIRY_ASSIGNED' } });
    expect(n.link).toBe(`/admin/inquiries?open=${q.id}`);
    expect(n.title).toContain('Muster AG');
    expect(await prisma.auditLog.findFirst({ where: { action: 'INQUIRY_ASSIGNED', target: `inquiry:${q.id}` } })).toMatchObject({ details: { from: null, to: staff.user.id } });

    await admin.agent.put(`/api/admin/inquiries/${q.id}/assignee`).send({ staffId: null }).expect(200);
    expect((await prisma.inquiry.findUniqueOrThrow({ where: { id: q.id } })).assignedStaffId).toBeNull();
    expect(await prisma.auditLog.count({ where: { action: 'INQUIRY_UNASSIGNED' } })).toBe(1);

    // "Mənə götür" (no notice to myself).
    await staff.agent.put(`/api/admin/inquiries/${q.id}/assignee`).send({ staffId: 'me' }).expect(200);
    expect((await prisma.inquiry.findUniqueOrThrow({ where: { id: q.id } })).assignedStaffId).toBe(staff.user.id);
    expect(await prisma.notification.count({ where: { userId: staff.user.id, type: 'INQUIRY_ASSIGNED' } })).toBe(1);

    // Clients and inactive users cannot own leads.
    const client = await createUser({ role: 'CLIENT' });
    expect((await admin.agent.put(`/api/admin/inquiries/${q.id}/assignee`).send({ staffId: client.user.id }).expect(400)).body.error).toBe('INVALID_STAFF');
    await admin.agent.put('/api/admin/inquiries/nope/assignee').send({ staffId: null }).expect(404);

    // my-work "take": status + owner.
    const q2 = await lead();
    const take = (await admin.agent.patch(`/api/admin/inquiries/${q2.id}`).send({ status: 'IN_PROGRESS', assignToMe: true }).expect(200)).body.item;
    expect(take).toMatchObject({ status: 'IN_PROGRESS', assignedStaffId: admin.user.id });
  });

  it('saves staff notes with an audit entry (no entry when unchanged)', async () => {
    const staff = await asStaff();
    const q = await lead();
    expect((await staff.agent.put(`/api/admin/inquiries/${q.id}/notes`).send({ staffNotes: 'Called, call back Monday' }).expect(200)).body.item.staffNotes).toBe('Called, call back Monday');
    await staff.agent.put(`/api/admin/inquiries/${q.id}/notes`).send({ staffNotes: 'Called, call back Monday' }).expect(200);
    expect(await prisma.auditLog.count({ where: { action: 'INQUIRY_NOTES_UPDATED', target: `inquiry:${q.id}` } })).toBe(1);
    await staff.agent.put(`/api/admin/inquiries/${q.id}/notes`).send({ staffNotes: '  ' }).expect(200);
    expect((await prisma.inquiry.findUniqueOrThrow({ where: { id: q.id } })).staffNotes).toBeNull();
    const anon = await lead({ anonymizedAt: new Date() });
    expect((await staff.agent.put(`/api/admin/inquiries/${anon.id}/notes`).send({ staffNotes: 'x' }).expect(409)).body.error).toBe('INQUIRY_ANONYMIZED');
  });

  it('my-work shows new leads assigned to me or unassigned, not those of a colleague', async () => {
    const me = await asStaff();
    const other = await asStaff();
    const mine = await lead({ assignedStaffId: me.user.id });
    const free = await lead();
    await lead({ assignedStaffId: other.user.id });
    const res = (await me.agent.get('/api/admin/my-work?fresh=1').expect(200)).body;
    const ids = res.items.filter((i: { kind: string }) => i.kind === 'inquiry').map((i: { refs: { inquiryId: string } }) => i.refs.inquiryId);
    expect(ids.sort()).toEqual([mine.id, free.id].sort());
    const item = res.items.find((i: { refs: { inquiryId?: string } }) => i.refs.inquiryId === free.id);
    expect(item.actions[0]).toMatchObject({ key: 'take', body: { status: 'IN_PROGRESS', assignToMe: true } });
  });
});

describe('admin inquiries: conversion', () => {
  it('converts a lead into a new client with an invitation and a case draft; agent + partner follow', async () => {
    const staff = await asStaff();
    const agent = await makeAgent();
    const partner = await prisma.referralPartner.create({ data: { name: `Partner ${Date.now()}` } });
    const q = await lead({ contactName: 'Elvin Huseynov', email: 'elvin.lead@x.test', phone: '+994501234567', locale: 'ru', agentId: agent.id, partnerId: partner.id });
    const res = (await staff.agent.post(`/api/admin/inquiries/${q.id}/convert-client`).send({ createCase: true, profession: 'LKW sürücüsü' }).expect(201)).body;
    expect(res).toMatchObject({ created: true, caseId: expect.any(String) });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: res.userId } });
    expect(user).toMatchObject({ role: 'CLIENT', firstName: 'Elvin', lastName: 'Huseynov', email: 'elvin.lead@x.test', locale: 'ru', phone: '+994501234567', referredByAgentId: agent.id, ownerPartnerId: partner.id });
    expect(await prisma.case.findUniqueOrThrow({ where: { id: res.caseId } })).toMatchObject({ clientId: user.id, profession: 'LKW sürücüsü' });
    expect(res.item).toMatchObject({ status: 'DONE', convertedUserId: user.id, convertedUser: { id: user.id }, convertedAt: expect.any(String), assignedStaffId: staff.user.id });
    expect(await prisma.passwordResetToken.count({ where: { userId: user.id } })).toBe(1);
    await settle();
    expect((await emailsTo('elvin.lead@x.test')).length).toBeGreaterThanOrEqual(1);
    expect(await prisma.auditLog.findFirst({ where: { action: 'INQUIRY_CONVERTED_CLIENT', target: `inquiry:${q.id}` } })).toMatchObject({ details: { userId: user.id, created: true } });
    expect((await staff.agent.post(`/api/admin/inquiries/${q.id}/convert-client`).send({}).expect(409)).body.error).toBe('ALREADY_CONVERTED');
  });

  it('links an existing client; refuses staff e-mails and a second active case', async () => {
    const staff = await asStaff();
    const existing = await createUser({ role: 'CLIENT', email: 'known@x.test' });
    const q = await lead({ email: 'Known@x.test' });
    const res = (await staff.agent.post(`/api/admin/inquiries/${q.id}/convert-client`).send({}).expect(201)).body;
    expect(res).toMatchObject({ created: false, userId: existing.user.id, caseId: null });
    expect(await prisma.passwordResetToken.count({ where: { userId: existing.user.id } })).toBe(0);

    const q2 = await lead({ email: staff.user.email });
    expect((await staff.agent.post(`/api/admin/inquiries/${q2.id}/convert-client`).send({}).expect(409)).body.error).toBe('EMAIL_NOT_CLIENT');
    const q3 = await lead();
    expect((await staff.agent.post(`/api/admin/inquiries/${q3.id}/convert-client`).send({ createCase: true }).expect(400)).body.error).toBe('PROFESSION_REQUIRED');
  });

  it('converts a company lead into an employer with a COMPANY user invite', async () => {
    const staff = await asStaff();
    const agent = await makeAgent();
    const q = await lead({ kind: 'company', companyName: 'Logistik Nord GmbH', contactName: 'Anna Schmidt', email: 'anna@nord.test', phone: '+4940123456', locale: 'de', agentId: agent.id });
    const res = (await staff.agent.post(`/api/admin/inquiries/${q.id}/convert-company`).send({ company: { name: 'Logistik Nord GmbH', sector: 'logistics', city: 'Hamburg' }, invite: {} }).expect(201)).body;
    const company = await prisma.company.findUniqueOrThrow({ where: { id: res.companyId } });
    expect(company).toMatchObject({ name: 'Logistik Nord GmbH', status: 'ACTIVE', sector: 'logistics', city: 'Hamburg', email: 'anna@nord.test', referredByAgentId: agent.id });
    const u = await prisma.user.findUniqueOrThrow({ where: { id: res.invitedUserId } });
    expect(u).toMatchObject({ role: 'COMPANY', companyId: company.id, firstName: 'Anna', lastName: 'Schmidt', email: 'anna@nord.test', locale: 'de' });
    expect(res.item).toMatchObject({ status: 'DONE', convertedCompanyId: company.id, convertedCompany: { id: company.id, name: 'Logistik Nord GmbH' }, convertedUserId: u.id });
    expect(await prisma.auditLog.count({ where: { action: 'INQUIRY_CONVERTED_COMPANY', target: `inquiry:${q.id}` } })).toBe(1);

    // Linking an existing company without an invite; contact leads cannot become employers.
    const q2 = await lead({ kind: 'company', companyName: 'Again' });
    const r2 = (await staff.agent.post(`/api/admin/inquiries/${q2.id}/convert-company`).send({ companyId: company.id }).expect(201)).body;
    expect(r2).toMatchObject({ companyId: company.id, createdCompany: false, invitedUserId: null });
    const q3 = await lead({ kind: 'contact' });
    expect((await staff.agent.post(`/api/admin/inquiries/${q3.id}/convert-company`).send({ companyId: company.id }).expect(409)).body.error).toBe('NOT_A_COMPANY_LEAD');
    // E-mail of an existing login cannot be invited again.
    const q4 = await lead({ kind: 'company', companyName: 'Dup', email: 'anna@nord.test' });
    expect((await staff.agent.post(`/api/admin/inquiries/${q4.id}/convert-company`).send({ company: { name: 'Dup GmbH' }, invite: {} }).expect(409)).body.error).toBe('EMAIL_TAKEN');
    expect(await prisma.company.count({ where: { name: 'Dup GmbH' } })).toBe(0);
  });
});

describe('admin bulk: inquiries assign + undo', () => {
  it('assigns explicit ids or all matching, notifies once and restores the previous owners', async () => {
    const admin = await asAdmin();
    const s1 = await asStaff();
    const s2 = await asStaff();
    const a = await lead({ assignedStaffId: s2.user.id });
    const b = await lead();
    const c = await lead({ kind: 'company', companyName: 'X' });

    const res = (await admin.agent.post('/api/admin/bulk/inquiries/assign').send({ selection: { ids: [a.id, b.id] }, staffId: s1.user.id }).expect(200)).body;
    expect(res.ok).toBe(2);
    expect(res.previous).toEqual(expect.arrayContaining([{ id: a.id, staffId: s2.user.id }, { id: b.id, staffId: null }]));
    await settle();
    expect(await prisma.notification.count({ where: { userId: s1.user.id, type: 'INQUIRY_ASSIGNED' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'BULK_INQUIRIES_ASSIGNED' } })).toBe(1);

    await admin.agent.post('/api/admin/bulk/inquiries/restore-assign').send({ items: res.previous }).expect(200);
    expect((await prisma.inquiry.findUniqueOrThrow({ where: { id: a.id } })).assignedStaffId).toBe(s2.user.id);
    expect((await prisma.inquiry.findUniqueOrThrow({ where: { id: b.id } })).assignedStaffId).toBeNull();

    // "All matching" uses the list filters.
    const all = (await admin.agent.post('/api/admin/bulk/inquiries/assign').send({ selection: { all: { kind: 'company' } }, staffId: s2.user.id }).expect(200)).body;
    expect(all.results.map((r: { id: string }) => r.id)).toEqual([c.id]);
    expect((await admin.agent.post('/api/admin/bulk/inquiries/assign').send({ selection: { ids: [a.id] }, staffId: (await createUser({ role: 'CLIENT' })).user.id }).expect(400)).body.error).toBe('INVALID_STAFF');
  });
});
