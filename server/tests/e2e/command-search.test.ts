import { beforeEach, describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff, asSuperAdmin } from '../helpers/api';
import { prisma } from '../helpers/db';
import { uniq } from '../helpers/factories';
import { createCaseVia, expectStatus } from '../helpers/workflow';
import { resetMaskingCache } from '../../src/lib/privacy/mask.js';
import { createCompany, createVacancy } from './vacancies.fixtures';

const URL = '/api/admin/command-search';

beforeEach(() => resetMaskingCache());

describe('GET /api/admin/command-search', () => {
  it('requires a staff session and at least 2 characters', async () => {
    expect((await anon().get(URL).query({ q: 'abc' })).status).toBe(401);
    const client = await asClient();
    expect((await client.agent.get(URL).query({ q: 'abc' })).status).toBe(403);
    const staff = await asStaff();
    expect((await staff.agent.get(URL).query({ q: 'a' })).status).toBe(400);
    expect((await staff.agent.get(URL).query({ q: '  a ' })).status).toBe(400);
    expect((await staff.agent.get(URL)).status).toBe(400);
    expect((await staff.agent.get(URL).query({ q: 'x'.repeat(101) })).status).toBe(400);
    expect((await staff.agent.get(URL).query({ q: 'ab' })).status).toBe(200);
  });

  it('returns every type: cases, users, companies, vacancies, drive files and tasks', async () => {
    const tag = uniq('Zorb');
    const client = await asClient({ firstName: tag, lastName: 'Həsənov', phone: '+994 50 777 66 55' });
    const c = await createCaseVia(client.agent);
    await createCompany({ name: `${tag} Logistik GmbH` });
    await createVacancy({ title: { az: `${tag} sürücü`, de: `${tag} Fahrer`, en: `${tag} driver`, ru: `${tag} водитель` } });
    const staff = await asStaff();
    const roots = expectStatus(await staff.agent.get('/api/drive/roots'), 200).body;
    expectStatus(await staff.agent.post(`/api/drive/nodes/${roots.shared.id}/folders`).send({ name: `${tag} Unterlagen` }), 201);
    expectStatus(await staff.agent.post('/api/tasks').send({ title: `${tag} Pass abholen`, caseId: c.id }), 201);

    const body = expectStatus(await staff.agent.get(URL).query({ q: tag }), 200).body;
    expect(Object.keys(body).sort()).toEqual(['cases', 'companies', 'files', 'q', 'tasks', 'users', 'vacancies']);
    expect(body.cases).toEqual([expect.objectContaining({ id: c.id, number: c.number, clientName: `${tag} Həsənov`, status: 'DOCUMENTS_PENDING' })]);
    expect(body.users).toEqual([expect.objectContaining({ id: client.user.id, role: 'CLIENT', email: client.user.email, phone: '+994 50 777 66 55' })]);
    expect(body.companies).toEqual([expect.objectContaining({ name: `${tag} Logistik GmbH` })]);
    expect(body.vacancies).toEqual([expect.objectContaining({ title: expect.objectContaining({ de: `${tag} Fahrer` }) })]);
    // The client's case folder ("<name> · TV-…") matches too.
    expect(body.files).toContainEqual(expect.objectContaining({ name: `${tag} Unterlagen`, kind: 'FOLDER', parentId: roots.shared.id }));
    expect(body.tasks).toEqual([expect.objectContaining({ title: `${tag} Pass abholen`, key: expect.stringMatching(/^T-\d{4}$/) })]);

    // Full name across two columns, the phone number by its digits, a vacancy by another language.
    expect(expectStatus(await staff.agent.get(URL).query({ q: `${tag} Həs` }), 200).body.users).toHaveLength(1);
    expect(expectStatus(await staff.agent.get(URL).query({ q: '507776655' }), 200).body.users.map((u: { id: string }) => u.id)).toContain(client.user.id);
    expect(expectStatus(await staff.agent.get(URL).query({ q: `${tag} водитель` }), 200).body.vacancies).toHaveLength(1);
    // LIKE wildcards are literal.
    expect(expectStatus(await staff.agent.get(URL).query({ q: '%%' }), 200).body.vacancies).toEqual([]);
  });

  it('puts the exact case number first, and a task number first', async () => {
    const a = await asClient({ firstName: 'Exact', lastName: 'Match' });
    const b = await asClient({ firstName: 'Longer', lastName: 'Number' });
    const ca = await createCaseVia(a.agent);
    const cb = await createCaseVia(b.agent);
    await prisma.case.update({ where: { id: ca.id }, data: { number: 'TV-2031-1234' } });
    // Updated later, so it would win on recency alone.
    await prisma.case.update({ where: { id: cb.id }, data: { number: 'TV-2031-12345' } });
    const staff = await asStaff();
    const res = expectStatus(await staff.agent.get(URL).query({ q: 'tv-2031-1234' }), 200).body;
    expect(res.cases.map((c: { id: string }) => c.id)).toEqual([ca.id, cb.id]);
    expect(res.cases[0].exact).toBe(true);
    expect(res.cases[1].exact).toBe(false);

    const t = expectStatus(await staff.agent.post('/api/tasks').send({ title: 'Some task' }), 201).body.task;
    const byKey = expectStatus(await staff.agent.get(URL).query({ q: t.key }), 200).body;
    expect(byKey.tasks[0]).toMatchObject({ key: t.key });
  });

  it('drive: only files the user may VIEW', async () => {
    const tag = uniq('Drv');
    const su = await asSuperAdmin();
    const staff = await asStaff();
    const roots = expectStatus(await su.agent.get('/api/drive/roots'), 200).body;
    const open = expectStatus(await su.agent.post(`/api/drive/nodes/${roots.shared.id}/folders`).send({ name: `${tag} offen` }), 201).body.item;
    const secret = expectStatus(await su.agent.post(`/api/drive/nodes/${roots.shared.id}/folders`).send({ name: `${tag} geheim` }), 201).body.item;
    expectStatus(await su.agent.patch(`/api/drive/nodes/${secret.id}/inheritance`).send({ inherit: false }), 200);
    const inside = await prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FOLDER', name: `${tag} drinnen`, parentId: secret.id } });
    const trashed = await prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FOLDER', name: `${tag} gelöscht`, parentId: roots.shared.id, deletedAt: new Date() } });

    const names = async (agent: typeof staff.agent) => (expectStatus(await agent.get(URL).query({ q: tag }), 200).body.files as { id: string }[]).map((f) => f.id).sort();
    expect(await names(staff.agent)).toEqual([open.id]);
    expect(await names(su.agent)).toEqual([open.id, secret.id, inside.id].sort());
    expect(await names(su.agent)).not.toContain(trashed.id);

    // A grant on the restricted folder opens it (and its children) for that staff member.
    expectStatus(await su.agent.put(`/api/drive/nodes/${secret.id}/grants`).send({ userId: staff.user.id, access: 'VIEW' }), 200);
    expect(await names(staff.agent)).toEqual([open.id, secret.id, inside.id].sort());
  });

  it('STAFF see masked sensitive fields, super admins the plaintext', async () => {
    const tag = uniq('Vat');
    await createCompany({ name: `${tag} AG`, vatId: 'DE123456789' });
    const staff = await asStaff();
    const admin = await asAdmin();
    const su = await asSuperAdmin();
    const vat = async (agent: typeof staff.agent) => expectStatus(await agent.get(URL).query({ q: tag }), 200).body.companies[0].vatId;
    expect(await vat(staff.agent)).toBe('•••• 6789');
    expect(await vat(admin.agent)).toBe('DE123456789'); // default: admins see plaintext
    expect(await vat(su.agent)).toBe('DE123456789');
    // Users are never returned with passport numbers.
    const client = await asClient({ firstName: tag });
    await prisma.user.update({ where: { id: client.user.id }, data: { passportNumber: 'C01X00T47' } });
    const body = expectStatus(await su.agent.get(URL).query({ q: tag }), 200).body;
    expect(JSON.stringify(body)).not.toContain('C01X00T47');
  });

  it('is rate limited per user', async () => {
    const staff = await asStaff();
    let last = 200;
    for (let i = 0; i < 125 && last !== 429; i++) last = (await staff.agent.get(URL).query({ q: 'zz' })).status;
    expect(last).toBe(429);
    // Another staff member is not affected.
    const other = await asStaff();
    expect((await other.agent.get(URL).query({ q: 'zz' })).status).toBe(200);
  });
});
