import { describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createStaff } from '../helpers/factories';
import { subscribe, type RealtimeEvent } from '../../src/lib/messaging/realtime.js';
import { runWorkspaceJobs } from '../../src/jobs/workspace.js';

const notes = (userId: string, type?: string) => prisma.notification.findMany({ where: { userId, ...(type ? { type } : {}) }, orderBy: { createdAt: 'asc' } });

/** Collects realtime events for a user (simulates an open SSE stream, which also marks them online). */
const listen = (userId: string) => {
  const events: RealtimeEvent[] = [];
  const stop = subscribe(userId, (ev) => events.push(ev));
  return { events, stop };
};

describe('workspace: access', () => {
  it('requires a staff session', async () => {
    expect((await anon().get('/api/workspace/presence')).status).toBe(401);
    const client = await asClient();
    expect((await client.agent.get('/api/workspace/home')).status).toBe(403);
  });
});

describe('workspace: presence and status', () => {
  it('lists every staff member with online flag, last seen, status and leave; status updates are published', async () => {
    const me = await asStaff({ firstName: 'Kamran', lastName: 'Aliyev' });
    const other = await asStaff({ firstName: 'Leyla', lastName: 'Huseynova' });
    await asClient();
    const away = await createStaff({ firstName: 'Away' });
    await prisma.leaveRequest.create({
      data: { userId: away.user.id, type: 'VACATION', status: 'APPROVED', startsAt: new Date(Date.now() - 86_400_000), endsAt: new Date(Date.now() + 86_400_000) },
    });
    const sub = listen(other.user.id);
    const mine = listen(me.user.id);

    // Touch a session so lastSeenAt exists for `me`.
    await me.agent.get('/api/auth/me');
    const res = await me.agent.get('/api/workspace/presence');
    expect(res.status).toBe(200);
    const people = res.body.people as { id: string; online: boolean; lastSeenAt: string | null; onLeave: { type: string } | null; role: string }[];
    expect(people).toHaveLength(3);
    const meRow = people.find((p) => p.id === me.user.id)!;
    const otherRow = people.find((p) => p.id === other.user.id)!;
    const awayRow = people.find((p) => p.id === away.user.id)!;
    expect(meRow).toMatchObject({ online: true, role: 'STAFF', statusText: null, onLeave: null });
    expect(meRow.lastSeenAt).toBeTruthy();
    expect(otherRow.online).toBe(true);
    expect(awayRow).toMatchObject({ online: false, onLeave: { type: 'VACATION' } });

    const until = new Date(Date.now() + 3600_000).toISOString();
    const set = await me.agent.put('/api/workspace/status').send({ statusText: ' In a meeting ', statusEmoji: '📞', statusUntil: until });
    expect(set.status).toBe(200);
    expect(set.body.status).toEqual({ userId: me.user.id, statusText: 'In a meeting', statusEmoji: '📞', statusUntil: until });
    expect(sub.events.map((e) => e.type)).toEqual(['presence.updated']);
    expect(sub.events[0].payload).toMatchObject({ userId: me.user.id, statusText: 'In a meeting' });
    expect(mine.events.map((e) => e.type)).toEqual(['presence.updated']);

    const after = await other.agent.get('/api/workspace/presence');
    expect(after.body.people.find((p: { id: string }) => p.id === me.user.id)).toMatchObject({ statusText: 'In a meeting', statusEmoji: '📞', statusUntil: until });

    // An expired status is hidden; clearing the text also drops the expiry.
    await prisma.user.update({ where: { id: me.user.id }, data: { statusUntil: new Date(Date.now() - 1000) } });
    expect((await other.agent.get('/api/workspace/presence')).body.people.find((p: { id: string }) => p.id === me.user.id).statusText).toBeNull();
    const cleared = await me.agent.put('/api/workspace/status').send({ statusText: null, statusEmoji: null });
    expect(cleared.body.status).toEqual({ userId: me.user.id, statusText: null, statusEmoji: null, statusUntil: null });
    sub.stop();
    mine.stop();
  });
});

describe('workspace: leave requests', () => {
  it('creates requests (dates as days), rejects overlaps with 409, notifies admins, lists own only for staff', async () => {
    const staff = await asStaff({ firstName: 'Kamran', lastName: 'Aliyev' });
    const admin = await asAdmin({ locale: 'de' });
    const other = await asStaff();

    const res = await staff.agent.post('/api/workspace/leave').send({ type: 'VACATION', startsAt: '2030-06-03', endsAt: '2030-06-07', note: 'Beach' });
    expect(res.status).toBe(201);
    expect(res.body.leave).toMatchObject({ type: 'VACATION', status: 'PENDING', days: 5, note: 'Beach', user: { id: staff.user.id, firstName: 'Kamran' } });
    expect(res.body.leave.startsAt).toBe('2030-06-03T00:00:00.000Z');
    expect(res.body.leave.endsAt).toBe('2030-06-07T23:59:59.999Z');

    // Overlap (same user) → 409; another user may take the same days.
    const clash = await staff.agent.post('/api/workspace/leave').send({ type: 'REMOTE', startsAt: '2030-06-07', endsAt: '2030-06-10' });
    expect(clash.status).toBe(409);
    expect(clash.body.error).toBe('LEAVE_OVERLAP');
    expect((await other.agent.post('/api/workspace/leave').send({ type: 'REMOTE', startsAt: '2030-06-07', endsAt: '2030-06-10' })).status).toBe(201);
    expect((await staff.agent.post('/api/workspace/leave').send({ type: 'SICK', startsAt: '2030-06-10', endsAt: '2030-06-09' })).status).toBe(400);
    expect((await staff.agent.post('/api/workspace/leave').send({ type: 'SICK', startsAt: 'yesterday', endsAt: '2030-06-09' })).status).toBe(400);

    // Admins are notified in their language; the requester is not.
    const [n] = await notes(admin.user.id, 'LEAVE_REQUESTED');
    expect(n.title).toBe('Neuer Abwesenheitsantrag: Kamran Aliyev');
    expect(n.body).toContain('Urlaub, 03.06.2030 – 07.06.2030');
    expect(n.body).toContain('Notiz: Beach');
    expect(await notes(staff.user.id)).toHaveLength(0);

    // Staff see their own; admins see everyone and can filter by user / status.
    expect((await staff.agent.get('/api/workspace/leave')).body.items.map((l: { id: string }) => l.id)).toEqual([res.body.leave.id]);
    expect((await admin.agent.get('/api/workspace/leave')).body.items).toHaveLength(2);
    expect((await admin.agent.get(`/api/workspace/leave?userId=${other.user.id}`)).body.items).toHaveLength(1);
    expect((await admin.agent.get('/api/workspace/leave?status=APPROVED')).body.items).toHaveLength(0);
    expect((await staff.agent.get('/api/workspace/leave?from=2030-07-01')).body.items).toHaveLength(0);
  });

  it('edits only while pending, cancels, approves and rejects with notifications; calendar and balance', async () => {
    const staff = await asStaff({ locale: 'ru', firstName: 'Kamran', lastName: 'Aliyev' });
    const admin = await asAdmin({ firstName: 'Admin', lastName: 'One' });
    const other = await asStaff();
    const year = new Date().getUTCFullYear() + 1;
    const d = (m: number, day: number) => `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    const a = (await staff.agent.post('/api/workspace/leave').send({ type: 'VACATION', startsAt: d(3, 2), endsAt: d(3, 6) })).body.leave;
    const b = (await staff.agent.post('/api/workspace/leave').send({ type: 'SICK', startsAt: d(4, 1), endsAt: d(4, 1) })).body.leave;
    const c = (await staff.agent.post('/api/workspace/leave').send({ type: 'REMOTE', startsAt: d(5, 1), endsAt: d(5, 2) })).body.leave;

    // Edit (own, pending) — overlap check excludes itself; others cannot touch it.
    const edited = await staff.agent.patch(`/api/workspace/leave/${a.id}`).send({ endsAt: d(3, 9), note: 'longer' });
    expect(edited.status).toBe(200);
    expect(edited.body.leave.note).toBe('longer');
    expect((await other.agent.patch(`/api/workspace/leave/${a.id}`).send({ note: 'x' })).status).toBe(404);
    expect((await admin.agent.patch(`/api/workspace/leave/${a.id}`).send({ note: 'x' })).status).toBe(403);

    // Staff cannot approve; admins can, the requester is notified in Russian.
    expect((await staff.agent.post(`/api/workspace/leave/${a.id}/approve`)).status).toBe(403);
    const sub = listen(staff.user.id);
    const approved = await admin.agent.post(`/api/workspace/leave/${a.id}/approve`).send({ decisionNote: 'Enjoy' });
    expect(approved.status).toBe(200);
    expect(approved.body.leave).toMatchObject({ status: 'APPROVED', decisionNote: 'Enjoy', decidedBy: { id: admin.user.id } });
    expect((await admin.agent.post(`/api/workspace/leave/${a.id}/approve`)).status).toBe(409);
    const rejected = await admin.agent.post(`/api/workspace/leave/${b.id}/reject`).send({ decisionNote: 'No' });
    expect(rejected.body.leave.status).toBe('REJECTED');
    const ns = await notes(staff.user.id);
    expect(ns.map((n) => n.type)).toEqual(['LEAVE_APPROVED', 'LEAVE_REJECTED']);
    expect(ns[0].title).toBe('Ваша заявка одобрена: Отпуск');
    expect(ns[0].body).toContain('Admin One');
    expect(ns[1].body).toContain('Причина: No');
    expect(sub.events.map((e) => e.type)).toContain('leave.updated');
    sub.stop();

    // Approved requests cannot be edited any more; cancel works for pending and approved.
    expect((await staff.agent.patch(`/api/workspace/leave/${a.id}`).send({ note: 'x' })).status).toBe(409);
    expect((await staff.agent.post(`/api/workspace/leave/${c.id}/cancel`)).body.leave.status).toBe('CANCELLED');
    expect((await staff.agent.post(`/api/workspace/leave/${b.id}/cancel`)).status).toBe(409);

    // Calendar: approved leave of everyone in the range (a: Mar 2–9 approved).
    const cal = await other.agent.get(`/api/workspace/leave/calendar?from=${d(3, 1)}&to=${d(3, 31)}`);
    expect(cal.body.items.map((l: { id: string }) => l.id)).toEqual([a.id]);
    expect((await other.agent.get(`/api/workspace/leave/calendar?from=${d(6, 1)}&to=${d(6, 30)}`)).body.items).toEqual([]);

    // Balance counts weekdays of the current year only.
    const now = new Date();
    const thisYear = now.getUTCFullYear();
    await prisma.leaveRequest.create({
      data: { userId: staff.user.id, type: 'VACATION', status: 'APPROVED', startsAt: new Date(Date.UTC(thisYear, 0, 5)), endsAt: new Date(Date.UTC(thisYear, 0, 11, 23, 59, 59)) },
    });
    const bal = await staff.agent.get('/api/workspace/leave/balance');
    expect(bal.body.year).toBe(thisYear);
    expect(bal.body.used.VACATION).toBe(5);
    expect(bal.body.used.SICK).toBe(0);
    expect((await admin.agent.get(`/api/workspace/leave/balance?userId=${staff.user.id}`)).body.used.VACATION).toBe(5);
  });
});

describe('workspace: announcements', () => {
  it('only admins write; staff get notified and see read flags; expired ones disappear', async () => {
    const admin = await asAdmin({ firstName: 'Admin', lastName: 'One' });
    const staff = await asStaff({ locale: 'en' });
    const sub = listen(staff.user.id);
    expect((await staff.agent.post('/api/workspace/announcements').send({ title: 'x', body: 'y' })).status).toBe(403);

    const res = await admin.agent.post('/api/workspace/announcements').send({ title: 'Office closed', body: '# Friday\n\nThe office is **closed** on Friday.', pinned: true });
    expect(res.status).toBe(201);
    expect(res.body.announcement).toMatchObject({ title: 'Office closed', pinned: true, read: true, readCount: 1, author: { id: admin.user.id } });
    const second = (await admin.agent.post('/api/workspace/announcements').send({ title: 'Second', body: 'Plain' })).body.announcement;
    const expired = (await admin.agent.post('/api/workspace/announcements').send({ title: 'Old', body: 'Gone', expiresAt: new Date(Date.now() - 1000).toISOString() })).body.announcement;

    const [n] = await notes(staff.user.id, 'ANNOUNCEMENT');
    expect(n.title).toBe('Announcement: Office closed');
    expect(n.body).toContain('Friday The office is closed on Friday.');
    expect(n.link).toBe(`/workspace/home?announcement=${res.body.announcement.id}`);
    expect(await notes(admin.user.id)).toHaveLength(0);
    expect(sub.events.filter((e) => e.type === 'announcement.new')).toHaveLength(3);
    sub.stop();

    const list = await staff.agent.get('/api/workspace/announcements');
    expect(list.body.items.map((a: { id: string; read: boolean; readCount?: number }) => [a.id, a.read, a.readCount])).toEqual([
      [res.body.announcement.id, false, undefined],
      [second.id, false, undefined],
    ]);
    expect((await admin.agent.get('/api/workspace/announcements?all=1')).body.items.map((a: { id: string }) => a.id)).toEqual([res.body.announcement.id, expired.id, second.id]);
    // all=1 is ignored for staff.
    expect((await staff.agent.get('/api/workspace/announcements?all=1')).body.items).toHaveLength(2);

    expect((await staff.agent.post(`/api/workspace/announcements/${second.id}/read`)).status).toBe(200);
    expect((await staff.agent.post(`/api/workspace/announcements/${second.id}/read`)).status).toBe(200);
    const adminView = await admin.agent.get('/api/workspace/announcements');
    expect(adminView.body.items.find((a: { id: string }) => a.id === second.id)).toMatchObject({ readCount: 2 });

    const patched = await admin.agent.patch(`/api/workspace/announcements/${second.id}`).send({ pinned: true, title: 'Second!' });
    expect(patched.body.announcement).toMatchObject({ title: 'Second!', pinned: true });
    expect((await staff.agent.patch(`/api/workspace/announcements/${second.id}`).send({ title: 'x' })).status).toBe(403);
    expect((await staff.agent.delete(`/api/workspace/announcements/${second.id}`)).status).toBe(403);
    expect((await admin.agent.delete(`/api/workspace/announcements/${second.id}`)).status).toBe(200);
    expect((await admin.agent.delete(`/api/workspace/announcements/${second.id}`)).status).toBe(404);
    expect((await staff.agent.post('/api/workspace/announcements/missing/read')).status).toBe(404);
  });
});

describe('workspace: notes', () => {
  it('personal CRUD with colours, pinning and reorder; nobody else sees them', async () => {
    const me = await asStaff();
    const other = await asStaff();
    const a = (await me.agent.post('/api/workspace/notes').send({ body: 'Call embassy', color: 'green' })).body.note;
    const b = (await me.agent.post('/api/workspace/notes').send({ title: 'Ideas', body: '' })).body.note;
    const c = (await me.agent.post('/api/workspace/notes').send({ body: 'Third', color: 'pink', pinned: true })).body.note;
    expect(a).toMatchObject({ body: 'Call embassy', color: 'green', pinned: false, title: null });
    expect(b.color).toBe('yellow');
    expect((await me.agent.post('/api/workspace/notes').send({ body: 'x', color: 'orange' })).status).toBe(400);

    // Newest first, pinned on top.
    const list = await me.agent.get('/api/workspace/notes');
    expect(list.body.items.map((n: { id: string }) => n.id)).toEqual([c.id, b.id, a.id]);
    expect((await other.agent.get('/api/workspace/notes')).body.items).toEqual([]);

    const upd = await me.agent.patch(`/api/workspace/notes/${a.id}`).send({ body: 'Call embassy today', color: 'blue', title: ' T ' });
    expect(upd.body.note).toMatchObject({ body: 'Call embassy today', color: 'blue', title: 'T' });
    expect((await other.agent.patch(`/api/workspace/notes/${a.id}`).send({ body: 'hack' })).status).toBe(404);
    expect((await other.agent.delete(`/api/workspace/notes/${a.id}`)).status).toBe(404);

    const reordered = await me.agent.post('/api/workspace/notes/reorder').send({ ids: [a.id, b.id, 'not-mine', c.id] });
    expect(reordered.status).toBe(200);
    // Pinned stays first, then the requested order.
    expect(reordered.body.items.map((n: { id: string }) => n.id)).toEqual([c.id, a.id, b.id]);
    await me.agent.patch(`/api/workspace/notes/${c.id}`).send({ pinned: false });
    expect((await me.agent.get('/api/workspace/notes')).body.items.map((n: { id: string }) => n.id)).toEqual([a.id, b.id, c.id]);

    expect((await me.agent.delete(`/api/workspace/notes/${a.id}`)).status).toBe(200);
    expect((await me.agent.get('/api/workspace/notes')).body.items).toHaveLength(2);
  });
});

describe('workspace: polls', () => {
  it('single-choice: a vote replaces the previous one and toggles off; results show voters', async () => {
    const author = await asStaff({ firstName: 'Kamran', lastName: 'Aliyev' });
    const voter = await asStaff({ firstName: 'Leyla', lastName: 'Huseynova' });
    const res = await author.agent.post('/api/workspace/polls').send({ question: 'Lunch?', options: ['Pizza', 'Sushi', 'Pizza '] });
    expect(res.status).toBe(201);
    const poll = res.body.poll;
    expect(poll).toMatchObject({ question: 'Lunch?', multiple: false, anonymous: false, open: true, closedAt: null, channelId: null, totalVotes: 0, voterCount: 0, myVotes: [], canClose: true, canDelete: true });
    expect(poll.options.map((o: { text: string; count: number; mine: boolean; voters: unknown[] }) => [o.text, o.count, o.mine, o.voters])).toEqual([
      ['Pizza', 0, false, []],
      ['Sushi', 0, false, []],
    ]);
    expect((await author.agent.post('/api/workspace/polls').send({ question: 'x', options: ['a', 'a'] })).status).toBe(400);
    expect((await author.agent.post('/api/workspace/polls').send({ question: 'x', options: ['a', 'b'], closesAt: '2000-01-01T00:00:00Z' })).status).toBe(400);
    const [pizza, sushi] = poll.options.map((o: { id: string }) => o.id);

    let v = await voter.agent.post(`/api/workspace/polls/${poll.id}/vote`).send({ optionIds: [pizza] });
    expect(v.status).toBe(200);
    expect(v.body.poll.myVotes).toEqual([pizza]);
    expect(v.body.poll.options[0]).toMatchObject({ count: 1, mine: true, voters: [{ id: voter.user.id, firstName: 'Leyla' }] });
    v = await voter.agent.post(`/api/workspace/polls/${poll.id}/vote`).send({ optionIds: [sushi] });
    expect(v.body.poll.myVotes).toEqual([sushi]);
    expect(v.body.poll.options.map((o: { count: number }) => o.count)).toEqual([0, 1]);
    v = await voter.agent.post(`/api/workspace/polls/${poll.id}/vote`).send({ optionIds: [sushi] });
    expect(v.body.poll.myVotes).toEqual([]);
    expect(v.body.poll.totalVotes).toBe(0);
    expect((await voter.agent.post(`/api/workspace/polls/${poll.id}/vote`).send({ optionIds: ['nope'] })).status).toBe(400);

    await author.agent.post(`/api/workspace/polls/${poll.id}/vote`).send({ optionIds: [pizza] });
    const get = await voter.agent.get(`/api/workspace/polls/${poll.id}`);
    expect(get.body.poll).toMatchObject({ totalVotes: 1, voterCount: 1, myVotes: [], canClose: false, canDelete: false });
    expect(get.body.poll.options[0].voters).toEqual([{ id: author.user.id, firstName: 'Kamran', lastName: 'Aliyev' }]);

    // Only author / admins close or delete; a closed poll takes no votes.
    expect((await voter.agent.post(`/api/workspace/polls/${poll.id}/close`)).status).toBe(403);
    const closed = await author.agent.post(`/api/workspace/polls/${poll.id}/close`);
    expect(closed.body.poll.open).toBe(false);
    expect(closed.body.poll.closedAt).toBeTruthy();
    expect((await voter.agent.post(`/api/workspace/polls/${poll.id}/vote`).send({ optionIds: [pizza] })).status).toBe(409);
    expect((await author.agent.post(`/api/workspace/polls/${poll.id}/close`)).status).toBe(409);
    expect((await voter.agent.get('/api/workspace/polls?open=1')).body.items).toEqual([]);
    expect((await voter.agent.get('/api/workspace/polls')).body.items).toHaveLength(1);
    expect((await voter.agent.delete(`/api/workspace/polls/${poll.id}`)).status).toBe(403);
    const admin = await asAdmin();
    expect((await admin.agent.delete(`/api/workspace/polls/${poll.id}`)).status).toBe(200);
    expect((await voter.agent.get(`/api/workspace/polls/${poll.id}`)).status).toBe(404);
  });

  it('multiple-choice toggles each option; anonymous polls hide voters; the job closes expired polls', async () => {
    const author = await asStaff();
    const voter = await asStaff();
    const closesAt = new Date(Date.now() + 60_000).toISOString();
    const poll = (await author.agent.post('/api/workspace/polls').send({ question: 'Days?', options: ['Mon', 'Tue', 'Wed'], multiple: true, anonymous: true, closesAt })).body.poll;
    const [mon, tue, wed] = poll.options.map((o: { id: string }) => o.id);
    expect(poll.closesAt).toBe(closesAt);

    let v = await voter.agent.post(`/api/workspace/polls/${poll.id}/vote`).send({ optionIds: [mon, tue] });
    expect(v.body.poll.myVotes.sort()).toEqual([mon, tue].sort());
    expect(v.body.poll.options.map((o: { count: number; voters: unknown }) => [o.count, o.voters])).toEqual([
      [1, null],
      [1, null],
      [0, null],
    ]);
    v = await voter.agent.post(`/api/workspace/polls/${poll.id}/vote`).send({ optionIds: [tue, wed] });
    expect(v.body.poll.myVotes.sort()).toEqual([mon, wed].sort());
    expect(v.body.poll).toMatchObject({ totalVotes: 2, voterCount: 1 });
    // The author sees no names either.
    expect((await author.agent.get(`/api/workspace/polls/${poll.id}`)).body.poll.options[0].voters).toBeNull();

    // Job: nothing to close yet; after closesAt it is closed and listed as such.
    await runWorkspaceJobs(new Date());
    expect((await voter.agent.get(`/api/workspace/polls/${poll.id}`)).body.poll.open).toBe(true);
    await runWorkspaceJobs(new Date(Date.now() + 120_000));
    const after = await voter.agent.get(`/api/workspace/polls/${poll.id}`);
    expect(after.body.poll.open).toBe(false);
    expect(after.body.poll.closedAt).toBeTruthy();
    expect((await voter.agent.post(`/api/workspace/polls/${poll.id}/vote`).send({ optionIds: [wed] })).status).toBe(409);
  });

  it('channel polls need membership and are listed per channel', async () => {
    const author = await asStaff();
    const channel = await prisma.chatChannel.create({ data: { kind: 'PUBLIC', name: 'general', createdById: author.user.id } });
    expect((await author.agent.post('/api/workspace/polls').send({ question: 'x', options: ['a', 'b'], channelId: channel.id })).status).toBe(400);
    await prisma.chatMember.create({ data: { channelId: channel.id, userId: author.user.id } });
    const poll = (await author.agent.post('/api/workspace/polls').send({ question: 'x', options: ['a', 'b'], channelId: channel.id })).body.poll;
    expect(poll.channelId).toBe(channel.id);
    expect((await author.agent.get(`/api/workspace/polls?channelId=${channel.id}`)).body.items.map((p: { id: string }) => p.id)).toEqual([poll.id]);
    expect((await author.agent.get('/api/workspace/polls')).body.items).toEqual([]);
  });
});

describe('workspace: home aggregate', () => {
  it('bundles announcements, notes, polls, presence and leave in one call', async () => {
    const admin = await asAdmin();
    const staff = await asStaff({ firstName: 'Kamran', lastName: 'Aliyev' });
    const ann = (await admin.agent.post('/api/workspace/announcements').send({ title: 'Hello', body: 'World' })).body.announcement;
    await staff.agent.post('/api/workspace/notes').send({ body: 'Note' });
    const poll = (await admin.agent.post('/api/workspace/polls').send({ question: 'Q', options: ['a', 'b'] })).body.poll;
    await admin.agent.post('/api/workspace/polls').send({ question: 'Expired', options: ['a', 'b'], closesAt: new Date(Date.now() + 500).toISOString() });
    const leave = (await staff.agent.post('/api/workspace/leave').send({ type: 'VACATION', startsAt: '2031-01-06', endsAt: '2031-01-10' })).body.leave;
    const sub = listen(staff.user.id);

    await new Promise((r) => setTimeout(r, 600));
    const home = await staff.agent.get('/api/workspace/home');
    expect(home.status).toBe(200);
    expect(home.body.announcements.unread).toBe(1);
    expect(home.body.announcements.items.map((a: { id: string }) => a.id)).toEqual([ann.id]);
    expect(home.body.notes).toHaveLength(1);
    expect(home.body.polls.map((p: { id: string }) => p.id)).toEqual([poll.id]);
    expect(home.body.presence).toMatchObject({ total: 2, online: 1, onLeave: 0 });
    expect(home.body.presence.people).toHaveLength(2);
    expect(home.body.leave.mine.map((l: { id: string }) => l.id)).toEqual([leave.id]);
    expect(home.body.leave.pending).toEqual([]);

    const adminHome = await admin.agent.get('/api/workspace/home');
    expect(adminHome.body.leave.pending.map((l: { id: string }) => l.id)).toEqual([leave.id]);
    expect(adminHome.body.announcements.unread).toBe(0);
    sub.stop();
  });
});
