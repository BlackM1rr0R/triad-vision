import { describe, expect, it } from 'vitest';
import { asClient, asStaff, asSuperAdmin } from '../helpers/api';
import { prisma } from '../helpers/db';
import { binaryParser } from '../helpers/files';
import { createCaseVia, expectStatus } from '../helpers/workflow';

/** Prefilled document templates (lib/docTemplates): client cabinet (own case, read-only) + staff (scope, audit, attach). */

type Item = { kind: string; available: boolean; missing: string[]; source?: string };

describe('doc templates: client cabinet', () => {
  it('own case only: status + the three PDFs; another client gets 404, staff 403', async () => {
    const client = await asClient({ firstName: 'Aysel', lastName: 'Məmmədova' });
    await prisma.user.update({ where: { id: client.user.id }, data: { profession: 'Berufskraftfahrer', experienceYears: 6, germanLevel: 'B1' } });
    const c = await createCaseVia(client.agent);
    const status = expectStatus(await client.agent.get(`/api/account/doc-templates/cases/${c.id}`), 200).body.items as Item[];
    expect(status.map((i) => i.kind)).toEqual(['videx', 'lebenslauf', 'anschreiben']);
    expect(status.every((i) => i.available)).toBe(true);
    expect(status.find((i) => i.kind === 'lebenslauf')?.source).toBe('profile'); // CV builder never used
    expect(status.find((i) => i.kind === 'videx')?.missing.length).toBeGreaterThan(0);
    // No employer revealed yet: the company is not counted as missing in the Anschreiben.
    expect(status.find((i) => i.kind === 'anschreiben')?.missing).not.toContain('firma');

    for (const kind of ['videx', 'lebenslauf', 'anschreiben']) {
      const res = await client.agent.get(`/api/account/doc-templates/cases/${c.id}/${kind}.pdf?lang=de`).buffer(true).parse(binaryParser);
      expect(res.status, kind).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    }
    expect((await client.agent.get(`/api/account/doc-templates/cases/${c.id}/other.pdf`)).status).toBe(400);

    const stranger = await asClient();
    expect((await stranger.agent.get(`/api/account/doc-templates/cases/${c.id}`)).status).toBe(404);
    expect((await stranger.agent.get(`/api/account/doc-templates/cases/${c.id}/videx.pdf`)).status).toBe(404);
    const staff = await asStaff();
    expect((await staff.agent.get(`/api/account/doc-templates/cases/${c.id}`)).status).toBe(403);
    // Generating stores nothing.
    expect(await prisma.driveNode.count({ where: { name: { contains: 'VIDEX-hazirliq' } } })).toBe(0);
  });
});

describe('doc templates: staff', () => {
  it('status + PDF (audited); client role refused; ASSIGNED scope keeps other cases out', async () => {
    const client = await asClient();
    const c = await createCaseVia(client.agent);
    const staff = await asStaff();
    const items = expectStatus(await staff.agent.get(`/api/admin/cases/${c.id}/doc-templates`), 200).body.items as Item[];
    expect(items.map((i) => i.kind)).toEqual(['videx', 'lebenslauf', 'anschreiben']);
    const pdf = await staff.agent.get(`/api/admin/cases/${c.id}/doc-templates/videx.pdf?lang=az`).buffer(true).parse(binaryParser);
    expect(pdf.status).toBe(200);
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    expect(await prisma.auditLog.count({ where: { action: 'DOC_TEMPLATE_GENERATED', target: `case:${c.id}`, actorId: staff.user.id } })).toBe(1);

    expect((await client.agent.get(`/api/admin/cases/${c.id}/doc-templates`)).status).toBe(403);

    const sup = await asSuperAdmin();
    expectStatus(await sup.agent.put(`/api/admin/access/scope/users/${staff.user.id}`).send({ caseScope: 'ASSIGNED' }), 200);
    const denied = await staff.agent.get(`/api/admin/cases/${c.id}/doc-templates`);
    expect(denied.status).toBe(403);
    expect(denied.body.error).toBe('OUT_OF_SCOPE');
  });

  it('attach puts a copy into the client folder (or says there is none) and is audited', async () => {
    const client = await asClient();
    const c = await createCaseVia(client.agent);
    const staff = await asStaff();
    const res = await staff.agent.post(`/api/admin/cases/${c.id}/doc-templates/lebenslauf/attach`).send({});
    if (res.status === 409) {
      expect(res.body.error).toBe('NO_DRIVE_FOLDER');
      return;
    }
    expect(res.status).toBe(201);
    const node = await prisma.driveNode.findUniqueOrThrow({ where: { id: res.body.nodeId } });
    expect(node.mimeType).toBe('application/pdf');
    expect(await prisma.auditLog.count({ where: { action: 'DOC_TEMPLATE_ATTACHED', target: `case:${c.id}` } })).toBe(1);
  });
});
