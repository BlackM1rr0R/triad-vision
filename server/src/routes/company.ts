import { Router, type RequestHandler } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { ApplicationStatus, Company } from '@prisma/client';
import { prisma } from '../db.js';
import { issueSession, requireRole, setSessionCookie, wantsBearerToken } from '../middleware/auth.js';
import { HttpError, badRequest, conflict, forbidden, limiter, notFound, parse } from '../lib/http.js';
import { notifyStaff } from '../lib/notifications.js';
import { sendVerificationEmail } from '../lib/emailVerification.js';
import { audit } from '../lib/audit.js';
import { notifyApplicationStatus } from '../lib/jobsNotifications.js';
import {
  SECTORS,
  anonymisedProfile,
  anonymisedProfileSelect,
  companyVacancyInput,
  companyVacancyPatch,
  employerVisibleWhere,
  uniqueSlug,
  vacancyData,
  fillL10n,
} from '../lib/vacancies.js';
import { password, publicUser } from './auth.js';
import { emitWebhook } from '../lib/ops/webhooks.js';

// Employer portal API — mounted at /api/company (COMPANY role)
export const companyRouter = Router();

const registerLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 10 });

const optStr = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === '' ? null : v));

const website = z
  .string()
  .trim()
  .max(300)
  .nullable()
  .optional()
  .transform((v, ctx) => {
    if (!v) return v === undefined ? undefined : null;
    const url = /^https?:\/\//i.test(v) ? v : `https://${v}`;
    try {
      const u = new URL(url);
      if (!u.hostname.includes('.')) throw new Error('host');
      return u.toString();
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'INVALID_URL' });
      return z.NEVER;
    }
  });

/** Company details an employer (or staff) may edit. */
export const companyFields = {
  name: z.string().trim().min(2).max(160),
  legalForm: optStr(40),
  sector: z.enum(SECTORS),
  city: z.string().trim().min(2).max(80),
  address: optStr(300),
  vatId: optStr(40),
  website,
  phone: z.string().trim().min(5).max(40),
  contactName: optStr(120),
};

// ─── Public: employer self-registration ────────────────────────────────

companyRouter.post('/register', registerLimiter, async (req, res) => {
  const body = parse(
    z.object({
      company: z.object({
        name: companyFields.name,
        legalForm: companyFields.legalForm,
        sector: companyFields.sector,
        city: companyFields.city,
        address: companyFields.address,
        vatId: companyFields.vatId,
        website: companyFields.website,
        phone: companyFields.phone,
      }),
      user: z.object({
        firstName: z.string().trim().min(1).max(80),
        lastName: z.string().trim().min(1).max(80),
        email: z.string().trim().toLowerCase().email().max(200),
        password,
      }),
      locale: z.enum(['az', 'de', 'en', 'ru']).default('de'),
      acceptTerms: z.literal(true),
    }),
    req.body,
  );
  if (await prisma.user.findUnique({ where: { email: body.user.email } })) throw conflict('EMAIL_TAKEN');

  const passwordHash = await bcrypt.hash(body.user.password, 12);
  const { company, user } = await prisma.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: {
        ...body.company,
        contactName: `${body.user.firstName} ${body.user.lastName}`,
        email: body.user.email,
        status: 'PENDING',
      },
    });
    const user = await tx.user.create({
      data: {
        email: body.user.email,
        passwordHash,
        role: 'COMPANY',
        firstName: body.user.firstName,
        lastName: body.user.lastName,
        phone: body.company.phone,
        locale: body.locale,
        companyId: company.id,
      },
    });
    return { company, user };
  });

  await sendVerificationEmail(user.id).catch((err) => console.error('[company] verification email failed', err));
  await notifyStaff(
    `Yeni işəgötürən qeydiyyatı: ${company.name}`.slice(0, 180),
    `${company.name} (${company.city}) qeydiyyatdan keçdi və təsdiq gözləyir.\n\nƏlaqə: ${user.firstName} ${user.lastName}, ${user.email}, ${company.phone ?? ''}`,
    { link: `/admin/companies?id=${company.id}`, type: 'COMPANY_REGISTERED' },
  );
  await audit(req, 'COMPANY_REGISTERED', `company:${company.id}`, { userId: user.id });

  const client = wantsBearerToken(req) ? 'mobile' : 'web';
  const { token, session } = await issueSession(user.id, { client, ip: req.ip, userAgent: req.get('user-agent') });
  if (client === 'web') setSessionCookie(res, token, client);
  res.status(201).json({
    user: publicUser(user),
    company: companyView(company),
    session: { id: session.id, expiresAt: session.expiresAt },
    ...(client === 'mobile' ? { token } : {}),
  });
});

// ─── Everything below: signed-in employer ──────────────────────────────

const loadCompany: RequestHandler = async (req, res, next) => {
  const u = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { company: true } });
  if (!u?.company) return next(forbidden('NO_COMPANY'));
  res.locals.company = u.company;
  // A suspended employer can still see its status page, nothing else.
  if (u.company.status === 'SUSPENDED' && !(req.method === 'GET' && req.path === '/me')) return next(forbidden('COMPANY_SUSPENDED'));
  next();
};

companyRouter.use(requireRole('COMPANY'), loadCompany);

const co = (res: { locals: Record<string, unknown> }) => res.locals.company as Company;

/** Company as shown to its own users (the internal staff note is never included). */
const companyView = (c: Company) => ({
  id: c.id,
  name: c.name,
  legalForm: c.legalForm,
  sector: c.sector,
  city: c.city,
  address: c.address,
  vatId: c.vatId,
  website: c.website,
  contactName: c.contactName,
  phone: c.phone,
  email: c.email,
  status: c.status,
  createdAt: c.createdAt,
});

companyRouter.get('/me', async (_req, res) => {
  res.json({ company: companyView(co(res)) });
});

companyRouter.patch('/me', async (req, res) => {
  const body = parse(
    z.object({
      name: companyFields.name.optional(),
      legalForm: companyFields.legalForm,
      sector: companyFields.sector.optional(),
      city: companyFields.city.optional(),
      address: companyFields.address,
      vatId: companyFields.vatId,
      website: companyFields.website,
      phone: companyFields.phone.optional(),
      contactName: companyFields.contactName,
    }),
    req.body,
  );
  const company = await prisma.company.update({ where: { id: co(res).id }, data: body });
  await audit(req, 'COMPANY_PROFILE_UPDATED', `company:${company.id}`, { fields: Object.keys(body) });
  res.json({ company: companyView(company) });
});

// ─── Dashboard ──────────────────────────────────────────────────────────

/** Candidate-portal steps: documents, contract, embassy documents, appointment, decision, result. */
const STEP: Record<string, number> = {
  DOCUMENTS_PENDING: 0,
  DOCUMENTS_REVIEW: 0,
  CONTRACT_SENT: 1,
  CONTRACT_SIGNED: 1,
  EMBASSY_DOCUMENTS: 2,
  EMBASSY_REVIEW: 2,
  APPOINTMENT_SCHEDULED: 3,
  DECISION_PENDING: 4,
  APPROVED: 5,
  REJECTED: 5,
  CANCELLED: -1,
};
const STEP_COUNT = 6;

companyRouter.get('/dashboard', async (_req, res) => {
  const companyId = co(res).id;
  const [vacByStatus, appByStatus, cases, recent] = await Promise.all([
    prisma.vacancy.groupBy({ by: ['status'], where: { companyId }, _count: { _all: true } }),
    prisma.vacancyApplication.groupBy({
      by: ['status'],
      where: { vacancy: { companyId }, ...employerVisibleWhere },
      _count: { _all: true },
    }),
    prisma.case.findMany({ where: { companyId }, select: { status: true } }),
    prisma.vacancyApplication.findMany({
      where: { vacancy: { companyId }, status: 'PROPOSED' },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: { id: true, matchScore: true, updatedAt: true, vacancy: { select: { id: true, title: true } }, user: { select: anonymisedProfileSelect } },
    }),
  ]);
  const workersByStep = Array.from({ length: STEP_COUNT }, () => 0);
  let cancelled = 0;
  for (const c of cases) {
    const s = STEP[c.status];
    if (s < 0) cancelled++;
    else workersByStep[s]++;
  }
  res.json({
    company: { status: co(res).status, name: co(res).name },
    vacancies: Object.fromEntries(vacByStatus.map((v) => [v.status, v._count._all])),
    applications: Object.fromEntries(appByStatus.map((a) => [a.status, a._count._all])),
    workers: { total: cases.length - cancelled, byStep: workersByStep, approved: cases.filter((c) => c.status === 'APPROVED').length },
    awaitingDecision: recent.map((a) => ({ id: a.id, matchScore: a.matchScore, updatedAt: a.updatedAt, vacancy: a.vacancy, candidate: anonymisedProfile(a.user) })),
  });
});

// ─── Vacancies ──────────────────────────────────────────────────────────

const ownVacancy = async (companyId: string, id: string) => {
  const v = await prisma.vacancy.findUnique({ where: { id } });
  if (!v || v.companyId !== companyId) throw notFound('VACANCY_NOT_FOUND');
  return v;
};

companyRouter.get('/vacancies', async (_req, res) => {
  const items = await prisma.vacancy.findMany({ where: { companyId: co(res).id }, orderBy: { createdAt: 'desc' } });
  const counts = items.length
    ? await prisma.vacancyApplication.groupBy({
        by: ['vacancyId', 'status'],
        where: { vacancyId: { in: items.map((v) => v.id) }, ...employerVisibleWhere },
        _count: { _all: true },
      })
    : [];
  res.json({
    items: items.map((v) => ({
      ...v,
      candidates: Object.fromEntries(counts.filter((c) => c.vacancyId === v.id).map((c) => [c.status, c._count._all])),
    })),
  });
});

companyRouter.get('/vacancies/:id', async (req, res) => {
  const v = await ownVacancy(co(res).id, String(req.params.id));
  res.json({ vacancy: v });
});

companyRouter.post('/vacancies', async (req, res) => {
  const body = parse(companyVacancyInput, req.body);
  const data = vacancyData(body);
  const title = fillL10n(body.title);
  const vacancy = await prisma.vacancy.create({
    data: {
      ...(data as object),
      title,
      description: fillL10n(body.description),
      slug: await uniqueSlug(title, body.city),
      companyId: co(res).id,
      status: 'DRAFT',
    } as never,
  });
  res.status(201).json({ vacancy });
});

companyRouter.patch('/vacancies/:id', async (req, res) => {
  const v = await ownVacancy(co(res).id, String(req.params.id));
  if (v.status === 'CLOSED') throw conflict('VACANCY_CLOSED');
  const body = parse(companyVacancyPatch, req.body);
  const data = vacancyData(body);
  if ((body.salaryMin !== undefined || body.salaryMax !== undefined) && (body.salaryMin ?? v.salaryMin) != null && (body.salaryMax ?? v.salaryMax) != null) {
    if ((body.salaryMin ?? v.salaryMin)! > (body.salaryMax ?? v.salaryMax)!) throw badRequest('SALARY_RANGE');
  }
  // A live vacancy that changes goes back to review before the public sees the new text.
  const backToReview = v.status === 'OPEN';
  const vacancy = await prisma.vacancy.update({ where: { id: v.id }, data: { ...data, ...(backToReview ? { status: 'PENDING' } : {}) } });
  if (backToReview) {
    await notifyStaff(
      `Vakansiya dəyişdirildi: ${co(res).name}`.slice(0, 180),
      `"${(vacancy.title as Record<string, string>).az}" vakansiyası işəgötürən tərəfindən dəyişdirildi və yenidən yoxlama gözləyir.`,
      { link: `/admin/vacancies?id=${vacancy.id}`, type: 'VACANCY_PENDING' },
    );
  }
  res.json({ vacancy });
});

companyRouter.post('/vacancies/:id/submit', async (req, res) => {
  const company = co(res);
  if (company.status !== 'ACTIVE') throw forbidden('COMPANY_NOT_APPROVED');
  const v = await ownVacancy(company.id, String(req.params.id));
  const { count } = await prisma.vacancy.updateMany({ where: { id: v.id, status: 'DRAFT' }, data: { status: 'PENDING' } });
  if (!count) throw conflict('INVALID_TRANSITION');
  await notifyStaff(
    `Yoxlama üçün yeni vakansiya: ${company.name}`.slice(0, 180),
    `${company.name} "${(v.title as Record<string, string>).az}" vakansiyasını yoxlamaya göndərdi.`,
    { link: `/admin/vacancies?id=${v.id}`, type: 'VACANCY_PENDING' },
  );
  res.json({ ok: true });
});

companyRouter.post('/vacancies/:id/close', async (req, res) => {
  const v = await ownVacancy(co(res).id, String(req.params.id));
  const { count } = await prisma.vacancy.updateMany({ where: { id: v.id, status: { not: 'CLOSED' } }, data: { status: 'CLOSED' } });
  if (!count) throw conflict('INVALID_TRANSITION');
  res.json({ ok: true });
});

companyRouter.delete('/vacancies/:id', async (req, res) => {
  const v = await ownVacancy(co(res).id, String(req.params.id));
  if (v.status !== 'DRAFT') throw conflict('ONLY_DRAFTS_CAN_BE_DELETED');
  if (await prisma.vacancyApplication.count({ where: { vacancyId: v.id } })) throw conflict('VACANCY_HAS_APPLICATIONS');
  await prisma.vacancy.delete({ where: { id: v.id } });
  res.json({ ok: true });
});

// ─── Proposed candidates (anonymised) ──────────────────────────────────

companyRouter.get('/candidates', async (req, res) => {
  const q = parse(
    z.object({ vacancyId: z.string().max(40).optional(), status: z.enum(['PROPOSED', 'INTERVIEW', 'ACCEPTED', 'REJECTED']).optional() }),
    req.query,
  );
  const items = await prisma.vacancyApplication.findMany({
    where: {
      vacancy: { companyId: co(res).id },
      ...(q.vacancyId ? { vacancyId: q.vacancyId } : {}),
      AND: [employerVisibleWhere, ...(q.status ? [{ status: q.status }] : [])],
    },
    orderBy: [{ updatedAt: 'desc' }],
    select: {
      id: true,
      status: true,
      matchScore: true,
      companyNote: true,
      updatedAt: true,
      vacancy: { select: { id: true, title: true, slug: true } },
      user: { select: anonymisedProfileSelect },
    },
  });
  res.json({ items: items.map(({ user, ...a }) => ({ ...a, candidate: anonymisedProfile(user) })) });
});

const DECISIONS: Record<'INTERVIEW' | 'ACCEPT' | 'REJECT', { to: ApplicationStatus; from: ApplicationStatus[] }> = {
  INTERVIEW: { to: 'INTERVIEW', from: ['PROPOSED'] },
  ACCEPT: { to: 'ACCEPTED', from: ['PROPOSED', 'INTERVIEW'] },
  REJECT: { to: 'REJECTED', from: ['PROPOSED', 'INTERVIEW'] },
};

companyRouter.post('/candidates/:id/decision', async (req, res) => {
  const body = parse(z.object({ action: z.enum(['INTERVIEW', 'ACCEPT', 'REJECT']), note: z.string().trim().max(2000).optional() }), req.body);
  const company = co(res);
  const app = await prisma.vacancyApplication.findUnique({
    where: { id: String(req.params.id) },
    include: { vacancy: { select: { id: true, companyId: true, title: true } }, user: { select: { firstName: true, lastName: true } } },
  });
  if (!app || app.vacancy.companyId !== company.id || !['PROPOSED', 'INTERVIEW', 'ACCEPTED'].includes(app.status)) {
    throw notFound('APPLICATION_NOT_FOUND');
  }
  const rule = DECISIONS[body.action];
  const { count } = await prisma.vacancyApplication.updateMany({
    where: { id: app.id, status: { in: rule.from } },
    // companyNote marks that the employer decided (keeps a rejected candidate visible to them).
    data: { status: rule.to, companyNote: body.note ?? app.companyNote ?? '' },
  });
  if (!count) throw new HttpError(409, 'INVALID_TRANSITION');

  const actionAz = { INTERVIEW: 'müsahibə istəyir', ACCEPT: 'namizədi qəbul etdi', REJECT: 'namizədi rədd etdi' }[body.action];
  await notifyStaff(
    `İşəgötürən qərarı: ${company.name}`.slice(0, 180),
    `${company.name} ${actionAz}: ${app.user.firstName} ${app.user.lastName} — "${(app.vacancy.title as Record<string, string>).az}".${body.note ? `\n\nQeyd: ${body.note}` : ''}`,
    { link: `/admin/candidates?id=${app.userId}`, type: 'EMPLOYER_DECISION' },
  );
  await notifyApplicationStatus(app.userId, app.vacancy, rule.to);
  await audit(req, 'EMPLOYER_DECISION', `application:${app.id}`, { action: body.action });
  await emitWebhook('application.status_changed', { id: app.id, vacancyId: app.vacancy.id, from: app.status, to: rule.to, by: 'company' }, company.id);
  res.json({ ok: true, status: rule.to });
});

// ─── Our workers (cases placed with this company) ──────────────────────

companyRouter.get('/workers', async (_req, res) => {
  const cases = await prisma.case.findMany({
    where: { companyId: co(res).id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      status: true,
      profession: true,
      createdAt: true,
      appointmentAt: true,
      decisionAt: true,
      visaValidFrom: true,
      client: { select: anonymisedProfileSelect },
      vacancy: { select: { id: true, title: true } },
      visaCategory: { select: { title: true, visaLabel: true, processingMin: true, processingMax: true } },
    },
  });
  const WEEK = 7 * 24 * 60 * 60 * 1000;
  res.json({
    stepCount: STEP_COUNT,
    items: cases.map((c) => {
      const vc = c.visaCategory;
      // Expected decision window from the visa category's typical processing time.
      const expected =
        vc?.processingMin != null && vc.processingMax != null && !['APPROVED', 'REJECTED', 'CANCELLED'].includes(c.status)
          ? { from: new Date(c.createdAt.getTime() + vc.processingMin * WEEK), to: new Date(c.createdAt.getTime() + vc.processingMax * WEEK) }
          : null;
      return {
        id: c.id,
        name: anonymisedProfile(c.client).name,
        profession: c.profession,
        status: c.status,
        step: STEP[c.status],
        startedAt: c.createdAt,
        appointmentAt: c.appointmentAt,
        decisionAt: c.decisionAt,
        visaValidFrom: c.visaValidFrom,
        expectedDecision: expected,
        vacancy: c.vacancy,
        visa: vc ? { title: vc.title, visaLabel: vc.visaLabel } : null,
      };
    }),
  });
});
