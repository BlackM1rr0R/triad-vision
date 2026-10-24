import { beforeEach, describe, expect, it } from 'vitest';
import { anon, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { l10n } from '../helpers/factories';
import { asCandidate, asCompany, createVacancy } from './vacancies.fixtures';
import { cleanOps } from './ops.fixtures';
import { BLUE_CARD } from '../../src/lib/ai/features/caseAi/config.js';

beforeEach(cleanOps);

const tokenOf = (url: string) => url.split('/kandidat/')[1];

/** A tiny but well-formed MP4 header ("ftyp" box) padded to a few KB. */
const mp4 = () => {
  const head = Buffer.from([0, 0, 0, 0x18, ...Buffer.from('ftypisom'), 0, 0, 2, 0, ...Buffer.from('isomiso2')]);
  return Buffer.concat([head, Buffer.alloc(4096, 1)]);
};

describe('recognition (Anerkennung) in the match score', () => {
  it('staff set the status; a nursing vacancy ranks a recognised candidate higher', async () => {
    const staff = await asStaff();
    const vacancy = await createVacancy({ profession: 'Pflegefachkraft', drivingLicence: null, germanLevel: 'B1', minExperience: 0 });
    const a = await asCandidate({ profession: 'Tibb bacısı', germanLevel: 'B2' });
    const b = await asCandidate({ firstName: 'Leyla', profession: 'Tibb bacısı', germanLevel: 'B2' });

    const set = await staff.agent.patch(`/api/admin/placement/candidates/${a.user.id}/recognition`).send({ recognitionStatus: 'RECOGNISED', recognitionNote: 'Bescheid 2026-02' });
    expect(set.status).toBe(200);
    expect(set.body).toEqual({ recognitionStatus: 'RECOGNISED', recognitionNote: 'Bescheid 2026-02' });
    expect((await staff.agent.patch(`/api/admin/placement/candidates/${a.user.id}/recognition`).send({ recognitionStatus: 'MAYBE' })).status).toBe(400);
    expect((await staff.agent.patch(`/api/admin/placement/candidates/${staff.user.id}/recognition`).send({ recognitionStatus: 'NONE' })).status).toBe(404);
    expect((await a.agent.patch(`/api/admin/placement/candidates/${a.user.id}/recognition`).send({ recognitionStatus: 'NONE' })).status).toBe(403);

    const ranked = await staff.agent.get(`/api/admin/candidates?vacancyId=${vacancy.id}`);
    expect(ranked.body.items.map((i: { id: string }) => i.id)).toEqual([a.user.id, b.user.id]);
    expect(ranked.body.items[0].match).toMatchObject({ score: 100, gaps: [] });
    expect(ranked.body.items[1].match.gaps).toEqual([{ code: 'RECOGNITION', required: 'RECOGNISED', actual: null }]);
    expect(ranked.body.items[1].match.parts.recognition).toBe(0);

    const detail = await staff.agent.get(`/api/admin/vacancies/${vacancy.id}/suggestions`);
    expect(detail.body.items[0].match.parts).toBeDefined();

    // The candidate sets it in the profile too.
    const me = await b.agent.patch('/api/auth/me').send({ recognitionStatus: 'IN_PROGRESS', recognitionNote: 'Antrag gestellt' });
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ recognitionStatus: 'IN_PROGRESS', recognitionNote: 'Antrag gestellt' });
  });
});

describe('employer share link', () => {
  const setup = async () => {
    const staff = await asStaff({ locale: 'de' });
    const employer = await asCompany();
    const candidate = await asCandidate();
    const vacancy = await createVacancy({ companyId: employer.company.id });
    const application = await prisma.vacancyApplication.create({ data: { vacancyId: vacancy.id, userId: candidate.user.id, status: 'PROPOSED', matchScore: 90 } });
    const kase = await prisma.case.create({ data: { number: 'TV-2026-7001', clientId: candidate.user.id, profession: 'LKW-Fahrer', assignedStaffId: staff.user.id } });
    const passport = await prisma.documentRequirement.create({ data: { caseId: kase.id, stage: 'INITIAL', title: l10n('Pass'), sortOrder: 1 } });
    await prisma.documentRequirement.create({ data: { caseId: kase.id, stage: 'INITIAL', title: l10n('Diplom'), sortOrder: 2 } });
    await prisma.documentRequirement.create({ data: { caseId: kase.id, stage: 'INITIAL', title: l10n('Optional'), required: false, sortOrder: 3 } });
    await prisma.document.create({
      data: { caseId: kase.id, requirementId: passport.id, stage: 'INITIAL', originalName: 'pass.pdf', storedName: `pass-${kase.id}.pdf`, mimeType: 'application/pdf', size: 10, status: 'ACCEPTED', uploadedById: candidate.user.id },
    });
    return { staff, employer, candidate, vacancy, application, kase };
  };

  it('staff create a link; the employer sees an anonymised profile, match, document status and decides once', async () => {
    const { staff, employer, candidate, application } = await setup();
    const created = await staff.agent.post(`/api/admin/placement/candidates/${candidate.user.id}/share-links`).send({ applicationId: application.id, days: 7 });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const token = tokenOf(created.body.url);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const row = await prisma.candidateShareLink.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(row.tokenHash).not.toContain(token);
    expect(row.companyId).toBe(employer.company.id);

    const view = await anon().get(`/api/candidate-share/${token}`);
    expect(view.status).toBe(200);
    expect(view.headers['x-robots-tag']).toBe('noindex, nofollow');
    const s = view.body.share;
    expect(s.candidate).toMatchObject({ name: 'Ali M.', profession: 'Sürücü', germanLevel: 'B1' });
    expect(s.company).toEqual({ name: employer.company.name });
    expect(s.match.score).toBe(100);
    expect(s.documents).toMatchObject({ total: 2, approved: 1, missing: 1 });
    expect(s.documents.items.map((i: { state: string }) => i.state)).toEqual(['approved', 'missing']);
    expect(s.cv.available).toBe(true);
    expect(s.video.available).toBe(false);
    const raw = JSON.stringify(view.body);
    for (const secret of ['Məmmədov', '@test.local', '+994', '1990', 'Nizami', 'pass.pdf', candidate.user.id]) expect(raw).not.toContain(secret);
    expect((await prisma.candidateShareLink.findUniqueOrThrow({ where: { id: row.id } })).viewCount).toBe(1);

    const pdf = await anon().get(`/api/candidate-share/${token}/cv.pdf`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect((await anon().get(`/api/candidate-share/${token}/video`)).status).toBe(404);

    expect((await anon().post(`/api/candidate-share/${token}/decision`).send({ decision: 'INTERESTED', name: 'X' })).status).toBe(400);
    const decided = await anon().post(`/api/candidate-share/${token}/decision`).send({ decision: 'INTERESTED', name: 'Hans Becker', note: 'Bitte Termin nächste Woche' });
    expect(decided.status).toBe(200);
    expect(decided.body.share.decision).toMatchObject({ decision: 'INTERESTED', decidedByName: 'Hans Becker' });
    expect((await anon().post(`/api/candidate-share/${token}/decision`).send({ decision: 'REJECTED', name: 'Hans Becker' })).body.error).toBe('ALREADY_DECIDED');

    // Written to the application and announced to the staff member (creator = case manager, one notification).
    const app = await prisma.vacancyApplication.findUniqueOrThrow({ where: { id: application.id } });
    expect(app.companyNote).toContain('Interesse — Hans Becker: Bitte Termin nächste Woche');
    const notes = await prisma.notification.findMany({ where: { userId: staff.user.id, type: 'CANDIDATE_SHARE_DECISION' } });
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toContain('Interesse');

    const list = await staff.agent.get(`/api/admin/placement/candidates/${candidate.user.id}/share-links`);
    expect(list.body.sharingAllowed).toBe(true);
    expect(list.body.items[0]).toMatchObject({ status: 'active', viewCount: 1, decision: 'INTERESTED', company: { name: employer.company.name } });
    expect(JSON.stringify(list.body)).not.toContain(token);
  });

  it('revoked, expired and unknown links answer 404; the CV respects shareWithEmployers', async () => {
    const { staff, candidate } = await setup();
    const make = async () => (await staff.agent.post(`/api/admin/placement/candidates/${candidate.user.id}/share-links`).send({})).body as { id: string; url: string };
    const a = await make();
    await prisma.candidateCv.create({ data: { userId: candidate.user.id, data: {}, shareWithEmployers: false } });
    const view = await anon().get(`/api/candidate-share/${tokenOf(a.url)}`);
    expect(view.body.share.cv.available).toBe(false);
    expect(view.body.share.match).toBeNull();
    expect((await anon().get(`/api/candidate-share/${tokenOf(a.url)}/cv.pdf`)).status).toBe(404);

    expect((await staff.agent.post(`/api/admin/placement/share-links/${a.id}/revoke`)).status).toBe(200);
    expect((await anon().get(`/api/candidate-share/${tokenOf(a.url)}`)).status).toBe(404);

    const b = await make();
    await prisma.candidateShareLink.update({ where: { id: b.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await anon().get(`/api/candidate-share/${tokenOf(b.url)}`)).status).toBe(404);
    expect((await anon().get('/api/candidate-share/not-a-token')).status).toBe(404);
    expect((await anon().get(`/api/candidate-share/${'x'.repeat(43)}`)).status).toBe(404);
  });

  it('an explicit "no" to employer sharing blocks new links and closes existing ones', async () => {
    const { staff, candidate } = await setup();
    const link = (await staff.agent.post(`/api/admin/placement/candidates/${candidate.user.id}/share-links`).send({})).body as { url: string };
    await prisma.consentRecord.create({ data: { userId: candidate.user.id, type: 'EMPLOYER_SHARING', granted: false, version: 'v1', source: 'PRIVACY_CENTER' } });
    expect((await anon().get(`/api/candidate-share/${tokenOf(link.url)}`)).status).toBe(404);
    const again = await staff.agent.post(`/api/admin/placement/candidates/${candidate.user.id}/share-links`).send({});
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('EMPLOYER_SHARING_DECLINED');
    expect((await staff.agent.get(`/api/admin/placement/candidates/${candidate.user.id}/share-links`)).body.sharingAllowed).toBe(false);
  });

  it('refuses an application of another candidate', async () => {
    const { staff, application } = await setup();
    const other = await asCandidate({ firstName: 'Rəşad' });
    const res = await staff.agent.post(`/api/admin/placement/candidates/${other.user.id}/share-links`).send({ applicationId: application.id });
    expect(res.status).toBe(400);
  });
});

describe('intro video', () => {
  it('the candidate uploads a video; staff and a share link stream it; bad content is refused', async () => {
    const staff = await asStaff();
    const c = await asCandidate();
    expect((await c.agent.get('/api/intro-video')).body.video).toBeNull();
    const bad = await c.agent.post('/api/intro-video').attach('file', Buffer.alloc(4096, 7), { filename: 'x.mp4', contentType: 'video/mp4' });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('FILE_CONTENT_MISMATCH');
    const wrongType = await c.agent.post('/api/intro-video').attach('file', Buffer.from('%PDF-1.4'), { filename: 'x.pdf', contentType: 'application/pdf' });
    expect(wrongType.status).toBe(400);

    const up = await c.agent.post('/api/intro-video').attach('file', mp4(), { filename: 'intro.mp4', contentType: 'video/mp4' });
    expect(up.status, JSON.stringify(up.body)).toBe(201);
    expect(up.body.video).toMatchObject({ mimeType: 'video/mp4' });
    const own = await c.agent.get('/api/intro-video/file');
    expect(own.status).toBe(200);
    expect(own.headers['content-type']).toBe('video/mp4');
    const range = await c.agent.get('/api/intro-video/file').set('Range', 'bytes=0-9');
    expect(range.status).toBe(206);

    expect((await staff.agent.get(`/api/admin/placement/candidates/${c.user.id}/intro-video/file`)).status).toBe(200);
    expect((await staff.agent.get(`/api/admin/candidates/${c.user.id}`)).body.candidate.hasIntroVideo).toBe(true);
    const link = (await staff.agent.post(`/api/admin/placement/candidates/${c.user.id}/share-links`).send({})).body as { url: string };
    const shared = await anon().get(`/api/candidate-share/${tokenOf(link.url)}`);
    expect(shared.body.share.video.available).toBe(true);
    expect((await anon().get(`/api/candidate-share/${tokenOf(link.url)}/video`)).status).toBe(200);
    expect(JSON.stringify(shared.body)).not.toMatch(/\.mp4/);

    expect((await staff.agent.post('/api/intro-video').attach('file', mp4(), { filename: 'intro.mp4', contentType: 'video/mp4' })).status).toBe(403);
    expect((await c.agent.delete('/api/intro-video')).status).toBe(200);
    expect((await c.agent.get('/api/intro-video/file')).status).toBe(404);
  });
});

describe('interview evaluations', () => {
  const setup = async () => {
    const companyA = await asCompany();
    const companyB = await asCompany();
    const staff = await asStaff();
    const candidate = await asCandidate();
    const vacancy = await createVacancy({ companyId: companyA.company.id });
    const application = await prisma.vacancyApplication.create({ data: { vacancyId: vacancy.id, userId: candidate.user.id, status: 'INTERVIEW' } });
    const at = (h: number) => new Date(Date.now() + h * 3600_000);
    const past = await prisma.interview.create({ data: { applicationId: application.id, companyId: companyA.company.id, candidateId: candidate.user.id, staffId: staff.user.id, startsAt: at(-2), endsAt: at(-1), status: 'CONFIRMED' } });
    const future = await prisma.interview.create({ data: { applicationId: application.id, companyId: companyA.company.id, candidateId: candidate.user.id, startsAt: at(24), endsAt: at(25), status: 'CONFIRMED' } });
    return { companyA, companyB, staff, candidate, past, future };
  };
  const body = (overall: number, recommendation = 'HIRE') => ({
    overall,
    scores: { german: 4, skills: 5, experience: overall, motivation: 5, communication: 3 },
    recommendation,
    strengths: 'Erfahren',
    concerns: null,
  });

  it('the employer evaluates its own past interview; staff add one; the candidate card shows averages', async () => {
    const { companyA, companyB, staff, candidate, past, future } = await setup();
    expect((await companyA.agent.put(`/api/interviews/${future.id}/evaluations/mine`).send(body(4))).body.error).toBe('INTERVIEW_NOT_EVALUABLE');
    expect((await companyB.agent.put(`/api/interviews/${past.id}/evaluations/mine`).send(body(4))).status).toBe(404);
    expect((await candidate.agent.put(`/api/interviews/${past.id}/evaluations/mine`).send(body(4))).status).toBe(403);
    expect((await companyA.agent.put(`/api/interviews/${past.id}/evaluations/mine`).send({ ...body(4), overall: 6 })).status).toBe(400);

    const e1 = await companyA.agent.put(`/api/interviews/${past.id}/evaluations/mine`).send(body(4));
    expect(e1.status, JSON.stringify(e1.body)).toBe(201);
    expect(e1.body.evaluation).toMatchObject({ authorKind: 'EMPLOYER', overall: 4, recommendation: 'HIRE' });
    expect(e1.body.evaluation.authorName).toContain(companyA.company.name);
    // Writing again updates the same one.
    expect((await companyA.agent.put(`/api/interviews/${past.id}/evaluations/mine`).send(body(3, 'MAYBE'))).status).toBe(200);
    // The interview's staff owner hears about it.
    expect(await prisma.notification.count({ where: { userId: staff.user.id, type: 'INTERVIEW_EVALUATION' } })).toBe(1);

    expect((await staff.agent.put(`/api/interviews/${past.id}/evaluations/mine`).send(body(5))).status).toBe(201);

    const forEmployer = await companyA.agent.get(`/api/interviews/${past.id}/evaluations`);
    expect(forEmployer.body.items).toHaveLength(1); // only the employer side
    expect(forEmployer.body.canEvaluate).toBe(true);
    expect(forEmployer.body.mineId).toBe(e1.body.evaluation.id);
    expect((await staff.agent.get(`/api/interviews/${past.id}/evaluations`)).body.items).toHaveLength(2);

    const card = await staff.agent.get(`/api/admin/placement/candidates/${candidate.user.id}/evaluations`);
    expect(card.status).toBe(200);
    expect(card.body.items).toHaveLength(2);
    expect(card.body.summary).toMatchObject({ count: 2, overall: 4, recommendations: { HIRE: 1, MAYBE: 1, NO: 0 } });
    expect(card.body.summary.scores.experience).toBe(4);
    expect(card.body.byAuthor.EMPLOYER.overall).toBe(3);
    expect(card.body.items[0].interview.company.id).toBe(companyA.company.id);

    // Only the author (or staff) may delete.
    const staffEval = card.body.items.find((i: { authorKind: string }) => i.authorKind === 'STAFF');
    expect((await companyA.agent.delete(`/api/interviews/${past.id}/evaluations/${staffEval.id}`)).status).toBe(404);
    expect((await staff.agent.delete(`/api/interviews/${past.id}/evaluations/${staffEval.id}`)).status).toBe(200);
  });
});

describe('employment contract tracker', () => {
  const blueCardCase = async () => {
    const candidate = await asCandidate();
    const visa = await prisma.visaCategory.create({
      data: { slug: 'blue-card', icon: 'Card', image: 'x', visaLabel: '§18g', title: l10n('Blaue Karte'), summary: {}, items: {}, body: {}, processingMin: 8, processingMax: 12 },
    });
    return prisma.case.create({ data: { number: 'TV-2026-7101', clientId: candidate.user.id, profession: 'Ingenieur', visaCategoryId: visa.id } });
  };

  it('saves terms, computes probation end and Blue Card / statutory warnings, lists cases with warnings', async () => {
    const staff = await asStaff();
    const c = await blueCardCase();
    expect((await staff.agent.get(`/api/admin/placement/cases/${c.id}/contract`)).body).toMatchObject({ contract: null, context: { blueCard: true } });

    const threshold = BLUE_CARD['2026'];
    const saved = await staff.agent.put(`/api/admin/placement/cases/${c.id}/contract`).send({
      employerName: 'Muster GmbH',
      jobTitle: 'Ingenieur',
      contractType: 'FIXED',
      grossYearly: threshold.shortage - 100,
      weeklyHours: 50,
      vacationDays: 18,
      startDate: '2026-03-01',
      probationMonths: 6,
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(201);
    const k = saved.body.contract;
    expect(k.probationEndsAt.slice(0, 10)).toBe('2026-08-31');
    expect(k.grossMonthly).toBeCloseTo((threshold.shortage - 100) / 12, 1);
    expect(k.blueCardCheck).toBe('BELOW');
    expect(k.warnings.map((w: { code: string }) => w.code).sort()).toEqual(['BLUE_CARD_BELOW', 'FIXED_WITHOUT_END', 'HOURS_TOO_HIGH', 'VACATION_TOO_LOW']);

    const warnings = await staff.agent.get('/api/admin/placement/contracts?filter=warnings');
    expect(warnings.body.items.map((i: { caseId: string }) => i.caseId)).toEqual([c.id]);
    expect(warnings.body.items[0].case.number).toBe('TV-2026-7101');
    expect(warnings.body.counts.warnings).toBe(1);

    // Fix the terms: no warnings left; a manual probation end wins over the computed one.
    const fixed = await staff.agent.put(`/api/admin/placement/cases/${c.id}/contract`).send({
      contractType: 'UNLIMITED',
      grossYearly: threshold.standard,
      weeklyHours: 40,
      vacationDays: 28,
      probationEndsAt: '2026-07-15',
      signedAt: '2026-02-10',
    });
    expect(fixed.status).toBe(200);
    expect(fixed.body.contract).toMatchObject({ blueCardCheck: 'OK', warnings: [], employerName: 'Muster GmbH' });
    expect(fixed.body.contract.probationEndsAt.slice(0, 10)).toBe('2026-07-15');
    expect((await staff.agent.get('/api/admin/placement/contracts?filter=warnings')).body.items).toHaveLength(0);
    expect((await staff.agent.put(`/api/admin/placement/cases/${c.id}/contract`).send({ startDate: 'nope' })).status).toBe(400);
  });

  it('lists probation ending within 30 days and prefills from the AI contract check', async () => {
    const staff = await asStaff();
    const c = await blueCardCase();
    const soon = new Date(Date.now() + 10 * 86400_000);
    await prisma.employmentContract.create({ data: { caseId: c.id, contractType: 'UNLIMITED', probationEndsAt: soon } });
    const list = await staff.agent.get('/api/admin/placement/contracts?filter=probation');
    expect(list.body.items).toHaveLength(1);
    expect(list.body.counts.probation).toBe(1);

    expect((await staff.agent.get(`/api/admin/placement/cases/${c.id}/contract/prefill`)).status).toBe(404);
    await prisma.caseAiRun.create({
      data: {
        caseId: c.id,
        kind: 'CONTRACT',
        result: {
          file: { name: 'vertrag.pdf', documentId: null, nodeId: null, pages: 2, textLayer: true },
          terms: { employer: { name: 'Muster GmbH', address: null }, position: 'Ingenieur', startDate: '2026-04-01', endDate: null, contractType: 'permanent', grossMonthlySalary: 4300, hourlyWage: null, weeklyHours: 40, probationMonths: 6, vacationDays: 30 },
          generatedAt: '2026-03-01T10:00:00.000Z',
        },
      },
    });
    const pre = await staff.agent.get(`/api/admin/placement/cases/${c.id}/contract/prefill`);
    expect(pre.status).toBe(200);
    expect(pre.body.proposal).toMatchObject({ employerName: 'Muster GmbH', contractType: 'UNLIMITED', grossMonthly: 4300, grossYearly: 51600, vacationDays: 30, startDate: '2026-04-01' });
    const client = await asCandidate({ firstName: 'Kamran' });
    expect((await client.agent.get(`/api/admin/placement/cases/${c.id}/contract`)).status).toBe(403);
  });
});
