import { describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff, type Agent } from '../helpers/api';
import { binaryParser, makePdf, pageCount, PDF } from '../helpers/files';
import { clientCase, createCaseVia, driveCaseTo, expectStatus, sendContract, signContract } from '../helpers/workflow';

const download = (agent: Agent | ReturnType<typeof anon>, id: string, query = '') =>
  agent.get(`/api/files/${id}${query}`).buffer(true).parse(binaryParser);

const setupDoc = async () => {
  const client = await asClient();
  const c = await createCaseVia(client.agent);
  const req = (await clientCase(client.agent, c.id)).requirements[0];
  const bytes = await makePdf('Passport scan');
  const doc = (
    await client.agent
      .post(`/api/cases/${c.id}/documents`)
      .field('requirementId', req.id)
      .attach('file', bytes, { filename: 'pasport şəkli.pdf', ...PDF })
  ).body.document as { id: string };
  return { client, c, doc, bytes };
};

describe('GET /api/files/:id', () => {
  it('serves the owner the exact bytes inline with safe headers', async () => {
    const { client, doc, bytes } = await setupDoc();
    const res = await download(client.agent, doc.id);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain('sandbox');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['content-disposition']).toBe(`inline; filename*=UTF-8''${encodeURIComponent('pasport şəkli.pdf')}`);
    expect(Buffer.compare(res.body as Buffer, bytes)).toBe(0);
  });

  it('?download=1 sends it as an attachment', async () => {
    const { client, doc } = await setupDoc();
    const res = await download(client.agent, doc.id, '?download=1');
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename\*=UTF-8''pasport%20/);
  });

  it('staff and admins can read any case file', async () => {
    const { doc, bytes } = await setupDoc();
    for (const who of [await asStaff(), await asAdmin()]) {
      const res = await download(who.agent, doc.id);
      expect(res.status).toBe(200);
      expect(Buffer.compare(res.body as Buffer, bytes)).toBe(0);
    }
  });

  it('anonymous users get 401, other clients and unknown ids 404', async () => {
    const { doc } = await setupDoc();
    const anonymous = await anon().get(`/api/files/${doc.id}`);
    expect(anonymous.status).toBe(401);
    const other = await asClient();
    const res = await other.agent.get(`/api/files/${doc.id}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('DOCUMENT_NOT_FOUND');
    expect((await other.agent.get('/api/files/nope')).status).toBe(404);
  });

  it('a Bearer token (mobile) works too', async () => {
    const { client, doc } = await setupDoc();
    const res = await anon().get(`/api/files/${doc.id}`).set('Authorization', `Bearer ${client.token}`);
    expect(res.status).toBe(200);
  });
});

describe('signed contract PDF', () => {
  it('has exactly one more page than the original contract and is readable by owner and staff', async () => {
    const client = await asClient({ firstName: 'Əli', lastName: 'Məmmədov' });
    const admin = await asAdmin();
    const c = await driveCaseTo('DOCUMENTS_REVIEW', { client: client.agent, admin: admin.agent });
    // accept the initial documents, then send a 3-page contract
    const detail = await clientCase(client.agent, c.id);
    for (const r of detail.requirements) {
      for (const d of r.documents) {
        expectStatus(await admin.agent.post(`/api/admin/cases/${c.id}/documents/${d.id}/review`).send({ status: 'ACCEPTED' }), 200);
      }
    }
    expectStatus(await sendContract(admin.agent, c.id, 3), 201);
    expectStatus(await signContract(client.agent, c.id, 'Əli Məmmədov'), 200);

    const { contract } = await clientCase(client.agent, c.id);
    const original = await download(client.agent, contract!.file!.id);
    const signed = await download(client.agent, contract!.signedFile!.id);
    expect(original.status).toBe(200);
    expect(signed.status).toBe(200);
    expect(signed.headers['content-type']).toBe('application/pdf');
    expect(signed.headers['content-disposition']).toContain(encodeURIComponent(`${c.number}-contract-signed-v1.pdf`));
    expect(await pageCount(original.body as Buffer)).toBe(3);
    expect(await pageCount(signed.body as Buffer)).toBe(4);

    const staffView = await download(admin.agent, contract!.signedFile!.id, '?download=1');
    expect(staffView.status).toBe(200);
    expect(Buffer.compare(staffView.body as Buffer, signed.body as Buffer)).toBe(0);

    const stranger = await asClient();
    expect((await stranger.agent.get(`/api/files/${contract!.signedFile!.id}`)).status).toBe(404);
    expect((await anon().get(`/api/files/${contract!.signedFile!.id}`)).status).toBe(401);
  });
});
