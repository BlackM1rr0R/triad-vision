import { afterEach, describe, expect, it } from 'vitest';
import { anon, asAdmin, asStaff, sessionAgent } from '../../helpers/api';
import { prisma, waitFor } from '../../helpers/db';
import { uniq } from '../../helpers/factories';
import { makeFormPdf, specFromMapping } from '../../helpers/formPdf';
import { expectStatus } from '../../helpers/workflow';
import { placesOf } from '../../helpers/journey';
import { asCandidate, asCompany } from '../vacancies.fixtures';
import { issueSession } from '../../../src/middleware/auth.js';
import { DEFAULT_TEMPLATES, officialFormDeps, type Fetcher } from '../../../src/lib/officialForms/service.js';

/**
 * Journey 3 — an employer company with three logins (OWNER, HR, VIEWER), through the real HTTP API:
 *
 *   the owner invites HR + VIEWER with their roles → HR writes a vacancy with 2 places (staff publish it) →
 *   candidates apply, staff present them → HR accepts (a place is taken; the last place cannot be taken twice) →
 *   staff open the visa case for the employer → HR fills the EzB in the portal wizard; the VIEWER sees no salaries
 *   and cannot open or sign it → the readiness profile card is visible only with the worker's consent.
 */

const realFetch = officialFormDeps.fetch;
afterEach(() => {
  officialFormDeps.fetch = realFetch;
});

/** The official PDFs are downloaded at runtime by "install default templates": fillable stand-ins with the same field names. */
const installOfficialForms = async (agent: ReturnType<typeof sessionAgent>) => {
  const ezb = DEFAULT_TEMPLATES.find((d) => d.key === 'EMPLOYMENT_DECLARATION')!;
  const visa = DEFAULT_TEMPLATES.find((d) => d.key === 'NATIONAL_VISA')!;
  const ezbRadios: Record<string, string[]> = {
    rbtn_1_Erklaerung: ['zur Erteilung eines Aufenthaltstitels zum Zweck der Beschaeftigung', 'zur Erteilung einer Vorabzustimmung der Bundesagentur fuer Arbeit'],
    rbtn_2_Anlass: ['Ersterteilung', 'Verlaengerung', 'Arbeitgeberwechsel'],
    chbx_46_Arbeitsentgelt: ['pro Stunde', 'pro Monat'],
  };
  const files: Record<string, Buffer> = {
    [ezb.url]: await makeFormPdf(specFromMapping(ezb.fieldMap, ezbRadios)),
    [visa.url]: await makeFormPdf(specFromMapping(visa.fieldMap)),
  };
  const fetcher: Fetcher = async (url) => {
    const buf = files[url];
    return { ok: !!buf, status: buf ? 200 : 404, arrayBuffer: async () => (buf ? buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) : new ArrayBuffer(0)) as ArrayBuffer };
  };
  officialFormDeps.fetch = fetcher;
  expectStatus(await agent.post('/api/admin/official-forms/templates/install-defaults'), 200);
};

describe('journey: employer company with OWNER + HR + VIEWER', () => {
  it('vacancy → candidates → acceptance (race-safe) → EzB wizard → consent-gated readiness card', async () => {
    const staff = await asStaff();
    const admin = await asAdmin();

    // ── 1. Owner (oldest login) invites HR and VIEWER with their roles ──────────────────────────────────────────
    const owner = await asCompany('ACTIVE', { email: `${uniq('owner')}@firma.test` });
    await prisma.user.update({ where: { id: owner.user.id }, data: { createdAt: new Date(Date.now() - 60 * 60_000) } });
    expect(expectStatus(await owner.agent.get('/api/company/access/me'), 200).body).toMatchObject({ role: 'OWNER', isOwner: true });
    const invite = async (role: 'HR' | 'VIEWER') => {
      const res = expectStatus(await owner.agent.post('/api/company/team').send({ email: `${uniq(role.toLowerCase())}@firma.test`, firstName: role, lastName: 'Kollege', role }), 201).body.member;
      expect(res.role).toBe(role);
      expect((await prisma.companyMemberAccess.findUniqueOrThrow({ where: { userId: res.id } })).role).toBe(role);
      return { id: res.id as string, agent: sessionAgent((await issueSession(res.id, { client: 'web' })).token) };
    };
    const hr = await invite('HR');
    const viewer = await invite('VIEWER');
    expect(await prisma.auditLog.count({ where: { action: 'COMPANY_TEAM_INVITED', target: `company:${owner.company.id}` } })).toBe(2);
    expect(expectStatus(await hr.agent.get('/api/company/access/me'), 200).body).toMatchObject({ role: 'HR', isOwner: false });
    expect(expectStatus(await viewer.agent.get('/api/company/access/me'), 200).body).toMatchObject({ role: 'VIEWER', isOwner: false });
    // Only the owner manages the team.
    expect((await hr.agent.post('/api/company/team').send({ email: `${uniq('x')}@firma.test`, firstName: 'X', lastName: 'Y' })).status).toBe(403);

    // ── 2. HR writes the vacancy (2 places), staff publish it; the VIEWER may not write one ────────────────────
    const vacancyBody = { title: { de: 'Koch (m/w/d)' }, description: { de: 'Restaurant in Hamburg' }, city: 'Hamburg', profession: 'Koch', germanLevel: 'A2', salaryMin: 2777, salaryMax: 3333, positions: 2 };
    const viewerWrite = await viewer.agent.post('/api/company/vacancies').send(vacancyBody);
    expect(viewerWrite.status).toBe(403);
    expect(viewerWrite.body.error).toBe('COMPANY_PERMISSION_REQUIRED');
    const draft = expectStatus(await hr.agent.post('/api/company/vacancies').send(vacancyBody), 201).body.vacancy as { id: string; slug: string; status: string; positions: number };
    expect(draft).toMatchObject({ status: 'DRAFT', positions: 2 });
    expectStatus(await hr.agent.post(`/api/company/vacancies/${draft.id}/submit`), 200);
    expect(expectStatus(await staff.agent.post(`/api/admin/vacancies/${draft.id}/approve`), 200).body.vacancy.status).toBe('OPEN');
    expect(await placesOf(draft.slug)).toEqual({ positions: 2, filled: 0, free: 2 });
    // Salaries: HR sees them, the VIEWER does not (not even the field names).
    expect(JSON.stringify(expectStatus(await hr.agent.get('/api/company/vacancies'), 200).body)).toContain('2777');
    const viewerList = JSON.stringify(expectStatus(await viewer.agent.get('/api/company/vacancies'), 200).body);
    expect(viewerList).not.toContain('2777');
    expect(viewerList).not.toContain('salaryMin');

    // ── 3. Three candidates apply; staff present them to the employer ───────────────────────────────────────────
    const cands = [await asCandidate({ firstName: 'Ali', profession: 'Koch' }), await asCandidate({ firstName: 'Rauf', profession: 'Koch' }), await asCandidate({ firstName: 'Elvin', profession: 'Koch' })];
    const apps: string[] = [];
    for (const c of cands) apps.push(expectStatus(await c.agent.post(`/api/vacancies/${draft.slug}/apply`).send({}), 201).body.application.id);
    // Not presented yet: the employer sees nobody.
    expect(expectStatus(await hr.agent.get('/api/company/candidates'), 200).body.items).toHaveLength(0);
    for (const id of apps) expectStatus(await staff.agent.patch(`/api/admin/candidates/applications/${id}`).send({ status: 'PROPOSED' }), 200);
    await waitFor(() => prisma.notification.findFirst({ where: { userId: owner.user.id, type: 'CANDIDATE_PROPOSED' } }));
    const presented = expectStatus(await hr.agent.get('/api/company/candidates'), 200).body.items as { id: string; status: string }[];
    expect(presented.map((x) => x.id).sort()).toEqual([...apps].sort());
    expect(presented.every((x) => x.status === 'PROPOSED')).toBe(true);
    // Anonymised: no surname, no e-mail.
    expect(JSON.stringify(presented)).not.toContain(cands[0].user.email);
    expect(JSON.stringify(presented)).not.toContain('Məmmədov');
    // The VIEWER has no candidate pool and no decisions.
    expect((await viewer.agent.get('/api/company/candidates')).status).toBe(403);
    expect((await viewer.agent.post(`/api/company/candidates/${apps[0]}/decision`).send({ action: 'ACCEPT' })).status).toBe(403);

    // ── 4. HR accepts: a place is taken; the last one cannot be taken twice ────────────────────────────────────
    expect(expectStatus(await hr.agent.post(`/api/company/candidates/${apps[0]}/decision`).send({ action: 'ACCEPT' }), 200).body.status).toBe('ACCEPTED');
    expect(await placesOf(draft.slug)).toEqual({ positions: 2, filled: 1, free: 1 });
    const race = await Promise.all([apps[1], apps[2]].map((id) => hr.agent.post(`/api/company/candidates/${id}/decision`).send({ action: 'ACCEPT' })));
    expect(race.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(race.find((r) => r.status === 409)!.body.error).toBe('VACANCY_FULL');
    expect(await prisma.vacancyApplication.count({ where: { vacancyId: draft.id, status: 'ACCEPTED' } })).toBe(2);
    expect(await placesOf(draft.slug)).toEqual({ positions: 2, filled: 2, free: 0 });
    // Full: nobody else can apply, but the vacancy stays on the board.
    const late = await asCandidate({ profession: 'Koch' });
    expect((await late.agent.post(`/api/vacancies/${draft.slug}/apply`).send({})).body.error).toBe('VACANCY_FULL');
    expect(expectStatus(await anon().get('/api/vacancies'), 200).body.items.map((v: { slug: string }) => v.slug)).toContain(draft.slug);
    // The accepted candidate hears about it.
    await waitFor(() => prisma.notification.findFirst({ where: { userId: cands[0].user.id, type: 'APPLICATION_STATUS' } }));

    // ── 5. Staff open the visa case of the accepted candidate for this employer ─────────────────────────────────
    // Applying already started the case (one active application): staff link it to the employer (200, not created).
    const made = expectStatus(await staff.agent.post(`/api/admin/candidates/applications/${apps[0]}/case`).send({}), 200).body;
    expect(made.created).toBe(false);
    const caseId = made.case.id as string;
    expect(await prisma.case.findUniqueOrThrow({ where: { id: caseId } })).toMatchObject({ clientId: cands[0].user.id, companyId: owner.company.id, vacancyId: draft.id });
    // The employment contract as staff entered it (pay figures for the EzB pay step).
    await prisma.employmentContract.create({
      data: { caseId, companyId: owner.company.id, jobTitle: 'Koch', contractType: 'UNLIMITED', grossMonthly: 3200, grossYearly: 38400, weeklyHours: 40, vacationDays: 26, startDate: new Date('2027-03-01T00:00:00Z') },
    });
    const workers = expectStatus(await owner.agent.get('/api/company/workers'), 200).body.items as { id: string }[];
    expect(workers.map((w) => w.id)).toContain(caseId);
    expectStatus(await viewer.agent.get('/api/company/workers'), 200); // the VIEWER sees the workers panel

    // ── 6. EzB wizard: HR starts and fills it; the VIEWER can neither open nor sign it ──────────────────────────
    await installOfficialForms(admin.agent);
    const started = expectStatus(await hr.agent.post('/api/company/forms/start').send({ caseId }), 201).body.fill as { id: string; status: string };
    expect(started.status).toBe('SENT_TO_EMPLOYER');
    expect(await prisma.auditLog.count({ where: { action: 'OFFICIAL_FORM_EMPLOYER_STARTED', target: `case:${caseId}` } })).toBe(1);
    const list = expectStatus(await hr.agent.get('/api/company/forms'), 200).body;
    expect(list.items.map((i: { id: string }) => i.id)).toContain(started.id);
    const form = expectStatus(await hr.agent.get(`/api/company/forms/${started.id}`), 200).body.form;
    expect(form.editable).toBe(true);
    const value = (key: string) => form.fields.find((f: { key: string }) => f.key === key)?.value;
    expect(value('contract.jobTitle')).toBe('Koch');
    expect(value('contract.grossMonthly')).toBe('3200');
    expect(form.fields.some((f: { key: string }) => f.key.startsWith('client.'))).toBe(false); // no worker personal data in the employer form
    const preview = await hr.agent.post(`/api/company/forms/${started.id}/preview`).send({ values: { 'company.betriebsnummer': '87654321' } });
    expect(preview.status).toBe(200);
    expect(preview.headers['content-type']).toContain('application/pdf');
    // HR passes the permission check on submit; the server asks for the missing answers.
    const incomplete = await hr.agent.post(`/api/company/forms/${started.id}/submit`).send({ values: {} });
    expect(incomplete.status).toBe(400);
    expect(incomplete.body.error).toBe('REQUIRED_MISSING');
    for (const [method, url] of [
      ['get', '/api/company/forms'],
      ['get', `/api/company/forms/${started.id}`],
      ['post', `/api/company/forms/${started.id}/preview`],
      ['post', `/api/company/forms/${started.id}/submit`],
      ['post', '/api/company/forms/start'],
    ] as const) {
      const res = await viewer.agent[method](url).send({ caseId, values: {} });
      expect(res.status, `${method} ${url}`).toBe(403);
      expect(res.body.error, `${method} ${url}`).toBe('COMPANY_PERMISSION_REQUIRED');
    }
    expect((await prisma.officialFormFill.findUniqueOrThrow({ where: { id: started.id } })).status).toBe('SENT_TO_EMPLOYER');

    // ── 7. Readiness profile card: only with the worker's consent ───────────────────────────────────────────────
    const cardUrl = `/api/company/readiness-profile/workers/${caseId}`;
    expect(expectStatus(await hr.agent.get(cardUrl), 200).body).toEqual({ profile: null });
    expect(expectStatus(await viewer.agent.get(cardUrl), 200).body).toEqual({ profile: null });
    expectStatus(await cands[0].agent.put('/api/privacy/consents').send({ READINESS_PROFILE: true }), 200);
    const card = expectStatus(await hr.agent.get(cardUrl), 200).body.profile;
    expect(card).not.toBeNull();
    expect(card.germanLevel).toBe('B1');
    expect(JSON.stringify(card)).not.toContain(cands[0].user.email);
    // Another company never sees it, the worker's consent or not.
    const other = await asCompany();
    expect((await other.agent.get(cardUrl)).status).toBe(404);
    // A candidate that was not hired: no card for this employer either (not its worker).
    const notMine = await prisma.case.create({ data: { number: uniq('TV-'), clientId: cands[1].user.id, profession: 'Koch', companyId: other.company.id } });
    expect((await hr.agent.get(`/api/company/readiness-profile/workers/${notMine.id}`)).status).toBe(404);
    // Consent withdrawn → gone again.
    expectStatus(await cands[0].agent.put('/api/privacy/consents').send({ READINESS_PROFILE: false }), 200);
    expect(expectStatus(await hr.agent.get(cardUrl), 200).body.profile).toBeNull();
  }, 120_000);
});
