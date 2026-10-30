import crypto from 'node:crypto';
import { Router, type Request } from 'express';
import { z } from 'zod';
import type { Agent, Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { conflict, forbidden, limiter, parse } from '../lib/http.js';
import { notifyStaff } from '../lib/notifications.js';
import { onInquiryCreated } from '../lib/assignment/inquiry.js';
import { attachLeadContext } from '../lib/marketing/leadScoring.js';
import { audit } from '../lib/audit.js';
import { payoutEventsOf } from '../lib/agents/commissions.js';
import { shareLink } from '../lib/agents/referral.js';
import { coarseStage, displayName } from '../lib/agents/privacy.js';
import { agentStats, lastMonths, monthKey } from '../lib/agents/stats.js';
import { ibanField } from '../lib/agents/validation.js';

// Agent (partner) portal API — mounted at /api/agent (role AGENT only).
// Data minimisation: referred clients appear only as "First L." with a coarse case stage.
export const agentPortalRouter = Router();
agentPortalRouter.use(requireRole('AGENT'));

const agentOf = async (req: Request): Promise<Agent> => {
  const agent = await prisma.agent.findUnique({ where: { userId: req.user!.id } });
  if (!agent) throw forbidden('NO_AGENT_PROFILE');
  return agent;
};

/** Stable, non-reversible row key so the UI never receives client user ids. */
const refKey = (agentId: string, userId: string) => crypto.createHash('sha256').update(`${agentId}:${userId}`).digest('hex').slice(0, 16);

const meView = async (agent: Agent, userId: string) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { firstName: true, lastName: true, email: true, phone: true, locale: true } });
  return {
    agent: {
      code: agent.code,
      region: agent.region,
      company: agent.company,
      status: agent.status,
      commissionType: agent.commissionType,
      commissionValue: agent.commissionValue,
      currency: agent.currency,
      payoutEvents: payoutEventsOf(agent.payoutEvents),
      iban: agent.iban,
      createdAt: agent.createdAt,
    },
    user,
    shareLink: shareLink(agent.code),
  };
};

agentPortalRouter.get('/me', async (req, res) => {
  const agent = await agentOf(req);
  res.json(await meView(agent, req.user!.id));
});

agentPortalRouter.patch('/me', async (req, res) => {
  const body = parse(
    z
      .object({
        phone: z
          .string()
          .trim()
          .max(40)
          .nullable()
          .optional()
          .transform((v) => (v === '' ? null : v))
          .refine((v) => !v || /^\+?[0-9 ()-]{5,40}$/.test(v), 'INVALID_PHONE'),
        iban: ibanField,
      })
      .strict(),
    req.body,
  );
  const agent = await agentOf(req);
  if (body.iban !== undefined) await prisma.agent.update({ where: { id: agent.id }, data: { iban: body.iban } });
  if (body.phone !== undefined) await prisma.user.update({ where: { id: req.user!.id }, data: { phone: body.phone } });
  await audit(req, 'AGENT_PROFILE_UPDATED', `agent:${agent.id}`, { fields: Object.keys(body) });
  res.json(await meView(await agentOf(req), req.user!.id));
});

agentPortalRouter.get('/dashboard', async (req, res) => {
  const agent = await agentOf(req);
  const now = new Date();
  const months = lastMonths(12, now);
  const since = new Date(`${months[0]}-01T00:00:00.000Z`);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [stats, refs, thisMonth, earnings] = await Promise.all([
    agentStats([agent.id]),
    prisma.user.findMany({ where: { referredByAgentId: agent.id, referredAt: { gte: since } }, select: { referredAt: true } }),
    prisma.user.count({ where: { referredByAgentId: agent.id, referredAt: { gte: monthStart } } }),
    prisma.agentCommission.findMany({ where: { agentId: agent.id, status: { not: 'CANCELLED' }, createdAt: { gte: since } }, select: { createdAt: true, amountCents: true } }),
  ]);
  const series = new Map(months.map((m) => [m, { month: m, referrals: 0, earningsCents: 0 }]));
  for (const r of refs) if (r.referredAt) { const s = series.get(monthKey(r.referredAt)); if (s) s.referrals++; }
  for (const e of earnings) { const s = series.get(monthKey(e.createdAt)); if (s) s.earningsCents += e.amountCents; }
  const s = stats.get(agent.id)!;
  res.json({
    status: agent.status,
    currency: agent.currency,
    counts: { referrals: s.referrals, employers: s.employers, registeredThisMonth: thisMonth, activeCases: s.activeCases, approvedVisas: s.approvedVisas },
    earnings: { pendingCents: s.pendingCents, approvedCents: s.approvedCents, paidCents: s.paidCents },
    series: [...series.values()],
  });
});

/** Employers referred by the agent: name, sign-up date, approval status and the commissions they produced. */
const referredEmployers = async (agentId: string) => {
  const companies = await prisma.company.findMany({
    where: { referredByAgentId: agentId },
    orderBy: [{ referredAt: 'desc' }, { createdAt: 'desc' }],
    take: 200,
    select: { id: true, name: true, city: true, status: true, createdAt: true, referredAt: true },
  });
  if (!companies.length) return [];
  const ids = companies.map((c) => c.id);
  const invoices = await prisma.invoice.findMany({ where: { companyId: { in: ids } }, select: { id: true, companyId: true } });
  const companyOf = new Map<string, string>([...ids.map((id) => [id, id] as const), ...invoices.map((i) => [i.id, i.companyId] as const)]);
  const rows = await prisma.agentCommission.findMany({
    where: { agentId, status: { not: 'CANCELLED' }, clientId: null, sourceRef: { in: [...companyOf.keys()] } },
    select: { sourceRef: true, amountCents: true },
  });
  const earned = new Map<string, number>();
  for (const r of rows) {
    const cid = companyOf.get(r.sourceRef ?? '');
    if (cid) earned.set(cid, (earned.get(cid) ?? 0) + r.amountCents);
  }
  return companies.map((c) => ({
    key: refKey(agentId, c.id),
    name: c.name,
    city: c.city,
    status: c.status,
    registeredAt: c.referredAt ?? c.createdAt,
    earnedCents: earned.get(c.id) ?? 0,
  }));
};

agentPortalRouter.get('/referrals', async (req, res) => {
  const agent = await agentOf(req);
  const q = parse(z.object({ page: z.coerce.number().int().min(1).max(1000).default(1) }), req.query);
  const pageSize = 50;
  const where: Prisma.UserWhereInput = { referredByAgentId: agent.id };
  const [rows, total, earned] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: [{ referredAt: 'desc' }, { createdAt: 'desc' }],
      skip: (q.page - 1) * pageSize,
      take: pageSize,
      // Only what the agent may see; never contacts, documents or passport data.
      select: {
        id: true,
        firstName: true,
        lastName: true,
        createdAt: true,
        referredAt: true,
        cases: { where: { parentCaseId: null }, orderBy: { createdAt: 'desc' }, take: 1, select: { status: true } },
      },
    }),
    prisma.user.count({ where }),
    prisma.agentCommission.groupBy({ by: ['clientId'], where: { agentId: agent.id, status: { not: 'CANCELLED' }, clientId: { not: null } }, _sum: { amountCents: true } }),
  ]);
  const earnedBy = new Map(earned.map((e) => [e.clientId, e._sum.amountCents ?? 0]));
  res.json({
    items: rows.map((u) => ({
      key: refKey(agent.id, u.id),
      name: displayName(u),
      registeredAt: u.referredAt ?? u.createdAt,
      stage: coarseStage(u.cases[0]?.status),
      earnedCents: earnedBy.get(u.id) ?? 0,
    })),
    // Employers that signed up with the agent's code (first page only; business names, no contacts).
    employers: q.page === 1 ? await referredEmployers(agent.id) : [],
    total,
    pageSize,
    currency: agent.currency,
  });
});

agentPortalRouter.get('/commissions', async (req, res) => {
  const agent = await agentOf(req);
  const q = parse(
    z.object({ status: z.enum(['PENDING', 'APPROVED', 'PAID', 'CANCELLED']).optional(), page: z.coerce.number().int().min(1).max(1000).default(1) }),
    req.query,
  );
  const pageSize = 50;
  const where: Prisma.AgentCommissionWhereInput = { agentId: agent.id, ...(q.status ? { status: q.status } : {}) };
  const [rows, total] = await Promise.all([
    prisma.agentCommission.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * pageSize,
      take: pageSize,
      include: { client: { select: { firstName: true, lastName: true } } },
    }),
    prisma.agentCommission.count({ where }),
  ]);
  res.json({
    items: rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      event: r.event,
      amountCents: r.amountCents,
      currency: r.currency,
      status: r.status,
      approvedAt: r.approvedAt,
      paidAt: r.paidAt,
      payoutRef: r.payoutRef,
      note: r.event === 'MANUAL' ? r.note : null,
      client: r.client ? displayName(r.client) : null,
    })),
    total,
    pageSize,
  });
});

// ─── Leads registered by the agent ("Yeni müştəri" form → Inquiry) ──────

/** What the person is interested in (shown to staff in the inquiry text). */
export const LEAD_INTERESTS = ['WORK', 'AUSBILDUNG', 'STUDY', 'CHANCENKARTE', 'FAMILY', 'RECOGNITION', 'OTHER'] as const;
const INTEREST_AZ: Record<(typeof LEAD_INTERESTS)[number], string> = {
  WORK: 'İş vizası',
  AUSBILDUNG: 'Ausbildung',
  STUDY: 'Təhsil',
  CHANCENKARTE: 'Chancenkarte',
  FAMILY: 'Ailə birləşməsi',
  RECOGNITION: 'Diplomun tanınması',
  OTHER: 'Digər',
};

/** Per agent (not per IP: agents often share an office network). */
const leadLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 20, keyGenerator: (req) => `agent-lead:${req.user?.id ?? req.ip}` });

const leadInput = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(5).max(40).refine((v) => /^\+?[0-9 ()-]{5,40}$/.test(v), 'INVALID_PHONE'),
  email: z.string().trim().toLowerCase().email().max(200),
  country: z.string().trim().min(2).max(80),
  interest: z.enum(LEAD_INTERESTS),
  message: z.string().trim().max(3000).optional().default(''),
  locale: z.enum(['az', 'de', 'en', 'ru']).optional(),
  // The person agreed to be contacted by Triad Vision (the agent confirms it; required).
  consent: z.literal(true),
});

/** Status as the agent sees it (no staff notes, no assignee). ARCHIVED counts as done. */
const leadStatus = (s: string) => (s === 'NEW' ? 'NEW' : s === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'DONE');

agentPortalRouter.post('/leads', leadLimiter, async (req, res) => {
  const body = parse(leadInput, req.body);
  const agent = await agentOf(req);
  if (agent.status !== 'ACTIVE') throw forbidden('AGENT_PAUSED');
  // The same person twice within a day by the same agent is a double click, not a new lead.
  const dup = await prisma.inquiry.findFirst({
    where: { agentId: agent.id, email: body.email, createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    select: { id: true },
  });
  if (dup) throw conflict('DUPLICATE_LEAD');
  const me = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { firstName: true, lastName: true, locale: true } });
  // An agent login that is also a referral partner: the lead counts for that partner too.
  const partner = await prisma.referralPartner.findUnique({ where: { userId: req.user!.id }, select: { id: true } });
  const message = [
    `Agent: ${me.firstName} ${me.lastName} (${agent.code})`,
    `Ölkə: ${body.country}`,
    `Maraq: ${INTEREST_AZ[body.interest]}`,
    'Razılıq: şəxs Triad Vision ilə əlaqə saxlanılmasına razıdır (agent təsdiqləyib).',
    body.message ? `\n${body.message}` : null,
  ]
    .filter((l) => l !== null)
    .join('\n');
  const inquiry = await prisma.inquiry.create({
    data: {
      kind: 'contact',
      contactName: body.name,
      email: body.email,
      phone: body.phone,
      sector: INTEREST_AZ[body.interest],
      message,
      locale: body.locale ?? me.locale,
      source: `agent:${agent.id}`,
      agentId: agent.id,
      partnerId: partner?.id ?? null,
    },
  });
  await audit(req, 'AGENT_LEAD_CREATED', `inquiry:${inquiry.id}`, { agentId: agent.id, consent: true, interest: body.interest });
  void onInquiryCreated(inquiry.id); // automation rules + optional auto-assignment (never throws)
  await notifyStaff(`Agentdən yeni lead: ${body.name}`, `${message}\n\nAd: ${body.name}\nEmail: ${body.email}\nTelefon: ${body.phone}`, { link: '/admin/inquiries', type: 'AGENT_LEAD' });
  await attachLeadContext(inquiry.id); // lead score (never throws)
  res.status(201).json({ lead: { id: inquiry.id, name: inquiry.contactName, status: 'NEW', converted: false, createdAt: inquiry.createdAt } });
});

agentPortalRouter.get('/leads', async (req, res) => {
  const agent = await agentOf(req);
  const q = parse(z.object({ page: z.coerce.number().int().min(1).max(1000).default(1) }), req.query);
  const pageSize = 50;
  const where: Prisma.InquiryWhereInput = { agentId: agent.id };
  const [rows, total] = await Promise.all([
    prisma.inquiry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * pageSize,
      take: pageSize,
      // Never staffNotes, assignee or scoring: the agent sees what they entered and how far it got.
      select: { id: true, contactName: true, email: true, phone: true, sector: true, status: true, createdAt: true, convertedAt: true, convertedUserId: true, convertedCompanyId: true, anonymizedAt: true },
    }),
    prisma.inquiry.count({ where }),
  ]);
  res.json({
    items: rows.map((r) => ({
      id: r.id,
      name: r.anonymizedAt ? null : r.contactName,
      email: r.anonymizedAt ? null : r.email,
      phone: r.anonymizedAt ? null : r.phone,
      interest: r.sector,
      status: leadStatus(r.status),
      converted: !!(r.convertedAt || r.convertedUserId || r.convertedCompanyId),
      createdAt: r.createdAt,
    })),
    total,
    pageSize,
  });
});
