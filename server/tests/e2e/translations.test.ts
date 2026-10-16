import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff, type Agent } from '../helpers/api';
import { prisma } from '../helpers/db';
import { binaryParser, makePdf, SAMPLE } from '../helpers/files';
import { config } from '../../src/config.js';
import { runTranslationOverdueReminders } from '../../src/jobs/translations.js';
import { registeredJobs } from '../../src/lib/scheduler.js';

const base = {
  service: 'TRANSLATION',
  sourceLang: 'az',
  targetLang: 'de',
  documentTypes: ['DIPLOMA', 'BIRTH_CERT'],
  pages: 3,
  urgency: 'STANDARD',
  deliveryMethod: 'DIGITAL',
};

type Order = { id: string; number: number; key: string; status: string; files: { id: string; kind: string; fromCase: boolean }[]; events: { status: string | null; note: string | null }[] };

const createOrder = async (agent: Agent, body: Record<string, unknown> = {}) => {
  const res = await agent.post('/api/translations').send({ ...base, ...body });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as { order: Order; estimate: { totalCents: number; currency: string } };
};

let PDF_BYTES: Buffer;
beforeAll(async () => {
  PDF_BYTES = await makePdf('diploma');
});

const uploadSource = (agent: Agent, id: string, name = 'diplom.pdf') =>
  agent.post(`/api/translations/${id}/files`).attach('file', PDF_BYTES, { filename: name, contentType: 'application/pdf' });

const notes = (userId: string, type: string) => prisma.notification.findMany({ where: { userId, type } });

const makeCaseWithDoc = async (clientId: string) => {
  const c = await prisma.case.create({ data: { clientId, number: `TV-T-${crypto.randomBytes(3).toString('hex')}`, profession: 'Driver' } });
  const storedName = `${crypto.randomUUID()}.pdf`;
  fs.mkdirSync(config.uploads.privateDir, { recursive: true });
  fs.writeFileSync(path.join(config.uploads.privateDir, storedName), await makePdf('case doc'));
  const doc = await prisma.document.create({
    data: { caseId: c.id, stage: 'INITIAL', originalName: 'attestat.pdf', storedName, mimeType: 'application/pdf', size: 900, uploadedById: clientId },
  });
  return { c, doc };
};

describe('translation orders: pricing and creation', () => {
  it('serves the price list and creates an order with an estimate and the next TR number', async () => {
    const client = await asClient();
    const admin = await asAdmin();
    const pricing = (await client.agent.get('/api/translations/pricing').expect(200)).body.pricing;
    expect(pricing.currency).toBe('EUR');
    expect(pricing.languages).toEqual(expect.arrayContaining(['az', 'de', 'en', 'ru', 'tr', 'uk']));

    // admin price list from Settings is used
    await admin.agent.put('/api/admin/settings/translationPricing').send({ value: { ...pricing, perPage: { ...pricing.perPage, TRANSLATION: 4000 }, expressSurchargePct: 25 } }).expect(200);
    const est = (await client.agent.get('/api/translations/estimate?service=TRANSLATION&pages=2&urgency=EXPRESS').expect(200)).body;
    expect(est).toMatchObject({ currency: 'EUR', baseCents: 8000, surchargeCents: 2000, totalCents: 10000 });

    const a = await createOrder(client.agent);
    const b = await createOrder(client.agent, { urgency: 'EXPRESS' });
    expect(a.order).toMatchObject({ status: 'NEW', key: 'TR-0001', pages: 3 });
    expect(b.order.key).toBe('TR-0002');
    expect(a.estimate.totalCents).toBe(12000);
    expect(b.estimate.totalCents).toBe(15000);
    expect((await prisma.translationOrder.findUniqueOrThrow({ where: { id: a.order.id } })).priceCents).toBeNull(); // estimate is not stored
    // staff learn about the new order
    expect(await notes(admin.user.id, 'TRANSLATION_NEW')).toHaveLength(2);
    expect(await prisma.auditLog.count({ where: { action: 'TRANSLATION_CREATED' } })).toBe(2);
  });

  it('validates the order body', async () => {
    const client = await asClient();
    const other = await asClient();
    const { c } = await makeCaseWithDoc(other.user.id);
    const bad = async (body: Record<string, unknown>, code?: string) => {
      const res = await client.agent.post('/api/translations').send({ ...base, ...body });
      expect(res.status, JSON.stringify(body)).toBe(400);
      if (code) expect(res.body.error).toBe(code);
    };
    await bad({ pages: 0 });
    await bad({ pages: 201 });
    await bad({ targetLang: 'az' }, 'SAME_LANGUAGE');
    await bad({ targetLang: 'xx' }, 'UNSUPPORTED_LANGUAGE');
    await bad({ documentTypes: ['SPACESHIP_LICENCE'] }, 'UNSUPPORTED_DOCUMENT_TYPE');
    await bad({ documentTypes: [] });
    await bad({ deliveryMethod: 'COURIER' }, 'DELIVERY_ADDRESS_REQUIRED');
    await bad({ caseId: c.id }, 'CASE_NOT_FOUND');
    await bad({ service: 'MAGIC' });
    // apostille may keep the language; courier with an address works
    await createOrder(client.agent, { service: 'APOSTILLE', targetLang: 'az', deliveryMethod: 'COURIER', deliveryAddress: 'Nizami küç. 10, Bakı' });
  });

  it('assigns unique numbers to concurrent orders', async () => {
    const client = await asClient();
    const res = await Promise.all(Array.from({ length: 5 }, () => client.agent.post('/api/translations').send(base)));
    expect(res.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);
    expect(new Set(res.map((r) => r.body.order.number)).size).toBe(5);
  });
});

describe('translation orders: full lifecycle', () => {
  it('NEW → QUOTED → ACCEPTED → IN_PROGRESS → READY → DELIVERED with events and notifications', async () => {
    const client = await asClient({ locale: 'de' });
    const staff = await asStaff();
    const admin = await asAdmin();
    const { order } = await createOrder(client.agent);
    await uploadSource(client.agent, order.id).expect(201);

    // assignment
    await staff.agent.patch(`/api/admin/translations/${order.id}`).send({ assignedStaffId: staff.user.id, staffNote: 'nur intern' }).expect(200);

    // quote
    const due = new Date(Date.now() + 5 * 86400_000).toISOString();
    const q = await staff.agent.post(`/api/admin/translations/${order.id}/quote`).send({ priceCents: 11900, dueAt: due, quoteNote: 'inkl. Beglaubigung' }).expect(200);
    expect(q.body.order).toMatchObject({ status: 'QUOTED', priceCents: 11900 });
    const quoted = (await notes(client.user.id, 'TRANSLATION_QUOTED'))[0];
    expect(quoted.title).toBe('Ihr Angebot ist da (TR-0001)');
    expect(quoted.body).toContain('119,00');
    expect(quoted.link).toBe(`/account/translations/${order.id}`);

    // client does not see internal notes
    const view = (await client.agent.get(`/api/translations/${order.id}`).expect(200)).body.order;
    expect(view.staffNote).toBeUndefined();
    expect(view.events.some((e: { note: string | null }) => e.note?.includes('updated'))).toBe(false);

    // staff cannot skip steps
    await staff.agent.post(`/api/admin/translations/${order.id}/status`).send({ status: 'IN_PROGRESS' }).expect(409);
    await staff.agent.post(`/api/admin/translations/${order.id}/status`).send({ status: 'ACCEPTED' }).expect(409);

    // accept
    await client.agent.post(`/api/translations/${order.id}/accept`).expect(200);
    await client.agent.post(`/api/translations/${order.id}/accept`).expect(409);
    expect(await notes(admin.user.id, 'TRANSLATION_ACCEPTED')).toHaveLength(1);
    expect(await notes(staff.user.id, 'TRANSLATION_ACCEPTED')).toHaveLength(1); // assignee
    // sources are locked after acceptance
    await uploadSource(client.agent, order.id).expect(409);

    await staff.agent.post(`/api/admin/translations/${order.id}/status`).send({ status: 'READY' }).expect(409);
    await staff.agent.post(`/api/admin/translations/${order.id}/status`).send({ status: 'IN_PROGRESS', note: 'Übersetzer arbeitet', visibleToClient: true }).expect(200);

    // READY needs a result file for digital delivery
    const noFile = await staff.agent.post(`/api/admin/translations/${order.id}/status`).send({ status: 'READY' });
    expect(noFile.status).toBe(409);
    expect(noFile.body.error).toBe('RESULT_FILE_REQUIRED');
    const up = await staff.agent
      .post(`/api/admin/translations/${order.id}/files`)
      .attach('file', await makePdf('Übersetzung'), { filename: 'übersetzung.pdf', contentType: 'application/pdf' })
      .expect(201);
    const result = up.body.order.files.find((f: { kind: string }) => f.kind === 'RESULT');
    expect(result.filename).toBe('übersetzung.pdf');

    // client cannot see or download the result before READY
    const before = (await client.agent.get(`/api/translations/${order.id}`).expect(200)).body.order;
    expect(before.files.some((f: { kind: string }) => f.kind === 'RESULT')).toBe(false);
    await client.agent.get(`/api/translations/files/${result.id}`).expect(404);

    await staff.agent.post(`/api/admin/translations/${order.id}/status`).send({ status: 'READY', note: 'Fertig' }).expect(200);
    expect((await notes(client.user.id, 'TRANSLATION_READY'))[0].title).toBe('Ihr Auftrag ist fertig (TR-0001)');
    const dl = await client.agent.get(`/api/translations/files/${result.id}?download=1`).buffer(true).parse(binaryParser).expect(200);
    expect(dl.headers['content-disposition']).toContain('attachment');
    expect((dl.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    await staff.agent.patch(`/api/admin/translations/${order.id}`).send({ trackingNumber: 'DHL123' }).expect(200);
    await staff.agent.post(`/api/admin/translations/${order.id}/status`).send({ status: 'DELIVERED' }).expect(200);
    const delivered = (await notes(client.user.id, 'TRANSLATION_DELIVERED'))[0];
    expect(delivered.body).toContain('DHL123');
    await staff.agent.post(`/api/admin/translations/${order.id}/status`).send({ status: 'CANCELLED', note: 'x' }).expect(409);

    const final = (await staff.agent.get(`/api/admin/translations/${order.id}`).expect(200)).body.order;
    expect(final.status).toBe('DELIVERED');
    expect(final.completedAt).not.toBeNull();
    expect(final.staffNote).toBe('nur intern');
    expect(final.events.map((e: { status: string | null }) => e.status).filter(Boolean)).toEqual(['NEW', 'QUOTED', 'ACCEPTED', 'IN_PROGRESS', 'READY', 'DELIVERED']);
    expect(final.events.some((e: { visibleToClient: boolean }) => !e.visibleToClient)).toBe(true);
    const clientEvents = (await client.agent.get(`/api/translations/${order.id}`).expect(200)).body.order.events;
    expect(clientEvents.every((e: { status: string | null }) => e.status)).toBe(true);
    expect(await prisma.auditLog.count({ where: { target: `translation:${order.id}` } })).toBeGreaterThanOrEqual(8);

    // summary and list filters
    const summary = (await staff.agent.get('/api/admin/translations/summary').expect(200)).body;
    expect(summary).toMatchObject({ open: 0, ready: 0, overdue: 0 });
    const list = (await staff.agent.get('/api/admin/translations?status=DELIVERED&search=TR-1').expect(200)).body;
    expect(list.items).toHaveLength(1);
    expect((await staff.agent.get('/api/admin/translations?status=open').expect(200)).body.items).toHaveLength(0);
  });

  it('cancelling needs a reason and notifies the client; re-quoting is allowed while QUOTED', async () => {
    const client = await asClient();
    const staff = await asStaff();
    const { order } = await createOrder(client.agent);
    const due = new Date(Date.now() + 3 * 86400_000).toISOString();
    await staff.agent.post(`/api/admin/translations/${order.id}/quote`).send({ priceCents: 5000, dueAt: due }).expect(200);
    await staff.agent.post(`/api/admin/translations/${order.id}/quote`).send({ priceCents: 4500, dueAt: due }).expect(200);
    expect(await notes(client.user.id, 'TRANSLATION_QUOTED')).toHaveLength(2);
    const r = await staff.agent.post(`/api/admin/translations/${order.id}/status`).send({ status: 'CANCELLED' });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('REASON_REQUIRED');
    await staff.agent.post(`/api/admin/translations/${order.id}/status`).send({ status: 'CANCELLED', note: 'Sənəd oxunmur' }).expect(200);
    const n = (await notes(client.user.id, 'TRANSLATION_CANCELLED'))[0];
    expect(n.body).toContain('Sənəd oxunmur');
    await staff.agent.post(`/api/admin/translations/${order.id}/quote`).send({ priceCents: 1, dueAt: due }).expect(409);
  });
});

describe('translation orders: client rules and isolation', () => {
  it('client may cancel only NEW / QUOTED orders', async () => {
    const client = await asClient();
    const staff = await asStaff();
    const a = (await createOrder(client.agent)).order;
    await client.agent.post(`/api/translations/${a.id}/cancel`).send({ reason: 'changed my mind' }).expect(200);
    await client.agent.post(`/api/translations/${a.id}/cancel`).send({}).expect(409);

    const b = (await createOrder(client.agent)).order;
    await staff.agent.post(`/api/admin/translations/${b.id}/quote`).send({ priceCents: 5000, dueAt: new Date(Date.now() + 86400_000).toISOString() }).expect(200);
    await client.agent.post(`/api/translations/${b.id}/accept`).expect(200);
    await client.agent.post(`/api/translations/${b.id}/cancel`).send({}).expect(409);
    // accepting a NEW order is not possible
    const c = (await createOrder(client.agent)).order;
    await client.agent.post(`/api/translations/${c.id}/accept`).expect(409);
  });

  it('a client cannot see, change or download another client’s order', async () => {
    const owner = await asClient();
    const intruder = await asClient();
    const { order } = await createOrder(owner.agent);
    const up = await uploadSource(owner.agent, order.id).expect(201);
    const fileId = up.body.order.files[0].id;

    expect((await intruder.agent.get('/api/translations').expect(200)).body.items).toHaveLength(0);
    await intruder.agent.get(`/api/translations/${order.id}`).expect(404);
    await intruder.agent.get(`/api/translations/files/${fileId}`).expect(404);
    await uploadSource(intruder.agent, order.id).expect(404);
    await intruder.agent.delete(`/api/translations/${order.id}/files/${fileId}`).expect(404);
    await intruder.agent.post(`/api/translations/${order.id}/cancel`).send({}).expect(404);
    await intruder.agent.post(`/api/translations/${order.id}/accept`).expect(404);
    await intruder.agent.get('/api/admin/translations').expect(403);
    await intruder.agent.post(`/api/admin/translations/${order.id}/quote`).send({ priceCents: 1, dueAt: new Date().toISOString() }).expect(403);

    // owner and staff can download; anonymous cannot
    await owner.agent.get(`/api/translations/files/${fileId}`).expect(200);
    const staff = await asStaff();
    await staff.agent.get(`/api/translations/files/${fileId}`).expect(200);
    // the stray upload of the intruder left nothing behind
    expect(await prisma.translationOrderFile.count()).toBe(1);
  });

  it('validates file type, content and size; removes files only while NEW', async () => {
    const client = await asClient();
    const { order } = await createOrder(client.agent);
    const dir = path.join(config.uploads.privateDir, 'translations');
    const onDisk = () => (fs.existsSync(dir) ? fs.readdirSync(dir).length : 0);
    const before = onDisk();
    const exe = await client.agent.post(`/api/translations/${order.id}/files`).attach('file', Buffer.from('MZ....'), { filename: 'x.exe', contentType: 'application/x-msdownload' });
    expect(exe.status).toBe(400);
    expect(exe.body.error).toBe('UNSUPPORTED_FILE_TYPE');
    const fake = await client.agent.post(`/api/translations/${order.id}/files`).attach('file', Buffer.from('not a pdf'), { filename: 'fake.pdf', contentType: 'application/pdf' });
    expect(fake.status).toBe(400);
    expect(fake.body.error).toBe('FILE_CONTENT_MISMATCH');
    const big = Buffer.concat([SAMPLE.png, Buffer.alloc(config.uploads.maxFileSize + 10)]);
    const tooBig = await client.agent.post(`/api/translations/${order.id}/files`).attach('file', big, { filename: 'big.png', contentType: 'image/png' });
    expect(tooBig.status).toBe(413);
    expect(onDisk()).toBe(before); // nothing from the refused uploads stayed on disk
    await client.agent.post(`/api/translations/${order.id}/files`).attach('file', SAMPLE.png, { filename: 'scan.png', contentType: 'image/png' }).expect(201);
    const two = await client.agent
      .post(`/api/translations/${order.id}/files`)
      .attach('file', SAMPLE.jpg, { filename: 'a.jpg', contentType: 'image/jpeg' })
      .attach('file', SAMPLE.zip, { filename: 'b.docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
      .expect(201);
    expect(two.body.order.files).toHaveLength(3);
    const stored = await prisma.translationOrderFile.findMany({ where: { orderId: order.id } });
    for (const f of stored) expect(fs.existsSync(path.join(config.uploads.privateDir, 'translations', f.storageKey!))).toBe(true);

    const first = stored[0];
    await client.agent.delete(`/api/translations/${order.id}/files/${first.id}`).expect(200);
    expect(fs.existsSync(path.join(config.uploads.privateDir, 'translations', first.storageKey!))).toBe(false);

    const staff = await asStaff();
    await staff.agent.post(`/api/admin/translations/${order.id}/quote`).send({ priceCents: 1000, dueAt: new Date(Date.now() + 86400_000).toISOString() }).expect(200);
    await client.agent.delete(`/api/translations/${order.id}/files/${stored[1].id}`).expect(409);
    // still allowed to add sources while QUOTED
    await uploadSource(client.agent, order.id).expect(201);
    // staff result uploads are refused before acceptance
    await staff.agent.post(`/api/admin/translations/${order.id}/files`).attach('file', await makePdf('r'), { filename: 'r.pdf', contentType: 'application/pdf' }).expect(409);
  });

  it('reuses documents only from the client’s own cases, without copying bytes', async () => {
    const client = await asClient();
    const other = await asClient();
    const { c, doc } = await makeCaseWithDoc(client.user.id);
    const { doc: foreign } = await makeCaseWithDoc(other.user.id);
    const picker = (await client.agent.get('/api/translations/case-documents').expect(200)).body.cases;
    expect(picker).toHaveLength(1);
    expect(picker[0]).toMatchObject({ id: c.id, documents: [{ id: doc.id, originalName: 'attestat.pdf' }] });
    const { order } = await createOrder(client.agent, { caseId: c.id });
    expect((await client.agent.get(`/api/translations/${order.id}`).expect(200)).body.order.case).toMatchObject({ id: c.id });

    const r = await client.agent.post(`/api/translations/${order.id}/files/from-case`).send({ documentIds: [foreign.id] });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('DOCUMENT_NOT_FOUND');
    await client.agent.post(`/api/translations/${order.id}/files/from-case`).send({ documentIds: [doc.id, foreign.id] }).expect(400);

    const ok = await client.agent.post(`/api/translations/${order.id}/files/from-case`).send({ documentIds: [doc.id] }).expect(201);
    expect(ok.body.order.files).toHaveLength(1);
    expect(ok.body.order.files[0]).toMatchObject({ fromCase: true, documentId: doc.id });
    // linking the same document again does not duplicate it
    await client.agent.post(`/api/translations/${order.id}/files/from-case`).send({ documentIds: [doc.id] }).expect(201);
    const rows = await prisma.translationOrderFile.findMany({ where: { orderId: order.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].storageKey).toBeNull();

    const dl = await client.agent.get(`/api/translations/files/${rows[0].id}`).buffer(true).parse(binaryParser).expect(200);
    expect((dl.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    await other.agent.get(`/api/translations/files/${rows[0].id}`).expect(404);
  });
});

describe('translation orders: admin', () => {
  it('filters by status, service, assignee, search and overdue; refuses non-staff assignees', async () => {
    const client = await asClient({ firstName: 'Rəşad', lastName: 'Məmmədov' });
    const staff = await asStaff();
    const admin = await asAdmin();
    const a = (await createOrder(client.agent)).order;
    const b = (await createOrder(client.agent, { service: 'APOSTILLE' })).order;

    await staff.agent.patch(`/api/admin/translations/${a.id}`).send({ assignedStaffId: client.user.id }).expect(400);
    await admin.agent.patch(`/api/admin/translations/${a.id}`).send({ assignedStaffId: staff.user.id }).expect(200);
    expect(await notes(staff.user.id, 'TRANSLATION_ASSIGNED')).toHaveLength(1);

    await prisma.translationOrder.update({ where: { id: b.id }, data: { status: 'IN_PROGRESS', dueAt: new Date(Date.now() - 86400_000) } });

    const get = async (qs: string) => (await staff.agent.get(`/api/admin/translations?${qs}`).expect(200)).body.items.map((i: { id: string }) => i.id);
    expect(await get('service=APOSTILLE')).toEqual([b.id]);
    expect(await get('assignee=me')).toEqual([a.id]);
    expect(await get('assignee=none')).toEqual([b.id]);
    expect(await get('overdue=1')).toEqual([b.id]);
    expect(await get('status=NEW,IN_PROGRESS')).toHaveLength(2);
    expect(await get('search=Məmməd')).toHaveLength(2);
    expect(await get(`search=${b.number}`)).toEqual([b.id]);
    expect(await get('search=Nobody')).toHaveLength(0);
    await staff.agent.get('/api/admin/translations?status=BOGUS').expect(400);

    const list = (await staff.agent.get('/api/admin/translations?overdue=1').expect(200)).body.items;
    expect(list[0]).toMatchObject({ overdue: true, client: { firstName: 'Rəşad' } });
    expect((await staff.agent.get('/api/admin/translations/summary').expect(200)).body).toMatchObject({ open: 2, new: 1, overdue: 1, ready: 0 });
  });
});

describe('translation overdue job', () => {
  it('is registered and reminds the assignee once per order per day (admins when unassigned)', async () => {
    expect(registeredJobs()).toContain('translation-overdue');
    const client = await asClient();
    const staff = await asStaff({ locale: 'en' });
    const admin = await asAdmin();
    const a = (await createOrder(client.agent)).order;
    const b = (await createOrder(client.agent)).order;
    const c = (await createOrder(client.agent)).order;
    const now = new Date('2030-05-10T08:00:00Z');
    const due = new Date('2030-05-09T08:00:00Z');
    await prisma.translationOrder.update({ where: { id: a.id }, data: { status: 'IN_PROGRESS', dueAt: due, assignedStaffId: staff.user.id } });
    await prisma.translationOrder.update({ where: { id: b.id }, data: { status: 'IN_PROGRESS', dueAt: due } });
    await prisma.translationOrder.update({ where: { id: c.id }, data: { status: 'READY', dueAt: due } }); // finished: no reminder

    expect(await runTranslationOverdueReminders(now)).toBe(2);
    expect(await runTranslationOverdueReminders(new Date(now.getTime() + 3600_000))).toBe(0);
    const staffNotes = await notes(staff.user.id, 'TRANSLATION_OVERDUE');
    expect(staffNotes).toHaveLength(1);
    expect(staffNotes[0].title).toBe(`Translation order overdue: ${a.key}`);
    const adminNotes = await notes(admin.user.id, 'TRANSLATION_OVERDUE');
    expect(adminNotes).toHaveLength(1); // only the unassigned order
    expect(adminNotes[0].link).toBe(`/admin/translations/${b.id}`);

    // next day: again
    expect(await runTranslationOverdueReminders(new Date(now.getTime() + 24 * 3600_000))).toBe(2);
    expect(await notes(staff.user.id, 'TRANSLATION_OVERDUE')).toHaveLength(2);
  });
});
