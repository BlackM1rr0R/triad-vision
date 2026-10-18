import { describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff, type Agent } from '../helpers/api';
import { prisma, settle, waitFor } from '../helpers/db';
import { createClient, createStaff, uniq } from '../helpers/factories';
import { binaryParser, makePdf, SAMPLE } from '../helpers/files';
import { expectStatus } from '../helpers/workflow';
import { subscribe } from '../../src/lib/messaging/realtime.js';
import { ensureRoots } from '../../src/lib/drive/roots.js';

const notes = (userId: string, type?: string) => prisma.notification.findMany({ where: { userId, ...(type ? { type } : {}) }, orderBy: { createdAt: 'asc' } });

const channels = async (a: Agent) => expectStatus(await a.get('/api/chat/channels'), 200).body.channels as Array<Record<string, unknown> & { id: string; name: string | null; kind: string; isMember: boolean; unread: number; mentions: number }>;
const general = async (a: Agent) => (await channels(a)).find((c) => c.name === 'general' && c.kind === 'PUBLIC')!;
const mkChannel = async (a: Agent, body: Record<string, unknown>) => expectStatus(await a.post('/api/chat/channels').send({ kind: 'PUBLIC', name: uniq('room-'), ...body }), 201).body.channel as { id: string; name: string; kind: string };
const post = async (a: Agent, channelId: string, body: Record<string, unknown>) => expectStatus(await a.post(`/api/chat/channels/${channelId}/messages`).send(body), 201).body.message as Record<string, unknown> & { id: string; mentions: string[]; replyCount: number; reactions: { emoji: string; count: number; me: boolean }[] };
const list = async (a: Agent, channelId: string) => expectStatus(await a.get(`/api/chat/channels/${channelId}/messages`), 200).body.messages as Array<Record<string, unknown> & { id: string; body: string; replyCount: number }>;

describe('chat: access', () => {
  it('requires a staff session', async () => {
    expect((await anon().get('/api/chat/channels')).status).toBe(401);
    const client = await asClient();
    expect((await client.agent.get('/api/chat/channels')).status).toBe(403);
    expect((await client.agent.get('/api/chat/summary')).status).toBe(403);
  });
});

describe('chat: channels', () => {
  it('creates #general once and auto-joins every staff member; summary has the badge shape', async () => {
    const a = await asStaff();
    const b = await asStaff();
    const ga = await general(a.agent);
    expect(ga).toMatchObject({ kind: 'PUBLIC', name: 'general', isMember: true });
    const gb = await general(b.agent);
    expect(gb.id).toBe(ga.id);
    expect(gb.isMember).toBe(true);
    const later = await asStaff();
    expect((await general(later.agent)).isMember).toBe(true);
    expect(await prisma.chatChannel.count({ where: { name: 'general' } })).toBe(1);
    const s = await a.agent.get('/api/chat/summary');
    expect(s.status).toBe(200);
    expect(s.body).toEqual({ unread: 0, mentions: 0 });
    // #general cannot be archived or left
    expect((await (await asAdmin()).agent.post(`/api/chat/channels/${ga.id}/archive`)).status).toBe(400);
    expect((await a.agent.post(`/api/chat/channels/${ga.id}/leave`)).status).toBe(400);
  });

  it('creates public and private channels with slug names, members and an owner; names are unique among active channels', async () => {
    const owner = await asStaff({ firstName: 'Kamran', lastName: 'Aliyev' });
    const { user: bob } = await createStaff({ firstName: 'Bob' });
    const res = await owner.agent.post('/api/chat/channels').send({ kind: 'PRIVATE', name: ' Visa Team ', topic: 'embassy stuff', memberIds: [bob.id, owner.user.id] });
    expect(res.status).toBe(201);
    expect(res.body.channel).toMatchObject({ kind: 'PRIVATE', name: 'visa-team', topic: 'embassy stuff', memberCount: 2, myRole: 'OWNER', isMember: true });
    expect((await owner.agent.post('/api/chat/channels').send({ kind: 'PUBLIC', name: 'visa-team' })).status).toBe(409);
    expect((await owner.agent.post('/api/chat/channels').send({ kind: 'PUBLIC', name: 'bad name!!' })).status).toBe(400);
    expect((await owner.agent.post('/api/chat/channels').send({ kind: 'DM', name: 'x' })).status).toBe(400);
    // Archiving frees the name.
    expect((await owner.agent.post(`/api/chat/channels/${res.body.channel.id}/archive`)).status).toBe(200);
    expect((await owner.agent.post('/api/chat/channels').send({ kind: 'PUBLIC', name: 'visa-team' })).status).toBe(201);
    expect((await owner.agent.post(`/api/chat/channels/${res.body.channel.id}/messages`).send({ body: 'late' })).status).toBe(400);
  });

  it('public channels can be joined and left; private ones are invisible to outsiders and cannot be joined', async () => {
    const owner = await asStaff();
    const other = await asStaff();
    const pub = await mkChannel(owner.agent, { kind: 'PUBLIC' });
    const priv = await mkChannel(owner.agent, { kind: 'PRIVATE' });

    const seen = await channels(other.agent);
    expect(seen.find((c) => c.id === pub.id)).toMatchObject({ isMember: false });
    expect(seen.find((c) => c.id === priv.id)).toBeUndefined();

    expect((await other.agent.get(`/api/chat/channels/${priv.id}/messages`)).status).toBe(404);
    expect((await other.agent.post(`/api/chat/channels/${priv.id}/join`)).status).toBe(404);
    expect((await other.agent.post(`/api/chat/channels/${priv.id}/messages`).send({ body: 'hi' })).status).toBe(404);

    // Public: readable before joining, posting needs membership.
    expect((await other.agent.get(`/api/chat/channels/${pub.id}/messages`)).status).toBe(200);
    expect((await other.agent.post(`/api/chat/channels/${pub.id}/messages`).send({ body: 'hi' })).status).toBe(403);
    const joined = await other.agent.post(`/api/chat/channels/${pub.id}/join`);
    expect(joined.status).toBe(200);
    expect(joined.body.channel).toMatchObject({ isMember: true, memberCount: 2, myRole: 'MEMBER' });
    expect((await other.agent.post(`/api/chat/channels/${pub.id}/messages`).send({ body: 'hi' })).status).toBe(201);
    expect((await other.agent.post(`/api/chat/channels/${pub.id}/leave`)).status).toBe(200);
    expect((await channels(other.agent)).find((c) => c.id === pub.id)).toMatchObject({ isMember: false });
  });

  it('members are managed by the owner / admin for private channels; any member may invite into a public one', async () => {
    const owner = await asStaff();
    const member = await asStaff();
    const { user: newbie } = await createStaff();
    const priv = await mkChannel(owner.agent, { kind: 'PRIVATE', memberIds: [member.user.id] });
    expect((await member.agent.post(`/api/chat/channels/${priv.id}/members`).send({ add: [newbie.id] })).status).toBe(403);
    expect((await member.agent.patch(`/api/chat/channels/${priv.id}`).send({ topic: 'x' })).status).toBe(403);
    const added = await owner.agent.post(`/api/chat/channels/${priv.id}/members`).send({ add: [newbie.id] });
    expect(added.status).toBe(200);
    expect(added.body.channel.memberCount).toBe(3);
    const removed = await owner.agent.post(`/api/chat/channels/${priv.id}/members`).send({ remove: [newbie.id] });
    expect(removed.body.channel.memberCount).toBe(2);
    expect((await owner.agent.patch(`/api/chat/channels/${priv.id}`).send({ topic: 'Embassy', name: 'Embassy Crew' })).body.channel).toMatchObject({ topic: 'Embassy', name: 'embassy-crew' });
    // Admins manage everything, even channels they are not in.
    const admin = await asAdmin();
    expect((await admin.agent.patch(`/api/chat/channels/${priv.id}`).send({ topic: 'By admin' })).status).toBe(200);

    const pub = await mkChannel(owner.agent, { kind: 'PUBLIC', memberIds: [member.user.id] });
    expect((await member.agent.post(`/api/chat/channels/${pub.id}/members`).send({ add: [newbie.id] })).status).toBe(200);
    expect((await member.agent.post(`/api/chat/channels/${pub.id}/members`).send({ remove: [newbie.id] })).status).toBe(403);
  });

  it('direct messages: one channel per pair, named after the other person; self-DM allowed', async () => {
    const a = await asStaff({ firstName: 'Aysel', lastName: 'M' });
    const b = await asStaff({ firstName: 'Bob', lastName: 'K' });
    const first = await a.agent.post('/api/chat/dm').send({ userId: b.user.id });
    expect(first.status).toBe(201);
    expect(first.body.channel).toMatchObject({ kind: 'DM', name: 'Bob K', memberCount: 2, peer: { id: b.user.id } });
    const again = await b.agent.post('/api/chat/dm').send({ userId: a.user.id });
    expect(again.status).toBe(200);
    expect(again.body.channel.id).toBe(first.body.channel.id);
    expect(again.body.channel.name).toBe('Aysel M');
    const self = await a.agent.post('/api/chat/dm').send({ userId: a.user.id });
    expect(self.status).toBe(201);
    expect(self.body.channel.memberCount).toBe(1);
    expect(self.body.channel.id).not.toBe(first.body.channel.id);
    const { user: client } = await createClient();
    expect((await a.agent.post('/api/chat/dm').send({ userId: client.id })).status).toBe(400);
    expect((await a.agent.post(`/api/chat/channels/${first.body.channel.id}/leave`)).status).toBe(400);
  });

  it('case channels are private, named after the case number and include the assigned staff member', async () => {
    const staff = await asStaff();
    const { user: assignee } = await createStaff();
    const { user: client } = await createClient();
    const c = await prisma.case.create({ data: { number: 'TV-2026-0042', clientId: client.id, profession: 'Driver', assignedStaffId: assignee.id } });
    const res = await staff.agent.post(`/api/chat/channels/for-case/${c.id}`);
    expect(res.status).toBe(201);
    expect(res.body.channel).toMatchObject({ kind: 'PRIVATE', name: 'tv-2026-0042', caseId: c.id, memberCount: 2, case: { number: 'TV-2026-0042' } });
    const other = await asStaff();
    const again = await other.agent.post(`/api/chat/channels/for-case/${c.id}`);
    expect(again.status).toBe(200);
    expect(again.body.channel.id).toBe(res.body.channel.id);
    expect(again.body.channel.memberCount).toBe(3);
    expect((await staff.agent.post('/api/chat/channels/for-case/nope')).status).toBe(404);
  });

  it('mute and pin are per member and reported on the channel', async () => {
    const a = await asStaff();
    const ch = await mkChannel(a.agent, {});
    expect((await a.agent.post(`/api/chat/channels/${ch.id}/mute`).send({})).body).toEqual({ muted: true });
    expect((await a.agent.post(`/api/chat/channels/${ch.id}/pin`).send({ value: true })).body).toEqual({ pinned: true });
    const me = (await channels(a.agent)).find((c) => c.id === ch.id)!;
    expect(me).toMatchObject({ muted: true, pinned: true });
    expect((await a.agent.post(`/api/chat/channels/${ch.id}/mute`).send({})).body).toEqual({ muted: false });
  });
});

describe('chat: messages', () => {
  it('posts messages with server-side mention parsing, notifies mentioned members (in-app, no email) and counts unread/mentions', async () => {
    const a = await asStaff({ firstName: 'Kamran', lastName: 'Aliyev' });
    const b = await asStaff({ firstName: 'Aysel', lastName: 'Mammadova', locale: 'de' });
    const { user: outsider } = await createStaff({ firstName: 'Zaur', lastName: 'Out' });
    const ch = await mkChannel(a.agent, { memberIds: [b.user.id] });

    const m = await post(a.agent, ch.id, { body: 'Hello @Aysel Mammadova and @Zaur Out, see **bold**' });
    expect(m.mentions).toEqual([b.user.id]); // non-members are not mentionable
    expect(m).toMatchObject({ body: 'Hello @Aysel Mammadova and @Zaur Out, see **bold**', replyCount: 0, canEdit: true, canDelete: true, author: { id: a.user.id } });
    const n = await waitFor(() => prisma.notification.findFirst({ where: { userId: b.user.id, type: 'CHAT_MENTION' } }));
    await settle();
    expect(n.title).toBe(`Kamran Aliyev hat Sie in #${ch.name} erwähnt`);
    expect(n.link).toBe(`/workspace/chat/${ch.id}?message=${m.id}`);
    expect(await notes(a.user.id)).toHaveLength(0);
    expect(await notes(outsider.id)).toHaveLength(0);
    expect(await prisma.emailLog.count({ where: { to: b.user.email } })).toBe(0);

    await post(a.agent, ch.id, { body: 'second' });
    const mine = (await channels(b.agent)).find((c) => c.id === ch.id)!;
    expect(mine).toMatchObject({ unread: 2, mentions: 1 });
    expect(mine.lastMessage).toMatchObject({ body: 'second', authorName: 'Kamran Aliyev' });
    expect((await b.agent.get('/api/chat/summary')).body).toEqual({ unread: 2, mentions: 1 });

    // Reading resets the counters; the author's own messages never count.
    expect((await b.agent.post(`/api/chat/channels/${ch.id}/read`)).status).toBe(200);
    expect((await b.agent.get('/api/chat/summary')).body).toEqual({ unread: 0, mentions: 0 });
    expect((await a.agent.get('/api/chat/summary')).body).toEqual({ unread: 0, mentions: 0 });

    // @all mentions everyone else; muted channels do not add to the unread badge.
    const all = await post(a.agent, ch.id, { body: '@all meeting now' });
    expect(all.mentions).toEqual([b.user.id]);
    await b.agent.post(`/api/chat/channels/${ch.id}/mute`).send({ value: true });
    expect((await b.agent.get('/api/chat/summary')).body).toEqual({ unread: 0, mentions: 1 });
  });

  it('validates bodies: empty messages and oversize bodies are refused', async () => {
    const a = await asStaff();
    const ch = await mkChannel(a.agent, {});
    expect((await a.agent.post(`/api/chat/channels/${ch.id}/messages`).send({ body: '   ' })).status).toBe(400);
    expect((await a.agent.post(`/api/chat/channels/${ch.id}/messages`).send({ body: 'x'.repeat(4001) })).status).toBe(400);
    expect((await a.agent.post(`/api/chat/channels/${ch.id}/messages`).send({ body: 'ok', attachmentIds: ['0123456789abcdef0123456789abcdef'] })).status).toBe(400);
  });

  it('edits within 15 minutes (author only; admins always), soft-deletes, and keeps thread counts right', async () => {
    const a = await asStaff();
    const b = await asStaff();
    const admin = await asAdmin();
    const ch = await mkChannel(a.agent, { memberIds: [b.user.id, admin.user.id] });
    const m = await post(a.agent, ch.id, { body: 'original' });

    expect((await b.agent.patch(`/api/chat/messages/${m.id}`).send({ body: 'hacked' })).status).toBe(403);
    const edited = await a.agent.patch(`/api/chat/messages/${m.id}`).send({ body: 'fixed' });
    expect(edited.status).toBe(200);
    expect(edited.body.message).toMatchObject({ body: 'fixed' });
    expect(edited.body.message.editedAt).toBeTruthy();

    // Window closed: backdate the message.
    await prisma.chatMessage.update({ where: { id: m.id }, data: { createdAt: new Date(Date.now() - 16 * 60 * 1000) } });
    expect((await a.agent.patch(`/api/chat/messages/${m.id}`).send({ body: 'too late' })).status).toBe(403);
    expect((await a.agent.get(`/api/chat/channels/${ch.id}/messages`)).body.messages[0].canEdit).toBe(false);
    const old = await post(admin.agent, ch.id, { body: 'admin note' });
    await prisma.chatMessage.update({ where: { id: old.id }, data: { createdAt: new Date(Date.now() - 60 * 60 * 1000) } });
    expect((await admin.agent.patch(`/api/chat/messages/${old.id}`).send({ body: 'admins can' })).status).toBe(200);

    // Threads
    const r1 = await post(b.agent, ch.id, { body: 'reply one', parentId: m.id });
    const r2 = await post(a.agent, ch.id, { body: 'reply two', parentId: r1.id }); // reply to a reply stays in the root thread
    expect(r2.parentId).toBe(m.id);
    const top = await list(a.agent, ch.id);
    expect(top.map((x) => x.id)).not.toContain(r1.id);
    expect(top.find((x) => x.id === m.id)).toMatchObject({ replyCount: 2 });
    expect(top.find((x) => x.id === m.id)!.lastReplyAt).toBeTruthy();
    const thread = await a.agent.get(`/api/chat/messages/${r1.id}/thread`);
    expect(thread.status).toBe(200);
    expect(thread.body.root.id).toBe(m.id);
    expect(thread.body.replies.map((x: { body: string }) => x.body)).toEqual(['reply one', 'reply two']);

    // Delete: others cannot, the author and admins can; the row stays, body is blanked, counts drop.
    expect((await a.agent.delete(`/api/chat/messages/${r1.id}`)).status).toBe(403);
    expect((await b.agent.delete(`/api/chat/messages/${r1.id}`)).status).toBe(200);
    expect((await admin.agent.delete(`/api/chat/messages/${r2.id}`)).status).toBe(200);
    const row = await prisma.chatMessage.findUnique({ where: { id: r1.id } });
    expect(row?.deletedAt).toBeTruthy();
    expect(row?.body).toBe('');
    expect((await list(a.agent, ch.id)).find((x) => x.id === m.id)!.replyCount).toBe(0);
    expect((await a.agent.get(`/api/chat/messages/${r1.id}/thread`)).body.replies).toEqual([]);
    expect((await b.agent.delete(`/api/chat/messages/${r1.id}`)).status).toBe(404);
  });

  it('reactions toggle and are grouped; pins need the owner or an admin', async () => {
    const a = await asStaff();
    const b = await asStaff();
    const ch = await mkChannel(a.agent, { memberIds: [b.user.id] });
    const m = await post(a.agent, ch.id, { body: 'react to me' });
    expect((await a.agent.post(`/api/chat/messages/${m.id}/reactions`).send({ emoji: '👍' })).body).toMatchObject({ added: true, reactions: [{ emoji: '👍', count: 1, me: true }] });
    expect((await b.agent.post(`/api/chat/messages/${m.id}/reactions`).send({ emoji: '👍' })).body.reactions).toEqual([{ emoji: '👍', count: 2, me: true, userIds: expect.any(Array) }]);
    expect((await b.agent.post(`/api/chat/messages/${m.id}/reactions`).send({ emoji: '🎉' })).body.reactions).toHaveLength(2);
    const off = await a.agent.post(`/api/chat/messages/${m.id}/reactions`).send({ emoji: '👍' });
    expect(off.body.added).toBe(false);
    expect(off.body.reactions.find((r: { emoji: string }) => r.emoji === '👍')).toMatchObject({ count: 1, me: false });
    expect((await a.agent.post(`/api/chat/messages/${m.id}/reactions`).send({ emoji: 'a b' })).status).toBe(400);
    const listed = await list(b.agent, ch.id);
    expect(listed[0].reactions).toEqual(expect.arrayContaining([expect.objectContaining({ emoji: '🎉', count: 1, me: true })]));

    expect((await b.agent.post(`/api/chat/messages/${m.id}/pin`)).status).toBe(403);
    expect((await a.agent.post(`/api/chat/messages/${m.id}/pin`)).body.message.pinnedAt).toBeTruthy();
    const pinned = await b.agent.get(`/api/chat/channels/${ch.id}/pinned`);
    expect(pinned.body.messages.map((x: { id: string }) => x.id)).toEqual([m.id]);
    expect((await a.agent.post(`/api/chat/messages/${m.id}/unpin`)).body.message.pinnedAt).toBeNull();
    expect((await b.agent.get(`/api/chat/channels/${ch.id}/pinned`)).body.messages).toEqual([]);
  });

  it('paginates newest first with a cursor', async () => {
    const a = await asStaff();
    const ch = await mkChannel(a.agent, {});
    for (let i = 0; i < 5; i++) {
      const m = await post(a.agent, ch.id, { body: `m${i}` });
      await prisma.chatMessage.update({ where: { id: m.id }, data: { createdAt: new Date(Date.now() - (5 - i) * 1000) } });
    }
    const p1 = await a.agent.get(`/api/chat/channels/${ch.id}/messages?limit=2`);
    expect(p1.body.messages.map((m: { body: string }) => m.body)).toEqual(['m4', 'm3']);
    expect(p1.body.hasMore).toBe(true);
    const before = p1.body.messages[1].createdAt;
    const p2 = await a.agent.get(`/api/chat/channels/${ch.id}/messages?limit=2&before=${encodeURIComponent(before)}`);
    expect(p2.body.messages.map((m: { body: string }) => m.body)).toEqual(['m2', 'm1']);
    const p3 = await a.agent.get(`/api/chat/channels/${ch.id}/messages?limit=2&before=${encodeURIComponent(p2.body.messages[1].createdAt)}`);
    expect(p3.body.messages.map((m: { body: string }) => m.body)).toEqual(['m0']);
    expect(p3.body.hasMore).toBe(false);
  });

  it('searches my channels only (and one channel when asked)', async () => {
    const a = await asStaff();
    const b = await asStaff();
    const mine = await mkChannel(a.agent, { kind: 'PRIVATE' });
    const shared = await mkChannel(a.agent, { kind: 'PRIVATE', memberIds: [b.user.id] });
    await post(a.agent, mine.id, { body: 'embassy appointment confirmed' });
    await post(a.agent, shared.id, { body: 'embassy documents ready' });
    await post(a.agent, shared.id, { body: 'unrelated note' });
    const res = await b.agent.get('/api/chat/search?q=embassy');
    expect(res.status).toBe(200);
    expect(res.body.messages.map((m: { body: string }) => m.body)).toEqual(['embassy documents ready']);
    expect(res.body.messages[0].channel).toMatchObject({ id: shared.id, name: shared.name });
    const both = await a.agent.get('/api/chat/search?q=embassy');
    expect(both.body.messages).toHaveLength(2);
    const one = await a.agent.get(`/api/chat/search?q=embassy&channelId=${mine.id}`);
    expect(one.body.messages.map((m: { body: string }) => m.body)).toEqual(['embassy appointment confirmed']);
    // Short words use the LIKE path.
    const short = await a.agent.get('/api/chat/search?q=em');
    expect(short.body.mode).toBe('like');
    expect(short.body.messages).toHaveLength(2);
  });

  it('typing is rate limited to one signal per two seconds per channel', async () => {
    const a = await asStaff();
    const ch = await mkChannel(a.agent, {});
    expect((await a.agent.post(`/api/chat/channels/${ch.id}/typing`)).status).toBe(202);
    expect((await a.agent.post(`/api/chat/channels/${ch.id}/typing`)).status).toBe(429);
    const other = await mkChannel(a.agent, {});
    expect((await a.agent.post(`/api/chat/channels/${other.id}/typing`)).status).toBe(202);
  });

  it('notifies a DM partner who is not connected, but not one with an open realtime stream', async () => {
    const a = await asStaff({ firstName: 'Kamran', lastName: 'Aliyev' });
    const offline = await asStaff({ locale: 'en' });
    const online = await asStaff({ locale: 'en' });
    const dm1 = (await a.agent.post('/api/chat/dm').send({ userId: offline.user.id })).body.channel;
    const dm2 = (await a.agent.post('/api/chat/dm').send({ userId: online.user.id })).body.channel;
    const stop = subscribe(online.user.id, () => undefined);
    try {
      await post(a.agent, dm1.id, { body: 'are you there?' });
      await post(a.agent, dm2.id, { body: 'are you there?' });
      const n = await waitFor(() => prisma.notification.findFirst({ where: { userId: offline.user.id, type: 'CHAT_DM' } }));
      await settle();
      expect(n.title).toBe('Kamran Aliyev: new message');
      expect(n.body).toBe('are you there?');
      expect(await notes(online.user.id)).toHaveLength(0);
    } finally {
      stop();
    }
  });
});

describe('chat: attachments', () => {
  it('uploads a file, attaches it to a message and serves it to channel readers only', async () => {
    const a = await asStaff();
    const b = await asStaff();
    const outsider = await asStaff();
    const ch = await mkChannel(a.agent, { kind: 'PRIVATE', memberIds: [b.user.id] });
    const up = await a.agent.post('/api/chat/attachments').attach('file', await makePdf('Report'), { filename: 'Hesabat ə.pdf', contentType: 'application/pdf' });
    expect(up.status).toBe(201);
    expect(up.body.attachment).toMatchObject({ filename: 'Hesabat ə.pdf', mimeType: 'application/pdf' });
    const key = up.body.attachment.id as string;
    // Only the uploader may attach it.
    expect((await b.agent.post(`/api/chat/channels/${ch.id}/messages`).send({ body: '', attachmentIds: [key] })).status).toBe(400);
    const m = await post(a.agent, ch.id, { body: '', attachmentIds: [key] });
    const att = (m.attachments as { id: string; filename: string }[])[0];
    expect(att.filename).toBe('Hesabat ə.pdf');
    // Attached once: the pending key is gone.
    expect((await a.agent.post(`/api/chat/channels/${ch.id}/messages`).send({ body: 'again', attachmentIds: [key] })).status).toBe(400);

    const got = await b.agent.get(`/api/chat/attachments/${att.id}`).buffer(true).parse(binaryParser);
    expect(got.status).toBe(200);
    expect(got.headers['content-type']).toBe('application/pdf');
    expect(got.headers['content-disposition']).toMatch(/^inline/);
    expect(got.body.subarray(0, 5).toString()).toBe('%PDF-');
    const dl = await b.agent.get(`/api/chat/attachments/${att.id}?download=1`).buffer(true).parse(binaryParser);
    expect(dl.headers['content-disposition']).toMatch(/^attachment/);
    expect((await outsider.agent.get(`/api/chat/attachments/${att.id}`)).status).toBe(404);
    const files = await b.agent.get(`/api/chat/channels/${ch.id}/files`);
    expect(files.body.files.map((f: { id: string }) => f.id)).toEqual([att.id]);

    // Content checks and type restrictions apply.
    expect((await a.agent.post('/api/chat/attachments').attach('file', Buffer.from('not a pdf'), { filename: 'x.pdf', contentType: 'application/pdf' })).status).toBe(400);
    expect((await a.agent.post('/api/chat/attachments').attach('file', Buffer.from('<html>'), { filename: 'x.html', contentType: 'text/html' })).status).toBe(400);
    const png = await a.agent.post('/api/chat/attachments').attach('file', SAMPLE.png, { filename: 'pic.png', contentType: 'image/png' });
    expect(png.status).toBe(201);
  });

  it('links team-drive files the sender may view; files in folders others cannot open are refused', async () => {
    const a = await asStaff();
    const b = await asStaff();
    const ch = await mkChannel(a.agent, { memberIds: [b.user.id] });
    // A restricted folder in the shared workspace: only A may open it.
    const { sharedId } = await ensureRoots();
    const locked = await prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FOLDER', name: 'A only', parentId: sharedId, inheritPermissions: false, grants: { create: { userId: a.user.id, access: 'EDIT' } } } });
    const up = await a.agent.post(`/api/drive/nodes/${locked.id}/files`).attach('file', await makePdf('Drive'), { filename: 'contract.pdf', contentType: 'application/pdf' });
    expect(up.status).toBe(201);
    const nodeId = up.body.item.id as string;

    expect((await b.agent.post('/api/chat/attachments/from-drive').send({ driveNodeId: nodeId })).status).toBe(404);
    const link = await a.agent.post('/api/chat/attachments/from-drive').send({ driveNodeId: nodeId });
    expect(link.status).toBe(201);
    expect(link.body.attachment).toMatchObject({ filename: 'contract.pdf', driveNodeId: nodeId });
    const m = await post(a.agent, ch.id, { body: 'see the contract', attachmentIds: [link.body.attachment.id] });
    const att = (m.attachments as { id: string; driveNodeId: string }[])[0];
    expect(att.driveNodeId).toBe(nodeId);
    // Shared into the channel: a member who has no drive access to the file can open it from the chat.
    const got = await b.agent.get(`/api/chat/attachments/${att.id}`).buffer(true).parse(binaryParser);
    expect(got.status).toBe(200);
    expect(got.body.subarray(0, 5).toString()).toBe('%PDF-');
    expect((await a.agent.post('/api/chat/attachments/from-drive').send({ driveNodeId: locked.id })).status).toBe(400);
  });
});
