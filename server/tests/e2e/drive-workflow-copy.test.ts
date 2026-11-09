import { describe, expect, it } from 'vitest';
import { anon, asClient, asStaff, asSuperAdmin, type Agent } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createClient, uniq } from '../helpers/factories';
import { binaryParser, makePdf } from '../helpers/files';
import { expectStatus } from '../helpers/workflow';

/**
 * "İş axını" stage folders of the drive (lib/drive/workflowFolders, routes/driveWorkflow): "İş axınına kopyala"
 * to Schon geschrieben / Fertig / Ablehnung (recursive, folder structure kept, name clashes → "name (2)"), and
 * the way through Schon geschrieben → In Bearbeitung → Fertig / Ablehnung with the path below the stage kept.
 */

type Stage = { stage: string; id: string; name: string; count: number };
const roots = async (a: Agent) => expectStatus(await a.get('/api/drive/roots'), 200).body;
const wfFolders = async (a: Agent) => expectStatus(await a.get('/api/drive/workflow/folders'), 200).body as { root: { id: string; name: string }; stages: Stage[] };
const stageId = async (a: Agent, stage: string) => (await wfFolders(a)).stages.find((s) => s.stage === stage)!.id;
const mkdir = async (a: Agent, parentId: string, name: string) => expectStatus(await a.post(`/api/drive/nodes/${parentId}/folders`).send({ name }), 201).body.item as { id: string; name: string };
const upload = async (a: Agent, parentId: string, filename: string, text = filename) =>
  expectStatus(await a.post(`/api/drive/nodes/${parentId}/files`).attach('file', await makePdf(text), { filename, contentType: 'application/pdf' }), 201).body.item as { id: string; name: string };
const copy = (a: Agent, ids: string[], stage: string) => a.post('/api/drive/workflow/copy').send({ ids, stage });
const send = (a: Agent, ids: string[], stage: string) => a.post('/api/drive/workflow/send').send({ ids, stage });
const download = (a: Agent, id: string) => a.get(`/api/drive/nodes/${id}/content?download=1`).buffer(true).parse(binaryParser);
const children = (parentId: string) => prisma.driveNode.findMany({ where: { parentId, deletedAt: null }, orderBy: { name: 'asc' }, select: { id: true, name: true, kind: true, storageKey: true } });
const child = async (parentId: string, name: string) => {
  const n = await prisma.driveNode.findFirst({ where: { parentId, name, deletedAt: null }, select: { id: true, name: true, kind: true, storageKey: true } });
  if (!n) throw new Error(`missing "${name}"`);
  return n;
};

/** A case with a client folder below "Anträge": <client>/Reisepass/Pass.pdf and <client>/Antrag.pdf. */
const clientFolder = async (a: Agent) => {
  const r = await roots(a);
  const { user } = await createClient({ firstName: 'Aysel', lastName: 'Məmmədova' });
  const folder = await mkdir(a, r.cases.id, uniq('Aysel Məmmədova · '));
  await prisma.case.create({ data: { number: uniq('TV-'), clientId: user.id, profession: 'Sürücü', status: 'DOCUMENTS_REVIEW', visaType: 'WORK', driveFolderId: folder.id } });
  const pass = await mkdir(a, folder.id, 'Reisepass');
  const passPdf = await upload(a, pass.id, 'Pass.pdf', 'pass page');
  const antrag = await upload(a, folder.id, 'Antrag.pdf', 'antrag');
  return { folder, pass, passPdf, antrag };
};

describe('drive: İş axını stage folders (copy, send on)', () => {
  it('sets up Arbeitsablauf with the four protected stage folders once', async () => {
    const staff = await asStaff();
    const { shared } = await roots(staff.agent);
    const wf = await wfFolders(staff.agent);
    expect(wf.stages.map((s) => [s.stage, s.name, s.count])).toEqual([
      ['WRITTEN', 'Schon geschrieben', 0],
      ['IN_PROGRESS', 'In Bearbeitung', 0],
      ['DONE', 'Fertig', 0],
      ['REFUSED', 'Ablehnung', 0],
    ]);
    const root = await prisma.driveNode.findUniqueOrThrow({ where: { id: wf.root.id } });
    expect(root).toMatchObject({ parentId: shared.id, name: 'Arbeitsablauf', system: true });
    expect(await prisma.driveNode.count({ where: { parentId: wf.root.id, system: true, deletedAt: null } })).toBe(4);
    // Idempotent: the same folders again.
    expect((await wfFolders(staff.agent)).stages.map((s) => s.id)).toEqual(wf.stages.map((s) => s.id));
    // Protected like the sections: staff can neither rename nor delete them.
    const written = wf.stages[0]!.id;
    expect((await staff.agent.patch(`/api/drive/nodes/${written}`).send({ name: 'X' })).body.error).toBe('SYSTEM_NODE');
    expect((await staff.agent.post('/api/drive/trash').send({ ids: [written] })).body.results[0].error).toBe('SYSTEM_NODE');
    // The old "In Bearbeitung" section cleanup at start-up does not touch the stage folder of that name.
    const { cleanupWorkFolders } = await import('../../src/lib/drive/layout.js');
    await cleanupWorkFolders();
    expect(await prisma.driveNode.findUniqueOrThrow({ where: { id: wf.stages[1]!.id } })).toMatchObject({ deletedAt: null, system: true });
  });

  it('copies folders and files recursively, keeping the client folder structure and the original', async () => {
    const staff = await asStaff();
    const { folder, pass, passPdf, antrag } = await clientFolder(staff.agent);
    const written = await stageId(staff.agent, 'WRITTEN');
    const done = await stageId(staff.agent, 'DONE');

    // The whole client folder → Schon geschrieben: same tree, fresh bytes, the original stays.
    const r = expectStatus(await copy(staff.agent, [folder.id], 'WRITTEN'), 200).body;
    expect(r.results).toEqual([{ id: folder.id, ok: true, name: folder.name, stage: 'WRITTEN', folderId: written }]);
    const copied = await child(written, folder.name);
    expect((await children(copied.id)).map((n) => [n.name, n.kind]).sort()).toEqual(
      [
        [antrag.name, 'FILE'],
        ['Reisepass', 'FOLDER'],
      ].sort(),
    );
    const copiedPass = await child((await child(copied.id, 'Reisepass')).id, passPdf.name);
    const original = await prisma.driveNode.findUniqueOrThrow({ where: { id: passPdf.id } });
    expect(copiedPass.storageKey).not.toBe(original.storageKey);
    expect(original.parentId).toBe(pass.id);
    const a = await download(staff.agent, passPdf.id);
    const b = await download(staff.agent, copiedPass.id);
    expect(b.status).toBe(200);
    expect(Buffer.compare(a.body as Buffer, b.body as Buffer)).toBe(0);
    expect((await children(folder.id)).map((n) => n.name).sort()).toEqual([antrag.name, 'Reisepass'].sort());

    // A single nested file → Fertig: it lands below the client folder's name and the folders between.
    expectStatus(await copy(staff.agent, [passPdf.id], 'DONE'), 200);
    const doneClient = await child(done, folder.name);
    const donePass = await child(doneClient.id, 'Reisepass');
    expect((await children(donePass.id)).map((n) => n.name)).toEqual([passPdf.name]);
    // Again, together with another file: the path is reused, the clash becomes "name (2)".
    const again = expectStatus(await copy(staff.agent, [passPdf.id, antrag.id], 'DONE'), 200).body.results;
    expect(again.map((x: { ok: boolean }) => x.ok)).toEqual([true, true]);
    expect((await children(donePass.id)).map((n) => n.name).sort()).toEqual([passPdf.name, passPdf.name.replace(/\.pdf$/, ' (2).pdf')].sort());
    expect((await children(doneClient.id)).map((n) => n.name).sort()).toEqual([antrag.name, 'Reisepass'].sort());
    expect(await prisma.driveNode.count({ where: { parentId: done, deletedAt: null } })).toBe(1);

    // A folder that is no client folder goes straight into the stage; Ablehnung works too.
    const { shared } = await roots(staff.agent);
    const misc = await mkdir(staff.agent, shared.id, 'Muster');
    await upload(staff.agent, misc.id, 'Muster.pdf');
    expectStatus(await copy(staff.agent, [misc.id], 'REFUSED'), 200);
    const refused = await stageId(staff.agent, 'REFUSED');
    expect((await children(refused)).map((n) => n.name)).toEqual(['Muster']);

    // Counts per stage folder; audit and folder journal per item.
    const counts = Object.fromEntries((await wfFolders(staff.agent)).stages.map((s) => [s.stage, s.count]));
    expect(counts).toEqual({ WRITTEN: 1, IN_PROGRESS: 0, DONE: 1, REFUSED: 1 });
    expect(await prisma.auditLog.count({ where: { action: 'DRIVE_WORKFLOW_COPIED' } })).toBe(5);
    expect(await prisma.driveActivity.count({ where: { action: 'COPY', folderId: donePass.id } })).toBe(2);
  });

  it('refuses In Bearbeitung as a copy target, the workflow folders themselves and missing access', async () => {
    const staff = await asStaff();
    const su = await asSuperAdmin();
    const { passPdf } = await clientFolder(staff.agent);
    const wf = await wfFolders(staff.agent);
    // Nothing lands in In Bearbeitung by itself — not even by copying.
    expect((await copy(staff.agent, [passPdf.id], 'IN_PROGRESS')).status).toBe(400);
    expect((await copy(staff.agent, [passPdf.id], 'NOPE')).status).toBe(400);
    expect((await copy(staff.agent, [wf.stages[0]!.id], 'DONE')).body.results[0].error).toBe('WORKFLOW_FOLDER');
    expect((await copy(staff.agent, [wf.root.id], 'DONE')).body.results[0].error).toBe('WORKFLOW_FOLDER');
    // The shared root would be copied into itself.
    const { shared } = await roots(su.agent);
    expect((await copy(su.agent, [shared.id], 'DONE')).body.results[0].error).toBe('INTO_ITSELF');
    expect((await copy(staff.agent, ['nope'], 'DONE')).body.results[0].error).toBe('NODE_NOT_FOUND');
    // A restricted folder the staff member cannot see is not copied.
    const locked = await mkdir(su.agent, shared.id, 'Gizli');
    expectStatus(await su.agent.patch(`/api/drive/nodes/${locked.id}/inheritance`).send({ inherit: false }), 200);
    expect((await copy(staff.agent, [locked.id], 'DONE')).body.results[0].error).toBe('NODE_NOT_FOUND');
    // Clients and anonymous callers have no drive.
    const client = await asClient();
    expect((await copy(client.agent, [passPdf.id], 'DONE')).status).toBe(403);
    expect((await anon().post('/api/drive/workflow/copy').send({ ids: [passPdf.id], stage: 'DONE' })).status).toBe(401);
    expect((await client.agent.get('/api/drive/workflow/folders')).status).toBe(403);
  });

  it('sends on: Schon geschrieben → In Bearbeitung → Fertig / Ablehnung, keeping the path below the stage', async () => {
    const staff = await asStaff();
    const { folder, antrag, passPdf } = await clientFolder(staff.agent);
    const [written, inProgress, done, refused] = await Promise.all(['WRITTEN', 'IN_PROGRESS', 'DONE', 'REFUSED'].map((s) => stageId(staff.agent, s)));
    expectStatus(await copy(staff.agent, [folder.id], 'WRITTEN'), 200);
    const wClient = await child(written, folder.name);
    const wPass = await child(wClient.id, 'Reisepass');
    const wAntrag = await child(wClient.id, antrag.name);

    // Only the allowed ways: not straight to Fertig, not back, not from outside the workflow.
    expect((await send(staff.agent, [wPass.id], 'DONE')).body.results[0].error).toBe('WORKFLOW_TRANSITION_NOT_ALLOWED');
    expect((await send(staff.agent, [wPass.id], 'WRITTEN')).body.results[0].error).toBe('WORKFLOW_TRANSITION_NOT_ALLOWED');
    expect((await send(staff.agent, [folder.id], 'IN_PROGRESS')).body.results[0].error).toBe('NOT_IN_WORKFLOW');
    expect((await send(staff.agent, [written], 'IN_PROGRESS')).body.results[0].error).toBe('WORKFLOW_FOLDER');

    // A nested folder → In Bearbeitung: below the same client folder name there; the rest stays.
    const r1 = expectStatus(await send(staff.agent, [wPass.id], 'IN_PROGRESS'), 200).body;
    const ipClient = await child(inProgress, folder.name);
    expect(r1.results).toEqual([{ id: wPass.id, ok: true, name: 'Reisepass', stage: 'IN_PROGRESS', folderId: ipClient.id }]);
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: wPass.id } })).parentId).toBe(ipClient.id);
    expect((await children(wPass.id)).map((n) => n.name)).toEqual([passPdf.name]); // moved with its content
    expect((await children(wClient.id)).map((n) => n.name)).toEqual([antrag.name]);

    // The last file → the same client folder in In Bearbeitung; the emptied folder in Schon geschrieben goes to the bin.
    expectStatus(await send(staff.agent, [wAntrag.id], 'IN_PROGRESS'), 200);
    expect((await children(ipClient.id)).map((n) => n.name).sort()).toEqual([antrag.name, 'Reisepass'].sort());
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: wClient.id } })).deletedAt).not.toBeNull();
    expect(await children(written)).toEqual([]);

    // In Bearbeitung → Fertig (a part) and → Ablehnung (the rest), structure kept.
    expectStatus(await send(staff.agent, [wPass.id], 'DONE'), 200);
    const dClient = await child(done, folder.name);
    expect((await children(dClient.id)).map((n) => n.name)).toEqual(['Reisepass']);
    expectStatus(await send(staff.agent, [ipClient.id], 'REFUSED'), 200);
    expect((await children(refused)).map((n) => n.name)).toEqual([folder.name]);
    expect(await children(inProgress)).toEqual([]);
    // Fertig / Ablehnung are the last stages.
    expect((await send(staff.agent, [dClient.id], 'IN_PROGRESS')).body.results[0].error).toBe('WORKFLOW_TRANSITION_NOT_ALLOWED');

    expect(await prisma.auditLog.count({ where: { action: 'DRIVE_WORKFLOW_SENT' } })).toBe(4);
    const moves = await prisma.driveActivity.findMany({ where: { action: 'MOVE', nodeId: wPass.id }, orderBy: { createdAt: 'asc' } });
    expect(moves.map((m) => (m.meta as { workflow: { from: string; to: string } }).workflow)).toEqual([
      { from: 'WRITTEN', to: 'IN_PROGRESS' },
      { from: 'IN_PROGRESS', to: 'DONE' },
    ]);
    // A plain "Köçür" (move) still lets an admin put anything anywhere.
    expectStatus(await staff.agent.post('/api/drive/move').send({ ids: [dClient.id], targetId: written }), 200);
    expect((await children(written)).map((n) => n.name)).toEqual([folder.name]);
  });

  it('copies a bigger tree in one request (several levels, many files)', async () => {
    const staff = await asStaff();
    const { shared } = await roots(staff.agent);
    const top = await mkdir(staff.agent, shared.id, 'Groß');
    let parent = top.id;
    for (let level = 1; level <= 3; level++) {
      const sub = await mkdir(staff.agent, parent, `Ebene ${level}`);
      for (let i = 1; i <= 4; i++) await upload(staff.agent, sub.id, `Datei ${level}-${i}.pdf`);
      parent = sub.id;
    }
    expectStatus(await copy(staff.agent, [top.id], 'WRITTEN'), 200);
    const written = await stageId(staff.agent, 'WRITTEN');
    const copied = await child(written, 'Groß');
    const sub = await prisma.driveNode.findMany({ where: { deletedAt: null, kind: 'FILE', name: { startsWith: 'Datei ' } }, select: { parentId: true } });
    expect(sub).toHaveLength(24); // 12 originals + 12 copies
    let cur = copied.id;
    for (let level = 1; level <= 3; level++) {
      const lv = await child(cur, `Ebene ${level}`);
      expect((await children(lv.id)).filter((n) => n.kind === 'FILE')).toHaveLength(4);
      cur = lv.id;
    }
  });
});
