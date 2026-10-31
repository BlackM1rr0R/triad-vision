import crypto from 'node:crypto';
import { Router, type Request } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Prisma, type Locale } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { badRequest, conflict, forbidden, notFound, parse } from '../../lib/http.js';
import { hasMinRole } from '../../middleware/auth.js';
import { companyLogoOf, singleRasterImage, storePublicImage } from '../../lib/publicImages.js';
import { cleanupRemovedImages } from '../../lib/publicImageRefs.js';
import { audit } from '../../lib/audit.js';
import { renderEmail, sendMail } from '../../lib/mailer.js';
import { notifyCompanyStatus } from '../../lib/jobsNotifications.js';
import { companyFields } from '../company.js';
import { awardEmployerCommission } from '../../lib/agents/commissions.js';
import { auditDiff, companyBankShape, companyBankView, companyLegalShape, completenessOf, stripMaskedBank, touchesBank } from '../../lib/partnerRecords/legal.js';
import { contractView, currentContract } from '../../lib/partnerRecords/contracts.js';
import { FINAL_STATUSES } from '../../lib/caseFlow.js';

// Admin: companies — mounted at /api/admin/companies
export const adminCompaniesRouter = Router();

const STATUSES = ['PENDING', 'ACTIVE', 'SUSPENDED'] as const;

/** Bank data (bank, account holder, IBAN, BIC) is ADMIN+ only: staff get it masked and may not change it. */
const canSeeBank = (req: Request) => hasMinRole(req.user!.role, 'ADMIN');
const view = <C extends Parameters<typeof companyBankView>[0]>(req: Request, c: C) => companyBankView(c, canSeeBank(req));

adminCompaniesRouter.get('/', async (req, res) => {
  const q = parse(
    z.object({
      status: z.enum(STATUSES).optional(),
      search: z.string().trim().max(120).optional(),
      page: z.coerce.number().int().min(1).max(1000).default(1),
    }),
    req.query,
  );
  const where: Prisma.CompanyWhereInput = {
    ...(q.status ? { status: q.status } : {}),
    ...(q.search
      ? {
          OR: [
            { name: { contains: q.search } },
            { city: { contains: q.search } },
            { email: { contains: q.search } },
            { vatId: { contains: q.search } },
            { users: { some: { email: { contains: q.search } } } },
          ],
        }
      : {}),
  };
  const pageSize = 25;
  const [items, total, byStatus] = await Promise.all([
    prisma.company.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      skip: (q.page - 1) * pageSize,
      take: pageSize,
      include: { _count: { select: { users: true, vacancies: true, cases: true, invoices: true } } },
    }),
    prisma.company.count({ where }),
    prisma.company.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);
  res.json({ items: items.map((c) => view(req, c)), total, pageSize, counts: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])) });
});

adminCompaniesRouter.get('/options', async (_req, res) => {
  // Small list for selects (link a case / vacancy to a company).
  const items = await prisma.company.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, city: true, status: true }, take: 1000 });
  res.json({ items });
});

adminCompaniesRouter.get('/:id', async (req, res) => {
  const company = await prisma.company.findUnique({
    where: { id: req.params.id },
    include: {
      users: {
        select: { id: true, firstName: true, lastName: true, email: true, phone: true, locale: true, isActive: true, emailVerifiedAt: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      },
      vacancies: {
        orderBy: { createdAt: 'desc' },
        select: { id: true, slug: true, title: true, status: true, city: true, positions: true, createdAt: true, publishedAt: true, _count: { select: { applications: true } } },
      },
      cases: {
        orderBy: { createdAt: 'desc' },
        select: { id: true, number: true, status: true, profession: true, createdAt: true, client: { select: { firstName: true, lastName: true } } },
      },
      _count: { select: { invoices: true } },
    },
  });
  if (!company) throw notFound('COMPANY_NOT_FOUND');
  // "Referred by": the agent (Company.referredByAgentId) or just the code the employer signed up with.
  const agent = company.referredByAgentId
    ? await prisma.agent.findUnique({ where: { id: company.referredByAgentId }, select: { id: true, code: true, user: { select: { firstName: true, lastName: true } } } })
    : null;
  res.json({
    company: view(req, company),
    completeness: completenessOf(company),
    referral: company.referralCode || agent
      ? { code: company.referralCode, at: company.referredAt, agent: agent ? { id: agent.id, code: agent.code, name: `${agent.user.firstName} ${agent.user.lastName}`.trim() } : null }
      : null,
  });
});

/**
 * Key numbers for the full company profile (/admin/companies/:id): cases per status, workers in process /
 * approved, refusals, open vacancies, the current contract with days left, contacts / activities, and — for
 * ADMIN+ — invoices (open / paid sums) and quotes.
 */
adminCompaniesRouter.get('/:id/profile', async (req, res) => {
  const company = await prisma.company.findUnique({ where: { id: String(req.params.id) }, select: { id: true } });
  if (!company) throw notFound('COMPANY_NOT_FOUND');
  const companyId = company.id;
  const admin = canSeeBank(req);
  const [byStatus, openVacancies, vacancies, contracts, contacts, activities, invoices, quotes] = await Promise.all([
    prisma.case.groupBy({ by: ['status'], where: { companyId }, _count: { _all: true } }),
    prisma.vacancy.count({ where: { companyId, status: 'OPEN' } }),
    prisma.vacancy.count({ where: { companyId } }),
    prisma.partnerContract.findMany({ where: { companyId } }),
    prisma.contact.count({ where: { companyId } }),
    prisma.partnerActivity.count({ where: { companyId } }),
    admin ? prisma.invoice.groupBy({ by: ['status'], where: { companyId }, _count: { _all: true }, _sum: { grossCents: true } }) : Promise.resolve(null),
    admin ? prisma.quote.count({ where: { companyId } }) : Promise.resolve(null),
  ]);
  const cases = Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])) as Partial<Record<string, number>>;
  const total = byStatus.reduce((a, b) => a + b._count._all, 0);
  const current = currentContract(contracts);
  const sum = (statuses: string[]) => (invoices ?? []).filter((i) => statuses.includes(i.status)).reduce((a, i) => a + (i._sum.grossCents ?? 0), 0);
  res.json({
    cases: { total, byStatus: cases, inProcess: byStatus.filter((b) => !FINAL_STATUSES.includes(b.status)).reduce((a, b) => a + b._count._all, 0), approved: cases.APPROVED ?? 0, refusals: cases.REJECTED ?? 0 },
    vacancies: { open: openVacancies, total: vacancies },
    contracts: { total: contracts.length, active: contracts.filter((c) => c.status === 'ACTIVE').length, current: current ? contractView(current) : null },
    contacts,
    activities,
    invoices: invoices
      ? { count: invoices.reduce((a, i) => a + i._count._all, 0), openCents: sum(['SENT', 'OVERDUE']), paidCents: sum(['PAID']), overdue: invoices.find((i) => i.status === 'OVERDUE')?._count._all ?? 0 }
      : null,
    quotes,
  });
});

const optionalCompanyFields = z.object({
  name: companyFields.name.optional(),
  legalForm: companyFields.legalForm,
  sector: companyFields.sector.optional(),
  city: companyFields.city.optional(),
  address: companyFields.address,
  vatId: companyFields.vatId,
  website: companyFields.website,
  phone: companyFields.phone.optional(),
  contactName: companyFields.contactName,
  email: z.string().trim().toLowerCase().email().max(200).nullable().optional(),
  note: z.string().trim().max(5000).nullable().optional(),
  ...companyLegalShape,
  ...companyBankShape,
});

const inviteInput = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email().max(200),
  locale: z.enum(['az', 'de', 'en', 'ru']).default('de'),
});

const INVITE_TEXT: Record<Locale, { title: string; body: (company: string) => string; cta: string }> = {
  az: { title: 'Triad Vision işəgötürən kabinetinə dəvət', body: (c) => `${c} üçün Triad Vision işəgötürən kabineti yaradıldı. Şifrənizi təyin etmək üçün aşağıdakı düyməyə klikləyin. Link 7 gün etibarlıdır.`, cta: 'Şifrəni təyin et' },
  de: { title: 'Einladung zum Triad-Vision-Arbeitgeberportal', body: (c) => `Für ${c} wurde ein Zugang zum Triad-Vision-Arbeitgeberportal angelegt. Klicken Sie auf die Schaltfläche, um Ihr Passwort festzulegen. Der Link ist 7 Tage gültig.`, cta: 'Passwort festlegen' },
  en: { title: 'Invitation to the Triad Vision employer portal', body: (c) => `An employer portal account was created for ${c}. Click the button below to set your password. The link is valid for 7 days.`, cta: 'Set your password' },
  ru: { title: 'Приглашение в кабинет работодателя Triad Vision', body: (c) => `Для ${c} создан доступ в кабинет работодателя Triad Vision. Нажмите кнопку ниже, чтобы задать пароль. Ссылка действительна 7 дней.`, cta: 'Задать пароль' },
};

/** Creates an employer user with an unusable random password and emails a 7-day "set your password" link. */
export const inviteUser = async (companyId: string, companyName: string, input: z.infer<typeof inviteInput>) => {
  if (await prisma.user.findUnique({ where: { email: input.email } })) throw conflict('EMAIL_TAKEN');
  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10),
      role: 'COMPANY',
      firstName: input.firstName,
      lastName: input.lastName,
      locale: input.locale,
      companyId,
    },
  });
  const token = crypto.randomBytes(32).toString('hex');
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
  const t = INVITE_TEXT[user.locale];
  void sendMail(
    user.email,
    `Triad Vision · ${t.title}`,
    renderEmail(t.title, t.body(companyName), { label: t.cta, url: `${config.clientUrl}/reset-password?token=${token}` }),
  );
  return user;
};

/** Staff create a company (active right away) and optionally invite its first user. */
adminCompaniesRouter.post('/', async (req, res) => {
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
        phone: companyFields.phone.nullable().optional(),
        contactName: companyFields.contactName,
        email: z.string().trim().toLowerCase().email().max(200).nullable().optional(),
        note: z.string().trim().max(5000).nullable().optional(),
        ...companyLegalShape,
        ...companyBankShape,
      }),
      status: z.enum(STATUSES).default('ACTIVE'),
      invite: inviteInput.optional(),
    }),
    req.body,
  );
  if (!canSeeBank(req) && touchesBank(body.company, null)) throw forbidden('ADMIN_REQUIRED');
  if (body.invite && (await prisma.user.findUnique({ where: { email: body.invite.email } }))) throw conflict('EMAIL_TAKEN');
  const company = await prisma.company.create({
    data: {
      ...body.company,
      status: body.status,
      contactName: body.company.contactName ?? (body.invite ? `${body.invite.firstName} ${body.invite.lastName}` : null),
      email: body.company.email ?? body.invite?.email ?? null,
    },
  });
  const user = body.invite ? await inviteUser(company.id, company.name, body.invite) : null;
  await audit(req, 'COMPANY_CREATED', `company:${company.id}`, { invited: user?.email ?? null, fields: Object.entries(body.company).filter(([, v]) => v != null && v !== '').map(([k]) => k) });
  res.status(201).json({ company: view(req, company), invitedUserId: user?.id ?? null });
});

adminCompaniesRouter.post('/:id/users', async (req, res) => {
  const body = parse(inviteInput, req.body);
  const company = await prisma.company.findUnique({ where: { id: req.params.id } });
  if (!company) throw notFound('COMPANY_NOT_FOUND');
  const user = await inviteUser(company.id, company.name, body);
  await audit(req, 'COMPANY_USER_INVITED', `company:${company.id}`, { userId: user.id, email: user.email });
  res.status(201).json({ user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName } });
});

adminCompaniesRouter.patch('/:id', async (req, res) => {
  const body = parse(optionalCompanyFields, stripMaskedBank(req.body));
  const before = await prisma.company.findUnique({ where: { id: req.params.id } });
  if (!before) throw notFound('COMPANY_NOT_FOUND');
  if (!canSeeBank(req) && touchesBank(body, before)) throw forbidden('ADMIN_REQUIRED');
  const company = await prisma.company.update({ where: { id: before.id }, data: body });
  // What changed (before / after; bank data, tax number and note by name only) — shown in the partner-records timeline.
  const { fields, changes } = auditDiff(before as unknown as Record<string, unknown>, body as Record<string, unknown>);
  await audit(req, 'COMPANY_UPDATED', `company:${company.id}`, { fields, changes: changes as Prisma.InputJsonValue });
  res.json({ company: view(req, company), completeness: completenessOf(company) });
});

/** Company logo (lib/publicImages.ts, preset "logo"): WebP ≤ 512 px, transparency kept, no SVG. */
adminCompaniesRouter.post('/:id/logo', singleRasterImage, async (req, res) => {
  if (!req.file) throw badRequest('FILE_REQUIRED');
  const before = await prisma.company.findUnique({ where: { id: String(req.params.id) } });
  if (!before) throw notFound('COMPANY_NOT_FOUND');
  const { url, w, h } = await storePublicImage(req.file.buffer, 'logo');
  const company = await prisma.company.update({ where: { id: before.id }, data: { logo: { url, w, h } } });
  cleanupRemovedImages([companyLogoOf(before.logo)?.url]);
  await audit(req, 'COMPANY_LOGO_UPDATED', `company:${company.id}`, { url });
  res.status(201).json({ logo: companyLogoOf(company.logo) });
});

adminCompaniesRouter.delete('/:id/logo', async (req, res) => {
  const before = await prisma.company.findUnique({ where: { id: String(req.params.id) } });
  if (!before) throw notFound('COMPANY_NOT_FOUND');
  await prisma.company.update({ where: { id: before.id }, data: { logo: Prisma.DbNull } });
  cleanupRemovedImages([companyLogoOf(before.logo)?.url]);
  await audit(req, 'COMPANY_LOGO_REMOVED', `company:${before.id}`);
  res.json({ logo: null });
});

/** Approve (ACTIVE), suspend or reset to PENDING. The employer is notified in their language. */
adminCompaniesRouter.post('/:id/status', async (req, res) => {
  const body = parse(z.object({ status: z.enum(STATUSES), reason: z.string().trim().max(1000).optional() }), req.body);
  const before = await prisma.company.findUnique({ where: { id: req.params.id } });
  if (!before) throw notFound('COMPANY_NOT_FOUND');
  if (before.status === body.status) throw conflict('STATUS_UNCHANGED');
  const company = await prisma.company.update({ where: { id: before.id }, data: { status: body.status } });
  if (body.status === 'SUSPENDED') {
    // Open vacancies of a suspended employer disappear from the public board.
    await prisma.vacancy.updateMany({ where: { companyId: company.id, status: { in: ['OPEN', 'PENDING'] } }, data: { status: 'CLOSED' } });
  }
  if (body.status !== 'PENDING') await notifyCompanyStatus(company.id, body.status, body.reason);
  // Employer referred by an agent: EMPLOYER_APPROVED commission (once per employer; never throws).
  if (body.status === 'ACTIVE' && company.referredByAgentId) await awardEmployerCommission(company.id);
  await audit(req, 'COMPANY_STATUS_CHANGED', `company:${company.id}`, { from: before.status, to: body.status, reason: body.reason ?? null });
  res.json({ company: view(req, company) });
});
