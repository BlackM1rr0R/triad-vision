import { describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff, sessionAgent } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createClient, createUser, createVisaCategory, uniq } from '../helpers/factories';
import { expectStatus } from '../helpers/workflow';

/**
 * Partner area round: visa kinds per partner case (filter + counts), the "rədd" counter, the team document
 * workflow (In Bearbeitung → Schon geschrieben → Fertig, Ablehnung) with history, assignee notification and
 * "my work", and the refusal report by partner / employer company with CSV export.
 */

type Agent = Awaited<ReturnType<typeof asAdmin>>['agent'];

const makeCase = async (opts: { partnerId?: string | null; status?: string; visaType?: string; visaCategoryId?: string | null; companyId?: string | null; createdAt?: Date; decisionAt?: Date; firstName?: string } = {}) => {
  const { user: client } = await createClient({ firstName: opts.firstName ?? 'Aysel', lastName: 'Məmmədova' });
  return prisma.case.create({
    data: {
      number: uniq('TV-'),
      clientId: client.id,
      profession: 'Sürücü',
      status: (opts.status ?? 'DOCUMENTS_REVIEW') as never,
      visaType: (opts.visaType ?? 'WORK') as never,
      visaCategoryId: opts.visaCategoryId ?? null,
      partnerId: opts.partnerId ?? null,
      companyId: opts.companyId ?? null,
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
      ...(opts.decisionAt ? { decisionAt: opts.decisionAt } : {}),
    },
  });
};

const move = (agent: Agent, caseId: string, body: Record<string, unknown>) => agent.post(`/api/admin/cases/${caseId}/processing`).send(body);

const workOf = async (agent: Agent) => {
  const res = expectStatus(await agent.get('/api/admin/my-work?fresh=1'), 200);
  return (res.body.items as { kind: string; refs: Record<string, string>; note?: { key: string; params?: Record<string, string> } }[]).filter((i) => i.kind === 'processing');
};

describe('team document workflow (Schon geschrieben → Fertig, Ablehnung)', () => {
  it('moves a case with a note and an assignee, notifies, shows it in my work and keeps the history', async () => {
    const writer = await asStaff({ firstName: 'Leyla', lastName: 'Əliyeva' });
    const checker = await asStaff({ firstName: 'Murad', lastName: 'Quliyev', locale: 'de' });
    const c = await makeCase();

    expect((await anon().get(`/api/admin/cases/${c.id}/processing`)).status).toBe(401);
    expect((await (await asClient()).agent.get(`/api/admin/cases/${c.id}/processing`)).status).toBe(403);

    // Default: nothing stored = "In Bearbeitung" while the case is open.
    const before = expectStatus(await writer.agent.get(`/api/admin/cases/${c.id}/processing`), 200).body.processing;
    expect(before).toMatchObject({ stage: 'IN_PROGRESS', stored: null, history: [], assignee: null });

    // A drive folder with a prepared form and an uploaded document without a copy: both listed for the checker.
    const root = await prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FOLDER', name: uniq('Aysel ') } });
    const sub = await prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FOLDER', name: 'Botschaft', parentId: root.id } });
    const file = await prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FILE', name: 'Antrag.pdf', parentId: sub.id, mimeType: 'application/pdf', size: 1200, storageKey: uniq('k-') } });
    await prisma.case.update({ where: { id: c.id }, data: { driveFolderId: root.id } });
    const doc = await prisma.document.create({ data: { caseId: c.id, stage: 'EMBASSY', originalName: 'pass.pdf', storedName: uniq('f-'), mimeType: 'application/pdf', size: 10, uploadedById: writer.user.id } });

    expect((await move(writer.agent, c.id, { stage: 'NOPE' })).status).toBe(400);
    expect((await move(writer.agent, c.id, { stage: 'WRITTEN', assigneeId: 'nobody' })).status).toBe(400);
    expect((await move(writer.agent, c.id, { stage: 'IN_PROGRESS' })).status).toBe(409); // nothing changes

    const moved = expectStatus(await move(writer.agent, c.id, { stage: 'WRITTEN', assigneeId: checker.user.id, note: 'Tərcümələr hazırdır' }), 200).body.processing;
    expect(moved).toMatchObject({ stage: 'WRITTEN', stored: 'WRITTEN', by: { id: writer.user.id }, assignee: { id: checker.user.id, name: 'Murad Quliyev' } });
    expect(moved.history).toHaveLength(1);
    expect(moved.history[0]).toMatchObject({ fromStage: 'IN_PROGRESS', toStage: 'WRITTEN', note: 'Tərcümələr hazırdır', by: { id: writer.user.id } });
    expect(moved.documents.files).toEqual([expect.objectContaining({ id: file.id, name: 'Antrag.pdf', path: 'Botschaft', link: `/workspace/drive/f/${sub.id}?item=${file.id}` })]);
    expect(moved.documents.uploads).toEqual([expect.objectContaining({ id: doc.id, name: 'pass.pdf', url: `/api/files/${doc.id}` })]);

    // The checker: a notification in their language and a "my work" item; the writer has none.
    const n = await prisma.notification.findFirst({ where: { userId: checker.user.id, type: 'PROCESSING_STAGE' } });
    expect(n?.title).toContain('Leyla Əliyeva hat dir „Schon geschrieben“ geschickt');
    expect(n?.body).toContain('Tərcümələr hazırdır');
    expect(n?.link).toBe(`/admin/cases/${c.id}#case-processing`);
    const work = await workOf(checker.agent);
    expect(work).toHaveLength(1);
    expect(work[0]).toMatchObject({ refs: { caseId: c.id }, note: { key: 'processing', params: { by: 'Leyla Əliyeva', stage: 'Schon geschrieben' } } });
    expect(await workOf(writer.agent)).toHaveLength(0);
    expect(await prisma.caseEvent.count({ where: { caseId: c.id, type: 'PROCESSING_STAGE', visibleToClient: false } })).toBe(1);

    // Cases list: filter, assignee "me", counts and the row summary.
    const list = expectStatus(await checker.agent.get('/api/admin/cases?processing=WRITTEN'), 200).body;
    expect(list.items.map((x: { id: string }) => x.id)).toEqual([c.id]);
    expect(list.items[0].processing).toMatchObject({ stage: 'WRITTEN', assignee: { id: checker.user.id } });
    expect(list.processingCounts).toMatchObject({ WRITTEN: 1, IN_PROGRESS: 0, DONE: 0, REFUSED: 0 });
    expect(expectStatus(await checker.agent.get('/api/admin/cases?processingAssignee=me'), 200).body.total).toBe(1);
    expect(expectStatus(await writer.agent.get('/api/admin/cases?processingAssignee=me'), 200).body.total).toBe(0);

    // Board: one column per stage.
    const board = expectStatus(await writer.agent.get('/api/admin/case-processing/board'), 200).body.columns as { stage: string; total: number; items: { id: string; lastNote: string | null }[] }[];
    expect(board.map((col) => col.stage)).toEqual(['IN_PROGRESS', 'WRITTEN', 'DONE', 'REFUSED']);
    expect(board[1]).toMatchObject({ total: 1, items: [{ id: c.id, lastNote: 'Tərcümələr hazırdır' }] });
    expect(expectStatus(await checker.agent.get('/api/admin/case-processing/board?assignee=me'), 200).body.columns[1].total).toBe(1);

    // The checker finishes it: the writer hears about it, the item leaves "my work".
    const done = expectStatus(await move(checker.agent, c.id, { stage: 'DONE', note: 'Paket göndərildi' }), 200).body.processing;
    expect(done).toMatchObject({ stage: 'DONE', assignee: null, by: { id: checker.user.id } });
    expect(done.history.map((h: { toStage: string }) => h.toStage)).toEqual(['DONE', 'WRITTEN']);
    const back = await prisma.notification.findFirst({ where: { userId: writer.user.id, type: 'PROCESSING_STAGE' } });
    expect(back?.title).toContain('Fertig');
    expect(await workOf(checker.agent)).toHaveLength(0);
    const audit = await prisma.auditLog.findMany({ where: { action: 'CASE_PROCESSING_MOVED' } });
    expect(audit).toHaveLength(2);
  });

  it('closed cases without a stage have none; Ablehnung counts as a refusal', async () => {
    const staff = await asStaff();
    const closed = await makeCase({ status: 'APPROVED' });
    expect(expectStatus(await staff.agent.get(`/api/admin/cases/${closed.id}/processing`), 200).body.processing.stage).toBeNull();
    const open = await makeCase();
    const r = expectStatus(await move(staff.agent, open.id, { stage: 'REFUSED', note: 'Səfirlik imtina etdi' }), 200).body.processing;
    expect(r).toMatchObject({ stage: 'REFUSED', refused: true });
    const counts = expectStatus(await staff.agent.get('/api/admin/cases'), 200).body.processingCounts;
    expect(counts).toMatchObject({ IN_PROGRESS: 0, REFUSED: 1 });
  });
});

describe('partners: visa kinds, rədd counter, stages', () => {
  it('shows the real visa kind per case with counts, rejected cases and stage counts', async () => {
    const admin = await asAdmin();
    const partner = await prisma.referralPartner.create({ data: { name: 'İlqar' } });
    const lkw = await createVisaCategory({ slug: uniq('lkw-'), title: { az: 'LKW sürücüləri', de: 'LKW-Fahrer', en: 'Truck drivers', ru: 'Водители' }, visaLabel: '§19c' });
    const a = await makeCase({ partnerId: partner.id, visaCategoryId: lkw.id });
    const b = await makeCase({ partnerId: partner.id, visaCategoryId: lkw.id, status: 'REJECTED' });
    const ausb = await makeCase({ partnerId: partner.id, visaType: 'AUSBILDUNG', status: 'APPROVED' });
    const marked = await makeCase({ partnerId: partner.id, visaType: 'AUSBILDUNG' });
    await makeCase({ partnerId: partner.id, status: 'CANCELLED' });
    expectStatus(await move(admin.agent, marked.id, { stage: 'REFUSED' }), 200);
    expectStatus(await move(admin.agent, a.id, { stage: 'WRITTEN' }), 200);

    const list = expectStatus(await admin.agent.get('/api/admin/partners'), 200).body.items;
    expect(list[0].counts).toMatchObject({ clients: 5, activeCases: 1, approved: 1, rejected: 2, cancelled: 1, closedNegative: 2 });
    expect(list[0].counts.stages).toEqual({ IN_PROGRESS: 0, WRITTEN: 1, DONE: 0, REFUSED: 1 });

    const detail = expectStatus(await admin.agent.get(`/api/admin/partners/${partner.id}`), 200).body;
    const byId = new Map(detail.cases.map((c: { id: string }) => [c.id, c]));
    expect(byId.get(a.id)).toMatchObject({ visaKey: `cat:${lkw.id}`, visaCategory: { title: { de: 'LKW-Fahrer' } }, refused: false, processing: { stage: 'WRITTEN' } });
    expect(byId.get(b.id)).toMatchObject({ refused: true });
    expect(byId.get(ausb.id)).toMatchObject({ visaKey: 'type:AUSBILDUNG', visaCategory: null, refused: false });
    expect(byId.get(marked.id)).toMatchObject({ refused: true, processing: { stage: 'REFUSED' } });
  });

  it('partner portal: visa filter with counts and the rejected KPI', async () => {
    const u = await createUser({ role: 'AGENT', locale: 'en' });
    const partner = await prisma.referralPartner.create({ data: { name: 'Ənvər', userId: u.user.id } });
    const agent = sessionAgent(u.token);
    const lkw = await createVisaCategory({ slug: uniq('lkw-'), visaLabel: '§19c' });
    const a = await makeCase({ partnerId: partner.id, visaCategoryId: lkw.id, firstName: 'Kamran' });
    await makeCase({ partnerId: partner.id, visaCategoryId: lkw.id, status: 'REJECTED' });
    const ausb = await makeCase({ partnerId: partner.id, visaType: 'AUSBILDUNG', status: 'APPROVED' });
    await makeCase({ visaType: 'AUSBILDUNG' }); // another partner's / no partner: never counted

    const all = expectStatus(await agent.get('/api/partner/cases'), 200).body;
    expect(all.items).toHaveLength(3);
    expect(all.visaFacets).toEqual([
      expect.objectContaining({ key: `cat:${lkw.id}`, count: 2, refused: 1, active: 1, approved: 0 }),
      expect.objectContaining({ key: 'type:AUSBILDUNG', count: 1, approved: 1, visaCategory: null }),
    ]);
    expect(all.items.find((c: { id: string }) => c.id === a.id)).toMatchObject({ visaKey: `cat:${lkw.id}`, refused: false });
    // No staff-side workflow data in the partner view.
    expect(all.items[0]).not.toHaveProperty('processing');
    expect(all.items[0]).not.toHaveProperty('processingStage');

    const filtered = expectStatus(await agent.get('/api/partner/cases?visa=type:AUSBILDUNG'), 200).body.items;
    expect(filtered.map((c: { id: string }) => c.id)).toEqual([ausb.id]);
    expect(expectStatus(await agent.get(`/api/partner/cases?visa=cat:${lkw.id}`), 200).body.items).toHaveLength(2);
    expect(expectStatus(await agent.get('/api/partner/cases?visa=type:BOGUS'), 200).body.items).toHaveLength(0);

    const dash = expectStatus(await agent.get('/api/partner/dashboard'), 200).body;
    expect(dash.counts).toMatchObject({ cases: 3, activeCases: 1, approvedVisas: 1, rejected: 1 });
    expect(dash.byVisa).toHaveLength(2);
  });
});

describe('partners: refusals by partner and employer company', () => {
  it('reports cases, visas, refusals and the rate per partner / company, with a period and CSV', async () => {
    const staff = await asStaff();
    const p1 = await prisma.referralPartner.create({ data: { name: 'İlqar' } });
    const p2 = await prisma.referralPartner.create({ data: { name: 'Tofiq' } });
    const co = await prisma.company.create({ data: { name: 'Spedition Müller GmbH' } });
    const co2 = await prisma.company.create({ data: { name: '=HYPERLINK("x")' } });
    const old = new Date('2020-01-10T10:00:00Z');
    await makeCase({ partnerId: p1.id, companyId: co.id, status: 'REJECTED', decisionAt: new Date('2026-09-02') });
    await makeCase({ partnerId: p1.id, companyId: co.id, status: 'APPROVED', decisionAt: new Date('2026-09-03') });
    await makeCase({ partnerId: p1.id, companyId: co2.id, status: 'REJECTED', createdAt: old, decisionAt: old });
    await makeCase({ partnerId: p2.id, companyId: co.id });
    await makeCase({ companyId: co.id, status: 'REJECTED' }); // no partner: only with withPartner=0

    const byPartner = expectStatus(await staff.agent.get('/api/admin/partners/refusals'), 200).body;
    expect(byPartner.rows).toEqual([
      expect.objectContaining({ id: p1.id, name: 'İlqar', cases: 3, visas: 1, refusals: 2, rate: 0.667 }),
      expect.objectContaining({ id: p2.id, name: 'Tofiq', cases: 1, active: 1, refusals: 0, rate: null }),
    ]);
    expect(byPartner.total).toMatchObject({ cases: 4, refusals: 2, visas: 1 });

    const everyCase = expectStatus(await staff.agent.get('/api/admin/partners/refusals?withPartner=0'), 200).body;
    expect(everyCase.rows.at(-1)).toMatchObject({ id: null, cases: 1, refusals: 1 });

    const byCompany = expectStatus(await staff.agent.get('/api/admin/partners/refusals?group=company'), 200).body.rows;
    // Same number of refusals: the higher rate first.
    expect(byCompany[0]).toMatchObject({ id: co2.id, refusals: 1, rate: 1 });
    expect(byCompany[1]).toMatchObject({ id: co.id, name: 'Spedition Müller GmbH', cases: 3, refusals: 1, visas: 1, rate: 0.5 });

    // Period: created since 2021 drops the old case; decided in September 2026.
    const created = expectStatus(await staff.agent.get('/api/admin/partners/refusals?from=2021-01-01'), 200).body.rows;
    expect(created.find((r: { id: string }) => r.id === p1.id)).toMatchObject({ cases: 2, refusals: 1 });
    const decided = expectStatus(await staff.agent.get('/api/admin/partners/refusals?basis=decision&from=2026-09-01&to=2026-09-30'), 200).body;
    expect(decided.total).toMatchObject({ cases: 2, refusals: 1, visas: 1 });
    // One partner's companies (the table on the partner page).
    const ofP2 = expectStatus(await staff.agent.get(`/api/admin/partners/refusals?group=company&partnerId=${p2.id}`), 200).body.rows;
    expect(ofP2).toEqual([expect.objectContaining({ id: co.id, cases: 1, refusals: 0 })]);
    expect((await staff.agent.get('/api/admin/partners/refusals?from=2026-13-99')).status).toBe(400);

    const csv = await staff.agent.get('/api/admin/partners/refusals.csv?group=company');
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.text.slice(1).trim().split('\r\n');
    expect(lines[0]).toBe('Şirkət;Müraciət;Aktiv;Viza;Rədd (Ablehnung);Ləğv;Rədd faizi');
    // Formula-looking names are neutralised.
    expect(lines[1]).toBe(`"'=HYPERLINK(""x"")";1;0;0;1;0;100,0%`);
    expect(lines[2]).toBe('Spedition Müller GmbH;3;1;1;1;0;50,0%');
    expect(lines.at(-1)).toBe('Cəmi;4;1;1;2;0;66,7%');
    expect(await prisma.auditLog.count({ where: { action: 'PARTNER_REFUSALS_EXPORTED' } })).toBe(1);
  });
});
