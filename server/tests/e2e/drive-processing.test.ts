import { describe, expect, it } from 'vitest';
import { anon, asClient, asStaff, asSuperAdmin, type Agent } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createClient, uniq } from '../helpers/factories';
import { expectStatus } from '../helpers/workflow';

/**
 * "İş axını" in the documents section (drive): the client folders per team workflow stage, the stage /
 * "Götür" (claim) actions made from the drive, their notifications (linking to the drive folder) and the
 * sync with the case card — one source of truth, Case.processingStage.
 */

const roots = async (a: Agent) => expectStatus(await a.get('/api/drive/roots'), 200).body;

const makeCase = async (parentId: string, opts: { firstName?: string; status?: string; assignedStaffId?: string; updatedAt?: Date } = {}) => {
  const { user: client } = await createClient({ firstName: opts.firstName ?? 'Aysel', lastName: 'Məmmədova' });
  const folder = await prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FOLDER', name: uniq(`${opts.firstName ?? 'Aysel'} · `), parentId } });
  const c = await prisma.case.create({
    data: {
      number: uniq('TV-'),
      clientId: client.id,
      profession: 'Sürücü',
      status: (opts.status ?? 'DOCUMENTS_REVIEW') as never,
      visaType: 'WORK',
      driveFolderId: folder.id,
      assignedStaffId: opts.assignedStaffId ?? null,
    },
  });
  if (opts.updatedAt) await prisma.$executeRaw`UPDATE \`Case\` SET updatedAt = ${opts.updatedAt} WHERE id = ${c.id}`;
  return { c, folder };
};

const folders = async (a: Agent, query: Record<string, string> = {}) => expectStatus(await a.get('/api/admin/case-processing/folders').query(query), 200).body;
const move = (a: Agent, caseId: string, body: Record<string, unknown>) => a.post(`/api/admin/cases/${caseId}/processing`).send(body);
const claim = (a: Agent, caseId: string, body: Record<string, unknown> = {}) => a.post(`/api/admin/cases/${caseId}/processing/claim`).send(body);

describe('documents section: team workflow (Schon geschrieben → Fertig, Ablehnung)', () => {
  it('send from the drive, claim, finish — notifications link to the folder and the case card stays in sync', async () => {
    const writer = await asStaff({ firstName: 'Leyla', lastName: 'Əliyeva' });
    const checker = await asStaff({ firstName: 'Murad', lastName: 'Quliyev', locale: 'de' });
    const third = await asStaff({ firstName: 'Nigar', lastName: 'Həsənova' });
    const r = await roots(writer.agent);
    const { c, folder } = await makeCase(r.cases.id);
    const sub = await prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FOLDER', name: 'Reisepass', parentId: folder.id } });
    await prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FILE', name: 'Pass.pdf', parentId: sub.id, mimeType: 'application/pdf', size: 100, storageKey: uniq('k-') } });
    await prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FILE', name: 'Antrag.pdf', parentId: folder.id, mimeType: 'application/pdf', size: 100, storageKey: uniq('k-') } });

    // The drive listing carries the stage of the client folder (nothing stored = In Bearbeitung).
    const listed = expectStatus(await writer.agent.get(`/api/drive/nodes/${r.cases.id}/children`), 200).body.items.find((i: { id: string }) => i.id === folder.id);
    expect(listed.caseInfo.processing).toEqual({ stage: 'IN_PROGRESS', assigneeId: null });

    // Writer: "Schon geschrieben-ə göndər" from the drive, to the checker.
    expectStatus(await move(writer.agent, c.id, { stage: 'WRITTEN', assigneeId: checker.user.id, note: 'Tərcümələr hazırdır', origin: 'drive' }), 200);
    const n = await prisma.notification.findFirst({ where: { userId: checker.user.id, type: 'PROCESSING_STAGE' } });
    expect(n?.link).toBe(`/workspace/drive/f/${folder.id}`);
    expect(n?.title).toContain('Leyla Əliyeva hat dir „Schon geschrieben“ geschickt');
    expect(n?.title).toContain('übernehmen');
    expect(n?.body).toContain('Übernehmen');

    // İş axını → Schon geschrieben: the folder with client, sender, assignee and file count.
    const view = await folders(checker.agent, { stage: 'WRITTEN' });
    expect(view.counts).toMatchObject({ WRITTEN: 1, DONE: 0, REFUSED: 0 });
    expect(view.waitingForMe).toBe(1);
    expect(view.items).toHaveLength(1);
    expect(view.items[0]).toMatchObject({
      caseId: c.id,
      folderId: folder.id,
      clientName: 'Aysel Məmmədova',
      fileCount: 2,
      lastNote: 'Tərcümələr hazırdır',
      processing: { stage: 'WRITTEN', by: { id: writer.user.id }, assignee: { id: checker.user.id } },
    });
    expect((await folders(checker.agent, { stage: 'WRITTEN', mine: '1' })).items).toHaveLength(1);
    expect((await folders(writer.agent, { stage: 'WRITTEN', mine: '1' })).items).toHaveLength(0);
    expect((await folders(writer.agent, { stage: 'WRITTEN', search: 'Məmmədova' })).items).toHaveLength(1);
    expect((await folders(writer.agent, { stage: 'WRITTEN', search: 'nobody-here' })).items).toHaveLength(0);

    // "Götür" by a colleague: the case is the checker's → 409 unless forced.
    expect((await claim(third.agent, c.id)).status).toBe(409);
    expect((await claim(third.agent, c.id)).body.error).toBe('PROCESSING_CLAIMED_BY_OTHER');
    // The checker claims (already theirs: idempotent, nothing written).
    const same = expectStatus(await claim(checker.agent, c.id, { origin: 'drive' }), 200).body;
    expect(same.claimed).toBe(false);
    expect(await prisma.auditLog.count({ where: { action: 'CASE_PROCESSING_CLAIMED' } })).toBe(0);

    // Taken over on purpose: the writer (sender) and the checker hear about it.
    const taken = expectStatus(await claim(third.agent, c.id, { force: true, origin: 'drive' }), 200).body;
    expect(taken.claimed).toBe(true);
    expect(taken.processing).toMatchObject({ stage: 'WRITTEN', by: { id: writer.user.id }, assignee: { id: third.user.id, name: 'Nigar Həsənova' } });
    expect(taken.processing.history[0]).toMatchObject({ fromStage: 'WRITTEN', toStage: 'WRITTEN', by: { id: third.user.id }, assignee: { id: third.user.id } });
    const toWriter = await prisma.notification.findMany({ where: { userId: writer.user.id, type: 'PROCESSING_STAGE' } });
    expect(toWriter.map((x) => x.title)).toEqual([expect.stringContaining('Nigar Həsənova götürdü')]);
    expect(toWriter[0]!.link).toBe(`/workspace/drive/f/${folder.id}`);
    expect(await prisma.notification.count({ where: { userId: checker.user.id, type: 'PROCESSING_STAGE' } })).toBe(2);
    expect(await prisma.auditLog.count({ where: { action: 'CASE_PROCESSING_CLAIMED' } })).toBe(1);
    expect((await folders(third.agent, { stage: 'WRITTEN', mine: '1' })).items).toHaveLength(1);
    expect((await folders(checker.agent, { stage: 'WRITTEN', mine: '1' })).items).toHaveLength(0);

    // The case card shows the same state (one source of truth).
    const card = expectStatus(await writer.agent.get(`/api/admin/cases/${c.id}/processing`), 200).body.processing;
    expect(card).toMatchObject({ stage: 'WRITTEN', assignee: { id: third.user.id } });
    // "my work" of the new assignee opens the drive folder.
    const work = expectStatus(await third.agent.get('/api/admin/my-work?fresh=1'), 200).body.items.filter((i: { kind: string }) => i.kind === 'processing');
    expect(work).toHaveLength(1);
    expect(work[0].link).toBe(`/workspace/drive/f/${folder.id}`);

    // "Fertig-ə göndər" from the drive: the writer hears about it, linked to the folder.
    expectStatus(await move(third.agent, c.id, { stage: 'DONE', note: 'Paket hazırdır', origin: 'drive' }), 200);
    const done = await prisma.notification.findFirst({ where: { userId: writer.user.id, type: 'PROCESSING_STAGE', title: { contains: 'Fertig' } } });
    expect(done?.link).toBe(`/workspace/drive/f/${folder.id}`);
    const after = await folders(writer.agent, { stage: 'DONE' });
    expect(after.counts).toMatchObject({ WRITTEN: 0, DONE: 1 });
    expect(after.items[0]).toMatchObject({ caseId: c.id, processing: { stage: 'DONE', assignee: null } });
    // Fertig is not open any more: nothing to claim.
    expect((await claim(writer.agent, c.id)).body.error).toBe('PROCESSING_NOT_OPEN');
    const afterList = expectStatus(await writer.agent.get(`/api/drive/nodes/${r.cases.id}/children`), 200).body.items.find((i: { id: string }) => i.id === folder.id);
    expect(afterList.caseInfo.processing).toEqual({ stage: 'DONE', assigneeId: null });
  });

  it('claiming an unassigned "Schon geschrieben" case; back to In Bearbeitung; Ablehnung', async () => {
    const writer = await asStaff({ firstName: 'Leyla', lastName: 'Əliyeva' });
    const checker = await asStaff({ firstName: 'Murad', lastName: 'Quliyev' });
    const r = await roots(writer.agent);
    const { c } = await makeCase(r.cases.id);
    expectStatus(await move(writer.agent, c.id, { stage: 'WRITTEN', origin: 'drive' }), 200);
    expect((await folders(checker.agent, { stage: 'WRITTEN' })).items[0].processing.assignee).toBeNull();

    const res = expectStatus(await claim(checker.agent, c.id, { origin: 'drive' }), 200).body;
    expect(res).toMatchObject({ claimed: true, processing: { stage: 'WRITTEN', assignee: { id: checker.user.id }, by: { id: writer.user.id } } });
    expect(await prisma.notification.count({ where: { userId: writer.user.id, type: 'PROCESSING_STAGE' } })).toBe(1);

    // "Geri qaytar": back to In Bearbeitung with a note, to the writer.
    expectStatus(await move(checker.agent, c.id, { stage: 'IN_PROGRESS', assigneeId: writer.user.id, note: 'Pasport səhifəsi çatmır', origin: 'drive' }), 200);
    const back = await folders(writer.agent, { stage: 'IN_PROGRESS', mine: '1' });
    expect(back.items.map((i: { caseId: string }) => i.caseId)).toEqual([c.id]);

    // Ablehnung from the drive.
    expectStatus(await move(writer.agent, c.id, { stage: 'REFUSED', note: 'Səfirlik imtina etdi', origin: 'drive' }), 200);
    expect((await folders(writer.agent, { stage: 'REFUSED' })).items[0]).toMatchObject({ caseId: c.id, lastNote: 'Səfirlik imtina etdi' });
  });

  it('permissions, In Bearbeitung narrowing and restricted folders', async () => {
    const staff = await asStaff();
    const su = await asSuperAdmin();
    const r = await roots(staff.agent);
    const { c } = await makeCase(r.cases.id);

    expect((await anon().get('/api/admin/case-processing/folders')).status).toBe(401);
    const client = await asClient();
    expect((await client.agent.get('/api/admin/case-processing/folders')).status).toBe(403);
    expect((await client.agent.post(`/api/admin/cases/${c.id}/processing/claim`).send({})).status).toBe(403);
    expect((await anon().post(`/api/admin/cases/${c.id}/processing/claim`).send({})).status).toBe(401);
    expect((await claim(staff.agent, 'nope')).status).toBe(404);
    expect((await staff.agent.get('/api/admin/case-processing/folders?stage=NOPE')).status).toBe(400);

    // In Bearbeitung: recent cases and the viewer's own; an old, foreign case is not listed.
    const old = new Date(Date.now() - 60 * 86_400_000);
    const stale = await makeCase(r.cases.id, { firstName: 'Kamran', updatedAt: old });
    const own = await makeCase(r.cases.id, { firstName: 'Orxan', updatedAt: old, assignedStaffId: staff.user.id });
    const ip = await folders(staff.agent, { stage: 'IN_PROGRESS' });
    const ids = ip.items.map((i: { caseId: string }) => i.caseId);
    expect(ids).toContain(c.id);
    expect(ids).toContain(own.c.id);
    expect(ids).not.toContain(stale.c.id);
    expect(ip.counts.IN_PROGRESS).toBe(2);
    // Cases without a client folder never appear.
    const { user: cl } = await createClient();
    await prisma.case.create({ data: { number: uniq('TV-'), clientId: cl.id, profession: 'X', status: 'DOCUMENTS_REVIEW', visaType: 'WORK', processingStage: 'WRITTEN' } });
    expect((await folders(staff.agent, { stage: 'WRITTEN' })).counts.WRITTEN).toBe(0);

    // A restricted client folder (no inherited access) is not listed for staff; super admins see it.
    const locked = await prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FOLDER', name: uniq('Gizli · '), parentId: r.cases.id, inheritPermissions: false } });
    const { user: cl2 } = await createClient();
    await prisma.case.create({ data: { number: uniq('TV-'), clientId: cl2.id, profession: 'X', status: 'DOCUMENTS_REVIEW', visaType: 'WORK', processingStage: 'WRITTEN', driveFolderId: locked.id } });
    expect((await folders(staff.agent, { stage: 'WRITTEN' })).items).toHaveLength(0);
    expect((await folders(su.agent, { stage: 'WRITTEN' })).items).toHaveLength(1);
  });
});
