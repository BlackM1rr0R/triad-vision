import { beforeEach, describe, expect, it } from 'vitest';
import { anon, asStaff, asSuperAdmin, type Agent } from '../helpers/api';
import { prisma, waitFor } from '../helpers/db';
import { expectStatus } from '../helpers/workflow';
import { clearCache } from '../../src/lib/cache.js';
import { asCandidate, cleanJobs, createVacancy } from './vacancies.fixtures';

/**
 * Per-vacancy "Aktiv / Deaktiv" (lib/vacancyActive.ts, routes/admin/vacancyActive.ts):
 *   - the toggle (one + bulk) needs employers:edit, is audit-logged and updates the admin status counts;
 *   - deactivated vacancies stay public (list with ?closed=1 after the open ones, detail, picker) flagged
 *     `active: false`; applying answers 409 VACANCY_CLOSED; drafts / pending ones are never public.
 */

beforeEach(cleanJobs);

const DAY = 24 * 60 * 60 * 1000;

const templateId = async (sup: Agent, key: string) => {
  const res = expectStatus(await sup.get('/api/admin/access/staff/templates'), 200);
  const t = (res.body.templates as { id: string; key: string | null }[]).find((x) => x.key === key);
  if (!t) throw new Error(`no template ${key}`);
  return t.id;
};

describe('admin toggle', () => {
  it('deactivates and reactivates one vacancy, audited, and the status counts follow', async () => {
    const staff = await asStaff();
    const v = await createVacancy({ slug: 'toggle-me' });
    const before = expectStatus(await staff.agent.get('/api/admin/vacancies'), 200).body.counts;
    expect(before).toMatchObject({ OPEN: 1 });

    const off = expectStatus(await staff.agent.post(`/api/admin/vacancies/${v.id}/active`).send({ active: false }), 200);
    expect(off.body.vacancy.status).toBe('CLOSED');
    expect(expectStatus(await staff.agent.get('/api/admin/vacancies'), 200).body.counts).toMatchObject({ CLOSED: 1 });
    const audited = await waitFor(() => prisma.auditLog.findFirst({ where: { action: 'VACANCY_DEACTIVATED', target: `vacancy:${v.id}` } }));
    expect(audited.details).toMatchObject({ from: 'OPEN', to: 'CLOSED' });
    expect((await staff.agent.post(`/api/admin/vacancies/${v.id}/active`).send({ active: false })).body.error).toBe('ALREADY_INACTIVE');

    const on = expectStatus(await staff.agent.post(`/api/admin/vacancies/${v.id}/active`).send({ active: true }), 200);
    expect(on.body.vacancy.status).toBe('OPEN');
    expect(on.body.vacancy.publishedAt).toBe(v.publishedAt!.toISOString()); // first publication date kept
    await waitFor(() => prisma.auditLog.findFirst({ where: { action: 'VACANCY_ACTIVATED', target: `vacancy:${v.id}` } }));
    expect(expectStatus(await staff.agent.get('/api/admin/vacancies'), 200).body.counts).toMatchObject({ OPEN: 1 });
  });

  it('refuses drafts, passed closing dates and unknown ids', async () => {
    const staff = await asStaff();
    const draft = await createVacancy({ status: 'DRAFT', publishedAt: null });
    const expired = await createVacancy({ status: 'CLOSED', closesAt: new Date(Date.now() - DAY) });
    const r1 = await staff.agent.post(`/api/admin/vacancies/${draft.id}/active`).send({ active: true });
    expect([r1.status, r1.body.error]).toEqual([409, 'NOT_PUBLISHED']);
    const r2 = await staff.agent.post(`/api/admin/vacancies/${expired.id}/active`).send({ active: true });
    expect([r2.status, r2.body.error]).toEqual([409, 'CLOSING_DATE_PASSED']);
    expect((await staff.agent.post('/api/admin/vacancies/nope/active').send({ active: true })).status).toBe(404);
    expect((await staff.agent.post(`/api/admin/vacancies/${draft.id}/active`).send({})).status).toBe(400);
  });

  it('bulk: switches every eligible vacancy and reports the others', async () => {
    const staff = await asStaff();
    const a = await createVacancy();
    const b = await createVacancy();
    const draft = await createVacancy({ status: 'DRAFT', publishedAt: null });
    const res = expectStatus(await staff.agent.post('/api/admin/vacancies/active').send({ ids: [a.id, b.id, draft.id, 'nope'], active: false }), 200).body;
    expect(res.changed).toBe(2);
    expect(res.results).toEqual([
      { id: a.id, ok: true },
      { id: b.id, ok: true },
      { id: draft.id, ok: false, error: 'NOT_PUBLISHED' },
      { id: 'nope', ok: false, error: 'VACANCY_NOT_FOUND' },
    ]);
    expect(await prisma.vacancy.count({ where: { id: { in: [a.id, b.id] }, status: 'CLOSED' } })).toBe(2);
    const bulkAudit = await waitFor(() => prisma.auditLog.findFirst({ where: { action: 'VACANCY_DEACTIVATED', target: `vacancy:${a.id}` } }));
    expect(bulkAudit.details).toMatchObject({ bulk: true });
    expect(expectStatus(await staff.agent.post('/api/admin/vacancies/active').send({ ids: [a.id, b.id], active: true }), 200).body.changed).toBe(2);
  });

  it('needs employers:edit (a read-only template gets 403, the vacancy is unchanged)', async () => {
    const sup = await asSuperAdmin();
    const staff = await asStaff();
    const accountant = await templateId(sup.agent, 'accountant'); // employers: view only
    expectStatus(await sup.agent.put(`/api/admin/access/staff/users/${staff.user.id}`).send({ templateId: accountant }), 200);
    const v = await createVacancy();
    expect((await staff.agent.post(`/api/admin/vacancies/${v.id}/active`).send({ active: false })).status).toBe(403);
    expect((await staff.agent.post('/api/admin/vacancies/active').send({ ids: [v.id], active: false })).status).toBe(403);
    expect((await prisma.vacancy.findUniqueOrThrow({ where: { id: v.id } })).status).toBe('OPEN');
    // Clients never reach the admin API.
    const client = await asCandidate();
    expect((await client.agent.post(`/api/admin/vacancies/${v.id}/active`).send({ active: false })).status).toBe(403);
  });
});

describe('deactivated vacancies on the public side', () => {
  it('are listed after the open ones with ?closed=1 (flagged), never without it; drafts never', async () => {
    await createVacancy({ slug: 'open-new', publishedAt: new Date() });
    await createVacancy({ slug: 'open-old', publishedAt: new Date(Date.now() - DAY) });
    await createVacancy({ slug: 'shut', status: 'CLOSED' });
    await createVacancy({ slug: 'expired', closesAt: new Date(Date.now() - DAY) });
    await createVacancy({ slug: 'draft', status: 'DRAFT', publishedAt: null });
    await createVacancy({ slug: 'pending', status: 'PENDING', publishedAt: null });
    await createVacancy({ slug: 'never-public', status: 'CLOSED', publishedAt: null });

    const plain = expectStatus(await anon().get('/api/vacancies'), 200).body;
    expect(plain.items.map((v: { slug: string }) => v.slug)).toEqual(['open-new', 'open-old']);
    expect(plain.total).toBe(2);

    const all = expectStatus(await anon().get('/api/vacancies?closed=1'), 200).body;
    const slugs = all.items.map((v: { slug: string }) => v.slug);
    expect(slugs.slice(0, 2)).toEqual(['open-new', 'open-old']);
    expect(slugs.slice(2).sort()).toEqual(['expired', 'shut']);
    expect(all.items.map((v: { active: boolean }) => v.active)).toEqual([true, true, false, false]);
    expect(all).toMatchObject({ total: 4, openTotal: 2 });
    for (const hidden of ['draft', 'pending', 'never-public']) expect(slugs).not.toContain(hidden);

    // Pagination runs over the combined list.
    const page2 = expectStatus(await anon().get('/api/vacancies?closed=1&pageSize=3&page=2'), 200).body;
    expect(page2.items).toHaveLength(1);
    expect(page2.items[0].active).toBe(false);

    for (const hidden of ['draft', 'pending', 'never-public']) expect((await anon().get(`/api/vacancies/${hidden}`)).status, hidden).toBe(404);
    expect(expectStatus(await anon().get('/api/vacancies/shut'), 200).body.vacancy).toMatchObject({ slug: 'shut', active: false });
  });

  it('the start-case picker lists them last and not selectable; applying is refused with 409', async () => {
    const open = await createVacancy();
    const shut = await createVacancy({ status: 'CLOSED' });
    await createVacancy({ status: 'DRAFT', publishedAt: null });
    expect(expectStatus(await anon().get('/api/vacancies/options'), 200).body.items.map((v: { id: string }) => v.id)).toEqual([open.id]);
    const options = expectStatus(await anon().get('/api/vacancies/options?closed=1'), 200).body.items;
    expect(options.map((v: { id: string; active: boolean }) => [v.id, v.active])).toEqual([
      [open.id, true],
      [shut.id, false],
    ]);

    const { agent } = await asCandidate();
    const res = await agent.post(`/api/vacancies/${shut.slug}/apply`).send({});
    expect([res.status, res.body.error]).toEqual([409, 'VACANCY_CLOSED']);
    // The candidate's view of the page still loads (match + "applications closed").
    expect((await agent.get(`/api/vacancies/${shut.slug}/me`)).status).toBe(200);
  });

  it('crawler status: deactivated pages answer 200 (noindex), drafts 404', async () => {
    const shut = await createVacancy({ status: 'CLOSED' });
    const draft = await createVacancy({ status: 'DRAFT', publishedAt: null });
    clearCache(); // the crawler data is cached for a few minutes
    expect((await anon().get('/__seo/status').query({ path: `/jobs/${shut.slug}` })).text).toBe('');
    expect((await anon().get('/__seo/status').query({ path: `/jobs/${draft.slug}` })).text).toBe('404');
  });
});
