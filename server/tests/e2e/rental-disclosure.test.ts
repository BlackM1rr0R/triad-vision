import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { anon, asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { cvPdfText as pdfText } from '../unit/cvPdfText';

/**
 * Mieterselbstauskunft generator (/apartment-viewing):
 *   POST /api/rental-disclosure/pdf — public, DSK-permissible fields only, returns a PDF, stores nothing;
 *   GET  /api/rental-disclosure/me  — client prefill from profile + latest application (no birth date / nationality).
 */

const binary = (res: import('superagent').Response, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

describe('rental disclosure PDF', () => {
  it('renders a PDF for anonymous visitors', async () => {
    const res = await anon()
      .post('/api/rental-disclosure/pdf')
      .send({ stage: 'C', name: 'Aliyev, Elvin', employer: 'Muster GmbH', net: 2100, attachments: ['payslips'] })
      .buffer(true)
      .parse(binary)
      .expect(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.headers['content-disposition']).toContain('Mieterselbstauskunft-Aliyev-Elvin.pdf');
    expect(res.headers['cache-control']).toContain('no-store');
    const text = await pdfText(res.body as Buffer);
    expect(text).toContain('Mieterselbstauskunft');
    expect(text).toContain('Muster GmbH');
    expect(text).toContain('Lohn- bzw. Gehaltsabrechnungen');
  });

  it('prints only the stages up to the chosen one', async () => {
    const res = await anon().post('/api/rental-disclosure/pdf').send({ stage: 'A', name: 'Aliyev, Elvin', employer: 'Geheim GmbH', net: 2100 }).buffer(true).parse(binary).expect(200);
    const text = await pdfText(res.body as Buffer);
    expect(text).toContain('Besichtigungstermin');
    expect(text).not.toContain('Geheim GmbH');
    expect(text).not.toContain('Nettoeinkommen');
  });

  it('rejects impermissible or invalid fields', async () => {
    await anon().post('/api/rental-disclosure/pdf').send({ name: 'A', nationality: 'AZ' }).expect(400);
    await anon().post('/api/rental-disclosure/pdf').send({ name: '' }).expect(400);
  });
});

describe('rental disclosure prefill', () => {
  it('needs a client session', async () => {
    await anon().get('/api/rental-disclosure/me').expect(401);
    const staff = await asStaff();
    await staff.agent.get('/api/rental-disclosure/me').expect(403);
  });

  it('prefills from profile, employment contract and housing checklist — never birth date or nationality', async () => {
    const c = await asClient();
    await prisma.user.update({ where: { id: c.user.id }, data: { address: 'Nizami küç. 10, Bakı', birthDate: new Date('1990-05-05'), nationality: 'AZ' } });
    const empty = (await c.agent.get('/api/rental-disclosure/me').expect(200)).body;
    expect(empty).toMatchObject({ employer: '', net: null, moveIn: '', address: 'Nizami küç. 10, Bakı' });
    expect(empty).not.toHaveProperty('birthDate');
    expect(empty).not.toHaveProperty('nationality');

    const kase = await prisma.case.create({ data: { clientId: c.user.id, number: `TV-R-${crypto.randomBytes(3).toString('hex')}`, profession: 'Fahrer' } });
    await prisma.employmentContract.create({ data: { caseId: kase.id, employerName: 'Spedition Muster GmbH', jobTitle: 'Berufskraftfahrer', grossMonthly: 3200 } });
    await prisma.caseHousing.create({ data: { caseId: kase.id, moveInDate: new Date(Date.UTC(2027, 1, 1)) } });
    const res = (await c.agent.get('/api/rental-disclosure/me').expect(200)).body;
    expect(res).toMatchObject({ employer: 'Spedition Muster GmbH', occupation: 'Berufskraftfahrer', moveIn: '2027-02-01' });
    expect(res.net).toBeGreaterThan(1800);
    expect(res.net).toBeLessThan(3200);
    expect(res.sources).toEqual({ employer: 'contract', occupation: 'contract', net: 'contract', moveIn: 'housing' });
    expect(res.name).toContain(',');
  });
});
