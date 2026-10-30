import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import type { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { anon, asAdmin, asClient, ORIGIN, sessionAgent } from '../helpers/api';
import { prisma, settle, waitFor } from '../helpers/db';
import { createUser, TEST_PASSWORD, uniq } from '../helpers/factories';
import { binaryParser, makePdf, PDF, PNG_BUFFER } from '../helpers/files';
import { TEST_UPLOADS_DIR } from '../helpers/testEnv';
import { createCaseVia, expectStatus } from '../helpers/workflow';
import { asCandidate, asCompany, createVacancy } from './vacancies.fixtures';
import { createVerificationToken } from '../../src/lib/emailVerification.js';
import { waitForApplicationUploads } from '../../src/lib/applicationUploads.js';
import { COMPANY_TEAM_CAP } from '../../src/lib/companyTeam.js';

/**
 * Portal extras: notifications for every portal role, e-mail change, agent e-mail codes, agent leads, employer team,
 * "all my documents" ZIP, vault documents in job applications, the scanner's PDF endpoint, billing per family member.
 */

const mails = vi.hoisted(() => [] as { to: string; subject: string; html: string }[]);
vi.mock('../../src/lib/mailer.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/lib/mailer.js')>();
  return {
    ...mod,
    sendMail: async (to: string, subject: string, html: string, attachments?: never) => {
      mails.push({ to, subject, html });
      return mod.sendMail(to, subject, html, attachments);
    },
  };
});

beforeEach(() => {
  mails.length = 0;
  fs.mkdirSync(path.join(TEST_UPLOADS_DIR, 'private'), { recursive: true });
});

/** The token in the newest mail to `to` that links to `route`. */
const tokenFrom = (to: string, route: string) => {
  const m = [...mails].reverse().find((x) => x.to === to && x.html.includes(route));
  const token = m?.html.match(new RegExp(`${route}\\?token=([a-f0-9]{64})`))?.[1];
  if (!token) throw new Error(`no ${route} link mailed to ${to}`);
  return token;
};

const asAgentUser = async (over: Partial<Prisma.AgentUncheckedCreateInput> = {}) => {
  const u = await createUser({ role: 'AGENT', firstName: 'Rauf', lastName: 'Agentov', locale: 'az' });
  const row = await prisma.agent.create({ data: { userId: u.user.id, code: uniq('AG').toUpperCase().slice(0, 30), ...over } });
  return { ...u, row, agent: sessionAgent(u.token) };
};

describe('notifications in the employer / agent / partner portals', () => {
  it('GET /api/notifications and mark-read work for COMPANY and AGENT logins (own rows only)', async () => {
    const company = await asCompany();
    const agent = await asAgentUser();
    await prisma.notification.createMany({
      data: [
        { userId: company.user.id, type: 'QUOTE_SENT', title: 'Angebot', body: 'x', link: '/company/quotes' },
        { userId: agent.user.id, type: 'AGENT_COMMISSION', title: 'Komissiya', body: 'y', link: '/agent/earnings' },
      ],
    });
    const c = expectStatus(await company.agent.get('/api/notifications'), 200).body;
    expect(c.unread).toBe(1);
    expect(c.items.map((n: { link: string }) => n.link)).toEqual(['/company/quotes']);
    const a = expectStatus(await agent.agent.get('/api/notifications'), 200).body;
    expect(a.items.map((n: { link: string }) => n.link)).toEqual(['/agent/earnings']);
    expectStatus(await agent.agent.post('/api/notifications/read').send({}), 200);
    expect((await agent.agent.get('/api/notifications')).body.unread).toBe(0);
    expect((await company.agent.get('/api/notifications')).body.unread).toBe(1);
  });
});

describe('e-mail change', () => {
  it('request → link to the new address + info to the old one → confirm: e-mail replaced, other sessions revoked, audited', async () => {
    const u = await createUser({ role: 'COMPANY', locale: 'de' });
    const other = await createUser({ role: 'CLIENT' });
    const me = sessionAgent(u.token);
    const newEmail = `${uniq('new')}@test.local`;

    expect((await me.post('/api/auth/email-change').send({ newEmail, currentPassword: 'wrong-password' })).body.error).toBe('WRONG_PASSWORD');
    expect((await me.post('/api/auth/email-change').send({ newEmail: u.user.email, currentPassword: TEST_PASSWORD })).body.error).toBe('SAME_EMAIL');
    const taken = await me.post('/api/auth/email-change').send({ newEmail: other.user.email, currentPassword: TEST_PASSWORD });
    expect(taken.status).toBe(409);
    expect(taken.body.error).toBe('EMAIL_TAKEN');

    const res = expectStatus(await me.post('/api/auth/email-change').send({ newEmail: newEmail.toUpperCase(), currentPassword: TEST_PASSWORD }), 200).body;
    expect(res.pending).toMatchObject({ newEmail });
    expect((await me.get('/api/auth/email-change')).body.pending).toMatchObject({ newEmail });
    // second request within a minute is throttled
    expect((await me.post('/api/auth/email-change').send({ newEmail, currentPassword: TEST_PASSWORD })).status).toBe(429);
    await settle();
    const token = tokenFrom(newEmail, '/confirm-email-change');
    const info = mails.find((m) => m.to === u.user.email);
    expect(info?.subject).toContain('E-Mail-Adresse');
    expect(info?.html).not.toContain(token);
    // the plain-text part is generated for both mails (EmailLog keeps the send)
    await waitFor(() => prisma.emailLog.findFirst({ where: { to: newEmail } }));

    // The regular verification route does not accept a change token.
    expect((await anon().post('/api/auth/verify-email').set('Origin', ORIGIN).send({ token })).body.error).toBe('INVALID_TOKEN');

    // A second device of the user.
    const { issueSession } = await import('../../src/middleware/auth.js');
    const second = await issueSession(u.user.id, { client: 'web' });

    const done = expectStatus(await me.post('/api/auth/email-change/confirm').send({ token }), 200).body;
    expect(done.email).toBe(newEmail);
    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: u.user.id } });
    expect(fresh.email).toBe(newEmail);
    expect(fresh.emailVerifiedAt).not.toBeNull();
    // this browser stays logged in, the other device does not
    expect((await me.get('/api/auth/me')).body.user.email).toBe(newEmail);
    expect((await sessionAgent(second.token).get('/api/auth/me')).body.user).toBeNull();
    expect(await prisma.auditLog.findFirst({ where: { action: 'EMAIL_CHANGED', target: `user:${u.user.id}` } })).not.toBeNull();
    // single use
    expect((await anon().post('/api/auth/email-change/confirm').set('Origin', ORIGIN).send({ token })).body.error).toBe('INVALID_TOKEN');
    // login works with the new address only
    expect((await anon().post('/api/auth/login').set('Origin', ORIGIN).send({ email: newEmail, password: TEST_PASSWORD })).status).toBe(200);
  });

  it('the address is re-checked on confirm; cancel kills the link; a plain verification link leaves the change link alive', async () => {
    const u = await createUser({ role: 'AGENT' });
    const me = sessionAgent(u.token);
    const target = `${uniq('t')}@test.local`;
    expectStatus(await me.post('/api/auth/email-change').send({ newEmail: target, currentPassword: TEST_PASSWORD }), 200);
    await settle();
    const token = tokenFrom(target, '/confirm-email-change');
    await createVerificationToken(u.user.id); // the old verification flow must not invalidate it
    await createUser({ email: target }); // someone registers the address meanwhile
    const res = await anon().post('/api/auth/email-change/confirm').set('Origin', ORIGIN).send({ token });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('EMAIL_TAKEN');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.user.id } })).email).toBe(u.user.email);

    await prisma.emailVerificationToken.updateMany({ where: { userId: u.user.id }, data: { createdAt: new Date(Date.now() - 5 * 60_000) } });
    const free = `${uniq('f')}@test.local`;
    expectStatus(await me.post('/api/auth/email-change').send({ newEmail: free, currentPassword: TEST_PASSWORD }), 200);
    await settle();
    const t2 = tokenFrom(free, '/confirm-email-change');
    expectStatus(await me.delete('/api/auth/email-change'), 200);
    expect((await me.get('/api/auth/email-change')).body.pending).toBeNull();
    expect((await anon().post('/api/auth/email-change/confirm').set('Origin', ORIGIN).send({ token: t2 })).body.error).toBe('INVALID_TOKEN');
  });
});

describe('agents: e-mail codes as second factor', () => {
  it('an agent can turn on the two-step login by e-mail', async () => {
    const a = await asAgentUser();
    expect((await a.agent.get('/api/auth/2fa/status')).body.emailOtpAvailable).toBe(true);
    expectStatus(await a.agent.post('/api/auth/2fa/email/start').send({ password: TEST_PASSWORD }), 200);
  });
});

describe('agent leads', () => {
  const lead = (over: Record<string, unknown> = {}) => ({
    name: 'Nigar Həsənova',
    phone: '+994 50 111 22 33',
    email: 'nigar@example.com',
    country: 'Azərbaycan',
    interest: 'AUSBILDUNG',
    message: 'Pflege Ausbildung',
    consent: true,
    ...over,
  });

  it('creates an attributed inquiry, notifies staff, lists it without staff notes; consent required; duplicates refused', async () => {
    const a = await asAgentUser();
    const partner = await prisma.referralPartner.create({ data: { name: uniq('Gəncə Ofisi '), code: uniq('P').toUpperCase().slice(0, 20), userId: a.user.id } });
    const admin = await asAdmin();
    expect((await a.agent.post('/api/agent/leads').send(lead({ consent: false }))).status).toBe(400);
    expect((await a.agent.post('/api/agent/leads').send(lead({ email: 'not-an-email' }))).status).toBe(400);

    const res = expectStatus(await a.agent.post('/api/agent/leads').send(lead()), 201).body;
    const row = await prisma.inquiry.findUniqueOrThrow({ where: { id: res.lead.id } });
    expect(row).toMatchObject({ kind: 'contact', source: `agent:${a.row.id}`, agentId: a.row.id, partnerId: partner.id, contactName: 'Nigar Həsənova', email: 'nigar@example.com', status: 'NEW' });
    expect(row.message).toContain(a.row.code);
    expect(row.message).toContain('Pflege Ausbildung');
    expect(await prisma.notification.findFirst({ where: { userId: admin.user.id, link: '/admin/inquiries' } })).not.toBeNull();
    expect(await prisma.auditLog.findFirst({ where: { action: 'AGENT_LEAD_CREATED' } })).not.toBeNull();

    expect((await a.agent.post('/api/agent/leads').send(lead())).body.error).toBe('DUPLICATE_LEAD');

    await prisma.inquiry.update({ where: { id: row.id }, data: { status: 'IN_PROGRESS', staffNotes: 'SECRET staff note', convertedAt: new Date() } });
    const list = expectStatus(await a.agent.get('/api/agent/leads'), 200).body;
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({ id: row.id, status: 'IN_PROGRESS', converted: true, name: 'Nigar Həsənova' });
    expect(JSON.stringify(list)).not.toContain('SECRET');

    // another agent sees nothing of it; a paused agent cannot add leads
    const b = await asAgentUser({ status: 'PAUSED' });
    expect((await b.agent.get('/api/agent/leads')).body.items).toHaveLength(0);
    expect((await b.agent.post('/api/agent/leads').send(lead({ email: 'x@example.com' }))).body.error).toBe('AGENT_PAUSED');
    // clients cannot use the agent API
    const client = await asClient();
    expect((await client.agent.post('/api/agent/leads').send(lead())).status).toBe(403);
  });
});

describe('employer team', () => {
  it('the owner (oldest active login) invites, lists, resends and deactivates; others may only look', async () => {
    const owner = await asCompany('ACTIVE', { email: `${uniq('owner')}@test.local` });
    await prisma.user.update({ where: { id: owner.user.id }, data: { createdAt: new Date(Date.now() - 60_000) } });
    const admin = await asAdmin();

    const inv = expectStatus(await owner.agent.post('/api/company/team').send({ email: 'Kollegin@Firma.de', firstName: 'Anna', lastName: 'Schmidt' }), 201).body.member;
    const member = await prisma.user.findUniqueOrThrow({ where: { id: inv.id } });
    expect(member).toMatchObject({ role: 'COMPANY', companyId: owner.company.id, email: 'kollegin@firma.de', isActive: true, locale: 'de' });
    await settle();
    const token = tokenFrom('kollegin@firma.de', '/reset-password');
    expect(await prisma.notification.findFirst({ where: { userId: admin.user.id, type: 'STAFF', link: `/admin/companies?id=${owner.company.id}` } })).not.toBeNull();
    expect((await owner.agent.post('/api/company/team').send({ email: 'kollegin@firma.de', firstName: 'A', lastName: 'B' })).body.error).toBe('EMAIL_TAKEN');

    const team = expectStatus(await owner.agent.get('/api/company/team'), 200).body;
    expect(team.isOwner).toBe(true);
    expect(team.members.map((m: { email: string; owner: boolean; pending: boolean }) => [m.email, m.owner, m.pending])).toEqual([
      [owner.user.email, true, false],
      ['kollegin@firma.de', false, true],
    ]);
    expectStatus(await owner.agent.post(`/api/company/team/${inv.id}/resend`), 200);

    // The member sets the password with the (first) link? It was replaced by the resend.
    expect((await anon().post('/api/auth/reset-password').set('Origin', ORIGIN).send({ token, password: 'NewPassword123!' })).body.error).toBe('INVALID_TOKEN');
    await settle();
    const t2 = tokenFrom('kollegin@firma.de', '/reset-password');
    expectStatus(await anon().post('/api/auth/reset-password').set('Origin', ORIGIN).send({ token: t2, password: 'NewPassword123!' }), 200);
    const login = await anon().post('/api/auth/login').set('Origin', ORIGIN).send({ email: 'kollegin@firma.de', password: 'NewPassword123!' });
    expect(login.status).toBe(200);
    const cookie = String(login.headers['set-cookie']?.[0] ?? '').split(';')[0];
    const colleague = { get: (u: string) => anon().get(u).set('Cookie', cookie), post: (u: string) => anon().post(u).set('Cookie', cookie).set('Origin', ORIGIN), del: (u: string) => anon().delete(u).set('Cookie', cookie).set('Origin', ORIGIN) };
    expect((await colleague.get('/api/company/team')).body).toMatchObject({ isOwner: false });
    expect((await colleague.post('/api/company/team').send({ email: 'x@firma.de', firstName: 'X', lastName: 'Y' })).body.error).toBe('NOT_COMPANY_OWNER');
    expect((await colleague.del(`/api/company/team/${owner.user.id}`)).body.error).toBe('NOT_COMPANY_OWNER');

    // Another company's login is invisible and untouchable.
    const foreign = await asCompany();
    expect((await owner.agent.delete(`/api/company/team/${foreign.user.id}`)).status).toBe(404);
    expect((await owner.agent.delete(`/api/company/team/${owner.user.id}`)).body.error).toBe('CANNOT_REMOVE_SELF');

    // Deactivate: row stays, sessions revoked, login refused.
    expectStatus(await owner.agent.delete(`/api/company/team/${inv.id}`), 200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: inv.id } })).isActive).toBe(false);
    expect((await colleague.get('/api/company/team')).status).toBe(401);
    expect(await prisma.auditLog.findFirst({ where: { action: 'COMPANY_TEAM_REMOVED' } })).not.toBeNull();
    const after = (await owner.agent.get('/api/company/team')).body;
    expect(after.activeCount).toBe(1);
    expect(after.members.find((m: { id: string }) => m.id === inv.id)).toMatchObject({ isActive: false, pending: false });
  });

  it('caps the active logins per company', async () => {
    const owner = await asCompany();
    await prisma.user.update({ where: { id: owner.user.id }, data: { createdAt: new Date(Date.now() - 60_000) } });
    await prisma.user.createMany({
      data: Array.from({ length: COMPANY_TEAM_CAP - 1 }, (_, i) => ({ email: `${uniq(`m${i}`)}@test.local`, passwordHash: 'x', role: 'COMPANY' as const, firstName: 'M', lastName: String(i), companyId: owner.company.id })),
    });
    expect((await owner.agent.post('/api/company/team').send({ email: 'one-more@firma.de', firstName: 'A', lastName: 'B' })).body.error).toBe('TEAM_LIMIT_REACHED');
  });
});

describe('client documents', () => {
  const zipOf = async (agent: ReturnType<typeof sessionAgent>) => {
    const res = await agent.get('/api/vault/export.zip').buffer(true).parse(binaryParser);
    return { res, zip: res.status === 200 ? await JSZip.loadAsync(res.body as Buffer) : null };
  };

  it('"all my documents" ZIP: own vault + own case files only; empty → 404; audited', async () => {
    const client = await asClient();
    expect((await zipOf(client.agent)).res.status).toBe(404);
    expectStatus(await client.agent.post('/api/vault').field('kind', 'DIPLOMA').field('title', 'Diplom').attach('file', await makePdf('dip'), { filename: 'diplom.pdf', ...PDF }), 201);
    const c = await createCaseVia(client.agent);
    const req = await prisma.documentRequirement.findFirstOrThrow({ where: { caseId: c.id, key: 'PASSPORT' } });
    expectStatus(await client.agent.post(`/api/cases/${c.id}/documents`).field('requirementId', req.id).attach('file', await makePdf('pass'), { filename: 'pass.pdf', ...PDF }), 201);
    const other = await asClient();
    expectStatus(await other.agent.post('/api/vault').field('kind', 'CV').field('title', 'Foreign CV').attach('file', await makePdf('cv'), { filename: 'cv.pdf', ...PDF }), 201);

    const { res, zip } = await zipOf(client.agent);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/zip');
    const names = Object.keys(zip!.files).filter((n) => !zip!.files[n].dir);
    expect(names).toContain('Seyf/DIPLOMA-Diplom.pdf');
    expect(names).toContain(`${c.number}/1-Ilkin-senedler/pass.pdf`);
    expect(names.some((n) => n.includes('Foreign'))).toBe(false);
    expect((await zip!.file('Seyf/DIPLOMA-Diplom.pdf')!.async('nodebuffer')).subarray(0, 4).toString()).toBe('%PDF');
    expect(await prisma.auditLog.findFirst({ where: { action: 'vault.export_zip' } })).toMatchObject({ details: { vault: 1, caseFiles: 1, skipped: 0 } });
  });

  it('job application with vault documents: own ones are linked + attached to the open case, foreign ids refused before anything is created', async () => {
    const v = await createVacancy({ slug: uniq('lkw-vault-') });
    const cand = await asCandidate();
    const passport = expectStatus(await cand.agent.post('/api/vault').field('kind', 'CV').field('title', 'Lebenslauf').attach('file', await makePdf('cv'), { filename: 'cv.pdf', ...PDF }), 201).body.document;
    const other = await asClient();
    const foreign = expectStatus(await other.agent.post('/api/vault').field('kind', 'CV').field('title', 'X').attach('file', await makePdf('x'), { filename: 'x.pdf', ...PDF }), 201).body.document;

    const bad = await cand.agent.post(`/api/vacancies/${v.slug}/apply`).send({ vaultIds: [foreign.id] });
    expect(bad.status).toBe(404);
    expect(bad.body.error).toBe('VAULT_DOCUMENT_NOT_FOUND');
    expect(await prisma.vacancyApplication.count({ where: { userId: cand.user.id } })).toBe(0);

    const c = await createCaseVia(cand.agent);
    const res = expectStatus(await cand.agent.post(`/api/vacancies/${v.slug}/apply`).send({ message: 'Hallo', vaultIds: [passport.id] }), 201).body;
    expect(res.documents.map((d: { id: string }) => d.id)).toEqual([passport.id]);
    expect(res.attachedCaseId).toBe(c.id);
    await waitForApplicationUploads();
    const doc = await prisma.document.findFirstOrThrow({ where: { caseId: c.id, vaultDocumentId: passport.id }, include: { requirement: true } });
    expect(doc.requirement?.key).toBe('CV');
    // no copy in the vault; the staff candidate view lists it and may download it
    expect(await prisma.vaultDocument.count({ where: { userId: cand.user.id } })).toBe(1);
    const admin = await asAdmin();
    const cv = expectStatus(await admin.agent.get(`/api/admin/candidates/${cand.user.id}`), 200).body.candidate.applicationDocuments;
    expect(cv).toEqual([expect.objectContaining({ id: passport.id, fromVault: true, applicationId: res.application.id })]);
    expectStatus(await admin.agent.get(`/api/admin/candidates/${cand.user.id}/application-documents/${passport.id}`), 200);
  });

  it('scanner pages → one PDF in the response (stored nowhere)', async () => {
    const client = await asClient();
    const res = await client.agent.post('/api/scan/pdf').field('name', 'Mietvertrag').attach('pages', PNG_BUFFER, { filename: 'p1.png', contentType: 'image/png' }).attach('pages', PNG_BUFFER, { filename: 'p2.png', contentType: 'image/png' }).buffer(true).parse(binaryParser);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['x-scan-pages']).toBe('2');
    expect((res.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    expect((await anon().post('/api/scan/pdf').set('Origin', ORIGIN).attach('pages', PNG_BUFFER, { filename: 'p.png', contentType: 'image/png' })).status).toBe(401);
    expect((await client.agent.post('/api/scan/pdf').attach('pages', Buffer.from('%PDF-1.4'), { filename: 'x.pdf', contentType: 'application/pdf' })).status).toBe(400);
  });

  it('billing per family member: ?case= filters invoices, plans and totals; foreign case → 404', async () => {
    const client = await asClient();
    const main = await prisma.case.create({ data: { clientId: client.user.id, number: uniq('TV-'), profession: 'Aşpaz' } });
    const member = await prisma.case.create({ data: { clientId: client.user.id, number: uniq('TV-'), profession: 'Familiennachzug', visaType: 'FAMILY', parentCaseId: main.id, relation: 'spouse' } });
    const inv = (caseId: string | null, gross: number) =>
      prisma.clientInvoice.create({ data: { number: uniq('TV-KR-'), clientId: client.user.id, caseId, issueDate: new Date(), dueDate: new Date(Date.now() + 7 * 86_400_000), items: [], netCents: gross, vatCents: 0, grossCents: gross, status: 'SENT' } });
    await inv(main.id, 10000);
    await inv(member.id, 5000);
    await inv(null, 1000);
    await prisma.paymentPlan.create({ data: { clientId: client.user.id, caseId: member.id, title: 'Spouse plan', totalCents: 5000 } });

    const all = expectStatus(await client.agent.get('/api/account/billing'), 200).body;
    expect(all.invoices).toHaveLength(3);
    expect(all.totals.invoicedCents).toBe(16000);
    expect(all.caseId).toBeNull();
    const spouse = expectStatus(await client.agent.get(`/api/account/billing?case=${member.id}`), 200).body;
    expect(spouse.invoices.map((i: { grossCents: number }) => i.grossCents)).toEqual([5000]);
    expect(spouse.totals.invoicedCents).toBe(5000);
    expect(spouse.plans.map((p: { title: string }) => p.title)).toEqual(['Spouse plan']);
    // the main applicant's view includes invoices without a case
    const mine = expectStatus(await client.agent.get(`/api/account/billing?case=${main.id}`), 200).body;
    expect(mine.invoices.map((i: { grossCents: number }) => i.grossCents).sort()).toEqual([1000, 10000]);
    expect(mine.plans).toHaveLength(0);
    const other = await asClient();
    const otherCase = await prisma.case.create({ data: { clientId: other.user.id, number: uniq('TV-'), profession: 'X' } });
    expect((await client.agent.get(`/api/account/billing?case=${otherCase.id}`)).status).toBe(404);
  });
});
