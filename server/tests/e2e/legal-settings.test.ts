import { describe, expect, it } from 'vitest';
import { anon, asAdmin, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';

const legal = {
  companyName: 'Triad Vision',
  legalForm: 'GmbH',
  street: 'Musterstraße 1',
  postalCode: '10115',
  city: 'Berlin',
  country: 'Deutschland',
  representative: 'Max Mustermann',
  registerCourt: 'Amtsgericht Berlin-Charlottenburg',
  registerNumber: 'HRB 000000',
  vatId: 'DE000000000',
  email: 'info@example.com',
  phone: '+49 30 000000',
  responsibleForContent: 'Max Mustermann, Anschrift wie oben',
};

describe('legal / privacy settings', () => {
  it('admins save the Impressum data; it is validated, audited and public', async () => {
    const admin = await asAdmin();
    expect((await admin.agent.put('/api/admin/settings/legal').send({ value: { ...legal, email: 'not-an-email' } })).status).toBe(400);
    expect((await admin.agent.put('/api/admin/settings/legal').send({ value: { companyName: 'x'.repeat(201) } })).status).toBe(400);
    expect((await admin.agent.put('/api/admin/settings/legal').send({ value: 'text' })).status).toBe(400);

    const res = await admin.agent.put('/api/admin/settings/legal').send({ value: { ...legal, companyName: '  Triad Vision  ', extra: 'dropped' } });
    expect(res.status).toBe(200);
    expect(res.body.setting.value).toEqual({ ...legal, supervisoryNote: '' });
    expect(await prisma.auditLog.count({ where: { action: 'SETTING_UPDATED', target: 'setting:legal' } })).toBe(1);

    const pub = await anon().get('/api/public/content');
    expect(pub.status).toBe(200);
    expect(pub.body.settings.legal).toMatchObject({ companyName: 'Triad Vision', registerNumber: 'HRB 000000' });
  });

  it('partial legal data is stored with empty placeholders for the rest', async () => {
    const admin = await asAdmin();
    const res = await admin.agent.put('/api/admin/settings/legal').send({ value: { companyName: 'Triad Vision' } });
    expect(res.status).toBe(200);
    expect(res.body.setting.value).toMatchObject({ companyName: 'Triad Vision', street: '', vatId: '', email: '' });
  });

  it('privacy override text is validated', async () => {
    const admin = await asAdmin();
    expect((await admin.agent.put('/api/admin/settings/privacy').send({ value: { effectiveDate: '15.10.2026' } })).status).toBe(400);
    expect((await admin.agent.put('/api/admin/settings/privacy').send({ value: { text: { de: 1 } } })).status).toBe(400);
    const res = await admin.agent.put('/api/admin/settings/privacy').send({
      value: { text: { az: '', de: 'Eigene Datenschutzerklärung', en: '', ru: '' }, effectiveDate: '2026-10-15' },
    });
    expect(res.status).toBe(200);
    expect(res.body.setting.value.text.de).toBe('Eigene Datenschutzerklärung');
  });

  it('other setting keys stay free-form; staff cannot write settings', async () => {
    const admin = await asAdmin();
    expect((await admin.agent.put('/api/admin/settings/contact').send({ value: { phone: '1' } })).status).toBe(200);
    const staff = await asStaff();
    expect((await staff.agent.put('/api/admin/settings/legal').send({ value: legal })).status).toBe(403);
  });
});
