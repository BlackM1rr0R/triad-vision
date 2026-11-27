import { describe, expect, it } from 'vitest';
import { asAdmin, asClient } from '../helpers/api';
import { prisma } from '../helpers/db';
import { makePdf, PDF, PNG_BUFFER } from '../helpers/files';
import { act, adminCase, clientCase, driveCaseTo, expectStatus, reviewAll } from '../helpers/workflow';
import { APPOINTMENT_DOC_TITLE } from '../../src/lib/caseAppointment/files';

/**
 * Embassy appointment confirmation files. POST /api/admin/cases/:id/actions stays JSON; with files it is multipart
 * (field `files`, up to 5; the other fields are the same as in the JSON body; `removeDocumentIds` = JSON array).
 */

const toEmbassyReview = async (client: Awaited<ReturnType<typeof asClient>>, admin: Awaited<ReturnType<typeof asAdmin>>) => {
  const c = await driveCaseTo('EMBASSY_REVIEW', { client: client.agent, admin: admin.agent });
  await reviewAll(admin.agent, c.id, 'EMBASSY');
  return c;
};

const record = async (admin: Awaited<ReturnType<typeof asAdmin>>, caseId: string, fields: Record<string, string>, files: { name: string; buf: Buffer; type: string }[]) => {
  let req = admin.agent.post(`/api/admin/cases/${caseId}/actions`).field('action', 'SCHEDULE_APPOINTMENT');
  for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
  for (const f of files) req = req.attach('files', f.buf, { filename: f.name, contentType: f.type });
  return req;
};

describe('embassy appointment files', () => {
  it('records with a file: client document + Drive "Termin" copy, hidden from other clients; notice mentions the file', async () => {
    const client = await asClient({ firstName: 'Əli', lastName: 'Məmmədov' });
    const other = await asClient();
    const admin = await asAdmin();
    const c = await toEmbassyReview(client, admin);

    const pdf = await makePdf('Termin');
    const res = expectStatus(await record(admin, c.id, { at: '2026-12-11T09:00:00+04:00', place: 'Almaniya Səfirliyi, Bakı', note: 'Originallarla gəlin' }, [{ name: 'confirmation.pdf', buf: pdf, type: PDF.contentType }]), 200);
    expect(res.body.case.status).toBe('APPOINTMENT_SCHEDULED');

    const docs = await prisma.document.findMany({ where: { caseId: c.id, stage: 'OTHER' } });
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ originalName: `${APPOINTMENT_DOC_TITLE}.pdf`, status: 'ACCEPTED', mimeType: 'application/pdf' });

    // The client sees it in the cabinet and can open it.
    const seen = ((await clientCase(client.agent, c.id)).otherDocuments as { id: string }[]).map((d) => d.id);
    expect(seen).toContain(docs[0].id);
    expect((await client.agent.get(`/api/files/${docs[0].id}`)).status).toBe(200);
    // Another client cannot.
    expect((await other.agent.get(`/api/files/${docs[0].id}`)).status).not.toBe(200);

    // Drive: copy in "<client folder>/Termin".
    const node = await prisma.driveNode.findUniqueOrThrow({ where: { documentId: docs[0].id }, include: { parent: true } });
    expect(node.parent?.name).toBe('Termin');
    const folder = (await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).driveFolderId;
    expect(node.parent?.parentId).toBe(folder);
    expect(node.deletedAt).toBeNull();

    // The notice mentions the file.
    const n = await prisma.notification.findFirstOrThrow({ where: { userId: client.user.id, type: 'APPOINTMENT_SCHEDULED' }, orderBy: { createdAt: 'desc' } });
    expect(n.body).toContain('Sənədlər');
    expect(n.link).toBe(`/account/cases/${c.id}?tab=docs#received`);
  });

  it('JSON body without files still works (backward compatible)', async () => {
    const client = await asClient();
    const admin = await asAdmin();
    const c = await toEmbassyReview(client, admin);
    expectStatus(await act(admin.agent, c.id, { action: 'SCHEDULE_APPOINTMENT', at: '2026-12-11T09:00:00+04:00', place: 'Embassy Baku' }), 200);
    expect(await prisma.document.count({ where: { caseId: c.id, stage: 'OTHER' } })).toBe(0);
  });

  it('edit: reschedule, add a second file and remove the first (document gone, Drive copy in the bin), client told "updated"', async () => {
    const client = await asClient({ firstName: 'Nigar' });
    const admin = await asAdmin();
    const c = await toEmbassyReview(client, admin);
    const pdf = await makePdf('Termin');
    expectStatus(await record(admin, c.id, { at: '2026-12-11T09:00:00+04:00', place: 'Embassy Baku' }, [{ name: 'a.pdf', buf: pdf, type: PDF.contentType }]), 200);
    const first = await prisma.document.findFirstOrThrow({ where: { caseId: c.id, stage: 'OTHER' } });

    // A removal of anything but an appointment file is refused (the requirement documents stay).
    const reqDoc = (await adminCase(admin.agent, c.id)).requirements.flatMap((r) => r.documents)[0];
    const bad = await act(admin.agent, c.id, { action: 'SCHEDULE_APPOINTMENT', at: '2026-12-12T10:00:00+04:00', place: 'Embassy Baku', removeDocumentIds: [reqDoc.id] });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('INVALID_APPOINTMENT_FILE');

    const res = expectStatus(
      await record(admin, c.id, { at: '2026-12-12T10:00:00+04:00', place: 'Embassy Baku, 2nd floor', removeDocumentIds: JSON.stringify([first.id]) }, [{ name: 'b.png', buf: PNG_BUFFER, type: 'image/png' }]),
      200,
    );
    expect(res.body.case.appointmentPlace).toBe('Embassy Baku, 2nd floor');
    expect(res.body.case.events.some((e: { type: string }) => e.type === 'APPOINTMENT_RESCHEDULED')).toBe(true);

    expect(await prisma.document.findUnique({ where: { id: first.id } })).toBeNull();
    const left = await prisma.document.findMany({ where: { caseId: c.id, stage: 'OTHER' } });
    expect(left).toHaveLength(1);
    expect(left[0].originalName).toBe(`${APPOINTMENT_DOC_TITLE}.png`);
    expect((await prisma.driveNode.findFirstOrThrow({ where: { documentId: first.id } })).deletedAt).not.toBeNull();
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { documentId: left[0].id } })).deletedAt).toBeNull();

    const n = await prisma.notification.findFirstOrThrow({ where: { userId: client.user.id, type: 'APPOINTMENT_UPDATED' } });
    expect(n.title).toBe('Görüş məlumatlarınız yeniləndi');
    expect(n.body).toContain('Embassy Baku, 2nd floor');

    // Removal alone (JSON body) works too.
    expectStatus(await act(admin.agent, c.id, { action: 'SCHEDULE_APPOINTMENT', at: '2026-12-12T10:00:00+04:00', place: 'Embassy Baku, 2nd floor', removeDocumentIds: [left[0].id] }), 200);
    expect(await prisma.document.count({ where: { caseId: c.id, stage: 'OTHER' } })).toBe(0);
  });

  it('refuses unsupported files and more than five; files only belong to the appointment action', async () => {
    const client = await asClient();
    const admin = await asAdmin();
    const c = await toEmbassyReview(client, admin);
    const txt = await record(admin, c.id, { at: '2026-12-11T09:00:00+04:00', place: 'Embassy Baku' }, [{ name: 'x.exe', buf: Buffer.from('MZ'), type: 'application/x-msdownload' }]);
    expect(txt.status).toBe(400);
    const pdf = await makePdf('T');
    const six = await record(admin, c.id, { at: '2026-12-11T09:00:00+04:00', place: 'Embassy Baku' }, Array.from({ length: 6 }, (_, i) => ({ name: `f${i}.pdf`, buf: pdf, type: PDF.contentType })));
    expect(six.status).toBeGreaterThanOrEqual(400);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('EMBASSY_REVIEW');
    expect(await prisma.document.count({ where: { caseId: c.id, stage: 'OTHER' } })).toBe(0);

    const other = await admin.agent.post(`/api/admin/cases/${c.id}/actions`).field('action', 'CANCEL').field('reason', 'test').attach('files', pdf, { filename: 'a.pdf', contentType: PDF.contentType });
    expect(other.status).toBe(400);
    expect(other.body.error).toBe('FILES_NOT_ALLOWED');
  });

  it('a client cannot record or edit the appointment', async () => {
    const client = await asClient();
    const admin = await asAdmin();
    const c = await toEmbassyReview(client, admin);
    const pdf = await makePdf('T');
    const res = await client.agent
      .post(`/api/admin/cases/${c.id}/actions`)
      .field('action', 'SCHEDULE_APPOINTMENT')
      .field('at', '2026-12-11T09:00:00+04:00')
      .field('place', 'Embassy Baku')
      .attach('files', pdf, { filename: 'a.pdf', contentType: PDF.contentType });
    expect(res.status).toBe(403);
    expect((await client.agent.post(`/api/admin/cases/${c.id}/actions`).send({ action: 'SCHEDULE_APPOINTMENT', at: '2026-12-11T09:00:00+04:00', place: 'Embassy Baku' })).status).toBe(403);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('EMBASSY_REVIEW');
  });
});
