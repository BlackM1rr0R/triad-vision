import { randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../helpers/db';
import { asStaff } from '../helpers/api';
import { binaryParser } from '../helpers/files';
import { uniq } from '../helpers/factories';
import { cvPdfText } from '../unit/cvPdfText';
import { bakuTime } from '../../src/lib/reports/dates.js';
import { runMonthlyEmployerReports, sendWindowOpen } from '../../src/lib/employerReports/service.js';
import { monthRange, previousMonth } from '../../src/lib/employerReports/stats.js';
import { asCandidate, asCompany, cleanJobs } from './vacancies.fixtures';

beforeEach(cleanJobs);

const DAY = 24 * 60 * 60 * 1000;

/** Employer with a worker who arrived during the reported month and one in process; plus another company. */
const setup = async (locale: 'de' | 'en' = 'de') => {
  const employer = await asCompany('ACTIVE', { locale });
  const other = await asCompany();
  const now = new Date();
  const month = previousMonth(now);
  const { start } = monthRange(month);
  const working = await asCandidate({ firstName: 'Rəşad', lastName: 'Əliyev', passportNumber: 'C1112223' });
  const kase = await prisma.case.create({
    data: { number: uniq('TV-'), clientId: working.user.id, profession: 'Koch', companyId: employer.company.id, status: 'APPROVED', decisionAt: new Date(start.getTime() + 2 * DAY), createdAt: new Date(start.getTime() + DAY), residenceTitleExpiresAt: new Date(now.getTime() + 45 * DAY) },
  });
  await prisma.arrivalPlan.create({ data: { caseId: kase.id, clientId: working.user.id, status: 'COMPLETED', arrivalTime: new Date(start.getTime() + 5 * DAY) } });
  const fu = await prisma.arrivalFollowUp.create({ data: { caseId: kase.id, clientId: working.user.id, companyId: employer.company.id, arrivedAt: new Date(start.getTime() + 5 * DAY), riskLevel: 'MEDIUM', riskScore: 30, riskReasons: [{ code: 'NO_ANSWER', points: 8, params: { count: 1 } }] } });
  // The employer's own "problem" answer: the employer-side risk view is scored from these only.
  await prisma.arrivalCheckIn.create({ data: { followUpId: fu.id, caseId: kase.id, audience: 'EMPLOYER', offsetDays: 30, dueAt: new Date(now.getTime() - 5 * DAY), sentAt: new Date(now.getTime() - 5 * DAY), tokenHash: randomBytes(32).toString('hex'), answer: 'ISSUE', answeredAt: new Date(now.getTime() - 4 * DAY) } });
  await prisma.employmentContract.create({ data: { caseId: kase.id, companyId: employer.company.id, jobTitle: 'Beikoch', probationEndsAt: new Date(now.getTime() + 20 * DAY) } });
  const proc = await asCandidate({ firstName: 'Nərmin', lastName: 'Hüseynova' });
  await prisma.case.create({ data: { number: uniq('TV-'), clientId: proc.user.id, profession: 'Koch', companyId: employer.company.id } });
  const foreign = await asCandidate({ firstName: 'Fremd', lastName: 'Person' });
  await prisma.case.create({ data: { number: uniq('TV-'), clientId: foreign.user.id, profession: 'Koch', companyId: other.company.id } });
  return { employer, other, month, kase };
};

describe('monthly employer report', () => {
  it('staff generate, preview and send; the employer lists and downloads only own reports', async () => {
    const s = await setup();
    const staff = await asStaff();

    const preview = await staff.agent.get(`/api/admin/employer-reports/preview.pdf?companyId=${s.employer.company.id}&month=${s.month}`).buffer(true).parse(binaryParser);
    expect(preview.status).toBe(200);
    expect(preview.headers['content-type']).toContain('application/pdf');
    expect(await prisma.employerReport.count()).toBe(0); // preview stores nothing

    const gen = await staff.agent.post('/api/admin/employer-reports/generate').send({ companyId: s.employer.company.id, month: s.month });
    expect(gen.status).toBe(200);
    expect(gen.body.report).toMatchObject({ month: s.month, lang: 'de', hasFile: true, sentAt: null });
    const stored = await prisma.employerReport.findFirstOrThrow({ where: { companyId: s.employer.company.id } });
    expect(stored.stats).toMatchObject({ period: { newPlacements: 1, approvals: 1, arrivals: 1 }, totals: { working: 1, inProcess: 1, atRisk: 1 } });

    // Regenerating keeps one row per month.
    await staff.agent.post('/api/admin/employer-reports/generate').send({ companyId: s.employer.company.id, month: s.month });
    expect(await prisma.employerReport.count({ where: { companyId: s.employer.company.id } })).toBe(1);

    const sent = await staff.agent.post(`/api/admin/employer-reports/${stored.id}/send`);
    expect(sent.status).toBe(200);
    expect(sent.body.recipients).toBe(1);
    expect(await prisma.emailLog.findFirst({ where: { to: s.employer.user.email, subject: { startsWith: 'Triad Vision · Monatsbericht' } } })).not.toBeNull();

    const list = await s.employer.agent.get('/api/company/reports');
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].sentAt).toBeTruthy();
    const pdf = await s.employer.agent.get(`/api/company/reports/${stored.id}/pdf`).buffer(true).parse(binaryParser);
    expect(pdf.status).toBe(200);
    const text = await cvPdfText(pdf.body as Buffer);
    expect(text).toContain('MONATSBERICHT');
    expect(text).toContain(s.employer.company.name);
    expect(text).toContain('Rəşad Ə.');
    expect(text).toContain('Beikoch');
    expect(text).toContain('Ende der Probezeit');
    expect(text).not.toContain('C1112223');
    expect(text).not.toContain('Əliyev');
    expect(text).not.toContain('Fremd');

    expect((await s.other.agent.get(`/api/company/reports/${stored.id}/pdf`)).status).toBe(404);
    expect((await s.other.agent.get('/api/company/reports')).body.items).toHaveLength(0);
    expect((await s.employer.agent.get(`/api/admin/employer-reports?companyId=${s.employer.company.id}`)).status).toBe(403);
  });

  it('writes the report in English for an English-speaking contact', async () => {
    const s = await setup('en');
    const staff = await asStaff();
    const gen = await staff.agent.post('/api/admin/employer-reports/generate').send({ companyId: s.employer.company.id, month: s.month });
    expect(gen.body.report.lang).toBe('en');
    const pdf = await staff.agent.get(`/api/admin/employer-reports/${gen.body.report.id}/pdf`).buffer(true).parse(binaryParser);
    const text = await cvPdfText(pdf.body as Buffer);
    expect(text).toContain('MONTHLY REPORT');
    expect(text).toContain('End of probation');
  });

  it('the monthly job runs once per company and month, from the 1st 08:00 Baku, and respects the opt-out', async () => {
    const s = await setup();
    const [y, m] = s.month.split('-').map(Number);
    // The 1st of the month after the report month: 07:00 not yet, 09:00 due.
    expect(sendWindowOpen(bakuTime(y, m, 1, 7, 0))).toBe(false);
    const runAt = bakuTime(y, m, 1, 9, 0);
    expect(sendWindowOpen(runAt)).toBe(true);
    expect(previousMonth(runAt)).toBe(s.month);

    // Opt-out of the employer's only user: report is generated but not e-mailed.
    expect((await s.employer.agent.put('/api/company/reports/preferences').send({ monthlyEmail: false })).body).toEqual({ monthlyEmail: false });
    expect((await s.employer.agent.get('/api/company/reports/preferences')).body).toEqual({ monthlyEmail: false });

    const first = await runMonthlyEmployerReports(runAt);
    expect(first.generated).toBe(2); // the other company has a worker, too
    const own = await prisma.employerReport.findFirstOrThrow({ where: { companyId: s.employer.company.id, month: s.month } });
    expect(own.sentAt).toBeNull();
    expect(await prisma.emailLog.count({ where: { to: s.employer.user.email, subject: { contains: 'Monatsbericht' } } })).toBe(0);
    const otherReport = await prisma.employerReport.findFirstOrThrow({ where: { companyId: s.other.company.id, month: s.month } });
    expect(otherReport.sentAt).not.toBeNull();

    const second = await runMonthlyEmployerReports(new Date(runAt.getTime() + 60 * 60 * 1000));
    expect(second.generated).toBe(0);
    expect(await prisma.employerReport.count()).toBe(2);

    // Back in: staff can send it now.
    await s.employer.agent.put('/api/company/reports/preferences').send({ monthlyEmail: true });
    const staff = await asStaff();
    expect((await staff.agent.post(`/api/admin/employer-reports/${own.id}/send`)).status).toBe(200);
  });
});
