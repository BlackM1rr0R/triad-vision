import { describe, expect, it } from 'vitest';
import zlib from 'node:zlib';
import { asAdmin, asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { binaryParser } from '../helpers/files';

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

const IBAN = 'DE89370400440532013000';

describe('partner profile: standard fields, custom fields, bank data masking', () => {
  it('admins define custom fields; create / edit with profile, custom and extra fields; staff see bank data masked and cannot change it', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();

    // ── Field definitions: staff read, admins manage.
    expect((await staff.agent.post('/api/admin/partners/fields').send({ label: 'Rayon' })).status).toBe(403);
    expect((await admin.agent.post('/api/admin/partners/fields').send({ label: 'Kanal', type: 'SELECT' })).body.error).toBe('OPTIONS_REQUIRED');
    const fRegion = (await admin.agent.post('/api/admin/partners/fields').send({ label: 'Rayon', type: 'TEXT' })).body.field;
    const fChannel = (await admin.agent.post('/api/admin/partners/fields').send({ label: 'Kanal', type: 'SELECT', options: ['Instagram', 'Tövsiyə'] })).body.field;
    const fSigned = (await admin.agent.post('/api/admin/partners/fields').send({ label: 'Müqavilə imzalanıb', type: 'CHECKBOX' })).body.field;
    const fTemp = (await admin.agent.post('/api/admin/partners/fields').send({ label: 'Müvəqqəti', type: 'NUMBER' })).body.field;
    expect(fChannel).toMatchObject({ type: 'SELECT', options: ['Instagram', 'Tövsiyə'] });
    const listed = await staff.agent.get('/api/admin/partners/fields');
    expect(listed.status).toBe(200);
    expect(listed.body.fields.map((f: { label: string }) => f.label)).toEqual(['Rayon', 'Kanal', 'Müqavilə imzalanıb', 'Müvəqqəti']);
    const reordered = await admin.agent.put('/api/admin/partners/fields/order').send({ ids: [fChannel.id, fRegion.id] });
    expect(reordered.body.fields.map((f: { id: string }) => f.id).slice(0, 2)).toEqual([fChannel.id, fRegion.id]);

    // ── Create (admin) with the whole profile.
    const created = await admin.agent.post('/api/admin/partners').send({
      name: 'Ilqar Məmmədov',
      partnerType: 'COMPANY',
      companyName: 'İlqar Travel MMC',
      contactPerson: 'Ilqar',
      phone2: '+994552223344',
      whatsapp: '+994552223344',
      address: 'Nizami küç. 10',
      city: 'Gəncə',
      country: 'Azərbaycan',
      taxId: '1234567890',
      bankName: 'Kapital Bank',
      bankAccountHolder: 'İlqar Travel MMC',
      iban: 'de89 3704 0044 0532 0130 00',
      bic: 'cobadeffxxx',
      contractStart: '2026-01-01',
      contractEnd: '2026-12-31',
      preferredLanguage: 'az',
      website: 'ilqartravel.az',
      tags: ['VIP', 'vip', 'Gəncə'],
      customData: { [fRegion.id]: 'Kəpəz', [fChannel.id]: 'Instagram', [fSigned.id]: true, [fTemp.id]: '7' },
      extraFields: [{ label: 'Telegram', value: '@ilqar' }],
    });
    expect(created.status).toBe(201);
    const id = created.body.partner.id as string;
    expect(created.body.partner).toMatchObject({
      partnerType: 'COMPANY',
      iban: IBAN,
      bic: 'COBADEFFXXX',
      website: 'https://ilqartravel.az',
      contractStart: '2026-01-01',
      tags: ['VIP', 'Gəncə'],
      customData: { [fRegion.id]: 'Kəpəz', [fChannel.id]: 'Instagram', [fSigned.id]: true, [fTemp.id]: 7 },
      extraFields: [{ label: 'Telegram', value: '@ilqar' }],
      bankLocked: false,
    });

    // ── Validation.
    expect((await admin.agent.patch(`/api/admin/partners/${id}`).send({ customData: { [fChannel.id]: 'TikTok' } })).body).toMatchObject({ error: 'INVALID_CUSTOM_FIELD', message: 'Kanal' });
    expect((await admin.agent.patch(`/api/admin/partners/${id}`).send({ customData: { nope: 'x' } })).body.error).toBe('INVALID_CUSTOM_FIELD');
    expect((await admin.agent.patch(`/api/admin/partners/${id}`).send({ contractEnd: '2025-12-31' })).body.error).toBe('CONTRACT_DATES_INVALID');
    expect((await admin.agent.patch(`/api/admin/partners/${id}`).send({ iban: 'DE00 1234 5678' })).status).toBe(400);
    expect((await admin.agent.patch(`/api/admin/partners/${id}`).send({ partnerType: 'GROUP' })).status).toBe(400);

    // ── Staff: bank data masked, tax id masked by the masking settings, the rest visible.
    const seen = (await staff.agent.get(`/api/admin/partners/${id}`)).body.partner;
    expect(seen).toMatchObject({ bankLocked: true, iban: '•••• 3000', bic: '••••', bankName: '••••', bankAccountHolder: '••••', companyName: 'İlqar Travel MMC', city: 'Gəncə' });
    expect(seen.taxId).toMatch(/^•+ /);
    const listForStaff = await staff.agent.get('/api/admin/partners');
    expect(JSON.stringify(listForStaff.body)).not.toContain('Kapital Bank');
    expect(JSON.stringify(listForStaff.body)).not.toContain(IBAN);

    // Staff save the form as loaded (masked values come back) and change ordinary fields: bank data stays.
    const staffSave = await staff.agent.patch(`/api/admin/partners/${id}`).send({ ...seen, id: undefined, counts: undefined, city: 'Bakı', customData: { [fRegion.id]: 'Nəsimi', [fTemp.id]: null } });
    expect(staffSave.status).toBe(200);
    const stored = await prisma.referralPartner.findUniqueOrThrow({ where: { id } });
    expect(stored).toMatchObject({ city: 'Bakı', iban: IBAN, bankName: 'Kapital Bank', taxId: '1234567890' });
    expect(stored.customData).toEqual({ [fRegion.id]: 'Nəsimi', [fChannel.id]: 'Instagram', [fSigned.id]: true });
    // …but cannot set or change bank data.
    expect((await staff.agent.patch(`/api/admin/partners/${id}`).send({ iban: 'AZ21NABZ00000000137010001944' })).body.error).toBe('ADMIN_REQUIRED');
    expect((await staff.agent.patch(`/api/admin/partners/${id}`).send({ bankName: null })).body.error).toBe('ADMIN_REQUIRED');
    expect((await staff.agent.post('/api/admin/partners').send({ name: 'Staff partner', iban: IBAN })).body.error).toBe('ADMIN_REQUIRED');
    const staffCreated = await staff.agent.post('/api/admin/partners').send({ name: 'Staff partner', city: 'Sumqayıt', customData: { [fChannel.id]: 'Tövsiyə' } });
    expect(staffCreated.status).toBe(201);

    // ── Reveal: staff may reveal the tax id, only admins the IBAN.
    const reveal = (agent: typeof staff.agent, field: string) => agent.post('/api/admin/reveal').send({ entity: 'partner', id, field, reason: 'Ödəniş üçün' });
    expect((await reveal(staff.agent, 'taxId')).body.value).toBe('1234567890');
    expect((await reveal(staff.agent, 'iban')).status).toBe(403);
    expect((await reveal(admin.agent, 'iban')).body.value).toBe(IBAN);

    // ── Search by the new fields (company, city, tag, custom value, extra field value).
    const search = async (q: string) => ((await staff.agent.get('/api/admin/partners').query({ search: q })).body.items as { id: string }[]).map((p) => p.id);
    expect(await search('Travel MMC')).toEqual([id]);
    expect(await search('Sumqay')).toEqual([staffCreated.body.partner.id]);
    expect(await search('vip')).toEqual([id]);
    expect(await search('Nəsimi')).toEqual([id]);
    expect(await search('@ilqar')).toEqual([id]);
    expect(await search('Tövsiyə')).toEqual([staffCreated.body.partner.id]);

    // ── Audit: changed field names; values for ordinary fields, never bank data.
    await admin.agent.patch(`/api/admin/partners/${id}`).send({ iban: 'AZ21NABZ00000000137010001944', country: 'AZ' }).expect(200);
    const logs = await prisma.auditLog.findMany({ where: { action: 'PARTNER_UPDATED', target: id }, orderBy: { createdAt: 'asc' } });
    const last = logs[logs.length - 1].details as { fields: string[]; changes: Record<string, unknown> };
    expect(last.fields.sort()).toEqual(['country', 'iban']);
    expect(last.changes).toEqual({ country: { from: 'Azərbaycan', to: 'AZ' } });
    expect(JSON.stringify(logs.map((l) => l.details))).not.toContain('AZ21NABZ');
    expect(JSON.stringify(logs.map((l) => l.details))).toContain('custom:Rayon');

    // ── Excel export: profile sheet; staff get no bank rows.
    const xlsx = async (agent: typeof staff.agent) => {
      const res = await agent.get(`/api/admin/partners/${id}/export.xlsx`).buffer(true).parse(binaryParser);
      expect(res.status).toBe(200);
      return zipEntry(res.body as Buffer, 'xl/worksheets/sheet2.xml') ?? '';
    };
    const adminSheet = await xlsx(admin.agent);
    expect(adminSheet).toContain('İlqar Travel MMC');
    expect(adminSheet).toContain('AZ21NABZ00000000137010001944');
    expect(adminSheet).toContain('Kanal');
    const staffSheet = await xlsx(staff.agent);
    expect(staffSheet).toContain('Nəsimi');
    expect(staffSheet).not.toContain('AZ21NABZ');
    expect(staffSheet).not.toContain('1234567890');

    // ── GDPR export of the partner's own login contains the profile (without the internal note).
    const login = await asClient();
    await prisma.referralPartner.update({ where: { id }, data: { userId: login.user.id, note: 'internal' } });
    const gdpr = (await login.agent.get('/api/account/export')).body;
    expect(gdpr.partnerProfile).toMatchObject({ companyName: 'İlqar Travel MMC', iban: 'AZ21NABZ00000000137010001944', customFields: expect.arrayContaining([{ label: 'Kanal', value: 'Instagram' }]) });
    expect(JSON.stringify(gdpr.partnerProfile)).not.toContain('internal');

    // ── Deleting a field definition strips its values.
    const del = await admin.agent.delete(`/api/admin/partners/fields/${fChannel.id}`);
    expect(del.body).toMatchObject({ ok: true, cleaned: 2 });
    expect((await prisma.referralPartner.findUniqueOrThrow({ where: { id } })).customData).toEqual({ [fRegion.id]: 'Nəsimi', [fSigned.id]: true });
  });
});
