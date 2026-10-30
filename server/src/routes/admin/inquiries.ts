import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { Locale, Prisma } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { audit } from '../../lib/audit.js';
import { badRequest, conflict, notFound, parse } from '../../lib/http.js';
import { renderEmail, sendMail } from '../../lib/mailer.js';
import { createCase, FINAL_STATUSES } from '../../lib/caseFlow.js';
import { attachPartnerOwner } from '../../lib/partners/owned.js';
import { markClientsExcelDirty } from '../../lib/clientsExcel.js';
import { scanUserDuplicates } from '../../lib/duplicates/detect.js';
import { SECTORS } from '../../lib/vacancies.js';
import {
  INQUIRY_SOURCES,
  INQUIRY_STATUSES,
  assertInquiryStaff,
  enrichInquiries,
  inquiryListQuery,
  inquiryListWhere,
  inquiryOrderBy,
  setInquiryAssignee,
} from '../../lib/inquiries/index.js';
import { inviteUser } from './companies.js';

/**
 * Leads (website / agent / event inquiries) — mounted at /api/admin/inquiries (STAFF+).
 *
 *   GET    /              paged list: search, filters, sort; totals over the filter; facets for the filter menus
 *   GET    /:id           one lead (with names of owner / agent / partner / converted account)
 *   PATCH  /:id           status (and `assignToMe` for the "take" button of my-work)
 *   PUT    /:id/assignee  owner (staff id or null); the new owner is notified
 *   PUT    /:id/notes     internal notes (autosaved by the detail panel)
 *   POST   /:id/convert-client   client account (new or existing) + optional case draft
 *   POST   /:id/convert-company  employer (new or existing company) + optional COMPANY user invite
 *
 * Every change is audited.
 */
export const adminInquiriesRouter = Router();

const DAY = 24 * 60 * 60 * 1000;
const OPEN = ['NEW', 'IN_PROGRESS'] as const;

/** Display group of a `source` value (filter menu). */
const sourceGroup = (source: string | null, agentId: string | null) => {
  if (agentId) return 'agent';
  if (!source) return 'web';
  return INQUIRY_SOURCES.find((s) => s !== 'web' && source.startsWith(s)) ?? 'other';
};

adminInquiriesRouter.get('/', async (req, res) => {
  const q = parse(inquiryListQuery, req.query);
  const me = req.user!.id;
  const where = inquiryListWhere(q, me);
  const noStatus = inquiryListWhere(q, me, ['status']);
  const noAssignee = inquiryListWhere(q, me, ['assignee']);
  const and = (...w: Prisma.InquiryWhereInput[]): Prisma.InquiryWhereInput => ({ AND: w });
  const [rows, total, byStatus, byKind, workers, new7d, openOldest, hotOpen, mine, unassigned, sources, agents, partners, staff] = await Promise.all([
    prisma.inquiry.findMany({ where, orderBy: inquiryOrderBy(q.sort), skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.inquiry.count({ where }),
    prisma.inquiry.groupBy({ by: ['status'], where: noStatus, _count: { _all: true } }),
    prisma.inquiry.groupBy({ by: ['kind'], where, _count: { _all: true } }),
    prisma.inquiry.aggregate({ where, _sum: { workersNeeded: true } }),
    prisma.inquiry.count({ where: and(where, { createdAt: { gte: new Date(Date.now() - 7 * DAY) } }) }),
    prisma.inquiry.findFirst({ where: and(noStatus, { status: 'NEW' }), orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    prisma.inquiry.count({ where: and(noStatus, { scoreLevel: 'HOT', status: { in: [...OPEN] } }) }),
    prisma.inquiry.count({ where: and(noAssignee, { assignedStaffId: me }) }),
    prisma.inquiry.count({ where: and(noAssignee, { assignedStaffId: null }) }),
    // Facets for the filter menus (whole table: the menus must not shrink while filtering).
    prisma.inquiry.groupBy({ by: ['source', 'agentId'], _count: { _all: true } }),
    prisma.inquiry.groupBy({ by: ['agentId'], where: { agentId: { not: null } }, _count: { _all: true } }),
    prisma.inquiry.groupBy({ by: ['partnerId'], where: { partnerId: { not: null } }, _count: { _all: true } }),
    prisma.user.findMany({ where: { role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] }, isActive: true }, select: { id: true, firstName: true, lastName: true }, orderBy: { firstName: 'asc' } }),
  ]);
  const sourceCounts: Record<string, number> = {};
  for (const s of sources) {
    const g = sourceGroup(s.source, s.agentId);
    sourceCounts[g] = (sourceCounts[g] ?? 0) + s._count._all;
  }
  const [agentRows, partnerRows] = await Promise.all([
    prisma.agent.findMany({ where: { id: { in: agents.map((a) => a.agentId!) } }, select: { id: true, code: true, user: { select: { firstName: true, lastName: true } } } }),
    prisma.referralPartner.findMany({ where: { id: { in: partners.map((p) => p.partnerId!) } }, select: { id: true, name: true } }),
  ]);
  const agentCount = new Map(agents.map((a) => [a.agentId, a._count._all]));
  const partnerCount = new Map(partners.map((p) => [p.partnerId, p._count._all]));
  res.json({
    items: await enrichInquiries(rows),
    total,
    page: q.page,
    pageSize: q.pageSize,
    summary: {
      total,
      byStatus: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])),
      byKind: Object.fromEntries(byKind.map((b) => [b.kind, b._count._all])),
      new7d,
      hotOpen,
      oldestOpenDays: openOldest ? Math.floor((Date.now() - openOldest.createdAt.getTime()) / DAY) : null,
      workersRequested: workers._sum.workersNeeded ?? 0,
      mine,
      unassigned,
    },
    facets: {
      sources: Object.entries(sourceCounts)
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count),
      agents: agentRows.map((a) => ({ id: a.id, code: a.code, name: `${a.user.firstName} ${a.user.lastName}`.trim(), count: agentCount.get(a.id) ?? 0 })).sort((a, b) => a.name.localeCompare(b.name)),
      partners: partnerRows.map((p) => ({ id: p.id, name: p.name, count: partnerCount.get(p.id) ?? 0 })).sort((a, b) => a.name.localeCompare(b.name)),
      staff: staff.map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}`.trim() })),
    },
  });
});

const load = async (id: string) => {
  const item = await prisma.inquiry.findUnique({ where: { id } });
  if (!item) throw notFound('INQUIRY_NOT_FOUND');
  return item;
};
const one = async (id: string) => (await enrichInquiries([await load(id)]))[0];

adminInquiriesRouter.get('/:id', async (req, res) => {
  res.json({ item: await one(req.params.id) });
});

/** Status. `assignToMe` (my-work "take"): the lead also becomes mine. */
adminInquiriesRouter.patch('/:id', async (req, res) => {
  const { status, assignToMe } = parse(z.object({ status: z.enum(INQUIRY_STATUSES), assignToMe: z.boolean().optional() }), req.body);
  const item = await prisma.inquiry.update({ where: { id: req.params.id }, data: { status } });
  await audit(req, 'INQUIRY_STATUS_CHANGED', item.id, { status });
  if (assignToMe) {
    const r = await setInquiryAssignee(item.id, req.user!.id, req.user!.id);
    if (r?.changed) await audit(req, 'INQUIRY_ASSIGNED', `inquiry:${item.id}`, { from: r.previous, to: req.user!.id, via: 'take' });
  }
  res.json({ item: await one(item.id) });
});

/** Owner of the lead: a staff id, "me" or null (unassign). */
adminInquiriesRouter.put('/:id/assignee', async (req, res) => {
  const body = parse(z.object({ staffId: z.string().min(1).max(40).nullable() }), req.body);
  const staffId = body.staffId === 'me' ? req.user!.id : body.staffId;
  await assertInquiryStaff(staffId);
  const r = await setInquiryAssignee(req.params.id, staffId, req.user!.id);
  if (!r) throw notFound('INQUIRY_NOT_FOUND');
  if (r.changed) await audit(req, staffId ? 'INQUIRY_ASSIGNED' : 'INQUIRY_UNASSIGNED', `inquiry:${req.params.id}`, { from: r.previous, to: staffId });
  res.json({ item: await one(req.params.id), previous: r.previous });
});

adminInquiriesRouter.put('/:id/notes', async (req, res) => {
  const { staffNotes } = parse(z.object({ staffNotes: z.string().max(20_000) }), req.body);
  const before = await load(req.params.id);
  if (before.anonymizedAt) throw conflict('INQUIRY_ANONYMIZED');
  const next = staffNotes.trim() ? staffNotes : null;
  if ((before.staffNotes ?? null) !== next) {
    await prisma.inquiry.update({ where: { id: before.id }, data: { staffNotes: next } });
    await audit(req, 'INQUIRY_NOTES_UPDATED', `inquiry:${before.id}`, { length: next?.length ?? 0, previousLength: before.staffNotes?.length ?? 0 });
  }
  res.json({ item: await one(before.id) });
});

// ─── Conversion ────────────────────────────────────────────────────────

const CLIENT_INVITE: Record<Locale, { title: string; body: (name: string) => string; cta: string }> = {
  az: { title: 'Triad Vision şəxsi kabinetiniz hazırdır', body: (n) => `Salam ${n}! Müraciətiniz əsasında sizin üçün Triad Vision şəxsi kabineti yaradıldı. Şifrənizi təyin etmək üçün aşağıdakı düyməyə klikləyin. Link 7 gün etibarlıdır.`, cta: 'Şifrəni təyin et' },
  de: { title: 'Ihr Triad-Vision-Kundenkonto ist bereit', body: (n) => `Hallo ${n}, auf Grundlage Ihrer Anfrage wurde für Sie ein Triad-Vision-Kundenkonto angelegt. Klicken Sie auf die Schaltfläche, um Ihr Passwort festzulegen. Der Link ist 7 Tage gültig.`, cta: 'Passwort festlegen' },
  en: { title: 'Your Triad Vision account is ready', body: (n) => `Hello ${n}, based on your inquiry we created a Triad Vision client account for you. Click the button below to set your password. The link is valid for 7 days.`, cta: 'Set your password' },
  ru: { title: 'Ваш личный кабинет Triad Vision готов', body: (n) => `Здравствуйте, ${n}! На основании вашего запроса для вас создан личный кабинет Triad Vision. Нажмите кнопку ниже, чтобы задать пароль. Ссылка действительна 7 дней.`, cta: 'Задать пароль' },
};

const sendClientInvite = async (user: { id: string; email: string; locale: Locale; firstName: string }) => {
  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
  const token = crypto.randomBytes(32).toString('hex');
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: crypto.createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 7 * DAY) },
  });
  const t = CLIENT_INVITE[user.locale];
  void sendMail(user.email, `Triad Vision · ${t.title}`, renderEmail(t.title, t.body(user.firstName), { label: t.cta, url: `${config.clientUrl}/reset-password?token=${token}` }));
};

const locale = z.enum(['az', 'de', 'en', 'ru']);
const splitName = (n: string) => {
  const parts = n.trim().split(/\s+/);
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') };
};

const convertible = async (id: string) => {
  const q = await load(id);
  if (q.anonymizedAt) throw conflict('INQUIRY_ANONYMIZED');
  return q;
};

/**
 * "Müştəriyə çevir": links the lead to a client account — an existing CLIENT with that e-mail, or a new one that
 * gets a 7-day set-password link — and optionally opens a case draft. Agent / partner of the lead go with the client.
 */
adminInquiriesRouter.post('/:id/convert-client', async (req, res) => {
  const q = await convertible(req.params.id);
  if (q.convertedUserId) throw conflict('ALREADY_CONVERTED');
  const guess = splitName(q.contactName);
  const body = parse(
    z.object({
      firstName: z.string().trim().min(1).max(80).default(guess.firstName || q.contactName),
      lastName: z.string().trim().min(1).max(80).default(guess.lastName || '—'),
      email: z.string().trim().toLowerCase().email().max(191).default(q.email.toLowerCase()),
      phone: z.string().trim().max(40).nullable().optional(),
      locale: locale.default((['az', 'de', 'en', 'ru'].includes(q.locale) ? q.locale : 'az') as Locale),
      invite: z.boolean().default(true),
      createCase: z.boolean().default(false),
      profession: z.string().trim().min(2).max(120).optional(),
    }),
    req.body ?? {},
  );
  if (body.createCase && !body.profession) throw badRequest('PROFESSION_REQUIRED');
  const existing = await prisma.user.findUnique({ where: { email: body.email }, select: { id: true, role: true, firstName: true, email: true, locale: true, referredByAgentId: true } });
  if (existing && existing.role !== 'CLIENT') throw conflict('EMAIL_NOT_CLIENT');
  if (existing && body.createCase) {
    const active = await prisma.case.count({ where: { clientId: existing.id, status: { notIn: FINAL_STATUSES }, parentCaseId: null } });
    if (active) throw conflict('ACTIVE_CASE_EXISTS');
  }
  const user =
    existing ??
    (await prisma.user.create({
      data: {
        email: body.email,
        // Unusable random password: the client sets their own through the invitation link.
        passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10),
        role: 'CLIENT',
        firstName: body.firstName,
        lastName: body.lastName,
        phone: body.phone ?? q.phone ?? null,
        locale: body.locale,
        referredByAgentId: q.agentId ?? null,
      },
      select: { id: true, role: true, firstName: true, email: true, locale: true, referredByAgentId: true },
    }));
  const created = !existing;
  if (existing && q.agentId && !existing.referredByAgentId) await prisma.user.update({ where: { id: existing.id }, data: { referredByAgentId: q.agentId } });
  if (q.partnerId) await attachPartnerOwner(user.id, q.partnerId, { source: 'ADMIN', actorId: req.user!.id, note: `inquiry:${q.id}` });
  if (created && body.invite) await sendClientInvite(user);
  const kase = body.createCase ? await createCase(user.id, { profession: body.profession!, actorId: req.user!.id }) : null;
  await prisma.inquiry.update({
    where: { id: q.id },
    data: { convertedUserId: user.id, convertedAt: new Date(), status: 'DONE', ...(q.assignedStaffId ? {} : { assignedStaffId: req.user!.id, assignedAt: new Date() }) },
  });
  await audit(req, 'INQUIRY_CONVERTED_CLIENT', `inquiry:${q.id}`, { userId: user.id, created, invited: created && body.invite, caseId: kase?.id ?? null, previousStatus: q.status });
  if (created) {
    markClientsExcelDirty();
    void scanUserDuplicates(user.id);
  }
  res.status(201).json({ item: await one(q.id), userId: user.id, created, caseId: kase?.id ?? null, caseNumber: kase?.number ?? null });
});

/**
 * "İşəgötürənə çevir" (company leads): a new company (active, from the lead's data) or an existing one, plus an
 * optional COMPANY user invite through the regular employer invitation (set-password e-mail).
 */
adminInquiriesRouter.post('/:id/convert-company', async (req, res) => {
  const q = await convertible(req.params.id);
  if (q.kind !== 'company') throw conflict('NOT_A_COMPANY_LEAD');
  if (q.convertedCompanyId) throw conflict('ALREADY_CONVERTED');
  const guess = splitName(q.contactName);
  const body = parse(
    z
      .object({
        companyId: z.string().min(1).max(40).optional(),
        company: z
          .object({
            name: z.string().trim().min(2).max(160),
            sector: z.enum(SECTORS).nullable().optional(),
            city: z.string().trim().max(80).nullable().optional(),
            phone: z.string().trim().max(40).nullable().optional(),
            email: z.string().trim().toLowerCase().email().max(200).nullable().optional(),
          })
          .optional(),
        invite: z
          .object({
            firstName: z.string().trim().min(1).max(80).default(guess.firstName || q.contactName),
            lastName: z.string().trim().min(1).max(80).default(guess.lastName || '—'),
            email: z.string().trim().toLowerCase().email().max(200).default(q.email.toLowerCase()),
            locale: locale.default((['az', 'de', 'en', 'ru'].includes(q.locale) ? q.locale : 'de') as Locale),
          })
          .nullable()
          .optional(),
      })
      .refine((b) => !!b.companyId !== !!b.company, 'COMPANY_OR_ID'),
    req.body ?? {},
  );
  let existingUser: { id: string; role: string; companyId: string | null } | null = null;
  if (body.invite) {
    existingUser = await prisma.user.findUnique({ where: { email: body.invite.email }, select: { id: true, role: true, companyId: true } });
    // An existing login is only fine when it already is an employer user of the company being linked.
    if (existingUser && !(existingUser.role === 'COMPANY' && body.companyId && existingUser.companyId === body.companyId)) throw conflict('EMAIL_TAKEN');
  }
  let company: { id: string; name: string };
  let createdCompany = false;
  if (body.companyId) {
    const c = await prisma.company.findUnique({ where: { id: body.companyId }, select: { id: true, name: true, referredByAgentId: true } });
    if (!c) throw notFound('COMPANY_NOT_FOUND');
    if (q.agentId && !c.referredByAgentId) await prisma.company.update({ where: { id: c.id }, data: { referredByAgentId: q.agentId } });
    company = c;
  } else {
    const c = body.company!;
    company = await prisma.company.create({
      data: {
        name: c.name,
        sector: c.sector ?? null,
        city: c.city ?? null,
        phone: c.phone ?? q.phone ?? null,
        email: c.email ?? q.email.toLowerCase(),
        contactName: q.contactName,
        status: 'ACTIVE',
        note: `Lead: ${q.message.slice(0, 2000)}`,
        referredByAgentId: q.agentId ?? null,
      },
      select: { id: true, name: true },
    });
    createdCompany = true;
    await audit(req, 'COMPANY_CREATED', `company:${company.id}`, { fromInquiry: q.id });
  }
  const invited = body.invite && !existingUser ? await inviteUser(company.id, company.name, body.invite) : null;
  const userId = invited?.id ?? existingUser?.id ?? null;
  await prisma.inquiry.update({
    where: { id: q.id },
    data: {
      convertedCompanyId: company.id,
      ...(userId && !q.convertedUserId ? { convertedUserId: userId } : {}),
      convertedAt: new Date(),
      status: 'DONE',
      ...(q.assignedStaffId ? {} : { assignedStaffId: req.user!.id, assignedAt: new Date() }),
    },
  });
  await audit(req, 'INQUIRY_CONVERTED_COMPANY', `inquiry:${q.id}`, { companyId: company.id, createdCompany, invitedUserId: invited?.id ?? null, previousStatus: q.status });
  res.status(201).json({ item: await one(q.id), companyId: company.id, createdCompany, invitedUserId: invited?.id ?? null });
});
