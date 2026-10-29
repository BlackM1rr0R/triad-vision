import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { asClient, asStaff, asSuperAdmin } from '../helpers/api';
import { prisma, waitFor } from '../helpers/db';
import { makePdf, PDF } from '../helpers/files';
import { clientCase, createCaseVia, expectStatus } from '../helpers/workflow';
import { buildMrz, monthsFromNow } from './passport-scan.fixtures';
import { asCandidate, createVacancy } from './vacancies.fixtures';
import { aiDocCheckDeps, waitForAiDocChecks } from '../../src/lib/aiDocs/docCheck.js';
import { subscribe, type RealtimeEvent } from '../../src/lib/messaging/realtime.js';
import { clearUploadAiSettingsCache, uploadAiDeps, waitForUploadAi } from '../../src/lib/uploadAi/index.js';
import { stopDecoder } from '../../src/lib/uploadAi/decoder.js';
import { addFamilyMember } from '../../src/lib/journey/family.js';
import { AI_DOC_TASK_MARKER } from '../../src/lib/ai/features/caseAi/findingTasks.js';
import { waitForApplicationUploads } from '../../src/lib/applicationUploads.js';

/**
 * Owner feedback round (docs):
 *   1. the upload name check also for STAFF uploads on a client's behalf (admin case documents, drive files);
 *   2. AI document findings → ONE task per client with a checklist;
 *   3. application / client uploads land in "<client folder>/<type folder>" and on the case requirement.
 */

beforeEach(async () => {
  clearUploadAiSettingsCache();
  uploadAiDeps.autoEnabled = () => true;
  aiDocCheckDeps.autoEnabled = () => false;
  // Folder structure checks below look at folder names; automatic file naming stays off.
  await prisma.setting.create({ data: { key: 'drive.autoNaming', value: { enabled: false, pattern: '{Nachname}_{Vorname}_{Typ}_{Datum}' } } });
});

afterEach(async () => {
  await waitForApplicationUploads();
  await waitForAiDocChecks();
  await waitForUploadAi();
});

afterAll(() => {
  uploadAiDeps.autoEnabled = () => false;
  stopDecoder();
});

const EXPIRY = monthsFromNow(24);
const passportPdf = async (surname: string, given: string) => {
  const [l1, l2] = buildMrz({ surname, given, docNo: 'C01234567', birth: '1990-01-15', expiry: EXPIRY });
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Courier);
  const page = doc.addPage([595, 842]);
  page.drawText('REPUBLIC OF AZERBAIJAN', { x: 40, y: 700, size: 14, font });
  page.drawText(l1, { x: 20, y: 120, size: 12, font });
  page.drawText(l2, { x: 20, y: 100, size: 12, font });
  return Buffer.from(await doc.save());
};

const reqOf = async (caseId: string, key: string) => prisma.documentRequirement.findFirstOrThrow({ where: { caseId, key } });

const capture = (userId: string) => {
  const events: RealtimeEvent[] = [];
  const off = subscribe(userId, (ev) => {
    if (ev.type === 'upload-ai.ready') events.push(ev);
  });
  return { events, off };
};

const folderOf = (caseId: string) => waitFor(async () => (await prisma.case.findUnique({ where: { id: caseId }, select: { driveFolderId: true } }))?.driveFolderId ?? null);

// ─── 1. Name check for staff uploads ───────────────────────────────────

describe('1 · name check of staff uploads', () => {
  it('a passport of another person uploaded by staff in the admin case card: NAME_MISMATCH with both names, realtime warning for the uploader', async () => {
    const client = await asClient({ firstName: 'Əli', lastName: 'Məmmədov' });
    const c = await createCaseVia(client.agent);
    const staff = await asStaff();
    const rt = capture(staff.user.id);
    const passport = await reqOf(c.id, 'PASSPORT');
    const up = expectStatus(
      await staff.agent.post(`/api/admin/cases/${c.id}/documents`).field('stage', 'INITIAL').field('requirementId', passport.id).attach('file', await passportPdf('HUSEYNOV', 'RASHAD'), { filename: 'pass.pdf', ...PDF }),
      201,
    );
    await waitForUploadAi();
    rt.off();
    const insight = await prisma.documentInsight.findUniqueOrThrow({ where: { documentId: up.body.document.id } });
    expect(insight.flags).toContain('NAME_MISMATCH');
    expect((insight.proposals as { holder?: unknown }).holder).toEqual({ found: expect.stringMatching(/Huseynov/i), expected: 'Əli Məmmədov' });

    // The uploader (staff) gets the event with the flag, the names and the file name → toast in the upload UI.
    const ev = rt.events.find((e) => e.payload.documentId === up.body.document.id);
    expect(ev?.payload).toMatchObject({ flags: expect.arrayContaining(['NAME_MISMATCH']), uploadedById: staff.user.id, fileName: 'pass.pdf', holder: { expected: 'Əli Məmmədov' } });

    // Visible in review: the staff insight list of the case.
    const list = expectStatus(await staff.agent.get(`/api/upload-ai/cases/${c.id}`), 200).body.insights as { documentId: string; flags: string[]; proposals: { holder?: { found: string; expected: string } } }[];
    const row = list.find((i) => i.documentId === up.body.document.id)!;
    expect(row.flags).toContain('NAME_MISMATCH');
    expect(row.proposals.holder?.expected).toBe('Əli Məmmədov');
    // The upload itself was not blocked.
    expect(await prisma.document.findUniqueOrThrow({ where: { id: up.body.document.id } })).toMatchObject({ status: 'ACCEPTED' });
  });

  it('Azerbaijani / Latin spelling of the same name does not raise the warning', async () => {
    const client = await asClient({ firstName: 'Əli', lastName: 'Məmmədov' });
    const c = await createCaseVia(client.agent);
    const staff = await asStaff();
    const passport = await reqOf(c.id, 'PASSPORT');
    const up = expectStatus(
      await staff.agent.post(`/api/admin/cases/${c.id}/documents`).field('stage', 'INITIAL').field('requirementId', passport.id).attach('file', await passportPdf('MAMMADOV', 'ALI'), { filename: 'pass.pdf', ...PDF }),
      201,
    );
    await waitForUploadAi();
    const insight = await prisma.documentInsight.findUniqueOrThrow({ where: { documentId: up.body.document.id } });
    expect(insight.docType).toBe('PASSPORT');
    expect(insight.flags).not.toContain('NAME_MISMATCH');
    expect((insight.proposals as { holder?: unknown }).holder).toBeUndefined();
  });

  it('family member case: compared with the member (the main applicant’s passport is flagged, hers is not)', async () => {
    const su = await asSuperAdmin();
    const client = await asClient({ firstName: 'Əli', lastName: 'Məmmədov' });
    const c = await createCaseVia(client.agent);
    const member = await addFamilyMember(c.id, su.user.id, { firstName: 'Leyla', lastName: 'Məmmədova', relation: 'spouse' });
    const passport = await reqOf(member.id, 'PASSPORT');
    const staff = await asStaff();
    const upload = async (surname: string, given: string) =>
      expectStatus(
        await staff.agent.post(`/api/admin/cases/${member.id}/documents`).field('stage', 'INITIAL').field('requirementId', passport.id).attach('file', await passportPdf(surname, given), { filename: `${given}.pdf`, ...PDF }),
        201,
      ).body.document.id as string;
    const wrong = await upload('MAMMADOV', 'ALI');
    const right = await upload('MAMMADOVA', 'LEYLA');
    await waitForUploadAi();
    const iw = await prisma.documentInsight.findUniqueOrThrow({ where: { documentId: wrong } });
    expect(iw.flags).toContain('NAME_MISMATCH');
    expect((iw.proposals as { holder: { expected: string } }).holder.expected).toBe('Leyla Məmmədova');
    expect((await prisma.documentInsight.findUniqueOrThrow({ where: { documentId: right } })).flags).not.toContain('NAME_MISMATCH');
  });

  it('drive upload into the client folder: the row chip carries the flag and both names', async () => {
    const client = await asClient({ firstName: 'Əli', lastName: 'Məmmədov' });
    const c = await createCaseVia(client.agent);
    const staff = await asStaff();
    const folderId = await folderOf(c.id);
    const up = expectStatus(await staff.agent.post(`/api/drive/nodes/${folderId}/files`).attach('file', await passportPdf('HUSEYNOV', 'RASHAD'), { filename: 'scan.pdf', ...PDF }), 201);
    await waitForUploadAi();
    const kids = expectStatus(await staff.agent.get(`/api/drive/nodes/${folderId}/children`), 200).body;
    const row = (kids.items ?? []).find((x: { id: string }) => x.id === up.body.item.id);
    expect(row.uploadAi.flags).toContain('NAME_MISMATCH');
    expect(row.uploadAi.holder).toMatchObject({ expected: 'Əli Məmmədov' });
  });
});

// ─── 2. AI findings → one task per client ──────────────────────────────

describe('2 · AI document findings become ONE task per client', () => {
  const msg = (s: string) => ({ az: `${s} az`, de: `${s} de`, en: `${s} en`, ru: `${s} ru` });
  const setup = async () => {
    const client = await asClient({ firstName: 'Elchin', lastName: 'Abdullayev' });
    const c = await createCaseVia(client.agent);
    const up = async (key: string, name: string) =>
      expectStatus(await client.agent.post(`/api/cases/${c.id}/documents`).field('requirementId', (await reqOf(c.id, key)).id).attach('file', await makePdf(name), { filename: name, ...PDF }), 201).body.document.id as string;
    const pass = await up('PASSPORT', 'pass.pdf');
    const dip = await up('DIPLOMA', 'diplom.pdf');
    const ev = (documentId: string | null, documentName: string) => ({ documentId, documentName, value: 'x' });
    const finding = (key: string, text: string, evidence: ReturnType<typeof ev>[]) => ({ key, source: 'rule', code: 'NAME_MISMATCH', severity: 'WARNING', field: 'name', message: msg(text), evidence });
    const run = await prisma.caseAiRun.create({
      data: {
        caseId: c.id,
        kind: 'CONSISTENCY',
        result: { findings: [finding('K1', 'Ad uyğun deyil', [ev(pass, 'pass.pdf')]), finding('K2', 'Diplom tərcüməsiz', [ev(dip, 'diplom.pdf')]), finding('K3', 'Doğum tarixi', [ev(null, 'Profil')])] },
      },
    });
    // The drive copies of the client uploads exist (they are linked to the task).
    await waitFor(async () => (await prisma.driveNode.count({ where: { documentId: { in: [pass, dip] } } })) === 2, 8000);
    return { client, c, run, pass, dip };
  };

  it('appends findings to the open task, links the documents, completes when all items are ticked', async () => {
    const { c, run } = await setup();
    const staff = await asStaff({ locale: 'az' });
    const old = await prisma.task.create({ data: { number: 9000, title: '[KI] old per-finding task', description: 'old', caseId: c.id } }); // created the old way: left alone

    const first = expectStatus(await staff.agent.post(`/api/admin/cases/${c.id}/ai/tasks`).send({ runId: run.id, target: 'finding', key: 'K1' }), 201).body;
    expect(first).toMatchObject({ created: true, added: 1, task: { title: 'Elchin Abdullayev — 1 sənəd problemi' } });
    const second = expectStatus(await staff.agent.post(`/api/admin/cases/${c.id}/ai/tasks`).send({ runId: run.id, target: 'finding', key: 'K2' }), 200).body;
    expect(second).toMatchObject({ created: false, added: 1, task: { id: first.task.id, title: 'Elchin Abdullayev — 2 sənəd problemi' } });
    // Same finding again: nothing new.
    expect(expectStatus(await staff.agent.post(`/api/admin/cases/${c.id}/ai/tasks`).send({ runId: run.id, target: 'finding', key: 'K1' }), 200).body).toMatchObject({ created: false, added: 0 });
    // "One task for all open findings": only K3 is new.
    expect(expectStatus(await staff.agent.post(`/api/admin/cases/${c.id}/ai/tasks`).send({ runId: run.id, target: 'allFindings' }), 200).body).toMatchObject({ added: 1 });

    const task = await prisma.task.findUniqueOrThrow({ where: { id: first.task.id }, include: { checklist: { orderBy: { sortOrder: 'asc' } }, attachments: true, assignees: true } });
    expect(task.title).toBe('Elchin Abdullayev — 3 sənəd problemi');
    expect(task.description!.startsWith(AI_DOC_TASK_MARKER)).toBe(true);
    expect(task.description).toContain('pass.pdf');
    expect(task.description).toContain('diplom.pdf');
    expect(task.checklist.map((i) => i.text)).toEqual(['pass.pdf: Ad uyğun deyil az', 'diplom.pdf: Diplom tərcüməsiz az', 'Doğum tarixi az']);
    expect(task.attachments).toHaveLength(2); // drive copies of both documents
    expect(await prisma.task.count({ where: { caseId: c.id } })).toBe(2); // the grouped task + the old one
    expect((await prisma.task.findUniqueOrThrow({ where: { id: old.id } })).description).toBe('old');
    expect(await prisma.auditLog.count({ where: { action: 'AI_CASE_TASK_UPDATED', target: c.id } })).toBe(3);

    // Ticking every item completes the task.
    const ref = `T-${String(task.number).padStart(4, '0')}`;
    for (const [i, item] of task.checklist.entries()) {
      const r = expectStatus(await staff.agent.patch(`/api/tasks/${ref}/checklist/${item.id}`).send({ done: true }), 200).body;
      expect(!!r.completed).toBe(i === task.checklist.length - 1);
    }
    expect(await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({ status: 'DONE' });
    expect(await prisma.taskComment.count({ where: { taskId: task.id, system: true, body: { contains: '"to":"DONE"' } } })).toBe(1);

    // A finding after that opens a new task.
    const next = expectStatus(await staff.agent.post(`/api/admin/cases/${c.id}/ai/tasks`).send({ runId: run.id, target: 'finding', key: 'K2' }), 201).body;
    expect(next.task.id).not.toBe(task.id);
  });

  it('a normal task with a checklist is never auto-completed', async () => {
    const staff = await asStaff();
    const created = expectStatus(await staff.agent.post('/api/tasks').send({ title: 'Manual', checklist: ['a'] }), 201).body.task;
    const r = expectStatus(await staff.agent.patch(`/api/tasks/${created.key ?? created.number}/checklist/${created.checklist[0].id}`).send({ done: true }), 200).body;
    expect(r.completed).toBeUndefined();
    expect((await prisma.task.findUniqueOrThrow({ where: { id: created.id } })).status).not.toBe('DONE');
  });
});

// ─── 3. Uploads → folder per document type + requirement ───────────────

describe('3 · client / application uploads land in type folders and on the requirement', () => {
  it('a portal upload is in "<client folder>/Reisepass" right away; rejected → bin, accepted → back', async () => {
    const client = await asClient({ firstName: 'Kamran', lastName: 'Aliyev' });
    const c = await createCaseVia(client.agent);
    const folderId = await folderOf(c.id);
    const doc = expectStatus(await client.agent.post(`/api/cases/${c.id}/documents`).field('requirementId', (await reqOf(c.id, 'PASSPORT')).id).attach('file', await makePdf('p'), { filename: 'passport.pdf', ...PDF }), 201).body.document;
    const copy = await waitFor(() => prisma.driveNode.findUnique({ where: { documentId: doc.id }, include: { parent: true } }), 8000);
    expect(copy.parent).toMatchObject({ name: 'Reisepass', parentId: folderId });
    expect(copy.workflowStage).toBe('INCOMING');

    const staff = await asStaff();
    expectStatus(await staff.agent.post(`/api/admin/cases/${c.id}/documents/${doc.id}/review`).send({ status: 'REJECTED', note: 'Unscharf' }), 200);
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: copy.id } })).deletedAt).not.toBeNull();
    expectStatus(await staff.agent.post(`/api/admin/cases/${c.id}/documents/${doc.id}/review`).send({ status: 'ACCEPTED' }), 200);
    await waitFor(async () => !(await prisma.driveNode.findUniqueOrThrow({ where: { id: copy.id } })).deletedAt, 8000);
    expect(await prisma.driveNode.count({ where: { documentId: doc.id } })).toBe(1);
  });

  it('vacancy application with documents before any case: kept, then attached when the case is created', async () => {
    const v = await createVacancy({ slug: 'lkw-docs' });
    const { agent, user } = await asCandidate();
    const res = expectStatus(
      await agent
        .post(`/api/vacancies/${v.slug}/apply`)
        .field('message', 'Hallo')
        .field('kinds', 'PASSPORT')
        .field('kinds', 'CV')
        .field('kinds', 'OTHER')
        .attach('files', await makePdf('pass'), { filename: 'pass.pdf', ...PDF })
        .attach('files', await makePdf('cv'), { filename: 'cv.pdf', ...PDF })
        .attach('files', await makePdf('misc'), { filename: 'zertifikat.pdf', ...PDF }),
      201,
    ).body;
    expect(res.documents.map((d: { kind: string }) => d.kind)).toEqual(['PASSPORT', 'CV', 'OTHER']);
    expect(res.attachedCaseId).toBeNull();
    expect(await prisma.vacancyApplication.count({ where: { userId: user.id, message: 'Hallo' } })).toBe(1);

    // Staff see them on the candidate before a case exists.
    const staff = await asStaff();
    const cand = expectStatus(await staff.agent.get(`/api/admin/candidates/${user.id}`), 200).body.candidate;
    expect(cand.applicationDocuments).toHaveLength(3);
    expect(cand.applicationDocuments.every((d: { attachedCaseId: string | null }) => d.attachedCaseId === null)).toBe(true);
    const file = await staff.agent.get(`/api/admin/candidates/${user.id}/application-documents/${cand.applicationDocuments[0].id}`);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toContain('application/pdf');

    // The client opens a case: passport + CV go onto their requirements and into the type folders.
    const c = await createCaseVia(agent);
    const docs = await waitFor(async () => {
      const rows = await prisma.document.findMany({ where: { caseId: c.id, vaultDocumentId: { not: null } }, include: { requirement: true } });
      return rows.length === 2 ? rows : null;
    }, 10_000);
    expect(docs.map((d) => d.requirement?.key).sort()).toEqual(['CV', 'PASSPORT']);
    expect(docs.every((d) => d.status === 'PENDING' && d.uploadedById === user.id)).toBe(true);
    await waitForApplicationUploads();
    const folderId = await folderOf(c.id);
    const parents = await Promise.all(docs.map(async (d) => (await prisma.driveNode.findUniqueOrThrow({ where: { documentId: d.id }, include: { parent: true } })).parent!));
    expect(parents.map((p) => p.name).sort()).toEqual(['Lebenslauf', 'Reisepass']);
    expect(parents.every((p) => p.parentId === folderId)).toBe(true);
    // The file without a requirement is a plain file in the client folder ("Sonstiges").
    const misc = await prisma.driveNode.findFirstOrThrow({ where: { name: 'zertifikat.pdf', deletedAt: null }, include: { parent: true } });
    expect(misc.parent).toMatchObject({ name: 'Sonstiges', parentId: folderId });
    expect(misc.documentId).toBeNull();
    // Shown in the admin case documents tab (requirements carry the documents).
    const adminCase = expectStatus(await staff.agent.get(`/api/admin/cases/${c.id}`), 200).body.case as { requirements: { key: string; documents: { id: string }[] }[] };
    expect(adminCase.requirements.find((r) => r.key === 'PASSPORT')!.documents).toHaveLength(1);
    // Marked as attached (never attached twice).
    const after = expectStatus(await staff.agent.get(`/api/admin/candidates/${user.id}`), 200).body.candidate;
    expect(after.applicationDocuments.every((d: { attachedCaseId: string | null }) => d.attachedCaseId === c.id)).toBe(true);
  });

  it('application while a case is open: attached right away', async () => {
    const v = await createVacancy({ slug: 'lkw-docs-2' });
    const { agent } = await asCandidate();
    const c = await createCaseVia(agent);
    const res = expectStatus(await agent.post(`/api/vacancies/${v.slug}/apply`).field('kinds', 'DIPLOMA').attach('files', await makePdf('d'), { filename: 'diplom.pdf', ...PDF }), 201).body;
    expect(res.attachedCaseId).toBe(c.id);
    const doc = await prisma.document.findFirstOrThrow({ where: { caseId: c.id, vaultDocumentId: { not: null } }, include: { requirement: true } });
    expect(doc.requirement?.key).toBe('DIPLOMA');
    const node = await waitFor(() => prisma.driveNode.findUnique({ where: { documentId: doc.id }, include: { parent: true } }), 8000);
    expect(['Diplom', 'Abschlüsse & Zeugnisse']).toContain(node.parent!.name);
    const detail = await clientCase(agent, c.id);
    expect(detail.requirements.some((r) => r.documents.some((d) => d.id === doc.id))).toBe(true);
  });

  it('a file whose content does not match its type is refused; nothing is created', async () => {
    const v = await createVacancy({ slug: 'lkw-docs-3' });
    const { agent, user } = await asCandidate();
    const res = await agent.post(`/api/vacancies/${v.slug}/apply`).field('kinds', 'PASSPORT').attach('files', Buffer.from('not a pdf at all'), { filename: 'pass.pdf', ...PDF });
    expect(res.status).toBe(400);
    expect(await prisma.vacancyApplication.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.vaultDocument.count({ where: { userId: user.id } })).toBe(0);
  });
});
