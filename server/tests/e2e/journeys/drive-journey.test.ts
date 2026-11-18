import { describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff, type Agent } from '../../helpers/api';
import { prisma } from '../../helpers/db';
import { createUser, uniq } from '../../helpers/factories';
import { makePdf } from '../../helpers/files';
import { expectStatus } from '../../helpers/workflow';

/**
 * Journey 5 — the documents section (team drive) for two client folders, through the real HTTP API:
 *
 *   status chips on the client folders (workflow stage, assignee, partner, "sent" mark) → bulk "Schon geschrieben"
 *   to a colleague → the colleague works on one (In Bearbeitung) and finishes it (Fertig; the writer is told) →
 *   "İş axını" copy of the finished files to Fertig → "Müştəriyə göndər" → the client sees and opens the files →
 *   partner assigned / changed / removed from the folder without opening it, with the history.
 */

const roots = async (a: Agent) => expectStatus(await a.get('/api/drive/roots'), 200).body;
const mkdir = async (a: Agent, parentId: string, name: string) => expectStatus(await a.post(`/api/drive/nodes/${parentId}/folders`).send({ name }), 201).body.item as { id: string; name: string };
const upload = async (a: Agent, parentId: string, filename: string) =>
  expectStatus(await a.post(`/api/drive/nodes/${parentId}/files`).attach('file', await makePdf(filename), { filename, contentType: 'application/pdf' }), 201).body.item as { id: string; name: string };

interface Chip {
  id: string;
  caseId?: string;
  caseInfo?: { clientName: string; partner: { id: string; name: string } | null; processing?: { stage: string | null; assigneeId: string | null }; readySentAt?: string | null };
}
/** The client folder rows of a drive folder as the explorer lists them (chips without opening the folder). */
const chipsIn = async (a: Agent, parentId: string) => {
  const items = expectStatus(await a.get(`/api/drive/nodes/${parentId}/children`), 200).body.items as Chip[];
  return new Map(items.map((i) => [i.id, i]));
};

const processing = (a: Agent, cases: string[], stage: string, assigneeId?: string) =>
  a.post('/api/admin/client-folders/processing').send({ cases, stage, ...(assigneeId ? { assigneeId } : {}) });

describe('journey: client folders in the documents section', () => {
  it('chips → Schon geschrieben → Fertig → workflow copy → send to the client → partner on the folder', async () => {
    const leyla = await asStaff({ firstName: 'Leyla', lastName: 'Əliyeva' });
    const murad = await asStaff({ firstName: 'Murad', lastName: 'Quliyev' });
    const admin = await asAdmin();
    const client = await asClient({ firstName: 'Ali', lastName: 'Məmmədov', locale: 'az' });
    const second = await asClient({ firstName: 'Banu', lastName: 'Həsənova' });

    // Two cases with real client folders below "Anträge".
    const r = await roots(leyla.agent);
    const folderA = await mkdir(leyla.agent, r.cases.id, uniq('Ali Məmmədov · '));
    const folderB = await mkdir(leyla.agent, r.cases.id, uniq('Banu Həsənova · '));
    const caseA = await prisma.case.create({ data: { number: uniq('TV-'), clientId: client.user.id, profession: 'Sürücü', status: 'DOCUMENTS_REVIEW', visaType: 'WORK', driveFolderId: folderA.id } });
    const caseB = await prisma.case.create({ data: { number: uniq('TV-'), clientId: second.user.id, profession: 'Aşpaz', status: 'DOCUMENTS_REVIEW', visaType: 'WORK', driveFolderId: folderB.id } });

    // ── 1. Chips before anything happened: not in the workflow, no partner, nothing sent ────────────────────────
    let chips = await chipsIn(leyla.agent, r.cases.id);
    expect(chips.get(folderA.id)).toMatchObject({ caseId: caseA.id, caseInfo: { clientName: 'Ali Məmmədov', partner: null, processing: { stage: null, assigneeId: null }, readySentAt: null } });
    expect(chips.get(folderB.id)?.caseInfo?.processing).toEqual({ stage: null, assigneeId: null });

    // ── 2. Bulk "Schon geschrieben" for both, to Murad ──────────────────────────────────────────────────────────
    const written = expectStatus(await processing(leyla.agent, [caseA.id, caseB.id], 'WRITTEN', murad.user.id), 200).body;
    expect(written.summary).toEqual({ total: 2, succeeded: 2, skipped: 0, failed: 0 });
    chips = await chipsIn(leyla.agent, r.cases.id);
    for (const f of [folderA, folderB]) expect(chips.get(f.id)?.caseInfo?.processing).toEqual({ stage: 'WRITTEN', assigneeId: murad.user.id });
    expect(await prisma.notification.count({ where: { userId: murad.user.id, type: 'PROCESSING_STAGE' } })).toBe(2);
    expect(await prisma.notification.count({ where: { userId: leyla.user.id, type: 'PROCESSING_STAGE' } })).toBe(0);
    // Again without a change: skipped, nothing written.
    expect(expectStatus(await processing(leyla.agent, [caseA.id], 'WRITTEN', murad.user.id), 200).body.summary).toMatchObject({ succeeded: 0, skipped: 1 });
    // The client sees the stage only — never who works on it.
    const overview = expectStatus(await client.agent.get(`/api/doc-progress/cases/${caseA.id}`), 200).body.overview;
    expect(overview.processing).toMatchObject({ stage: 'WRITTEN', word: 'Schon geschrieben' });
    expect(JSON.stringify(overview)).not.toContain(murad.user.id);
    expect(JSON.stringify(overview)).not.toContain('Quliyev');

    // ── 3. Murad works on Ali's folder and finishes it; Fertig cannot jump back to Schon geschrieben ────────────
    // Straight from Schon geschrieben to Fertig is not a valid move.
    expect(expectStatus(await processing(murad.agent, [caseA.id], 'DONE'), 200).body.results[0]).toMatchObject({ ok: false, error: 'PROCESSING_TRANSITION_NOT_ALLOWED' });
    expectStatus(await processing(murad.agent, [caseA.id], 'IN_PROGRESS'), 200);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: caseA.id } })).processingStage).toBe('IN_PROGRESS');

    // The finished documents: client folder → "İş axını" Fertig.
    const sub = await mkdir(murad.agent, folderA.id, 'Hazır');
    const f1 = await upload(murad.agent, sub.id, 'Arbeitsvertrag.pdf');
    const f2 = await upload(murad.agent, folderA.id, 'Anschreiben.pdf');
    expectStatus(await murad.agent.post('/api/drive/workflow/copy').send({ ids: [f1.id, f2.id], stage: 'DONE' }), 200);

    // Not Fertig yet: nothing can be sent to the client.
    const tooEarly = expectStatus(await murad.agent.post('/api/admin/client-folders/ready-docs/send').send({ cases: [caseA.id] }), 200).body;
    expect(tooEarly.results[0]).toMatchObject({ ok: false, error: 'READY_DOCS_NOT_DONE' });

    const done = expectStatus(await processing(murad.agent, [caseA.id], 'DONE'), 200).body;
    expect(done.summary).toMatchObject({ succeeded: 1, failed: 0 });
    // Leyla wrote the documents (sent them to Schon geschrieben): she hears that they are finished.
    expect(await prisma.notification.count({ where: { userId: leyla.user.id, type: 'PROCESSING_STAGE' } })).toBe(1);
    expect(expectStatus(await processing(leyla.agent, [caseA.id], 'WRITTEN'), 200).body.results[0]).toMatchObject({ ok: false, error: 'PROCESSING_TRANSITION_NOT_ALLOWED' });
    expect(await prisma.caseProcessingMove.count({ where: { caseId: caseA.id } })).toBe(3); // WRITTEN, IN_PROGRESS, DONE
    chips = await chipsIn(leyla.agent, r.cases.id);
    expect(chips.get(folderA.id)?.caseInfo?.processing?.stage).toBe('DONE');
    expect(chips.get(folderB.id)?.caseInfo?.processing?.stage).toBe('WRITTEN');

    // ── 4. "Müştəriyə göndər": the Fertig files become client documents ──────────────────────────────────────────
    const view = expectStatus(await murad.agent.get(`/api/admin/client-folders/cases/${caseA.id}/ready-docs`), 200).body;
    expect(view).toMatchObject({ stage: 'DONE', newCount: 2, sends: [] });
    expect(view.files.map((f: { name: string; sent: boolean }) => [f.name, f.sent]).sort()).toEqual([[f1.name, false], [f2.name, false]].sort());
    const sent = expectStatus(await murad.agent.post('/api/admin/client-folders/ready-docs/send').send({ cases: [caseA.id] }), 200).body;
    expect(sent.summary).toEqual({ total: 1, succeeded: 1, skipped: 0, failed: 0 });
    const detail = expectStatus(await client.agent.get(`/api/cases/${caseA.id}`), 200).body.case;
    const names = detail.otherDocuments.map((d: { originalName: string }) => d.originalName).sort();
    expect(names).toEqual([f1.name, f2.name].sort());
    for (const d of detail.otherDocuments as { id: string }[]) expect((await client.agent.get(`/api/files/${d.id}`)).status).toBe(200);
    // Another client cannot open them.
    expect((await second.agent.get(`/api/files/${detail.otherDocuments[0].id}`)).status).not.toBe(200);
    const note = await prisma.notification.findFirstOrThrow({ where: { userId: client.user.id, type: 'READY_DOCS' } });
    expect(note).toMatchObject({ caseId: caseA.id, link: `/account/cases/${caseA.id}?tab=docs` });
    expect(await prisma.notification.count({ where: { userId: second.user.id, type: 'READY_DOCS' } })).toBe(0);
    chips = await chipsIn(leyla.agent, r.cases.id);
    expect(chips.get(folderA.id)?.caseInfo?.readySentAt).toBeTruthy();
    expect(chips.get(folderB.id)?.caseInfo?.readySentAt).toBeNull();
    // Sending again needs "resend"; nothing is duplicated.
    expect(expectStatus(await murad.agent.post('/api/admin/client-folders/ready-docs/send').send({ cases: [caseA.id] }), 200).body.results[0]).toMatchObject({ ok: false, error: 'READY_DOCS_ALREADY_SENT' });
    expect(await prisma.document.count({ where: { caseId: caseA.id, stage: 'OTHER' } })).toBe(2);

    // ── 5. Partner on Banu's folder without opening it: assign → change → remove, with the history ──────────────
    const p1 = expectStatus(await admin.agent.post('/api/admin/partners').send({ name: uniq('Rəşad '), commissionCents: 10000 }), 201).body.partner as { id: string; name: string };
    const p2 = expectStatus(await admin.agent.post('/api/admin/partners').send({ name: uniq('Elvin '), commissionCents: 10000 }), 201).body.partner as { id: string; name: string };
    const p1Login = await createUser({ role: 'AGENT', firstName: 'Rəşad', lastName: 'Partner' });
    await prisma.referralPartner.update({ where: { id: p1.id }, data: { userId: p1Login.user.id } });
    const setPartner = (partnerId: string | null, note?: string) => leyla.agent.post('/api/admin/client-folders/partner').send({ cases: [caseB.id], partnerId, ...(note ? { note } : {}) });

    expect(expectStatus(await setPartner(p1.id), 200).body.summary).toEqual({ total: 1, succeeded: 1, skipped: 0, failed: 0 });
    expect((await prisma.case.findUniqueOrThrow({ where: { id: caseB.id } })).partnerId).toBe(p1.id);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: second.user.id } })).ownerPartnerId).toBe(p1.id);
    expect(await prisma.notification.count({ where: { userId: p1Login.user.id, type: 'PARTNER_NEW_CASE', link: `/partner/clients/${caseB.id}` } })).toBe(1);
    // The folder now lives in the partner's folder below "Partner"; the chip names the partner there.
    const moved = await prisma.driveNode.findUniqueOrThrow({ where: { id: folderB.id } });
    const partnerFolder = await prisma.driveNode.findUniqueOrThrow({ where: { id: moved.parentId! } });
    expect(partnerFolder.parentId).toBe((await roots(leyla.agent)).partners.id);
    expect((await chipsIn(leyla.agent, partnerFolder.id)).get(folderB.id)?.caseInfo?.partner).toEqual({ id: p1.id, name: p1.name });
    // Ali's folder is not touched.
    expect((await prisma.case.findUniqueOrThrow({ where: { id: caseA.id } })).partnerId).toBeNull();

    expectStatus(await setPartner(p2.id, 'Müştəri özü dəyişdi'), 200);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: caseB.id } })).partnerId).toBe(p2.id);
    expectStatus(await setPartner(null), 200);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: caseB.id } })).partnerId).toBeNull();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: second.user.id } })).ownerPartnerId).toBeNull();

    const history = await prisma.partnerClientChange.findMany({ where: { userId: second.user.id }, orderBy: { createdAt: 'asc' } });
    expect(history.map((h) => [h.fromPartnerId, h.toPartnerId, h.source])).toEqual([
      [null, p1.id, 'ADMIN'],
      [p1.id, p2.id, 'ADMIN'],
      [p2.id, null, 'ADMIN'],
    ]);
    expect(history[1].note).toBe('Müştəri özü dəyişdi');
    expect(expectStatus(await leyla.agent.get(`/api/admin/partners/clients/${second.user.id}/owner`), 200).body.history).toHaveLength(3);
    expect(await prisma.caseEvent.count({ where: { caseId: caseB.id, type: 'PARTNER_CHANGED' } })).toBe(3);
    expect(await prisma.auditLog.count({ where: { target: `case:${caseB.id}`, action: 'CASE_PARTNER_SET' } })).toBe(2);
    expect(await prisma.auditLog.count({ where: { target: `case:${caseB.id}`, action: 'CASE_PARTNER_REMOVED' } })).toBe(1);
    // The workflow stage of the folder survived the partner changes.
    expect((await prisma.case.findUniqueOrThrow({ where: { id: caseB.id } })).processingStage).toBe('WRITTEN');
  }, 120_000);
});
