import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { requireMinRole } from '../../middleware/auth.js';
import { badRequest, conflict, notFound, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { ensurePartnerCode, generatePublicApiKey, limiter } from '../../lib/publicApi/keys.js';

/**
 * Public vacancy API keys of referral partners (/api/admin/public-api-keys, ADMIN+):
 *   GET    /                 keys with partner, usage (last 30 days: requests, rate-limited, applications) and the partner list
 *   POST   /                 create { partnerId, name, rateLimitPerMinute } → the secret, shown once
 *   PATCH  /:id              change name / rateLimitPerMinute
 *   POST   /:id/revoke       revoke (cannot be undone)
 */
export const adminPublicApiKeysRouter = Router();
adminPublicApiKeysRouter.use(requireMinRole('ADMIN'));

const DAY_MS = 24 * 60 * 60 * 1000;
const USAGE_DAYS = 30;

type KeyRow = Awaited<ReturnType<typeof prisma.publicApiKey.findMany>>[number];

const keyView = (k: KeyRow, extra: { partner: { id: string; name: string; code: string | null } | null; requests30d: number; rateLimited30d: number; applications: number; daily: { day: string; requests: number }[] }) => ({
  id: k.id,
  name: k.name,
  prefix: k.prefix,
  rateLimitPerMinute: k.rateLimitPerMinute,
  revokedAt: k.revokedAt,
  lastUsedAt: k.lastUsedAt,
  createdAt: k.createdAt,
  ...extra,
});

adminPublicApiKeysRouter.get('/', async (_req, res) => {
  const keys = await prisma.publicApiKey.findMany({ orderBy: { createdAt: 'desc' }, take: 500 });
  const ids = keys.map((k) => k.id);
  const since = new Date(Math.floor(Date.now() / DAY_MS) * DAY_MS - (USAGE_DAYS - 1) * DAY_MS);
  const [partners, usage, attributions] = await Promise.all([
    prisma.referralPartner.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, code: true, active: true }, take: 2000 }),
    ids.length ? prisma.publicApiKeyUsage.findMany({ where: { keyId: { in: ids }, day: { gte: since } }, orderBy: { day: 'asc' } }) : [],
    ids.length ? prisma.publicApiAttribution.groupBy({ by: ['keyId'], where: { keyId: { in: ids } }, _count: { _all: true } }) : [],
  ]);
  const partnerOf = new Map(partners.map((p) => [p.id, p]));
  const appsOf = new Map(attributions.map((a) => [a.keyId, a._count._all]));
  res.json({
    usageDays: USAGE_DAYS,
    partners: partners.map((p) => ({ id: p.id, name: p.name, active: p.active })),
    keys: keys.map((k) => {
      const rows = usage.filter((u) => u.keyId === k.id);
      const p = partnerOf.get(k.referralPartnerId);
      return keyView(k, {
        partner: p ? { id: p.id, name: p.name, code: p.code } : null,
        requests30d: rows.reduce((a, u) => a + u.requests, 0),
        rateLimited30d: rows.reduce((a, u) => a + u.rateLimited, 0),
        applications: appsOf.get(k.id) ?? 0,
        daily: rows.map((u) => ({ day: u.day.toISOString().slice(0, 10), requests: u.requests })),
      });
    }),
  });
});

const limitSchema = z.coerce.number().int().min(1).max(6000);

adminPublicApiKeysRouter.post('/', async (req, res) => {
  const body = parse(z.object({ partnerId: z.string().trim().min(1).max(40), name: z.string().trim().min(2).max(80), rateLimitPerMinute: limitSchema.default(60) }), req.body);
  const partner = await prisma.referralPartner.findUnique({ where: { id: body.partnerId }, select: { id: true, name: true, code: true, active: true } });
  if (!partner) throw badRequest('INVALID_PARTNER');
  if (!partner.active) throw conflict('PARTNER_INACTIVE');
  const code = partner.code ?? (await ensurePartnerCode(partner.id));
  const { key, keyHash, prefix } = generatePublicApiKey();
  const row = await prisma.publicApiKey.create({
    data: { referralPartnerId: partner.id, name: body.name, prefix, keyHash, rateLimitPerMinute: body.rateLimitPerMinute, createdById: req.user!.id },
  });
  await audit(req, 'PUBLIC_API_KEY_CREATED', `public-api-key:${row.id}`, { partnerId: partner.id, name: row.name, rateLimitPerMinute: row.rateLimitPerMinute });
  // The only moment the full key is ever shown.
  res.status(201).json({
    key: keyView(row, { partner: { id: partner.id, name: partner.name, code }, requests30d: 0, rateLimited30d: 0, applications: 0, daily: [] }),
    secret: key,
  });
});

adminPublicApiKeysRouter.patch('/:id', async (req, res) => {
  const body = parse(z.object({ name: z.string().trim().min(2).max(80).optional(), rateLimitPerMinute: limitSchema.optional() }), req.body);
  const row = await prisma.publicApiKey.findUnique({ where: { id: String(req.params.id) } });
  if (!row) throw notFound('API_KEY_NOT_FOUND');
  const updated = await prisma.publicApiKey.update({ where: { id: row.id }, data: { ...(body.name ? { name: body.name } : {}), ...(body.rateLimitPerMinute ? { rateLimitPerMinute: body.rateLimitPerMinute } : {}) } });
  limiter.reset(row.id);
  await audit(req, 'PUBLIC_API_KEY_UPDATED', `public-api-key:${row.id}`, { name: updated.name, rateLimitPerMinute: updated.rateLimitPerMinute });
  res.json({ ok: true, rateLimitPerMinute: updated.rateLimitPerMinute, name: updated.name });
});

adminPublicApiKeysRouter.post('/:id/revoke', async (req, res) => {
  const row = await prisma.publicApiKey.findUnique({ where: { id: String(req.params.id) } });
  if (!row) throw notFound('API_KEY_NOT_FOUND');
  if (row.revokedAt) throw conflict('ALREADY_REVOKED');
  const updated = await prisma.publicApiKey.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
  await audit(req, 'PUBLIC_API_KEY_REVOKED', `public-api-key:${row.id}`, { partnerId: row.referralPartnerId });
  res.json({ ok: true, revokedAt: updated.revokedAt });
});
