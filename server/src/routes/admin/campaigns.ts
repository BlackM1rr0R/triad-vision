import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { config } from '../../config.js';
import { requireMinRole } from '../../middleware/auth.js';
import { audit } from '../../lib/audit.js';
import { badRequest, conflict, limiter, notFound, parse } from '../../lib/http.js';
import { sendMailDetailed } from '../../lib/mailer.js';
import { deliver } from '../../lib/messaging/outbound.js';
import { normalizePhone } from '../../lib/messaging/providers.js';
import { previewSegment, segmentDefinition } from '../../lib/campaigns/segments.js';
import {
  allowedHosts,
  buildEmail,
  buildInApp,
  buildSms,
  campaignContent,
  collectLinks,
  LOCALES,
  legalFooterLine,
  pickLocale,
  PLACEHOLDERS,
  readContent,
  recipientVars,
  SAMPLE_VARS,
} from '../../lib/campaigns/content.js';
import { campaignStats, cancelCampaign, CHANNELS, pauseCampaign, readChannels, resumeCampaign, startCampaign } from '../../lib/campaigns/engine.js';

/**
 * Admin → Kampaniyalar (ADMIN and SUPER_ADMIN): segments, campaigns, sending controls, statistics.
 * Mounted at /api/admin/campaigns. Every write is audited (CAMPAIGN_*).
 */
export const adminCampaignsRouter = Router();
adminCampaignsRouter.use(requireMinRole('ADMIN'));

const idParam = z.string().min(1).max(40);

// ─── Segments ──────────────────────────────────────────────────────────

const segmentBody = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).nullable().optional(),
  definition: segmentDefinition,
});

adminCampaignsRouter.get('/segments', async (_req, res) => {
  const items = await prisma.campaignSegment.findMany({
    orderBy: { updatedAt: 'desc' },
    include: { createdBy: { select: { firstName: true, lastName: true } }, _count: { select: { campaigns: true } } },
  });
  res.json({ items });
});

/** Choices for the segment builder (visa categories, companies, vacancies). */
adminCampaignsRouter.get('/segments/options', async (_req, res) => {
  const [visaCategories, companies, vacancies, cities, countries] = await Promise.all([
    prisma.visaCategory.findMany({ select: { id: true, slug: true, title: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.company.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 1000 }),
    prisma.vacancy.findMany({ select: { id: true, title: true, status: true, company: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 500 }),
    prisma.user.groupBy({ by: ['city'], where: { role: { in: ['CLIENT', 'COMPANY'] }, city: { not: null } }, _count: { _all: true }, orderBy: { _count: { city: 'desc' } }, take: 100 }),
    prisma.user.groupBy({ by: ['nationality'], where: { role: { in: ['CLIENT', 'COMPANY'] }, nationality: { not: null } }, _count: { _all: true }, orderBy: { _count: { nationality: 'desc' } }, take: 100 }),
  ]);
  res.json({
    visaCategories,
    companies,
    vacancies: vacancies.map((v) => ({ id: v.id, title: v.title, status: v.status, company: v.company?.name ?? null })),
    cities: cities.map((c) => c.city).filter(Boolean),
    countries: countries.map((c) => c.nationality).filter(Boolean),
    placeholders: PLACEHOLDERS,
    allowedHosts: allowedHosts(),
  });
});

adminCampaignsRouter.post('/segments/preview', async (req, res) => {
  const { definition } = parse(z.object({ definition: segmentDefinition }), req.body ?? {});
  res.json(await previewSegment(definition));
});

adminCampaignsRouter.post('/segments', async (req, res) => {
  const body = parse(segmentBody, req.body ?? {});
  const item = await prisma.campaignSegment.create({
    data: { name: body.name, description: body.description ?? null, definition: body.definition as Prisma.InputJsonValue, createdById: req.user!.id },
  });
  await audit(req, 'CAMPAIGN_SEGMENT_CREATED', `campaign-segment:${item.id}`, { name: item.name });
  res.status(201).json({ item });
});

adminCampaignsRouter.get('/segments/:id', async (req, res) => {
  const item = await prisma.campaignSegment.findUnique({ where: { id: parse(idParam, req.params.id) } });
  if (!item) throw notFound();
  res.json({ item, preview: await previewSegment(segmentDefinition.parse(item.definition ?? {})) });
});

adminCampaignsRouter.patch('/segments/:id', async (req, res) => {
  const id = parse(idParam, req.params.id);
  const body = parse(segmentBody.partial(), req.body ?? {});
  const item = await prisma.campaignSegment.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.definition !== undefined ? { definition: body.definition as Prisma.InputJsonValue } : {}),
    },
  });
  await audit(req, 'CAMPAIGN_SEGMENT_UPDATED', `campaign-segment:${id}`, { name: item.name });
  res.json({ item });
});

adminCampaignsRouter.delete('/segments/:id', async (req, res) => {
  const id = parse(idParam, req.params.id);
  // Campaigns keep their frozen definition (segmentSnapshot); drafts lose the link.
  await prisma.campaignSegment.delete({ where: { id } });
  await audit(req, 'CAMPAIGN_SEGMENT_DELETED', `campaign-segment:${id}`);
  res.json({ ok: true });
});

// ─── Campaigns ─────────────────────────────────────────────────────────

const campaignBody = z.object({
  name: z.string().trim().min(1).max(200),
  kind: z.enum(['SERVICE', 'MARKETING']).default('SERVICE'),
  segmentId: z.string().min(1).max(40).nullable().optional(),
  channels: z.array(z.enum(CHANNELS)).min(1).max(3),
  content: campaignContent,
  emailsPerMinute: z.number().int().min(1).max(120).default(30),
  smsPerMinute: z.number().int().min(1).max(60).default(10),
  quietHours: z.boolean().default(true),
});

const EDITABLE = ['DRAFT', 'SCHEDULED'] as const;

const listSelect = {
  id: true,
  name: true,
  kind: true,
  status: true,
  channels: true,
  segmentId: true,
  segment: { select: { id: true, name: true } },
  scheduledAt: true,
  startedAt: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { firstName: true, lastName: true } },
} as const;

adminCampaignsRouter.get('/', async (_req, res) => {
  const items = await prisma.campaign.findMany({ orderBy: { createdAt: 'desc' }, take: 300, select: listSelect });
  const stats = await campaignStats(items.map((i) => i.id));
  res.json({ items: items.map((i) => ({ ...i, channels: readChannels(i.channels), stats: stats[i.id] })) });
});

const loadCampaign = async (id: string) => {
  const c = await prisma.campaign.findUnique({ where: { id }, include: { segment: true, createdBy: { select: { firstName: true, lastName: true } } } });
  if (!c) throw notFound();
  return c;
};

const ensureSegment = async (segmentId: string | null | undefined) => {
  if (!segmentId) return;
  if (!(await prisma.campaignSegment.findUnique({ where: { id: segmentId }, select: { id: true } }))) throw badRequest('SEGMENT_NOT_FOUND');
};

adminCampaignsRouter.post('/', async (req, res) => {
  const body = parse(campaignBody, req.body ?? {});
  await ensureSegment(body.segmentId);
  const item = await prisma.campaign.create({
    data: {
      name: body.name,
      kind: body.kind,
      segmentId: body.segmentId ?? null,
      channels: body.channels,
      content: body.content as Prisma.InputJsonValue,
      emailsPerMinute: body.emailsPerMinute,
      smsPerMinute: body.smsPerMinute,
      quietHours: body.quietHours,
      createdById: req.user!.id,
    },
  });
  await audit(req, 'CAMPAIGN_CREATED', `campaign:${item.id}`, { name: item.name, kind: item.kind });
  res.status(201).json({ item });
});

adminCampaignsRouter.get('/:id', async (req, res) => {
  const c = await loadCampaign(parse(idParam, req.params.id));
  const stats = (await campaignStats([c.id]))[c.id];
  res.json({ item: { ...c, channels: readChannels(c.channels), content: readContent(c.content), stats } });
});

adminCampaignsRouter.patch('/:id', async (req, res) => {
  const id = parse(idParam, req.params.id);
  const body = parse(campaignBody.partial(), req.body ?? {});
  const c = await loadCampaign(id);
  if (!(EDITABLE as readonly string[]).includes(c.status)) throw conflict('CAMPAIGN_NOT_EDITABLE');
  if (body.segmentId !== undefined) await ensureSegment(body.segmentId);
  const item = await prisma.campaign.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.kind !== undefined ? { kind: body.kind } : {}),
      ...(body.segmentId !== undefined ? { segmentId: body.segmentId } : {}),
      ...(body.channels !== undefined ? { channels: body.channels } : {}),
      ...(body.content !== undefined ? { content: body.content as Prisma.InputJsonValue } : {}),
      ...(body.emailsPerMinute !== undefined ? { emailsPerMinute: body.emailsPerMinute } : {}),
      ...(body.smsPerMinute !== undefined ? { smsPerMinute: body.smsPerMinute } : {}),
      ...(body.quietHours !== undefined ? { quietHours: body.quietHours } : {}),
      // Any edit of a scheduled campaign sends it back to draft: it must be reviewed and scheduled again.
      ...(c.status === 'SCHEDULED' ? { status: 'DRAFT', scheduledAt: null } : {}),
    },
  });
  await audit(req, 'CAMPAIGN_UPDATED', `campaign:${id}`, { fields: Object.keys(body) });
  res.json({ item });
});

adminCampaignsRouter.delete('/:id', async (req, res) => {
  const id = parse(idParam, req.params.id);
  const c = await loadCampaign(id);
  if (c.status !== 'DRAFT') throw conflict('CAMPAIGN_NOT_DRAFT');
  await prisma.campaign.delete({ where: { id } });
  await audit(req, 'CAMPAIGN_DELETED', `campaign:${id}`, { name: c.name });
  res.json({ ok: true });
});

/** Checks before scheduling: segment, channels, text in at least one language, links on the allow-list. */
const validateForSend = (c: Awaited<ReturnType<typeof loadCampaign>>) => {
  if (!c.segmentId || !c.segment) throw badRequest('SEGMENT_REQUIRED');
  const channels = readChannels(c.channels);
  if (!channels.length) throw badRequest('CHANNEL_REQUIRED');
  const content = readContent(c.content);
  for (const ch of channels) if (!pickLocale(content, 'az', ch)) throw badRequest('CONTENT_REQUIRED', ch);
  const { links, rejected } = collectLinks(content);
  if (rejected.length) throw badRequest('LINK_NOT_ALLOWED', rejected.join(', '));
  return { links, definition: segmentDefinition.parse(c.segment.definition ?? {}) };
};

adminCampaignsRouter.post('/:id/schedule', async (req, res) => {
  const id = parse(idParam, req.params.id);
  const body = parse(z.object({ sendAt: z.string().datetime({ offset: true }).nullable().optional() }), req.body ?? {});
  const c = await loadCampaign(id);
  if (!(EDITABLE as readonly string[]).includes(c.status)) throw conflict('CAMPAIGN_NOT_EDITABLE');
  const { links, definition } = validateForSend(c);
  const now = new Date();
  const at = body.sendAt ? new Date(body.sendAt) : now;
  if (at.getTime() < now.getTime() - 60_000) throw badRequest('SEND_AT_IN_PAST');
  await prisma.campaign.update({
    where: { id },
    data: { status: 'SCHEDULED', scheduledAt: at, links, segmentSnapshot: definition as Prisma.InputJsonValue },
  });
  let queued = 0;
  // "Now": the recipients are queued right away; the worker starts sending within seconds.
  if (at.getTime() <= now.getTime()) queued = await startCampaign(id, now);
  await audit(req, 'CAMPAIGN_SCHEDULED', `campaign:${id}`, { sendAt: at.toISOString(), queued, kind: c.kind });
  const fresh = await loadCampaign(id);
  res.json({ item: { ...fresh, channels: readChannels(fresh.channels) }, queued, stats: (await campaignStats([id]))[id] });
});

/** Back from SCHEDULED to DRAFT (before it started). */
adminCampaignsRouter.post('/:id/unschedule', async (req, res) => {
  const id = parse(idParam, req.params.id);
  const r = await prisma.campaign.updateMany({ where: { id, status: 'SCHEDULED' }, data: { status: 'DRAFT', scheduledAt: null } });
  if (!r.count) throw conflict('CAMPAIGN_NOT_SCHEDULED');
  await audit(req, 'CAMPAIGN_UNSCHEDULED', `campaign:${id}`);
  res.json({ ok: true });
});

adminCampaignsRouter.post('/:id/pause', async (req, res) => {
  const id = parse(idParam, req.params.id);
  const r = await pauseCampaign(id);
  if (!r.count) throw conflict('CAMPAIGN_NOT_RUNNING');
  await audit(req, 'CAMPAIGN_PAUSED', `campaign:${id}`);
  res.json({ ok: true });
});

adminCampaignsRouter.post('/:id/resume', async (req, res) => {
  const id = parse(idParam, req.params.id);
  await loadCampaign(id);
  const r = await resumeCampaign(id);
  if (!r.count) throw conflict('CAMPAIGN_NOT_PAUSED');
  await audit(req, 'CAMPAIGN_RESUMED', `campaign:${id}`);
  res.json({ ok: true });
});

adminCampaignsRouter.post('/:id/cancel', async (req, res) => {
  const id = parse(idParam, req.params.id);
  await loadCampaign(id);
  const r = await cancelCampaign(id);
  if (!r.count) throw conflict('CAMPAIGN_NOT_CANCELLABLE');
  await audit(req, 'CAMPAIGN_CANCELLED', `campaign:${id}`);
  res.json({ ok: true });
});

// ─── Preview and test ──────────────────────────────────────────────────

const previewBody = z.object({
  kind: z.enum(['SERVICE', 'MARKETING']).default('SERVICE'),
  content: campaignContent,
  locale: z.enum(LOCALES),
});

/** Renders unsaved content in one language with sample values (subject, HTML, text, SMS, in-app). */
adminCampaignsRouter.post('/preview', async (req, res) => {
  const body = parse(previewBody, req.body ?? {});
  const vars = SAMPLE_VARS[body.locale];
  const { links, rejected } = collectLinks(body.content);
  const footerLine = await legalFooterLine();
  const email = buildEmail({ kind: body.kind, content: body.content, locale: body.locale, vars, token: null, links, footerLine });
  res.json({
    email: { subject: email.subject, html: email.html, text: email.text },
    inApp: buildInApp({ content: body.content, locale: body.locale, vars }),
    sms: buildSms({ content: body.content, locale: body.locale, vars, kind: body.kind, token: null }),
    links,
    rejectedLinks: rejected,
  });
});

const testLimiter = limiter({ windowMs: 10 * 60 * 1000, limit: 20, keyGenerator: (req) => req.user?.id ?? 'anon', skip: () => config.isTest });

/** Sends the campaign to the admin themself ([TEST], no tracking, not counted). */
adminCampaignsRouter.post('/:id/test', testLimiter, async (req, res) => {
  const id = parse(idParam, req.params.id);
  const body = parse(z.object({ locale: z.enum(LOCALES).optional() }), req.body ?? {});
  const c = await loadCampaign(id);
  const me = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { id: true, email: true, phone: true, firstName: true, lastName: true, locale: true } });
  const content = readContent(c.content);
  const channels = readChannels(c.channels);
  const results: Record<string, string> = {};
  const vars = await recipientVars(me, body.locale ?? me.locale);
  for (const ch of channels) {
    const locale = body.locale && pickLocale(content, body.locale, ch) === body.locale ? body.locale : pickLocale(content, me.locale, ch);
    if (!locale) {
      results[ch] = 'NO_CONTENT';
      continue;
    }
    if (ch === 'EMAIL') {
      const mail = buildEmail({ kind: c.kind, content, locale, vars, token: null, links: [], footerLine: await legalFooterLine(), test: true });
      results[ch] = (await sendMailDetailed({ to: me.email, subject: mail.subject, html: mail.html, text: mail.text })).status;
    } else if (ch === 'IN_APP') {
      const n = buildInApp({ content, locale, vars });
      await prisma.notification.create({ data: { userId: me.id, type: 'CAMPAIGN_TEST', title: `[TEST] ${n.title}`.slice(0, 190), body: n.body } });
      results[ch] = 'SENT';
    } else {
      const to = normalizePhone(me.phone);
      if (!to) results[ch] = 'NO_PHONE';
      else results[ch] = (await deliver('SMS', to, buildSms({ content, locale, vars, kind: c.kind, token: null, test: true }), { userId: me.id, templateKey: 'CAMPAIGN_TEST' }))?.status ?? 'FAILED';
    }
  }
  await audit(req, 'CAMPAIGN_TEST_SENT', `campaign:${id}`, { results });
  res.json({ results });
});

// ─── Recipients ────────────────────────────────────────────────────────

const recipientsQuery = z.object({
  status: z.enum(['QUEUED', 'SENDING', 'SENT', 'FAILED', 'SKIPPED', 'BOUNCED']).optional(),
  channel: z.enum(CHANNELS).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

const recipientWhere = (campaignId: string, q: z.infer<typeof recipientsQuery>): Prisma.CampaignRecipientWhereInput => ({
  campaignId,
  ...(q.status ? { status: q.status } : {}),
  ...(q.channel ? { channel: q.channel } : {}),
  ...(q.q
    ? { OR: [{ address: { contains: q.q } }, { user: { firstName: { contains: q.q } } }, { user: { lastName: { contains: q.q } } }, { user: { email: { contains: q.q } } }] }
    : {}),
});

const recipientSelect = {
  id: true,
  userId: true,
  channel: true,
  locale: true,
  status: true,
  skipReason: true,
  address: true,
  attempts: true,
  sentAt: true,
  deliveredAt: true,
  openedAt: true,
  clickedAt: true,
  clicks: true,
  unsubscribedAt: true,
  notificationId: true,
  error: true,
  user: { select: { firstName: true, lastName: true, email: true, role: true } },
} as const;

const withRead = async <T extends { notificationId: string | null }>(rows: T[]) => {
  const ids = rows.map((r) => r.notificationId).filter((x): x is string => !!x);
  const read = ids.length ? await prisma.notification.findMany({ where: { id: { in: ids } }, select: { id: true, readAt: true } }) : [];
  const map = new Map(read.map((n) => [n.id, n.readAt]));
  return rows.map((r) => ({ ...r, readAt: r.notificationId ? (map.get(r.notificationId) ?? null) : null }));
};

adminCampaignsRouter.get('/:id/recipients', async (req, res) => {
  const id = parse(idParam, req.params.id);
  const q = parse(recipientsQuery, req.query);
  await loadCampaign(id);
  const where = recipientWhere(id, q);
  const [total, rows] = await Promise.all([
    prisma.campaignRecipient.count({ where }),
    prisma.campaignRecipient.findMany({ where, select: recipientSelect, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
  ]);
  res.json({ total, page: q.page, pageSize: q.pageSize, items: await withRead(rows) });
});

const csvCell = (v: unknown) => {
  const s = v instanceof Date ? v.toISOString() : v === null || v === undefined ? '' : String(v);
  // Formula injection guard for spreadsheet apps.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",;\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

adminCampaignsRouter.get('/:id/recipients.csv', async (req, res) => {
  const id = parse(idParam, req.params.id);
  const c = await loadCampaign(id);
  const rows = await withRead(await prisma.campaignRecipient.findMany({ where: { campaignId: id }, select: recipientSelect, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 100_000 }));
  const head = ['firstName', 'lastName', 'email', 'role', 'channel', 'locale', 'address', 'status', 'skipReason', 'attempts', 'sentAt', 'deliveredAt', 'openedAt', 'clickedAt', 'clicks', 'inAppReadAt', 'unsubscribedAt', 'error'];
  const lines = rows.map((r) =>
    [r.user.firstName, r.user.lastName, r.user.email, r.user.role, r.channel, r.locale, r.address, r.status, r.skipReason, r.attempts, r.sentAt, r.deliveredAt, r.openedAt, r.clickedAt, r.clicks, r.readAt, r.unsubscribedAt, r.error?.slice(0, 300)]
      .map(csvCell)
      .join(','),
  );
  await audit(req, 'CAMPAIGN_RECIPIENTS_EXPORTED', `campaign:${id}`, { rows: rows.length });
  const name = `campaign-${c.name.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 60) || id}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`);
  res.send(`﻿${head.join(',')}\n${lines.join('\n')}\n`);
});
