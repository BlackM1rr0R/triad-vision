import { describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { anon, asAdmin, asClient, asStaff, asSuperAdmin } from '../helpers/api';
import { prisma } from '../helpers/db';
import { registeredJobs } from '../../src/lib/scheduler.js';
import '../../src/jobs/inquiryRetention.js';
import { anonymizedEmail, eraseInquiries, inquiryRetentionStatus, runInquiryRetention } from '../../src/lib/privacy/inquiries.js';
import { buildUserExport } from '../../src/lib/privacy/export.js';
import { deleteUserAccount } from '../../src/lib/userDeletion.js';

const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

let seq = 0;
const lead = (data: Partial<Prisma.InquiryUncheckedCreateInput> = {}) =>
  prisma.inquiry.create({
    data: {
      kind: 'contact',
      contactName: 'Lead Person',
      email: `lead${++seq}@example.com`,
      phone: '+49 151 000000',
      companyName: 'ACME GmbH',
      sector: 'care',
      workersNeeded: 3,
      message: 'Please call me back',
      locale: 'de',
      visitorId: 'v-123',
      utm: { source: 'google' },
      quizResult: { score: 3 },
      estimate: { total: 1000 },
      staffNotes: 'called once',
      status: 'DONE',
      createdAt: ago(800),
      ...data,
    },
  });

describe('inquiry retention (DSGVO)', () => {
  it('is registered with the scheduler', () => {
    expect(registeredJobs()).toContain('inquiry-retention');
  });

  it('anonymises closed, not converted leads older than 24 months; keeps the rest', async () => {
    const old = await lead();
    const archived = await lead({ status: 'ARCHIVED' });
    const open = await lead({ status: 'IN_PROGRESS' });
    const recent = await lead({ createdAt: ago(300) });
    const converted = await lead({ convertedAt: ago(700), convertedUserId: 'u1' });
    const recentlyAssigned = await lead({ assignedAt: ago(100), assignedStaffId: 's1' });

    const before = await inquiryRetentionStatus();
    expect(before.settings.months).toBe(24);
    expect(before.due).toBe(2);

    const run = await runInquiryRetention();
    expect(run.anonymized).toBe(2);
    expect(run.months).toBe(24);

    const a = await prisma.inquiry.findUniqueOrThrow({ where: { id: old.id } });
    expect(a.contactName).toBe('—');
    expect(a.email).toBe(anonymizedEmail(old.id));
    expect(a.phone).toBeNull();
    expect(a.message).toBe('');
    expect(a.companyName).toBeNull();
    expect(a.utm).toBeNull();
    expect(a.visitorId).toBeNull();
    expect(a.quizResult).toBeNull();
    expect(a.estimate).toBeNull();
    expect(a.staffNotes).toBeNull();
    expect(a.anonymizedAt).not.toBeNull();
    // Statistics stay.
    expect(a.kind).toBe('contact');
    expect(a.sector).toBe('care');
    expect(a.workersNeeded).toBe(3);
    expect(a.status).toBe('DONE');
    expect((await prisma.inquiry.findUniqueOrThrow({ where: { id: archived.id } })).anonymizedAt).not.toBeNull();

    for (const keep of [open, recent, converted, recentlyAssigned]) {
      const row = await prisma.inquiry.findUniqueOrThrow({ where: { id: keep.id } });
      expect(row.anonymizedAt).toBeNull();
      expect(row.contactName).toBe('Lead Person');
    }

    // Idempotent; the last run is stored for Admin → Settings.
    expect((await runInquiryRetention()).anonymized).toBe(0);
    const after = await inquiryRetentionStatus();
    expect(after.due).toBe(0);
    expect(after.anonymizedTotal).toBe(2);
    expect(after.lastRun?.anonymized).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: 'INQUIRY_RETENTION_ANONYMIZED' } })).toBe(1);
  });

  it('uses the configured period (Admin → Settings) and exposes the status', async () => {
    const admin = await asAdmin();
    const l = await lead({ createdAt: ago(200) });
    expect((await admin.agent.put('/api/admin/settings/inquiryRetention').send({ value: { months: 200 } })).status).toBe(400);
    expect((await admin.agent.put('/api/admin/settings/inquiryRetention').send({ value: { months: 6 } })).status).toBe(200);

    const s1 = await admin.agent.get('/api/admin/settings/inquiry-retention-status');
    expect(s1.status).toBe(200);
    expect(s1.body.settings.months).toBe(6);
    expect(s1.body.due).toBe(1);
    expect(s1.body.lastRun).toBeNull();

    await runInquiryRetention();
    expect((await prisma.inquiry.findUniqueOrThrow({ where: { id: l.id } })).anonymizedAt).not.toBeNull();
    const s2 = await admin.agent.get('/api/admin/settings/inquiry-retention-status');
    expect(s2.body.lastRun.anonymized).toBe(1);
    expect(s2.body.anonymizedTotal).toBe(1);

    const staff = await asStaff();
    expect((await staff.agent.get('/api/admin/settings/inquiry-retention-status')).status).toBe(403);
  });
});

describe('inquiries in the privacy tools', () => {
  it('admin export + erase by e-mail (case-insensitive), audited', async () => {
    const admin = await asAdmin();
    const a = await lead({ email: 'person@example.com', status: 'NEW', createdAt: ago(1) });
    const b = await lead({ email: 'Person@Example.com', status: 'IN_PROGRESS', createdAt: ago(2) });
    const other = await lead({ email: 'someone@example.com', status: 'NEW', createdAt: ago(1) });

    const exp = await admin.agent.get('/api/admin/privacy/inquiries?email=PERSON@example.com');
    expect(exp.status).toBe(200);
    expect(exp.body.items.map((i: { id: string }) => i.id).sort()).toEqual([a.id, b.id].sort());
    expect(exp.body.items[0]).not.toHaveProperty('staffNotes');

    const er = await admin.agent.post('/api/admin/privacy/inquiries/erase').send({ email: 'person@example.com' });
    expect(er.status).toBe(200);
    expect(er.body.anonymized).toBe(2);
    expect((await prisma.inquiry.findUniqueOrThrow({ where: { id: a.id } })).contactName).toBe('—');
    expect((await prisma.inquiry.findUniqueOrThrow({ where: { id: other.id } })).anonymizedAt).toBeNull();
    expect(await prisma.auditLog.count({ where: { action: 'PRIVACY_INQUIRIES_ERASED' } })).toBe(1);
    expect((await admin.agent.get('/api/admin/privacy/inquiries?email=person@example.com')).body.items).toHaveLength(0);

    const staff = await asStaff();
    expect((await staff.agent.post('/api/admin/privacy/inquiries/erase').send({ email: 'someone@example.com' })).status).toBe(403);
  });

  it('privacy request detail lists the inquiries of the requester e-mail', async () => {
    const admin = await asAdmin();
    await lead({ email: 'req@example.com', status: 'NEW', createdAt: ago(1) });
    const r = await anon().post('/api/privacy/public-request').set('Origin', 'http://localhost:5173').send({ type: 'EXPORT', email: 'req@example.com', name: 'Req Person', message: 'export please' });
    expect([200, 201]).toContain(r.status);
    const pr = await prisma.privacyRequest.findFirstOrThrow({ where: { email: 'req@example.com' } });
    const d = await admin.agent.get(`/api/admin/privacy/requests/${pr.id}`);
    expect(d.status).toBe(200);
    expect(d.body.inquiries).toHaveLength(1);
    expect(d.body.inquiries[0].contactName).toBe('Lead Person');
  });

  it('the user data export contains the inquiries of the account e-mail; account deletion anonymises them', async () => {
    const client = await asClient();
    const mine = await lead({ email: client.user.email, status: 'NEW', createdAt: ago(1) });
    const data = await buildUserExport(client.user.id);
    expect(data.inquiries.map((i) => i.id)).toEqual([mine.id]);

    const sa = await asSuperAdmin();
    const staff = await asStaff();
    const owned = await lead({ status: 'NEW', createdAt: ago(1), assignedStaffId: staff.user.id, assignedAt: new Date() });
    const res = await deleteUserAccount(sa.user.id, client.user.id);
    expect(res.counts.inquiriesAnonymized).toBe(1);
    expect((await prisma.inquiry.findUniqueOrThrow({ where: { id: mine.id } })).anonymizedAt).not.toBeNull();

    await deleteUserAccount(sa.user.id, staff.user.id);
    expect((await prisma.inquiry.findUniqueOrThrow({ where: { id: owned.id } })).assignedStaffId).toBeNull();
    expect(await eraseInquiries('nobody@example.com')).toBe(0);
  });
});
