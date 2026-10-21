import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff, type Agent } from '../helpers/api';
import { emailsTo, prisma } from '../helpers/db';
import { binaryParser, SIGNATURE_DATA_URL } from '../helpers/files';
import { createCaseVia, expectStatus } from '../helpers/workflow';
import { registeredJobs } from '../../src/lib/scheduler.js';
import { runOriginalsOverdue } from '../../src/lib/originals/overdue.js';
import { trackingUrl } from '../../src/lib/originals/constants.js';
import '../../src/jobs/originals.js';

const DAY = 24 * 60 * 60 * 1000;
const pdfOf = async (req: ReturnType<Agent['get']>) => (await req.buffer(true).parse(binaryParser)) as unknown as { status: number; body: Buffer; headers: Record<string, string> };

/** Image XObjects in a PDF. */
const imageCount = async (buf: Buffer) => {
  const doc = await PDFDocument.load(buf);
  let n = 0;
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream && obj.dict.get(PDFName.of('Subtype')) === PDFName.of('Image')) n++;
  }
  return n;
};

const setup = async () => {
  const client = await asClient({ firstName: 'Əli', lastName: 'Məmmədov' });
  const staff = await asStaff();
  const c = await createCaseVia(client.agent);
  return { client, staff, c };
};

const add = async (a: Agent, caseId: string, body: Record<string, unknown> = {}) =>
  expectStatus(await a.post(`/api/originals/cases/${caseId}`).send({ title: 'Pasport C0123', kind: 'PASSPORT', location: 'Seyf A', ...body }), 201).body.original;

const move = (a: Agent, id: string, body: Record<string, unknown>) => a.post(`/api/originals/${id}/events`).send(body);

describe('originals register', () => {
  it('CRUD and the event state machine (invalid transitions 409)', async () => {
    const { staff, c } = await setup();
    const o = await add(staff.agent, c.id);
    expect(o.status).toBe('IN_OFFICE');
    expect(o.events).toHaveLength(1);
    expect(o.events[0].action).toBe('RECEIVED');

    const patched = expectStatus(await staff.agent.patch(`/api/originals/${o.id}`).send({ title: 'Pasport (əsas)', note: 'Köhnə' }), 200).body.original;
    expect(patched.title).toBe('Pasport (əsas)');

    // STORED needs a location; GIVEN_OUT needs a holder.
    expect((await move(staff.agent, o.id, { action: 'STORED' })).status).toBe(400);
    expectStatus(await move(staff.agent, o.id, { action: 'STORED', location: 'Seyf B · rəf 2' }), 200);
    expect((await move(staff.agent, o.id, { action: 'DELIVERED' })).status).toBe(409);
    expect((await move(staff.agent, o.id, { action: 'APOSTILLE_BACK' })).status).toBe(409);

    let r = expectStatus(await move(staff.agent, o.id, { action: 'SENT_TO_APOSTILLE', holder: 'ASAN Xidmət' }), 200).body;
    expect(r.original.status).toBe('AT_APOSTILLE');
    r = expectStatus(await move(staff.agent, o.id, { action: 'APOSTILLE_BACK' }), 200).body;
    expect(r.original.status).toBe('IN_OFFICE');
    expect((await move(staff.agent, o.id, { action: 'SENT_BY_COURIER' })).status).toBe(400);
    r = expectStatus(await move(staff.agent, o.id, { action: 'SENT_BY_COURIER', carrier: 'DHL', trackingNo: '1234567890' }), 200).body;
    expect(r.original.status).toBe('IN_TRANSIT');
    expect(r.original.trackingUrl).toContain('dhl.com');
    expect(r.original.trackingUrl).toContain('1234567890');
    r = expectStatus(await move(staff.agent, o.id, { action: 'DELIVERED' }), 200).body;
    expect(r.original.status).toBe('DELIVERED');
    expect((await move(staff.agent, o.id, { action: 'GIVEN_OUT', holder: 'X' })).status).toBe(409);
    r = expectStatus(await move(staff.agent, o.id, { action: 'RETURNED_TO_OFFICE' }), 200).body;
    expect(r.original.status).toBe('IN_OFFICE');
    expect(r.original.location).toBe('Seyf B · rəf 2');
    expect(r.original.events.map((e: { action: string }) => e.action)).toEqual([
      'RETURNED_TO_OFFICE', 'DELIVERED', 'SENT_BY_COURIER', 'APOSTILLE_BACK', 'SENT_TO_APOSTILLE', 'STORED', 'RECEIVED',
    ]);

    const list = expectStatus(await staff.agent.get(`/api/originals/cases/${c.id}`), 200).body.items;
    expect(list).toHaveLength(1);

    // Only admins delete.
    expect((await staff.agent.delete(`/api/originals/${o.id}`)).status).toBe(403);
    const admin = await asAdmin();
    expectStatus(await admin.agent.delete(`/api/originals/${o.id}`), 204);
    expect(await prisma.originalDocument.count()).toBe(0);
  });

  it('tracking links for the known carriers', () => {
    expect(trackingUrl('UPS', '1Z999')).toContain('ups.com/track');
    expect(trackingUrl('FedEx', '123')).toContain('fedex.com');
    expect(trackingUrl('AzerPost', 'RR123AZ')).toContain('RR123AZ');
    expect(trackingUrl('Azərpoçt', 'RR123AZ')).toContain('RR123AZ');
    expect(trackingUrl('Other', '1')).toBeNull();
    expect(trackingUrl('DHL', '')).toBeNull();
  });

  it('bulk receive: several originals in one act, saved in the client folder and linked, e-mailed', async () => {
    const { client, staff, c } = await setup();
    const res = expectStatus(
      await staff.agent.post(`/api/originals/cases/${c.id}/receive`).send({
        items: [
          { title: 'Pasport', kind: 'PASSPORT' },
          { title: 'Bakalavr diplomu', kind: 'DIPLOMA', note: 'Əlavə ilə' },
          { title: 'Doğum şəhadətnaməsi', kind: 'BIRTH' },
        ],
        location: 'Seyf A',
        condition: 'Zədəsiz',
        signatures: { client: SIGNATURE_DATA_URL, staff: SIGNATURE_DATA_URL },
        email: true,
      }),
      201,
    ).body;
    expect(res.ids).toHaveLength(3);
    expect(res.act.nodeId).toBeTruthy();
    expect(res.act.emailed).toBe(true);

    const events = await prisma.originalEvent.findMany({ where: { originalId: { in: res.ids } } });
    expect(events).toHaveLength(3);
    expect(new Set(events.map((e) => e.actNodeId))).toEqual(new Set([res.act.nodeId]));

    // The act lives in "<client folder>/Übergabeprotokolle".
    const kase = await prisma.case.findUniqueOrThrow({ where: { id: c.id } });
    const node = await prisma.driveNode.findUniqueOrThrow({ where: { id: res.act.nodeId }, include: { parent: true } });
    expect(node.mimeType).toBe('application/pdf');
    expect(node.name).toMatch(/^Übergabeprotokoll .*\.pdf$/);
    expect(node.parent!.name).toBe('Übergabeprotokolle');
    expect(node.parent!.parentId).toBe(kase.driveFolderId);

    const pdf = await pdfOf(staff.agent.get(`/api/originals/events/${events[0].id}/act`));
    expect(pdf.status).toBe(200);
    expect(pdf.body.subarray(0, 5).toString()).toBe('%PDF-');
    expect(await imageCount(pdf.body)).toBeGreaterThanOrEqual(2); // both signatures embedded (PNG + alpha mask)

    const mails = await emailsTo(client.user.email);
    expect(mails.some((m) => m.subject.includes(c.number))).toBe(true);

    // Second act in the same folder; signing later makes a new version.
    const giveOut = expectStatus(await staff.agent.post('/api/originals/events/bulk').send({ ids: res.ids.slice(0, 2), action: 'GIVEN_OUT', holder: 'Tərcüməçi Leyla' }), 200).body;
    expect(giveOut.act.nodeId).not.toBe(res.act.nodeId);
    const signed = expectStatus(await staff.agent.post(`/api/originals/events/${giveOut.eventIds[0]}/sign`).send({ staff: SIGNATURE_DATA_URL }), 200).body;
    expect(signed.nodeId).toBe(giveOut.act.nodeId);
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: giveOut.act.nodeId } })).version).toBe(2);
    expect(await prisma.driveNode.count({ where: { parentId: node.parentId, deletedAt: null } })).toBe(2);

    // Mixed statuses in bulk → 409, nothing changes.
    expect((await staff.agent.post('/api/originals/events/bulk').send({ ids: res.ids, action: 'RETURNED_TO_OFFICE' })).status).toBe(409);
    expect(await prisma.originalDocument.count({ where: { status: 'GIVEN_OUT' } })).toBe(2);
  });

  it('STORED / courier events produce no act; RETURNED_TO_CLIENT does', async () => {
    const { staff, c } = await setup();
    const o = await add(staff.agent, c.id);
    const stored = expectStatus(await move(staff.agent, o.id, { action: 'STORED', location: 'Rəf 1' }), 200).body;
    expect(stored.act).toBeNull();
    const unsigned = expectStatus(await move(staff.agent, o.id, { action: 'GIVEN_OUT', holder: 'Tərcüməçi' }), 200).body;
    expect(await imageCount((await pdfOf(staff.agent.get(`/api/originals/events/${unsigned.original.events[0].id}/act`))).body)).toBe(0);
    expectStatus(await move(staff.agent, o.id, { action: 'RETURNED_TO_OFFICE' }), 200);
    const back = expectStatus(await move(staff.agent, o.id, { action: 'RETURNED_TO_CLIENT', condition: 'Zədəsiz' }), 200).body;
    expect(back.act.nodeId).toBeTruthy();
    expect(back.original.status).toBe('RETURNED_TO_CLIENT');
    // Received again later.
    expect(expectStatus(await move(staff.agent, o.id, { action: 'RECEIVED', act: false }), 200).body.original.status).toBe('IN_OFFICE');
  });

  it('overview filters and overdue detection; the daily job notifies the assigned staff once', async () => {
    const { staff, c } = await setup();
    await prisma.case.update({ where: { id: c.id }, data: { assignedStaffId: staff.user.id } });
    const a = await add(staff.agent, c.id, { title: 'Pasport' });
    const b = await add(staff.agent, c.id, { title: 'Diplom', kind: 'DIPLOMA' });
    const d = await add(staff.agent, c.id, { title: 'Sertifikat', kind: 'CERTIFICATE' });
    expectStatus(await move(staff.agent, a.id, { action: 'GIVEN_OUT', holder: 'Notarius', act: false }), 200);
    expectStatus(await move(staff.agent, b.id, { action: 'SENT_TO_APOSTILLE' }), 200);
    expectStatus(await move(staff.agent, d.id, { action: 'SENT_BY_COURIER', carrier: 'UPS', trackingNo: '1Z' }), 200);
    // a: given out 8 days ago (overdue); b: at apostille 10 days (not yet); d: in transit 11 days (overdue)
    const age = async (id: string, days: number) => {
      const last = await prisma.originalEvent.findFirstOrThrow({ where: { originalId: id }, orderBy: { at: 'desc' } });
      await prisma.originalEvent.update({ where: { id: last.id }, data: { at: new Date(Date.now() - days * DAY) } });
    };
    await age(a.id, 8);
    await age(b.id, 10);
    await age(d.id, 11);

    const all = expectStatus(await staff.agent.get('/api/originals'), 200).body;
    expect(all.items).toHaveLength(3);
    expect(all.counts.GIVEN_OUT).toBe(1);
    const overdue = expectStatus(await staff.agent.get('/api/originals?overdue=1'), 200).body.items;
    expect(overdue.map((o: { title: string }) => o.title).sort()).toEqual(['Pasport', 'Sertifikat']);
    expect(overdue.find((o: { title: string }) => o.title === 'Pasport').daysInStatus).toBe(8);
    expect(expectStatus(await staff.agent.get('/api/originals?status=AT_APOSTILLE'), 200).body.items).toHaveLength(1);
    expect(expectStatus(await staff.agent.get(`/api/originals?q=${encodeURIComponent('Məmmədov')}`), 200).body.items).toHaveLength(3);
    expect(expectStatus(await staff.agent.get(`/api/originals?staff=${staff.user.id}`), 200).body.items).toHaveLength(3);
    expect(expectStatus(await staff.agent.get('/api/originals?staff=none'), 200).body.items).toHaveLength(0);
    expect(expectStatus(await staff.agent.get('/api/originals/overdue'), 200).body.items).toHaveLength(2);

    expect(registeredJobs()).toContain('originals-overdue');
    const r1 = await runOriginalsOverdue();
    expect(r1).toEqual({ overdue: 2, notified: 2 });
    const notes = await prisma.notification.findMany({ where: { userId: staff.user.id, type: 'ORIGINAL_OVERDUE' } });
    expect(notes).toHaveLength(2);
    expect(notes.every((n) => n.link?.startsWith('/admin/originals?open='))).toBe(true);
    // Idempotent.
    expect((await runOriginalsOverdue()).notified).toBe(0);
  });

  it('overdue originals of an unassigned case go to the admins', async () => {
    const { staff, c } = await setup();
    const admin = await asAdmin();
    const o = await add(staff.agent, c.id);
    expectStatus(await move(staff.agent, o.id, { action: 'GIVEN_OUT', holder: 'Y', act: false }), 200);
    await prisma.originalEvent.updateMany({ where: { originalId: o.id, action: 'GIVEN_OUT' }, data: { at: new Date(Date.now() - 9 * DAY) } });
    await runOriginalsOverdue();
    expect(await prisma.notification.count({ where: { userId: admin.user.id, type: 'ORIGINAL_OVERDUE' } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: staff.user.id, type: 'ORIGINAL_OVERDUE' } })).toBe(0);
  });
});

describe('QR labels', () => {
  it('label PDF in three layouts with an embedded QR code', async () => {
    const { staff, c } = await setup();
    for (const [layout, pages] of [['a4-1', 1], ['a4-8', 1], ['62mm', 1]] as const) {
      const res = await pdfOf(staff.agent.get(`/api/originals/cases/${c.id}/label.pdf?layout=${layout}`));
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      const doc = await PDFDocument.load(res.body);
      expect(doc.getPageCount()).toBe(pages);
      expect(await imageCount(res.body)).toBe(1); // one QR image, drawn once or 8 times
      if (layout === '62mm') expect(Math.round(doc.getPage(0).getWidth())).toBe(176); // 62 mm
    }
    expect((await staff.agent.get(`/api/originals/cases/${c.id}/label.pdf?layout=a5`)).status).toBe(400);
    expect((await staff.agent.get('/api/originals/cases/nope/label.pdf')).status).toBe(404);
  });

  it('/qr/:caseId resolves for staff only; clients get 404, anonymous 401', async () => {
    const { client, staff, c } = await setup();
    const res = expectStatus(await staff.agent.get(`/api/originals/qr/${c.id}`), 200).body;
    expect(res.caseId).toBe(c.id);
    expect(res.number).toBe(c.number);
    expect((await client.agent.get(`/api/originals/qr/${c.id}`)).status).toBe(404);
    const other = await asClient();
    expect((await other.agent.get(`/api/originals/qr/${c.id}`)).status).toBe(404);
    const { anon } = await import('../helpers/api');
    expect((await anon().get(`/api/originals/qr/${c.id}`)).status).toBe(401);
    const no2fa = await asStaff({ twoFactor: false });
    expect((await no2fa.agent.get(`/api/originals/qr/${c.id}`)).status).toBe(403);
  });
});

describe('client portal', () => {
  it('shows only the own originals and acts', async () => {
    const { client, staff, c } = await setup();
    const other = await asClient();
    const otherCase = await createCaseVia(other.agent);
    const r = expectStatus(await staff.agent.post(`/api/originals/cases/${c.id}/receive`).send({ items: [{ title: 'Pasport', kind: 'PASSPORT' }] }), 201).body;
    await add(staff.agent, otherCase.id, { title: 'Başqasının pasportu' });

    const mine = expectStatus(await client.agent.get(`/api/originals/my/cases/${c.id}`), 200).body;
    expect(mine.originals.map((o: { title: string }) => o.title)).toEqual(['Pasport']);
    expect(mine.originals[0]).not.toHaveProperty('location');
    expect(mine.acts).toHaveLength(1);
    const pdf = await pdfOf(client.agent.get(`/api/originals/my/acts/${mine.acts[0].eventId}`));
    expect(pdf.status).toBe(200);
    expect(pdf.body.subarray(0, 5).toString()).toBe('%PDF-');
    expect(r.act.nodeId).toBeTruthy();

    expect((await client.agent.get(`/api/originals/my/cases/${otherCase.id}`)).status).toBe(404);
    expect((await other.agent.get(`/api/originals/my/acts/${mine.acts[0].eventId}`)).status).toBe(404);
  });
});

describe('permissions', () => {
  it('clients cannot use the staff API; staff cannot use the admin parts', async () => {
    const { client, staff, c } = await setup();
    expect((await client.agent.get('/api/originals')).status).toBe(403);
    expect((await client.agent.post(`/api/originals/cases/${c.id}`).send({ title: 'x', kind: 'PASSPORT' })).status).toBe(403);
    expect((await client.agent.get(`/api/originals/cases/${c.id}/label.pdf`)).status).toBe(403);
    const no2fa = await asStaff({ twoFactor: false });
    expect((await no2fa.agent.get('/api/originals')).status).toBe(403);
    expect((await staff.agent.get('/api/originals/storage-report')).status).toBe(403);
    expect((await staff.agent.get('/api/originals/retention/preview')).status).toBe(403);
    expect((await staff.agent.put('/api/originals/retention/settings').send({ archiveMonths: 6, deleteMonths: 36 })).status).toBe(403);
    expect((await staff.agent.post(`/api/originals/cases/${c.id}`).send({ title: 'x', kind: 'NOPE' })).status).toBe(400);
    expect((await staff.agent.post(`/api/originals/cases/${c.id}/receive`).send({ items: [] })).status).toBe(400);
    expect((await staff.agent.post(`/api/originals/cases/${c.id}/receive`).send({ items: [{ title: 'P', kind: 'PASSPORT' }], signatures: { client: 'data:text/html;base64,AAAA' } })).status).toBe(400);
  });
});
