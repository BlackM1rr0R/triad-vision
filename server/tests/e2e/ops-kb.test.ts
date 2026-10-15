import { beforeEach, describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { expectStatus } from '../helpers/workflow';
import { cleanOps } from './ops.fixtures';

beforeEach(cleanOps);

describe('knowledge base', () => {
  it('categories are admin-managed; staff write articles and edit their own; admins pin, delete and edit anything', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    const other = await asStaff();

    expect((await staff.agent.post('/api/admin/ops/kb/categories').send({ name: 'Viza' })).status).toBe(403);
    const cat = expectStatus(await admin.agent.post('/api/admin/ops/kb/categories').send({ name: 'Viza' }), 201).body.category;
    const cat2 = expectStatus(await admin.agent.post('/api/admin/ops/kb/categories').send({ name: 'Şablonlar' }), 201).body.category;
    expect(cat2.sortOrder).toBe(cat.sortOrder + 1);

    const created = expectStatus(
      await staff.agent.post('/api/admin/ops/kb/articles').send({
        title: 'Anmeldung necə edilir',
        body: '# Anmeldung\n\nBürgeramt-da **qeydiyyat** üçün:\n\n- pasport\n- Wohnungsgeberbestätigung',
        categoryId: cat.id,
        tags: ['Anmeldung', 'almaniya', 'anmeldung'],
      }),
      201,
    );
    const a = created.body.article;
    expect(a.tags).toEqual(['anmeldung', 'almaniya']);
    expect(a.updatedBy.id).toBe(staff.user.id);
    expect(a.published).toBe(true);
    expect(a.pinned).toBe(false);
    // Staff cannot pin, not even their own.
    expect((await staff.agent.post('/api/admin/ops/kb/articles').send({ title: 'Pinned', body: 'x', pinned: true })).status).toBe(403);
    expect((await staff.agent.patch(`/api/admin/ops/kb/articles/${a.id}`).send({ pinned: true })).status).toBe(403);

    // Another staff member cannot edit it; the author can; the admin can.
    expect((await other.agent.patch(`/api/admin/ops/kb/articles/${a.id}`).send({ title: 'Hijacked' })).status).toBe(403);
    expectStatus(await staff.agent.patch(`/api/admin/ops/kb/articles/${a.id}`).send({ title: 'Anmeldung: addım-addım' }), 200);
    const pinned = expectStatus(await admin.agent.patch(`/api/admin/ops/kb/articles/${a.id}`).send({ pinned: true, categoryId: cat2.id }), 200).body.article;
    expect(pinned.pinned).toBe(true);
    expect(pinned.category.id).toBe(cat2.id);
    expect(pinned.updatedBy.id).toBe(admin.user.id);
    expect((await admin.agent.patch(`/api/admin/ops/kb/articles/${a.id}`).send({ categoryId: 'nope' })).status).toBe(400);
    // The admin's edit made them the last editor: ownership for staff follows updatedBy.
    expect((await staff.agent.patch(`/api/admin/ops/kb/articles/${a.id}`).send({ title: 'Mine again' })).status).toBe(403);

    // Lists: by category, pinned only, by tag; the detail returns the markdown body.
    const inCat2 = expectStatus(await staff.agent.get(`/api/admin/ops/kb/articles?categoryId=${cat2.id}`), 200).body.items;
    expect(inCat2.map((x: { id: string }) => x.id)).toEqual([a.id]);
    expect(inCat2[0].body).toBeUndefined();
    expect(expectStatus(await staff.agent.get('/api/admin/ops/kb/articles?pinned=true'), 200).body.items).toHaveLength(1);
    expect(expectStatus(await staff.agent.get('/api/admin/ops/kb/articles?tag=ALMANIYA'), 200).body.items).toHaveLength(1);
    expect(expectStatus(await staff.agent.get('/api/admin/ops/kb/articles?tag=none'), 200).body.items).toHaveLength(0);
    const detail = expectStatus(await other.agent.get(`/api/admin/ops/kb/articles/${a.id}`), 200).body.article;
    expect(detail.body).toContain('**qeydiyyat**');
    const cats = expectStatus(await staff.agent.get('/api/admin/ops/kb/categories'), 200).body.categories;
    expect(cats.find((c: { id: string }) => c.id === cat2.id).articles).toBe(1);

    // Unpublished drafts are visible to their author and admins only.
    const draft = expectStatus(await other.agent.post('/api/admin/ops/kb/articles').send({ title: 'Draft', body: 'wip', published: false }), 201).body.article;
    expect((await staff.agent.get(`/api/admin/ops/kb/articles/${draft.id}`)).status).toBe(404);
    expect((await other.agent.get(`/api/admin/ops/kb/articles/${draft.id}`)).status).toBe(200);
    expect((await admin.agent.get(`/api/admin/ops/kb/articles/${draft.id}`)).status).toBe(200);
    expect(expectStatus(await staff.agent.get('/api/admin/ops/kb/articles'), 200).body.items.map((x: { id: string }) => x.id)).not.toContain(draft.id);

    // Delete: admin only. Deleting a category keeps its articles.
    expect((await staff.agent.delete(`/api/admin/ops/kb/articles/${a.id}`)).status).toBe(403);
    expectStatus(await admin.agent.delete(`/api/admin/ops/kb/categories/${cat2.id}`), 200);
    expect((await prisma.kbArticle.findUniqueOrThrow({ where: { id: a.id } })).categoryId).toBeNull();
    expectStatus(await admin.agent.delete(`/api/admin/ops/kb/articles/${a.id}`), 200);
    expect(await prisma.kbArticle.findUnique({ where: { id: a.id } })).toBeNull();

    expect((await (await asClient()).agent.get('/api/admin/ops/kb/articles')).status).toBe(403);
  });

  it('search finds articles by title and body words (fulltext or LIKE) with an excerpt', async () => {
    const staff = await asStaff();
    const admin = await asAdmin();
    const mk = (title: string, body: string, published = true) =>
      staff.agent.post('/api/admin/ops/kb/articles').send({ title, body, published });
    expectStatus(await mk('Wohnungsgeberbestätigung izahı', 'Ev sahibinin təsdiqi Anmeldung üçün lazımdır. Sənəd ev sahibi tərəfindən imzalanır.'), 201);
    expectStatus(await mk('Şablon: sənəd rədd cavabı', 'Hörmətli {ad}, yüklədiyiniz sənəd keyfiyyət səbəbindən qəbul edilmədi.'), 201);
    expectStatus(await mk('Gizli qeyd', 'Anmeldung haqqında daxili qeyd', false), 201);

    const r1 = expectStatus(await staff.agent.get('/api/admin/ops/kb/search?q=Anmeldung'), 200);
    expect(['fulltext', 'like']).toContain(r1.body.mode);
    expect(r1.body.items).toHaveLength(1);
    expect(r1.body.items[0].title).toBe('Wohnungsgeberbestätigung izahı');
    expect(r1.body.items[0].excerpt).toContain('Anmeldung');
    expect(r1.body.items[0].body).toBeUndefined();

    // Admins also search drafts.
    expect(expectStatus(await admin.agent.get('/api/admin/ops/kb/search?q=Anmeldung'), 200).body.items).toHaveLength(2);

    const r2 = expectStatus(await staff.agent.get('/api/admin/ops/kb/search?q=keyfiyyət'), 200);
    expect(r2.body.items.map((i: { title: string }) => i.title)).toEqual(['Şablon: sənəd rədd cavabı']);

    // A fragment too short for the fulltext index still works through the LIKE fallback.
    const r3 = expectStatus(await staff.agent.get('/api/admin/ops/kb/search?q=%7Bad%7D'), 200);
    expect(r3.body.items).toHaveLength(1);

    expect(expectStatus(await staff.agent.get('/api/admin/ops/kb/search?q=zzzz'), 200).body.items).toHaveLength(0);
    expect((await staff.agent.get('/api/admin/ops/kb/search')).status).toBe(400);
  });
});
