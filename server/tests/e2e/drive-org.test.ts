import { describe, expect, it } from 'vitest';
import type { User } from '@prisma/client';
import { asAdmin, asClient, asStaff, asSuperAdmin, type Agent } from '../helpers/api';
import { prisma, waitFor } from '../helpers/db';
import { createVisaCategory, l10n } from '../helpers/factories';
import { makePdf } from '../helpers/files';
import { expectStatus } from '../helpers/workflow';
import { backfillContentHashes, hashBuffer, MISSING_HASH } from '../../src/lib/drive/org/hash.js';
import { dayOf } from '../../src/lib/drive/org/naming.js';
import { storeBuffer } from '../../src/lib/drive/files.js';
import { rememberDriveEsign, saveSignedCopyToDrive } from '../../src/lib/driveIntel/signedCopy.js';
import { renameNode, trashNodes } from '../../src/lib/ai/admin/driveOps.js';
import { ensureCaseFolder, syncCaseFolder } from '../../src/lib/drive/caseFolders.js';
import type { AiToolContext } from '../../src/lib/ai/types.js';

type Item = { id: string; name: string; kind: string; parentId: string; workflowStage?: string | null; finalAt?: string | null; tags?: { id: string; name: string; color: string }[] };

const roots = async (a: Agent) => expectStatus(await a.get('/api/drive/roots'), 200).body;
const children = async (a: Agent, id: string) => expectStatus(await a.get(`/api/drive/nodes/${id}/children`), 200).body.items as Item[];
const names = async (a: Agent, id: string) => (await children(a, id)).map((i) => i.name).sort();
const mkdir = async (a: Agent, parentId: string, name: string) => expectStatus(await a.post(`/api/drive/nodes/${parentId}/folders`).send({ name }), 201).body.item as Item;
const uploadRaw = async (a: Agent, parentId: string, filename: string, data?: Buffer, fields: Record<string, string> = {}) => {
  const req = a.post(`/api/drive/nodes/${parentId}/files`);
  for (const [k, v] of Object.entries(fields)) req.field(k, v);
  return req.attach('file', data ?? (await makePdf(filename)), { filename, contentType: 'application/pdf' });
};
const upload = async (a: Agent, parentId: string, filename: string, data?: Buffer, fields: Record<string, string> = {}) =>
  expectStatus(await uploadRaw(a, parentId, filename, data, fields), 201).body as { item: Item; duplicates: { id: string; name: string; path: string; folderName: string | null }[]; originalName?: string };
const restricted = async (su: Agent, parentId: string, name: string) => {
  const f = await mkdir(su, parentId, name);
  expectStatus(await su.patch(`/api/drive/nodes/${f.id}/inheritance`).send({ inherit: false }), 200);
  return f;
};
const folderOfCase = (caseId: string) => waitFor(async () => (await prisma.case.findUnique({ where: { id: caseId } }))?.driveFolderId ?? null);
const newCase = async (client: Agent, body: Record<string, unknown> = { visaType: 'WORK' }) => {
  const c = expectStatus(await client.post('/api/cases').send(body), 201).body.case as { id: string; number: string };
  return { ...c, folderId: await folderOfCase(c.id) };
};
const today = () => dayOf(new Date());

describe('drive organisation: folder templates', () => {
  it('creates template sub-folders in new client folders (category > visa type > default) and applies them to existing folders', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    const su = await asSuperAdmin();
    expect((await staff.agent.get('/api/drive/folder-templates')).status).toBe(403);
    const list = expectStatus(await admin.agent.get('/api/drive/folder-templates'), 200).body;
    expect(list.items).toHaveLength(8);
    const work = list.items.find((t: { visaType: string | null }) => t.visaType === 'WORK');
    expect(work.folders).toEqual(['Reisepass', 'Abschlüsse & Zeugnisse', 'Arbeitsvertrag', 'Anerkennung', 'Botschaft', 'Sonstiges']);
    expect(list.items.find((t: { visaType: string | null }) => t.visaType === 'FAMILY').folders).toContain('Heirats- und Geburtsurkunde');
    // Seeded once: a second listing does not add more.
    expect(expectStatus(await admin.agent.get('/api/drive/folder-templates'), 200).body.items).toHaveLength(8);

    const cat = await createVisaCategory({ slug: 'kuryer', title: l10n('Kuryer'), visaLabel: '§18b' });
    expect((await admin.agent.post('/api/drive/folder-templates').send({ name: 'X', folders: ['a/b'], visaCategoryId: 'nope' })).body.error).toBe('INVALID_CATEGORY');
    expect((await admin.agent.post('/api/drive/folder-templates').send({ name: 'X', folders: ['Bad:Name'] })).body.error).toBe('INVALID_FOLDER_NAME');
    const courier = expectStatus(await admin.agent.post('/api/drive/folder-templates').send({ name: 'Kuryer', visaType: 'WORK', visaCategoryId: cat.id, folders: ['Reisepass', 'Führerschein / Kopien', 'reisepass'] }), 201).body.item;
    expect(courier.folders).toEqual(['Reisepass', 'Führerschein/Kopien']);

    const c1 = await newCase((await asClient()).agent, { visaType: 'WORK', visaCategoryId: cat.id });
    await waitFor(async () => (await prisma.driveNode.count({ where: { parentId: c1.folderId } })) >= 2);
    expect(await names(su.agent, c1.folderId)).toEqual(['Führerschein', 'Reisepass']);
    const fs1 = (await children(su.agent, c1.folderId)).find((i) => i.name === 'Führerschein')!;
    expect(await names(su.agent, fs1.id)).toEqual(['Kopien']);

    const c2 = await newCase((await asClient()).agent, { visaType: 'WORK' });
    await waitFor(async () => (await prisma.driveNode.count({ where: { parentId: c2.folderId } })) >= 6);
    expect(await names(su.agent, c2.folderId)).toEqual([...work.folders].sort());

    // Visa type template switched off: the default template (no type, no category) applies.
    expectStatus(await admin.agent.patch(`/api/drive/folder-templates/${work.id}`).send({ active: false }), 200);
    const c3 = await newCase((await asClient()).agent, { visaType: 'WORK' });
    await waitFor(async () => (await prisma.driveNode.count({ where: { parentId: c3.folderId } })) >= 4);
    expect(await names(su.agent, c3.folderId)).toEqual(['Botschaft', 'Dokumente', 'Reisepass', 'Sonstiges']);

    // Accepted case documents still go into their stage folder; a template folder with a stage name is that folder.
    const std = list.items.find((t: { visaType: string | null; visaCategoryId: string | null }) => !t.visaType && !t.visaCategoryId);
    const kept = await upload(staff.agent, c3.folderId, 'notiz.pdf');
    expectStatus(await admin.agent.patch(`/api/drive/folder-templates/${std.id}`).send({ folders: [...std.folders, 'Übersetzungen/Entwürfe'] }), 200);
    const applied = expectStatus(await admin.agent.post('/api/drive/folder-templates/apply-existing').send({}), 200).body;
    // c3: "Übersetzungen" + "Entwürfe"; c2 (its visa type template is off now): those two + "Dokumente".
    expect(applied).toMatchObject({ created: 5, folders: 3 });
    expect(await names(su.agent, c3.folderId)).toEqual(expect.arrayContaining(['Übersetzungen', 'Botschaft']));
    // Only missing folders were added; nothing else changed.
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: kept.item.id } })).parentId).toBe(c3.folderId);
    expect(expectStatus(await admin.agent.post('/api/drive/folder-templates/apply-existing').send({}), 200).body.created).toBe(0);
    expect((await staff.agent.post('/api/drive/folder-templates/apply-existing').send({})).status).toBe(403);
    expectStatus(await admin.agent.delete(`/api/drive/folder-templates/${courier.id}`), 200);
  });
});

describe('drive organisation: tags', () => {
  it('lists seeded tags, lets admins manage and staff apply them, filters and searches by tag', async () => {
    const staff = await asStaff();
    const admin = await asAdmin();
    const su = await asSuperAdmin();
    const { shared } = await roots(staff.agent);
    const tags = expectStatus(await staff.agent.get('/api/drive/tags'), 200).body;
    expect(tags.tags.map((t: { name: string; color: string }) => `${t.name}:${t.color}`)).toEqual(['Təcili:red', 'Yoxlanılıb:green', 'Tərcüməyə:blue', 'Orijinal lazımdır:amber']);
    expect(tags.canManage).toBe(false);
    const urgent = tags.tags[0];

    expect((await staff.agent.post('/api/drive/tags').send({ name: 'Arxiv' })).status).toBe(403);
    const archive = expectStatus(await admin.agent.post('/api/drive/tags').send({ name: 'Arxiv', color: 'slate' }), 201).body.tag;
    expect((await admin.agent.post('/api/drive/tags').send({ name: 'Arxiv' })).status).toBe(409);
    expect((await admin.agent.post('/api/drive/tags').send({ name: 'X', color: 'gold' })).status).toBe(400);

    const a = await mkdir(staff.agent, shared.id, 'A');
    const b = await mkdir(staff.agent, shared.id, 'B');
    const f1 = (await upload(staff.agent, a.id, 'eins.pdf')).item;
    const f2 = (await upload(staff.agent, b.id, 'zwei.pdf')).item;
    const secret = await restricted(su.agent, shared.id, 'Geheim');
    const f3 = (await upload(su.agent, secret.id, 'drei.pdf')).item;

    const applied = expectStatus(await staff.agent.post('/api/drive/tags/apply').send({ ids: [f1.id, f2.id, f3.id], add: [urgent.id, archive.id] }), 200).body;
    expect(applied).toMatchObject({ ok: 2, failed: 1 });
    expect(applied.results.find((r: { id: string }) => r.id === f3.id).error).toBe('NODE_NOT_FOUND');
    expectStatus(await su.agent.post('/api/drive/tags/apply').send({ ids: [f3.id], add: [urgent.id] }), 200);
    // Chips in listings.
    expect((await children(staff.agent, a.id))[0].tags!.map((t) => t.name)).toEqual(['Təcili', 'Arxiv']);
    // Remove one.
    expectStatus(await staff.agent.post('/api/drive/tags/apply').send({ ids: [f2.id], remove: [archive.id] }), 200);
    expect((await children(staff.agent, b.id))[0].tags!.map((t) => t.name)).toEqual(['Təcili']);
    const acts = await prisma.driveActivity.findMany({ where: { action: { in: ['TAG', 'UNTAG'] } } });
    expect(acts.filter((x) => x.action === 'TAG')).toHaveLength(3);
    expect(acts.find((x) => x.action === 'UNTAG')).toMatchObject({ nodeId: f2.id, meta: expect.objectContaining({ tags: ['Arxiv'] }) });

    // Whole-drive tag search, access-filtered.
    const byTag = expectStatus(await staff.agent.get(`/api/drive/tags/${urgent.id}/items`), 200).body.items as Item[];
    expect(byTag.map((i) => i.id).sort()).toEqual([f1.id, f2.id].sort());
    expect((expectStatus(await su.agent.get(`/api/drive/tags/${urgent.id}/items`), 200).body.items as Item[]).map((i) => i.id)).toContain(f3.id);
    // The normal search finds tag names too.
    const search = expectStatus(await staff.agent.get('/api/drive/search?q=Təcili&content=0'), 200).body.items as Item[];
    expect(search.map((i) => i.id).sort()).toEqual([f1.id, f2.id].sort());

    // Admin renames and deletes tags; chips follow.
    expectStatus(await admin.agent.patch(`/api/drive/tags/${archive.id}`).send({ name: 'Arxivdə', color: 'violet' }), 200);
    expect((await children(staff.agent, a.id))[0].tags!.find((t) => t.id === archive.id)).toMatchObject({ name: 'Arxivdə', color: 'violet' });
    expect((await staff.agent.delete(`/api/drive/tags/${archive.id}`)).status).toBe(403);
    expectStatus(await admin.agent.delete(`/api/drive/tags/${archive.id}`), 200);
    expect((await children(staff.agent, a.id))[0].tags!.map((t) => t.name)).toEqual(['Təcili']);
    // Deleted seeds do not come back.
    expectStatus(await admin.agent.delete(`/api/drive/tags/${urgent.id}`), 200);
    expect(expectStatus(await staff.agent.get('/api/drive/tags'), 200).body.tags).toHaveLength(3);
  });
});

describe('drive organisation: workflow board', () => {
  it('starts client-folder documents in INCOMING, moves them between stages and lists the board', async () => {
    const staff = await asStaff();
    const admin = await asAdmin();
    const client = await asClient({ firstName: 'Elçin', lastName: 'Məmmədov' });
    const { shared } = await roots(staff.agent);
    const c = await newCase(client.agent);
    const inClient = (await upload(staff.agent, c.folderId, 'pass.pdf')).item;
    expect(inClient.workflowStage).toBe('INCOMING');
    const outside = (await upload(staff.agent, shared.id, 'frei.pdf')).item;
    expect(outside.workflowStage).toBeNull();

    // An accepted case document is copied into the drive in INCOMING.
    const req = await prisma.documentRequirement.findFirstOrThrow({ where: { caseId: c.id, stage: 'INITIAL', required: true }, orderBy: { sortOrder: 'asc' } });
    const doc = expectStatus(await client.agent.post(`/api/cases/${c.id}/documents`).field('requirementId', req.id).attach('file', await makePdf('diplom'), { filename: 'diplom.pdf', contentType: 'application/pdf' }), 201).body.document;
    expectStatus(await admin.agent.post(`/api/admin/cases/${c.id}/documents/${doc.id}/review`).send({ status: 'ACCEPTED' }), 200);
    const copy = await waitFor(() => prisma.driveNode.findUnique({ where: { documentId: doc.id } }));
    expect(copy.workflowStage).toBe('INCOMING');
    expect(copy.workflowAt).not.toBeNull();

    const moved = expectStatus(await staff.agent.patch(`/api/drive/nodes/${inClient.id}/stage`).send({ stage: 'REVIEW' }), 200).body.item;
    expect(moved.workflowStage).toBe('REVIEW');
    expect((await staff.agent.patch(`/api/drive/nodes/${inClient.id}/stage`).send({ stage: 'DONE' })).status).toBe(400);
    const bulk = expectStatus(await staff.agent.post('/api/drive/stage/bulk').send({ ids: [inClient.id, copy.id, c.folderId], stage: 'TRANSLATION' }), 200).body;
    expect(bulk).toMatchObject({ ok: 2, failed: 1 });
    expect(bulk.results.find((r: { id: string }) => r.id === c.folderId).error).toBe('NOT_A_FILE');
    const stageRows = await prisma.driveActivity.findMany({ where: { action: 'STAGE', nodeId: inClient.id }, orderBy: { createdAt: 'asc' } });
    expect(stageRows.map((r) => (r.meta as { to: string }).to)).toEqual(['REVIEW', 'TRANSLATION']);

    // Board: scope = the client folder (recursive) or everything, with filters.
    const board = expectStatus(await staff.agent.get(`/api/drive/board?folderId=${c.folderId}`), 200).body;
    expect(board.stages).toEqual(['INCOMING', 'REVIEW', 'TRANSLATION', 'APOSTILLE', 'READY', 'SENT_TO_EMBASSY']);
    expect(board.items.map((i: Item) => i.id).sort()).toEqual([inClient.id, copy.id].sort());
    expect(board.items[0].client).toMatchObject({ caseId: c.id, caseNumber: c.number, folderId: c.folderId });
    const all = expectStatus(await staff.agent.get('/api/drive/board'), 200).body.items as Item[];
    expect(all.map((i) => i.id)).not.toContain(outside.id);
    expect((expectStatus(await staff.agent.get(`/api/drive/board?caseId=${c.id}`), 200).body.items as Item[]).length).toBe(2);
    expect((expectStatus(await staff.agent.get(`/api/drive/board?uploadedById=${staff.user.id}`), 200).body.items as Item[]).map((i) => i.id)).toEqual([inClient.id]);
    const tag = (expectStatus(await staff.agent.get('/api/drive/tags'), 200).body.tags as { id: string }[])[0];
    expectStatus(await staff.agent.post('/api/drive/tags/apply').send({ ids: [copy.id], add: [tag.id] }), 200);
    expect((expectStatus(await staff.agent.get(`/api/drive/board?tagId=${tag.id}`), 200).body.items as Item[]).map((i) => i.id)).toEqual([copy.id]);
    expect((expectStatus(await staff.agent.get('/api/drive/board?from=2000-01-01&to=2000-01-02'), 200).body.items as Item[]).length).toBe(0);
    // Clearing the stage takes a card off the board.
    expectStatus(await staff.agent.patch(`/api/drive/nodes/${inClient.id}/stage`).send({ stage: null }), 200);
    expect((expectStatus(await staff.agent.get(`/api/drive/board?folderId=${c.folderId}`), 200).body.items as Item[]).map((i) => i.id)).toEqual([copy.id]);
  });
});

describe('drive organisation: readiness of a client folder', () => {
  it('counts the required documents of all stages and lists what is missing, rejected or pending', async () => {
    const staff = await asStaff();
    const client = await asClient();
    const c = await newCase(client.agent);
    const reqs = await prisma.documentRequirement.findMany({ where: { caseId: c.id, required: true }, orderBy: [{ stage: 'asc' }, { sortOrder: 'asc' }] });
    expect(reqs.length).toBeGreaterThanOrEqual(3);
    const mk = (requirementId: string, status: 'ACCEPTED' | 'REJECTED' | 'PENDING', i: number) =>
      prisma.document.create({ data: { caseId: c.id, requirementId, stage: reqs.find((r) => r.id === requirementId)!.stage, originalName: `f${i}.pdf`, storedName: `ready-${i}-${Date.now()}.pdf`, mimeType: 'application/pdf', size: 1, status, uploadedById: client.user.id } });
    await mk(reqs[0].id, 'ACCEPTED', 1);
    await mk(reqs[1].id, 'REJECTED', 2);
    await mk(reqs[2].id, 'PENDING', 3);
    await mk(reqs[2].id, 'REJECTED', 4);
    const r = expectStatus(await staff.agent.get(`/api/drive/case-folders/${c.id}/readiness`), 200).body;
    expect(r).toMatchObject({ caseId: c.id, total: reqs.length, ready: 1, rejected: 1, pending: 1, missing: reqs.length - 3, link: `/admin/cases/${c.id}` });
    expect(r.items.find((i: { id: string }) => i.id === reqs[1].id).status).toBe('rejected');
    expect(r.items.find((i: { id: string }) => i.id === reqs[2].id).status).toBe('pending');
    // Optional requirements are not counted.
    await prisma.documentRequirement.update({ where: { id: reqs[3].id }, data: { required: false } });
    expect(expectStatus(await staff.agent.get(`/api/drive/case-folders/${c.id}/readiness`), 200).body.total).toBe(reqs.length - 1);
    expect((await staff.agent.get('/api/drive/case-folders/nope/readiness')).status).toBe(404);
    expect((await client.agent.get(`/api/drive/case-folders/${c.id}/readiness`)).status).toBe(403);
  });
});

describe('drive organisation: automatic names', () => {
  it('names uploads and case documents by the pattern, keeps Azerbaijani letters, stays unique and can be switched off', async () => {
    const staff = await asStaff();
    const admin = await asAdmin();
    const client = await asClient({ firstName: 'Elçin', lastName: 'Məmmədov' });
    const { shared } = await roots(staff.agent);
    const c = await newCase(client.agent);
    const settings = expectStatus(await staff.agent.get('/api/drive/naming'), 200).body;
    expect(settings).toMatchObject({ enabled: true, pattern: '{Nachname}_{Vorname}_{Typ}_{Datum}', canManage: false });
    expect(settings.docTypes).toContain('Pasport');

    const d = today();
    const typed = await upload(staff.agent, c.folderId, 'IMG_0001.pdf', undefined, { docType: 'Pasport' });
    expect(typed.item.name).toBe(`Məmmədov_Elçin_Pasport_${d}.pdf`);
    expect(typed.originalName).toBe('IMG_0001.pdf');
    expect((await upload(staff.agent, c.folderId, 'IMG_0002.pdf', undefined, { docType: 'Pasport' })).item.name).toBe(`Məmmədov_Elçin_Pasport_${d} (2).pdf`);
    // Without a type: the sub-folder name, else the original base name (cleaned).
    const sub = await mkdir(staff.agent, c.folderId, 'Diplom');
    expect((await upload(staff.agent, sub.id, 'scan.pdf')).item.name).toBe(`Məmmədov_Elçin_Diplom_${d}.pdf`);
    expect((await upload(staff.agent, c.folderId, 'mein scan: 1.pdf')).item.name).toBe(`Məmmədov_Elçin_mein-scan-1_${d}.pdf`);
    // Outside client folders nothing changes.
    expect((await upload(staff.agent, shared.id, 'IMG_0001.pdf')).item.name).toBe('IMG_0001.pdf');

    // Case documents: the requirement title (az) is the type.
    const req = await prisma.documentRequirement.findFirstOrThrow({ where: { caseId: c.id, stage: 'INITIAL' }, orderBy: { sortOrder: 'asc' } });
    await prisma.documentRequirement.update({ where: { id: req.id }, data: { title: { az: 'Xarici pasport', de: 'Reisepass', en: 'Passport', ru: 'Паспорт' } } });
    const doc = expectStatus(await client.agent.post(`/api/cases/${c.id}/documents`).field('requirementId', req.id).attach('file', await makePdf('p'), { filename: 'x.pdf', contentType: 'application/pdf' }), 201).body.document;
    expectStatus(await admin.agent.post(`/api/admin/cases/${c.id}/documents/${doc.id}/review`).send({ status: 'ACCEPTED' }), 200);
    const copy = await waitFor(() => prisma.driveNode.findUnique({ where: { documentId: doc.id } }));
    expect(copy.name).toBe(`Məmmədov_Elçin_Xarici-pasport_${d}.pdf`);

    // Settings: admins only; pattern tokens are checked.
    expect((await staff.agent.put('/api/drive/naming').send({ enabled: false, pattern: '{Typ}' })).status).toBe(403);
    expect((await admin.agent.put('/api/drive/naming').send({ enabled: true, pattern: '{Kunde}_{Typ}' })).body.error).toBe('INVALID_PATTERN');
    expect((await admin.agent.put('/api/drive/naming').send({ enabled: true, pattern: 'a/b_{Typ}' })).body.error).toBe('INVALID_PATTERN');
    expectStatus(await admin.agent.put('/api/drive/naming').send({ enabled: true, pattern: '{Fallnummer}_{Typ}_{Datum}' }), 200);
    expect((await upload(staff.agent, c.folderId, 'a.pdf', undefined, { docType: 'CV' })).item.name).toBe(`${c.number}_CV_${d}.pdf`);
    expectStatus(await admin.agent.put('/api/drive/naming').send({ enabled: false, pattern: '{Nachname}_{Vorname}_{Typ}_{Datum}' }), 200);
    expect((await upload(staff.agent, c.folderId, 'Lebenslauf.pdf', undefined, { docType: 'CV' })).item.name).toBe('Lebenslauf.pdf');
  });

  it('previews and applies "Adları qaydaya sal" for a folder, never touching final files', async () => {
    const staff = await asStaff();
    const admin = await asAdmin();
    const client = await asClient({ firstName: 'Aysel', lastName: 'Quliyeva' });
    const c = await newCase(client.agent);
    expectStatus(await admin.agent.put('/api/drive/naming').send({ enabled: false, pattern: '{Nachname}_{Vorname}_{Typ}_{Datum}' }), 200);
    const sub = await mkdir(staff.agent, c.folderId, 'Zeugnisse');
    const a = (await upload(staff.agent, sub.id, 'scan a.pdf')).item;
    const b = (await upload(staff.agent, sub.id, 'scan b.pdf')).item;
    const fin = (await upload(staff.agent, c.folderId, 'vertrag.pdf')).item;
    expectStatus(await staff.agent.post('/api/drive/final').send({ ids: [fin.id] }), 200);
    // Existing files are never renamed automatically (also after switching naming on).
    expectStatus(await admin.agent.put('/api/drive/naming').send({ enabled: true, pattern: '{Nachname}_{Vorname}_{Typ}_{Datum}' }), 200);
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: a.id } })).name).toBe('scan a.pdf');

    const d = today();
    const preview = expectStatus(await staff.agent.post('/api/drive/naming/preview').send({ folderId: c.folderId }), 200).body;
    const byId = new Map((preview.items as { id: string; to: string; blocked?: string }[]).map((i) => [i.id, i]));
    expect(byId.get(a.id)!.to).toBe(`Quliyeva_Aysel_Zeugnisse_${d}.pdf`);
    expect(byId.get(b.id)!.to).toBe(`Quliyeva_Aysel_Zeugnisse_${d} (2).pdf`);
    expect(byId.get(fin.id)).toMatchObject({ to: `Quliyeva_Aysel_vertrag_${d}.pdf`, blocked: 'FILE_FINAL' });
    // Preview changes nothing.
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: a.id } })).name).toBe('scan a.pdf');

    const applied = expectStatus(await staff.agent.post('/api/drive/naming/apply').send({ folderId: c.folderId, ids: [a.id, fin.id] }), 200).body;
    expect(applied).toMatchObject({ ok: 1, failed: 1 });
    expect(applied.results.find((r: { id: string }) => r.id === fin.id).error).toBe('FILE_FINAL');
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: a.id } })).name).toBe(`Quliyeva_Aysel_Zeugnisse_${d}.pdf`);
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: fin.id } })).name).toBe('vertrag.pdf');
    // Already named files are left out of the next preview.
    const again = expectStatus(await staff.agent.post('/api/drive/naming/preview').send({ folderId: c.folderId }), 200).body.items as { id: string; to: string }[];
    expect(again.map((i) => i.id).sort()).toEqual([b.id, fin.id].sort());
    expect(again.find((i) => i.id === b.id)!.to).toBe(`Quliyeva_Aysel_Zeugnisse_${d} (2).pdf`);
    expect(await prisma.auditLog.count({ where: { action: 'DRIVE_RENAMED', target: `drive:${a.id}` } })).toBe(1);
  });
});

describe('drive organisation: smart folders', () => {
  it('runs seeded and saved searches live, private vs shared, with access filtering', async () => {
    const staff = await asStaff();
    const other = await asStaff();
    const admin = await asAdmin();
    const su = await asSuperAdmin();
    const { shared } = await roots(staff.agent);
    const list = expectStatus(await staff.agent.get('/api/drive/smart-folders'), 200).body;
    expect(list.items.map((f: { name: string }) => f.name)).toEqual(['Bu həftə yüklənən pasportlar', 'Tərcüməsi gözlənilən sənədlər']);
    expect(list.items.every((f: { shared: boolean; canEdit: boolean }) => f.shared && !f.canEdit)).toBe(true);
    const [passports, translations] = list.items as { id: string }[];

    const folder = await mkdir(staff.agent, shared.id, 'Eingang');
    const pass = (await upload(staff.agent, folder.id, 'Reisepass_Kopie.pdf')).item;
    const old = (await upload(staff.agent, folder.id, 'Pasport_alt.pdf')).item;
    await prisma.driveNode.update({ where: { id: old.id }, data: { createdAt: new Date(Date.now() - 10 * 86_400_000) } });
    const viaTag = (await upload(staff.agent, folder.id, 'scan.pdf')).item;
    const secret = await restricted(su.agent, shared.id, 'Geheim');
    const hidden = (await upload(su.agent, secret.id, 'Pass_geheim.pdf')).item;
    const tags = expectStatus(await staff.agent.get('/api/drive/tags'), 200).body.tags as { id: string; name: string }[];
    const tr = tags.find((t) => t.name === 'Tərcüməyə')!;
    expectStatus(await admin.agent.post('/api/drive/tags').send({ name: 'Reisepass-Kopie' }), 201);
    const passTag = (expectStatus(await staff.agent.get('/api/drive/tags'), 200).body.tags as { id: string; name: string }[]).find((t) => t.name === 'Reisepass-Kopie')!;
    expectStatus(await staff.agent.post('/api/drive/tags/apply').send({ ids: [viaTag.id], add: [passTag.id] }), 200);

    const run = async (a: Agent, id: string) => (expectStatus(await a.get(`/api/drive/smart-folders/${id}/items`), 200).body.items as Item[]).map((i) => i.id).sort();
    expect(await run(staff.agent, passports.id)).toEqual([pass.id, viaTag.id].sort());
    expect(await run(su.agent, passports.id)).toContain(hidden.id);

    const waiting = (await upload(staff.agent, folder.id, 'brief.pdf')).item;
    const tagged = (await upload(staff.agent, folder.id, 'urkunde.pdf')).item;
    await prisma.driveNode.update({ where: { id: waiting.id }, data: { workflowStage: 'TRANSLATION' } });
    expectStatus(await staff.agent.post('/api/drive/tags/apply').send({ ids: [tagged.id], add: [tr.id] }), 200);
    expect(await run(staff.agent, translations.id)).toEqual([waiting.id, tagged.id].sort());

    // Private smart folder: only its owner sees and runs it.
    const mine = expectStatus(await staff.agent.post('/api/drive/smart-folders').send({ name: 'Meine Briefe', query: { words: ['brief'], folderId: folder.id } }), 201).body.item;
    expect(mine).toMatchObject({ shared: false, mine: true, canEdit: true });
    expect(await run(staff.agent, mine.id)).toEqual([waiting.id]);
    expect((expectStatus(await other.agent.get('/api/drive/smart-folders'), 200).body.items as { id: string }[]).map((f) => f.id)).not.toContain(mine.id);
    expect((await other.agent.get(`/api/drive/smart-folders/${mine.id}/items`)).status).toBe(404);
    expect((await other.agent.delete(`/api/drive/smart-folders/${mine.id}`)).status).toBe(404);

    // Shared: the team sees it; only the owner or an admin may change it.
    expectStatus(await staff.agent.patch(`/api/drive/smart-folders/${mine.id}`).send({ shared: true }), 200);
    expect(await run(other.agent, mine.id)).toEqual([waiting.id]);
    expect((await other.agent.patch(`/api/drive/smart-folders/${mine.id}`).send({ name: 'X' })).status).toBe(403);
    expectStatus(await admin.agent.patch(`/api/drive/smart-folders/${mine.id}`).send({ name: 'Briefe' }), 200);
    expect((await other.agent.delete(`/api/drive/smart-folders/${passports.id}`)).status).toBe(403);
    expectStatus(await admin.agent.delete(`/api/drive/smart-folders/${passports.id}`), 200);
    expect((await staff.agent.post('/api/drive/smart-folders').send({ name: 'Bad', query: { stages: ['NOPE'] } })).status).toBe(400);

    // Ad-hoc query (explorer filters) with types, stage and uploader.
    const q = expectStatus(await staff.agent.post('/api/drive/query').send({ query: { types: ['pdf'], stages: ['TRANSLATION'], uploadedById: staff.user.id } }), 200).body.items as Item[];
    expect(q.map((i) => i.id)).toEqual([waiting.id]);
    // Seeds are not created again.
    expect(expectStatus(await staff.agent.get('/api/drive/smart-folders'), 200).body.items).toHaveLength(2);
  });
});

describe('drive organisation: duplicates', () => {
  it('reports duplicates on upload, in the admin report and after the backfill', async () => {
    const staff = await asStaff();
    const admin = await asAdmin();
    const su = await asSuperAdmin();
    const { shared } = await roots(staff.agent);
    const a = await mkdir(staff.agent, shared.id, 'Erstdokumente');
    const b = await mkdir(staff.agent, shared.id, 'Ablage');
    const bytes = await makePdf('gleich');
    const first = await upload(staff.agent, a.id, 'pass.pdf', bytes);
    expect(first.duplicates).toEqual([]);
    const second = await upload(staff.agent, b.id, 'pass-kopie.pdf', bytes);
    expect(second.duplicates).toEqual([expect.objectContaining({ id: first.item.id, name: 'pass.pdf', folderName: 'Erstdokumente', path: 'Gemeinsame Dokumente/Erstdokumente' })]);
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: first.item.id } })).contentHash).toBe(hashBuffer(bytes));
    // Copies carry the hash; a copy in a folder the uploader cannot see is not revealed.
    const secret = await restricted(su.agent, shared.id, 'Geheim');
    expectStatus(await su.agent.post('/api/drive/copy').send({ ids: [first.item.id], targetId: secret.id }), 200);
    const third = await upload(staff.agent, b.id, 'noch-einmal.pdf', bytes);
    expect(third.duplicates.map((d) => d.id).sort()).toEqual([first.item.id, second.item.id].sort());
    // Trashed files do not count.
    expectStatus(await staff.agent.post('/api/drive/trash').send({ ids: [third.item.id] }), 200);

    expect((await staff.agent.get('/api/drive/duplicates')).status).toBe(403);
    const report = expectStatus(await admin.agent.get('/api/drive/duplicates'), 200).body;
    expect(report.groups).toHaveLength(1);
    expect(report.groups[0].items.map((i: Item) => i.id).sort()).toEqual([first.item.id, second.item.id].sort());
    expect(report.wastedBytes).toBe(bytes.length);
    expect(expectStatus(await admin.agent.get(`/api/drive/duplicates?folderId=${a.id}`), 200).body.groups).toHaveLength(0);
    expect(expectStatus(await su.agent.get('/api/drive/duplicates'), 200).body.groups[0].items).toHaveLength(3);

    // Backfill: older files without a hash get one; a file missing on disk is marked and not retried.
    const buf = await makePdf('alt');
    const legacy = await prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FILE', name: 'alt.pdf', parentId: a.id, storageKey: await storeBuffer(buf), mimeType: 'application/pdf', size: buf.length, updatedAt: new Date('2025-01-01') } });
    const gone = await prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FILE', name: 'weg.pdf', parentId: a.id, storageKey: 'a'.repeat(32), mimeType: 'application/pdf', size: 1 } });
    expect(expectStatus(await admin.agent.get('/api/drive/duplicates'), 200).body.unchecked).toBe(2);
    const r = await backfillContentHashes();
    expect(r).toMatchObject({ hashed: 1, missing: 1 });
    const after = await prisma.driveNode.findUniqueOrThrow({ where: { id: legacy.id } });
    expect(after.contentHash).toBe(hashBuffer(buf));
    expect(after.updatedAt.toISOString()).toBe('2025-01-01T00:00:00.000Z');
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: gone.id } })).contentHash).toBe(MISSING_HASH);
    expect(await backfillContentHashes()).toMatchObject({ hashed: 0, missing: 0 });
    // The next upload of the same bytes finds the backfilled file.
    expect((await upload(staff.agent, b.id, 'alt-kopie.pdf', buf)).duplicates.map((d) => d.id)).toEqual([legacy.id]);
  });
});

describe('drive organisation: Final lock', () => {
  const aiCtx = (u: User): AiToolContext => ({ user: { id: u.id, role: u.role, firstName: u.firstName, lastName: u.lastName, email: u.email, locale: 'az' }, scope: 'ADMIN', conversationId: 't', context: null });

  it('blocks rename, move, new versions, editor saves and deletion for everyone; only a super admin unlocks it, with a reason', async () => {
    const staff = await asStaff();
    const admin = await asAdmin();
    const su = await asSuperAdmin();
    const { shared } = await roots(staff.agent);
    const folder = await mkdir(staff.agent, shared.id, 'Botschaft');
    const other = await mkdir(staff.agent, shared.id, 'Andere');
    const file = (await upload(staff.agent, folder.id, 'paket.pdf')).item;
    const loose = (await upload(staff.agent, other.id, 'lose.pdf')).item;
    const sheetId = expectStatus(await staff.agent.post('/api/drive/sheets').send({ parentId: other.id, name: 'Liste.xlsx' }), 201).body.id as string;
    const pdf = expectStatus(await staff.agent.post('/api/drive/create/pdf').send({ parentId: other.id, name: 'Brief', blocks: [] }), 201).body.item as Item;

    const marked = expectStatus(await staff.agent.post('/api/drive/final').send({ ids: [file.id, sheetId, pdf.id] }), 200).body;
    expect(marked).toMatchObject({ ok: 3 });
    const row = (await children(staff.agent, folder.id)).find((i) => i.id === file.id)!;
    expect(row.finalAt).toBeTruthy();
    expect(await prisma.driveActivity.count({ where: { action: 'FINAL' } })).toBe(3);

    const final = (res: { status: number; body: { error?: string } }) => {
      expect(res.status).toBe(423);
      expect(res.body.error).toBe('FILE_FINAL');
    };
    final(await su.agent.patch(`/api/drive/nodes/${file.id}`).send({ name: 'neu.pdf' }));
    expect(expectStatus(await su.agent.post('/api/drive/move').send({ ids: [file.id], targetId: other.id }), 200).body.results[0].error).toBe('FILE_FINAL');
    expect(expectStatus(await su.agent.post('/api/drive/trash').send({ ids: [file.id] }), 200).body.results[0].error).toBe('FILE_FINAL');
    expect(expectStatus(await su.agent.post('/api/drive/bulk/delete').send({ ids: [file.id] }), 200).body.results[0].error).toBe('FILE_FINAL');
    final(await uploadRaw(su.agent, folder.id, 'paket.pdf', undefined, { onConflict: 'replace' }));
    // A folder holding a final file can be neither deleted nor moved.
    expect(expectStatus(await su.agent.post('/api/drive/trash').send({ ids: [folder.id] }), 200).body.results[0].error).toBe('FILE_FINAL');
    expect(expectStatus(await su.agent.post('/api/drive/move').send({ ids: [folder.id], targetId: other.id }), 200).body.results[0].error).toBe('FILE_FINAL');
    // Editors.
    final(await staff.agent.put(`/api/drive/sheets/${sheetId}`).send({ baseVersion: 1, sheets: [] }));
    final(await staff.agent.put(`/api/drive/create/pdf/${pdf.id}`).send({ blocks: [], baseVersion: 1 }));
    // The AI operator goes through the same check.
    const suUser = await prisma.user.findUniqueOrThrow({ where: { id: su.user.id } });
    await expect(renameNode(aiCtx(suUser), file.id, 'x.pdf')).rejects.toMatchObject({ status: 423, code: 'FILE_FINAL' });
    expect((await trashNodes(aiCtx(suUser), [folder.id])).results[0].error).toBe('FILE_FINAL');
    // Other files are not affected; tags and stages still work on final files.
    expectStatus(await staff.agent.patch(`/api/drive/nodes/${loose.id}`).send({ name: 'lose2.pdf' }), 200);
    expectStatus(await staff.agent.patch(`/api/drive/nodes/${file.id}/stage`).send({ stage: 'SENT_TO_EMBASSY' }), 200);

    // Unlock: super admin only, with a reason (audited).
    expect((await admin.agent.post('/api/drive/unfinal').send({ ids: [file.id], reason: 'Fehler im Paket' })).status).toBe(403);
    expect((await su.agent.post('/api/drive/unfinal').send({ ids: [file.id] })).status).toBe(400);
    expectStatus(await su.agent.post('/api/drive/unfinal').send({ ids: [file.id], reason: 'Fehler im Paket' }), 200);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'DRIVE_FINAL_REMOVED', target: `drive:${file.id}` } });
    expect(log.details).toMatchObject({ reason: 'Fehler im Paket' });
    expectStatus(await staff.agent.patch(`/api/drive/nodes/${file.id}`).send({ name: 'neu.pdf' }), 200);

    // A folder marked final makes every file inside final.
    const inner = (await upload(staff.agent, folder.id, 'zweite.pdf')).item;
    expectStatus(await staff.agent.post('/api/drive/final').send({ ids: [folder.id] }), 200);
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: inner.id } })).finalAt).not.toBeNull();
    final(await staff.agent.patch(`/api/drive/nodes/${inner.id}`).send({ name: 'z.pdf' }));
    expectStatus(await su.agent.post('/api/drive/unfinal').send({ ids: [folder.id], reason: 'Neu packen' }), 200);
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: inner.id } })).finalAt).toBeNull();
  });

  it('marks e-signed copies saved into the drive as final', async () => {
    const staff = await asStaff();
    const { shared } = await roots(staff.agent);
    const file = (await upload(staff.agent, shared.id, 'Vertrag.pdf')).item;
    await rememberDriveEsign('req-final-1', { nodeId: file.id, parentId: shared.id, name: file.name, userId: staff.user.id });
    const signedId = await saveSignedCopyToDrive('req-final-1', await makePdf('signed'));
    const signed = await prisma.driveNode.findUniqueOrThrow({ where: { id: signedId! } });
    expect(signed.name).toBe('Vertrag (imzalanmış).pdf');
    expect(signed.finalAt).not.toBeNull();
    expect((await staff.agent.post('/api/drive/trash').send({ ids: [signed.id] })).body.results[0].error).toBe('FILE_FINAL');
  });
});

describe('drive organisation: archived client folders', () => {
  it('leaves an archived client folder where it is when the case is synced (renaming in place only)', async () => {
    const su = await asSuperAdmin();
    const client = await asClient({ firstName: 'Orxan', lastName: 'Bayramov' });
    const c = await newCase(client.agent);
    const { shared } = await roots(su.agent);
    const archive = await mkdir(su.agent, shared.id, 'Archiv');
    const year = await mkdir(su.agent, archive.id, '2026');
    await prisma.driveNode.update({ where: { id: c.folderId }, data: { parentId: year.id, archivedAt: new Date() } });
    await prisma.user.update({ where: { id: client.user.id }, data: { lastName: 'Bayramli', passportNumber: 'C99' } });
    await syncCaseFolder(c.id);
    const after = await prisma.driveNode.findUniqueOrThrow({ where: { id: c.folderId } });
    expect(after).toMatchObject({ parentId: year.id, name: 'Orxan Bayramli · Pass-Nr. C99' });
    expect(await ensureCaseFolder(c.id)).toBe(c.folderId);
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: c.folderId } })).parentId).toBe(year.id);
    // A folder that is not archived still moves back to its place.
    await prisma.driveNode.update({ where: { id: c.folderId }, data: { archivedAt: null } });
    await syncCaseFolder(c.id);
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: c.folderId } })).parentId).not.toBe(year.id);
  });
});

describe('drive organisation: HEIC photos', () => {
  const heic = (brand: string) => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from(brand, 'latin1'), Buffer.alloc(64, 1)]);

  it('accepts HEIC/HEIF in the drive by magic bytes, nowhere else', async () => {
    const staff = await asStaff();
    const { shared } = await roots(staff.agent);
    for (const [name, brand] of [['IMG_1.HEIC', 'ftypheic'], ['IMG_2.heic', 'ftypheix'], ['IMG_3.heif', 'ftypmif1'], ['IMG_4.heic', 'ftyphevc']]) {
      const res = await staff.agent.post(`/api/drive/nodes/${shared.id}/files`).attach('file', heic(brand), { filename: name, contentType: 'application/octet-stream' });
      expectStatus(res, 201);
      expect(res.body.item.mimeType).toMatch(/^image\/hei[cf]$/);
    }
    const fake = await staff.agent.post(`/api/drive/nodes/${shared.id}/files`).attach('file', Buffer.from('not a photo at all, really'), { filename: 'x.heic', contentType: 'image/heic' });
    expect(fake.status).toBe(400);
    expect(fake.body.error).toBe('FILE_CONTENT_MISMATCH');
    // Case documents take HEIC too but store it as JPEG: an undecodable one is refused (nothing stored).
    const client = await asClient();
    const c = await newCase(client.agent);
    const req = await prisma.documentRequirement.findFirstOrThrow({ where: { caseId: c.id } });
    const doc = await client.agent.post(`/api/cases/${c.id}/documents`).field('requirementId', req.id).attach('file', heic('ftypheic'), { filename: 'pass.heic', contentType: 'image/heic' });
    expect(doc.status).toBe(400);
    expect(doc.body.error).toBe('HEIC_UNREADABLE');
    expect(await prisma.document.count({ where: { caseId: c.id } })).toBe(0);
  });
});
