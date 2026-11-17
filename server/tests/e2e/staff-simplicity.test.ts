import { describe, expect, it } from 'vitest';
import { anon, asAdmin, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { expectStatus } from '../helpers/workflow';
import { ADMIN_PAGE_HELP } from '../../src/lib/adminHelp/index.js';
import { buildHelpArticle, syncAdminHelpArticles } from '../../src/lib/ops/kbSystemArticles.js';

describe('work profiles + simple sidebar (GET/PUT /api/admin/me/nav, PUT /api/admin/nav/profiles/:userId)', () => {
  it('defaults: staff → case handling, admins → management, full view until a profile is chosen', async () => {
    const staff = await asStaff();
    expect(expectStatus(await staff.agent.get('/api/admin/me/nav'), 200).body).toMatchObject({ workProfile: null, defaultWorkProfile: 'CASES', navView: 'full' });
    const admin = await asAdmin();
    expect(expectStatus(await admin.agent.get('/api/admin/me/nav'), 200).body).toMatchObject({ workProfile: null, defaultWorkProfile: 'OWNER', navView: 'full' });
  });

  it('own profile turns the simple view on; the own view choice wins; invalid values are rejected', async () => {
    const staff = await asStaff();
    expect(expectStatus(await staff.agent.put('/api/admin/me/nav').send({ workProfile: 'SALES' }), 200).body).toMatchObject({ workProfile: 'SALES', navView: 'simple' });
    expect(expectStatus(await staff.agent.put('/api/admin/me/nav').send({ navView: 'full' }), 200).body).toMatchObject({ workProfile: 'SALES', navView: 'full' });
    expect((await staff.agent.put('/api/admin/me/nav').send({ workProfile: 'BOSS' })).status).toBe(400);
    expect((await staff.agent.put('/api/admin/me/nav').send({ navView: 'tiny' })).status).toBe(400);
    expect(expectStatus(await staff.agent.put('/api/admin/me/nav').send({ workProfile: null, navView: null }), 200).body).toMatchObject({ workProfile: null, navView: 'full' });
    // the desk still drives the default profile
    expect(expectStatus(await staff.agent.put('/api/admin/me/nav').send({ desk: 'FINANCE' }), 200).body.defaultWorkProfile).toBe('FINANCE');
  });

  it('admins assign a profile per staff member (listed with the desks); staff cannot', async () => {
    const staff = await asStaff();
    const other = await asStaff();
    expect((await staff.agent.put(`/api/admin/nav/profiles/${other.user.id}`).send({ workProfile: 'FINANCE' })).status).toBe(403);
    const admin = await asAdmin();
    const r = expectStatus(await admin.agent.put(`/api/admin/nav/profiles/${staff.user.id}`).send({ workProfile: 'EMPLOYERS' }), 200).body;
    expect(r).toMatchObject({ workProfile: 'EMPLOYERS', defaultWorkProfile: 'CASES' });
    expect(expectStatus(await staff.agent.get('/api/admin/me/nav'), 200).body).toMatchObject({ workProfile: 'EMPLOYERS', navView: 'simple' });
    const rows = expectStatus(await admin.agent.get('/api/admin/nav/desks'), 200).body.items as { id: string; workProfile: string | null }[];
    expect(rows.find((x) => x.id === staff.user.id)?.workProfile).toBe('EMPLOYERS');
    expect((await admin.agent.put(`/api/admin/nav/profiles/${staff.user.id}`).send({ workProfile: 'X' })).status).toBe(400);
    expect((await admin.agent.put('/api/admin/nav/profiles/nobody').send({ workProfile: 'SALES' })).status).toBe(404);
    expect(await prisma.auditLog.count({ where: { action: 'WORK_PROFILE_SET' } })).toBe(1);
  });
});

describe('Knowledge Base page guides (system articles)', () => {
  it('seeds once, updates untouched ones, keeps staff edits; GET /kb/system finds them', async () => {
    const entries = ADMIN_PAGE_HELP.slice(0, 3);
    expect(await syncAdminHelpArticles(prisma, { entries })).toMatchObject({ create: 3, update: 0 });
    expect(await syncAdminHelpArticles(prisma, { entries })).toMatchObject({ create: 0, update: 0, keep: 3 });

    const first = buildHelpArticle(entries[0]);
    const staff = await asStaff();
    expect((await anon().get(`/api/admin/ops/kb/system?key=${encodeURIComponent(first.systemKey)}`)).status).toBe(401);
    const got = expectStatus(await staff.agent.get(`/api/admin/ops/kb/system?key=${encodeURIComponent(first.systemKey)}`), 200).body.article;
    expect(got).toMatchObject({ title: first.title, systemKey: first.systemKey });
    expect((await staff.agent.get('/api/admin/ops/kb/system?key=admin-page:nope')).status).toBe(404);

    // staff edits article 1; the shipped text of 1 and 2 changes → 2 is updated, 1 kept
    await prisma.kbArticle.update({ where: { systemKey: first.systemKey }, data: { body: 'edited by staff' } });
    const changed = entries.map((e) => ({ ...e, text: { ...e.text, az: { ...e.text.az, purpose: `${e.text.az.purpose} (v2)` } } }));
    expect(await syncAdminHelpArticles(prisma, { entries: changed })).toMatchObject({ create: 0, update: 2, edited: 1 });
    expect((await prisma.kbArticle.findUnique({ where: { systemKey: first.systemKey } }))?.body).toBe('edited by staff');
    const second = await prisma.kbArticle.findUnique({ where: { systemKey: buildHelpArticle(entries[1]).systemKey } });
    expect(second?.body).toContain('(v2)');
  });
});
