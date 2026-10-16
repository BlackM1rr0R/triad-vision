import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { anon, asClient, asStaff, ORIGIN, sessionAgent, type Agent } from '../helpers/api';
import { prisma, settle, waitFor } from '../helpers/db';
import { createUser } from '../helpers/factories';
import { binaryParser, makePdf, pageCount, PDF, SIGNATURE_DATA_URL } from '../helpers/files';
import { pdfText } from '../helpers/pdfText';
import { act, adminCase, clientCase, driveCaseTo, expectStatus, reviewAll, signContract } from '../helpers/workflow';
import { runSignatureJobs } from '../../src/lib/esign/service.js';
import { registeredJobs } from '../../src/lib/scheduler.js';
import '../../src/jobs/signatures.js';

/** Captures every email (the real sendMail still writes the EmailLog row). */
const mails = vi.hoisted(() => [] as { to: string; subject: string; html: string; attachments?: { filename: string; content: Buffer | string }[] }[]);
vi.mock('../../src/lib/mailer.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/lib/mailer.js')>();
  return {
    ...mod,
    sendMail: async (to: string, subject: string, html: string, attachments?: { filename: string; content: Buffer | string }[]) => {
      mails.push({ to, subject, html, attachments });
      return mod.sendMail(to, subject, html, attachments);
    },
  };
});

beforeEach(() => {
  mails.length = 0;
});

const DAY = 24 * 60 * 60 * 1000;
const mailsTo = (to: string) => mails.filter((m) => m.to === to);

/** The newest signing link token mailed to `to`. */
const lastToken = (to: string) => {
  const m = [...mails].reverse().find((x) => x.to === to && /\/sign\/[A-Za-z0-9_-]{43}/.test(x.html));
  const token = m?.html.match(/\/sign\/([A-Za-z0-9_-]{43})/)?.[1];
  if (!token) throw new Error(`no signing link mailed to ${to}`);
  return token;
};

const lastCode = (to: string) => {
  const m = [...mails].reverse().find((x) => x.to === to && /:\s*\d{6}/.test(x.html));
  const code = m?.html.match(/:\s*(\d{6})/)?.[1];
  if (!code) throw new Error(`no code mailed to ${to}`);
  return code;
};

const pub = {
  get: (url: string, cookie?: string) => (cookie ? anon().get(url).set('Cookie', cookie) : anon().get(url)),
  post: (url: string, cookie?: string) => {
    const r = anon().post(url).set('Origin', ORIGIN);
    return cookie ? r.set('Cookie', cookie) : r;
  },
};

/** Runs the email-code step for a link and returns the signing-session cookie. */
const verifyLink = async (token: string, email: string) => {
  expectStatus(await pub.post(`/api/sign/${token}/otp`).send({}), 200);
  const res = expectStatus(await pub.post(`/api/sign/${token}/otp/verify`).send({ code: lastCode(email) }), 200);
  const set = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const cookie = set.find((c) => c.startsWith('tv_sign='));
  expect(cookie).toBeDefined();
  expect(cookie).toContain(`Path=/api/sign/${token}`);
  expect(cookie).toContain('HttpOnly');
  return cookie!.split(';')[0];
};

const makeCompany = async () => {
  const company = await prisma.company.create({ data: { name: 'Spedition Müller GmbH', status: 'ACTIVE' } });
  const u = await createUser({ role: 'COMPANY', firstName: 'Jürgen', lastName: 'Müller', locale: 'de' });
  await prisma.user.update({ where: { id: u.user.id }, data: { companyId: company.id } });
  return { company, ...u, agent: sessionAgent(u.token) };
};

interface SignerIn {
  role: 'CANDIDATE' | 'COMPANY' | 'STAFF' | 'OTHER';
  name: string;
  email: string;
  userId?: string;
  order?: number;
  locale?: 'az' | 'de' | 'en' | 'ru';
}

const createRequest = async (
  staff: Agent,
  payload: { title?: string; signers: SignerIn[]; order?: 'SEQUENTIAL' | 'PARALLEL'; caseId?: string; caseContract?: boolean; send?: boolean; expiresInDays?: number },
  pdf?: Buffer,
) =>
  staff
    .post('/api/admin/signatures')
    .field('payload', JSON.stringify({ title: 'Arbeitsvertrag', ...payload }))
    .attach('file', pdf ?? (await makePdf('ARBEITSVERTRAG', 2)), { filename: 'vertrag.pdf', ...PDF });

const download = (agent: Agent, url: string) => agent.get(url).buffer(true).parse(binaryParser);

describe('creating and sending', () => {
  it('registers the reminder job', () => {
    expect(registeredJobs()).toContain('esignatures');
  });

  it('creates a sequential request and invites only the first signer', async () => {
    const staff = await asStaff({ email: 'creator@test.local' });
    const cand = await asClient({ firstName: 'Əli', lastName: 'Məmmədov', email: 'ali@test.local' });
    const emp = await makeCompany();
    const res = expectStatus(
      await createRequest(staff.agent, {
        signers: [
          { role: 'CANDIDATE', name: 'Əli Məmmədov', email: 'ali@test.local' },
          { role: 'COMPANY', name: 'Jürgen Müller', email: emp.user.email },
          { role: 'STAFF', name: 'Staff User', email: 'creator@test.local' },
        ],
      }),
      201,
    );
    const r = res.body.request;
    expect(r.status).toBe('SENT');
    expect(r.originalPages).toBe(2);
    expect(r.originalSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(r.signers.map((s: { order: number }) => s.order)).toEqual([1, 2, 3]);
    // accounts are linked by email
    expect(r.signers[0].userId).toBe(cand.user.id);
    expect(r.signers[1].userId).toBe(emp.user.id);
    expect(r.currentTurn).toEqual([r.signers[0].id]);
    expect(new Date(r.expiresAt).getTime() - Date.now()).toBeGreaterThan(13.9 * DAY);
    expect(r.events.map((e: { type: string }) => e.type)).toEqual(['CREATED', 'SENT', 'SENT']);

    await settle();
    expect(mailsTo('ali@test.local')).toHaveLength(1);
    expect(mailsTo('ali@test.local')[0].subject).toBe('Triad Vision · İmza tələbi: Arbeitsvertrag');
    expect(mailsTo(emp.user.email)).toHaveLength(0);
    const n = await prisma.notification.findFirst({ where: { userId: cand.user.id, type: 'SIGNATURE_REQUEST' } });
    expect(n?.link).toBe(`/account/signatures/${r.signers[0].id}`);
    // the token itself is never stored
    const stored = await prisma.signatureSigner.findUniqueOrThrow({ where: { id: r.signers[0].id } });
    expect(stored.tokenHash).toBe(crypto.createHash('sha256').update(lastToken('ali@test.local')).digest('hex'));

    const list = expectStatus(await staff.agent.get('/api/admin/signatures?status=SENT'), 200).body;
    expect(list.total).toBe(1);
    expect(list.counts.SENT).toBe(1);
    const search = expectStatus(await staff.agent.get('/api/admin/signatures?q=M%C3%BCller'), 200).body;
    expect(search.total).toBe(1);
  });

  it('rejects files that are not PDFs and duplicate signers', async () => {
    const staff = await asStaff();
    const fake = Buffer.from('<html>not a pdf</html>');
    expectStatus(await createRequest(staff.agent, { signers: [{ role: 'OTHER', name: 'A B', email: 'a@test.local' }] }, fake), 400);
    expect((await createRequest(staff.agent, { signers: [{ role: 'OTHER', name: 'A B', email: 'a@test.local' }] }, fake)).body.error).toBe('INVALID_PDF');
    const dup = await createRequest(staff.agent, {
      signers: [
        { role: 'OTHER', name: 'A B', email: 'a@test.local' },
        { role: 'OTHER', name: 'A C', email: 'A@test.local' },
      ],
    });
    expect(dup.status).toBe(400);
    expect(dup.body.error).toBe('DUPLICATE_SIGNER');
    expect(await prisma.signatureRequest.count()).toBe(0);
  });

  it('keeps drafts unsent until /send', async () => {
    const staff = await asStaff();
    const r = expectStatus(await createRequest(staff.agent, { send: false, signers: [{ role: 'OTHER', name: 'Ext Person', email: 'ext@test.local' }] }), 201).body.request;
    expect(r.status).toBe('DRAFT');
    await settle();
    expect(mailsTo('ext@test.local')).toHaveLength(0);
    const sent = expectStatus(await staff.agent.post(`/api/admin/signatures/${r.id}/send`), 200).body.request;
    expect(sent.status).toBe('SENT');
    await settle();
    expect(mailsTo('ext@test.local')).toHaveLength(1);
    expect(mailsTo('ext@test.local')[0].subject).toBe('Triad Vision · Please sign: Arbeitsvertrag');
  });
});

describe('signing with the emailed link', () => {
  it('needs the email code, enforces the order and completes with a valid final PDF', async () => {
    const staff = await asStaff({ email: 'boss@test.local', firstName: 'Lena', lastName: 'Staff' });
    await asClient({ email: 'cand@test.local', firstName: 'Əli', lastName: 'Məmmədov' });
    const emp = await makeCompany();
    const original = await makePdf('ARBEITSVERTRAG', 3);
    const r = expectStatus(
      await createRequest(
        staff.agent,
        {
          title: 'Arbeitsvertrag Əli Məmmədov',
          signers: [
            { role: 'CANDIDATE', name: 'Əli Məmmədov', email: 'cand@test.local' },
            { role: 'COMPANY', name: 'Jürgen Müller', email: emp.user.email },
            { role: 'OTHER', name: 'Олег Петров', email: 'oleg@external.test', locale: 'ru' },
          ],
        },
        original,
      ),
      201,
    ).body.request;
    const [candSigner, empSigner, extSigner] = r.signers;

    // Unknown / malformed links
    expect((await pub.get('/api/sign/not-a-token')).status).toBe(404);
    expect((await pub.get(`/api/sign/${'A'.repeat(43)}`)).status).toBe(404);

    const token = lastToken('cand@test.local');
    const before = expectStatus(await pub.get(`/api/sign/${token}`), 200).body;
    expect(before.auth).toEqual({ method: 'token', otpRequired: true, verified: false });
    expect(before.request.title).toBe('Arbeitsvertrag Əli Məmmədov');
    expect(before.me.email).toBe('c***@test.local');
    expect(before.signers).toEqual([]);
    expect(before.request.originalSha256).toBeNull();

    // Nothing works before the identity check.
    expect((await pub.get(`/api/sign/${token}/document`)).status).toBe(403);
    const early = await pub.post(`/api/sign/${token}/sign`).send({ mode: 'DRAW', signature: SIGNATURE_DATA_URL, agree: true });
    expect(early.status).toBe(403);
    expect(early.body.error).toBe('IDENTITY_NOT_VERIFIED');

    // Code: throttled resend, wrong code counted, right code opens a session.
    expectStatus(await pub.post(`/api/sign/${token}/otp`).send({}), 200);
    const again = await pub.post(`/api/sign/${token}/otp`).send({});
    expect(again.status).toBe(429);
    expect(again.body.error).toBe('OTP_TOO_SOON');
    const code = lastCode('cand@test.local');
    const otpMail = [...mails].reverse().find((m) => m.to === 'cand@test.local')!;
    expect(otpMail.subject).not.toContain(code);
    const wrong = await pub.post(`/api/sign/${token}/otp/verify`).send({ code: code === '000000' ? '111111' : '000000' });
    expect(wrong.status).toBe(400);
    expect(wrong.body).toMatchObject({ error: 'INVALID_CODE', attemptsLeft: 4 });
    const ok = expectStatus(await pub.post(`/api/sign/${token}/otp/verify`).send({ code }), 200);
    const cookie = ([] as string[]).concat(ok.headers['set-cookie']).find((c) => c.startsWith('tv_sign='))!.split(';')[0];
    // a used code cannot be replayed
    expect((await pub.post(`/api/sign/${token}/otp/verify`).send({ code })).status).toBe(400);
    // a forged session cookie is useless
    expect((await pub.get(`/api/sign/${token}/document`, 'tv_sign=forged')).status).toBe(403);

    const view = expectStatus(await pub.get(`/api/sign/${token}`, cookie), 200).body;
    expect(view.auth.verified).toBe(true);
    expect(view.me.myTurn).toBe(true);
    expect(view.me.status).toBe('VIEWED');
    expect(view.signers.map((s: { name: string; status: string }) => [s.name, s.status])).toEqual([
      ['Əli Məmmədov', 'VIEWED'],
      ['Jürgen Müller', 'PENDING'],
      ['Олег Петров', 'PENDING'],
    ]);
    // Other parties' emails / IPs are never exposed to a signer.
    const json = JSON.stringify(view);
    expect(json).not.toContain(emp.user.email);
    expect(json).not.toContain('oleg@external.test');
    expect(json).not.toContain('"ip"');

    const doc = await pub.get(`/api/sign/${token}/document`, cookie).buffer(true).parse(binaryParser);
    expect(doc.status).toBe(200);
    expect(doc.headers['content-type']).toBe('application/pdf');
    expect(doc.headers['x-content-type-options']).toBe('nosniff');
    expect(doc.headers['content-security-policy']).toContain('sandbox');
    expect(Buffer.compare(doc.body as Buffer, original)).toBe(0);

    // Sequential: the employer cannot sign before the candidate (portal or link).
    const notYet = await emp.agent.post(`/api/signatures/my/${empSigner.id}/sign`).send({ mode: 'TYPE', typedName: 'Jürgen Müller', agree: true });
    expect(notYet.status).toBe(409);
    expect(notYet.body.error).toBe('NOT_YOUR_TURN');

    // Invalid signature image / missing consent
    expect((await pub.post(`/api/sign/${token}/sign`, cookie).send({ mode: 'DRAW', signature: 'data:image/png;base64,AAAA', agree: true })).status).toBe(400);
    expect((await pub.post(`/api/sign/${token}/sign`, cookie).send({ mode: 'DRAW', signature: SIGNATURE_DATA_URL, agree: false })).status).toBe(400);

    const signed = expectStatus(await pub.post(`/api/sign/${token}/sign`, cookie).send({ mode: 'DRAW', signature: SIGNATURE_DATA_URL, agree: true }), 200).body;
    expect(signed.me.status).toBe('SIGNED');
    // signing twice is refused
    const twice = await pub.post(`/api/sign/${token}/sign`, cookie).send({ mode: 'DRAW', signature: SIGNATURE_DATA_URL, agree: true });
    expect([403, 409]).toContain(twice.status);

    // Next step: the employer is invited and signs in the portal (no code needed there).
    await settle();
    expect(mailsTo(emp.user.email)).toHaveLength(1);
    expect(mailsTo(emp.user.email)[0].subject).toBe('Triad Vision · Bitte unterschreiben: Arbeitsvertrag Əli Məmmədov');
    const mine = expectStatus(await emp.agent.get('/api/signatures/my'), 200).body.items;
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ signerId: empSigner.id, myTurn: true, status: 'SENT' });
    expect(JSON.stringify(mine)).not.toContain('cand@test.local');
    expectStatus(await emp.agent.post(`/api/signatures/my/${empSigner.id}/sign`).send({ mode: 'TYPE', typedName: 'Jürgen Müller', agree: true }), 200);
    const progress = await prisma.notification.findFirst({ where: { userId: staff.user.id, type: 'SIGNATURE_STATUS' }, orderBy: { createdAt: 'desc' } });
    expect(progress?.body).toContain('(2/3)');

    // Last signer: external party with a link only, in Russian.
    await settle();
    const extToken = lastToken('oleg@external.test');
    expect(mailsTo('oleg@external.test')[0].subject).toBe('Triad Vision · Просьба подписать: Arbeitsvertrag Əli Məmmədov');
    const extCookie = await verifyLink(extToken, 'oleg@external.test');
    const done = expectStatus(await pub.post(`/api/sign/${extToken}/sign`, extCookie).send({ mode: 'TYPE', typedName: 'Олег Петров', agree: true }), 200).body;
    expect(done.request.status).toBe('COMPLETED');
    expect(done.request.hasFinal).toBe(true);

    // Final PDF: original pages + signature page + certificate; hashes recorded.
    const row = await prisma.signatureRequest.findUniqueOrThrow({ where: { id: r.id } });
    expect(row.status).toBe('COMPLETED');
    expect(row.completedAt).not.toBeNull();
    const fin = await download(staff.agent, `/api/admin/signatures/${r.id}/document?version=final&download=1`);
    expect(fin.status).toBe(200);
    expect(fin.headers['content-disposition']).toMatch(/^attachment/);
    const finalPdf = fin.body as Buffer;
    expect(await pageCount(finalPdf)).toBe(3 + 2);
    expect(crypto.createHash('sha256').update(finalPdf).digest('hex')).toBe(row.finalSha256);
    expect(row.originalSha256).toBe(crypto.createHash('sha256').update(original).digest('hex'));
    const text = await pdfText(finalPdf);
    expect(text).toContain('Unterschriften / Signatures');
    expect(text).toContain('Abschlusszertifikat / Certificate of completion');
    expect(text).toContain(row.originalSha256);
    expect(text).toContain('Eli Memmedov'); // Azerbaijani transliterated for the standard fonts
    expect(text).toContain('Oleg Petrov'); // Cyrillic transliterated
    expect(text).toContain('Jürgen Müller'); // WinAnsi umlauts stay
    expect(text).toContain('eIDAS');
    expect(text).toContain('oleg@external.test');

    // The signing session ends with the signature (a new code is needed to fetch the signed copy).
    const signerFinal = await pub.get(`/api/sign/${extToken}/document`, extCookie).buffer(true).parse(binaryParser);
    // the session ended with the signature
    expect(signerFinal.status).toBe(403);

    // Everyone (signers + creator) gets the signed PDF by email.
    await settle();
    for (const to of ['cand@test.local', emp.user.email, 'oleg@external.test', 'boss@test.local']) {
      const m = mailsTo(to).find((x) => x.attachments?.length);
      expect(m, to).toBeDefined();
      expect(Buffer.compare(m!.attachments![0].content as Buffer, finalPdf)).toBe(0);
    }
    expect(mailsTo('boss@test.local').find((x) => x.attachments?.length)!.html).toContain(row.finalSha256!);

    // Original still downloadable for staff; downloads are logged.
    const orig = await download(staff.agent, `/api/admin/signatures/${r.id}/document?version=original`);
    expect(Buffer.compare(orig.body as Buffer, original)).toBe(0);
    const detail = expectStatus(await staff.agent.get(`/api/admin/signatures/${r.id}`), 200).body.request;
    const types = detail.events.map((e: { type: string }) => e.type);
    expect(types).toEqual(expect.arrayContaining(['CREATED', 'SENT', 'OTP_SENT', 'OTP_VERIFIED', 'VIEWED', 'SIGNED', 'COMPLETED', 'DOWNLOADED']));
    expect(types.filter((t: string) => t === 'SIGNED')).toHaveLength(3);
    expect(detail.signers.map((s: { authMethod: string }) => s.authMethod)).toEqual(['EMAIL_OTP', 'PORTAL', 'EMAIL_OTP']);
    expect(detail.signers[0].ip).toBeTruthy();
    expect(candSigner.id).toBe(detail.signers[0].id);
    expect(extSigner.id).toBe(detail.signers[2].id);
  });

  it('lets a signer decline with a reason, which closes the request', async () => {
    const staff = await asStaff({ email: 'owner@test.local' });
    const r = expectStatus(
      await createRequest(staff.agent, {
        order: 'PARALLEL',
        signers: [
          { role: 'OTHER', name: 'Anna One', email: 'one@test.local' },
          { role: 'OTHER', name: 'Ben Two', email: 'two@test.local' },
        ],
      }),
      201,
    ).body.request;
    expect(r.currentTurn).toHaveLength(2);
    await settle();
    const t1 = lastToken('one@test.local');
    const t2 = lastToken('two@test.local');
    const c1 = await verifyLink(t1, 'one@test.local');
    expect((await pub.post(`/api/sign/${t1}/decline`, c1).send({ reason: 'x' })).status).toBe(400);
    const declined = expectStatus(await pub.post(`/api/sign/${t1}/decline`, c1).send({ reason: 'Salary is wrong' }), 200).body;
    expect(declined.me.status).toBe('DECLINED');
    expect(declined.request.status).toBe('DECLINED');

    const c2 = await verifyLink(t2, 'two@test.local').catch(() => null);
    expect(c2).toBeNull(); // code sending refused: request closed
    const n = await prisma.notification.findFirst({ where: { userId: staff.user.id, type: 'SIGNATURE_STATUS' } });
    expect(n?.body).toContain('Salary is wrong');
    await settle();
    expect(mailsTo('two@test.local').some((m) => m.subject.includes('closed'))).toBe(true);
    const detail = expectStatus(await staff.agent.get(`/api/admin/signatures/${r.id}`), 200).body.request;
    expect(detail.signers[0].declinedReason).toBe('Salary is wrong');
    // closed requests cannot be reminded or cancelled
    expect((await staff.agent.post(`/api/admin/signatures/${r.id}/remind`).send({})).status).toBe(409);
    expect((await staff.agent.post(`/api/admin/signatures/${r.id}/cancel`).send({})).status).toBe(409);
  });

  it('staff can cancel, remind and resend a link (old links stop working)', async () => {
    const staff = await asStaff();
    const r = expectStatus(await createRequest(staff.agent, { signers: [{ role: 'OTHER', name: 'Carl Three', email: 'three@test.local' }] }), 201).body.request;
    await settle();
    const first = lastToken('three@test.local');
    expectStatus(await staff.agent.post(`/api/admin/signatures/${r.id}/remind`).send({}), 200);
    await settle();
    const second = lastToken('three@test.local');
    expect(second).not.toBe(first);
    expect((await pub.get(`/api/sign/${first}`)).status).toBe(404);
    expectStatus(await pub.get(`/api/sign/${second}`), 200);
    // resend to a corrected address
    expectStatus(await staff.agent.post(`/api/admin/signatures/${r.id}/signers/${r.signers[0].id}/resend`).send({ email: 'carl@test.local' }), 200);
    await settle();
    expect((await pub.get(`/api/sign/${second}`)).status).toBe(404);
    const third = lastToken('carl@test.local');
    expectStatus(await pub.get(`/api/sign/${third}`), 200);

    const cancelled = expectStatus(await staff.agent.post(`/api/admin/signatures/${r.id}/cancel`).send({ reason: 'Wrong file' }), 200).body.request;
    expect(cancelled.status).toBe('CANCELLED');
    const v = expectStatus(await pub.get(`/api/sign/${third}`), 200).body;
    expect(v.request.status).toBe('CANCELLED');
    expect((await pub.post(`/api/sign/${third}/otp`).send({})).status).toBe(409);
  });
});

describe('case employment contract', () => {
  it('sends the contract through the module and marks the case contract signed on completion', async () => {
    const cand = await asClient({ firstName: 'Rəşad', lastName: 'Əliyev' });
    const admin = await asStaff({ email: 'mgr@test.local' });
    const created = await driveCaseTo('DOCUMENTS_REVIEW', { client: cand.agent, admin: admin.agent });
    await reviewAll(admin.agent, created.id, 'INITIAL');

    const pre = expectStatus(await admin.agent.get(`/api/admin/signatures/prefill?caseId=${created.id}`), 200).body;
    expect(pre.case.contractAllowed).toBe(true);
    expect(pre.signers[0]).toMatchObject({ role: 'CANDIDATE', userId: cand.user.id });
    expect(pre.staff).toMatchObject({ role: 'STAFF', email: 'mgr@test.local' });

    const r = expectStatus(
      await createRequest(admin.agent, {
        caseId: created.id,
        caseContract: true,
        signers: [pre.signers[0], pre.staff],
      }),
      201,
    ).body.request;
    expect(r.isCaseContract).toBe(true);
    let c = await clientCase(cand.agent, created.id);
    expect(c.status).toBe('CONTRACT_SENT');
    expect((c.contract as unknown as { signatureRequestId: string }).signatureRequestId).toBe(r.id);
    // The old single-signer endpoint defers to the module.
    const old = await signContract(cand.agent, created.id);
    expect(old.status).toBe(409);
    expect(old.body.error).toBe('USE_SIGNATURE_REQUEST');

    // Candidate signs in the portal, then the staff counter-signer by link.
    const mine = expectStatus(await cand.agent.get(`/api/signatures/my?caseId=${created.id}`), 200).body.items;
    expect(mine).toHaveLength(1);
    expectStatus(await cand.agent.get(`/api/signatures/my/${mine[0].signerId}`), 200);
    const pdfRes = await cand.agent.get(`/api/signatures/my/${mine[0].signerId}/document`).buffer(true).parse(binaryParser);
    expect(pdfRes.status).toBe(200);
    expectStatus(await cand.agent.post(`/api/signatures/my/${mine[0].signerId}/sign`).send({ mode: 'DRAW', signature: SIGNATURE_DATA_URL, agree: true }), 200);
    await settle();
    const staffToken = lastToken('mgr@test.local');
    const ck = await verifyLink(staffToken, 'mgr@test.local');
    expectStatus(await pub.post(`/api/sign/${staffToken}/sign`, ck).send({ mode: 'TYPE', typedName: 'Staff Manager', agree: true }), 200);

    c = await adminCase(admin.agent, created.id);
    expect(c.status).toBe('CONTRACT_SIGNED');
    expect(c.contract?.signedFile).not.toBeNull();
    const row = await prisma.signatureRequest.findUniqueOrThrow({ where: { id: r.id } });
    expect(row.finalDocumentId).toBe(c.contract!.signedFile!.id);
    const contract = await prisma.contract.findUniqueOrThrow({ where: { caseId: created.id } });
    expect(contract.signerName).toBe('Rəşad Əliyev');
    const doc = await prisma.document.findUniqueOrThrow({ where: { id: contract.signedDocumentId! } });
    expect(doc.stage).toBe('CONTRACT_SIGNED');
    // the candidate can download the signed contract like any case document
    const file = await cand.agent.get(`/api/files/${doc.id}`).buffer(true).parse(binaryParser);
    expect(file.status).toBe(200);
    expect(await pageCount(file.body as Buffer)).toBe(2 + 2);
    // the case workflow goes on as before
    expectStatus(await act(admin.agent, created.id, { action: 'CONFIRM_CONTRACT' }), 200);
  });

  it('refuses a case contract while the case is not ready for one', async () => {
    const cand = await asClient();
    const admin = await asStaff();
    const created = await driveCaseTo('DOCUMENTS_PENDING', { client: cand.agent, admin: admin.agent });
    const res = await createRequest(admin.agent, {
      caseId: created.id,
      caseContract: true,
      signers: [{ role: 'CANDIDATE', name: 'Test User', email: cand.user.email }],
    });
    expect(res.status).toBe(409);
    expect(await prisma.signatureRequest.count()).toBe(0);
    expect((await clientCase(cand.agent, created.id)).status).toBe('DOCUMENTS_PENDING');
  });

  it('keeps the old single-signer contract flow working', async () => {
    const cand = await asClient();
    const admin = await asStaff();
    const created = await driveCaseTo('CONTRACT_SIGNED', { client: cand.agent, admin: admin.agent });
    expect((await clientCase(cand.agent, created.id)).status).toBe('CONTRACT_SIGNED');
  });
});

describe('authorization', () => {
  it('hides requests from everyone but staff and the signers', async () => {
    const staff = await asStaff();
    const cand = await asClient({ email: 'party@test.local' });
    const other = await asClient();
    const emp = await makeCompany();
    const r = expectStatus(await createRequest(staff.agent, { signers: [{ role: 'CANDIDATE', name: 'Party Person', email: 'party@test.local' }] }), 201).body.request;
    const sid = r.signers[0].id;
    expect(r.signers[0].userId).toBe(cand.user.id);

    for (const agent of [other.agent, emp.agent]) {
      expect((await agent.get(`/api/signatures/my/${sid}`)).status).toBe(404);
      expect((await agent.get(`/api/signatures/my/${sid}/document`)).status).toBe(404);
      expect((await agent.post(`/api/signatures/my/${sid}/sign`).send({ mode: 'TYPE', typedName: 'Hacker', agree: true })).status).toBe(404);
      expect(expectStatus(await agent.get('/api/signatures/my'), 200).body.items).toHaveLength(0);
      expect((await agent.get('/api/admin/signatures')).status).toBe(403);
      expect((await agent.post('/api/admin/signatures').send({})).status).toBe(403);
      expect((await agent.get(`/api/admin/signatures/${r.id}/document`)).status).toBe(403);
    }
    expect((await anon().get('/api/signatures/my')).status).toBe(401);
    expect((await anon().get('/api/admin/signatures')).status).toBe(401);
    expect(expectStatus(await cand.agent.get('/api/signatures/my'), 200).body.items).toHaveLength(1);
    expect((await staff.agent.get('/api/admin/signatures/does-not-exist')).status).toBe(404);
  });
});

describe('reminders and expiry job', () => {
  it('reminds after 3 and 7 days (once each, with a fresh link) and expires after the deadline', async () => {
    const staff = await asStaff({ email: 'remind-owner@test.local' });
    const r = expectStatus(await createRequest(staff.agent, { signers: [{ role: 'OTHER', name: 'Slow Signer', email: 'slow@test.local' }], expiresInDays: 10 }), 201).body.request;
    await settle();
    const t0 = lastToken('slow@test.local');
    const invitedAt = (await prisma.signatureSigner.findUniqueOrThrow({ where: { id: r.signers[0].id } })).invitedAt!;

    expect(await runSignatureJobs(new Date(invitedAt.getTime() + 2 * DAY))).toEqual({ expired: 0, reminded: 0, completed: 0 });
    expect((await runSignatureJobs(new Date(invitedAt.getTime() + 3 * DAY + 60_000))).reminded).toBe(1);
    expect((await runSignatureJobs(new Date(invitedAt.getTime() + 3 * DAY + 120_000))).reminded).toBe(0);
    await settle();
    const t1 = lastToken('slow@test.local');
    expect(t1).not.toBe(t0);
    expect(mailsTo('slow@test.local').at(-1)!.subject).toBe('Triad Vision · Reminder: Arbeitsvertrag');
    expect((await pub.get(`/api/sign/${t0}`)).status).toBe(404);
    expect((await runSignatureJobs(new Date(invitedAt.getTime() + 7 * DAY + 60_000))).reminded).toBe(1);
    expect((await runSignatureJobs(new Date(invitedAt.getTime() + 8 * DAY))).reminded).toBe(0);
    expect(await prisma.reminderLog.count({ where: { key: { startsWith: 'esign-remind:' } } })).toBe(2);

    const exp = await runSignatureJobs(new Date(Date.now() + 11 * DAY));
    expect(exp.expired).toBe(1);
    const row = await prisma.signatureRequest.findUniqueOrThrow({ where: { id: r.id } });
    expect(row.status).toBe('EXPIRED');
    const n = await waitFor(() => prisma.notification.findFirst({ where: { userId: staff.user.id, type: 'SIGNATURE_STATUS' } }));
    expect(n.title).toBeTruthy();
    const detail = expectStatus(await staff.agent.get(`/api/admin/signatures/${r.id}`), 200).body.request;
    expect(detail.events.map((e: { type: string }) => e.type)).toContain('EXPIRED');
    expect(detail.events.filter((e: { type: string }) => e.type === 'REMINDED')).toHaveLength(2);
  });

  it('expires lazily when a signer opens a link after the deadline', async () => {
    const staff = await asStaff();
    const r = expectStatus(await createRequest(staff.agent, { signers: [{ role: 'OTHER', name: 'Late Signer', email: 'late@test.local' }] }), 201).body.request;
    await settle();
    const token = lastToken('late@test.local');
    await prisma.signatureRequest.update({ where: { id: r.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const v = expectStatus(await pub.get(`/api/sign/${token}`), 200).body;
    expect(v.request.status).toBe('EXPIRED');
    expect((await pub.post(`/api/sign/${token}/otp`).send({})).status).toBe(409);
  });
});
