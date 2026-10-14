import { describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff } from '../helpers/api';
import { emailsTo, prisma, settle, waitFor } from '../helpers/db';
import { ADMIN_INBOX } from '../helpers/testEnv';
import { staffNotifications } from '../helpers/notify';
import { act, adminCase, createCaseVia, driveCaseTo, expectStatus, reviewAll, uploadDoc, uploadRequired } from '../helpers/workflow';

const overview = async (agent: Awaited<ReturnType<typeof asClient>>['agent']) =>
  expectStatus(await agent.get('/api/account/overview'), 200).body;

const isoDate = (yearsAgo: number, dayShift = 0) => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - yearsAgo);
  d.setUTCDate(d.getUTCDate() + dayShift);
  return d.toISOString().slice(0, 10);
};

describe('GET /api/account/overview', () => {
  it('requires a session', async () => {
    expect((await anon().get('/api/account/overview')).status).toBe(401);
  });

  it('returns an empty dashboard and profile gaps for a new client', async () => {
    const { agent, user } = await asClient({ firstName: 'Aynur' });
    const body = await overview(agent);
    expect(body.user).toMatchObject({ id: user.id, firstName: 'Aynur', emailNotifications: true, pushNotifications: true });
    expect(body.user.passwordHash).toBeUndefined();
    expect(body.activeCase).toBeNull();
    expect(body.cases).toEqual([]);
    expect(body.notifications).toEqual({ unread: 0, items: [] });
    expect(body.lastMessage).toBeNull();
    expect(body.profile.percent).toBe(0);
    expect(body.profile.missing).toEqual(
      expect.arrayContaining(['phone', 'birthDate', 'nationality', 'city', 'profession', 'germanLevel', 'education']),
    );
  });

  it('summarises a fresh case: client turn, initial checklist, upload action', async () => {
    const { agent } = await asClient();
    const created = await createCaseVia(agent);
    const body = await overview(agent);
    const c = body.activeCase;
    expect(c).toMatchObject({
      id: created.id,
      number: created.number,
      status: 'DOCUMENTS_PENDING',
      step: 0,
      stepCount: 6,
      percent: 0,
      turn: 'client',
      nextAction: { kind: 'UPLOAD_DOCUMENTS', owner: 'client', anchor: '#docs-initial' },
      appointment: null,
      manager: null,
    });
    expect(c.documents).toMatchObject({ stage: 'INITIAL', total: 7, required: 4, uploaded: 0, accepted: 0, rejected: 0, missingRequired: 4 });
    expect(c.documents.items).toHaveLength(7);
    expect(c.documents.items[0]).toMatchObject({ required: true, state: 'missing' });
    expect(c.documents.items[0].title.az).toBeTruthy();
    // CASE_CREATED notification
    expect(body.notifications.unread).toBe(1);
    expect(body.notifications.items).toHaveLength(1);
    expect(body.cases).toHaveLength(1);
  });

  it('counts uploads, highlights rejected items and switches to FIX_DOCUMENTS / SUBMIT_DOCUMENTS', async () => {
    const { agent } = await asClient();
    const admin = await asAdmin();
    const created = await createCaseVia(agent);
    await uploadRequired(agent, created.id, 'INITIAL');

    let c = (await overview(agent)).activeCase;
    expect(c.documents).toMatchObject({ uploaded: 4, requiredUploaded: 4, missingRequired: 0, rejected: 0 });
    expect(c.nextAction.kind).toBe('SUBMIT_DOCUMENTS');
    expect(c.percent).toBe(8); // half of step 1 of 6

    // Staff rejects one file: it is highlighted with the note.
    const detail = await adminCase(admin.agent, created.id);
    const doc = detail.requirements.find((r) => r.stage === 'INITIAL' && r.documents.length)!.documents[0];
    expectStatus(
      await admin.agent.post(`/api/admin/cases/${created.id}/documents/${doc.id}/review`).send({ status: 'REJECTED', note: 'Blurry scan' }),
      200,
    );
    c = (await overview(agent)).activeCase;
    expect(c.documents).toMatchObject({ rejected: 1, missingRequired: 1, uploaded: 3 });
    expect(c.nextAction).toMatchObject({ kind: 'FIX_DOCUMENTS', anchor: '#docs-initial' });
    const rejected = c.documents.items.find((i: { state: string }) => i.state === 'rejected');
    expect(rejected.note).toBe('Blurry scan');

    // Re-upload fixes it.
    expectStatus(await uploadDoc(agent, created.id, rejected.id), 201);
    c = (await overview(agent)).activeCase;
    expect(c.documents.rejected).toBe(0);
    expect(c.nextAction.kind).toBe('SUBMIT_DOCUMENTS');
  });

  it('reports staff turn while documents are reviewed and accepted counts', async () => {
    const client = await asClient();
    const admin = await asAdmin();
    const created = await driveCaseTo('DOCUMENTS_REVIEW', { client: client.agent, admin: admin.agent });
    await reviewAll(admin.agent, created.id, 'INITIAL');
    const c = (await overview(client.agent)).activeCase;
    expect(c).toMatchObject({ status: 'DOCUMENTS_REVIEW', turn: 'staff', nextAction: { kind: 'WAIT_REVIEW', owner: 'staff' } });
    expect(c.documents.accepted).toBe(4);
  });

  it('points to the contract when it must be signed and names the assigned manager', async () => {
    const client = await asClient();
    const admin = await asAdmin();
    const staff = await asStaff({ firstName: 'Leyla', lastName: 'Həsənova' });
    const created = await driveCaseTo('CONTRACT_SENT', { client: client.agent, admin: admin.agent });
    expectStatus(await admin.agent.patch(`/api/admin/cases/${created.id}`).send({ assignedStaffId: staff.user.id }), 200);

    const c = (await overview(client.agent)).activeCase;
    expect(c).toMatchObject({
      status: 'CONTRACT_SENT',
      step: 1,
      turn: 'client',
      nextAction: { kind: 'SIGN_CONTRACT', anchor: '#contract' },
      manager: { firstName: 'Leyla', lastName: 'Həsənova' },
    });
    expect(c.contract).toMatchObject({ version: 1, signedAt: null });
    expect(c.percent).toBe(Math.round((1.25 / 6) * 100));
  });

  it('switches the checklist to embassy documents', async () => {
    const client = await asClient();
    const admin = await asAdmin();
    await driveCaseTo('EMBASSY_DOCUMENTS', { client: client.agent, admin: admin.agent });
    const c = (await overview(client.agent)).activeCase;
    expect(c.documents).toMatchObject({ stage: 'EMBASSY', total: 7, required: 4, uploaded: 0 });
    expect(c.nextAction).toMatchObject({ kind: 'UPLOAD_DOCUMENTS', anchor: '#docs-embassy' });
  });

  it('includes the appointment and the preparation action', async () => {
    const client = await asClient();
    const admin = await asAdmin();
    await driveCaseTo('APPOINTMENT_SCHEDULED', { client: client.agent, admin: admin.agent });
    const c = (await overview(client.agent)).activeCase;
    expect(c.step).toBe(3);
    expect(c.nextAction).toMatchObject({ kind: 'PREPARE_APPOINTMENT', anchor: '#appointment' });
    expect(new Date(c.appointment.at).toISOString()).toBe(new Date('2026-11-20T09:30:00+04:00').toISOString());
    expect(c.appointment.place).toBe('Embassy Baku');
    expect(c.documents).toMatchObject({ stage: 'EMBASSY', accepted: 4 });
  });

  it('has no active case after a decision but lists the case', async () => {
    const client = await asClient();
    const admin = await asAdmin();
    const created = await driveCaseTo('APPROVED', { client: client.agent, admin: admin.agent });
    const body = await overview(client.agent);
    expect(body.activeCase).toBeNull();
    expect(body.cases).toEqual([expect.objectContaining({ id: created.id, status: 'APPROVED' })]);
  });

  it('shows the last 5 notifications, the unread count and the latest message preview', async () => {
    const client = await asClient();
    const admin = await asAdmin({ firstName: 'Rauf', lastName: 'Admin' });
    const created = await createCaseVia(client.agent);
    for (let i = 0; i < 6; i++) {
      expectStatus(await admin.agent.post(`/api/admin/cases/${created.id}/messages`).send({ body: `Message ${i}` }), 201);
    }
    const body = await overview(client.agent);
    expect(body.notifications.unread).toBe(7);
    expect(body.notifications.items).toHaveLength(5);
    expect(body.lastMessage).toMatchObject({
      caseId: created.id,
      caseNumber: created.number,
      body: 'Message 5',
      fromTeam: true,
      author: { firstName: 'Rauf' },
    });

    expectStatus(await client.agent.post(`/api/cases/${created.id}/messages`).send({ body: 'x'.repeat(400) }), 201);
    const after = (await overview(client.agent)).lastMessage;
    expect(after.fromTeam).toBe(false);
    expect(after.body.length).toBeLessThanOrEqual(241);
  });

  it('only shows the caller’s own case', async () => {
    const a = await asClient();
    const b = await asClient();
    await createCaseVia(a.agent);
    const body = await overview(b.agent);
    expect(body.activeCase).toBeNull();
    expect(body.cases).toEqual([]);
  });
});

describe('PATCH /api/auth/me profile fields', () => {
  it('saves the candidate profile, returns it from /me and raises completeness', async () => {
    const { agent, user } = await asClient();
    const profile = {
      phone: '+994 50 000 00 00',
      birthDate: isoDate(30),
      nationality: 'Azərbaycan',
      city: 'Bakı',
      address: 'Nizami küç. 1',
      profession: 'LKW sürücüsü',
      experienceYears: 7,
      germanLevel: 'A2',
      education: 'vocational',
      drivingLicence: 'B, C, CE',
      about: 'Beynəlxalq daşımalarda təcrübə.',
    };
    const res = expectStatus(await agent.patch('/api/auth/me').send(profile), 200);
    expect(res.body.user).toMatchObject(profile);

    const me = (await agent.get('/api/auth/me')).body.user;
    expect(me).toMatchObject({ ...profile, id: user.id });
    const db = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(db.birthDate!.toISOString().slice(0, 10)).toBe(profile.birthDate);

    const body = await overview(agent);
    expect(body.profile).toEqual({ percent: 100, missing: [] });
  });

  it('clears text fields with empty strings and nulls', async () => {
    const { agent, user } = await asClient();
    await agent.patch('/api/auth/me').send({ city: 'Gəncə', birthDate: isoDate(25), germanLevel: 'B1', experienceYears: 3 });
    const res = expectStatus(await agent.patch('/api/auth/me').send({ city: '  ', birthDate: '', germanLevel: null, experienceYears: null }), 200);
    expect(res.body.user).toMatchObject({ city: null, birthDate: null, germanLevel: null, experienceYears: null });
    const db = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(db.city).toBeNull();
  });

  it.each([
    ['future birth date', { birthDate: isoDate(-1) }],
    ['today', { birthDate: isoDate(0) }],
    ['younger than 16', { birthDate: isoDate(16, 1) }],
    ['older than 70', { birthDate: isoDate(71) }],
    ['not a date', { birthDate: '1990-02-30' }],
    ['bad format', { birthDate: '01.02.1990' }],
    ['unknown German level', { germanLevel: 'B3' }],
    ['unknown education', { education: 'phd' }],
    ['negative experience', { experienceYears: -1 }],
    ['too much experience', { experienceYears: 51 }],
    ['fractional experience', { experienceYears: 2.5 }],
    ['too long about', { about: 'x'.repeat(2001) }],
    ['too long city', { city: 'x'.repeat(81) }],
    ['non-boolean pref', { emailNotifications: 'no' }],
  ])('rejects %s', async (_label, body) => {
    const { agent } = await asClient();
    const res = await agent.patch('/api/auth/me').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION');
  });

  it('accepts the age boundaries 16 and 70', async () => {
    const { agent } = await asClient();
    expectStatus(await agent.patch('/api/auth/me').send({ birthDate: isoDate(16) }), 200);
    expectStatus(await agent.patch('/api/auth/me').send({ birthDate: isoDate(70) }), 200);
  });
});

describe('notification preferences', () => {
  it('skips the email when emailNotifications is false but keeps the in-app notification', async () => {
    const { agent, user } = await asClient();
    expectStatus(await agent.patch('/api/auth/me').send({ emailNotifications: false, pushNotifications: false }), 200);
    const created = await createCaseVia(agent);
    await settle();

    expect(await prisma.notification.count({ where: { userId: user.id, type: 'CASE_CREATED', caseId: created.id } })).toBe(1);
    expect(await prisma.emailLog.count({ where: { to: user.email } })).toBe(0);
  });

  it('sends the email again once re-enabled', async () => {
    const client = await asClient();
    const admin = await asAdmin();
    await client.agent.patch('/api/auth/me').send({ emailNotifications: false });
    const created = await createCaseVia(client.agent);
    await settle();
    expect(await prisma.emailLog.count({ where: { to: client.user.email } })).toBe(0);

    expectStatus(await client.agent.patch('/api/auth/me').send({ emailNotifications: true }), 200);
    expectStatus(await act(admin.agent, created.id, { action: 'CANCEL', reason: 'Test' }), 200);
    const rows = await emailsTo(client.user.email, 1);
    expect(rows).toHaveLength(1);
  });
});

describe('GET /api/account/export', () => {
  it('requires a session', async () => {
    expect((await anon().get('/api/account/export')).status).toBe(401);
  });

  it('downloads the caller’s profile and cases as JSON without file contents or secrets', async () => {
    const client = await asClient({ firstName: 'Nigar' });
    const admin = await asAdmin();
    const other = await asClient();
    await client.agent.patch('/api/auth/me').send({ city: 'Bakı', profession: 'Aşpaz' });
    const created = await createCaseVia(client.agent);
    await uploadRequired(client.agent, created.id, 'INITIAL');
    await client.agent.post(`/api/cases/${created.id}/messages`).send({ body: 'Salam!' });
    await admin.agent.post(`/api/admin/cases/${created.id}/messages`).send({ body: 'Xoş gəldiniz' });
    const otherCase = await createCaseVia(other.agent);

    const res = expectStatus(await client.agent.get('/api/account/export'), 200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="triad-vision-my-data-\d{4}-\d{2}-\d{2}\.json"$/);
    const data = typeof res.body === 'object' && Object.keys(res.body).length ? res.body : JSON.parse(res.text);

    expect(data.profile).toMatchObject({ id: client.user.id, email: client.user.email, firstName: 'Nigar', city: 'Bakı', profession: 'Aşpaz' });
    expect(data.cases).toHaveLength(1);
    const c = data.cases[0];
    expect(c.number).toBe(created.number);
    expect(c.documents).toHaveLength(4);
    expect(c.documents[0]).toMatchObject({ originalName: 'doc.pdf', mimeType: 'application/pdf', status: 'PENDING' });
    expect(c.requirements.length).toBe(7);
    expect(c.events.map((e: { type: string }) => e.type)).toContain('CASE_CREATED');
    expect(c.messages.map((m: { body: string; from: string }) => [m.from, m.body])).toEqual([
      ['me', 'Salam!'],
      ['Triad Vision', 'Xoş gəldiniz'],
    ]);
    expect(data.notifications.length).toBeGreaterThan(0);

    const text = res.text;
    expect(text).not.toContain('passwordHash');
    expect(text).not.toContain('storedName');
    expect(text).not.toContain(otherCase.number);
    expect(text).not.toContain(other.user.email);
  });
});

describe('POST /api/account/delete-request', () => {
  it('requires a session', async () => {
    expect((await anon().post('/api/account/delete-request').send({})).status).toBe(401);
  });

  it('notifies admins in-app and by email, and deletes nothing', async () => {
    const admin = await asAdmin();
    const client = await asClient({ email: 'leaving@test.local', firstName: 'Kamran', lastName: 'Əliyev' });
    const created = await createCaseVia(client.agent);

    const res = expectStatus(await client.agent.post('/api/account/delete-request').send({ reason: 'Plans changed' }), 200);
    expect(res.body).toEqual({ ok: true });

    const notes = await staffNotifications(admin.user.id);
    const n = notes.find((x) => x.title.includes('leaving@test.local'));
    expect(n).toBeTruthy();
    expect(n!.body).toContain('Plans changed');
    expect(n!.body).toContain(created.number);
    expect(n!.link).toBe('/admin/users');

    const mail = await waitFor(() =>
      prisma.emailLog.findFirst({ where: { to: ADMIN_INBOX, subject: { contains: 'leaving@test.local' } } }),
    );
    expect(mail.subject).toMatch(/^\[Triad Vision\]/);

    expect(await prisma.user.count({ where: { id: client.user.id } })).toBe(1);
    expect(await prisma.case.count({ where: { id: created.id } })).toBe(1);
  });

  it('works without a reason and validates its length', async () => {
    await asAdmin();
    const client = await asClient();
    expectStatus(await client.agent.post('/api/account/delete-request').send({}), 200);
    const long = await client.agent.post('/api/account/delete-request').send({ reason: 'x'.repeat(1001) });
    expect(long.status).toBe(400);
  });

  it('is rate limited per user', async () => {
    const client = await asClient();
    const other = await asClient();
    for (let i = 0; i < 3; i++) expectStatus(await client.agent.post('/api/account/delete-request').send({}), 200);
    const limited = await client.agent.post('/api/account/delete-request').send({});
    expect(limited.status).toBe(429);
    expect(limited.body.error).toBe('TOO_MANY_REQUESTS');
    expectStatus(await other.agent.post('/api/account/delete-request').send({}), 200);
  });
});
