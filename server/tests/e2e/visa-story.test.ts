import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import type { CaseStatus } from '@prisma/client';
import { anon, asAdmin, asClient, asStaff, type Actor } from '../helpers/api';
import { prisma } from '../helpers/db';
import { uniq } from '../helpers/factories';

const makeCase = async (client: Actor, over: { status?: CaseStatus; city?: string; staffId?: string; createdAt?: Date; decisionAt?: Date; profession?: string } = {}) => {
  const company = await prisma.company.create({ data: { name: `Firma ${uniq('c')}`, city: over.city ?? 'Hamburg, Altona' } });
  return prisma.case.create({
    data: {
      clientId: client.user.id,
      number: `TV-2026-${uniq('n')}`,
      profession: over.profession ?? 'LKW-Fahrer',
      visaType: 'WORK',
      status: over.status ?? 'APPROVED',
      decisionAt: over.decisionAt ?? new Date(),
      companyId: company.id,
      assignedStaffId: over.staffId ?? null,
      ...(over.createdAt ? { createdAt: over.createdAt } : {}),
    },
  });
};

const doc = (caseId: string, userId: string, status: 'PENDING' | 'ACCEPTED' | 'REJECTED') =>
  prisma.document.create({
    data: { caseId, stage: 'INITIAL', originalName: 'Reisepass-geheim.pdf', storedName: `${uniq('f')}.pdf`, mimeType: 'application/pdf', size: 100, status, uploadedById: userId },
  });

const binary = (req: ReturnType<Actor['agent']['get']>) =>
  req.buffer(true).parse((r, cb) => {
    const chunks: Buffer[] = [];
    r.on('data', (c: Buffer) => chunks.push(c));
    r.on('end', () => cb(null, Buffer.concat(chunks)));
  });

describe('visa story (Triad Wrapped)', () => {
  it('returns the real numbers of the own approved case', async () => {
    const staff = await asStaff({ firstName: 'Leyla Sara', lastName: 'Həsənova' });
    const client = await asClient({ firstName: 'Aynur', lastName: 'Qasımova', locale: 'en' });
    const c = await makeCase(client, { staffId: staff.user.id });
    await doc(c.id, client.user.id, 'ACCEPTED');
    await doc(c.id, client.user.id, 'ACCEPTED');
    await doc(c.id, client.user.id, 'REJECTED');
    await prisma.caseMessage.createMany({
      data: [
        { caseId: c.id, authorId: client.user.id, body: 'Salam' },
        { caseId: c.id, authorId: staff.user.id, body: 'Salam!' },
        { caseId: c.id, authorId: client.user.id, body: 'Sağ olun' },
      ],
    });
    await prisma.user.update({ where: { id: client.user.id }, data: { germanLevel: 'B1' } });
    await prisma.germanTestAttempt.create({ data: { userId: client.user.id, estimated: 'A1', correct: 5, total: 20, percent: 25, levels: [] } });

    const res = await client.agent.get(`/api/account/visa-story/${c.id}`);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('no-store');
    expect(res.body).toMatchObject({
      caseId: c.id,
      firstName: 'Aynur',
      documents: { uploaded: 3, approved: 2 },
      messages: { total: 3, fromYou: 2, fromTeam: 1 },
      staffFirstName: 'Leyla',
      destination: { city: 'Hamburg' },
      german: { from: 'A1', to: 'B1', steps: 2, wordsLearned: 0 },
    });
    expect(res.body.destination.km).toBeGreaterThan(2800);
    expect(res.body.destination.km).toBeLessThan(3200);
    expect(res.body.funFact.key).toBe('walk');
    expect(res.body.days).toBeGreaterThanOrEqual(0);
    // No staff surname, no document names.
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain('Həsənova');
    expect(raw).not.toContain('Reisepass');
  });

  it('answers 404 for another client’s case, a case not yet approved and family member cases', async () => {
    const owner = await asClient();
    const other = await asClient();
    const c = await makeCase(owner);
    expect((await other.agent.get(`/api/account/visa-story/${c.id}`)).status).toBe(404);
    expect((await binary(other.agent.get(`/api/account/visa-story/${c.id}/card/story.png`))).status).toBe(404);

    const pending = await makeCase(owner, { status: 'DECISION_PENDING' });
    expect((await owner.agent.get(`/api/account/visa-story/${pending.id}`)).status).toBe(404);

    const member = await makeCase(owner);
    await prisma.case.update({ where: { id: member.id }, data: { parentCaseId: c.id } });
    expect((await owner.agent.get(`/api/account/visa-story/${member.id}`)).status).toBe(404);

    expect((await owner.agent.get('/api/account/visa-story/not-a-valid-id!')).status).toBe(404);
  });

  it('is for signed-in clients only', async () => {
    const owner = await asClient();
    const c = await makeCase(owner);
    expect((await anon().get(`/api/account/visa-story/${c.id}`)).status).toBe(401);
    const staff = await asStaff();
    expect((await staff.agent.get(`/api/account/visa-story/${c.id}`)).status).toBe(403);
  });

  it('renders the share card as a story and a square PNG', async () => {
    const client = await asClient({ firstName: 'Rauf', lastName: 'Məmmədov' });
    const c = await makeCase(client);
    const story = await binary(client.agent.get(`/api/account/visa-story/${c.id}/card/story.png?name=initials&lang=de`));
    expect(story.status).toBe(200);
    expect(story.headers['content-type']).toContain('image/png');
    expect(story.headers['cache-control']).toContain('no-store');
    expect(await sharp(story.body as Buffer).metadata()).toMatchObject({ width: 1080, height: 1920 });
    const square = await binary(client.agent.get(`/api/account/visa-story/${c.id}/card/square.png?name=anonymous&download=1`));
    expect(square.status).toBe(200);
    expect(square.headers['content-disposition']).toContain('attachment');
    expect(await sharp(square.body as Buffer).metadata()).toMatchObject({ width: 1080, height: 1080 });
    expect((await client.agent.get(`/api/account/visa-story/${c.id}/card/post.png`)).status).toBe(404);
    expect((await client.agent.get(`/api/account/visa-story/${c.id}/card/story.png?name=surname`)).status).toBe(400);
  });
});

describe('staff year in review', () => {
  it('aggregates a year; per-staff counts only for ADMIN+', async () => {
    const staffUser = await asStaff({ firstName: 'Murad', lastName: 'Year' });
    const client = await asClient();
    const profession = `Testberuf-${uniq('p')}`;
    await makeCase(client, { profession, city: 'Leipzig', staffId: staffUser.user.id, createdAt: new Date('2017-03-01T10:00:00Z'), decisionAt: new Date('2017-04-01T10:00:00Z') });
    await makeCase(client, { profession, city: 'Leipzig', staffId: staffUser.user.id, createdAt: new Date('2017-03-05T10:00:00Z'), decisionAt: new Date('2017-03-25T10:00:00Z') });

    const admin = await asAdmin();
    const res = await admin.agent.get('/api/admin/year-review?year=2017');
    expect(res.status).toBe(200);
    expect(res.body.year).toBe(2017);
    expect(res.body.opened).toBeGreaterThanOrEqual(2);
    expect(res.body.approved).toBeGreaterThanOrEqual(2);
    expect(res.body.topProfessions).toEqual(expect.arrayContaining([{ name: profession, count: 2 }]));
    expect(res.body.perStaff).toEqual(expect.arrayContaining([expect.objectContaining({ id: staffUser.user.id, opened: 2, approved: 2 })]));

    const staffRes = await staffUser.agent.get('/api/admin/year-review?year=2017');
    expect(staffRes.status).toBe(200);
    expect(staffRes.body.perStaff).toBeNull();
    expect(staffRes.body.opened).toBe(res.body.opened);

    expect((await client.agent.get('/api/admin/year-review')).status).toBe(403);
    expect((await admin.agent.get('/api/admin/year-review?year=1999')).status).toBe(400);
  });
});
