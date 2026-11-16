import { describe, expect, it } from 'vitest';
import { anon, asAdmin, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createClient, uniq } from '../helpers/factories';
import { binaryParser } from '../helpers/files';

// A far-future quarter no other suite writes cases into (decisionAt decides the quarter).
const YEAR = 2031;
const Q = 2;
const IN_QUARTER = new Date(Date.UTC(YEAR, 4, 15, 10));

const approvedCase = async (profession: string, opts: { city?: string; level?: string } = {}) => {
  const u = await createClient({ firstName: 'Nərmin', lastName: 'Əliyeva' });
  if (opts.level) await prisma.user.update({ where: { id: u.user.id }, data: { germanLevel: opts.level } });
  const company = opts.city ? await prisma.company.create({ data: { name: uniq('Firma '), city: opts.city } }) : null;
  return prisma.case.create({
    data: {
      number: uniq('TV-QR-'),
      clientId: u.user.id,
      profession,
      visaType: 'WORK',
      status: 'APPROVED',
      decisionAt: IN_QUARTER,
      createdAt: new Date(IN_QUARTER.getTime() - 90 * 24 * 60 * 60 * 1000),
      companyId: company?.id ?? null,
    },
  });
};

const cleanQuarter = async () => {
  await prisma.quarterlyReport.deleteMany({ where: { year: YEAR } });
  await prisma.case.deleteMany({ where: { number: { startsWith: 'TV-QR-' } } });
};

describe('quarterly report', () => {
  it('staff read, only ADMIN edits and publishes; small groups never leave the server; public sees published only', async () => {
    await cleanQuarter();
    for (let i = 0; i < 4; i++) await approvedCase('LKW-Fahrer CE', { city: 'München', level: 'A2' });
    await approvedCase('Elektroniker', { city: 'Hamburg', level: 'B1' }); // a single electrician: must not appear
    const staff = await asStaff();
    const admin = await asAdmin();

    const prev = await staff.agent.get(`/api/admin/quarterly-report/${YEAR}/${Q}?lng=en`);
    expect(prev.status).toBe(200);
    const stats = prev.body.stats;
    expect(stats.approved).toBe(5);
    const keys = (dim: string) => stats.breakdowns[dim].buckets.map((b: { key: string }) => b.key);
    expect(keys('profession')).toEqual(['truck_driver']);
    expect(stats.breakdowns.profession.suppressed).toBe(true);
    expect(keys('state')).toEqual(['BY']);
    expect(keys('profession')).not.toContain('electrician');
    for (const dim of ['profession', 'visaType', 'state', 'germanLevel']) {
      for (const b of stats.breakdowns[dim].buckets) expect(b.count).toBeGreaterThanOrEqual(3);
    }
    expect(JSON.stringify(prev.body)).not.toContain('Nərmin');
    expect(prev.body.labels.profession.truck_driver).toBe('Truck driver');

    // Staff may read and download but not edit or publish.
    expect((await staff.agent.put(`/api/admin/quarterly-report/${YEAR}/${Q}/intro`).send({ intro: { en: 'x' } })).status).toBe(403);
    expect((await staff.agent.post(`/api/admin/quarterly-report/${YEAR}/${Q}/publish`).send({ published: true })).status).toBe(403);
    const pdf = await staff.agent.get(`/api/admin/quarterly-report/${YEAR}/${Q}/pdf?lng=az`).buffer(true).parse(binaryParser);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    // Not published yet: not listed, public PDF 404.
    expect((await admin.agent.put(`/api/admin/quarterly-report/${YEAR}/${Q}/intro`).send({ intro: { en: 'Our first report.', de: 'Unser erster Bericht.' } })).status).toBe(200);
    let list = await anon().get('/api/reports');
    expect(list.status).toBe(200);
    expect(list.body.items.some((r: { year: number }) => r.year === YEAR)).toBe(false);
    expect((await anon().get(`/api/reports/${YEAR}/q${Q}.pdf?lng=en`)).status).toBe(404);

    // Published: frozen snapshot, listed, PDF served.
    const pub = await admin.agent.post(`/api/admin/quarterly-report/${YEAR}/${Q}/publish`).send({ published: true });
    expect(pub.status).toBe(200);
    expect(pub.body.report).toMatchObject({ published: true, approved: 5, intro: { en: 'Our first report.' } });
    list = await anon().get('/api/reports');
    const item = list.body.items.find((r: { year: number; quarter: number }) => r.year === YEAR && r.quarter === Q);
    expect(item).toMatchObject({ approved: 5 });
    expect(item.title.en).toContain(`Q${Q} ${YEAR}`);
    const pub1 = await anon().get(`/api/reports/${YEAR}/q${Q}.pdf?lng=de`).buffer(true).parse(binaryParser);
    expect(pub1.status).toBe(200);
    expect(pub1.headers['content-type']).toContain('application/pdf');

    // A case approved after publishing does not change the published figures.
    await approvedCase('LKW-Fahrer CE', { city: 'München' });
    expect((await staff.agent.get(`/api/admin/quarterly-report/${YEAR}/${Q}`)).body.stats.approved).toBe(5);

    // Unpublished again: gone from the public list.
    expect((await admin.agent.post(`/api/admin/quarterly-report/${YEAR}/${Q}/publish`).send({ published: false })).status).toBe(200);
    expect((await anon().get('/api/reports')).body.items.some((r: { year: number }) => r.year === YEAR)).toBe(false);
    expect((await anon().get(`/api/reports/${YEAR}/q${Q}.pdf`)).status).toBe(404);
    await cleanQuarter();
  });

  it('rejects invalid quarters and anonymous admin access', async () => {
    const staff = await asStaff();
    expect((await staff.agent.get('/api/admin/quarterly-report/2031/5')).status).toBe(400);
    expect((await anon().get('/api/admin/quarterly-report')).status).toBe(401);
    const list = await staff.agent.get('/api/admin/quarterly-report');
    expect(list.status).toBe(200);
    expect(list.body.defaultQuarter).toHaveProperty('quarter');
  });
});
