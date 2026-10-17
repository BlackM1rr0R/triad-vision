import { describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff, asSuperAdmin } from '../helpers/api';
import { prisma, emailsTo } from '../helpers/db';
import { createVisaCategory, l10n } from '../helpers/factories';

const children = async (agent: Awaited<ReturnType<typeof asSuperAdmin>>['agent'], id: string) =>
  (await agent.get(`/api/drive/nodes/${encodeURIComponent(id)}/children`)).body as { items: { id: string; name: string; parentId: string }[]; path: { id: string }[] };

describe('cases area grouped by application type and visa category', () => {
  it('nests Ausbildung and work cases by type, then category, then client', async () => {
    const su = await asSuperAdmin();
    const courier = await createVisaCategory({ slug: 'kuryer', title: l10n('Kuryer'), visaLabel: '§18b' });
    const a = await asClient({ firstName: 'Aysel', lastName: 'Ausbildung' });
    const w = await asClient({ firstName: 'Kamran', lastName: 'Kuryer' });
    const aCase = (await a.agent.post('/api/cases').send({ visaType: 'AUSBILDUNG' })).body.case;
    const wCase = (await w.agent.post('/api/cases').send({ visaType: 'WORK', visaCategoryId: courier.id })).body.case;

    const casesRoot = (await su.agent.get('/api/drive/roots')).body.cases.id as string;
    const types = await children(su.agent, casesRoot);
    expect(types.items.map((i) => i.id)).toEqual(['vt:WORK', 'vt:AUSBILDUNG']);

    const work = await children(su.agent, 'vt:WORK');
    expect(work.items).toEqual([expect.objectContaining({ id: `vc:WORK:${courier.id}`, name: '§18b · Kuryer de' })]);
    const inCat = await children(su.agent, `vc:WORK:${courier.id}`);
    expect(inCat.items.map((i) => i.id)).toEqual([`case:${wCase.id}`]);
    expect(inCat.path.map((p) => p.id).slice(1)).toEqual(['vt:WORK', `vc:WORK:${courier.id}`]);

    const ausb = await children(su.agent, 'vt:AUSBILDUNG');
    expect(ausb.items.map((i) => i.id)).toEqual([`case:${aCase.id}`]);
  });

  it('lets only a super admin delete a case document from the case page', async () => {
    const su = await asSuperAdmin();
    const admin = await asAdmin();
    const client = await asClient();
    const c = (await client.agent.post('/api/cases').send({ visaType: 'WORK' })).body.case;
    const req = await prisma.documentRequirement.findFirstOrThrow({ where: { caseId: c.id, stage: 'INITIAL' } });
    const doc = await prisma.document.create({
      data: { caseId: c.id, requirementId: req.id, stage: 'INITIAL', originalName: 'cv.pdf', storedName: `missing-${Date.now()}.pdf`, mimeType: 'application/pdf', size: 10, status: 'ACCEPTED', uploadedById: client.user.id },
    });
    expect((await admin.agent.delete(`/api/admin/cases/${c.id}/documents/${doc.id}`)).status).toBe(403);
    expect((await su.agent.delete(`/api/admin/cases/${c.id}/documents/${doc.id}`)).status).toBe(200);
    expect(await prisma.document.count({ where: { id: doc.id } })).toBe(0);
    expect(await prisma.caseEvent.count({ where: { caseId: c.id, note: { contains: 'cv.pdf' } } })).toBe(1);
  });
});

describe('super admin deletes whole case folders', () => {
  it('removes every document of a stage or a case folder, keeps the case', async () => {
    const su = await asSuperAdmin();
    const admin = await asAdmin();
    const client = await asClient();
    const c = (await client.agent.post('/api/cases').send({ visaType: 'WORK' })).body.case;
    const reqs = await prisma.documentRequirement.findMany({ where: { caseId: c.id, stage: 'INITIAL' }, take: 2 });
    for (const [i, r] of reqs.entries()) {
      await prisma.document.create({ data: { caseId: c.id, requirementId: r.id, stage: 'INITIAL', originalName: `f${i}.pdf`, storedName: `missing-${i}-${Date.now()}.pdf`, mimeType: 'application/pdf', size: 1, status: i ? 'REJECTED' : 'ACCEPTED', uploadedById: client.user.id } });
    }
    expect((await admin.agent.post('/api/drive/case-documents/delete').send({ ids: [`case:${c.id}:INITIAL`] })).status).toBe(403);
    const res = await su.agent.post('/api/drive/case-documents/delete').send({ ids: [`case:${c.id}:INITIAL`] });
    expect(res.body.results[0]).toMatchObject({ ok: true, deleted: 2 });
    expect(await prisma.document.count({ where: { caseId: c.id } })).toBe(0);
    expect(await prisma.case.count({ where: { id: c.id } })).toBe(1);
    expect((await su.agent.post('/api/drive/case-documents/delete').send({ ids: [`case:${c.id}`] })).body.results[0]).toMatchObject({ ok: true, deleted: 0 });
  });
});

describe('task assignment e-mail', () => {
  it('e-mails assignees even when they turned e-mail notifications off', async () => {
    const creator = await asAdmin();
    const staff = await asStaff();
    await prisma.user.update({ where: { id: staff.user.id }, data: { emailNotifications: false } });
    const res = await creator.agent.post('/api/tasks').send({ title: 'Ümumi kontrol', assigneeIds: [staff.user.id] });
    expect(res.status).toBe(201);
    const mails = await emailsTo(staff.user.email);
    expect(mails[0].subject).toMatch(/T-\d{4}/);
  });
});
