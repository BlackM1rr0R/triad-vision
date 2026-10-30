import { describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff, asSuperAdmin } from '../helpers/api';
import { prisma } from '../helpers/db';
import { uniq } from '../helpers/factories';
import { adminCase, clientCase, createCaseVia, expectStatus, uploadDoc } from '../helpers/workflow';

/**
 * Staff power features: saved views (routes/admin/staffUi.ts), table settings, "what's new", bulk actions
 * (routes/admin/bulk.ts) and the fast document review queue (routes/admin/review.ts).
 */

const viewBody = (over: Record<string, unknown> = {}) => ({ page: 'cases', name: 'Mənim LKW işlərim — səfirlik', params: { status: 'EMBASSY_REVIEW', mine: '1', page: '3' }, ...over });

describe('saved views', () => {
  it('private views are only the owner\'s; transient params are dropped; pin / rename / delete', async () => {
    const a = await asStaff();
    const b = await asStaff();
    const created = expectStatus(await a.agent.post('/api/admin/me/saved-views').send(viewBody({ pinned: true, columns: { hidden: ['ball'], widths: { client: 240 } } })), 201).body.view;
    expect(created).toMatchObject({ page: 'cases', shared: false, mine: true, pinned: true, params: { status: 'EMBASSY_REVIEW', mine: '1' }, columns: { hidden: ['ball'], widths: { client: 240 } } });
    expect(created.params.page).toBeUndefined();

    const mine = expectStatus(await a.agent.get('/api/admin/me/saved-views?page=cases'), 200).body.views;
    expect(mine.map((v: { id: string }) => v.id)).toEqual([created.id]);
    expect(expectStatus(await b.agent.get('/api/admin/me/saved-views'), 200).body.views).toEqual([]);
    expect((await b.agent.patch(`/api/admin/me/saved-views/${created.id}`).send({ name: 'x' })).status).toBe(404);

    const renamed = expectStatus(await a.agent.patch(`/api/admin/me/saved-views/${created.id}`).send({ name: 'Səfirlik', pinned: false }), 200).body.view;
    expect(renamed).toMatchObject({ name: 'Səfirlik', pinned: false });
    expectStatus(await a.agent.delete(`/api/admin/me/saved-views/${created.id}`), 200);
    expect(expectStatus(await a.agent.get('/api/admin/me/saved-views'), 200).body.views).toEqual([]);
  });

  it('team views: everyone sees and pins them, only the owner or an admin changes them', async () => {
    const owner = await asStaff({ firstName: 'Aysel', lastName: 'Quliyeva' });
    const other = await asStaff();
    const admin = await asAdmin();
    const v = expectStatus(await owner.agent.post('/api/admin/me/saved-views').send(viewBody({ shared: true })), 201).body.view;
    const seen = expectStatus(await other.agent.get('/api/admin/me/saved-views'), 200).body.views;
    expect(seen).toEqual([expect.objectContaining({ id: v.id, shared: true, mine: false, pinned: false, ownerName: 'Aysel Quliyeva' })]);

    // pinning is personal and allowed; renaming / deleting is not
    expect(expectStatus(await other.agent.patch(`/api/admin/me/saved-views/${v.id}`).send({ pinned: true }), 200).body.view.pinned).toBe(true);
    expect(expectStatus(await owner.agent.get('/api/admin/me/saved-views'), 200).body.views[0].pinned).toBe(false);
    expect((await other.agent.patch(`/api/admin/me/saved-views/${v.id}`).send({ name: 'Mine now' })).status).toBe(403);
    expect((await other.agent.delete(`/api/admin/me/saved-views/${v.id}`)).status).toBe(403);
    expectStatus(await admin.agent.patch(`/api/admin/me/saved-views/${v.id}`).send({ name: 'Komanda: səfirlik' }), 200);

    // unsharing moves it back to the owner's private list
    expectStatus(await owner.agent.patch(`/api/admin/me/saved-views/${v.id}`).send({ shared: false }), 200);
    expect(expectStatus(await other.agent.get('/api/admin/me/saved-views'), 200).body.views).toEqual([]);
    expect(expectStatus(await owner.agent.get('/api/admin/me/saved-views'), 200).body.views[0]).toMatchObject({ id: v.id, shared: false, name: 'Komanda: səfirlik' });
    expect(await prisma.auditLog.count({ where: { action: 'SAVED_VIEW_SHARED', target: `view:${v.id}` } })).toBe(1);
  });

  it('team views saved by several colleagues at the same moment are all kept (no lost update)', async () => {
    const staff = await Promise.all([asStaff(), asStaff(), asStaff(), asStaff(), asStaff()]);
    const before = expectStatus(await staff[0].agent.get('/api/admin/me/saved-views'), 200).body.views.filter((v: { shared: boolean }) => v.shared).length;
    const created = await Promise.all(staff.map((s, i) => s.agent.post('/api/admin/me/saved-views').send(viewBody({ shared: true, pinned: true, name: `Paralel ${i}` }))));
    for (const r of created) expect(r.status).toBe(201);
    const team = expectStatus(await staff[0].agent.get('/api/admin/me/saved-views'), 200).body.views.filter((v: { shared: boolean }) => v.shared);
    expect(team.length).toBe(before + staff.length);
    // Each owner deletes their own at once: none survives, none is resurrected.
    await Promise.all(created.map((r, i) => staff[i].agent.delete(`/api/admin/me/saved-views/${r.body.view.id}`)));
    const after = expectStatus(await staff[0].agent.get('/api/admin/me/saved-views'), 200).body.views.filter((v: { shared: boolean }) => v.shared);
    expect(after.length).toBe(before);
  });

  it('validates input, needs staff, and stays out of the generic settings listing', async () => {
    const staff = await asStaff();
    expect((await staff.agent.post('/api/admin/me/saved-views').send(viewBody({ page: 'users' }))).status).toBe(400);
    expect((await staff.agent.post('/api/admin/me/saved-views').send(viewBody({ name: '' }))).status).toBe(400);
    expect((await staff.agent.delete('/api/admin/me/saved-views/nope')).status).toBe(404);
    expect((await anon().get('/api/admin/me/saved-views')).status).toBe(401);
    const client = await asClient();
    expect((await client.agent.get('/api/admin/me/saved-views')).status).toBe(403);

    expectStatus(await staff.agent.post('/api/admin/me/saved-views').send(viewBody()), 201);
    expectStatus(await staff.agent.put('/api/admin/me/table-prefs/cases').send({ prefs: { hidden: ['ball'] } }), 200);
    const admin = await asAdmin();
    const settings = expectStatus(await admin.agent.get('/api/admin/settings'), 200).body.settings;
    expect(Object.keys(settings).some((k) => k.startsWith('savedViews:') || k.startsWith('staffUi:'))).toBe(false);
  });
});

describe('table settings and what\'s new', () => {
  it('stores column settings per user and table; null resets', async () => {
    const staff = await asStaff();
    const other = await asStaff();
    const prefs = { order: ['client', 'number', 'client'], hidden: ['ball'], widths: { client: 260 }, mode: 'table' };
    expect(expectStatus(await staff.agent.put('/api/admin/me/table-prefs/cases').send({ prefs }), 200).body.prefs).toEqual({ order: ['client', 'number'], hidden: ['ball'], widths: { client: 260 }, mode: 'table' });
    expectStatus(await staff.agent.put('/api/admin/me/table-prefs/inquiries').send({ prefs: { mode: 'list' } }), 200);
    expect(expectStatus(await staff.agent.get('/api/admin/me/table-prefs'), 200).body.tables).toMatchObject({ cases: { hidden: ['ball'] }, inquiries: { mode: 'list' } });
    expect(expectStatus(await other.agent.get('/api/admin/me/table-prefs'), 200).body.tables).toEqual({});
    expect((await staff.agent.put('/api/admin/me/table-prefs/cases').send({ prefs: { widths: { client: 5 } } })).status).toBe(400);
    expect((await staff.agent.put('/api/admin/me/table-prefs/..%2Fx').send({ prefs: {} })).status).toBe(400);
    expectStatus(await staff.agent.put('/api/admin/me/table-prefs/cases').send({ prefs: null }), 200);
    expect(expectStatus(await staff.agent.get('/api/admin/me/table-prefs'), 200).body.tables.cases).toBeUndefined();
  });

  it('counts unread notes per user, marks them read; overrides are super-admin only', async () => {
    const staff = await asStaff();
    const feed = expectStatus(await staff.agent.get('/api/admin/me/whats-new'), 200).body;
    expect(feed.unread).toBe(feed.items.length);
    expect(feed.items[0]).toHaveProperty('tour');
    const read = expectStatus(await staff.agent.post('/api/admin/me/whats-new/seen').send({ id: feed.latest }), 200).body;
    expect(read).toMatchObject({ unread: 0, seen: feed.latest });
    expect((await staff.agent.post('/api/admin/me/whats-new/seen').send({ id: 'nope' })).status).toBe(404);

    const body = { hidden: [], extra: [{ id: 'note-x', date: '2027-01-01', title: { az: 'Yeni', de: 'Neu', en: 'New', ru: 'Новое' }, body: { az: 'b', de: 'b', en: 'b', ru: 'b' } }] };
    expect((await staff.agent.put('/api/admin/whats-new/overrides').send(body)).status).toBe(403);
    const sa = await asSuperAdmin();
    expectStatus(await sa.agent.put('/api/admin/whats-new/overrides').send(body), 200);
    const after = expectStatus(await staff.agent.get('/api/admin/me/whats-new'), 200).body;
    expect(after.items[0].id).toBe('note-x');
    expect(after.unread).toBe(1);
  });
});

// ─── Bulk ──────────────────────────────────────────────────────────────

const seedCases = async (n: number, profession = 'LKW sürücüsü') => {
  const out: { id: string; number: string; clientId: string }[] = [];
  for (let i = 0; i < n; i++) {
    const client = await asClient({ firstName: `Ad${i}`, lastName: 'Soyad' });
    const c = await createCaseVia(client.agent, profession);
    out.push({ ...c, clientId: client.user.id });
  }
  return out;
};

describe('bulk actions: cases', () => {
  it('assigns many cases, reports per item, and the undo restores the previous assignee', async () => {
    const staff = await asStaff();
    const owner = await asStaff();
    const cases = await seedCases(3);
    await prisma.case.update({ where: { id: cases[0].id }, data: { assignedStaffId: owner.user.id } });
    const res = expectStatus(await staff.agent.post('/api/admin/bulk/cases/assign').send({ selection: { ids: [...cases.map((c) => c.id), 'missing'] }, staffId: staff.user.id }), 200).body;
    expect(res).toMatchObject({ ok: 3, failed: 0 });
    expect(res.previous).toEqual(expect.arrayContaining([{ id: cases[0].id, staffId: owner.user.id }, { id: cases[1].id, staffId: null }]));
    expect(await prisma.case.count({ where: { assignedStaffId: staff.user.id } })).toBe(3);
    expect(await prisma.auditLog.count({ where: { action: 'BULK_CASES_ASSIGNED' } })).toBe(1);

    expectStatus(await staff.agent.post('/api/admin/bulk/cases/restore-assign').send({ items: res.previous }), 200);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: cases[0].id } })).assignedStaffId).toBe(owner.user.id);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: cases[1].id } })).assignedStaffId).toBeNull();

    const client = await asClient();
    expect((await staff.agent.post('/api/admin/bulk/cases/assign').send({ selection: { ids: [cases[0].id] }, staffId: client.user.id })).status).toBe(400);
    expect((await client.agent.post('/api/admin/bulk/cases/assign').send({ selection: { ids: [cases[0].id] }, staffId: null })).status).toBe(403);
    expect((await staff.agent.post('/api/admin/bulk/cases/assign').send({ selection: { ids: Array.from({ length: 501 }, (_, i) => `c${i}`) }, staffId: null })).status).toBe(400);
  });

  it('"all matching" uses the list filters', async () => {
    const staff = await asStaff();
    await seedCases(2, 'Tibb bacısı');
    const lkw = await seedCases(2, 'LKW sürücüsü');
    const r = expectStatus(await staff.agent.post('/api/admin/bulk/cases/resolve').send({ all: { search: 'LKW' } }), 200).body;
    expect(r.ids.sort()).toEqual(lkw.map((c) => c.id).sort());
    expect(r).toMatchObject({ total: 2, capped: false, statuses: { DOCUMENTS_PENDING: 2 } });
    expect(r.actions).toEqual(['CANCEL']);
    expect((await staff.agent.post('/api/admin/bulk/cases/resolve').send({ ids: [lkw[0].id], all: {} })).status).toBe(400);
  });

  it('"all matching" honours the overdue chip (3+ days in the current status), as the list does', async () => {
    const staff = await asStaff();
    const [fresh, old, reentered] = await seedCases(3, uniq('Overdue'));
    const days = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
    // Created 10 days ago, never changed status → overdue.
    await prisma.$executeRaw`UPDATE \`Case\` SET createdAt = ${days(10)} WHERE id = ${old.id}`;
    await prisma.caseEvent.updateMany({ where: { caseId: { in: [old.id, reentered.id] } }, data: { createdAt: days(10) } });
    // Created 10 days ago but entered its current status yesterday → not overdue.
    await prisma.$executeRaw`UPDATE \`Case\` SET createdAt = ${days(10)} WHERE id = ${reentered.id}`;
    await prisma.caseEvent.create({ data: { caseId: reentered.id, type: 'STATUS_CHANGED', toStatus: 'DOCUMENTS_PENDING', visibleToClient: false, createdAt: days(1) } });
    const profession = (await prisma.case.findUniqueOrThrow({ where: { id: fresh.id } })).profession;
    const r = expectStatus(await staff.agent.post('/api/admin/bulk/cases/resolve').send({ all: { search: profession, overdue: '1' } }), 200).body;
    expect(r.ids).toEqual([old.id]);
    const list = expectStatus(await staff.agent.get('/api/admin/cases').query({ search: profession, overdue: '1' }), 200).body;
    expect(list.items.map((c: { id: string }) => c.id)).toEqual([old.id]);
    expect(list.items[0].daysInStatus).toBeGreaterThanOrEqual(3);
    expect(list.total).toBe(1);
  });

  it('undo of a bulk assignment refuses a staff member deactivated meanwhile', async () => {
    const staff = await asStaff();
    const gone = await asStaff();
    const [c] = await seedCases(1);
    await prisma.user.update({ where: { id: gone.user.id }, data: { isActive: false } });
    const res = expectStatus(await staff.agent.post('/api/admin/bulk/cases/restore-assign').send({ items: [{ id: c.id, staffId: gone.user.id }] }), 200).body;
    expect(res).toMatchObject({ ok: 0, failed: 1 });
    expect((await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).assignedStaffId).toBeNull();
  });

  it('status: only transitions valid for every case; per-item results; reopen undoes a cancellation', async () => {
    const staff = await asStaff();
    const cases = await seedCases(2);
    await prisma.case.update({ where: { id: cases[1].id }, data: { status: 'CONTRACT_SIGNED' } });
    const mixed = expectStatus(await staff.agent.post('/api/admin/bulk/cases/resolve').send({ ids: cases.map((c) => c.id) }), 200).body;
    expect(mixed.actions).toEqual(['CANCEL']);
    expect((await staff.agent.post('/api/admin/bulk/cases/status').send({ selection: { ids: cases.map((c) => c.id) }, action: 'CONFIRM_CONTRACT' })).status).toBe(409);
    expect((await staff.agent.post('/api/admin/bulk/cases/status').send({ selection: { ids: cases.map((c) => c.id) }, action: 'CANCEL' })).status).toBe(400);

    const res = expectStatus(await staff.agent.post('/api/admin/bulk/cases/status').send({ selection: { ids: cases.map((c) => c.id) }, action: 'CANCEL', reason: 'Müştəri imtina etdi' }), 200).body;
    expect(res).toMatchObject({ ok: 2, failed: 0 });
    expect(res.previous).toEqual(expect.arrayContaining([{ id: cases[0].id, status: 'DOCUMENTS_PENDING' }]));
    expect(await prisma.case.count({ where: { id: { in: cases.map((c) => c.id) }, status: 'CANCELLED' } })).toBe(2);

    // Reopen both; the second client's reopen works too (each client has one case only).
    const back = expectStatus(await staff.agent.post('/api/admin/bulk/cases/status').send({ selection: { ids: cases.map((c) => c.id) }, action: 'REOPEN', to: 'DOCUMENTS_PENDING' }), 200).body;
    expect(back).toMatchObject({ ok: 2 });
    expect((await prisma.case.findUniqueOrThrow({ where: { id: cases[0].id } })).status).toBe('DOCUMENTS_PENDING');
  });

  it('status: a case can still fail on its own (four-eyes gate) and is reported', async () => {
    const staff = await asStaff();
    const cases = await seedCases(1);
    await prisma.case.update({ where: { id: cases[0].id }, data: { status: 'APPOINTMENT_SCHEDULED' } });
    const res = expectStatus(await staff.agent.post('/api/admin/bulk/cases/status').send({ selection: { ids: [cases[0].id] }, action: 'MARK_LODGED' }), 200).body;
    expect(res).toMatchObject({ ok: 0, failed: 1 });
    expect(res.results[0].error).toMatch(/^FOUR_EYES|PACKAGE/);
  });

  it('processing stage, message with variables and CSV export', async () => {
    const staff = await asStaff({ firstName: 'Aysel', lastName: 'Q' });
    const cases = await seedCases(2);
    const moved = expectStatus(await staff.agent.post('/api/admin/bulk/cases/processing').send({ selection: { ids: cases.map((c) => c.id) }, stage: 'WRITTEN' }), 200).body;
    expect(moved).toMatchObject({ ok: 2 });
    expect(await prisma.case.count({ where: { processingStage: 'WRITTEN' } })).toBe(2);
    const again = expectStatus(await staff.agent.post('/api/admin/bulk/cases/processing').send({ selection: { ids: [cases[0].id] }, stage: 'WRITTEN' }), 200).body;
    expect(again.results[0]).toMatchObject({ ok: false, error: 'PROCESSING_UNCHANGED' });

    const msg = expectStatus(await staff.agent.post('/api/admin/bulk/cases/message').send({ selection: { ids: cases.map((c) => c.id) }, body: 'Salam {{firstName}}! {{caseNumber}} — {{staffName}}' }), 200).body;
    expect(msg).toMatchObject({ ok: 2 });
    const m = await prisma.caseMessage.findFirstOrThrow({ where: { caseId: cases[0].id } });
    expect(m.body).toBe(`Salam Ad0! ${cases[0].number} — Aysel Q`);

    const csv = expectStatus(await staff.agent.post('/api/admin/bulk/cases/export').send({ selection: { ids: cases.map((c) => c.id) } }).buffer(true), 200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    const text = csv.text ?? String(csv.body);
    expect(text).toContain('number;client;email');
    expect(text).toContain(cases[1].number);
    expect(await prisma.auditLog.count({ where: { action: 'BULK_CASES_EXPORTED' } })).toBe(1);
  });
});

describe('bulk actions: inquiries and candidates', () => {
  const inquiry = (n: number) =>
    prisma.inquiry.create({ data: { kind: 'company', companyName: `Firma ${n}`, contactName: `Kontakt ${n}`, email: `lead${n}-${uniq()}@test.local`, message: 'Fahrer gesucht', locale: 'de' } });

  it('inquiries: status with undo, e-mail with variables, export', async () => {
    const staff = await asStaff();
    const [i1, i2] = [await inquiry(1), await inquiry(2)];
    await prisma.inquiry.update({ where: { id: i2.id }, data: { status: 'IN_PROGRESS' } });
    const res = expectStatus(await staff.agent.post('/api/admin/bulk/inquiries/status').send({ ids: [i1.id, i2.id], status: 'DONE' }), 200).body;
    expect(res).toMatchObject({ ok: 2 });
    expect(res.previous).toEqual(expect.arrayContaining([{ id: i1.id, status: 'NEW' }, { id: i2.id, status: 'IN_PROGRESS' }]));
    expectStatus(await staff.agent.post('/api/admin/bulk/inquiries/restore-status').send({ items: res.previous }), 200);
    expect((await prisma.inquiry.findUniqueOrThrow({ where: { id: i2.id } })).status).toBe('IN_PROGRESS');

    const mail = expectStatus(await staff.agent.post('/api/admin/bulk/inquiries/message').send({ ids: [i1.id, 'missing'], subject: 'Hallo {{contactName}}', body: 'Danke, {{companyName}}.' }), 200).body;
    expect(mail).toMatchObject({ ok: 1, failed: 1 });
    expect(mail.results[1]).toMatchObject({ id: 'missing', ok: false, error: 'INQUIRY_NOT_FOUND' });
    const logs = await prisma.emailLog.findMany({ where: { to: i1.email } });
    expect(logs[0]?.subject).toBe('Hallo Kontakt 1');

    const csv = expectStatus(await staff.agent.post('/api/admin/bulk/inquiries/export').send({ ids: [i1.id] }).buffer(true), 200);
    expect(csv.text ?? String(csv.body)).toContain('Firma 1');
  });

  it('candidates: assign the active case owner, application status per vacancy, notification', async () => {
    const staff = await asStaff({ firstName: 'Aysel', lastName: 'Q' });
    const withCase = await asClient({ firstName: 'Əli' });
    const c = await createCaseVia(withCase.agent);
    const noCase = await asClient({ firstName: 'Vüsal' });

    const assign = expectStatus(await staff.agent.post('/api/admin/bulk/candidates/assign').send({ selection: { ids: [withCase.user.id, noCase.user.id] }, staffId: staff.user.id }), 200).body;
    expect(assign).toMatchObject({ ok: 1, failed: 1 });
    expect(assign.results.find((r: { id: string }) => r.id === noCase.user.id).error).toBe('NO_ACTIVE_CASE');
    expect(assign.previous).toEqual([{ id: c.id, staffId: null }]);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).assignedStaffId).toBe(staff.user.id);

    const vacancy = await prisma.vacancy.create({ data: { slug: uniq('job-'), title: { az: 'Sürücü', de: 'Fahrer', en: 'Driver', ru: 'Водитель' }, description: { az: 'x', de: 'x', en: 'x', ru: 'x' }, status: 'OPEN' } });
    await prisma.vacancyApplication.create({ data: { vacancyId: vacancy.id, userId: withCase.user.id, status: 'NEW' } });
    const st = expectStatus(await staff.agent.post('/api/admin/bulk/candidates/status').send({ selection: { ids: [withCase.user.id, noCase.user.id] }, vacancyId: vacancy.id, status: 'SHORTLISTED' }), 200).body;
    expect(st).toMatchObject({ ok: 1, failed: 1 });
    expect(st.results.find((r: { id: string }) => r.id === noCase.user.id).error).toBe('NO_APPLICATION');
    expect((await prisma.vacancyApplication.findFirstOrThrow({ where: { vacancyId: vacancy.id } })).status).toBe('SHORTLISTED');

    const msg = expectStatus(await staff.agent.post('/api/admin/bulk/candidates/message').send({ selection: { ids: [noCase.user.id] }, title: 'Salam {{firstName}}', body: 'Yeni vakansiyalar var. — {{staffName}}' }), 200).body;
    expect(msg).toMatchObject({ ok: 1 });
    const n = await prisma.notification.findFirstOrThrow({ where: { userId: noCase.user.id, type: 'STAFF_MESSAGE' } });
    expect(n).toMatchObject({ title: 'Salam Vüsal', body: 'Yeni vakansiyalar var. — Aysel Q' });

    const all = expectStatus(await staff.agent.post('/api/admin/bulk/candidates/resolve').send({ all: { hasCase: 'true' } }), 200).body;
    expect(all.ids).toEqual([withCase.user.id]);
  });

  it('candidates "all matching" with a vacancy takes the match ranking of the list', async () => {
    const staff = await asStaff();
    const tag = uniq('Rank');
    const good = await asClient({ firstName: 'Kamran' });
    const weak = await asClient({ firstName: 'Tural' });
    // The well-matching candidate registered first: by date it would come last.
    await prisma.user.update({ where: { id: good.user.id }, data: { city: tag, profession: 'Berufskraftfahrer', germanLevel: 'B1', experienceYears: 8, drivingLicence: 'CE', createdAt: new Date(Date.now() - 60_000) } });
    await prisma.user.update({ where: { id: weak.user.id }, data: { city: tag, profession: 'Aşpaz', germanLevel: null, experienceYears: 0 } });
    const vacancy = await prisma.vacancy.create({
      data: { slug: uniq('job-'), title: { az: 'Sürücü', de: 'Fahrer', en: 'Driver', ru: 'Водитель' }, description: { az: 'x', de: 'x', en: 'x', ru: 'x' }, status: 'OPEN', profession: 'Berufskraftfahrer', germanLevel: 'A2', minExperience: 2, drivingLicence: 'CE' },
    });
    const list = expectStatus(await staff.agent.get('/api/admin/candidates').query({ city: tag, vacancyId: vacancy.id }), 200).body;
    const r = expectStatus(await staff.agent.post('/api/admin/bulk/candidates/resolve').send({ all: { city: tag, vacancyId: vacancy.id } }), 200).body;
    expect(list.items.map((i: { id: string }) => i.id)).toEqual([good.user.id, weak.user.id]);
    expect(r.ids).toEqual([good.user.id, weak.user.id]);
    expect((await staff.agent.post('/api/admin/bulk/candidates/resolve').send({ all: { city: tag, vacancyId: 'missing' } })).status).toBe(400);
  });
});

// ─── Review queue ──────────────────────────────────────────────────────

describe('fast review queue', () => {
  it('lists pending uploads oldest first with requirement, checklist and AI findings; filters', async () => {
    const staff = await asStaff();
    const client = await asClient({ firstName: 'Əli', lastName: 'Məmmədov' });
    const c = await createCaseVia(client.agent);
    const reqs = (await clientCase(client.agent, c.id)).requirements.filter((r) => r.stage === 'INITIAL');
    const d1 = expectStatus(await uploadDoc(client.agent, c.id, reqs[0].id, 'pass.pdf'), 201).body.document;
    const d2 = expectStatus(await uploadDoc(client.agent, c.id, reqs[1].id, 'diplom.pdf'), 201).body.document;
    await prisma.documentInsight.upsert({
      where: { documentId: d1.id },
      create: { documentId: d1.id, caseId: c.id, sha256: 'a'.repeat(64), docType: 'PASSPORT', fields: {}, status: 'PROPOSED', flags: ['NAME_MISMATCH', 'EXPIRED'], qualityLevel: 'BAD', quality: { level: 'BAD', reasons: [{ code: 'BLURRY', level: 'BAD' }] }, proposals: { actions: [], currentName: 'pass.pdf', holder: { found: 'X Y', expected: 'Əli Məmmədov' } } },
      update: { flags: ['NAME_MISMATCH', 'EXPIRED'], qualityLevel: 'BAD', quality: { level: 'BAD', reasons: [{ code: 'BLURRY', level: 'BAD' }] }, proposals: { actions: [], currentName: 'pass.pdf', holder: { found: 'X Y', expected: 'Əli Məmmədov' } }, status: 'PROPOSED' },
    });

    const q = expectStatus(await staff.agent.get('/api/admin/review/queue'), 200).body;
    expect(q.items.map((i: { id: string }) => i.id)).toEqual([d1.id, d2.id]);
    expect(q.counts).toEqual({ all: 2, mine: 0 });
    const first = q.items[0];
    expect(first.requirement.id).toBe(reqs[0].id);
    expect(first.case).toMatchObject({ id: c.id, number: c.number, client: { firstName: 'Əli' } });
    expect(first.insight).toMatchObject({ flags: ['NAME_MISMATCH', 'EXPIRED'], qualityLevel: 'BAD', proposals: { holder: { found: 'X Y' } } });
    expect(first.checklist.find((r: { id: string }) => r.id === reqs[0].id).state).toBe('PENDING');
    expect(first.checklist.every((r: { stage: string }) => r.stage === 'INITIAL')).toBe(true);

    expect(expectStatus(await staff.agent.get('/api/admin/review/queue?scope=mine'), 200).body.items).toEqual([]);
    await prisma.case.update({ where: { id: c.id }, data: { assignedStaffId: staff.user.id } });
    expect(expectStatus(await staff.agent.get('/api/admin/review/queue?scope=mine'), 200).body.items).toHaveLength(2);
    expect(expectStatus(await staff.agent.get('/api/admin/review/queue?visaType=STUDY'), 200).body.items).toEqual([]);
    expect(expectStatus(await staff.agent.get(`/api/admin/review/queue?caseId=${c.id}`), 200).body.items).toHaveLength(2);
    expect(expectStatus(await staff.agent.get('/api/admin/review/queue?partnerId=none'), 200).body.items).toHaveLength(2);
    expect((await staff.agent.get('/api/admin/review/queue?visaType=BOGUS')).status).toBe(400);

    // A decision through the existing endpoint takes the document out of the queue; the checklist follows.
    expectStatus(await staff.agent.post(`/api/admin/cases/${c.id}/documents/${d1.id}/review`).send({ status: 'ACCEPTED' }), 200);
    const after = expectStatus(await staff.agent.get('/api/admin/review/queue'), 200).body;
    expect(after.items.map((i: { id: string }) => i.id)).toEqual([d2.id]);
    expect(after.items[0].checklist.find((r: { id: string }) => r.id === reqs[0].id).state).toBe('ACCEPTED');
    // "undo" of a decision = back to PENDING (the client UI normally never sends it: delayed commit)
    expectStatus(await staff.agent.post(`/api/admin/cases/${c.id}/documents/${d1.id}/review`).send({ status: 'PENDING' }), 200);
    expect(expectStatus(await staff.agent.get('/api/admin/review/queue'), 200).body.total).toBe(2);

    const cl = await asClient();
    expect((await cl.agent.get('/api/admin/review/queue')).status).toBe(403);
    expect((await adminCase(staff.agent, c.id)).id).toBe(c.id);
  });

  it('leaves closed cases out', async () => {
    const staff = await asStaff();
    const client = await asClient();
    const c = await createCaseVia(client.agent);
    const reqs = (await clientCase(client.agent, c.id)).requirements;
    expectStatus(await uploadDoc(client.agent, c.id, reqs[0].id), 201);
    await prisma.case.update({ where: { id: c.id }, data: { status: 'CANCELLED' } });
    expect(expectStatus(await staff.agent.get('/api/admin/review/queue'), 200).body).toMatchObject({ total: 0, counts: { all: 0 } });
  });
});
