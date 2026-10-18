import { describe, expect, it } from 'vitest';
import zlib from 'node:zlib';
import { asAdmin, asClient, asStaff, anon } from '../helpers/api';
import { prisma } from '../helpers/db';
import { binaryParser } from '../helpers/files';
import { clientRows, CLIENT_HEADERS } from '../../src/lib/clientsExcel';

/** Reads one entry of a zip buffer (deflated or stored) — enough to look inside an .xlsx. */
const zipEntry = (zip: Buffer, name: string) => {
  let i = 0;
  while (i < zip.length - 30 && zip.readUInt32LE(i) === 0x04034b50) {
    const method = zip.readUInt16LE(i + 8);
    const size = zip.readUInt32LE(i + 18);
    const nameLen = zip.readUInt16LE(i + 26);
    const extra = zip.readUInt16LE(i + 28);
    const entry = zip.subarray(i + 30, i + 30 + nameLen).toString('utf8');
    const start = i + 30 + nameLen + extra;
    const data = zip.subarray(start, start + size);
    if (entry === name) return (method === 8 ? zlib.inflateRawSync(data) : data).toString('utf8');
    i = start + size;
  }
  return null;
};

const newCase = async (firstName: string, lastName: string, passport?: string) => {
  const client = await asClient({ firstName, lastName });
  if (passport) await prisma.user.update({ where: { id: client.user.id }, data: { passportNumber: passport } });
  const res = await client.agent.post('/api/cases').send({ visaType: 'WORK', profession: 'Aşpaz' });
  expect(res.status).toBe(201);
  return res.body.case as { id: string; number: string };
};

describe('referral partners', () => {
  it('lets staff create and edit partners (folder in the shared drive at once); only admins delete', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();

    expect((await anon().get('/api/admin/partners')).status).toBe(401);
    expect((await (await asClient()).agent.post('/api/admin/partners').send({ name: 'X' })).status).toBe(403);

    const created = await staff.agent.post('/api/admin/partners').send({ name: 'Ilqar', phone: '+994501112233', email: '', note: 'Gəncə' });
    expect(created.status).toBe(201);
    // The partner's folder exists right away, even without clients.
    const folder = await prisma.driveNode.findUniqueOrThrow({ where: { id: created.body.folderId }, include: { parent: true } });
    expect(folder).toMatchObject({ name: 'Ilqar', kind: 'FOLDER', parent: { name: 'Partner', system: true } });
    expect(created.body.partner).toMatchObject({ name: 'Ilqar', phone: '+994501112233', email: null, active: true });
    const id = created.body.partner.id as string;

    expect((await admin.agent.post('/api/admin/partners').send({ name: 'Ilqar' })).status).toBe(409);
    const other = (await admin.agent.post('/api/admin/partners').send({ name: 'Ənvər' })).body.partner;
    expect((await admin.agent.patch(`/api/admin/partners/${other.id}`).send({ name: 'Ilqar' })).status).toBe(409);

    const list = await staff.agent.get('/api/admin/partners?search=Ilq');
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].counts).toMatchObject({ clients: 0, activeCases: 0, approved: 0, closedNegative: 0, lastCaseAt: null });

    const upd = await staff.agent.patch(`/api/admin/partners/${id}`).send({ name: 'Ilqar M.', active: false });
    expect(upd.status).toBe(200);
    expect(upd.body.partner).toMatchObject({ name: 'Ilqar M.', active: false });
    // Renamed, not duplicated: the same folder carries the new name.
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: folder.id } })).name).toBe('Ilqar M');
    expect(await prisma.driveNode.count({ where: { parentId: folder.parentId, deletedAt: null } })).toBe(2);
    const inactive = await staff.agent.get('/api/admin/partners?active=false');
    expect(inactive.body.items.map((p: { id: string }) => p.id)).toEqual([id]);

    expect((await staff.agent.get(`/api/admin/partners/${id}`)).body.partner.name).toBe('Ilqar M.');
    expect((await staff.agent.delete(`/api/admin/partners/${id}`)).status).toBe(403);
    expect((await admin.agent.delete(`/api/admin/partners/${id}`)).status).toBe(200);
    expect((await admin.agent.get(`/api/admin/partners/${id}`)).status).toBe(404);

    const actions = (await prisma.auditLog.findMany({ where: { actorId: { in: [admin.user.id, staff.user.id] } }, select: { action: true } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['PARTNER_CREATED', 'PARTNER_UPDATED', 'PARTNER_DELETED']));
  });

  it('bulk assigns cases, filters the cases list, counts, blocks deletion and exports the client list', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    const partner = (await admin.agent.post('/api/admin/partners').send({ name: 'Tofiq' })).body.partner;
    const c1 = await newCase('Ayan', 'Quliyeva', 'C01234567');
    const c2 = await newCase('Rauf', 'Məmmədov');
    const c3 = await newCase('Nigar', 'Həsənova');

    expect((await staff.agent.patch('/api/admin/partners/assign').send({ caseIds: [c1.id], partnerId: 'nope' })).status).toBe(400);
    const assign = await staff.agent.patch('/api/admin/partners/assign').send({ caseIds: [c1.id, c2.id], partnerId: partner.id });
    expect(assign.status).toBe(200);
    expect(assign.body.updated).toBe(2);
    await prisma.case.update({ where: { id: c2.id }, data: { status: 'APPROVED', decisionAt: new Date('2026-09-01') } });

    const filtered = await staff.agent.get(`/api/admin/cases?partnerId=${partner.id}`);
    expect(filtered.body.items.map((c: { id: string }) => c.id).sort()).toEqual([c1.id, c2.id].sort());
    expect(filtered.body.items[0].partner).toEqual({ id: partner.id, name: 'Tofiq' });
    const none = await staff.agent.get('/api/admin/cases?partnerId=none');
    expect(none.body.items.map((c: { id: string }) => c.id)).toEqual([c3.id]);

    const detail = await staff.agent.get(`/api/admin/cases/${c1.id}`);
    expect(detail.body.case.partner).toEqual({ id: partner.id, name: 'Tofiq' });

    const p = await staff.agent.get(`/api/admin/partners/${partner.id}`);
    expect(p.body.partner.counts).toMatchObject({ clients: 2, activeCases: 1, approved: 1, closedNegative: 0 });
    expect(p.body.cases).toHaveLength(2);
    expect(p.body.cases.find((c: { id: string }) => c.id === c1.id).client).toMatchObject({ firstName: 'Ayan', passportNumber: 'C01234567' });

    // Excel: the partner's client list.
    const xlsx = await staff.agent.get(`/api/admin/partners/${partner.id}/export.xlsx`).buffer(true).parse(binaryParser);
    expect(xlsx.status).toBe(200);
    expect(xlsx.headers['content-type']).toContain('spreadsheetml');
    const sheet = zipEntry(xlsx.body as Buffer, 'xl/worksheets/sheet1.xml')!;
    for (const s of ['Müraciət №', 'Pasport №', 'Qərar tarixi', 'Ayan', 'C01234567', 'Məmmədov', 'Viza verilib', '01.09.2026', c1.number]) {
      expect(sheet).toContain(s);
    }
    expect(sheet).not.toContain('Həsənova');

    // "Alle Kunden.xlsx" carries the partner of the latest case.
    const col = CLIENT_HEADERS.indexOf('Partnyor');
    expect(col).toBeGreaterThan(-1);
    const rows = await clientRows();
    expect(rows.find((r) => r[1] === 'Ayan')![col]).toBe('Tofiq');
    expect(rows.find((r) => r[1] === 'Nigar')![col]).toBe('');

    // A partner with cases cannot be deleted (deactivate instead).
    expect((await admin.agent.delete(`/api/admin/partners/${partner.id}`)).status).toBe(409);

    // Unassign.
    const un = await staff.agent.patch('/api/admin/partners/assign').send({ caseIds: [c1.id, c2.id], partnerId: null });
    expect(un.body.updated).toBe(2);
    expect(await prisma.case.count({ where: { partnerId: partner.id } })).toBe(0);
    expect((await admin.agent.delete(`/api/admin/partners/${partner.id}`)).status).toBe(200);

    const actions = (await prisma.auditLog.findMany({ where: { actorId: staff.user.id }, select: { action: true } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['PARTNER_CASES_ASSIGNED', 'PARTNER_CASES_UNASSIGNED', 'PARTNER_EXPORTED']));
  });
});
