/**
 * Deterministic data for the browser tests (tests/browser). Wipes every row of the browser-test database
 * (resetDb, the same list the e2e tests use), then builds the fixtures through the real API in-process
 * (supertest on createApp), so cases, requirements, notifications and drive folders look exactly like
 * production data. Writes the ids, e-mails, session tokens and the admin's TOTP secret to BROWSER_SEED_FILE.
 *
 * Run by tests/browser/scripts/start-api.ts (NODE_ENV=test, own database). Refuses to run anywhere else.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { config } from '../../src/config.js';
import { seal } from '../../src/lib/secretBox.js';
import { generateTotpSecret } from '../../src/lib/totp.js';
import { ensureCaseFolder } from '../../src/lib/drive/caseFolders.js';
import { sanitizeMailHtml } from '../../src/lib/mail/sanitize.js';
import { prisma, resetDb, settle } from '../helpers/db';
import { asClient, asSuperAdmin, type Actor } from '../helpers/api';
import { TEST_PASSWORD } from '../helpers/factories';
import { clientCase, createCaseVia, expectStatus, reviewAll, uploadRequired } from '../helpers/workflow';
import { makePdf, PDF } from '../helpers/files';
import { applyInput, createExternalApplication } from '../../src/lib/germanyJobs/apply.js';
import { processExternalApplication } from '../../src/lib/germanyJobs/autoSend.js';
import { runEmployerDiscovery, type PageFetcher } from '../../src/lib/germanyJobs/discovery/index.js';
import type { SafeResponse } from '../../src/lib/net/safeFetch.js';

if (!config.isTest) throw new Error('The browser seed runs with NODE_ENV=test only');
if (!/triad_vision_browser|_browser/.test(process.env.DATABASE_URL ?? '')) {
  throw new Error('The browser seed only writes to a *_browser database (see tests/browser/env.ts)');
}
const seedFile = process.env.BROWSER_SEED_FILE;
if (!seedFile) throw new Error('BROWSER_SEED_FILE is not set');

const az = (s: string) => ({ az: s, de: s, en: s, ru: s });
const titleAz = (title: unknown) => (title && typeof title === 'object' ? String((title as Record<string, unknown>).az ?? '') : '');

/** A real-looking PDF above the client's "suspiciously small" threshold (5 KB) with plain page objects. */
const samplePdf = async () => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let p = 0; p < 3; p++) {
    const page = doc.addPage();
    for (let i = 0; i < 30; i++) page.drawText(`Browser test document, page ${p + 1}, line ${i + 1}`, { x: 50, y: 780 - i * 24, size: 12, font });
  }
  doc.setSubject('Triad Vision browser test fixture. '.repeat(200));
  return Buffer.from(await doc.save({ useObjectStreams: false }));
};

const user = (a: Actor) => ({
  id: a.user.id,
  email: a.user.email,
  password: TEST_PASSWORD,
  token: a.token,
  firstName: a.user.firstName,
  lastName: a.user.lastName,
});

const clientWithCase = async (firstName: string, lastName: string, key: string) => {
  const actor = await asClient({ firstName, lastName, email: `${key}@browser.test.local` });
  const created = await createCaseVia(actor.agent, 'Anbar işçisi');
  return { actor, caseId: created.id, caseNumber: created.number };
};

const requiredInitial = async (actor: Actor, caseId: string) =>
  (await clientCase(actor.agent, caseId)).requirements.filter((r) => r.stage === 'INITIAL' && r.required);

/** The az title of a requirement, as the portal shows it. */
const requirementTitle = async (id: string) => titleAz((await prisma.documentRequirement.findUniqueOrThrow({ where: { id }, select: { title: true } })).title);

const main = async () => {
  await resetDb();

  // ─── Staff: super admin with a real authenticator secret (the login test types the current code) ───
  const admin = await asSuperAdmin({ firstName: 'Aysel', lastName: 'Adminova', email: 'admin@browser.test.local' });
  const totpSecret = generateTotpSecret();
  await prisma.user.update({ where: { id: admin.user.id }, data: { totpSecret: seal(totpSecret), totpEnabledAt: new Date() } });

  // ─── Public vacancy ───
  const vacancyTitle = 'Anbar işçisi — brauzer testi';
  const vacancy = await prisma.vacancy.create({
    data: {
      slug: 'anbar-isci-brauzer-testi',
      title: az(vacancyTitle),
      description: az('Berlində logistika anbarında iş. Brauzer testləri üçün yaradılıb.'),
      requirements: { az: ['Fiziki dözümlülük'], de: ['Belastbarkeit'], en: ['Stamina'], ru: ['Выносливость'] },
      city: 'Berlin',
      profession: 'Anbar işçisi',
      salaryMin: 2400,
      salaryMax: 2800,
      positions: 3,
      status: 'OPEN',
      publishedAt: new Date(),
    },
  });

  // ─── Clients (one per scenario, so the tests never depend on each other's changes) ───
  // viewer: documents handed in and waiting for review; read-only tests (status consistency, journey card, scroll, crawl).
  const viewer = await clientWithCase('Orxan', 'Baxanov', 'viewer');
  await uploadRequired(viewer.actor.agent, viewer.caseId, 'INITIAL');
  expectStatus(await viewer.actor.agent.post(`/api/cases/${viewer.caseId}/submit`), 200);

  // docs: DOCUMENTS_PENDING, nothing uploaded (upload a file to a requirement).
  const docs = await clientWithCase('Nərmin', 'Yükləyən', 'docs');
  const docsReq = (await requiredInitial(docs.actor, docs.caseId))[0];
  if (!docsReq) throw new Error('seed: a new case has no required initial document');

  // submit: DOCUMENTS_PENDING, every required document uploaded (sticky "Yoxlamaya göndər" → confirm dialog).
  const submit = await clientWithCase('Rauf', 'Göndərən', 'submit');
  await uploadRequired(submit.actor.agent, submit.caseId, 'INITIAL');

  // replace: handed in, one document rejected by staff (staged "Göndər / Dəyiş" re-upload).
  const replace = await clientWithCase('Səbinə', 'Dəyişən', 'replace');
  await uploadRequired(replace.actor.agent, replace.caseId, 'INITIAL');
  expectStatus(await replace.actor.agent.post(`/api/cases/${replace.caseId}/submit`), 200);
  const replaceReq = (await requiredInitial(replace.actor, replace.caseId))[0];
  const rejectedDoc = replaceReq.documents[0];
  expectStatus(
    await admin.agent.post(`/api/admin/cases/${replace.caseId}/documents/${rejectedDoc.id}/review`).send({ status: 'REJECTED', note: 'Şəkil bulanıqdır' }),
    200,
  );

  // messages: DOCUMENTS_PENDING with missing documents, a staff message → NEW_MESSAGE notification.
  const messages = await clientWithCase('Kamran', 'Yazanov', 'messages');
  const staffMessage = 'Salam! Pasportunuzun surətini nə vaxt yükləyə bilərsiniz?';
  expectStatus(await admin.agent.post(`/api/admin/cases/${messages.caseId}/messages`).send({ body: staffMessage }), 201);

  // review: handed in, documents PENDING, the client wrote to the team (admin: review drawer, inbox, drive).
  const review = await clientWithCase('Leyla', 'Yoxlanılan', 'review');
  await uploadRequired(review.actor.agent, review.caseId, 'INITIAL');
  expectStatus(await review.actor.agent.post(`/api/cases/${review.caseId}/submit`), 200);
  const clientMessage = 'Salam, bütün sənədləri göndərdim. Nə vaxt yoxlanılacaq?';
  expectStatus(await review.actor.agent.post(`/api/cases/${review.caseId}/messages`).send({ body: clientMessage }), 201);

  // Drive: the client folder of the review case (createCase starts it fire-and-forget; make sure it exists).
  await settle();
  await ensureCaseFolder(review.caseId);
  const reviewCase = await prisma.case.findUniqueOrThrow({ where: { id: review.caseId }, select: { driveFolderId: true } });
  if (!reviewCase.driveFolderId) throw new Error('seed: the review case has no drive folder');
  const folder = await prisma.driveNode.findUniqueOrThrow({ where: { id: reviewCase.driveFolderId }, select: { id: true, name: true, parentId: true } });
  if (!folder.parentId) throw new Error('seed: the client folder has no parent');

  // ─── Mail: the admin's own mailbox (sync off: no IMAP) with two long HTML messages ───
  const account = await prisma.mailAccount.create({
    data: {
      userId: admin.user.id,
      email: admin.user.email,
      displayName: 'Aysel Adminova',
      imapHost: 'imap.invalid',
      smtpHost: 'smtp.invalid',
      username: admin.user.email,
      passwordEnc: seal('not-a-real-password'),
      isDefault: true,
      syncEnabled: false,
    },
  });
  const inbox = await prisma.mailFolder.create({ data: { accountId: account.id, path: 'INBOX', name: 'INBOX', role: 'INBOX', total: 2, unread: 2 } });
  const paragraphs = Array.from(
    { length: 120 },
    (_, i) => `<p style="margin:0 0 12px">Absatz ${i + 1}: Sehr geehrte Damen und Herren, anbei erhalten Sie die Unterlagen zum Antrag.</p>`,
  ).join('');
  // A typical long newsletter / authority mail: full-width table with height="100%" (fed back into the frame height
  // before the reader measured the body box instead of documentElement.scrollHeight).
  const longHtml =
    `<table width="100%" height="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9"><tr><td style="padding:24px">` +
    `<h2>Bürokratie GmbH</h2>${paragraphs}<div style="height:100%">Fußzeile</div></td></tr></table>`;
  // The same with a viewport-high wrapper (min-height:100vh survives sanitizeMailHtml): inside the frame 100vh is the
  // frame's own height, so every resize makes the body taller again. Known reader bug, see tests/browser/README.md.
  const vhHtml = `<div style="min-height:100vh;background:#f6f7f9"><div style="padding:24px"><h2>Bürokratie GmbH</h2>${paragraphs}</div></div>`;
  const mailMessage = (subject: string, html: string, minutesAgo: number) =>
    prisma.mailMessage.create({
      data: {
        accountId: account.id,
        folderId: inbox.id,
        uid: null,
        messageId: `<browser-${minutesAgo}@test.local>`,
        subject,
        fromName: 'Bürokratie GmbH',
        fromAddr: 'info@buerokratie.example',
        toList: [{ name: 'Aysel Adminova', address: admin.user.email }],
        date: new Date(Date.now() - minutesAgo * 60_000),
        snippet: 'Sehr geehrte Damen und Herren, anbei erhalten Sie die Unterlagen zum Antrag.',
        text: 'Sehr geehrte Damen und Herren, anbei erhalten Sie die Unterlagen zum Antrag.',
        html: sanitizeMailHtml(html),
        size: html.length,
      },
    });
  const mailSubject = 'Uzun HTML məktub — brauzer testi';
  const mail = await mailMessage(mailSubject, longHtml, 5);
  const vhSubject = 'Ekran hündürlüyündə məktub — brauzer testi';
  const vhMail = await mailMessage(vhSubject, vhHtml, 10);

  // contract: initial documents accepted, Əmək müqaviləsi (own PDF, client + Triad Vision places) sent through the
  // real admin API (lib/caseContracts, V2): the client signs first, then Triad Vision.
  const contract = await clientWithCase('Tural', 'İmzalayan', 'contract');
  await uploadRequired(contract.actor.agent, contract.caseId, 'INITIAL');
  expectStatus(await contract.actor.agent.post(`/api/cases/${contract.caseId}/submit`), 200);
  await reviewAll(admin.agent, contract.caseId, 'INITIAL');
  const clientBox = { role: 'CANDIDATE', page: 1, x: 60, y: 100, w: 200, h: 50 };
  const triadBox = { role: 'STAFF', page: 1, x: 320, y: 100, w: 200, h: 50 };
  expectStatus(
    await admin.agent
      .post(`/api/admin/case-contracts/cases/${contract.caseId}/upload`)
      .field('meta', JSON.stringify({ step: 'LABOUR', placements: [[clientBox, triadBox]] }))
      .attach('files', await makePdf('Emek muqavilesi', 2), { filename: 'emek-muqavilesi.pdf', ...PDF }),
    201,
  );

  // docLink: an embassy list that already exists (staff listed the passport there) while the client is still in the
  // initial documents: the passport uploaded once appears in both lists (lib/docLink).
  const docLink = await clientWithCase('Aytən', 'Əlaqələndirən', 'doclink');
  const embassyTitle = 'Pasport (səfirlik üçün)';
  await prisma.documentRequirement.create({ data: { caseId: docLink.caseId, stage: 'EMBASSY', key: 'PASSPORT', title: az(embassyTitle), required: true, sortOrder: 50 } });
  const docLinkInitial = await prisma.documentRequirement.findFirstOrThrow({ where: { caseId: docLink.caseId, stage: 'INITIAL', key: 'PASSPORT' }, select: { id: true } });

  // external: "Apply via Triad Vision" for a listing elsewhere. The employer-page fetch is replaced by an injected
  // fetcher (an offline page without an address), so the application lands in CLIENT_SEND: the client gets the
  // package and the step-by-step guide. Nothing here touches the network.
  const externalListing = { url: 'https://jobs.example.test/stellen/berufskraftfahrer-ce', title: 'Berufskraftfahrer CE (brauzer testi)', company: 'Nord Logistik GmbH' };
  const external = await clientWithCase('Elnur', 'Müraciətçi', 'external');
  await prisma.user.update({ where: { id: external.actor.user.id }, data: { passportNumber: 'C01234567', germanLevel: 'B1', profession: 'Berufskraftfahrer', phone: '+994501234567' } });
  expectStatus(
    await external.actor.agent.put('/api/cv').send({ data: { headline: 'Berufskraftfahrer', experience: [{ title: 'Kraftfahrer', employer: 'Azərsun', from: '2019-01', to: null }], drivingLicences: ['CE'] } }),
    200,
  );
  expectStatus(await external.actor.agent.post('/api/cv/lebenslauf').send({}), 201);
  const externalInquiry = await createExternalApplication(
    applyInput.parse({
      provider: 'link',
      listingUrl: externalListing.url,
      listingTitle: externalListing.title,
      listingCompany: externalListing.company,
      listingLocation: 'Hamburg',
      jobType: 'job',
      name: 'Elnur Müraciətçi',
      email: external.actor.user.email,
      phone: '050 123 45 67',
      germanLevel: 'B1',
      profession: 'Kraftfahrer',
      experienceYears: '6',
      message: '',
      consent: 'true',
      forwardConsent: 'true',
      lng: 'az',
    }),
    { phone: '+994501234567', lng: 'az', cv: null, userId: external.actor.user.id, partnerId: null, accountLabel: null },
  );
  const externalApp = await prisma.externalJobApplication.findUniqueOrThrow({ where: { inquiryId: externalInquiry.id } });
  await processExternalApplication(externalApp.id);
  const offlinePage: PageFetcher = async (u): Promise<SafeResponse> => ({ url: u, status: 200, contentType: 'text/html; charset=utf-8', body: '<p>Jetzt online bewerben</p>', truncated: false, hops: [u] });
  await runEmployerDiscovery({ fetchPage: offlinePage });
  const externalState = (await prisma.externalJobApplication.findUniqueOrThrow({ where: { id: externalApp.id } })).autoState;
  if (externalState !== 'CLIENT_SEND') throw new Error(`seed: the external application is in ${externalState}, expected CLIENT_SEND`);

  // Guided tours off for every seeded user (server-side progress; the browser fixtures also set the local flags).
  for (const a of [admin, viewer.actor, docs.actor, submit.actor, replace.actor, messages.actor, review.actor, contract.actor, docLink.actor, external.actor]) {
    for (const tour of ['admin', 'staff', 'client-stages']) {
      expectStatus(await a.agent.put(`/api/tours/${tour}`).send({ status: 'never' }), 200);
    }
  }

  // ─── Output ───
  const dir = path.dirname(seedFile);
  fs.mkdirSync(dir, { recursive: true });
  const pdfPath = path.join(dir, 'pasport-surəti.pdf');
  fs.writeFileSync(pdfPath, await samplePdf());

  const caseClient = (c: Awaited<ReturnType<typeof clientWithCase>>) => ({ ...user(c.actor), caseId: c.caseId, caseNumber: c.caseNumber });
  const out = {
    createdAt: new Date().toISOString(),
    samplePdf: pdfPath,
    admin: { ...user(admin), totpSecret },
    vacancy: { id: vacancy.id, slug: vacancy.slug, title: vacancyTitle },
    clients: {
      viewer: caseClient(viewer),
      docs: { ...caseClient(docs), requirementTitle: await requirementTitle(docsReq.id) },
      submit: caseClient(submit),
      replace: {
        ...caseClient(replace),
        requirementTitle: await requirementTitle(replaceReq.id),
        rejectedFile: (await prisma.document.findUniqueOrThrow({ where: { id: rejectedDoc.id }, select: { originalName: true } })).originalName,
      },
      messages: { ...caseClient(messages), staffMessage },
      review: { ...caseClient(review), clientMessage },
      contract: caseClient(contract),
      docLink: { ...caseClient(docLink), initialRequirementTitle: await requirementTitle(docLinkInitial.id), embassyRequirementTitle: embassyTitle },
      external: { ...caseClient(external), listingTitle: externalListing.title, listingCompany: externalListing.company },
    },
    drive: { clientFolderId: folder.id, clientFolderName: folder.name, parentId: folder.parentId },
    mail: { accountId: account.id, folderId: inbox.id, messageId: mail.id, subject: mailSubject, vhMessageId: vhMail.id, vhSubject },
  };
  fs.writeFileSync(seedFile, JSON.stringify(out, null, 2));
  console.log(`[browser-seed] wrote ${seedFile}`);
};

main()
  .then(async () => {
    await settle();
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('[browser-seed] failed', err);
    await prisma.$disconnect().catch(() => undefined);
    process.exit(1);
  });
