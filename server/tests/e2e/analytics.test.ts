import { beforeEach, describe, expect, it } from 'vitest';
import type { CaseStatus } from '@prisma/client';
import { anon, asAdmin, asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createClient, createVisaCategory, uniq } from '../helpers/factories';

const DAY = 24 * 60 * 60 * 1000;
const today = () => new Date().toISOString().slice(0, 10);

beforeEach(async () => {
  await prisma.analyticsDaily.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.consultationSlot.deleteMany();
  await prisma.vacancyApplication.deleteMany();
});

const beacon = (body: unknown, headers: Record<string, string> = {}) => {
  const r = anon().post('/api/track').set('Content-Type', 'text/plain;charset=UTF-8');
  for (const [k, v] of Object.entries(headers)) r.set(k, v);
  return r.send(typeof body === 'string' ? body : JSON.stringify(body));
};

describe('POST /api/track', () => {
  it('counts a visit per day and source without storing anything else', async () => {
    expect((await beacon({ metric: 'visit', source: 'Google.com' })).status).toBe(204);
    expect((await beacon({ metric: 'visit', source: 'www.google.com' })).status).toBe(204);
    expect((await beacon({ metric: 'visit', source: '' })).status).toBe(204);
    // JSON content type works too
    expect((await anon().post('/api/track').send({ metric: 'visit' })).status).toBe(204);
    const rows = await prisma.analyticsDaily.findMany({ orderBy: { source: 'asc' } });
    expect(rows.map((r) => [r.source, r.count, r.metric])).toEqual([
      ['', 2, 'visit'],
      ['google.com', 2, 'visit'],
    ]);
    expect(rows[0].day.toISOString().slice(0, 10)).toBe(today());
    expect(Object.keys(rows[0]).sort()).toEqual(['count', 'day', 'id', 'metric', 'source']);
  });

  it('sanitises the source and caps it at 60 characters', async () => {
    await beacon({ metric: 'visit', source: `<script>${'a'.repeat(100)}` });
    const row = await prisma.analyticsDaily.findFirstOrThrow();
    expect(row.source).toBe(`script${'a'.repeat(54)}`);
  });

  it('honours Do-Not-Track / GPC and ignores bots', async () => {
    await beacon({ metric: 'visit', source: 'x.com' }, { DNT: '1' });
    await beacon({ metric: 'visit', source: 'x.com' }, { 'Sec-GPC': '1' });
    await beacon({ metric: 'visit', source: 'x.com' }, { 'User-Agent': 'Googlebot/2.1' });
    expect(await prisma.analyticsDaily.count()).toBe(0);
  });

  it('rejects anything but a visit', async () => {
    expect((await beacon({ metric: 'register' })).status).toBe(400);
    expect((await beacon('not json')).status).toBe(400);
    expect((await beacon({ metric: 'visit', source: 'x'.repeat(201) })).status).toBe(400);
    expect(await prisma.analyticsDaily.count()).toBe(0);
  });

  it('is rate limited per IP', async () => {
    let last = 0;
    for (let i = 0; i < 31; i++) last = (await beacon({ metric: 'visit' })).status;
    expect(last).toBe(429);
  });
});

const caseWithSteps = async (clientId: string, steps: CaseStatus[], data: { visaCategoryId?: string; status?: CaseStatus; decisionAt?: Date } = {}) => {
  const c = await prisma.case.create({
    data: { number: uniq('TV-A-'), clientId, profession: 'Driver', status: data.status ?? steps.at(-1) ?? 'DOCUMENTS_PENDING', visaCategoryId: data.visaCategoryId, decisionAt: data.decisionAt },
  });
  let from: CaseStatus = 'DOCUMENTS_PENDING';
  await prisma.caseEvent.create({ data: { caseId: c.id, type: 'CASE_CREATED', toStatus: 'DOCUMENTS_PENDING' } });
  for (const to of steps) {
    await prisma.caseEvent.create({ data: { caseId: c.id, type: 'STATUS_CHANGED', fromStatus: from, toStatus: to } });
    from = to;
  }
  return c;
};

describe('GET /api/admin/analytics', () => {
  it('is for staff and above', async () => {
    const client = await asClient();
    expect((await client.agent.get('/api/admin/analytics')).status).toBe(403);
    expect((await anon().get('/api/admin/analytics')).status).toBe(401);
    const staff = await asStaff();
    expect((await staff.agent.get('/api/admin/analytics')).status).toBe(200);
  });

  it('validates the range', async () => {
    const admin = await asAdmin();
    expect((await admin.agent.get('/api/admin/analytics').query({ from: '2026-10-10', to: '2026-10-01' })).status).toBe(400);
    expect((await admin.agent.get('/api/admin/analytics').query({ from: '2020-01-01', to: '2026-10-01' })).status).toBe(400);
    expect((await admin.agent.get('/api/admin/analytics').query({ from: 'yesterday' })).status).toBe(400);
    expect((await admin.agent.get('/api/admin/analytics').query({ groupBy: 'year' })).status).toBe(400);
  });

  it('computes the funnel, series, sources, medians, drop-off and categories', async () => {
    const admin = await asAdmin();
    const day = new Date(`${today()}T00:00:00Z`);
    await prisma.analyticsDaily.createMany({
      data: [
        { day, metric: 'visit', source: '', count: 60 },
        { day, metric: 'visit', source: 'google.com', count: 30 },
        { day: new Date(day.getTime() - 2 * DAY), metric: 'visit', source: 'facebook.com', count: 10 },
        { day: new Date(day.getTime() - 90 * DAY), metric: 'visit', source: 'old.com', count: 999 }, // out of range
      ],
    });
    const visa = await createVisaCategory({ visaLabel: '§18b' });
    const clients = await Promise.all([1, 2, 3, 4].map(() => createClient()));
    // Two of the four verified their email in the period.
    await prisma.user.updateMany({ where: { id: { in: [clients[2].user.id, clients[3].user.id] } }, data: { emailVerifiedAt: null } });

    const approvedCase = await caseWithSteps(
      clients[0].user.id,
      ['DOCUMENTS_REVIEW', 'CONTRACT_SENT', 'CONTRACT_SIGNED', 'EMBASSY_DOCUMENTS', 'EMBASSY_REVIEW', 'APPOINTMENT_SCHEDULED', 'DECISION_PENDING', 'APPROVED'],
      { visaCategoryId: visa.id, decisionAt: new Date() },
    );
    await caseWithSteps(clients[1].user.id, ['DOCUMENTS_REVIEW', 'CONTRACT_SENT'], { visaCategoryId: visa.id });
    await caseWithSteps(clients[2].user.id, ['DOCUMENTS_REVIEW', 'CANCELLED']);
    await prisma.inquiry.create({ data: { kind: 'company', contactName: 'X', email: 'x@y.z', message: 'hello there', locale: 'de' } });

    const res = await admin.agent.get('/api/admin/analytics').query({ from: new Date(day.getTime() - 6 * DAY).toISOString().slice(0, 10), to: today(), groupBy: 'day' });
    expect(res.status).toBe(200);
    const b = res.body;
    const count = (k: string) => b.funnel.find((f: { key: string }) => f.key === k);
    expect(count('visits').count).toBe(100);
    expect(count('registrations').count).toBe(4);
    expect(count('registrations').rate).toBe(4);
    expect(count('emailVerified').count).toBe(2);
    expect(count('emailVerified').rate).toBe(50);
    expect(count('casesCreated').count).toBe(3);
    expect(count('documentsSubmitted').count).toBe(3);
    expect(count('contractSigned').count).toBe(1);
    expect(count('embassySubmitted').count).toBe(1);
    expect(count('lodged').count).toBe(1);
    expect(count('approved').count).toBe(1);
    expect(b.totals.inquiries).toBe(1);
    expect(b.totals.bookings).toBe(0);
    expect(b.totals.visitToApproved).toBe(1);

    expect(b.series.buckets).toHaveLength(7);
    expect(b.series.buckets.at(-1)).toBe(today());
    expect(b.series.values.visits.at(-1)).toBe(90);
    expect(b.series.values.visits.at(-3)).toBe(10);

    expect(b.sources).toEqual([
      { source: '', count: 60, share: 60 },
      { source: 'google.com', count: 30, share: 30 },
      { source: 'facebook.com', count: 10, share: 10 },
    ]);
    expect(b.medians.registrationToCaseDays).toBeGreaterThanOrEqual(0);
    expect(b.medians.caseToApprovalSamples).toBe(1);

    const step = (s: string) => b.dropoff.find((d: { step: string }) => d.step === s);
    expect(step('created').reached).toBe(3);
    expect(step('documentsSubmitted')).toMatchObject({ reached: 3, lost: 1, active: 0 });
    expect(step('contractSent')).toMatchObject({ reached: 2, active: 1 });
    expect(step('approved').reached).toBe(1);

    const cat = b.byCategory.find((x: { id: string | null }) => x.id === visa.id);
    expect(cat).toMatchObject({ created: 2, approved: 1, active: 1, approvalRate: 100, visaLabel: '§18b' });
    expect(b.byCategory.find((x: { id: string | null }) => x.id === null)).toMatchObject({ created: 1, cancelled: 1 });

    // No personal data anywhere in the response.
    const raw = JSON.stringify(b);
    for (const c of clients) expect(raw).not.toContain(c.user.email);
    expect(raw).not.toContain(approvedCase.id);
    expect(raw).not.toContain(approvedCase.number);
  });

  it('groups by week and month', async () => {
    const admin = await asAdmin();
    const w = await admin.agent.get('/api/admin/analytics').query({ from: '2026-09-01', to: '2026-09-30', groupBy: 'week' });
    expect(w.body.series.buckets[0]).toBe('2026-08-31');
    expect(w.body.series.buckets).toHaveLength(5);
    const m = await admin.agent.get('/api/admin/analytics').query({ from: '2026-01-15', to: '2026-10-01', groupBy: 'month' });
    expect(m.body.series.buckets).toEqual(['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01']);
    const auto = await admin.agent.get('/api/admin/analytics').query({ from: '2026-01-01', to: '2026-10-01' });
    expect(auto.body.range.groupBy).toBe('month');
  });
});
