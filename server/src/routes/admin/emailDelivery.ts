import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { audit } from '../../lib/audit.js';
import { badRequest, notFound, parse } from '../../lib/http.js';
import { checkSendingDomain, type DomainCheck } from '../../lib/deliverability/dns.js';
import { emailDomain } from '../../lib/deliverability/dsn.js';
import { DECREASE_COOLDOWN_MS, effectiveDailyLimit, MIN_SAMPLE, PROBLEM_THRESHOLD, RECOVER_BELOW, RECOVER_EVERY_MS } from '../../lib/deliverability/health.js';
import { EMPLOYER_CATEGORY, employerSendStats, getSendHealth, resetSendHealth, sendingDomain } from '../../lib/deliverability/service.js';
import { agencyMailboxes } from '../../lib/deliverability/inbound.js';
import { getAutoSendSettings } from '../../lib/germanyJobs/autoSettings.js';

/**
 * Admin → E-poçt göndərişi (ADMIN+, mounted at /api/admin/email-delivery; access area communications):
 *   GET    /                    EmailLog per day (14 days) and per recipient domain (7 days), SMTP errors, bounces,
 *                               complaints, suppression list, auto-send limit health, which mailboxes are read
 *   GET    /dns                 SPF / DKIM / DMARC of the sending domain (read-only DNS lookups, cached 10 min)
 *   POST   /suppressions        { address, note? } → never send automatically to it (audited)
 *   DELETE /suppressions/:id    remove an address from the list (audited)
 *   POST   /health/reset        back to the full external auto-send daily limit (audited)
 * GET handlers only read (safe under "view as client").
 */
export const adminEmailDeliveryRouter = Router();

const DAY = 24 * 60 * 60 * 1000;

adminEmailDeliveryRouter.get('/', async (_req, res) => {
  const now = new Date();
  const since14 = new Date(now.getTime() - 14 * DAY);
  const since7 = new Date(now.getTime() - 7 * DAY);
  const [daily, domains, failures, bounces, suppressions, suppressionCount, settings, health, stats, mailboxes, mailAccounts] = await Promise.all([
    prisma.$queryRaw<{ d: string; status: string; category: string | null; c: bigint }[]>(Prisma.sql`
      SELECT DATE_FORMAT(createdAt, '%Y-%m-%d') AS d, status, category, COUNT(*) AS c
      FROM EmailLog WHERE createdAt >= ${since14}
      GROUP BY d, status, category ORDER BY d`),
    prisma.emailLog.groupBy({ by: ['toDomain', 'status'], where: { createdAt: { gte: since7 } }, _count: { _all: true } }),
    prisma.emailLog.findMany({
      where: { status: 'FAILED', createdAt: { gte: since14 } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, to: true, subject: true, error: true, responseCode: true, category: true, createdAt: true },
    }),
    prisma.emailBounce.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.emailSuppression.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }),
    prisma.emailSuppression.count(),
    getAutoSendSettings(),
    getSendHealth(),
    employerSendStats(now),
    agencyMailboxes(),
    prisma.mailAccount.findMany({ select: { email: true, syncEnabled: true, syncStatus: true, lastSyncAt: true } }),
  ]);

  const days = new Map<string, { day: string; sent: number; failed: number; console: number; employer: number; campaign: number }>();
  for (const r of daily) {
    const row = days.get(r.d) ?? { day: r.d, sent: 0, failed: 0, console: 0, employer: 0, campaign: 0 };
    const c = Number(r.c);
    if (r.status === 'SENT') row.sent += c;
    else if (r.status === 'FAILED') row.failed += c;
    else if (r.status === 'CONSOLE') row.console += c;
    if (r.category === EMPLOYER_CATEGORY) row.employer += c;
    if (r.category === 'CAMPAIGN') row.campaign += c;
    days.set(r.d, row);
  }

  const bounced7 = bounces.filter((b) => b.createdAt >= since7);
  const perDomain = new Map<string, { domain: string; sent: number; failed: number; bounced: number }>();
  for (const g of domains) {
    const key = g.toDomain ?? '';
    if (!key) continue;
    const row = perDomain.get(key) ?? { domain: key, sent: 0, failed: 0, bounced: 0 };
    if (g.status === 'FAILED') row.failed += g._count._all;
    else row.sent += g._count._all;
    perDomain.set(key, row);
  }
  for (const b of bounced7) {
    const d = emailDomain(b.address);
    const row = perDomain.get(d) ?? { domain: d, sent: 0, failed: 0, bounced: 0 };
    if (b.kind !== 'SOFT') row.bounced++;
    perDomain.set(d, row);
  }

  const watched = Array.from(mailboxes);
  res.json({
    sendingDomain: sendingDomain(),
    days: Array.from(days.values()),
    domains: Array.from(perDomain.values())
      .sort((a, b) => b.sent + b.failed - (a.sent + a.failed))
      .slice(0, 30),
    failures: failures.map((f) => ({ ...f, error: (f.error ?? '').slice(0, 400) })),
    bounces: bounces.map((b) => ({ id: b.id, address: b.address, kind: b.kind, status: b.status, diagnostic: b.diagnostic, source: b.source, at: b.createdAt })),
    suppressions: suppressions.map((s) => ({ id: s.id, address: s.address, reason: s.reason, detail: s.detail, at: s.createdAt })),
    suppressionCount,
    autoSend: {
      dailyLimit: settings.dailyLimit,
      effectiveLimit: effectiveDailyLimit(settings.dailyLimit, health.factor),
      health,
      stats,
      rules: { threshold: PROBLEM_THRESHOLD, recoverBelow: RECOVER_BELOW, minSample: MIN_SAMPLE, cooldownHours: DECREASE_COOLDOWN_MS / 3600_000, recoverDays: RECOVER_EVERY_MS / DAY },
    },
    // Bounces and employer answers are read only from these mailboxes, and only while someone syncs them in the workspace mail.
    mailboxes: watched.map((address) => {
      const accounts = mailAccounts.filter((a) => a.email.toLowerCase() === address);
      const synced = accounts.filter((a) => a.syncEnabled);
      return { address, synced: synced.length > 0, lastSyncAt: synced.map((a) => a.lastSyncAt).filter(Boolean).sort().pop() ?? null, error: synced.some((a) => a.syncStatus === 'ERROR') };
    }),
  });
});

let dnsCache: { at: number; domain: string; value: DomainCheck } | null = null;

adminEmailDeliveryRouter.get('/dns', async (req, res) => {
  const domain = sendingDomain();
  const fresh = req.query.refresh === '1';
  if (!fresh && dnsCache && dnsCache.domain === domain && Date.now() - dnsCache.at < 10 * 60 * 1000) {
    res.json(dnsCache.value);
    return;
  }
  try {
    const selectors = (process.env.DKIM_SELECTORS ?? '').split(',');
    const value = await checkSendingDomain(domain, selectors);
    dnsCache = { at: Date.now(), domain, value };
    res.json(value);
  } catch (err) {
    if ((err as Error).message === 'INVALID_DOMAIN') throw badRequest('INVALID_DOMAIN');
    throw err;
  }
});

const suppressionInput = z
  .object({
    address: z.string().trim().toLowerCase().email().max(190),
    note: z
      .string()
      .trim()
      .max(300)
      .optional()
      .transform((v) => v || null),
  })
  .strict();

adminEmailDeliveryRouter.post('/suppressions', async (req, res) => {
  const body = parse(suppressionInput, req.body);
  const row = await prisma.emailSuppression.upsert({
    where: { address: body.address },
    create: { address: body.address, reason: 'MANUAL', detail: body.note, createdById: req.user!.id },
    update: {},
  });
  await audit(req, 'EMAIL_SUPPRESSION_ADDED', `email-suppression:${row.id}`, { domain: emailDomain(body.address) });
  res.status(201).json({ id: row.id });
});

adminEmailDeliveryRouter.delete('/suppressions/:id', async (req, res) => {
  const row = await prisma.emailSuppression.findUnique({ where: { id: String(req.params.id) } });
  if (!row) throw notFound('SUPPRESSION_NOT_FOUND');
  await prisma.emailSuppression.delete({ where: { id: row.id } });
  await audit(req, 'EMAIL_SUPPRESSION_REMOVED', `email-suppression:${row.id}`, { reason: row.reason, domain: emailDomain(row.address) });
  res.json({ ok: true });
});

adminEmailDeliveryRouter.post('/health/reset', async (req, res) => {
  const before = await getSendHealth();
  await resetSendHealth();
  await audit(req, 'EMAIL_AUTO_LIMIT_RESET', 'setting:externalAutoSendHealth', { factor: before.factor });
  res.json({ ok: true });
});
