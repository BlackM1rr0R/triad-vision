import { describe, expect, it } from 'vitest';
import { asAdmin, asClient } from '../helpers/api';
import { prisma } from '../helpers/db';
import { staffNotifications } from '../helpers/notify';
import { act, adminCase, clientCase, createCaseVia, expectStatus, reviewAll, sendContract, signContract, uploadDoc, uploadRequired } from '../helpers/workflow';
import { requirementsFor } from '../../src/lib/docsIntel/requirementTemplates.js';

/**
 * Early embassy documents (lib/earlyEmbassy): while the client waits for the work contract the case already has its
 * EMBASSY requirement rows (created once) and the client may upload them; staff review as usual; the embassy step
 * later adds no second set.
 */

const embassyCount = (caseId: string) => prisma.documentRequirement.count({ where: { caseId, stage: 'EMBASSY' } });

describe('early embassy documents', () => {
  it('creates the embassy rows once when the client waits for the contract, allows uploads there and keeps them later', async () => {
    const client = await asClient();
    const admin = await asAdmin();
    const c = await createCaseVia(client.agent);
    const expected = (await requirementsFor(prisma, 'EMBASSY', null)).length;

    // Initial documents handed in, not yet accepted: not waiting for the contract → no embassy rows.
    await uploadRequired(client.agent, c.id, 'INITIAL');
    expectStatus(await client.agent.post(`/api/cases/${c.id}/submit`), 200);
    await clientCase(client.agent, c.id); // lazy check on the case page creates nothing here
    expect(await embassyCount(c.id)).toBe(0);

    // Every required initial document accepted (DOCUMENTS_REVIEW): the embassy list is created right away.
    await reviewAll(admin.agent, c.id, 'INITIAL');
    expect(await embassyCount(c.id)).toBe(expected);

    // The client can upload an embassy document already now.
    let detail = await clientCase(client.agent, c.id);
    const embassy = detail.requirements.filter((r) => r.stage === 'EMBASSY' && r.required);
    const early = expectStatus(await uploadDoc(client.agent, c.id, embassy[0].id, 'krankenversicherung.pdf'), 201);
    expect(early.body.document).toMatchObject({ stage: 'EMBASSY', status: 'PENDING' });
    expect((await staffNotifications(admin.user.id)).some((n) => n.title === `${c.number}: səfirlik sənədi erkən yükləndi`)).toBe(true);

    // Contract sent: still the same rows (idempotent), uploads stay open, hand-in of the embassy documents does not.
    expectStatus(await sendContract(admin.agent, c.id), 201);
    expect(await embassyCount(c.id)).toBe(expected);
    const second = expectStatus(await uploadDoc(client.agent, c.id, embassy[1].id, 'foto.pdf'), 201);
    expect((await client.agent.post(`/api/cases/${c.id}/submit`)).status).toBe(409);
    // The client may remove an own pending early upload again.
    expectStatus(await client.agent.delete(`/api/cases/${c.id}/documents/${second.body.document.id}`), 200);

    // Staff review the early upload as usual.
    expectStatus(await admin.agent.post(`/api/admin/cases/${c.id}/documents/${early.body.document.id}/review`).send({ status: 'ACCEPTED' }), 200);

    // The overview shows real, uploadable rows (no preview).
    const overview = expectStatus(await client.agent.get(`/api/doc-progress/cases/${c.id}`), 200).body.overview;
    expect(overview.embassyCollection).toMatchObject({ uploadOpen: true, preview: false });
    expect(overview.embassyCollection.items).toHaveLength(expected);

    // Signed and confirmed: EMBASSY_DOCUMENTS gets no second set; the accepted early document stays.
    expectStatus(await signContract(client.agent, c.id), 200);
    const confirmed = expectStatus(await act(admin.agent, c.id, { action: 'CONFIRM_CONTRACT' }), 200);
    expect(confirmed.body.case.status).toBe('EMBASSY_DOCUMENTS');
    expect(await embassyCount(c.id)).toBe(expected);
    detail = await adminCase(admin.agent, c.id);
    expect(detail.requirements.find((r) => r.id === embassy[0].id)!.documents.map((d) => d.status)).toEqual(['ACCEPTED']);
  });

  it('refuses embassy uploads before the waiting state and creates missing rows lazily for older waiting cases', async () => {
    const client = await asClient();
    const admin = await asAdmin();
    const c = await createCaseVia(client.agent);

    // A (hand-made) embassy row while the initial documents are still open: no upload.
    const row = await prisma.documentRequirement.create({ data: { caseId: c.id, stage: 'EMBASSY', key: 'VIDEX', title: { az: 'V', de: 'V', en: 'V', ru: 'V' }, required: true } });
    expect((await uploadDoc(client.agent, c.id, row.id)).status).toBe(400); // DOCUMENTS_PENDING: only INITIAL is open
    await uploadRequired(client.agent, c.id, 'INITIAL');
    expectStatus(await client.agent.post(`/api/cases/${c.id}/submit`), 200);
    const refused = await uploadDoc(client.agent, c.id, row.id);
    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe('UPLOAD_NOT_ALLOWED');

    // An older case already in CONTRACT_SENT without embassy rows: opening the case creates them once.
    await reviewAll(admin.agent, c.id, 'INITIAL');
    expectStatus(await sendContract(admin.agent, c.id), 201);
    await prisma.documentRequirement.deleteMany({ where: { caseId: c.id, stage: 'EMBASSY' } });
    const expected = (await requirementsFor(prisma, 'EMBASSY', null)).length;
    await Promise.all([clientCase(client.agent, c.id), clientCase(client.agent, c.id), client.agent.get(`/api/doc-progress/cases/${c.id}`)]);
    expect(await embassyCount(c.id)).toBe(expected);
    await clientCase(client.agent, c.id);
    expect(await embassyCount(c.id)).toBe(expected);
  });
});
