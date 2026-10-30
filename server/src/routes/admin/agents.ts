import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { CommissionStatus, Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { requireMinRole } from '../../middleware/auth.js';
import { badRequest, conflict, notFound, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { notifyUser } from '../../lib/notifications.js';
import { PAYOUT_EVENTS, payoutEventsOf } from '../../lib/agents/commissions.js';
import { normaliseAgentCode, shareLink, suggestAgentCode } from '../../lib/agents/referral.js';
import { agentStats } from '../../lib/agents/stats.js';
import { sendAgentInvite } from '../../lib/agents/invite.js';
import { AGENT_TEXT, formatMoney } from '../../lib/agents/texts.js';
import { ibanField } from '../../lib/agents/validation.js';

// Admin: agents (partner programme) and their commissions — mounted at /api/admin/agents (ADMIN+)
export const adminAgentsRouter = Router();
adminAgentsRouter.use(requireMinRole('ADMIN'));

const COMMISSION_STATUSES = ['PENDING', 'APPROVED', 'PAID', 'CANCELLED'] as const;
const DAY = 24 * 60 * 60 * 1000;

const codeField = z
  .string()
  .trim()
  .transform(normaliseAgentCode)
  .pipe(z.string().regex(/^[A-Z0-9]+(-[A-Z0-9]+)*$/, 'INVALID_CODE').min(3).max(32));

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === '' ? null : v));

const termsFields = {
  commissionType: z.enum(['FIXED', 'PERCENT']),
  // cents (FIXED, max 100 000 €) or basis points (PERCENT, max 100 %)
  commissionValue: z.number().int().min(0).max(10_000_000),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/),
  payoutEvents: z.array(z.enum(PAYOUT_EVENTS)).max(PAYOUT_EVENTS.length),
};

const checkTerms = (type: string | undefined, value: number | undefined) => {
  if (type === 'PERCENT' && value !== undefined && value > 10000) throw badRequest('PERCENT_TOO_HIGH');
};

const agentInclude = {
  user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, locale: true, isActive: true, createdAt: true } },
} satisfies Prisma.AgentInclude;

type AgentWithUser = Prisma.AgentGetPayload<{ include: typeof agentInclude }>;

const agentView = (a: AgentWithUser) => ({ ...a, payoutEvents: payoutEventsOf(a.payoutEvents), shareLink: shareLink(a.code) });

const loadAgent = async (id: string) => {
  const a = await prisma.agent.findUnique({ where: { id }, include: agentInclude });
  if (!a) throw notFound('AGENT_NOT_FOUND');
  return a;
};

// ─── Agents ─────────────────────────────────────────────────────────────

adminAgentsRouter.get('/', async (req, res) => {
  const q = parse(
    z.object({ status: z.enum(['ACTIVE', 'PAUSED']).optional(), search: z.string().trim().max(120).optional() }),
    req.query,
  );
  const where: Prisma.AgentWhereInput = {
    ...(q.status ? { status: q.status } : {}),
    ...(q.search
      ? {
          OR: [
            { code: { contains: q.search } },
            { region: { contains: q.search } },
            { company: { contains: q.search } },
            { user: { email: { contains: q.search } } },
            { user: { firstName: { contains: q.search } } },
            { user: { lastName: { contains: q.search } } },
          ],
        }
      : {}),
  };
  const [items, byStatus] = await Promise.all([
    prisma.agent.findMany({ where, include: agentInclude, orderBy: { createdAt: 'desc' }, take: 500 }),
    prisma.agent.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);
  const stats = await agentStats(items.map((a) => a.id));
  res.json({
    items: items.map((a) => ({ ...agentView(a), stats: stats.get(a.id) })),
    counts: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])),
  });
});

adminAgentsRouter.get('/suggest-code', async (req, res) => {
  const q = parse(
    z.object({ firstName: z.string().max(80).optional(), lastName: z.string().max(80).optional(), region: z.string().max(120).optional() }),
    req.query,
  );
  res.json({ code: await suggestAgentCode(q) });
});

/** Small list for selects (manual commissions, attribution fixes). */
adminAgentsRouter.get('/options', async (_req, res) => {
  const items = await prisma.agent.findMany({
    orderBy: { code: 'asc' },
    select: { id: true, code: true, status: true, currency: true, user: { select: { firstName: true, lastName: true } } },
  });
  res.json({ items });
});

/** Client/employer search for attribution fixes and manual commissions. */
adminAgentsRouter.get('/clients', async (req, res) => {
  const { search } = parse(z.object({ search: z.string().trim().min(2).max(120) }), req.query);
  const items = await prisma.user.findMany({
    where: {
      role: { in: ['CLIENT', 'COMPANY'] },
      OR: [{ email: { contains: search } }, { firstName: { contains: search } }, { lastName: { contains: search } }],
    },
    take: 20,
    orderBy: { createdAt: 'desc' },
    select: { id: true, firstName: true, lastName: true, email: true, role: true, referredByAgentId: true },
  });
  res.json({ items });
});

adminAgentsRouter.post('/', async (req, res) => {
  const body = parse(
    z.object({
      firstName: z.string().trim().min(1).max(80),
      lastName: z.string().trim().min(1).max(80),
      email: z.string().trim().toLowerCase().email().max(200),
      phone: optText(40),
      locale: z.enum(['az', 'de', 'en', 'ru']).default('az'),
      code: codeField.optional(),
      region: optText(120),
      company: optText(160),
      commissionType: termsFields.commissionType.default('FIXED'),
      commissionValue: termsFields.commissionValue.default(0),
      currency: termsFields.currency.default('EUR'),
      payoutEvents: termsFields.payoutEvents.default(['VISA_APPROVED']),
      iban: ibanField,
      notes: optText(5000),
    }),
    req.body,
  );
  checkTerms(body.commissionType, body.commissionValue);
  if (await prisma.user.findUnique({ where: { email: body.email } })) throw conflict('EMAIL_TAKEN');
  const code = body.code ?? (await suggestAgentCode(body));
  if (await prisma.agent.findUnique({ where: { code } })) throw conflict('CODE_TAKEN');

  const agent = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: body.email,
        // Unusable random password: the agent sets their own through the invitation link.
        passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10),
        role: 'AGENT',
        firstName: body.firstName,
        lastName: body.lastName,
        phone: body.phone ?? null,
        locale: body.locale,
      },
    });
    return tx.agent.create({
      data: {
        userId: user.id,
        code,
        region: body.region ?? null,
        company: body.company ?? null,
        commissionType: body.commissionType,
        commissionValue: body.commissionValue,
        currency: body.currency,
        payoutEvents: body.payoutEvents,
        iban: body.iban ?? null,
        notes: body.notes ?? null,
      },
      include: agentInclude,
    });
  });
  await sendAgentInvite({ id: agent.user.id, email: agent.user.email, locale: agent.user.locale }, agent.code);
  await audit(req, 'AGENT_CREATED', `agent:${agent.id}`, { userId: agent.userId, code: agent.code, email: agent.user.email });
  res.status(201).json({ agent: agentView(agent) });
});

// ─── Commissions (all agents) ───────────────────────────────────────────

const commissionFilter = z.object({
  agentId: z.string().max(40).optional(),
  status: z.enum(COMMISSION_STATUSES).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
});

const commissionWhere = (q: z.infer<typeof commissionFilter>): Prisma.AgentCommissionWhereInput => ({
  ...(q.agentId ? { agentId: q.agentId } : {}),
  ...(q.status ? { status: q.status } : {}),
  ...(q.from || q.to
    ? {
        createdAt: {
          ...(q.from ? { gte: new Date(`${q.from}T00:00:00.000Z`) } : {}),
          ...(q.to ? { lt: new Date(new Date(`${q.to}T00:00:00.000Z`).getTime() + DAY) } : {}),
        },
      }
    : {}),
});

const commissionInclude = {
  agent: { select: { id: true, code: true, user: { select: { firstName: true, lastName: true } } } },
  client: { select: { id: true, firstName: true, lastName: true, email: true } },
  case: { select: { id: true, number: true, status: true } },
} satisfies Prisma.AgentCommissionInclude;

adminAgentsRouter.get('/commissions', async (req, res) => {
  const q = parse(commissionFilter, req.query);
  const where = commissionWhere(q);
  const pageSize = 50;
  const [items, total, sums] = await Promise.all([
    prisma.agentCommission.findMany({ where, include: commissionInclude, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * pageSize, take: pageSize }),
    prisma.agentCommission.count({ where }),
    prisma.agentCommission.groupBy({ by: ['status', 'currency'], where, _sum: { amountCents: true }, _count: { _all: true } }),
  ]);
  res.json({
    items,
    total,
    pageSize,
    sums: sums.map((s) => ({ status: s.status, currency: s.currency, amountCents: s._sum.amountCents ?? 0, count: s._count._all })),
  });
});

/** Neutralises spreadsheet formulas (CSV injection) and quotes every cell. */
const csvCell = (v: unknown) => {
  let s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s) && typeof v === 'string') s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

adminAgentsRouter.get('/commissions/export.csv', async (req, res) => {
  const q = parse(commissionFilter, req.query);
  const rows = await prisma.agentCommission.findMany({ where: commissionWhere(q), include: commissionInclude, orderBy: { createdAt: 'desc' }, take: 50_000 });
  const header = ['id', 'createdAt', 'agentCode', 'agentName', 'client', 'caseNumber', 'event', 'amount', 'currency', 'status', 'approvedAt', 'paidAt', 'payoutRef', 'note'];
  const lines = rows.map((r) =>
    [
      r.id,
      r.createdAt,
      r.agent.code,
      `${r.agent.user.firstName} ${r.agent.user.lastName}`,
      r.client ? `${r.client.firstName} ${r.client.lastName}` : '',
      r.case?.number ?? '',
      r.event,
      (r.amountCents / 100).toFixed(2),
      r.currency,
      r.status,
      r.approvedAt,
      r.paidAt,
      r.payoutRef,
      r.note,
    ]
      .map(csvCell)
      .join(','),
  );
  await audit(req, 'AGENT_COMMISSIONS_EXPORTED', undefined, { count: rows.length, filter: { ...q, page: undefined } });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="agent-commissions-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(`﻿${[header.join(','), ...lines].join('\r\n')}\r\n`);
});

adminAgentsRouter.post('/commissions/mark-paid', async (req, res) => {
  const body = parse(
    z.object({ ids: z.array(z.string().min(1).max(40)).min(1).max(500), payoutRef: z.string().trim().min(1).max(120) }),
    req.body,
  );
  const rows = await prisma.agentCommission.findMany({ where: { id: { in: body.ids }, status: 'APPROVED' }, include: { agent: { select: { userId: true } } } });
  const now = new Date();
  const { count } = await prisma.agentCommission.updateMany({
    where: { id: { in: rows.map((r) => r.id) }, status: 'APPROVED' },
    data: { status: 'PAID', paidAt: now, payoutRef: body.payoutRef },
  });
  // One notification per agent and currency.
  const groups = new Map<string, { userId: string; currency: string; cents: number; n: number }>();
  for (const r of rows) {
    const k = `${r.agent.userId}:${r.currency}`;
    const g = groups.get(k) ?? { userId: r.agent.userId, currency: r.currency, cents: 0, n: 0 };
    g.cents += r.amountCents;
    g.n++;
    groups.set(k, g);
  }
  for (const g of groups.values()) {
    const u = await prisma.user.findUnique({ where: { id: g.userId }, select: { locale: true } });
    const locale = u?.locale ?? 'az';
    const t = AGENT_TEXT[locale];
    await notifyUser(g.userId, {
      type: 'AGENT_COMMISSION_PAID',
      title: t.paidTitle(formatMoney(g.cents, g.currency, locale)),
      body: t.paidBody(g.n, body.payoutRef),
      link: '/agent/earnings',
      ctaLabel: t.cta,
      push: false,
    });
  }
  await audit(req, 'AGENT_COMMISSIONS_PAID', undefined, { ids: rows.map((r) => r.id), payoutRef: body.payoutRef });
  res.json({ updated: count, skipped: body.ids.length - count });
});

adminAgentsRouter.post('/commissions/manual', async (req, res) => {
  const body = parse(
    z.object({
      agentId: z.string().min(1).max(40),
      clientId: z.string().max(40).nullable().optional(),
      caseId: z.string().max(40).nullable().optional(),
      amountCents: z
        .number()
        .int()
        .min(-10_000_000)
        .max(10_000_000)
        .refine((v) => v !== 0, 'ZERO_AMOUNT'),
      note: z.string().trim().min(1).max(500),
    }),
    req.body,
  );
  const agent = await prisma.agent.findUnique({ where: { id: body.agentId } });
  if (!agent) throw notFound('AGENT_NOT_FOUND');
  if (body.clientId && !(await prisma.user.findUnique({ where: { id: body.clientId }, select: { id: true } }))) throw notFound('CLIENT_NOT_FOUND');
  let clientId = body.clientId ?? null;
  if (body.caseId) {
    const c = await prisma.case.findUnique({ where: { id: body.caseId }, select: { clientId: true } });
    if (!c) throw notFound('CASE_NOT_FOUND');
    clientId ??= c.clientId;
  }
  // Staff created it on purpose, so it starts approved. sourceRef keeps the unique index happy.
  const row = await prisma.agentCommission.create({
    data: {
      agentId: agent.id,
      clientId,
      caseId: body.caseId ?? null,
      event: 'MANUAL',
      sourceRef: `manual:${crypto.randomUUID()}`,
      amountCents: body.amountCents,
      currency: agent.currency,
      note: body.note,
      status: 'APPROVED',
      approvedAt: new Date(),
    },
    include: commissionInclude,
  });
  await audit(req, 'AGENT_COMMISSION_MANUAL', `commission:${row.id}`, { agentId: agent.id, amountCents: row.amountCents, note: row.note });
  res.status(201).json({ commission: row });
});

const moveCommission = async (id: string, from: CommissionStatus[], data: Prisma.AgentCommissionUpdateManyMutationInput) => {
  const current = await prisma.agentCommission.findUnique({ where: { id } });
  if (!current) throw notFound('COMMISSION_NOT_FOUND');
  const r = await prisma.agentCommission.updateMany({ where: { id, status: { in: from } }, data });
  if (r.count === 0) throw conflict('INVALID_COMMISSION_STATUS', `Commission is ${current.status}`);
  return prisma.agentCommission.findUniqueOrThrow({ where: { id }, include: commissionInclude });
};

adminAgentsRouter.post('/commissions/:id/approve', async (req, res) => {
  const row = await moveCommission(req.params.id, ['PENDING'], { status: 'APPROVED', approvedAt: new Date() });
  await audit(req, 'AGENT_COMMISSION_APPROVED', `commission:${row.id}`, { amountCents: row.amountCents });
  res.json({ commission: row });
});

adminAgentsRouter.post('/commissions/:id/cancel', async (req, res) => {
  const { note } = parse(z.object({ note: z.string().trim().max(500).optional() }), req.body ?? {});
  const row = await moveCommission(req.params.id, ['PENDING', 'APPROVED'], { status: 'CANCELLED', ...(note ? { note } : {}) });
  await audit(req, 'AGENT_COMMISSION_CANCELLED', `commission:${row.id}`, { amountCents: row.amountCents, note: note ?? null });
  res.json({ commission: row });
});

// ─── Attribution ────────────────────────────────────────────────────────

adminAgentsRouter.patch('/referrals/:userId', async (req, res) => {
  const { agentId } = parse(z.object({ agentId: z.string().min(1).max(40).nullable() }), req.body);
  const user = await prisma.user.findUnique({ where: { id: req.params.userId }, select: { id: true, role: true, referredByAgentId: true } });
  if (!user) throw notFound('USER_NOT_FOUND');
  if (!['CLIENT', 'COMPANY'].includes(user.role)) throw badRequest('NOT_A_CLIENT');
  if (agentId) {
    const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: { userId: true } });
    if (!agent) throw notFound('AGENT_NOT_FOUND');
    if (agent.userId === user.id) throw badRequest('SELF_REFERRAL');
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { referredByAgentId: agentId, referredAt: agentId ? (user.referredByAgentId === agentId ? undefined : new Date()) : null },
  });
  await audit(req, 'AGENT_REFERRAL_CHANGED', `user:${user.id}`, { from: user.referredByAgentId, to: agentId });
  res.json({ ok: true });
});

// ─── One agent ──────────────────────────────────────────────────────────

adminAgentsRouter.get('/:id', async (req, res) => {
  const agent = await loadAgent(req.params.id);
  const [stats, referrals, commissions] = await Promise.all([
    agentStats([agent.id]),
    prisma.user.findMany({
      where: { referredByAgentId: agent.id },
      orderBy: { referredAt: 'desc' },
      take: 1000,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        createdAt: true,
        referredAt: true,
        cases: { where: { parentCaseId: null }, orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, number: true, status: true } },
      },
    }),
    prisma.agentCommission.findMany({ where: { agentId: agent.id }, include: commissionInclude, orderBy: { createdAt: 'desc' }, take: 500 }),
  ]);
  res.json({
    agent: { ...agentView(agent), stats: stats.get(agent.id) },
    referrals: referrals.map(({ cases, ...u }) => ({ ...u, case: cases[0] ?? null })),
    commissions,
  });
});

adminAgentsRouter.patch('/:id', async (req, res) => {
  const body = parse(
    z.object({
      status: z.enum(['ACTIVE', 'PAUSED']).optional(),
      code: codeField.optional(),
      region: optText(120),
      company: optText(160),
      commissionType: termsFields.commissionType.optional(),
      commissionValue: termsFields.commissionValue.optional(),
      currency: termsFields.currency.optional(),
      payoutEvents: termsFields.payoutEvents.optional(),
      iban: ibanField,
      notes: optText(5000),
      firstName: z.string().trim().min(1).max(80).optional(),
      lastName: z.string().trim().min(1).max(80).optional(),
      phone: optText(40),
    }),
    req.body,
  );
  const before = await loadAgent(req.params.id);
  checkTerms(body.commissionType ?? before.commissionType, body.commissionValue ?? (body.commissionType ? before.commissionValue : undefined));
  if (body.code && body.code !== before.code && (await prisma.agent.findUnique({ where: { code: body.code } }))) throw conflict('CODE_TAKEN');
  const { firstName, lastName, phone, ...agentData } = body;
  await prisma.$transaction(async (tx) => {
    await tx.agent.update({ where: { id: before.id }, data: agentData });
    if (firstName !== undefined || lastName !== undefined || phone !== undefined) {
      await tx.user.update({ where: { id: before.userId }, data: { firstName, lastName, phone } });
    }
  });
  const agent = await loadAgent(before.id);
  const changes = Object.fromEntries(
    Object.keys(body).map((k) => [k, { from: (k in before ? before[k as keyof typeof before] : before.user[k as keyof typeof before.user]) ?? null, to: (body as Record<string, unknown>)[k] ?? null }]),
  );
  await audit(req, 'AGENT_UPDATED', `agent:${agent.id}`, JSON.parse(JSON.stringify(changes)) as Prisma.InputJsonValue);
  res.json({ agent: agentView(agent) });
});

adminAgentsRouter.post('/:id/invite', async (req, res) => {
  const agent = await loadAgent(req.params.id);
  await sendAgentInvite({ id: agent.user.id, email: agent.user.email, locale: agent.user.locale }, agent.code);
  await audit(req, 'AGENT_INVITE_SENT', `agent:${agent.id}`, { email: agent.user.email });
  res.json({ ok: true });
});
