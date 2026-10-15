import { describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff, asSuperAdmin } from '../helpers/api';
import { prisma, waitFor } from '../helpers/db';
import { createClient, createStaff, uniq } from '../helpers/factories';

const notes = (userId: string, type?: string) =>
  prisma.notification.findMany({ where: { userId, ...(type ? { type } : {}) }, orderBy: { createdAt: 'asc' } });

const makeCase = async () => {
  const { user: client } = await createClient({ firstName: 'Aysel', lastName: 'Mammadova' });
  return prisma.case.create({ data: { number: uniq('TV-'), clientId: client.id, profession: 'Driver' } });
};

describe('tasks: access', () => {
  it('requires a staff session with 2FA', async () => {
    expect((await anon().get('/api/tasks')).status).toBe(401);
    const client = await asClient();
    expect((await client.agent.get('/api/tasks')).status).toBe(403);
    const noTotp = await asStaff({ twoFactor: false });
    expect((await noTotp.agent.get('/api/tasks/summary')).status).toBe(403);
  });
});

describe('tasks: create, read, number', () => {
  it('creates numbered tasks with assignees, checklist, case link and a "created" activity; notifies assignees in their language', async () => {
    const creator = await asStaff({ firstName: 'Kamran', lastName: 'Aliyev' });
    const { user: bob } = await createStaff({ locale: 'de', firstName: 'Bob' });
    const c = await makeCase();
    const dueAt = '2030-05-10T14:00:00.000Z';

    const res = await creator.agent.post('/api/tasks').send({
      title: '  Call the embassy  ',
      description: 'Line 1\nhttps://example.com',
      priority: 'HIGH',
      dueAt,
      assigneeIds: [bob.id, creator.user.id],
      caseId: c.id,
      checklist: ['Prepare docs', 'Book slot'],
    });
    expect(res.status).toBe(201);
    const t = res.body.task;
    expect(t).toMatchObject({
      number: 1,
      key: 'T-0001',
      title: 'Call the embassy',
      status: 'TODO',
      priority: 'HIGH',
      dueAt,
      case: { id: c.id, number: c.number, clientName: 'Aysel Mammadova' },
      createdBy: { id: creator.user.id },
    });
    expect(t.assignees.map((a: { id: string }) => a.id).sort()).toEqual([bob.id, creator.user.id].sort());
    expect(t.checklist.map((i: { text: string }) => i.text)).toEqual(['Prepare docs', 'Book slot']);
    expect(t.timeline).toEqual([expect.objectContaining({ kind: 'activity', activity: { type: 'created' } })]);
    expect(t.permissions).toMatchObject({ edit: true, delete: true, assign: true, status: true });

    // Bob is notified in German with a deep link; the creator (actor) is not.
    const [n] = await notes(bob.id, 'TASK_ASSIGNED');
    expect(n.title).toBe('Neue Aufgabe für Sie: T-0001');
    expect(n.link).toBe('/workspace/tasks/T-0001');
    expect(await notes(creator.user.id)).toHaveLength(0);
    await waitFor(() => prisma.emailLog.findFirst({ where: { to: bob.email } }));

    const second = await creator.agent.post('/api/tasks').send({ title: 'Second' });
    expect(second.body.task.key).toBe('T-0002');

    // GET by key, number or id
    for (const ref of ['T-0001', '1', t.id]) {
      const g = await creator.agent.get(`/api/tasks/${ref}`);
      expect(g.status).toBe(200);
      expect(g.body.task.id).toBe(t.id);
    }
    expect((await creator.agent.get('/api/tasks/T-9999')).status).toBe(404);
  });

  it('assigns unique numbers under concurrent creation', async () => {
    const s = await asStaff();
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => s.agent.post('/api/tasks').send({ title: `T${i}` })));
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(new Set(results.map((r) => r.body.task.number)).size).toBe(6);
  });

  it('validates input: title, assignees must be active staff, case must exist, start before due', async () => {
    const s = await asStaff();
    const { user: client } = await createClient();
    const { user: inactive } = await createStaff({ isActive: false });
    expect((await s.agent.post('/api/tasks').send({ title: '  ' })).status).toBe(400);
    expect((await s.agent.post('/api/tasks').send({ title: 'x'.repeat(201) })).status).toBe(400);
    expect((await s.agent.post('/api/tasks').send({ title: 'a', assigneeIds: [client.id] })).body.error).toBe('INVALID_ASSIGNEE');
    expect((await s.agent.post('/api/tasks').send({ title: 'a', assigneeIds: [inactive.id] })).body.error).toBe('INVALID_ASSIGNEE');
    expect((await s.agent.post('/api/tasks').send({ title: 'a', caseId: 'nope' })).body.error).toBe('INVALID_CASE');
    expect((await s.agent.post('/api/tasks').send({ title: 'a', dueAt: 'tomorrow' })).status).toBe(400);
    expect(
      (await s.agent.post('/api/tasks').send({ title: 'a', startAt: '2030-01-02T00:00:00Z', dueAt: '2030-01-01T00:00:00Z' })).body.error,
    ).toBe('START_AFTER_DUE');
    expect((await s.agent.post('/api/tasks').send({ title: 'a', priority: 'MEGA' })).status).toBe(400);
  });
});

describe('tasks: permissions', () => {
  it('creator and admins manage; assignees work on status/checklist; other staff can only comment or take unassigned tasks', async () => {
    const creator = await asStaff();
    const assignee = await asStaff();
    const other = await asStaff();
    const admin = await asAdmin();
    const { body } = await creator.agent.post('/api/tasks').send({ title: 'Shared', assigneeIds: [assignee.user.id] });
    const id = body.task.id;

    // assignee: status yes, edit/delete/reassign no
    expect((await assignee.agent.patch(`/api/tasks/${id}`).send({ status: 'IN_PROGRESS' })).status).toBe(200);
    expect((await assignee.agent.patch(`/api/tasks/${id}`).send({ title: 'Hacked' })).status).toBe(403);
    expect((await assignee.agent.patch(`/api/tasks/${id}`).send({ assigneeIds: [] })).status).toBe(403);
    expect((await assignee.agent.delete(`/api/tasks/${id}`)).status).toBe(403);
    expect((await assignee.agent.post(`/api/tasks/${id}/checklist`).send({ text: 'Step' })).status).toBe(201);

    // other staff: sees it, can comment, cannot move/check
    expect((await other.agent.get(`/api/tasks/${id}`)).body.task.permissions).toMatchObject({ edit: false, status: false, comment: true, take: false });
    expect((await other.agent.patch(`/api/tasks/${id}`).send({ status: 'DONE' })).status).toBe(403);
    expect((await other.agent.post(`/api/tasks/${id}/move`).send({ status: 'DONE' })).status).toBe(403);
    expect((await other.agent.post(`/api/tasks/${id}/checklist`).send({ text: 'x' })).status).toBe(403);
    expect((await other.agent.post(`/api/tasks/${id}/comments`).send({ body: 'FYI' })).status).toBe(201);
    expect((await other.agent.post(`/api/tasks/${id}/assignees`).send({ userId: other.user.id })).status).toBe(403);

    // admin manages everything
    expect((await admin.agent.patch(`/api/tasks/${id}`).send({ title: 'Renamed' })).status).toBe(200);

    // unassigned task: anyone may take it (only for themselves)
    const free = (await creator.agent.post('/api/tasks').send({ title: 'Free' })).body.task;
    expect((await other.agent.post(`/api/tasks/${free.id}/assignees`).send({ userId: assignee.user.id })).status).toBe(403);
    const take = await other.agent.post(`/api/tasks/${free.id}/assignees`).send({ userId: other.user.id });
    expect(take.status).toBe(200);
    expect(take.body.task.assignees.map((a: { id: string }) => a.id)).toEqual([other.user.id]);

    // delete by admin is audited
    expect((await admin.agent.delete(`/api/tasks/${id}`)).status).toBe(200);
    const log = await prisma.auditLog.findFirst({ where: { action: 'TASK_DELETED', target: id } });
    expect(log?.details).toMatchObject({ number: 'T-0001', title: 'Renamed' });
    expect(await prisma.taskComment.count({ where: { taskId: id } })).toBe(0);
  });
});

describe('tasks: updates, activity, notifications', () => {
  it('records status/priority/due/assignee activity, sets completedAt, audits reassignment and notifies the right people', async () => {
    const creator = await asStaff({ firstName: 'Creator' });
    const a = await asStaff({ locale: 'en', firstName: 'Ann' });
    const { user: b } = await createStaff({ locale: 'ru', firstName: 'Boris' });
    const { body } = await creator.agent.post('/api/tasks').send({ title: 'Flow', assigneeIds: [a.user.id] });
    const id = body.task.id;

    // assignee finishes: creator notified (az), assignee (actor) not
    let r = await a.agent.patch(`/api/tasks/${id}`).send({ status: 'DONE' });
    expect(r.body.task.completedAt).not.toBeNull();
    const [st] = await notes(creator.user.id, 'TASK_STATUS');
    expect(st.title).toBe('T-0001: status «Hazırdır»');
    expect(await notes(a.user.id, 'TASK_STATUS')).toHaveLength(0);

    r = await a.agent.patch(`/api/tasks/${id}`).send({ status: 'IN_PROGRESS' });
    expect(r.body.task.completedAt).toBeNull();

    // creator edits priority, due date and reassigns
    r = await creator.agent.patch(`/api/tasks/${id}`).send({ priority: 'URGENT', dueAt: '2030-01-01T10:00:00Z', assigneeIds: [b.id] });
    expect(r.status).toBe(200);
    expect(r.body.task.assignees.map((x: { id: string }) => x.id)).toEqual([b.id]);
    const types = r.body.task.timeline.filter((e: { kind: string }) => e.kind === 'activity').map((e: { activity: { type: string } }) => e.activity.type);
    expect(types).toEqual(['created', 'status', 'status', 'priority', 'due', 'assignees']);
    const assigneesEntry = r.body.task.timeline.at(-1).activity;
    expect(assigneesEntry.added).toEqual([{ id: b.id, name: 'Boris User' }]);
    expect(assigneesEntry.removed[0].id).toBe(a.user.id);
    const [ru] = await notes(b.id, 'TASK_ASSIGNED');
    expect(ru.title).toBe('Вам назначена задача: T-0001');
    expect(ru.body).toContain('Срок');
    const audit = await prisma.auditLog.findFirst({ where: { action: 'TASK_REASSIGNED', target: id } });
    expect(audit?.details).toMatchObject({ added: [b.id], removed: [a.user.id] });

    // a no-op patch writes no activity
    const before = await prisma.taskComment.count({ where: { taskId: id } });
    await creator.agent.patch(`/api/tasks/${id}`).send({ priority: 'URGENT' });
    expect(await prisma.taskComment.count({ where: { taskId: id } })).toBe(before);

    // unknown fields are rejected
    expect((await creator.agent.patch(`/api/tasks/${id}`).send({ number: 99 })).status).toBe(400);
  });

  it('comments: mentions notify the mentioned person, others get "new comment"; edit/delete rules', async () => {
    const creator = await asStaff();
    const assignee = await asStaff({ locale: 'en' });
    const mentioned = await asStaff({ locale: 'de', firstName: 'Mia', lastName: 'Klein' });
    const admin = await asAdmin();
    const { body } = await creator.agent.post('/api/tasks').send({ title: 'Talk', assigneeIds: [assignee.user.id] });
    const id = body.task.id;

    const res = await creator.agent
      .post(`/api/tasks/${id}/comments`)
      .send({ body: `Please check @[Mia Klein](user:${mentioned.user.id}) and @[Ghost](user:nobody)` });
    expect(res.status).toBe(201);
    const [m] = await notes(mentioned.user.id, 'TASK_MENTION');
    expect(m.title).toMatch(/hat Sie erwähnt \(T-0001\)/);
    expect(m.body).toContain('@Mia Klein');
    expect(m.body).not.toContain('user:');
    const [c] = await notes(assignee.user.id, 'TASK_COMMENT');
    expect(c.title).toBe('T-0001: new comment');
    expect(await notes(creator.user.id, 'TASK_COMMENT')).toHaveLength(0);

    const comment = res.body.task.timeline.find((e: { kind: string }) => e.kind === 'comment');
    expect(comment).toMatchObject({ canEdit: true, canDelete: true });
    expect((await assignee.agent.patch(`/api/tasks/${id}/comments/${comment.id}`).send({ body: 'x' })).status).toBe(403);
    expect((await assignee.agent.delete(`/api/tasks/${id}/comments/${comment.id}`)).status).toBe(403);
    expect((await admin.agent.patch(`/api/tasks/${id}/comments/${comment.id}`).send({ body: 'x' })).status).toBe(403);
    const edited = await creator.agent.patch(`/api/tasks/${id}/comments/${comment.id}`).send({ body: 'Updated' });
    expect(edited.body.task.timeline.find((e: { id: string }) => e.id === comment.id).body).toBe('Updated');
    expect((await creator.agent.post(`/api/tasks/${id}/comments`).send({ body: '   ' })).status).toBe(400);
    expect((await admin.agent.delete(`/api/tasks/${id}/comments/${comment.id}`)).status).toBe(200);
    // activity entries cannot be deleted as comments
    const act = edited.body.task.timeline.find((e: { kind: string }) => e.kind === 'activity');
    expect((await admin.agent.delete(`/api/tasks/${id}/comments/${act.id}`)).status).toBe(404);
  });

  it('checklist: add, toggle, edit, reorder, delete', async () => {
    const s = await asStaff();
    const { body } = await s.agent.post('/api/tasks').send({ title: 'List', checklist: ['A', 'B', 'C'] });
    const id = body.task.id;
    const [a, b, c] = body.task.checklist;
    let r = await s.agent.patch(`/api/tasks/${id}/checklist/${a.id}`).send({ done: true });
    expect(r.body.checklist[0]).toMatchObject({ text: 'A', done: true });
    r = await s.agent.patch(`/api/tasks/${id}/checklist/${b.id}`).send({ text: 'B2' });
    expect(r.body.checklist[1].text).toBe('B2');
    r = await s.agent.put(`/api/tasks/${id}/checklist/order`).send({ ids: [c.id, a.id, b.id] });
    expect(r.body.checklist.map((i: { text: string }) => i.text)).toEqual(['C', 'A', 'B2']);
    expect((await s.agent.put(`/api/tasks/${id}/checklist/order`).send({ ids: [c.id] })).status).toBe(400);
    r = await s.agent.delete(`/api/tasks/${id}/checklist/${c.id}`);
    expect(r.body.checklist).toHaveLength(2);
    r = await s.agent.post(`/api/tasks/${id}/checklist`).send({ text: 'D' });
    expect(r.body.checklist.at(-1).text).toBe('D');
    // item of another task
    const other = (await s.agent.post('/api/tasks').send({ title: 'Other', checklist: ['Z'] })).body.task;
    expect((await s.agent.patch(`/api/tasks/${id}/checklist/${other.checklist[0].id}`).send({ done: true })).status).toBe(404);
    const list = await s.agent.get('/api/tasks?sort=number&dir=asc');
    expect(list.body.items[0].checklist).toEqual({ done: 1, total: 3 });
  });
});

describe('tasks: board moves', () => {
  it('moves cards between columns and reorders them', async () => {
    const s = await asStaff();
    const mk = async (title: string) => (await s.agent.post('/api/tasks').send({ title })).body.task.id as string;
    const t1 = await mk('one');
    const t2 = await mk('two');
    const t3 = await mk('three');
    const column = async (status: string) =>
      (await s.agent.get(`/api/tasks?status=${status}&sort=board`)).body.items.map((i: { title: string }) => i.title);
    expect(await column('TODO')).toEqual(['three', 'two', 'one']); // newest on top

    await s.agent.post(`/api/tasks/${t1}/move`).send({ status: 'TODO', beforeId: t3 });
    expect(await column('TODO')).toEqual(['one', 'three', 'two']);
    await s.agent.post(`/api/tasks/${t1}/move`).send({ status: 'TODO', beforeId: t2 });
    expect(await column('TODO')).toEqual(['three', 'one', 'two']);

    const moved = await s.agent.post(`/api/tasks/${t2}/move`).send({ status: 'DONE', beforeId: null });
    expect(moved.body.task).toMatchObject({ status: 'DONE', key: 'T-0002' });
    expect(moved.body.task.completedAt).not.toBeNull();
    expect(await column('DONE')).toEqual(['two']);
    await s.agent.post(`/api/tasks/${t3}/move`).send({ status: 'DONE' });
    expect(await column('DONE')).toEqual(['two', 'three']);

    // force a renumber: squeeze neighbours together
    await prisma.task.update({ where: { id: t2 }, data: { sortOrder: 5 } });
    await prisma.task.update({ where: { id: t3 }, data: { sortOrder: 6 } });
    await s.agent.post(`/api/tasks/${t1}/move`).send({ status: 'DONE', beforeId: t3 });
    expect(await column('DONE')).toEqual(['two', 'one', 'three']);
    const statuses = await prisma.taskComment.count({ where: { taskId: t1, body: { contains: '"status"' } } });
    expect(statuses).toBe(1);
  });
});

describe('tasks: list filters and summary', () => {
  it('filters by assignee, status, priority, due, case, search and paginates', async () => {
    const me = await asStaff();
    const { user: other } = await createStaff();
    const c = await makeCase();
    const now = Date.now();
    const H = 3600_000;
    const post = (b: Record<string, unknown>) => me.agent.post('/api/tasks').send(b);
    await post({ title: 'Overdue mine', assigneeIds: [me.user.id], dueAt: new Date(now - 5 * H).toISOString(), priority: 'URGENT' });
    await post({ title: 'Later mine', assigneeIds: [me.user.id], dueAt: new Date(now + 30 * 24 * H).toISOString() });
    await post({ title: 'Other person', assigneeIds: [other.id], caseId: c.id, description: 'contains needle' });
    await post({ title: 'Nobody' });
    const cancelled = (await post({ title: 'Cancelled', assigneeIds: [me.user.id], dueAt: new Date(now - 5 * H).toISOString() })).body.task;
    await me.agent.patch(`/api/tasks/${cancelled.id}`).send({ status: 'CANCELLED' });

    const titles = async (qs: string) => (await me.agent.get(`/api/tasks?${qs}`)).body.items.map((i: { title: string }) => i.title).sort();
    expect(await titles('assignee=me')).toEqual(['Later mine', 'Overdue mine']);
    expect(await titles('assignee=unassigned')).toEqual(['Nobody']);
    expect(await titles(`assignee=${other.id}`)).toEqual(['Other person']);
    expect(await titles('due=overdue')).toEqual(['Overdue mine']);
    expect(await titles('due=none')).toEqual(['Nobody', 'Other person']);
    expect(await titles('priority=URGENT,HIGH')).toEqual(['Overdue mine']);
    expect(await titles(`caseId=${c.id}`)).toEqual(['Other person']);
    expect(await titles('search=needle')).toEqual(['Other person']);
    expect(await titles('search=T-0004')).toEqual(['Nobody']);
    expect(await titles('status=CANCELLED')).toEqual(['Cancelled']);
    expect(await titles('creator=me')).toHaveLength(4);
    expect((await me.agent.get('/api/tasks?status=WRONG')).status).toBe(400);

    const page = await me.agent.get('/api/tasks?pageSize=2&page=2&sort=number&dir=asc');
    expect(page.body).toMatchObject({ total: 4, page: 2, pageSize: 2 });
    expect(page.body.items.map((i: { key: string }) => i.key)).toEqual(['T-0003', 'T-0004']);

    const due = await me.agent.get('/api/tasks?sort=dueAt&dir=asc');
    expect(due.body.items.at(-1).dueAt).toBeNull(); // no date last

    const range = await me.agent.get(`/api/tasks?dueFrom=${encodeURIComponent(new Date(now - 24 * H).toISOString())}&dueTo=${encodeURIComponent(new Date(now).toISOString())}`);
    expect(range.body.items.map((i: { title: string }) => i.title)).toEqual(['Overdue mine']);

    expect((await me.agent.get('/api/tasks/summary')).body).toEqual({ open: 2, overdue: 1 });
  });

  it('due=today and due=week use the given timezone offset', async () => {
    const s = await asStaff();
    // 23:30 Baku today is "today" for a Baku browser
    const now = new Date();
    const bakuMidnight = new Date(Math.floor((now.getTime() + 4 * 3600_000) / 86_400_000) * 86_400_000 - 4 * 3600_000);
    const lateToday = new Date(bakuMidnight.getTime() + 23.5 * 3600_000);
    const tomorrow = new Date(bakuMidnight.getTime() + 26 * 3600_000);
    await s.agent.post('/api/tasks').send({ title: 'late today', dueAt: lateToday.toISOString() });
    await s.agent.post('/api/tasks').send({ title: 'tomorrow', dueAt: tomorrow.toISOString() });
    const res = await s.agent.get('/api/tasks?due=today&tzOffset=-240');
    expect(res.body.items.map((i: { title: string }) => i.title)).toEqual(['late today']);
    const week = await s.agent.get('/api/tasks?due=week&tzOffset=-240');
    expect(week.body.items.length).toBeGreaterThanOrEqual(1);
  });

  it('people and case options', async () => {
    const s = await asStaff({ firstName: 'Zed' });
    await createStaff({ isActive: false, firstName: 'Gone' });
    await createClient({ firstName: 'Clienty' });
    const sa = await asSuperAdmin({ firstName: 'Ada' });
    const people = (await s.agent.get('/api/tasks/people')).body.people.map((p: { firstName: string }) => p.firstName);
    expect(people).toEqual(['Ada', 'Zed']);
    void sa;
    const c = await makeCase();
    const opts = await s.agent.get('/api/tasks/case-options?search=Aysel');
    expect(opts.body.items).toEqual([expect.objectContaining({ id: c.id, number: c.number, clientName: 'Aysel Mammadova' })]);
    expect((await s.agent.get(`/api/tasks/case-options?search=${c.number}`)).body.items).toHaveLength(1);
  });
});

describe('tasks: case link survives case deletion', () => {
  it('unlinks the task when the case is deleted', async () => {
    const s = await asStaff();
    const c = await makeCase();
    const { body } = await s.agent.post('/api/tasks').send({ title: 'Linked', caseId: c.id });
    expect((await s.agent.get(`/api/tasks?caseId=${c.id}`)).body.total).toBe(1);
    await prisma.case.delete({ where: { id: c.id } });
    expect((await s.agent.get(`/api/tasks/${body.task.id}`)).body.task.case).toBeNull();
  });
});

describe('tasks: drive attachments', () => {
  it('links only drive nodes the user may view; shows inaccessible links as such to others', async () => {
    const owner = await asStaff();
    const other = await asStaff();
    const shared = await prisma.driveNode.create({
      data: { space: 'SHARED', kind: 'FOLDER', name: uniq('Shared '), grants: { create: { role: 'STAFF', access: 'VIEW' } } },
    });
    const sharedFile = await prisma.driveNode.create({
      data: { space: 'SHARED', kind: 'FILE', name: 'plan.pdf', parentId: shared.id, mimeType: 'application/pdf', size: 1234 },
    });
    const personal = await prisma.driveNode.create({
      data: { space: 'PERSONAL', kind: 'FILE', name: 'private.txt', ownerId: owner.user.id, mimeType: 'text/plain', size: 5 },
    });
    try {
      const { body } = await owner.agent.post('/api/tasks').send({ title: 'With files', assigneeIds: [other.user.id] });
      const id = body.task.id;
      let r = await other.agent.post(`/api/tasks/${id}/attachments`).send({ nodeId: personal.id });
      expect(r.body.error).toBe('INVALID_NODE');
      r = await other.agent.post(`/api/tasks/${id}/attachments`).send({ nodeId: sharedFile.id });
      expect(r.status).toBe(201);
      r = await owner.agent.post(`/api/tasks/${id}/attachments`).send({ nodeId: personal.id });
      expect(r.status).toBe(201);
      expect(r.body.task.attachments).toEqual([
        expect.objectContaining({ nodeId: sharedFile.id, name: 'plan.pdf', kind: 'FILE', accessible: true }),
        expect.objectContaining({ nodeId: personal.id, accessible: true }),
      ]);
      const seen = (await other.agent.get(`/api/tasks/${id}`)).body.task.attachments;
      expect(seen.find((a: { nodeId: string }) => a.nodeId === personal.id).accessible).toBe(false);
      expect((await other.agent.get('/api/tasks')).body.items[0].attachmentCount).toBe(2);

      // a third staff member (not assignee/creator) may not link files
      const third = await asStaff();
      expect((await third.agent.post(`/api/tasks/${id}/attachments`).send({ nodeId: sharedFile.id })).status).toBe(403);

      // trashed nodes disappear from the task
      await prisma.driveNode.update({ where: { id: personal.id }, data: { deletedAt: new Date() } });
      expect((await owner.agent.get(`/api/tasks/${id}`)).body.task.attachments).toHaveLength(1);

      r = await other.agent.delete(`/api/tasks/${id}/attachments/${sharedFile.id}`);
      expect(r.body.task.attachments).toHaveLength(0);
    } finally {
      await prisma.taskAttachment.deleteMany();
      await prisma.driveGrant.deleteMany({ where: { nodeId: shared.id } });
      await prisma.driveNode.deleteMany({ where: { id: { in: [sharedFile.id, personal.id] } } });
      await prisma.driveNode.deleteMany({ where: { id: shared.id } });
    }
  });
});
