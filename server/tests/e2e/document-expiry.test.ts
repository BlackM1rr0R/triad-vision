import { beforeEach, describe, expect, it, vi } from 'vitest';

// A fake language file makes OCR "available"; tesseract itself is replaced and returns the text set by the test.
await vi.hoisted(async () => {
  const [fs, os, path] = await Promise.all([import('node:fs'), import('node:os'), import('node:path')]);
  const dir = path.join(os.tmpdir(), 'triad-vision-test-ocr-fake-expiry');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'eng.traineddata'), 'fake');
  process.env.TESSERACT_LANG_PATH = dir;
});
const ocr = vi.hoisted(() => ({ text: '' }));
vi.mock('tesseract.js', () => ({
  createWorker: async () => ({
    setParameters: async () => undefined,
    recognize: async () => ({ data: { text: ocr.text, confidence: 90 } }),
    terminate: async () => undefined,
  }),
  OEM: { LSTM_ONLY: 1 },
  PSM: { SINGLE_BLOCK: '6', SPARSE_TEXT: '11', AUTO: '3' },
}));

import type { Prisma } from '@prisma/client';
import { anon, asAdmin, asClient, asStaff, type Agent } from '../helpers/api';
import { prisma, settle, waitFor } from '../helpers/db';
import { makePdf, PDF } from '../helpers/files';
import { clientCase, createCaseVia, expectStatus } from '../helpers/workflow';
import { buildMrz, fakePng } from './passport-scan.fixtures';
import { ocrDocument } from '../../src/lib/docsIntel/ocr.js';
import { backfillDocumentExpiry, fillExpiryFromOcr, listExpiring } from '../../src/lib/expiry/index.js';
import { runExpiryDigest, runExpiryJob, runExpiryReminders } from '../../src/jobs/expiry.js';
import { runPassportReminders } from '../../src/jobs/reminders.js';
import { registeredJobs } from '../../src/lib/scheduler.js';

const DAY = 24 * 60 * 60 * 1000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const midnight = (d: Date) => new Date(`${isoDay(d)}T00:00:00Z`);
/** A UTC moment on the same UTC date as `d`, at the given Baku (UTC+4) hour. */
const atBakuHour = (d: Date, hour: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour - 4, 0, 0));

beforeEach(async () => {
  ocr.text = '';
  await prisma.reminderLog.deleteMany();
});

type Req = { id: string; key: string | null; stage: string; title: { az: string; en: string } };
const reqByKey = async (agent: Agent, caseId: string, key: string) =>
  (await clientCase(agent, caseId)).requirements.find((r) => (r as unknown as Req).key === key) as unknown as Req;

const uploadTo = async (agent: Agent, caseId: string, requirementId: string, file?: Buffer, name = 'doc.pdf', contentType = 'application/pdf') =>
  expectStatus(
    await agent
      .post(`/api/cases/${caseId}/documents`)
      .field('requirementId', requirementId)
      .attach('file', file ?? (await makePdf('doc')), { filename: name, contentType }),
    201,
  ).body.document as { id: string };

/** A client with an open case, its passport and a second (non-passport) requirement. */
const setup = async (opts: { locale?: 'az' | 'de' | 'en' | 'ru' } = {}) => {
  const client = await asClient({ locale: opts.locale ?? 'en' });
  const c = await createCaseVia(client.agent);
  const passport = await reqByKey(client.agent, c.id, 'PASSPORT');
  const all = (await clientCase(client.agent, c.id)).requirements as unknown as Req[];
  const other = all.find((r) => r.stage === 'INITIAL' && r.key !== 'PASSPORT' && r.key !== 'PHOTO')!;
  return { client, c, passport, other };
};

const notes = (userId: string, type: string) => prisma.notification.findMany({ where: { userId, type }, orderBy: { createdAt: 'asc' } });

describe('scheduler', () => {
  it('registers the document-expiry job', () => {
    expect(registeredJobs()).toContain('document-expiry');
  });
});

// ─── Filling Document.expiresAt ─────────────────────────────────────────

describe('expiry date from OCR, vault and backfill', () => {
  it('a valid MRZ read by the OCR fills an empty expiry date, but never overwrites one set by staff', async () => {
    const { client, c, passport } = await setup();
    const expiry = isoDay(new Date(Date.now() + 4 * 365 * DAY));
    ocr.text = buildMrz({ surname: 'ALIYEV', given: 'RAMIL', docNo: 'C01234567', birth: '1990-05-14', expiry }).join('\n');
    const doc = await uploadTo(client.agent, c.id, passport.id, fakePng(1600, 1100), 'passport.png', 'image/png');
    await ocrDocument(doc.id, { timeoutMs: 5_000 });
    const row = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(isoDay(row.expiresAt!)).toBe(expiry);

    // Staff corrected the date: a later OCR run keeps it.
    await prisma.document.update({ where: { id: doc.id }, data: { expiresAt: new Date('2031-01-01T00:00:00Z') } });
    await ocrDocument(doc.id, { timeoutMs: 5_000 });
    expect(isoDay((await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })).expiresAt!)).toBe('2031-01-01');
  });

  it('ignores an MRZ whose expiry check digit is wrong', async () => {
    const { client, c, passport } = await setup();
    const doc = await uploadTo(client.agent, c.id, passport.id);
    expect(await fillExpiryFromOcr(doc.id, { mrz: { expiryDate: '2030-01-01', valid: false, checks: { expiryDate: false } } })).toBeNull();
    expect(await fillExpiryFromOcr(doc.id, { mrz: { expiryDate: '2030-01-01', valid: true } })).not.toBeNull();
    expect(isoDay((await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })).expiresAt!)).toBe('2030-01-01');
  });

  it('a case document copied from the vault takes the vault expiry date', async () => {
    const { client, c, passport } = await setup();
    const expiresAt = isoDay(new Date(Date.now() + 400 * DAY));
    const v = expectStatus(
      await client.agent.post('/api/vault').field('kind', 'PASSPORT').field('title', 'Pass').field('expiresAt', expiresAt).attach('file', await makePdf('vault'), { filename: 'p.pdf', ...PDF }),
      201,
    ).body.document;
    const used = expectStatus(await client.agent.post(`/api/vault/${v.id}/use`).send({ caseId: c.id, requirementId: passport.id }), 201).body.document;
    expect(isoDay((await prisma.document.findUniqueOrThrow({ where: { id: used.id } })).expiresAt!)).toBe(expiresAt);
  });

  it('backfills open-case documents from stored OCR / checks / vault, skipping closed cases', async () => {
    const { client, c, passport, other } = await setup();
    const a = await uploadTo(client.agent, c.id, passport.id);
    const b = await uploadTo(client.agent, c.id, other.id);
    await prisma.document.update({ where: { id: a.id }, data: { ocrAt: new Date(), ocr: { mrz: { expiryDate: '2029-09-09', valid: true } } as Prisma.InputJsonValue } });
    await prisma.document.update({
      where: { id: b.id },
      data: { checkedAt: new Date(), checks: { level: 'warn', at: new Date().toISOString(), issues: [{ code: 'PASSPORT_EXPIRES_SOON', level: 'warn', params: { expiryDate: '2027-03-03' } }] } as Prisma.InputJsonValue },
    });
    const closed = await setup();
    const z = await uploadTo(closed.client.agent, closed.c.id, closed.passport.id);
    await prisma.document.update({ where: { id: z.id }, data: { ocrAt: new Date(), ocr: { mrz: { expiryDate: '2029-09-09', valid: true } } as Prisma.InputJsonValue } });
    await prisma.case.update({ where: { id: closed.c.id }, data: { status: 'CANCELLED' } });

    expect(await backfillDocumentExpiry()).toBe(2);
    expect(isoDay((await prisma.document.findUniqueOrThrow({ where: { id: a.id } })).expiresAt!)).toBe('2029-09-09');
    expect(isoDay((await prisma.document.findUniqueOrThrow({ where: { id: b.id } })).expiresAt!)).toBe('2027-03-03');
    expect((await prisma.document.findUniqueOrThrow({ where: { id: z.id } })).expiresAt).toBeNull();
    expect(await backfillDocumentExpiry()).toBe(0);
  });
});

// ─── Manual set (staff) ─────────────────────────────────────────────────

describe('PATCH /api/admin/cases/:caseId/documents/:docId/expiry', () => {
  it('staff set and clear the date (audited); clients and anonymous users cannot', async () => {
    const { client, c, other } = await setup();
    const doc = await uploadTo(client.agent, c.id, other.id);
    const url = `/api/admin/cases/${c.id}/documents/${doc.id}/expiry`;
    expect((await anon().patch(url).send({ expiresAt: '2030-01-01' })).status).toBe(401);
    expect((await client.agent.patch(url).send({ expiresAt: '2030-01-01' })).status).toBe(403);

    const staff = await asStaff();
    const set = expectStatus(await staff.agent.patch(url).send({ expiresAt: '2030-01-01' }), 200);
    expect(set.body.document.expiresAt).toBe('2030-01-01T00:00:00.000Z');
    const log = await prisma.auditLog.findFirst({ where: { action: 'DOCUMENT_EXPIRY_SET', target: doc.id } });
    expect(log?.actorId).toBe(staff.user.id);
    expect(log?.details).toMatchObject({ caseId: c.id, from: null, to: '2030-01-01' });

    // The admin case view carries the date.
    const detail = expectStatus(await staff.agent.get(`/api/admin/cases/${c.id}`), 200).body.case;
    const row = detail.requirements.flatMap((r: { documents: { id: string; expiresAt: string | null }[] }) => r.documents).find((d: { id: string }) => d.id === doc.id);
    expect(row.expiresAt).toBe('2030-01-01T00:00:00.000Z');

    // A changed date restarts its reminders.
    await prisma.document.update({ where: { id: doc.id }, data: { expiryRemindedAt: new Date() } });
    expectStatus(await staff.agent.patch(url).send({ expiresAt: '2030-02-01' }), 200);
    expect((await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })).expiryRemindedAt).toBeNull();

    expect(expectStatus(await staff.agent.patch(url).send({ expiresAt: null }), 200).body.document.expiresAt).toBeNull();
  });

  it('validates the date and the document/case pair', async () => {
    const { client, c, other } = await setup();
    const doc = await uploadTo(client.agent, c.id, other.id);
    const second = await setup();
    const staff = await asStaff();
    for (const bad of ['2030-02-30', '01.02.2030', '', 'x']) {
      expect((await staff.agent.patch(`/api/admin/cases/${c.id}/documents/${doc.id}/expiry`).send({ expiresAt: bad })).status, bad).toBe(400);
    }
    expect((await staff.agent.patch(`/api/admin/cases/${second.c.id}/documents/${doc.id}/expiry`).send({ expiresAt: '2030-01-01' })).status).toBe(404);
    expect((await staff.agent.patch(`/api/admin/cases/${c.id}/documents/nope/expiry`).send({ expiresAt: '2030-01-01' })).status).toBe(404);
  });
});

// ─── Reminders ──────────────────────────────────────────────────────────

describe('expiry reminders', () => {
  it('passport: 6 / 3 / 1 month windows, one reminder each, to the client (in-app + e-mail) and the assigned staff (in-app)', async () => {
    const { client, c, passport } = await setup({ locale: 'en' });
    const staff = await asStaff({ locale: 'de' });
    await prisma.case.update({ where: { id: c.id }, data: { assignedStaffId: staff.user.id } });
    const expiry = midnight(new Date(Date.now() + 400 * DAY));
    const doc = await uploadTo(client.agent, c.id, passport.id);
    await prisma.document.update({ where: { id: doc.id }, data: { expiresAt: expiry } });
    const at = (daysBefore: number) => new Date(expiry.getTime() - daysBefore * DAY + 3600_000);

    expect(await runExpiryReminders(at(200))).toBe(0);
    expect(await runExpiryReminders(at(175))).toBe(1);
    expect(await runExpiryReminders(at(175))).toBe(0);
    expect(await runExpiryReminders(at(120))).toBe(0);
    expect(await runExpiryReminders(at(85))).toBe(1);
    expect(await runExpiryReminders(at(60))).toBe(0);
    expect(await runExpiryReminders(at(25))).toBe(1);
    expect(await runExpiryReminders(at(10))).toBe(0);

    const sent = await notes(client.user.id, 'DOCUMENT_EXPIRY');
    expect(sent).toHaveLength(3);
    expect(sent[0].title).toMatch(/^Document expiring: /);
    expect(sent[0].body).toContain(c.number);
    expect(sent[0].body).toContain('Schengen');
    expect(sent[0].link).toBe(`/account/cases/${c.id}`);
    await waitFor(() => prisma.emailLog.findFirst({ where: { to: client.user.email, subject: `Triad Vision · ${sent[0].title}` } }));

    const staffNotes = await notes(staff.user.id, 'DOCUMENT_EXPIRY_STAFF');
    expect(staffNotes).toHaveLength(3);
    expect(staffNotes[0].title).toContain(c.number);
    expect(staffNotes[0].link).toBe(`/admin/cases/${c.id}`);
    await settle();
    expect(await prisma.emailLog.count({ where: { to: staff.user.email } })).toBe(0);

    // Expired: one more (last) notice.
    expect(await runExpiryReminders(new Date(expiry.getTime() + 2 * DAY))).toBe(1);
    expect(await runExpiryReminders(new Date(expiry.getTime() + 9 * DAY))).toBe(0);
    expect((await notes(client.user.id, 'DOCUMENT_EXPIRY')).at(-1)!.title).toMatch(/^Document expired: /);
  });

  it('other documents: 60 / 30 / 7 days; entering late only sends the narrowest window; texts in the client locale', async () => {
    const { client, c, other } = await setup({ locale: 'de' });
    const expiry = midnight(new Date(Date.now() + 100 * DAY));
    const doc = await uploadTo(client.agent, c.id, other.id);
    await prisma.document.update({ where: { id: doc.id }, data: { expiresAt: expiry } });
    const at = (daysBefore: number) => new Date(expiry.getTime() - daysBefore * DAY + 3600_000);

    expect(await runExpiryReminders(at(70))).toBe(0);
    expect(await runExpiryReminders(at(20))).toBe(1); // late: 30-day window only
    expect(await runExpiryReminders(at(15))).toBe(0);
    expect(await runExpiryReminders(at(5))).toBe(1);
    const sent = await notes(client.user.id, 'DOCUMENT_EXPIRY');
    expect(sent).toHaveLength(2);
    expect(sent[0].title).toMatch(/^Dokument läuft ab: /);
    expect(sent[0].body).not.toContain('Schengen');
  });

  it('skips closed cases, rejected and replaced uploads; a new expiry date gets fresh reminders', async () => {
    const { client, c, other } = await setup();
    const expiry = midnight(new Date(Date.now() + 20 * DAY));
    const first = await uploadTo(client.agent, c.id, other.id);
    const second = await uploadTo(client.agent, c.id, other.id); // replaces the first
    await prisma.document.updateMany({ where: { id: { in: [first.id, second.id] } }, data: { expiresAt: expiry } });
    expect(await runExpiryReminders()).toBe(1);
    expect((await prisma.document.findUniqueOrThrow({ where: { id: first.id } })).expiryRemindedAt).toBeNull();

    // Rejected → nothing more (and the older upload does not take over).
    await prisma.document.update({ where: { id: second.id }, data: { status: 'REJECTED', expiresAt: midnight(new Date(Date.now() + 3 * DAY)), expiryRemindedAt: null } });
    await prisma.document.update({ where: { id: first.id }, data: { status: 'REJECTED' } });
    expect(await runExpiryReminders()).toBe(0);

    // Closed case → nothing.
    const closed = await setup();
    const d = await uploadTo(closed.client.agent, closed.c.id, closed.other.id);
    await prisma.document.update({ where: { id: d.id }, data: { expiresAt: expiry } });
    await prisma.case.update({ where: { id: closed.c.id }, data: { status: 'APPROVED' } });
    expect(await runExpiryReminders()).toBe(0);

    // Staff correct the date through the API → reminders restart.
    const open = await setup();
    const e = await uploadTo(open.client.agent, open.c.id, open.other.id);
    const staff = await asStaff();
    const url = `/api/admin/cases/${open.c.id}/documents/${e.id}/expiry`;
    expectStatus(await staff.agent.patch(url).send({ expiresAt: isoDay(new Date(Date.now() + 5 * DAY)) }), 200);
    expect(await runExpiryReminders()).toBe(1);
    expect(await runExpiryReminders()).toBe(0);
    expectStatus(await staff.agent.patch(url).send({ expiresAt: isoDay(new Date(Date.now() + 6 * DAY)) }), 200);
    expect(await runExpiryReminders()).toBe(1);
  });

  it('the old profile passport reminder skips clients whose passport is tracked on a case document', async () => {
    const { client, c, passport } = await setup();
    const soon = midnight(new Date(Date.now() + 60 * DAY));
    await prisma.user.update({ where: { id: client.user.id }, data: { passportExpiry: soon } });
    const doc = await uploadTo(client.agent, c.id, passport.id);
    await prisma.document.update({ where: { id: doc.id }, data: { expiresAt: soon } });
    await runPassportReminders();
    expect(await notes(client.user.id, 'PASSPORT_EXPIRY')).toHaveLength(0);
    await runExpiryReminders();
    expect(await notes(client.user.id, 'DOCUMENT_EXPIRY')).toHaveLength(1);

    // Without a tracked document the profile reminder still works.
    const other = await asClient();
    await prisma.user.update({ where: { id: other.user.id }, data: { passportExpiry: soon } });
    await runPassportReminders();
    expect(await notes(other.user.id, 'PASSPORT_EXPIRY')).toHaveLength(1);
  });
});

// ─── List + digest ──────────────────────────────────────────────────────

describe('/api/admin/expiring and the daily digest', () => {
  it('lists case and vault documents with filters; staff only', async () => {
    const { client, c, passport, other } = await setup();
    const staff = await asStaff();
    await prisma.case.update({ where: { id: c.id }, data: { assignedStaffId: staff.user.id } });
    const p = await uploadTo(client.agent, c.id, passport.id);
    const o = await uploadTo(client.agent, c.id, other.id);
    await prisma.document.update({ where: { id: p.id }, data: { expiresAt: midnight(new Date(Date.now() + 20 * DAY)) } });
    await prisma.document.update({ where: { id: o.id }, data: { expiresAt: midnight(new Date(Date.now() + 75 * DAY)) } });
    await client.agent
      .post('/api/vault')
      .field('kind', 'LANGUAGE_CERT')
      .field('title', 'Goethe B1')
      .field('expiresAt', isoDay(new Date(Date.now() + 40 * DAY)))
      .attach('file', await makePdf('vault'), { filename: 'b1.pdf', ...PDF });

    expect((await client.agent.get('/api/admin/expiring')).status).toBe(403);
    expect((await staff.agent.get('/api/admin/expiring?days=45')).status).toBe(400);

    const d30 = expectStatus(await staff.agent.get('/api/admin/expiring'), 200).body;
    expect(d30.days).toBe(30);
    expect(d30.items).toHaveLength(1);
    expect(d30.items[0]).toMatchObject({ source: 'case', id: p.id, kind: 'passport', tone: 'urgent', case: { id: c.id, number: c.number }, staff: { id: staff.user.id } });
    expect(d30.items[0].daysLeft).toBeGreaterThanOrEqual(19);

    const d90 = expectStatus(await staff.agent.get('/api/admin/expiring?days=90'), 200).body.items;
    expect(d90.map((r: { source: string }) => r.source)).toEqual(['case', 'vault', 'case']);
    expect(d90[1]).toMatchObject({ document: 'Goethe B1', key: 'LANGUAGE_CERT', case: { id: c.id } });

    const other2 = await asStaff();
    expect(expectStatus(await staff.agent.get(`/api/admin/expiring?days=90&staffId=${other2.user.id}`), 200).body.items).toHaveLength(0);
    expect(expectStatus(await staff.agent.get('/api/admin/expiring?days=90&visaType=STUDY'), 200).body.items).toHaveLength(0);
    expect(expectStatus(await staff.agent.get('/api/admin/expiring?days=90&visaType=WORK'), 200).body.items).toHaveLength(3);
  });

  it('one digest e-mail per admin per day with documents expiring within 30 days, nothing when empty', async () => {
    const admin = await asAdmin({ locale: 'en' });
    const staff = await asStaff();
    const now = atBakuHour(new Date(), 10);

    expect(await runExpiryDigest(now)).toBe(0);
    await settle();
    expect(await prisma.emailLog.count({ where: { to: admin.user.email } })).toBe(0);

    const { client, c, other } = await setup();
    const doc = await uploadTo(client.agent, c.id, other.id);
    await prisma.document.update({ where: { id: doc.id }, data: { expiresAt: midnight(new Date(now.getTime() + 12 * DAY)) } });
    expect(await runExpiryDigest(atBakuHour(new Date(), 6))).toBe(0); // before 08:00 Baku
    expect(await runExpiryDigest(now)).toBe(1);
    expect(await runExpiryDigest(now)).toBe(0);
    const mail = await waitFor(() => prisma.emailLog.findFirst({ where: { to: admin.user.email } }));
    expect(mail.subject).toBe('Triad Vision · Documents expiring within 30 days (1)');
    expect(await prisma.emailLog.count({ where: { to: staff.user.email } })).toBe(0);
    const rows = await listExpiring({ days: 30, now, locale: 'en' });
    expect(rows[0]).toMatchObject({ client: { name: `${client.user.firstName} ${client.user.lastName}` }, case: { number: c.number } });
  });

  it('the hourly job runs backfill, reminders and digest without throwing', async () => {
    await expect(runExpiryJob(atBakuHour(new Date(), 10))).resolves.toBeUndefined();
  });
});
