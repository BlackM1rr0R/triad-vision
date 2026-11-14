import { describe, expect, it } from 'vitest';
import type { TranslationService, TranslationStatus } from '@prisma/client';
import { asAdmin, asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { binaryParser, makePdf } from '../helpers/files';
import { orderKey } from '../../src/lib/translations/core.js';
import { runTranslationOverdueReminders } from '../../src/jobs/translations.js';
import { registeredJobs } from '../../src/lib/scheduler.js';

/**
 * Triad Vision no longer offers translation / apostille: the client order API (/api/translations) is gone and
 * the admin page is an archive where staff only close orders received earlier. Orders are created directly in
 * the database here, as they exist on production from before the change.
 */

let nextNumber = 1;
const createOrder = async (clientId: string, data: { service?: TranslationService; status?: TranslationStatus; dueAt?: Date; assignedStaffId?: string } = {}) => {
  const o = await prisma.translationOrder.create({
    data: { number: nextNumber++, clientId, service: data.service ?? 'TRANSLATION', sourceLang: 'az', targetLang: 'de', pages: 2, status: data.status ?? 'NEW', dueAt: data.dueAt, assignedStaffId: data.assignedStaffId },
  });
  return { ...o, key: orderKey(o.number) };
};

const notes = (userId: string, type: string) => prisma.notification.findMany({ where: { userId, type } });

describe('translation orders: client ordering is removed', () => {
  it('has no client API and no quote endpoint any more', async () => {
    const client = await asClient();
    const staff = await asStaff();
    const order = await createOrder(client.user.id);
    for (const p of ['/api/translations', '/api/translations/pricing', `/api/translations/${order.id}`]) {
      expect((await client.agent.get(p)).status, p).toBe(404);
    }
    expect((await client.agent.post('/api/translations').send({ service: 'TRANSLATION' })).status).toBe(404);
    expect((await staff.agent.post(`/api/admin/translations/${order.id}/quote`).send({ priceCents: 1000, dueAt: new Date().toISOString() })).status).toBe(404);
    await client.agent.get('/api/admin/translations').expect(403);
  });
});

describe('translation orders: archive (staff closes old orders)', () => {
  it('an open old order can only be cancelled, with a reason; the client is told to do it themselves', async () => {
    const client = await asClient({ locale: 'en' });
    const staff = await asStaff();
    const order = await createOrder(client.user.id, { status: 'QUOTED' });
    await staff.agent.post(`/api/admin/translations/${order.id}/status`).send({ status: 'ACCEPTED' }).expect(409);
    await staff.agent.post(`/api/admin/translations/${order.id}/status`).send({ status: 'IN_PROGRESS' }).expect(409);
    const r = await staff.agent.post(`/api/admin/translations/${order.id}/status`).send({ status: 'CANCELLED' });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('REASON_REQUIRED');
    await staff.agent.post(`/api/admin/translations/${order.id}/status`).send({ status: 'CANCELLED', note: 'Service discontinued' }).expect(200);
    const n = (await notes(client.user.id, 'TRANSLATION_CANCELLED'))[0];
    expect(n.title).toBe(`Order cancelled (${order.key})`);
    expect(n.body).toContain('you have the apostille and sworn translations done yourself');
    expect(n.body).toContain('Service discontinued');
    expect(n.link).toBe('/account/notifications');
  });

  it('an order already in progress can be finished; staff download files through the admin API', async () => {
    const client = await asClient({ locale: 'de' });
    const staff = await asStaff();
    const order = await createOrder(client.user.id, { status: 'IN_PROGRESS' });
    const noFile = await staff.agent.post(`/api/admin/translations/${order.id}/status`).send({ status: 'READY' });
    expect(noFile.status).toBe(409);
    expect(noFile.body.error).toBe('RESULT_FILE_REQUIRED');
    const up = await staff.agent
      .post(`/api/admin/translations/${order.id}/files`)
      .attach('file', await makePdf('Übersetzung'), { filename: 'übersetzung.pdf', contentType: 'application/pdf' })
      .expect(201);
    const result = up.body.order.files.find((f: { kind: string }) => f.kind === 'RESULT');
    const dl = await staff.agent.get(`/api/admin/translations/files/${result.id}?download=1`).buffer(true).parse(binaryParser).expect(200);
    expect(dl.headers['content-disposition']).toContain('attachment');
    expect((dl.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    await client.agent.get(`/api/admin/translations/files/${result.id}`).expect(403);

    await staff.agent.post(`/api/admin/translations/${order.id}/status`).send({ status: 'READY', note: 'Fertig' }).expect(200);
    expect((await notes(client.user.id, 'TRANSLATION_READY'))[0].title).toBe(`Ihr Auftrag ist fertig (${order.key})`);
    await staff.agent.patch(`/api/admin/translations/${order.id}`).send({ trackingNumber: 'DHL123' }).expect(200);
    await staff.agent.post(`/api/admin/translations/${order.id}/status`).send({ status: 'DELIVERED' }).expect(200);
    expect((await notes(client.user.id, 'TRANSLATION_DELIVERED'))[0].body).toContain('DHL123');
    await staff.agent.post(`/api/admin/translations/${order.id}/status`).send({ status: 'CANCELLED', note: 'x' }).expect(409);
    const final = (await staff.agent.get(`/api/admin/translations/${order.id}`).expect(200)).body.order;
    expect(final.status).toBe('DELIVERED');
    expect(final.completedAt).not.toBeNull();
  });

  it('filters by status, service, assignee, search and overdue; refuses non-staff assignees', async () => {
    const client = await asClient({ firstName: 'Rəşad', lastName: 'Məmmədov' });
    const staff = await asStaff();
    const admin = await asAdmin();
    const a = await createOrder(client.user.id);
    const b = await createOrder(client.user.id, { service: 'APOSTILLE', status: 'IN_PROGRESS', dueAt: new Date(Date.now() - 86400_000) });

    await staff.agent.patch(`/api/admin/translations/${a.id}`).send({ assignedStaffId: client.user.id }).expect(400);
    await admin.agent.patch(`/api/admin/translations/${a.id}`).send({ assignedStaffId: staff.user.id }).expect(200);
    expect(await notes(staff.user.id, 'TRANSLATION_ASSIGNED')).toHaveLength(1);

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
    expect((await staff.agent.get('/api/admin/translations/summary').expect(200)).body).toMatchObject({ open: 2, new: 1, overdue: 1, ready: 0 });
  });
});

describe('translation overdue job', () => {
  it('is registered and reminds the assignee once per order per day (admins when unassigned)', async () => {
    expect(registeredJobs()).toContain('translation-overdue');
    const client = await asClient();
    const staff = await asStaff({ locale: 'en' });
    const admin = await asAdmin();
    const due = new Date('2030-05-09T08:00:00Z');
    const a = await createOrder(client.user.id, { status: 'IN_PROGRESS', dueAt: due, assignedStaffId: staff.user.id });
    const b = await createOrder(client.user.id, { status: 'IN_PROGRESS', dueAt: due });
    await createOrder(client.user.id, { status: 'READY', dueAt: due }); // finished: no reminder
    const now = new Date('2030-05-10T08:00:00Z');

    expect(await runTranslationOverdueReminders(now)).toBe(2);
    expect(await runTranslationOverdueReminders(new Date(now.getTime() + 3600_000))).toBe(0);
    const staffNotes = await notes(staff.user.id, 'TRANSLATION_OVERDUE');
    expect(staffNotes).toHaveLength(1);
    expect(staffNotes[0].title).toBe(`Translation order (archive) overdue: ${a.key}`);
    const adminNotes = await notes(admin.user.id, 'TRANSLATION_OVERDUE');
    expect(adminNotes).toHaveLength(1); // only the unassigned order
    expect(adminNotes[0].link).toBe(`/admin/translations/${b.id}`);

    expect(await runTranslationOverdueReminders(new Date(now.getTime() + 24 * 3600_000))).toBe(2);
    expect(await notes(staff.user.id, 'TRANSLATION_OVERDUE')).toHaveLength(2);
  });
});
