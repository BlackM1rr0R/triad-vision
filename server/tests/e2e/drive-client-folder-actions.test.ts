import { describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff, asSuperAdmin, type Agent } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createClient, uniq } from '../helpers/factories';
import { makePdf } from '../helpers/files';
import { expectStatus } from '../helpers/workflow';

/**
 * Client folder actions of the documents section without opening the folder (routes/admin/clientFolders,
 * lib/clientFolders): partner set / changed / removed (history, owner, audit, partner notification), the team
 * workflow stage for several folders at once, "Müştəriyə göndər" (Fertig documents → the client's portal), and the
 * permissions (partners:edit, cases:edit, documents:edit) and case scope per case.
 */

const roots = async (a: Agent) => expectStatus(await a.get('/api/drive/roots'), 200).body;
const mkdir = async (a: Agent, parentId: string, name: string) => expectStatus(await a.post(`/api/drive/nodes/${parentId}/folders`).send({ name }), 201).body.item as { id: string; name: string };
const upload = async (a: Agent, parentId: string, filename: string) =>
  expectStatus(await a.post(`/api/drive/nodes/${parentId}/files`).attach('file', await makePdf(filename), { filename, contentType: 'application/pdf' }), 201).body.item as { id: string; name: string };

/** A case with a real client folder below "Anträge" (client = a logged-in portal user when `client` is given). */
const clientCase = async (a: Agent, opts: { clientId?: string; firstName?: string; assignedStaffId?: string } = {}) => {
  const r = await roots(a);
  const clientId = opts.clientId ?? (await createClient({ firstName: opts.firstName ?? 'Ali', lastName: 'Həsənov' })).user.id;
  const folder = await mkdir(a, r.cases.id, uniq(`${opts.firstName ?? 'Ali'} Həsənov · `));
  const c = await prisma.case.create({
    data: { number: uniq('TV-'), clientId, profession: 'Sürücü', status: 'DOCUMENTS_REVIEW', visaType: 'WORK', driveFolderId: folder.id, assignedStaffId: opts.assignedStaffId ?? null },
  });
  return { c, folder, clientId };
};

const newPartner = async (admin: Agent, name: string) => expectStatus(await admin.post('/api/admin/partners').send({ name, commissionCents: 10000 }), 201).body.partner as { id: string; name: string };

const setPartner = (a: Agent, cases: string[], partnerId: string | null, note?: string) => a.post('/api/admin/client-folders/partner').send({ cases, partnerId, ...(note ? { note } : {}) });

describe('client folder: partner without opening the folder', () => {
  it('assigns, changes and removes the partner — case, folder, owner history, audit and partner notification', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    const p1 = await newPartner(admin.agent, uniq('Rəşad '));
    const p2 = await newPartner(admin.agent, uniq('Elvin '));
    const login = await createClient({ firstName: 'Partner', lastName: 'Login' });
    await prisma.user.update({ where: { id: login.user.id }, data: { role: 'AGENT' } });
    await prisma.referralPartner.update({ where: { id: p1.id }, data: { userId: login.user.id } });
    const { c, folder, clientId } = await clientCase(staff.agent);

    // assign
    const r1 = expectStatus(await setPartner(staff.agent, [c.id], p1.id), 200).body;
    expect(r1.summary).toEqual({ total: 1, succeeded: 1, skipped: 0, failed: 0 });
    expect(r1.results[0]).toMatchObject({ caseId: c.id, ok: true, number: c.number });
    expect((await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).partnerId).toBe(p1.id);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: clientId } })).ownerPartnerId).toBe(p1.id);
    // the client folder now lives in the partner's folder
    const moved = await prisma.driveNode.findUniqueOrThrow({ where: { id: (await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).driveFolderId! } });
    const parent = await prisma.driveNode.findUniqueOrThrow({ where: { id: moved.parentId! } });
    expect(parent.parentId).toBe((await roots(staff.agent)).partners.id);
    expect(moved.id).toBe(folder.id);
    // the partner's portal login hears about the application
    expect(await prisma.notification.count({ where: { userId: login.user.id, type: 'PARTNER_NEW_CASE', link: `/partner/clients/${c.id}` } })).toBe(1);
    // the listing shows the partner on the folder without opening it
    const listed = expectStatus(await staff.agent.get(`/api/drive/nodes/${parent.id}/children`), 200).body.items.find((i: { id: string }) => i.id === folder.id);
    expect(listed.caseInfo.partner).toEqual({ id: p1.id, name: p1.name });

    // the same again: skipped, nothing written
    expect(expectStatus(await setPartner(staff.agent, [c.id], p1.id), 200).body.summary).toMatchObject({ succeeded: 0, skipped: 1 });

    // change
    expectStatus(await setPartner(staff.agent, [c.id], p2.id, 'Müştəri özü dəyişdi'), 200);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).partnerId).toBe(p2.id);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: clientId } })).ownerPartnerId).toBe(p2.id);

    // remove
    expectStatus(await setPartner(staff.agent, [c.id], null), 200);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).partnerId).toBeNull();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: clientId } })).ownerPartnerId).toBeNull();

    // history: PartnerClientChange (also shown by GET /admin/partners/clients/:id/owner), case events, audit
    const history = await prisma.partnerClientChange.findMany({ where: { userId: clientId }, orderBy: { createdAt: 'asc' } });
    expect(history.map((h) => [h.fromPartnerId, h.toPartnerId, h.source])).toEqual([
      [null, p1.id, 'ADMIN'],
      [p1.id, p2.id, 'ADMIN'],
      [p2.id, null, 'ADMIN'],
    ]);
    expect(history[1]!.note).toBe('Müştəri özü dəyişdi');
    const owner = expectStatus(await staff.agent.get(`/api/admin/partners/clients/${clientId}/owner`), 200).body;
    expect(owner.history).toHaveLength(3);
    expect(await prisma.caseEvent.count({ where: { caseId: c.id, type: 'PARTNER_CHANGED' } })).toBe(3);
    expect(await prisma.auditLog.count({ where: { target: `case:${c.id}`, action: 'CASE_PARTNER_SET' } })).toBe(2);
    expect(await prisma.auditLog.count({ where: { target: `case:${c.id}`, action: 'CASE_PARTNER_REMOVED' } })).toBe(1);
  });

  it('keeps a client owned by another partner and reports bad input per case', async () => {
    const admin = await asAdmin();
    const p1 = await newPartner(admin.agent, uniq('Orxan '));
    const p9 = await newPartner(admin.agent, uniq('Kamran '));
    const { c, clientId } = await clientCase(admin.agent);
    await prisma.user.update({ where: { id: clientId }, data: { ownerPartnerId: p9.id } });
    const r = expectStatus(await setPartner(admin.agent, [c.id, 'ckunknowncase0000000000'], p1.id), 200).body;
    expect(r.summary).toEqual({ total: 2, succeeded: 1, skipped: 0, failed: 1 });
    expect(r.results[1]).toMatchObject({ ok: false, error: 'CASE_NOT_FOUND' });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: clientId } })).ownerPartnerId).toBe(p9.id);
    expect(await prisma.partnerClientChange.count({ where: { userId: clientId } })).toBe(0);
    expect(expectStatus(await setPartner(admin.agent, [c.id], 'ckunknownpartner00000000'), 200).body.results[0]).toMatchObject({ ok: false, error: 'INVALID_PARTNER' });
  });
});

describe('client folders: bulk "Schon geschrieben"', () => {
  it('moves several folders with the single-move rules and reports the rest', async () => {
    const staff = await asStaff({ firstName: 'Leyla', lastName: 'Əliyeva' });
    const next = await asStaff({ firstName: 'Murad', lastName: 'Quliyev' });
    const a = await clientCase(staff.agent, { firstName: 'Anar' });
    const b = await clientCase(staff.agent, { firstName: 'Banu' });
    const d = await clientCase(staff.agent, { firstName: 'Dunya' });
    const w = await clientCase(staff.agent, { firstName: 'Vüsal' });
    // Fertig cannot go back to Schon geschrieben (only In Bearbeitung); one is already there
    await prisma.case.update({ where: { id: d.c.id }, data: { processingStage: 'DONE' } });
    await prisma.case.update({ where: { id: w.c.id }, data: { processingStage: 'WRITTEN' } });

    const res = expectStatus(
      await staff.agent.post('/api/admin/client-folders/processing').send({ cases: [a.c.id, b.c.id, d.c.id, w.c.id], stage: 'WRITTEN', assigneeId: next.user.id }),
      200,
    ).body;
    expect(res.summary).toEqual({ total: 4, succeeded: 3, skipped: 0, failed: 1 });
    expect(res.results.find((x: { caseId: string }) => x.caseId === d.c.id)).toMatchObject({ ok: false, error: 'PROCESSING_TRANSITION_NOT_ALLOWED' });
    for (const id of [a.c.id, b.c.id, w.c.id]) expect(await prisma.case.findUniqueOrThrow({ where: { id } })).toMatchObject({ processingStage: 'WRITTEN', processingAssigneeId: next.user.id });
    expect(await prisma.caseProcessingMove.count({ where: { caseId: { in: [a.c.id, b.c.id] }, toStage: 'WRITTEN', actorId: staff.user.id } })).toBe(2);
    // the next admin is told once per case
    expect(await prisma.notification.count({ where: { userId: next.user.id, type: 'PROCESSING_STAGE' } })).toBe(3);
    expect(await prisma.auditLog.count({ where: { action: 'CASE_PROCESSING_MOVED', target: { in: [`case:${a.c.id}`, `case:${b.c.id}`] } } })).toBe(2);

    // again without a new admin / note: all skipped
    const again = expectStatus(await staff.agent.post('/api/admin/client-folders/processing').send({ cases: [a.c.id, b.c.id], stage: 'WRITTEN' }), 200).body;
    expect(again.summary).toMatchObject({ succeeded: 0, skipped: 2, failed: 0 });
  });
});

describe('client folders: Fertig → client portal', () => {
  it('sends the Fertig files as client-visible documents once, notifies the client and re-sends only new files', async () => {
    const staff = await asStaff();
    const client = await asClient({ firstName: 'Ali', lastName: 'Məmmədov', locale: 'az' });
    const { c, folder } = await clientCase(staff.agent, { clientId: client.user.id });
    const send = (body: Record<string, unknown>) => staff.agent.post('/api/admin/client-folders/ready-docs/send').send({ cases: [c.id], ...body });

    // nothing in the Fertig folder yet
    expect(expectStatus(await send({}), 200).body.results[0]).toMatchObject({ ok: false, error: 'READY_DOCS_NO_FILES' });

    // the finished documents: client folder → "İş axını" Fertig (Arbeitsablauf/Fertig/<client folder>/…)
    const sub = await mkdir(staff.agent, folder.id, 'Hazır');
    const f1 = await upload(staff.agent, sub.id, 'Arbeitsvertrag.pdf');
    const f2 = await upload(staff.agent, folder.id, 'Anschreiben.pdf');
    expectStatus(await staff.agent.post('/api/drive/workflow/copy').send({ ids: [f1.id, f2.id], stage: 'DONE' }), 200);
    // No stage move needed: the Fertig documents are sent DIRECTLY (the case stays outside the workflow).
    expect((await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).processingStage).toBeNull();

    const view = expectStatus(await staff.agent.get(`/api/admin/client-folders/cases/${c.id}/ready-docs`), 200).body;
    expect(view).toMatchObject({ stage: null, newCount: 2, sends: [] });
    expect(view.folder.name).toBe(folder.name);
    expect(view.files.map((f: { name: string; path: string; sent: boolean }) => [f.name, f.path, f.sent]).sort()).toEqual(
      [
        [f2.name, '', false],
        [f1.name, 'Hazır', false],
      ].sort(),
    );

    // The Fertig list shows the case (not sent yet) and filters by sent state / date range / employer.
    const fertig = (q: Record<string, string> = {}) => staff.agent.get('/api/admin/case-processing/folders').query({ stage: 'DONE', ...q });
    expect(expectStatus(await fertig(), 200).body.items).toMatchObject([{ caseId: c.id, readySentAt: null }]);
    expect(expectStatus(await fertig({ sent: 'sent' }), 200).body.items).toHaveLength(0);

    const r = expectStatus(await send({}), 200).body;
    expect(r.summary).toEqual({ total: 1, succeeded: 1, skipped: 0, failed: 0 });
    // "Müştəriyə göndərildi" with its date is persisted (CaseReadyDocsSend) and filterable.
    const sentRows = expectStatus(await fertig({ sent: 'sent' }), 200).body.items;
    expect(sentRows).toHaveLength(1);
    expect(sentRows[0].readySentAt).toEqual(expect.any(String));
    expect(expectStatus(await fertig({ sent: 'unsent' }), 200).body.items).toHaveLength(0);
    const today = new Date().toISOString().slice(0, 10);
    expect(expectStatus(await fertig({ from: today, to: today }), 200).body.items).toHaveLength(1);
    expect(expectStatus(await fertig({ to: '2000-01-01' }), 200).body.items).toHaveLength(0);
    expect(expectStatus(await fertig({ company: 'nope' }), 200).body.items).toHaveLength(0);
    // the client sees them in the portal ("Sizin üçün fayllar") and can open them
    const detail = expectStatus(await client.agent.get(`/api/cases/${c.id}`), 200).body.case;
    const names = detail.otherDocuments.map((d: { originalName: string }) => d.originalName).sort();
    expect(names).toEqual([f1.name, f2.name].sort());
    const docId = detail.otherDocuments[0].id as string;
    expect((await client.agent.get(`/api/files/${docId}`)).status).toBe(200);
    // notification (in-app; the link opens the documents tab), event, audit, sent chip on the folder
    const n = await prisma.notification.findFirst({ where: { userId: client.user.id, type: 'READY_DOCS' } });
    expect(n).toMatchObject({ caseId: c.id, link: `/account/cases/${c.id}?tab=docs` });
    expect(n!.body).toContain(c.number);
    expect(await prisma.caseEvent.count({ where: { caseId: c.id, type: 'READY_DOCS_SENT' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'CASE_READY_DOCS_SENT', target: `case:${c.id}` } })).toBe(1);
    const r2 = await roots(staff.agent);
    const listed = expectStatus(await staff.agent.get(`/api/drive/nodes/${r2.cases.id}/children`), 200).body.items.find((i: { id: string }) => i.id === folder.id);
    expect(listed.caseInfo.readySentAt).toBeTruthy();

    // a second send needs "resend"; nothing is duplicated
    expect(expectStatus(await send({}), 200).body.results[0]).toMatchObject({ ok: false, error: 'READY_DOCS_ALREADY_SENT' });
    // a re-send without any new file is refused: no copy, no "N documents ready" notice to the client
    expect(expectStatus(await send({ resend: true }), 200).body.results[0]).toMatchObject({ ok: false, error: 'READY_DOCS_NOTHING_NEW' });
    expect(await prisma.document.count({ where: { caseId: c.id, stage: 'OTHER' } })).toBe(2);
    expect(await prisma.notification.count({ where: { userId: client.user.id, type: 'READY_DOCS' } })).toBe(1);

    // a new finished file: a re-send adds only that one
    const f3 = await upload(staff.agent, folder.id, 'Lebenslauf.pdf');
    expectStatus(await staff.agent.post('/api/drive/workflow/copy').send({ ids: [f3.id], stage: 'DONE' }), 200);
    expect(expectStatus(await staff.agent.get(`/api/admin/client-folders/cases/${c.id}/ready-docs`), 200).body.newCount).toBe(1);
    expectStatus(await send({ resend: true }), 200);
    expect(await prisma.document.count({ where: { caseId: c.id, stage: 'OTHER' } })).toBe(3);
    const sends = await prisma.caseReadyDocsSend.findMany({ where: { caseId: c.id }, orderBy: { createdAt: 'asc' } });
    expect(sends.map((s) => [s.newCount, s.fileCount, s.resend])).toEqual([
      [2, 2, false],
      [1, 3, true],
    ]);
  });
});

describe('client folders: permissions and case scope', () => {
  it('needs partners:edit / documents:edit and keeps out-of-scope cases out, per case', async () => {
    const sup = await asSuperAdmin();
    const staff = await asStaff();
    const mine = await clientCase(sup.agent, { firstName: 'Mine', assignedStaffId: staff.user.id });
    const other = await clientCase(sup.agent, { firstName: 'Other' });
    const p = await newPartner(sup.agent, uniq('Scope '));

    // case scope ASSIGNED: the own case works, the other one fails with OUT_OF_SCOPE (and stays untouched)
    expectStatus(await sup.agent.put(`/api/admin/access/scope/users/${staff.user.id}`).send({ caseScope: 'ASSIGNED' }), 200);
    const r = expectStatus(await setPartner(staff.agent, [mine.c.id, other.c.id], p.id), 200).body;
    expect(r.results.map((x: { ok: boolean; error?: string }) => [x.ok, x.error ?? null])).toEqual([
      [true, null],
      [false, 'OUT_OF_SCOPE'],
    ]);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: other.c.id } })).partnerId).toBeNull();
    const stage = expectStatus(await staff.agent.post('/api/admin/client-folders/processing').send({ cases: [other.c.id], stage: 'WRITTEN' }), 200).body;
    expect(stage.results[0]).toMatchObject({ ok: false, error: 'OUT_OF_SCOPE' });
    expect((await prisma.case.findUniqueOrThrow({ where: { id: other.c.id } })).processingStage).toBeNull();
    const read = await staff.agent.get(`/api/admin/client-folders/cases/${other.c.id}/ready-docs`);
    expect(read.status).toBe(403);
    expect(read.body.error).toBe('OUT_OF_SCOPE');
    expect((await staff.agent.get(`/api/admin/client-folders/cases/${mine.c.id}/ready-docs`)).status).toBe(200);
    expectStatus(await sup.agent.put(`/api/admin/access/scope/users/${staff.user.id}`).send({ caseScope: 'ALL' }), 200);

    // without partners:edit / documents:edit: 403 NO_PERMISSION for the whole request
    expectStatus(
      await sup.agent.put(`/api/admin/access/staff/users/${staff.user.id}`).send({
        overrides: [
          { area: 'partners', action: 'edit', effect: 'deny' },
          { area: 'documents', action: 'edit', effect: 'deny' },
        ],
      }),
      200,
    );
    const denied = await setPartner(staff.agent, [mine.c.id], null);
    expect(denied.status).toBe(403);
    expect(denied.body).toMatchObject({ error: 'NO_PERMISSION', area: 'partners', action: 'edit' });
    const sendDenied = await staff.agent.post('/api/admin/client-folders/ready-docs/send').send({ cases: [mine.c.id] });
    expect(sendDenied.status).toBe(403);
    expect(sendDenied.body).toMatchObject({ error: 'NO_PERMISSION', area: 'documents', action: 'edit' });
    // the stage action is cases:edit and still works
    expectStatus(await staff.agent.post('/api/admin/client-folders/processing').send({ cases: [mine.c.id], stage: 'WRITTEN' }), 200);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: mine.c.id } })).partnerId).toBe(p.id);
    expectStatus(await sup.agent.put(`/api/admin/access/staff/users/${staff.user.id}`).send({ templateId: null, overrides: [] }), 200);
  });
});
