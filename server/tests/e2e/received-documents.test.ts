import { describe, expect, it } from 'vitest';
import { asClient, asStaff, type Actor } from '../helpers/api';
import { prisma } from '../helpers/db';
import { uniq } from '../helpers/factories';

/** GET/POST /api/cases/:id/received-documents: what Triad Vision sent to the client, per case, with seen marks. */

const newCase = async (clientId: string) => prisma.case.create({ data: { number: uniq('TV-'), clientId, profession: 'Sürücü', status: 'CONTRACT_SIGNED', visaType: 'WORK' } });
const addDoc = (caseId: string, uploadedById: string, over: Record<string, unknown> = {}) =>
  prisma.document.create({
    data: { caseId, stage: 'OTHER', originalName: `${uniq('f')}.pdf`, storedName: uniq('s'), mimeType: 'application/pdf', size: 10, status: 'ACCEPTED', uploadedById, ...over },
  });

const setup = async () => {
  const client = await asClient();
  const staff = await asStaff();
  const c = await newCase(client.user.id);
  return { client, staff, c };
};
const get = (a: Actor, caseId: string) => a.agent.get(`/api/cases/${caseId}/received-documents`);

describe('received documents', () => {
  it('lists ready-docs sends, signed contract, appointment files and other staff files; never internal ones', async () => {
    const { client, staff, c } = await setup();
    const g1 = await addDoc(c.id, staff.user.id, { originalName: 'Arbeitsvertrag.pdf' });
    const g2 = await addDoc(c.id, staff.user.id, { originalName: 'Zeugnis.pdf' });
    await prisma.caseReadyDocsSend.create({
      data: {
        caseId: c.id,
        actorId: staff.user.id,
        fileCount: 2,
        newCount: 2,
        files: [
          { nodeId: 'n1', version: 1, documentId: g1.id, name: g1.originalName },
          { nodeId: 'n2', version: 1, documentId: g2.id, name: g2.originalName },
        ],
      },
    });
    const appt = await addDoc(c.id, staff.user.id, { originalName: 'Səfirlik görüşü — təsdiq.pdf' });
    const signed = await addDoc(c.id, client.user.id, { stage: 'CONTRACT_SIGNED', originalName: 'contract-signed.pdf' });
    // Not for the client: own upload for a requirement, own free upload, the team's embassy package, a staff file of a requirement.
    const req = await prisma.documentRequirement.create({ data: { caseId: c.id, stage: 'INITIAL', key: 'PASSPORT', title: { az: 'Pasport' }, sortOrder: 1 } });
    const mineReq = await addDoc(c.id, client.user.id, { stage: 'INITIAL', requirementId: req.id, status: 'PENDING' });
    const mineFree = await addDoc(c.id, client.user.id);
    const pkg = await addDoc(c.id, staff.user.id, { stage: 'EMBASSY', originalName: 'TV_Botschaft_1.pdf' });
    const staffReq = await addDoc(c.id, staff.user.id, { stage: 'INITIAL', requirementId: req.id });

    const res = await get(client, c.id);
    expect(res.status).toBe(200);
    const ids: string[] = res.body.groups.flatMap((g: { files: { id: string }[] }) => g.files.map((f) => f.id));
    expect([...ids].sort()).toEqual([g1.id, g2.id, appt.id, signed.id].sort());
    for (const hidden of [mineReq.id, mineFree.id, pkg.id, staffReq.id]) expect(ids).not.toContain(hidden);
    expect(res.body.groups.map((g: { kind: string }) => g.kind).sort()).toEqual(['APPOINTMENT', 'CONTRACT_SIGNED', 'READY_DOCS']);
    const send = res.body.groups.find((g: { kind: string }) => g.kind === 'READY_DOCS');
    expect(send.files).toHaveLength(2);
    expect(res.body.newCount).toBe(4);
  });

  it('is the own case only (404 for another client and for staff), unknown case 404', async () => {
    const { c, staff } = await setup();
    const other = await asClient();
    expect((await get(other, c.id)).status).toBe(404);
    expect((await other.agent.post(`/api/cases/${c.id}/received-documents/seen`).send({})).status).toBe(404);
    expect((await get(staff, c.id)).status).toBe(404);
    expect((await get(other, 'no-such-case')).status).toBe(404);
  });

  it('GET never writes; POST seen marks some / all documents per client', async () => {
    const { client, staff, c } = await setup();
    const a = await addDoc(c.id, staff.user.id);
    await addDoc(c.id, staff.user.id, { stage: 'VISA' });
    expect((await get(client, c.id)).body.newCount).toBe(2);
    expect((await get(client, c.id)).body.newCount).toBe(2);
    expect(await prisma.caseReceivedDocSeen.count({ where: { caseId: c.id } })).toBe(0);

    const one = await client.agent.post(`/api/cases/${c.id}/received-documents/seen`).send({ ids: [a.id, 'not-mine'] });
    expect(one.status).toBe(200);
    expect(one.body.newCount).toBe(1);
    expect(await prisma.caseReceivedDocSeen.count({ where: { caseId: c.id } })).toBe(1);

    const all = await client.agent.post(`/api/cases/${c.id}/received-documents/seen`).send({});
    expect(all.body.newCount).toBe(0);
    // A document that arrives later is new again.
    await addDoc(c.id, staff.user.id);
    expect((await get(client, c.id)).body.newCount).toBe(1);
  });
});
