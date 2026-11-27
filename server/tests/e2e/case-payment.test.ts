import { describe, expect, it } from 'vitest';
import { anon, asClient, asStaff } from '../helpers/api';
import { prisma, waitFor } from '../helpers/db';
import { createCaseVia, expectStatus } from '../helpers/workflow';

/**
 * Payment step after the Əmək müqaviləsi (lib/casePayment): staff record "Ödəniş alındı" (POST /api/admin/cases/:id/payment),
 * the client reads the state (GET /api/client-process/payment) and can book the office visit with the reason "payment".
 * (The CONTRACT_SIGNED next-step / ball rules are exercised in case-contracts-v2.test.ts and unit/casePayment.test.ts.)
 */

const HOUR = 3600 * 1000;

describe('case payment (office)', () => {
  it('only staff record it; the client sees the state of own case only; a second record is refused', async () => {
    const staff = await asStaff();
    const a = await asClient({ locale: 'az' });
    const b = await asClient();
    const ca = await createCaseVia(a.agent);

    expect((await anon().post(`/api/admin/cases/${ca.id}/payment`).send({})).status).toBe(401);
    expect((await a.agent.post(`/api/admin/cases/${ca.id}/payment`).send({})).status).toBe(403);
    expect((await staff.agent.post('/api/admin/cases/does-not-exist/payment').send({})).status).toBe(404);

    // Own case: not paid yet, nothing due (the case is not in the payment step); another client gets 404.
    expect(expectStatus(await a.agent.get('/api/client-process/payment').query({ caseId: ca.id }), 200).body.payment).toMatchObject({ caseId: ca.id, paid: false, due: false, amountCents: null });
    expect((await b.agent.get('/api/client-process/payment').query({ caseId: ca.id })).status).toBe(404);
    expect((await anon().get('/api/client-process/payment').query({ caseId: ca.id })).status).toBe(401);

    expectStatus(await staff.agent.post(`/api/admin/cases/${ca.id}/payment`).send({ amountCents: 50000, note: 'Ofisdə nağd' }), 201);
    expect(expectStatus(await a.agent.get('/api/client-process/payment').query({ caseId: ca.id }), 200).body.payment).toMatchObject({ paid: true, due: false });
    expect(await prisma.caseEvent.count({ where: { caseId: ca.id, type: 'PAYMENT_RECEIVED' } })).toBe(1);
    expect(await prisma.clientPayment.findFirst({ where: { caseId: ca.id } })).toMatchObject({ amountCents: 50000, method: 'CASH', clientId: a.user.id });
    await waitFor(() => prisma.notification.findFirst({ where: { userId: a.user.id, type: 'CASE_PAYMENT_RECEIVED' } }));
    expect((await staff.agent.post(`/api/admin/cases/${ca.id}/payment`).send({})).status).toBe(409);
    expect(await prisma.auditLog.count({ where: { action: 'CASE_PAYMENT_RECEIVED', target: ca.id } })).toBe(1);
  });

  it('an open invoice of the case gives the amount and is paid in cash by the record', async () => {
    const staff = await asStaff();
    const client = await asClient();
    const c = await createCaseVia(client.agent);
    const now = new Date();
    const inv = await prisma.clientInvoice.create({
      data: {
        number: `TV-KR-TEST-${Math.floor(Math.random() * 1e6)}`,
        clientId: client.user.id,
        caseId: c.id,
        issueDate: now,
        dueDate: new Date(now.getTime() + 7 * 24 * HOUR),
        items: [{ description: 'Servicegebühr', quantity: 1, unitPriceCents: 100000 }],
        netCents: 100000,
        vatRate: 0,
        vatCents: 0,
        grossCents: 100000,
        status: 'SENT',
        sentAt: now,
      },
    });
    expect(expectStatus(await client.agent.get('/api/client-process/payment').query({ caseId: c.id }), 200).body.payment).toMatchObject({ paid: false, amountCents: 100000, currency: 'EUR', invoiceNumber: inv.number });

    expectStatus(await staff.agent.post(`/api/admin/cases/${c.id}/payment`).send({}), 201);
    expect(await prisma.clientInvoice.findUniqueOrThrow({ where: { id: inv.id } })).toMatchObject({ status: 'PAID', paidCents: 100000 });
    expect(await prisma.clientPayment.findFirst({ where: { invoiceId: inv.id } })).toMatchObject({ method: 'CASH', amountCents: 100000 });
    expect(expectStatus(await client.agent.get('/api/client-process/payment').query({ caseId: c.id }), 200).body.payment).toMatchObject({ paid: true, amountCents: null });
  });

  it('the payment visit: booked with the reason "payment" (shown to the client), closed when the payment is recorded', async () => {
    await prisma.setting.upsert({
      where: { key: 'contact' },
      create: { key: 'contact', value: { phone: '+994', offices: [{ city: { az: 'Bakı' }, address: 'Nizami küç. 96' }] } },
      update: { value: { phone: '+994', offices: [{ city: { az: 'Bakı' }, address: 'Nizami küç. 96' }] } },
    });
    const staff = await asStaff();
    const client = await asClient();
    const c = await createCaseVia(client.agent);
    const startsAt = new Date(Math.floor((Date.now() + 30 * HOUR) / 60000) * 60000);
    expectStatus(await staff.agent.post('/api/admin/client-process/office/slots').send({ startsAt, minutes: 30, capacity: 1, officeIndex: 0 }), 201);
    const slotId = expectStatus(await client.agent.get('/api/client-process/office/slots'), 200).body.slots[0].id;
    expectStatus(await client.agent.post('/api/client-process/office/visits').send({ caseId: c.id, slotId, reason: 'payment' }), 201);

    const view = expectStatus(await client.agent.get('/api/client-process/payment').query({ caseId: c.id }), 200).body;
    expect(view.payment.visit).toMatchObject({ location: 'Bakı · Nizami küç. 96' });
    expect(new Date(view.payment.visit.startsAt).getTime()).toBe(startsAt.getTime());
    expect(view.offices[0]).toMatchObject({ address: 'Nizami küç. 96' });

    expectStatus(await staff.agent.post(`/api/admin/cases/${c.id}/payment`).send({}), 201);
    expect(await prisma.booking.count({ where: { caseId: c.id, topic: 'payment', status: 'DONE' } })).toBe(1);
    expect(expectStatus(await client.agent.get('/api/client-process/payment').query({ caseId: c.id }), 200).body.payment.visit).toBeNull();
  });
});
