import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createCaseVia } from '../helpers/workflow';
import { WHATS_NEW_ENTRIES } from '../../src/lib/whatsNew/entries.js';
import { resetTrainingCache } from '../../src/lib/staffOnboarding/service.js';

/**
 * Staff onboarding & owner setup: "Yeniliklər" feed (role filter, seen per user, admin entries, hiding),
 * new staff training checklist (request + database detection, manual ticks, team view) and the owner setup
 * checklist (ADMIN+, auto detection, manual marks).
 */

/** The tracker writes after the response is sent: wait until the task shows up. */
const waitFor = async (check: () => Promise<boolean>) => {
  for (let i = 0; i < 40; i++) {
    if (await check()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
};

/** Entries dated long before an account count as seen: date the test accounts back so CI runs on any day. */
const backdate = (userId: string) => prisma.user.update({ where: { id: userId }, data: { createdAt: new Date('2026-11-10T08:00:00Z') } });

describe("what's new", () => {
  it('shows staff the entries for their role, marks them seen per user', async () => {
    const staff = await asStaff();
    await backdate(staff.user.id);
    const feed = (await staff.agent.get('/api/admin/whats-new').expect(200)).body;
    const ids = feed.items.map((i: { id: string }) => i.id);
    expect(ids).toContain('2026-11-upload-links');
    expect(ids).not.toContain('2026-11-data-freshness'); // ADMIN+ entry
    expect(feed.unseen).toBeGreaterThan(0);
    expect(feed.modal.length).toBeGreaterThan(0);

    const after = (await staff.agent.post('/api/admin/whats-new/seen').send({ ids: ['2026-11-upload-links', '2026-11-data-freshness'] }).expect(200)).body;
    expect(after.unseen).toBe(feed.unseen - 1);
    expect(await prisma.whatsNewSeen.count({ where: { userId: staff.user.id } })).toBe(1); // not-visible id ignored

    // another user is unaffected
    const other = await asStaff();
    await backdate(other.user.id);
    expect((await other.agent.get('/api/admin/whats-new').expect(200)).body.unseen).toBe(feed.unseen);

    const all = (await staff.agent.post('/api/admin/whats-new/seen').send({ all: true }).expect(200)).body;
    expect(all.unseen).toBe(0);
    expect(all.modal).toEqual([]);
  });

  it('is staff-only; entries are managed by ADMIN+', async () => {
    const client = await asClient();
    await client.agent.get('/api/admin/whats-new').expect(403);
    const staff = await asStaff();
    await staff.agent.get('/api/admin/whats-new/manage').expect(403);
    await staff.agent.post('/api/admin/whats-new/entries').send({ title: { az: 'x' }, body: { az: 'y' }, roles: ['STAFF'] }).expect(403);

    const admin = await asAdmin();
    await backdate(staff.user.id);
    await backdate(admin.user.id);
    const created = (
      await admin.agent
        .post('/api/admin/whats-new/entries')
        .send({ date: '2026-11-25', title: { az: 'Yeni qayda', en: 'New rule' }, body: { az: 'Qısa mətn.' }, roles: ['STAFF'], link: '/admin/rule-changes' })
        .expect(201)
    ).body.entry;
    await admin.agent.post('/api/admin/whats-new/entries').send({ title: { az: 'x' }, body: { az: 'y' }, roles: ['STAFF'], link: 'https://example.com' }).expect(400);

    const staffFeed = (await staff.agent.get('/api/admin/whats-new').expect(200)).body;
    const mine = staffFeed.items.find((i: { id: string }) => i.id === created.id);
    expect(mine).toMatchObject({ source: 'custom', seen: false, link: '/admin/rule-changes', title: { az: 'Yeni qayda' } });
    // STAFF-only entry: not in the admin's own feed
    expect((await admin.agent.get('/api/admin/whats-new').expect(200)).body.items.some((i: { id: string }) => i.id === created.id)).toBe(false);

    await admin.agent.patch(`/api/admin/whats-new/entries/${created.id}`).send({ roles: ['STAFF', 'ADMIN'] }).expect(200);
    expect((await admin.agent.get('/api/admin/whats-new').expect(200)).body.items.some((i: { id: string }) => i.id === created.id)).toBe(true);

    // hide a code entry, then show it again
    const codeId = WHATS_NEW_ENTRIES.find((e) => e.roles.includes('STAFF'))!.id;
    await admin.agent.post(`/api/admin/whats-new/entries/${codeId}/hidden`).send({ hidden: true }).expect(200);
    expect((await staff.agent.get('/api/admin/whats-new').expect(200)).body.items.some((i: { id: string }) => i.id === codeId)).toBe(false);
    const manage = (await admin.agent.get('/api/admin/whats-new/manage').expect(200)).body.entries;
    expect(manage.find((e: { id: string }) => e.id === codeId).hidden).toBe(true);
    await admin.agent.post(`/api/admin/whats-new/entries/${codeId}/hidden`).send({ hidden: false }).expect(200);
    await admin.agent.post('/api/admin/whats-new/entries/nope/hidden').send({ hidden: true }).expect(404);

    await admin.agent.delete(`/api/admin/whats-new/entries/${created.id}`).expect(200);
    await admin.agent.delete(`/api/admin/whats-new/entries/${created.id}`).expect(404);
    expect(await prisma.auditLog.count({ where: { action: 'WHATS_NEW_ENTRY_CREATED', target: `whats-new:${created.id}` } })).toBe(1);
  });
});

describe('training checklist', () => {
  it('detects tasks from requests and the database, supports manual ticks', async () => {
    resetTrainingCache();
    const staff = await asStaff();
    const start = (await staff.agent.get('/api/admin/training-checklist/me').expect(200)).body;
    expect(start).toMatchObject({ done: 0, total: 10, complete: false });
    expect(start.tasks[0].title.az).toBeTruthy();

    // three KB articles → done
    const articles = await Promise.all([1, 2, 3].map((n) => prisma.kbArticle.create({ data: { title: `Article ${n}`, body: 'Text', published: true } })));
    for (const a of articles.slice(0, 2)) await staff.agent.get(`/api/admin/ops/kb/articles/${a.id}`).expect(200);
    const state = async () => (await staff.agent.get('/api/admin/training-checklist/me').expect(200)).body.tasks.find((t: { id: string }) => t.id === 'kbArticles');
    expect(await waitFor(async () => (await state()).count === 2)).toBe(true);
    expect((await state()).done).toBe(false);
    await staff.agent.get(`/api/admin/ops/kb/articles/${articles[2].id}`).expect(200);
    expect(await waitFor(async () => (await state()).done === true)).toBe(true);

    // Ctrl+K search and data quality
    await staff.agent.get('/api/admin/command-search').query({ q: 'test' });
    await staff.agent.get('/api/admin/data-quality').expect(200);
    const tasksNow = async () => Object.fromEntries((await staff.agent.get('/api/admin/training-checklist/me').expect(200)).body.tasks.map((t: { id: string; done: boolean }) => [t.id, t.done]));
    expect(await waitFor(async () => (await tasksNow()).dataQuality === true)).toBe(true);

    // a task created by the user (database detection)
    await prisma.task.create({ data: { number: 900000 + Math.floor(Math.random() * 99999), title: 'Practice', createdById: staff.user.id } });
    expect((await tasksNow()).createTask).toBe(true);

    // manual tick / untick
    const ticked = (await staff.agent.post('/api/admin/training-checklist/me/embassyPackage').send({ done: true }).expect(200)).body;
    expect(ticked.tasks.find((t: { id: string }) => t.id === 'embassyPackage')).toMatchObject({ done: true, manual: true, auto: false });
    const unticked = (await staff.agent.post('/api/admin/training-checklist/me/embassyPackage').send({ done: false }).expect(200)).body;
    expect(unticked.tasks.find((t: { id: string }) => t.id === 'embassyPackage').done).toBe(false);
    await staff.agent.post('/api/admin/training-checklist/me/nope').send({ done: true }).expect(404);
  });

  it('records an opened case and an internal note for an admin', async () => {
    resetTrainingCache();
    const client = await asClient();
    const c = await createCaseVia(client.agent);
    const admin = await asAdmin();
    await admin.agent.get(`/api/admin/cases/${c.id}`).expect(200);
    await prisma.caseEvent.create({ data: { caseId: c.id, type: 'INTERNAL_NOTE', note: 'practice', actorId: admin.user.id, visibleToClient: false } });
    const done = async () => Object.fromEntries((await admin.agent.get('/api/admin/training-checklist/me').expect(200)).body.tasks.map((t: { id: string; done: boolean }) => [t.id, t.done]));
    expect(await waitFor(async () => (await done()).openCase === true)).toBe(true);
    expect((await done()).addNote).toBe(true);
  });

  it('team progress is ADMIN+', async () => {
    const staff = await asStaff();
    await staff.agent.get('/api/admin/training-checklist/team').expect(403);
    const admin = await asAdmin();
    const team = (await admin.agent.get('/api/admin/training-checklist/team').expect(200)).body.members;
    const row = team.find((m: { id: string }) => m.id === staff.user.id);
    expect(row).toMatchObject({ total: 10, done: 0, complete: false });
    expect(row.open).toHaveLength(10);
  });
});

describe('owner setup checklist', () => {
  it('is ADMIN+, detects auto items and stores manual marks', async () => {
    const staff = await asStaff();
    await staff.agent.get('/api/admin/setup-checklist').expect(403);

    await prisma.ownerSetupMark.deleteMany();
    await prisma.tvDisplayToken.deleteMany();
    const admin = await asAdmin();
    const first = (await admin.agent.get('/api/admin/setup-checklist').expect(200)).body;
    const item = (body: { items: { id: string }[] }, id: string) => body.items.find((i) => i.id === id) as unknown as { state: string; kind: string; detail: unknown };
    expect(item(first, 'tvToken').state).toBe('open');
    expect(item(first, 'homeStat')).toMatchObject({ state: 'open', kind: 'manual' });

    await prisma.tvDisplayToken.create({ data: { name: 'Office', tokenHash: crypto.randomBytes(32).toString('hex'), tokenPrefix: 'abc123' } });
    const withTv = (await admin.agent.get('/api/admin/setup-checklist').expect(200)).body;
    expect(item(withTv, 'tvToken').state).toBe('done');
    expect(withTv.percent).toBeGreaterThan(first.percent);

    const marked = (await admin.agent.post('/api/admin/setup-checklist/homeStat').send({ state: 'done', note: 'checked: 120' }).expect(200)).body;
    expect(item(marked, 'homeStat').state).toBe('done');
    await admin.agent.post('/api/admin/setup-checklist/pastPlacements').send({ state: 'done' }).expect(400); // auto item
    const skipped = (await admin.agent.post('/api/admin/setup-checklist/pastPlacements').send({ state: 'notNeeded' }).expect(200)).body;
    expect(item(skipped, 'pastPlacements').state).toBe('notNeeded');
    const cleared = (await admin.agent.post('/api/admin/setup-checklist/homeStat').send({ state: null }).expect(200)).body;
    expect(item(cleared, 'homeStat').state).toBe('open');
    await admin.agent.post('/api/admin/setup-checklist/nope').send({ state: 'done' }).expect(404);
    expect(await prisma.auditLog.count({ where: { action: 'OWNER_SETUP_MARKED', target: 'setup-checklist:homeStat' } })).toBe(2);
  });
});
