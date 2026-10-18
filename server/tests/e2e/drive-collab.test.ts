import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff, asSuperAdmin, type Agent } from '../helpers/api';
import { prisma, waitFor } from '../helpers/db';
import { binaryParser, makePdf } from '../helpers/files';
import { expectStatus } from '../helpers/workflow';

const roots = async (a: Agent) => expectStatus(await a.get('/api/drive/roots'), 200).body;
const mkdir = async (a: Agent, parentId: string, name: string) => expectStatus(await a.post(`/api/drive/nodes/${parentId}/folders`).send({ name }), 201).body.item as { id: string; name: string };
const upload = async (a: Agent, parentId: string, filename: string, text = filename, onConflict?: string) => {
  const req = a.post(`/api/drive/nodes/${parentId}/files`);
  if (onConflict) req.field('onConflict', onConflict);
  return expectStatus(await req.attach('file', await makePdf(text), { filename, contentType: 'application/pdf' }), 201).body.item as { id: string; name: string; version: number };
};
const restricted = async (su: Agent, parentId: string, name: string) => {
  const f = await mkdir(su, parentId, name);
  expectStatus(await su.patch(`/api/drive/nodes/${f.id}/inheritance`).send({ inherit: false }), 200);
  return f;
};
const activity = async (a: Agent, query: Record<string, string>) => expectStatus(await a.get(`/api/drive/collab/activity?${new URLSearchParams(query)}`), 200).body as { items: { id: string; action: string; name: string; nodeId: string | null; folderId: string | null; meta: Record<string, unknown> | null; actor: { id: string } | null }[]; nextCursor: string | null };
const download = (req: ReturnType<Agent['get']>) => req.buffer(true).parse(binaryParser);

describe('drive collaboration: activity journal', () => {
  it('records every mutation and lists a folder journal with filters and access checks', async () => {
    const staff = await asStaff({ firstName: 'Ilqar' });
    const admin = await asAdmin();
    const su = await asSuperAdmin();
    const { shared } = await roots(staff.agent);
    const a = await mkdir(staff.agent, shared.id, 'Erstdokumente');
    const b = await mkdir(staff.agent, shared.id, 'Archiv');
    const file = await upload(staff.agent, a.id, 'pasport.pdf');
    await upload(staff.agent, a.id, 'pasport.pdf', 'v2', 'replace');
    expectStatus(await staff.agent.patch(`/api/drive/nodes/${file.id}`).send({ name: 'pass.pdf' }), 200);
    expectStatus(await staff.agent.post('/api/drive/move').send({ ids: [file.id], targetId: b.id }), 200);
    expectStatus(await staff.agent.post('/api/drive/copy').send({ ids: [file.id], targetId: a.id }), 200);
    expectStatus(await staff.agent.post('/api/drive/trash').send({ ids: [file.id] }), 200);
    expectStatus(await staff.agent.post('/api/drive/restore').send({ ids: [file.id] }), 200);
    const x = await upload(staff.agent, a.id, 'x.pdf');
    const y = await upload(staff.agent, a.id, 'y.pdf');
    expectStatus(await staff.agent.post('/api/drive/bulk/move').send({ ids: [x.id, y.id], targetId: b.id }), 200);
    expectStatus(await staff.agent.post('/api/drive/bulk/delete').send({ ids: [x.id, y.id] }), 200);
    expectStatus(await admin.agent.post('/api/drive/purge').send({ ids: [x.id] }), 200);
    expectStatus(await staff.agent.post('/api/drive/create/pdf').send({ parentId: a.id, name: 'Brief', blocks: [] }), 201);

    const rows = await prisma.driveActivity.findMany({ orderBy: { createdAt: 'asc' } });
    const actions = rows.map((r) => r.action);
    for (const act of ['CREATE_FOLDER', 'UPLOAD', 'NEW_VERSION', 'RENAME', 'MOVE', 'COPY', 'DELETE', 'RESTORE', 'PURGE', 'CREATE']) expect(actions).toContain(act);
    // Bulk operations: one row per item.
    expect(rows.filter((r) => r.action === 'MOVE' && [x.id, y.id].includes(r.nodeId!))).toHaveLength(2);
    expect(rows.filter((r) => r.action === 'DELETE' && [x.id, y.id].includes(r.nodeId!))).toHaveLength(2);
    const move = rows.find((r) => r.action === 'MOVE' && r.nodeId === file.id)!;
    expect(move).toMatchObject({ folderId: b.id, actorId: staff.user.id, name: 'pass.pdf' });
    expect(move.meta).toMatchObject({ fromId: a.id, fromName: 'Erstdokumente', toId: b.id, toName: 'Archiv' });
    expect(rows.find((r) => r.action === 'RENAME')!.meta).toMatchObject({ from: 'pasport.pdf', to: 'pass.pdf' });

    // Folder journal: actions inside it, plus items moved out of it; newest first.
    const journal = await activity(staff.agent, { folderId: a.id });
    expect(journal.items.map((i) => i.action)).toEqual(expect.arrayContaining(['UPLOAD', 'NEW_VERSION', 'RENAME', 'MOVE', 'COPY', 'CREATE']));
    expect(journal.items[0].action).toBe('CREATE');
    expect((await activity(staff.agent, { folderId: a.id, action: 'MOVE' })).items.every((i) => i.action === 'MOVE')).toBe(true);
    expect((await activity(staff.agent, { folderId: b.id, action: 'MOVE,DELETE' })).items.length).toBeGreaterThanOrEqual(4);
    expect((await activity(staff.agent, { folderId: a.id, actorId: admin.user.id })).items).toHaveLength(0);
    expect((await activity(staff.agent, { nodeId: file.id })).items.map((i) => i.action)).toEqual(expect.arrayContaining(['UPLOAD', 'RENAME', 'MOVE', 'DELETE', 'RESTORE']));
    const future = new Date(Date.now() + 60_000).toISOString();
    expect((await activity(staff.agent, { folderId: a.id, from: future })).items).toHaveLength(0);

    // Paging.
    const p1 = await activity(staff.agent, { folderId: a.id, limit: '2' });
    expect(p1.items).toHaveLength(2);
    const p2 = await activity(staff.agent, { folderId: a.id, limit: '2', cursor: p1.nextCursor! });
    expect(p2.items[0].id).not.toBe(p1.items[1].id);

    // Access: a restricted folder's journal is 404, and its rows do not leak into the parent's journal.
    const secret = await restricted(su.agent, a.id, 'Geheim');
    await upload(su.agent, secret.id, 'geheim.pdf');
    expect((await staff.agent.get(`/api/drive/collab/activity?folderId=${secret.id}`)).status).toBe(404);
    expect((await activity(staff.agent, { folderId: a.id })).items.some((i) => i.name === 'Geheim')).toBe(false);
    expect((await activity(su.agent, { folderId: a.id })).items.some((i) => i.name === 'Geheim')).toBe(true);
    expect((await staff.agent.get('/api/drive/collab/activity')).status).toBe(400);
    expectStatus(await su.agent.get('/api/drive/collab/activity'), 200);
    const client = await asClient();
    expect((await client.agent.get(`/api/drive/collab/activity?folderId=${a.id}`)).status).toBe(403);
  });
});

describe('drive collaboration: comments, mentions and tasks', () => {
  it('handles comments with replies, @mentions (notification + e-mail) and turns a comment into a task', async () => {
    const author = await asStaff({ firstName: 'Ilqar', lastName: 'Məmmədov' });
    const colleague = await asStaff({ firstName: 'Aysel', locale: 'de' });
    const other = await asStaff();
    const admin = await asAdmin();
    const { shared } = await roots(author.agent);
    const folder = await mkdir(author.agent, shared.id, 'Tərcümələr');
    const file = await upload(author.agent, folder.id, 'diplom.pdf');

    const body = `Zəhmət olmasa yoxla @[Aysel User](user:${colleague.user.id})`;
    const created = expectStatus(await author.agent.post(`/api/drive/collab/nodes/${file.id}/comments`).send({ body }), 201).body.comment;
    expect(created).toMatchObject({ body, parentId: null, canEdit: true, mentions: [{ id: colleague.user.id, name: 'Aysel User' }] });

    const n = await waitFor(() => prisma.notification.findFirst({ where: { userId: colleague.user.id, type: 'DRIVE_MENTION' } }));
    expect(n.title).toContain('diplom.pdf');
    expect(n.link).toBe(`/workspace/drive/f/${folder.id}?item=${file.id}&comment=${created.id}`);
    await waitFor(() => prisma.emailLog.findFirst({ where: { to: colleague.user.email, subject: `Triad Vision · ${n.title}` } }));
    // The author is never notified about their own mention.
    expect(await prisma.notification.count({ where: { userId: author.user.id, type: 'DRIVE_MENTION' } })).toBe(0);

    // Replies: one level (a reply to a reply joins the thread).
    const reply = expectStatus(await colleague.agent.post(`/api/drive/collab/nodes/${file.id}/comments`).send({ body: 'Baxdım', parentId: created.id }), 201).body.comment;
    const nested = expectStatus(await author.agent.post(`/api/drive/collab/nodes/${file.id}/comments`).send({ body: 'Sağ ol', parentId: reply.id }), 201).body.comment;
    expect(nested.parentId).toBe(created.id);
    const list = expectStatus(await other.agent.get(`/api/drive/collab/nodes/${file.id}/comments`), 200).body;
    expect(list.open).toBe(1);
    expect(list.comments).toHaveLength(1);
    expect(list.comments[0].replies.map((r: { body: string }) => r.body)).toEqual(['Baxdım', 'Sağ ol']);
    expect(list.comments[0].canEdit).toBe(false);

    // Comment badge in the folder listing.
    const listing = expectStatus(await author.agent.get(`/api/drive/nodes/${folder.id}/children`), 200).body;
    expect(listing.items.find((i: { id: string }) => i.id === file.id).commentCount).toBe(1);

    // Edit own / admin any / others not.
    expect((await other.agent.patch(`/api/drive/collab/comments/${created.id}`).send({ body: 'hack' })).status).toBe(403);
    expect(expectStatus(await author.agent.patch(`/api/drive/collab/comments/${created.id}`).send({ body: 'Yoxla, zəhmət olmasa' }), 200).body.comment.body).toBe('Yoxla, zəhmət olmasa');
    expectStatus(await admin.agent.patch(`/api/drive/collab/comments/${reply.id}`).send({ body: 'Baxdım ✔' }), 200);

    // Resolve / reopen.
    expectStatus(await other.agent.patch(`/api/drive/collab/comments/${created.id}`).send({ resolved: true }), 200);
    const afterResolve = expectStatus(await author.agent.get(`/api/drive/nodes/${folder.id}/children`), 200).body;
    expect(afterResolve.items.find((i: { id: string }) => i.id === file.id).commentCount).toBeUndefined();
    expect((await other.agent.patch(`/api/drive/collab/comments/${reply.id}`).send({ resolved: true })).status).toBe(400);
    expectStatus(await other.agent.patch(`/api/drive/collab/comments/${created.id}`).send({ resolved: false }), 200);

    // Task from the comment: assignee, due date, file attached; the comment shows the task chip.
    const t = expectStatus(await author.agent.post(`/api/drive/collab/comments/${created.id}/task`).send({ assigneeIds: [colleague.user.id], dueAt: '2026-10-23' }), 201).body.task;
    expect(t).toMatchObject({ status: 'TODO', title: 'Yoxla, zəhmət olmasa' });
    const task = await prisma.task.findUniqueOrThrow({ where: { id: t.id }, include: { attachments: true, assignees: true } });
    expect(task.attachments.map((x) => x.nodeId)).toEqual([file.id]);
    expect(task.assignees.map((x) => x.userId)).toEqual([colleague.user.id]);
    expect(task.dueAt?.toISOString().slice(0, 10)).toBe('2026-10-23');
    expect((await prisma.driveComment.findUniqueOrThrow({ where: { id: created.id } })).taskId).toBe(t.id);
    await waitFor(() => prisma.notification.findFirst({ where: { userId: colleague.user.id, type: 'TASK_ASSIGNED' } }));
    const withTask = expectStatus(await author.agent.get(`/api/drive/collab/nodes/${file.id}/comments`), 200).body;
    expect(withTask.comments[0].task).toMatchObject({ id: t.id, status: 'TODO', key: expect.stringMatching(/^T-\d{4}$/) });
    expect((await author.agent.post(`/api/drive/collab/comments/${created.id}/task`).send({ assigneeIds: [] })).body.error).toBe('TASK_ALREADY_CREATED');
    expect((await author.agent.post(`/api/drive/collab/comments/${reply.id}/task`).send({ assigneeIds: ['nobody'] })).body.error).toBe('INVALID_ASSIGNEE');
    // The task can be opened by the assignee with the file accessible.
    const detail = expectStatus(await colleague.agent.get(`/api/tasks/${t.id}`), 200).body.task;
    expect(detail.attachments[0]).toMatchObject({ nodeId: file.id, accessible: true });

    // Delete: others no, author yes (with its replies).
    expect((await other.agent.delete(`/api/drive/collab/comments/${created.id}`)).status).toBe(403);
    expectStatus(await author.agent.delete(`/api/drive/collab/comments/${created.id}`), 200);
    expect(await prisma.driveComment.count({ where: { nodeId: file.id } })).toBe(0);
    expect(await prisma.driveActivity.count({ where: { nodeId: file.id, action: 'COMMENT' } })).toBe(3);

    // A mention of someone who cannot see the file notifies nobody; clients have no access at all.
    const su = await asSuperAdmin();
    const secret = await restricted(su.agent, shared.id, 'Gizli');
    const sf = await upload(su.agent, secret.id, 's.pdf');
    expectStatus(await su.agent.post(`/api/drive/collab/nodes/${sf.id}/comments`).send({ body: `@[x](user:${other.user.id}) bax` }), 201);
    expect(await prisma.notification.count({ where: { userId: other.user.id, type: 'DRIVE_MENTION' } })).toBe(0);
    expect((await other.agent.get(`/api/drive/collab/nodes/${sf.id}/comments`)).status).toBe(404);
    const client = await asClient();
    expect((await client.agent.get(`/api/drive/collab/nodes/${file.id}/comments`)).status).toBe(403);
  });
});

describe('drive collaboration: edit locks', () => {
  it('acquires, refreshes, blocks others with 423, lets a stale lock be taken over and a super admin force-unlock', async () => {
    const ilqar = await asStaff({ firstName: 'Ilqar', lastName: 'Həsənov' });
    const other = await asStaff();
    const su = await asSuperAdmin();
    const { shared } = await roots(ilqar.agent);
    const folder = await mkdir(ilqar.agent, shared.id, 'Lock');
    const target = await mkdir(ilqar.agent, shared.id, 'Target');
    const file = await upload(ilqar.agent, folder.id, 'muqavile.pdf');
    const before = await prisma.driveNode.findUniqueOrThrow({ where: { id: file.id } });

    expect(expectStatus(await ilqar.agent.post(`/api/drive/collab/lock/${file.id}`), 200).body).toMatchObject({ status: 'acquired', lock: { mine: true, lockedBy: { id: ilqar.user.id } } });
    expect(expectStatus(await ilqar.agent.post(`/api/drive/collab/lock/${file.id}`), 200).body.status).toBe('refreshed');
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: file.id } })).updatedAt.getTime()).toBe(before.updatedAt.getTime());
    expect((await ilqar.agent.post(`/api/drive/collab/lock/${folder.id}`)).body.error).toBe('NOT_A_FILE');

    const blocked = await other.agent.post(`/api/drive/collab/lock/${file.id}`);
    expect(blocked.status).toBe(423);
    expect(blocked.body).toMatchObject({ error: 'FILE_LOCKED', lockedBy: { id: ilqar.user.id, name: 'Ilqar Həsənov' } });
    expect(blocked.body.lockedAt).toBeTruthy();

    // Listing shows who is editing.
    const listing = expectStatus(await other.agent.get(`/api/drive/nodes/${folder.id}/children`), 200).body;
    expect(listing.items[0].lock).toMatchObject({ by: { id: ilqar.user.id, firstName: 'Ilqar' } });

    // New version, rename, move, delete by someone else → 423 / FILE_LOCKED.
    const replace = await other.agent.post(`/api/drive/nodes/${folder.id}/files`).field('onConflict', 'replace').attach('file', await makePdf('v2'), { filename: 'muqavile.pdf', contentType: 'application/pdf' });
    expect(replace.status).toBe(423);
    expect(replace.body.error).toBe('FILE_LOCKED');
    expect((await other.agent.patch(`/api/drive/nodes/${file.id}`).send({ name: 'yeni.pdf' })).status).toBe(423);
    expect(expectStatus(await other.agent.post('/api/drive/move').send({ ids: [file.id], targetId: target.id }), 200).body.results[0]).toMatchObject({ ok: false, error: 'FILE_LOCKED' });
    expect(expectStatus(await other.agent.post('/api/drive/bulk/delete').send({ ids: [file.id] }), 200).body.results[0]).toMatchObject({ ok: false, error: 'FILE_LOCKED' });
    expect(expectStatus(await other.agent.post('/api/drive/trash').send({ ids: [file.id] }), 200).body.results[0].error).toBe('FILE_LOCKED');
    // The holder works normally.
    expect((await upload(ilqar.agent, folder.id, 'muqavile.pdf', 'v2', 'replace')).version).toBe(2);

    // Not the owner → cannot release; stale lock → taken over.
    expect((await other.agent.delete(`/api/drive/collab/lock/${file.id}`)).status).toBe(403);
    await prisma.driveNode.update({ where: { id: file.id }, data: { lockedAt: new Date(Date.now() - 6 * 60 * 1000) } });
    expectStatus(await other.agent.patch(`/api/drive/nodes/${file.id}`).send({ name: 'yeni.pdf' }), 200);
    expect(expectStatus(await other.agent.post(`/api/drive/collab/lock/${file.id}`), 200).body.status).toBe('takeover');
    expect((await prisma.driveActivity.findFirstOrThrow({ where: { nodeId: file.id, action: 'LOCK', actorId: other.user.id } })).meta).toMatchObject({ takeover: true, previous: { id: ilqar.user.id } });
    expectStatus(await other.agent.delete(`/api/drive/collab/lock/${file.id}`), 200);
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: file.id } })).lockedById).toBeNull();

    // Doc editor save (PUT /pdf) is blocked while someone else holds the lock; super admin force-unlocks.
    const doc = expectStatus(await ilqar.agent.post('/api/drive/create/pdf').send({ parentId: folder.id, name: 'Arayış', blocks: [] }), 201).body.item;
    expectStatus(await ilqar.agent.post(`/api/drive/collab/lock/${doc.id}`), 200);
    const put = await other.agent.put(`/api/drive/create/pdf/${doc.id}`).send({ blocks: [], baseVersion: 1 });
    expect(put.status).toBe(423);
    expect(put.body.lockedBy.id).toBe(ilqar.user.id);
    expect((await other.agent.delete(`/api/drive/collab/lock/${doc.id}?force=1`)).body.error).toBe('SUPER_ADMIN_ONLY');
    expect(expectStatus(await su.agent.delete(`/api/drive/collab/lock/${doc.id}?force=1`), 200).body).toMatchObject({ released: true, forced: true });
    expectStatus(await other.agent.put(`/api/drive/create/pdf/${doc.id}`).send({ blocks: [], baseVersion: 1 }), 200);
    expect(await prisma.auditLog.count({ where: { action: 'DRIVE_FORCE_UNLOCKED' } })).toBe(1);
    expect(await prisma.driveActivity.count({ where: { action: 'UNLOCK' } })).toBe(2);
    expect(expectStatus(await other.agent.get(`/api/drive/collab/lock/${doc.id}`), 200).body.lock).toBeNull();
  });
});

describe('drive collaboration: external share links', () => {
  const tokenOf = (url: string) => url.split('/share/')[1];

  it('shares a file with a password, an expiry and a download limit; revoked/expired links are 404', async () => {
    const staff = await asStaff();
    const { shared } = await roots(staff.agent);
    const folder = await mkdir(staff.agent, shared.id, 'Arbeitgeber');
    const file = await upload(staff.agent, folder.id, 'cv.pdf', 'CV content');
    const original = (await download(staff.agent.get(`/api/drive/nodes/${file.id}/content?download=1`))).body as Buffer;

    expect((await staff.agent.post(`/api/drive/collab/nodes/${file.id}/links`).send({ expiresInDays: 91 })).status).toBe(400);
    expect((await staff.agent.post(`/api/drive/collab/nodes/${file.id}/links`).send({ allowUpload: true })).body.error).toBe('UPLOAD_ONLY_FOR_FOLDERS');
    expect((await staff.agent.post(`/api/drive/collab/nodes/${shared.id}/links`).send({})).body.error).toBe('SYSTEM_NODE');

    const res = expectStatus(await staff.agent.post(`/api/drive/collab/nodes/${file.id}/links`).send({ label: 'Müller GmbH', expiresInDays: 7, password: 'geheim123', maxDownloads: 2 }), 201).body;
    const token = tokenOf(res.url);
    expect(res.token).toBe(token);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(res.link).toMatchObject({ label: 'Müller GmbH', hasPassword: true, maxDownloads: 2, downloads: 0, status: 'active' });
    // Only the hash is stored, never the token itself.
    const row = await prisma.driveShareLink.findUniqueOrThrow({ where: { id: res.link.id } });
    expect(row.tokenHash).toBe(crypto.createHash('sha256').update(token).digest('hex'));
    expect(JSON.stringify(row)).not.toContain(token);
    expect(row.passwordHash).not.toContain('geheim123');

    // Locked: only the name; no download without the password.
    const meta = expectStatus(await anon().get(`/api/share/${token}`), 200).body;
    expect(meta).toMatchObject({ name: 'cv.pdf', kind: 'FILE', needsPassword: true, unlocked: false });
    expect(meta.size).toBeUndefined();
    expect((await anon().get(`/api/share/${token}/download`)).body.error).toBe('PASSWORD_REQUIRED');
    expect((await anon().post(`/api/share/${token}/unlock`).send({ password: 'falsch' })).body.error).toBe('BAD_PASSWORD');
    const unlock = expectStatus(await anon().post(`/api/share/${token}/unlock`).send({ password: 'geheim123' }), 200);
    const key = unlock.body.key as string;
    expect(unlock.headers['set-cookie']?.[0]).toContain(`Path=/api/share/${token}`);
    expect(expectStatus(await anon().get(`/api/share/${token}`).set('x-share-key', key), 200).body).toMatchObject({ unlocked: true, size: original.length, downloadsLeft: 2 });
    // A key of another link does not open this one.
    expect((await anon().get(`/api/share/${token}/download`).set('x-share-key', `${Date.now() + 60_000}.abc`)).status).toBe(403);

    // Downloads count, the limit holds.
    const d1 = await download(anon().get(`/api/share/${token}/download`).set('x-share-key', key));
    expect(d1.status).toBe(200);
    expect((d1.body as Buffer).equals(original)).toBe(true);
    expect(d1.headers['content-disposition']).toContain('attachment');
    expectStatus(await download(anon().get(`/api/share/${token}/download?key=${encodeURIComponent(key)}`)), 200);
    expect((await anon().get(`/api/share/${token}/download`).set('x-share-key', key)).status).toBe(410);
    expect((await prisma.driveShareLink.findUniqueOrThrow({ where: { id: res.link.id } })).downloads).toBe(2);

    // Access log, list and status.
    const log = expectStatus(await staff.agent.get(`/api/drive/collab/links/${res.link.id}/accesses`), 200).body.accesses.map((a: { action: string }) => a.action);
    expect(log.filter((a: string) => a === 'DOWNLOAD')).toHaveLength(2);
    expect(log).toContain('BAD_PASSWORD');
    expect(log).toContain('VIEW');
    const links = expectStatus(await staff.agent.get(`/api/drive/collab/nodes/${file.id}/links`), 200).body.links;
    expect(links[0]).toMatchObject({ id: res.link.id, status: 'exhausted', downloads: 2 });
    expect(links[0].lastAccessAt).toBeTruthy();

    // Expired and revoked links: 404, same as unknown tokens.
    const second = expectStatus(await staff.agent.post(`/api/drive/collab/nodes/${file.id}/links`).send({ expiresInDays: 1 }), 201).body;
    const t2 = tokenOf(second.url);
    expectStatus(await anon().get(`/api/share/${t2}`), 200);
    await prisma.driveShareLink.update({ where: { id: second.link.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await anon().get(`/api/share/${t2}`)).status).toBe(404);
    const third = expectStatus(await staff.agent.post(`/api/drive/collab/nodes/${file.id}/links`).send({ expiresAt: new Date(Date.now() + 3 * 86400_000).toISOString() }), 201).body;
    const t3 = tokenOf(third.url);
    expectStatus(await download(anon().get(`/api/share/${t3}/download`)), 200);
    expect(expectStatus(await staff.agent.delete(`/api/drive/collab/links/${third.link.id}`), 200).body.link.status).toBe('revoked');
    expect((await anon().get(`/api/share/${t3}`)).status).toBe(404);
    expect((await anon().get(`/api/share/${t3}/download`)).status).toBe(404);
    expect((await anon().get(`/api/share/${crypto.randomBytes(32).toString('base64url')}`)).status).toBe(404);
    expect((await anon().get('/api/share/short')).status).toBe(404);
    expect(await prisma.driveActivity.count({ where: { action: 'SHARE_LINK_CREATED' } })).toBe(3);
    expect(await prisma.driveActivity.count({ where: { action: 'SHARE_LINK_REVOKED' } })).toBe(1);

    // A trashed item's links stop working; other staff without EDIT cannot manage links.
    const su = await asSuperAdmin();
    const secret = await restricted(su.agent, shared.id, 'Gizli');
    const sf = await upload(su.agent, secret.id, 's.pdf');
    expect((await staff.agent.get(`/api/drive/collab/nodes/${sf.id}/links`)).status).toBe(404);
    expect((await staff.agent.get(`/api/drive/collab/links/${res.link.id}/accesses`)).status).toBe(200);
    const fourth = expectStatus(await staff.agent.post(`/api/drive/collab/nodes/${file.id}/links`).send({}), 201).body;
    expectStatus(await staff.agent.post('/api/drive/trash').send({ ids: [file.id] }), 200);
    expect((await anon().get(`/api/share/${tokenOf(fourth.url)}`)).status).toBe(404);
  });

  it('shares a folder: listing with opaque ids, nested downloads, ZIP, no way out of the folder, uploads when allowed', async () => {
    const staff = await asStaff();
    const { shared } = await roots(staff.agent);
    const parent = await mkdir(staff.agent, shared.id, 'Kunde');
    const folder = await mkdir(staff.agent, parent.id, 'Übersetzungen');
    const sub = await mkdir(staff.agent, folder.id, 'Original');
    const f1 = await upload(staff.agent, folder.id, 'brief.pdf');
    const f2 = await upload(staff.agent, sub.id, 'diplom.pdf', 'Diplom');
    const sibling = await upload(staff.agent, parent.id, 'secret.pdf');

    const res = expectStatus(await staff.agent.post(`/api/drive/collab/nodes/${folder.id}/links`).send({ label: 'Tərcüməçi', allowUpload: true, expiresInDays: 30 }), 201).body;
    const token = tokenOf(res.url);
    const meta = expectStatus(await anon().get(`/api/share/${token}`), 200).body;
    expect(meta).toMatchObject({ name: 'Übersetzungen', kind: 'FOLDER', needsPassword: false, allowUpload: true, totals: { files: 2 } });
    expect(meta.entries.map((e: { name: string }) => e.name)).toEqual(['Original', 'brief.pdf']);
    const ids = meta.entries.map((e: { id: string }) => e.id);
    for (const id of [folder.id, sub.id, f1.id, f2.id]) expect(JSON.stringify(meta)).not.toContain(id);
    const subRef = meta.entries.find((e: { name: string }) => e.name === 'Original').id;
    const inner = expectStatus(await anon().get(`/api/share/${token}?dir=${subRef}`), 200).body;
    expect(inner.entries.map((e: { name: string }) => e.name)).toEqual(['diplom.pdf']);
    expect(inner.path.map((p: { name: string }) => p.name)).toEqual(['Übersetzungen', 'Original']);

    // Nested file download, sub-folder ZIP, whole-folder ZIP.
    const nested = await download(anon().get(`/api/share/${token}/download/${inner.entries[0].id}`));
    expect(nested.status).toBe(200);
    expect((nested.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    const zip = await download(anon().get(`/api/share/${token}/download`));
    expect(zip.status).toBe(200);
    expect(zip.headers['content-type']).toBe('application/zip');
    expect((zip.body as Buffer).includes(Buffer.from('Übersetzungen/Original/diplom.pdf'))).toBe(true);
    expectStatus(await download(anon().get(`/api/share/${token}/download/${subRef}`)), 200);
    expect(ids).toHaveLength(2);

    // Nothing outside the shared folder is reachable: raw node ids, the sibling, the parent, other links' refs.
    for (const ref of [sibling.id, parent.id, f1.id, 'x'.repeat(22)]) {
      expect((await anon().get(`/api/share/${token}/download/${ref}`)).status).toBe(404);
      expect((await anon().get(`/api/share/${token}?dir=${ref}`)).status).toBe(404);
    }
    const fileLink = expectStatus(await staff.agent.post(`/api/drive/collab/nodes/${sibling.id}/links`).send({}), 201).body;
    expect((await anon().get(`/api/share/${tokenOf(fileLink.url)}/download/${subRef}`)).status).toBe(404);

    // Upload via link: lands in the folder without an uploader, journal "UPLOAD_VIA_LINK", creator notified.
    const up = expectStatus(await anon().post(`/api/share/${token}/upload`).attach('file', await makePdf('translated'), { filename: 'brief.pdf', contentType: 'application/pdf' }), 201).body;
    expect(up.file.name).toBe('brief (2).pdf');
    const node = await prisma.driveNode.findFirstOrThrow({ where: { parentId: folder.id, name: 'brief (2).pdf' } });
    expect(node.createdById).toBeNull();
    expect(await prisma.driveActivity.findFirst({ where: { nodeId: node.id, action: 'UPLOAD_VIA_LINK', actorId: null } })).not.toBeNull();
    await waitFor(() => prisma.notification.findFirst({ where: { userId: staff.user.id, type: 'DRIVE_LINK_UPLOAD' } }));
    const bad = await anon().post(`/api/share/${token}/upload`).attach('file', Buffer.from('MZ....'), { filename: 'virus.exe', contentType: 'application/x-msdownload' });
    expect(bad.status).toBe(400);
    const accesses = await prisma.driveShareAccess.findMany({ where: { linkId: res.link.id } });
    expect(accesses.filter((a) => a.action === 'UPLOAD').map((a) => a.fileName)).toEqual(['brief (2).pdf']);
    expect(accesses.filter((a) => a.action === 'DOWNLOAD')).toHaveLength(3);

    // Without "allow upload" the link is read-only; a password-protected upload link needs the key.
    const ro = expectStatus(await staff.agent.post(`/api/drive/collab/nodes/${folder.id}/links`).send({}), 201).body;
    expect((await anon().post(`/api/share/${tokenOf(ro.url)}/upload`).attach('file', await makePdf('x'), { filename: 'x.pdf', contentType: 'application/pdf' })).body.error).toBe('UPLOAD_NOT_ALLOWED');
    const pw = expectStatus(await staff.agent.post(`/api/drive/collab/nodes/${folder.id}/links`).send({ allowUpload: true, password: 'abcd1234' }), 201).body;
    expect((await anon().post(`/api/share/${tokenOf(pw.url)}/upload`).attach('file', await makePdf('x'), { filename: 'x.pdf', contentType: 'application/pdf' })).body.error).toBe('PASSWORD_REQUIRED');
    expect((await anon().get(`/api/share/${tokenOf(pw.url)}`)).body.entries).toBeUndefined();
  });
});
