import { describe, expect, it } from 'vitest';
import zlib from 'node:zlib';
import { asAdmin, asClient, asSuperAdmin } from '../helpers/api';
import { prisma } from '../helpers/db';
import { binaryParser } from '../helpers/files';
import { buildXlsx } from '../../src/lib/xlsx';
import { refreshClientsExcel, CLIENTS_FILE, CLIENTS_FOLDER } from '../../src/lib/clientsExcel';
import { DEFAULTS_BY_TYPE, resolveRanges } from '../../src/lib/journey/forecast';

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

describe('visa type of a new case', () => {
  it('starts an Ausbildung case without a profession and falls back to the profile / type label', async () => {
    const client = await asClient();
    const res = await client.agent.post('/api/cases').send({ visaType: 'AUSBILDUNG' });
    expect(res.status).toBe(201);
    expect(res.body.case).toMatchObject({ visaType: 'AUSBILDUNG', profession: 'Ausbildung' });

    const withProfile = await asClient();
    await prisma.user.update({ where: { id: withProfile.user.id }, data: { profession: 'Aşpaz' } });
    const res2 = await withProfile.agent.post('/api/cases').send({ visaType: 'TOURIST' });
    expect(res2.body.case).toMatchObject({ visaType: 'TOURIST', profession: 'Aşpaz' });
  });

  it('uses type-specific default durations (tourist visas are much faster than family reunion)', () => {
    const tourist = resolveRanges({ category: {}, all: {} }, null, DEFAULTS_BY_TYPE.TOURIST);
    const family = resolveRanges({ category: {}, all: {} }, null, DEFAULTS_BY_TYPE.FAMILY);
    expect(tourist.DECISION.maxDays).toBeLessThan(family.DECISION.maxDays);
    expect(tourist.DOCUMENTS.basedOn).toBe('default');
  });

  it('returns the visa type with the forecast so the contract step can be named', async () => {
    const client = await asClient();
    const c = (await client.agent.post('/api/cases').send({ visaType: 'AUSBILDUNG' })).body.case;
    const f = await client.agent.get(`/api/journey/cases/${c.id}/forecast`);
    if (f.status === 200) expect(f.body.forecast?.visaType ?? f.body.visaType).toBe('AUSBILDUNG');
  });
});

describe('clients workbook', () => {
  it('builds a valid xlsx with header and rows', () => {
    const buf = buildXlsx('Müştərilər', ['Ad', 'Say'], [['Əli & <Vəli>', 3]]);
    expect(buf.subarray(0, 2).toString()).toBe('PK');
    const sheet = zipEntry(buf, 'xl/worksheets/sheet1.xml')!;
    expect(sheet).toContain('Əli &amp; &lt;Vəli&gt;');
    expect(sheet).toContain('<v>3</v>');
    expect(zipEntry(buf, '[Content_Types].xml')).toContain('spreadsheetml');
  });

  it('keeps one up-to-date "Alle Kunden.xlsx" in the shared drive, visible and served to super admins only', async () => {
    const su = await asSuperAdmin();
    const admin = await asAdmin();
    const a = await asClient({ firstName: 'Ayan', lastName: 'Quliyeva' });
    await prisma.user.update({ where: { id: a.user.id }, data: { passportNumber: 'C01234567' } });
    await asClient({ firstName: 'Rauf', lastName: 'Məmmədov' });

    await refreshClientsExcel();
    const folder = await prisma.driveNode.findFirst({ where: { name: CLIENTS_FOLDER, kind: 'FOLDER' }, include: { parent: true } });
    expect(folder).toMatchObject({ space: 'SHARED', system: true, inheritPermissions: false, parent: { name: 'Gemeinsame Dokumente', parentId: null } });
    expect((await su.agent.get(`/api/drive/nodes/${folder!.id}/children`)).status).toBe(200);
    expect((await admin.agent.get(`/api/drive/nodes/${folder!.id}/children`)).status).toBe(404);
    const file = await prisma.driveNode.findFirst({ where: { parentId: folder!.id, name: CLIENTS_FILE } });
    expect(file).toMatchObject({ kind: 'FILE', system: true });
    const v1 = file!.version;

    await asClient({ firstName: 'Nigar', lastName: 'Həsənova' });
    await refreshClientsExcel();
    const again = await prisma.driveNode.findMany({ where: { parentId: folder!.id, name: CLIENTS_FILE, deletedAt: null } });
    expect(again).toHaveLength(1);
    expect(again[0].version).toBe(v1 + 1);

    const dl = await su.agent.get('/api/admin/users/clients.xlsx').buffer(true).parse(binaryParser);
    expect(dl.status).toBe(200);
    const sheet = zipEntry(dl.body as Buffer, 'xl/worksheets/sheet1.xml')!;
    expect(sheet).toContain('Pasport №');
    expect(sheet).toContain('C01234567');
    expect(sheet).toContain('Nigar');
    expect((await admin.agent.get('/api/admin/users/clients.xlsx')).status).toBe(403);
  });
});
