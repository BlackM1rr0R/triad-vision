import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff } from '../helpers/api';
import { emailsTo, prisma } from '../helpers/db';
import { auditsSettled } from '../../src/lib/audit.js';
import { applyInput, createExternalApplication } from '../../src/lib/germanyJobs/apply.js';
import { lebenslaufPath } from '../../src/lib/cv/versions.js';
import { anonymizeInquiries } from '../../src/lib/privacy/inquiries.js';
import { buildUserExport } from '../../src/lib/privacy/export.js';
import { cvPdfText as pdfText } from '../unit/cvPdfText';
import { binaryParser } from '../helpers/files';

/**
 * Earlier "apply via Triad Vision" applications (the route is retired: the candidate applies to external listings
 * directly; rows are seeded as the history they are): My applications in the portal (own rows, linking by verified
 * e-mail, read-only), staff status with client notifications, Lebenslauf versions, the template-based Anschreiben
 * (staff + client, admin-managed templates, the generic letter for any listing). No AI anywhere.
 */

const fields = (o: Record<string, string> = {}) => ({
  provider: 'arbeitnow',
  externalId: 'arbeitnow:fahrer-hh',
  listingUrl: 'https://www.arbeitnow.com/jobs/companies/nord/fahrer-hh',
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
  consent: 'true',
  lng: 'de',
  ...o,
});

/** Direct insert of an earlier application (POST /api/germany-jobs/apply answers 410 now). */
const seed = async (o: Record<string, string> = {}, userId: string | null = null) => {
  const q = await createExternalApplication(applyInput.parse(fields(o)), { phone: '+994501234567', lng: 'de', cv: null, userId, partnerId: null, accountLabel: null });
  return { body: { id: q.id } };
};

const binary = (res: { body: unknown }) => res.body as Buffer;

describe('Lebenslauf versions', () => {
  it('saves numbered versions, only the owner can download or delete them', async () => {
    const client = await asClient({ email: 'ali@example.com', firstName: 'Əli', lastName: 'Məmmədov' });
    const other = await asClient();
    await client.agent.put('/api/cv').send({ data: { headline: 'Kraftfahrer', experience: [{ title: 'Kraftfahrer', employer: 'Azərsun', from: '2019-01', to: null }], drivingLicences: ['CE'], availableFrom: '2027-03' } }).expect(200);

    const v1 = await client.agent.post('/api/cv/lebenslauf').send({}).expect(201);
    const v2 = await client.agent.post('/api/cv/lebenslauf').send({ lang: 'de', photo: false }).expect(201);
    expect(v1.body.version.version).toBe(1);
    expect(v2.body.version.version).toBe(2);
    const list = await client.agent.get('/api/cv/lebenslauf').expect(200);
    expect(list.body.items.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    expect(list.body.latest.id).toBe(v2.body.version.id);

    const pdf = await client.agent.get(`/api/cv/lebenslauf/${v2.body.version.id}/pdf`).buffer(true).parse(binaryParser).expect(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(pdf.headers['content-disposition']).toContain('_v2.pdf');
    const text = await pdfText(binary(pdf));
    expect(text).toContain('Lebenslauf');
    expect(text).toContain('Berufserfahrung');
    expect(text).toContain('01/2019');
    expect(text).toContain('Məmmədov');

    expect((await other.agent.get(`/api/cv/lebenslauf/${v2.body.version.id}/pdf`)).status).toBe(404);
    expect((await other.agent.delete(`/api/cv/lebenslauf/${v2.body.version.id}`)).status).toBe(404);
    expect((await anon().get(`/api/cv/lebenslauf/${v2.body.version.id}/pdf`)).status).toBe(401);

    const versionRow = await prisma.lebenslaufVersion.findUniqueOrThrow({ where: { id: v2.body.version.id } });
    await client.agent.delete(`/api/cv/lebenslauf/${v2.body.version.id}`).expect(200);
    expect(fs.existsSync(lebenslaufPath(versionRow.storageKey))).toBe(false);
  });
});

describe('My applications (portal)', () => {
  it('lists own applications only and links earlier ones sent with the verified e-mail', async () => {
    const before = await seed(); // sent before signing in
    const otherMail = await seed({ email: 'someone@example.com' });
    const client = await asClient({ email: 'ali@example.com' });
    const other = await asClient({ email: 'someone@example.com', emailVerified: false });

    const list = await client.agent.get('/api/external-applications').expect(200);
    expect(list.body.linked).toBe(1);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({
      listingTitle: 'Berufskraftfahrer CE (m/w/d)',
      listingCompany: 'Nord Logistik GmbH',
      listingLocation: 'Hamburg',
      listingUrl: 'https://www.arbeitnow.com/jobs/companies/nord/fahrer-hh',
      status: 'SUBMITTED',
    });
    expect(list.body.items[0].timeline.map((s: { key: string; state: string }) => `${s.key}:${s.state}`)).toEqual(['SUBMITTED:current', 'FORWARDED:todo', 'INTERVIEW:todo', 'ANSWER:todo']);
    expect(list.body.items[0].cvStoredName).toBeUndefined();
    expect((await prisma.externalJobApplication.findUniqueOrThrow({ where: { inquiryId: before.body.id } })).userId).toBe(client.user.id);
    await auditsSettled();
    expect(await prisma.auditLog.count({ where: { action: 'EXTERNAL_JOB_APPLICATIONS_LINKED', actorId: client.user.id } })).toBe(1);

    // Unverified address: nothing is linked.
    const unverified = await other.agent.get('/api/external-applications').expect(200);
    expect(unverified.body.items).toHaveLength(0);
    expect((await prisma.externalJobApplication.findUniqueOrThrow({ where: { inquiryId: otherMail.body.id } })).userId).toBeNull();

    // Someone else's application id answers 404.
    const appId = list.body.items[0].id as string;
    expect((await other.agent.get(`/api/external-applications/${appId}/cover-letter`)).status).toBe(404);
    expect((await (await asStaff()).agent.get('/api/external-applications')).status).toBe(403);

    // Read-only history: nothing is forwarded, confirmed or escalated any more.
    for (const path of ['forward-consent', 'sent', 'help']) {
      const r = await client.agent.post(`/api/external-applications/${appId}/${path}`).send({});
      expect(r.status).toBe(410);
      expect(r.body.error).toBe('EXTERNAL_APPLY_DIRECT');
    }
    expect(list.body.items[0].auto.clientSend).toBeNull();
  });
});

describe('status set by staff', () => {
  it('records the event, audits, notifies the client in their language (in-app + e-mail)', async () => {
    const client = await asClient({ email: 'ali@example.com', locale: 'de' });
    const res = await seed({}, client.user.id);
    const staff = await asStaff();
    const url = `/api/admin/external-applications/${res.body.id}`;

    expect((await client.agent.post(`${url}/status`).send({ status: 'FORWARDED' })).status).toBe(403);
    expect((await staff.agent.post(`${url}/status`).send({ status: 'HIRED' })).status).toBe(400);
    const same = await staff.agent.post(`${url}/status`).send({ status: 'SUBMITTED' });
    expect(same.status).toBe(400);
    expect(same.body.error).toBe('STATUS_UNCHANGED');

    const fw = await staff.agent.post(`${url}/status`).send({ status: 'FORWARDED', note: 'An Frau Weber in der Personalabteilung geschickt.' }).expect(200);
    expect(fw.body).toMatchObject({ status: 'FORWARDED', statusNote: 'An Frau Weber in der Personalabteilung geschickt.' });
    expect(fw.body.events[0]).toMatchObject({ status: 'FORWARDED', by: `${staff.user.firstName} ${staff.user.lastName}` });

    const n = await prisma.notification.findFirstOrThrow({ where: { userId: client.user.id, type: 'EXTERNAL_APPLICATION_STATUS' } });
    expect(n.title).toBe('Bewerbung: An den Arbeitgeber weitergeleitet · Berufskraftfahrer CE (m/w/d)');
    expect(n.body).toContain('Hinweis: An Frau Weber');
    expect(n.link).toBe('/account/job-applications');
    const mails = await emailsTo('ali@example.com', 1); // the status e-mail
    expect(mails.some((m) => m.subject.includes('An den Arbeitgeber weitergeleitet'))).toBe(true);
    await auditsSettled();
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'EXTERNAL_JOB_APPLICATION_STATUS' } });
    expect(log).toMatchObject({ actorId: staff.user.id, target: `inquiry:${res.body.id}` });

    await staff.agent.post(`${url}/status`).send({ status: 'REJECTED' }).expect(200);
    const mine = await client.agent.get('/api/external-applications').expect(200);
    const item = mine.body.items[0];
    expect(item.status).toBe('REJECTED');
    expect(item.statusNote).toBeNull();
    expect(item.timeline.map((s: { state: string }) => s.state)).toEqual(['done', 'done', 'skipped', 'done']);
    expect(item.timeline[3].outcome).toBe('REJECTED');
    expect(item.events.map((e: { status: string }) => e.status)).toEqual(['FORWARDED', 'REJECTED']);
  });

  it('an application without an account: the e-mail goes to the address of the form', async () => {
    const res = await seed({ email: 'guest@example.com', lng: 'ru' });
    const admin = await asAdmin();
    await admin.agent.post(`/api/admin/external-applications/${res.body.id}/status`).send({ status: 'INTERVIEW', note: 'Звонок в пятницу' }).expect(200);
    const mails = await emailsTo('guest@example.com', 1);
    expect(mails.some((m) => m.subject === 'Triad Vision · Заявка: Собеседование · Berufskraftfahrer CE (m/w/d)')).toBe(true);
  });
});

describe('Anschreiben', () => {
  it('staff: draft from the detected template, edit, attach, PDF; anonymisation removes it', async () => {
    const client = await asClient({ email: 'ali@example.com', firstName: 'Əli', lastName: 'Məmmədov' });
    await client.agent.put('/api/cv').send({ data: { drivingLicences: ['B', 'C', 'CE'], availableFrom: '2099-03', languages: [{ language: 'Deutsch', level: 'B1' }] } }).expect(200);
    const res = await seed({}, client.user.id);
    const staff = await asStaff();
    const url = `/api/admin/external-applications/${res.body.id}`;

    const d = await staff.agent.get(`${url}/cover-letter/draft`).expect(200);
    expect(d.body.draft.jobType).toBe('FAHRER');
    expect(d.body.draft.subject).toBe('Bewerbung als Berufskraftfahrer CE');
    expect(d.body.draft.body).toContain('bei Nord Logistik GmbH um die Stelle als Berufskraftfahrer CE in Hamburg');
    expect(d.body.draft.body).toContain('Führerscheinklassen B, C, CE');
    expect(d.body.draft.body).toContain('sechs Jahre Berufserfahrung');
    expect(d.body.draft.body).toContain('ab März 2099');
    expect(d.body.draft.body).toMatch(/Mit freundlichen Grüßen\n\nƏli Məmmədov$/);
    expect(d.body.draft.templates).toHaveLength(7);
    const general = await staff.agent.get(`${url}/cover-letter/draft?jobType=GENERAL`).expect(200);
    expect(general.body.draft.jobType).toBe('GENERAL');

    const edited = `${d.body.draft.body}\n\nPS: Staplerschein vorhanden.`;
    const saved = await staff.agent.put(`${url}/cover-letter`).send({ subject: d.body.draft.subject, body: edited }).expect(200);
    expect(saved.body.coverLetter.body).toContain('Staplerschein');
    const pdf = await staff.agent.get(`${url}/cover-letter.pdf`).buffer(true).parse(binaryParser).expect(200);
    const text = await pdfText(binary(pdf));
    expect(text).toContain('Bewerbung als Berufskraftfahrer CE');
    expect(text).toContain('Nord Logistik GmbH');
    expect(text).toMatch(/\d{1,2}\. (Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember) \d{4}/);
    const live = await staff.agent.post(`${url}/cover-letter/pdf`).send({ subject: 'Bewerbung', body: 'Sehr geehrte Damen und Herren, …' }).buffer(true).parse(binaryParser).expect(200);
    expect(live.headers['content-type']).toContain('application/pdf');
    expect((await client.agent.get(`${url}/cover-letter/draft`)).status).toBe(403);

    // The client sees that a letter was attached and can draft their own.
    const mine = await client.agent.get('/api/external-applications').expect(200);
    expect(mine.body.items[0].coverLetter.subject).toBe('Bewerbung als Berufskraftfahrer CE');

    await staff.agent.post(`${url}/status`).send({ status: 'FORWARDED', note: 'Persönliche Notiz' }).expect(200);
    await anonymizeInquiries([res.body.id]);
    const after = await prisma.externalJobApplication.findUniqueOrThrow({ where: { inquiryId: res.body.id }, include: { events: true } });
    expect(after).toMatchObject({ coverLetterBody: null, statusNote: null, userId: null });
    expect(after.events[0].note).toBeNull();
    expect((await client.agent.get('/api/external-applications')).body.items).toHaveLength(0);
  });

  it('client: draft, PDF and saving to their letters', async () => {
    const client = await asClient({ email: 'ali@example.com' });
    await seed({ listingTitle: 'Koch (m/w/d)', listingCompany: 'Hotel Nord', profession: 'Koch' }, client.user.id);
    const appId = (await client.agent.get('/api/external-applications').expect(200)).body.items[0].id as string;
    const d = await client.agent.get(`/api/external-applications/${appId}/cover-letter`).expect(200);
    expect(d.body.draft.jobType).toBe('GASTRO');
    expect(d.body.draft.body).toContain('Hotel Nord');
    expect(d.body.attached).toBeNull();
    const pdf = await client.agent.post(`/api/external-applications/${appId}/cover-letter/pdf`).send({ subject: d.body.draft.subject, body: d.body.draft.body }).buffer(true).parse(binaryParser).expect(200);
    expect(pdf.headers['content-disposition']).toContain('Anschreiben_');
    const saved = await client.agent.post(`/api/external-applications/${appId}/cover-letter/save`).send({ subject: d.body.draft.subject, body: d.body.draft.body }).expect(201);
    const letters = await client.agent.get('/api/cv/letters').expect(200);
    expect(letters.body.items.map((l: { id: string }) => l.id)).toContain(saved.body.letter.id);
    expect(letters.body.items[0].kind).toBe('JOB');
  });

  it('generic Anschreiben for any external listing: signed-in clients only, PDF download, nothing stored', async () => {
    const client = await asClient({ email: 'ali@example.com', firstName: 'Əli', lastName: 'Məmmədov' });
    const url = '/api/germany-jobs/cover-letter.pdf';
    expect((await anon().post(url).send({ title: 'Koch (m/w/d)' })).status).toBe(401);
    expect((await (await asStaff()).agent.post(url).send({ title: 'Koch (m/w/d)' })).status).toBe(403);
    const before = { letters: await prisma.motivationLetter.count(), apps: await prisma.externalJobApplication.count(), inquiries: await prisma.inquiry.count() };
    const pdf = await client.agent.post(url).send({ title: 'Koch (m/w/d)', company: 'Hotel Nord', location: 'Berlin', type: 'job' }).buffer(true).parse(binaryParser).expect(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(pdf.headers['content-disposition']).toContain('Anschreiben_');
    const text = await pdfText(binary(pdf));
    expect(text).toContain('Hotel Nord');
    expect({ letters: await prisma.motivationLetter.count(), apps: await prisma.externalJobApplication.count(), inquiries: await prisma.inquiry.count() }).toEqual(before);
    expect((await client.agent.post(url).send({ title: 'x', unknown: 1 })).status).toBe(400);
  });

  it('templates: ADMIN edits and resets, staff cannot; drafts use the custom text; unknown placeholders are flagged', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    expect((await staff.agent.get('/api/admin/cover-letter-templates')).status).toBe(403);
    const list = await admin.agent.get('/api/admin/cover-letter-templates').expect(200);
    expect(list.body.items).toHaveLength(7);
    expect(list.body.items.every((t: { custom: boolean }) => !t.custom)).toBe(true);
    expect(list.body.placeholders.map((p: { key: string }) => p.key)).toContain('eintritt');

    const body = 'Sehr geehrte Damen und Herren,\n\nich ({{name}}) möchte bei {{firma}} als {{position}} arbeiten.\n\nMit freundlichen Grüßen\n\n{{name}}';
    const preview = await admin.agent.post('/api/admin/cover-letter-templates/preview').send({ subject: 'Bewerbung {{gehalt}}', body }).expect(200);
    expect(preview.body.unknown).toEqual(['gehalt']);
    expect(preview.body.body).toContain('bei Muster Logistik GmbH als Berufskraftfahrer CE');
    expect((await admin.agent.put('/api/admin/cover-letter-templates/KOSMONAUT').send({ name: 'x', subject: 'y', body })).status).toBe(400);
    await admin.agent.put('/api/admin/cover-letter-templates/FAHRER').send({ name: 'Fahrer (eigene)', subject: 'Bewerbung: {{position}}', body }).expect(200);

    const res = await seed();
    const d = await staff.agent.get(`/api/admin/external-applications/${res.body.id}/cover-letter/draft`).expect(200);
    expect(d.body.draft.subject).toBe('Bewerbung: Berufskraftfahrer CE');
    expect(d.body.draft.body).toContain('ich (Əli Məmmədov) möchte bei Nord Logistik GmbH als Berufskraftfahrer CE arbeiten.');
    await auditsSettled();
    expect(await prisma.auditLog.count({ where: { action: 'COVER_LETTER_TEMPLATE_SAVED', actorId: admin.user.id } })).toBe(1);

    const reset = await admin.agent.delete('/api/admin/cover-letter-templates/FAHRER').expect(200);
    expect(reset.body.items.find((t: { jobType: string }) => t.jobType === 'FAHRER').custom).toBe(false);
  });
});

describe('privacy', () => {
  it('the GDPR export contains the CV, Lebenslauf versions and external applications with their history', async () => {
    const client = await asClient({ email: 'ali@example.com' });
    await client.agent.put('/api/cv').send({ data: { headline: 'Kraftfahrer', availableFrom: '2027-03' } }).expect(200);
    await client.agent.post('/api/cv/lebenslauf').send({}).expect(201);
    const res = await seed({}, client.user.id);
    await (await asStaff()).agent.post(`/api/admin/external-applications/${res.body.id}/status`).send({ status: 'INTERVIEW', note: 'Freitag 10 Uhr' }).expect(200);
    const out = await buildUserExport(client.user.id);
    expect(out.cvAndApplications.cv?.data.headline).toBe('Kraftfahrer');
    expect(out.cvAndApplications.lebenslaufVersions).toHaveLength(1);
    expect(out.cvAndApplications.externalJobApplications[0]).toMatchObject({ status: 'INTERVIEW', statusNote: 'Freitag 10 Uhr', listingCompany: 'Nord Logistik GmbH' });
    expect(out.cvAndApplications.externalJobApplications[0].events).toHaveLength(1);
    expect(JSON.stringify(out.cvAndApplications)).not.toContain('storageKey');
  });
});
