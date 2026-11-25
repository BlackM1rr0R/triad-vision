import { describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { auditsSettled } from '../../src/lib/audit.js';
import { applyInput, createExternalApplication } from '../../src/lib/germanyJobs/apply.js';
import { setAutoSendSettings } from '../../src/lib/germanyJobs/autoSettings.js';
import { matchEmployerReply } from '../../src/lib/germanyJobs/replies.js';
import { EMPLOYER_CATEGORY, handleInboundReport, refreshSendHealth } from '../../src/lib/deliverability/service.js';
import { clearAgencyMailboxCache, flushAgencyInbound, onAgencyInbound } from '../../src/lib/deliverability/inbound.js';

/**
 * E-mail deliverability (Admin → E-poçt göndərişi) and employer answers to earlier automatic applications: ADMIN-only
 * endpoints, bounce reports → suppression list, automatic daily-limit reduction, reply matching by Message-ID through
 * the mail-sync hook, staff one-click status. The automatic sending itself is retired (the candidate applies to
 * external listings directly), so the "sent" applications are seeded as the history rows they now are.
 * Tests run without SMTP (CONSOLE).
 */

const EMPLOYER = 'bewerbung@nord-logistik.de';

const fields = (o: Record<string, string> = {}) => ({
  provider: 'link',
  listingUrl: 'https://karriere.nord-logistik.de/jobs/berufskraftfahrer-ce',
  listingTitle: 'Berufskraftfahrer CE (m/w/d)',
  listingCompany: 'Nord Logistik GmbH',
  listingLocation: 'Hamburg',
  jobType: 'job',
  name: 'Əli Məmmədov',
  email: 'ali@example.com',
  phone: '050 123 45 67',
  germanLevel: 'B1',
  profession: 'Kraftfahrer',
  experienceYears: '6',
  message: `Aus der Anzeige: Bewerbungen bitte an ${EMPLOYER}`,
  consent: 'true',
  forwardConsent: 'true',
  lng: 'az',
  ...o,
});

const readyClient = async () => {
  const client = await asClient({ email: 'ali@example.com', firstName: 'Əli', lastName: 'Məmmədov', phone: '+994501234567' });
  await prisma.user.update({ where: { id: client.user.id }, data: { passportNumber: 'C01234567', germanLevel: 'B1', profession: 'Berufskraftfahrer' } });
  await client.agent.put('/api/cv').send({ data: { headline: 'Berufskraftfahrer', experience: [{ title: 'Kraftfahrer', employer: 'Azərsun', from: '2019-01', to: null }], drivingLicences: ['CE'] } }).expect(200);
  await client.agent.post('/api/cv/lebenslauf').send({}).expect(201);
  return client;
};

/** An earlier application that was sent to the employer before the retirement (history row). */
const seedSent = async (userId: string) => {
  const q = await createExternalApplication(applyInput.parse(fields()), { phone: '+994501234567', lng: 'az', cv: null, userId, partnerId: null, accountLabel: null });
  const sentAt = new Date(Date.now() - 60 * 60 * 1000);
  const app = await prisma.externalJobApplication.update({
    where: { inquiryId: q.id },
    data: { status: 'FORWARDED', statusChangedAt: sentAt, autoState: 'SENT', autoSentAt: sentAt, autoSentMode: 'AUTO', employerEmail: EMPLOYER, autoMessageId: `xapp.${q.id}@triad-vision.de` },
  });
  return { inquiryId: q.id, id: app.id, messageId: app.autoMessageId! };
};

describe('Admin → E-poçt göndərişi', () => {
  it('is ADMIN+ only; suppression list add / remove is audited', async () => {
    const staff = await asStaff();
    await staff.agent.get('/api/admin/email-delivery').expect(403);
    await staff.agent.get('/api/admin/email-delivery/dns').expect(403);
    await staff.agent.post('/api/admin/email-delivery/suppressions').send({ address: 'x@y.de' }).expect(403);

    const admin = await asAdmin();
    await prisma.emailLog.createMany({
      data: [
        { to: 'a@firma.de', toDomain: 'firma.de', subject: 'Bewerbung', status: 'SENT', category: EMPLOYER_CATEGORY },
        { to: 'b@firma.de', toDomain: 'firma.de', subject: 'Bewerbung', status: 'FAILED', responseCode: 550, error: '550 5.1.1 User unknown', category: EMPLOYER_CATEGORY },
      ],
    });
    const ov = await admin.agent.get('/api/admin/email-delivery').expect(200);
    expect(ov.body.domains).toEqual(expect.arrayContaining([expect.objectContaining({ domain: 'firma.de', sent: 1, failed: 1 })]));
    expect(ov.body.failures[0]).toMatchObject({ to: 'b@firma.de', responseCode: 550 });
    expect(ov.body.autoSend).toMatchObject({ dailyLimit: 30, effectiveLimit: 30 });

    await admin.agent.post('/api/admin/email-delivery/suppressions').send({ address: 'not-an-email' }).expect(400);
    const add = await admin.agent.post('/api/admin/email-delivery/suppressions').send({ address: 'Spam@Firma.de', note: 'requested' }).expect(201);
    expect(await prisma.emailSuppression.findUniqueOrThrow({ where: { address: 'spam@firma.de' } })).toMatchObject({ reason: 'MANUAL', createdById: admin.user.id });
    await admin.agent.delete(`/api/admin/email-delivery/suppressions/${add.body.id}`).expect(200);
    expect(await prisma.emailSuppression.count()).toBe(0);
    await auditsSettled();
    expect(await prisma.auditLog.count({ where: { action: { in: ['EMAIL_SUPPRESSION_ADDED', 'EMAIL_SUPPRESSION_REMOVED'] } } })).toBe(2);
  });
});

describe('bounces', () => {
  it('a hard bounce suppresses the address (stored once)', async () => {
    const handled = await handleInboundReport({
      rfcMessageId: 'dsn-1@mx.example',
      fromAddr: 'MAILER-DAEMON@mx.example',
      subject: 'Undelivered Mail Returned to Sender',
      text: null,
      contentType: 'multipart/report; report-type=delivery-status',
      parts: [{ contentType: 'message/delivery-status', content: `Final-Recipient: rfc822; ${EMPLOYER}\nAction: failed\nStatus: 5.1.1\nDiagnostic-Code: smtp; 550 5.1.1 User unknown` }],
    });
    expect(handled).toBe(true);
    // The same report synced by a second mailbox is stored once.
    await handleInboundReport({ rfcMessageId: 'dsn-1@mx.example', fromAddr: 'MAILER-DAEMON@mx.example', subject: 'Undelivered', text: null, contentType: 'multipart/report; report-type=delivery-status', parts: [{ contentType: 'message/delivery-status', content: `Final-Recipient: rfc822; ${EMPLOYER}\nAction: failed\nStatus: 5.1.1` }] });
    expect(await prisma.emailBounce.count()).toBe(1);
    expect(await prisma.emailSuppression.findUniqueOrThrow({ where: { address: EMPLOYER } })).toMatchObject({ reason: 'HARD_BOUNCE' });
  });

  it('more than 5 % hard bounces in 7 days halves the daily limit (shown in the auto-send panel)', async () => {
    const admin = await asAdmin();
    await prisma.emailLog.createMany({ data: Array.from({ length: 20 }, (_, i) => ({ to: `hr${i}@firma${i}.de`, toDomain: `firma${i}.de`, subject: 'Bewerbung', status: 'SENT', category: EMPLOYER_CATEGORY })) });
    await prisma.emailBounce.createMany({ data: [0, 1].map((i) => ({ address: `hr${i}@firma${i}.de`, kind: 'HARD', status: '5.1.1', source: 'DSN', reportMessageId: `r${i}@x` })) });
    const h = await refreshSendHealth();
    expect(h).toMatchObject({ factor: 0.5, reason: 'BOUNCES' });
    const ov = await admin.agent.get('/api/admin/external-applications/auto/overview').expect(200);
    expect(ov.body.today).toMatchObject({ limit: 15, configured: 30 });
    expect(ov.body.health.factor).toBe(0.5);
    await admin.agent.post('/api/admin/email-delivery/health/reset').expect(200);
    expect((await admin.agent.get('/api/admin/external-applications/auto/overview').expect(200)).body.today.limit).toBe(30);
  });
});

describe('employer answers', () => {
  it('an earlier sent application: matches the answer by Message-ID from the agency mailbox, suggests a status; staff apply it once', async () => {
    await setAutoSendSettings({ replyTo: 'info@triad-vision.de' });
    clearAgencyMailboxCache();
    const client = await readyClient();
    const s = await seedSent(client.user.id);
    const app = { autoMessageId: s.messageId };

    // The agency mailbox, as the workspace mail sync stores it.
    const admin = await asAdmin();
    const account = await prisma.mailAccount.create({ data: { userId: admin.user.id, email: 'info@triad-vision.de', imapHost: 'imap.test', smtpHost: 'smtp.test', username: 'info', passwordEnc: 'x' } });
    const folder = await prisma.mailFolder.create({ data: { accountId: account.id, path: 'INBOX', name: 'INBOX', role: 'INBOX' } });
    const msg = await prisma.mailMessage.create({
      data: {
        accountId: account.id,
        folderId: folder.id,
        uid: BigInt(1),
        messageId: 'answer-1@nord-logistik.de',
        inReplyTo: app.autoMessageId,
        subject: 'AW: Bewerbung als Berufskraftfahrer',
        fromAddr: 'personal@nord-logistik.de',
        fromName: 'Personalabteilung',
        toList: [{ name: '', address: 'info@triad-vision.de' }],
        date: new Date(),
        text: 'Guten Tag, wir laden Herrn Məmmədov gerne zu einem Vorstellungsgespräch ein. Passt ein Termin am Dienstag?',
      },
    });
    // A mailbox that is not an agency mailbox is ignored.
    onAgencyInbound({ email: 'someone@triad-vision.de' }, [{ id: msg.id }]);
    await flushAgencyInbound();
    expect(await prisma.externalJobApplicationReply.count()).toBe(0);
    onAgencyInbound(account, [{ id: msg.id }]);
    onAgencyInbound(account, [{ id: msg.id }]); // second mailbox / second run: stored once
    await flushAgencyInbound();
    const reply = await prisma.externalJobApplicationReply.findFirstOrThrow({ where: { applicationId: s.id } });
    expect(reply).toMatchObject({ matchedBy: 'MESSAGE_ID', classification: 'INTERVIEW', suggestedStatus: 'INTERVIEW', resolution: null });
    expect(await prisma.externalJobApplicationReply.count()).toBe(1);
    expect(await prisma.notification.count({ where: { userId: admin.user.id, type: 'EXTERNAL_JOB_REPLY' } })).toBe(1);
    // Never changed by itself.
    expect((await prisma.externalJobApplication.findUniqueOrThrow({ where: { id: s.id } })).status).toBe('FORWARDED');

    const staff = await asStaff();
    const view = await staff.agent.get(`/api/admin/external-applications/${s.inquiryId}`).expect(200);
    expect(view.body.replies).toEqual([expect.objectContaining({ id: reply.id, classification: 'INTERVIEW', suggestedStatus: 'INTERVIEW' })]);
    // The client never sees the employer's mail.
    const own = await client.agent.get('/api/external-applications').expect(200);
    expect(JSON.stringify(own.body ?? {})).not.toContain('Vorstellungsgespräch ein');

    const done = await staff.agent.post(`/api/admin/external-applications/${s.inquiryId}/replies/${reply.id}`).send({ action: 'APPLY' }).expect(200);
    expect(done.body.status).toBe('INTERVIEW');
    expect(done.body.replies[0]).toMatchObject({ resolution: 'APPLIED' });
    await staff.agent.post(`/api/admin/external-applications/${s.inquiryId}/replies/${reply.id}`).send({ action: 'KEEP' }).expect(400);
    expect(await prisma.externalJobApplicationEvent.count({ where: { applicationId: s.id, status: 'INTERVIEW' } })).toBe(1);
  });

  it('domain fallback needs the listing title or the candidate name; "keep" leaves the status', async () => {
    const client = await readyClient();
    const s = await seedSent(client.user.id);
    const base = { rfcMessageId: null, inReplyTo: null, refs: null, fromName: null, date: new Date() };
    expect(await matchEmployerReply({ ...base, mailMessageId: 'm1', fromAddr: 'hr@nord-logistik.de', subject: 'Hallo', text: 'Danke.' })).toBeNull();
    const id = await matchEmployerReply({ ...base, mailMessageId: 'm2', fromAddr: 'hr@nord-logistik.de', subject: 'Ihre Bewerbung: Berufskraftfahrer CE (m/w/d)', text: 'Leider müssen wir Ihnen eine Absage erteilen.' });
    expect(id).not.toBeNull();
    const reply = await prisma.externalJobApplicationReply.findUniqueOrThrow({ where: { id: id! } });
    expect(reply).toMatchObject({ matchedBy: 'DOMAIN', classification: 'REJECTION', suggestedStatus: 'REJECTED' });

    const staff = await asStaff();
    const kept = await staff.agent.post(`/api/admin/external-applications/${s.inquiryId}/replies/${reply.id}`).send({ action: 'KEEP' }).expect(200);
    expect(kept.body.status).toBe('FORWARDED');
    expect(kept.body.replies[0]).toMatchObject({ resolution: 'KEPT' });
  });
});
