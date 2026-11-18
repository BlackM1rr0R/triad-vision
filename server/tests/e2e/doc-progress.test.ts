import { describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createCaseVia, driveCaseTo, expectStatus, uploadDoc, clientCase } from '../helpers/workflow';

interface Overview {
  caseId: string;
  status: string;
  percent: number | null;
  steps: { key: string; state: string }[];
  documents: { stage: string; preview: boolean; uploadOpen: boolean; counts: Record<string, number>; items: { id: string | null; status: string; uploadable: boolean }[] }[];
  processing: null | { stage: string; word: string; label: Record<string, string>; explanation: Record<string, string>; at: string | null; [k: string]: unknown };
  embassyCollection: null | { uploadOpen: boolean; preview: boolean; items: unknown[] };
}

const overviewOf = async (agent: Awaited<ReturnType<typeof asClient>>['agent'], id: string) =>
  expectStatus(await agent.get(`/api/doc-progress/cases/${id}`), 200).body.overview as Overview;

describe('GET /api/doc-progress/cases/:id', () => {
  it('returns the own case overview; other clients, staff and anonymous get nothing', async () => {
    const client = await asClient();
    const c = await createCaseVia(client.agent);
    const detail = await clientCase(client.agent, c.id);
    const first = detail.requirements.find((r) => r.stage === 'INITIAL')!;
    expectStatus(await uploadDoc(client.agent, c.id, first.id), 201);

    const o = await overviewOf(client.agent, c.id);
    expect(o.caseId).toBe(c.id);
    expect(o.status).toBe('DOCUMENTS_PENDING');
    expect(o.steps.map((s) => s.key)).toEqual(['documents', 'contract', 'embassyDocs', 'appointment', 'decision', 'result']);
    expect(o.steps[0].state).toBe('current');
    const initial = o.documents.find((d) => d.stage === 'INITIAL')!;
    expect(initial.uploadOpen).toBe(true);
    expect(initial.counts.pending).toBe(1);
    expect(initial.counts.total).toBe(detail.requirements.filter((r) => r.stage === 'INITIAL').length);
    // The embassy list is a preview (no rows yet), never uploadable.
    const embassy = o.documents.find((d) => d.stage === 'EMBASSY');
    expect(embassy?.preview).toBe(true);
    expect(embassy?.items.every((i) => i.id === null && !i.uploadable)).toBe(true);
    expect(o.percent).toBeGreaterThan(0);
    expect(o.processing).toBeNull();

    // Another client: 404 (never reveals the case); anonymous: 401.
    const other = await asClient();
    expect((await other.agent.get(`/api/doc-progress/cases/${c.id}`)).status).toBe(404);
    expect((await other.agent.get('/api/doc-progress/cases/does-not-exist')).status).toBe(404);
    expect((await anon().get(`/api/doc-progress/cases/${c.id}`)).status).toBe(401);
  });

  it('shows the team stage as information only, and the embassy collection while waiting for the contract', async () => {
    const client = await asClient();
    const admin = await asAdmin({ lastName: 'Qwxstaffsurname' });
    const c = await driveCaseTo('CONTRACT_SENT', { client: client.agent, admin: admin.agent });

    // Team marks the documents "Schon geschrieben" with a note and an assignee: the client sees the stage only.
    const staffNote = 'internal: check the diploma stamp';
    expectStatus(await admin.agent.post(`/api/admin/cases/${c.id}/processing`).send({ stage: 'WRITTEN', assigneeId: admin.user.id, note: staffNote }), 200);
    const o = await overviewOf(client.agent, c.id);
    expect(o.processing).toMatchObject({ stage: 'WRITTEN', word: 'Schon geschrieben', label: { az: 'Schon geschrieben — artıq yazılıb' } });
    const raw = JSON.stringify(o);
    expect(raw).not.toContain(staffNote);
    expect(raw).not.toContain(admin.user.id);
    expect(raw).not.toContain(admin.user.lastName);

    // Waiting for the contract: the case already has its embassy rows and the client may upload them early (lib/earlyEmbassy).
    expect(o.embassyCollection).toMatchObject({ uploadOpen: true, preview: false });
    expect(o.embassyCollection!.items.length).toBeGreaterThan(0);

    // Visa refused by the team ("Ablehnung") is visible as such.
    await prisma.case.update({ where: { id: c.id }, data: { processingStage: 'REFUSED' } });
    expect((await overviewOf(client.agent, c.id)).processing).toMatchObject({ stage: 'REFUSED', word: 'Ablehnung' });
  });
});
