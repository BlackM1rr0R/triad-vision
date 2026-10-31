import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { requireMinRole } from '../../middleware/auth.js';
import { badRequest, notFound, parse } from '../../lib/http.js';
import {
  catalogText,
  NOTIFICATION_TYPES,
  PLACEHOLDERS,
  SAMPLE_PARAMS,
  type NotificationType,
} from '../../lib/notifications.js';
import { deliver, resendOutbound } from '../../lib/messaging/outbound.js';
import { normalizePhone, providerStatus } from '../../lib/messaging/providers.js';
import { invalidateTemplateCache, placeholdersIn, renderTemplate } from '../../lib/messaging/templates.js';
import { subscriberCount } from '../../lib/messaging/realtime.js';
import { getPhoneReminderSettings, MAX_LEAD, MIN_LEAD, REMINDER_KINDS, savePhoneReminderSettings } from '../../lib/messaging/appointmentReminders.js';

/** admin/messaging — outbound log, provider status, notification template editor. STAFF+ (mounted in routes/admin/index.ts). */
export const adminMessagingRouter = Router();
adminMessagingRouter.use(requireMinRole('STAFF'));

const LOCALES = ['az', 'de', 'en', 'ru'] as const;
const typeParam = z.enum(NOTIFICATION_TYPES as [NotificationType, ...NotificationType[]]);

// ─── Outbound log ──────────────────────────────────────────────────────

adminMessagingRouter.get('/outbound', async (req, res) => {
  const q = parse(
    z.object({
      page: z.coerce.number().int().min(1).default(1),
      channel: z.enum(['WHATSAPP', 'SMS']).optional(),
      status: z.enum(['QUEUED', 'SENT', 'FAILED', 'CONSOLE']).optional(),
      search: z.string().trim().max(60).optional(),
    }),
    req.query,
  );
  const where: Prisma.OutboundMessageWhereInput = {
    ...(q.channel ? { channel: q.channel } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.search ? { OR: [{ to: { contains: q.search } }, { body: { contains: q.search } }, { case: { number: { contains: q.search } } }] } : {}),
  };
  const pageSize = 25;
  const [items, total, byStatus] = await Promise.all([
    prisma.outboundMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * pageSize,
      take: pageSize,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        case: { select: { id: true, number: true } },
      },
    }),
    prisma.outboundMessage.count({ where }),
    prisma.outboundMessage.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);
  res.json({ items, total, pageSize, counts: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])) });
});

adminMessagingRouter.post('/outbound/:id/resend', requireMinRole('ADMIN'), async (req, res) => {
  const row = await prisma.outboundMessage.findUnique({ where: { id: String(req.params.id) } });
  if (!row) throw notFound('MESSAGE_NOT_FOUND');
  const sent = await resendOutbound(row.id);
  res.json({ item: sent ?? row });
});

// ─── Providers ─────────────────────────────────────────────────────────

adminMessagingRouter.get('/providers', (req, res) => {
  res.json({ providers: providerStatus(), realtime: { me: subscriberCount(req.user!.id) } });
});

adminMessagingRouter.post('/providers/test', requireMinRole('SUPER_ADMIN'), async (req, res) => {
  const body = parse(
    z.object({ channel: z.enum(['WHATSAPP', 'SMS']), to: z.string().trim().min(5).max(40), text: z.string().trim().min(1).max(1000).optional() }),
    req.body,
  );
  const to = normalizePhone(body.to);
  if (!to) throw badRequest('INVALID_PHONE');
  const item = await deliver(body.channel, to, body.text ?? `Triad Vision test message (${new Date().toISOString()})`, { userId: null });
  res.json({ item });
});

// ─── Phone reminders (WhatsApp / SMS before appointments) ─────────────

adminMessagingRouter.get('/reminders', async (_req, res) => {
  res.json({ settings: await getPhoneReminderSettings(), limits: { minLead: MIN_LEAD, maxLead: MAX_LEAD, maxLeads: 3 } });
});

adminMessagingRouter.put('/reminders', requireMinRole('ADMIN'), async (req, res) => {
  const body = parse(
    z.object({
      enabled: z.boolean(),
      leadMinutes: z.array(z.number().int().min(MIN_LEAD).max(MAX_LEAD)).min(1).max(3),
      kinds: z.object(Object.fromEntries(REMINDER_KINDS.map((k) => [k, z.boolean()])) as Record<(typeof REMINDER_KINDS)[number], z.ZodBoolean>),
    }),
    req.body,
  );
  res.json({ settings: await savePhoneReminderSettings(body) });
});

// ─── Notification templates ───────────────────────────────────────────

adminMessagingRouter.get('/templates', async (_req, res) => {
  const rows = await prisma.notificationTemplate.findMany({
    include: { updatedBy: { select: { firstName: true, lastName: true } } },
  });
  const byKey = new Map(rows.map((r) => [`${r.type}:${r.locale}`, r]));
  const types = NOTIFICATION_TYPES.map((type) => ({
    type,
    placeholders: PLACEHOLDERS[type],
    locales: Object.fromEntries(
      LOCALES.map((locale) => {
        const def = catalogText(type, locale, SAMPLE_PARAMS[locale]);
        const o = byKey.get(`${type}:${locale}`);
        return [
          locale,
          {
            default: def,
            override: o ? { title: o.title, body: o.body, updatedAt: o.updatedAt, updatedBy: o.updatedBy } : null,
          },
        ];
      }),
    ),
  }));
  res.json({ types, samples: SAMPLE_PARAMS });
});

const templateBody = z.object({ title: z.string().max(200), body: z.string().max(4000) });

/** Empty title and body remove the override (reset to the code default). ADMIN+. */
adminMessagingRouter.put('/templates/:type/:locale', requireMinRole('ADMIN'), async (req, res) => {
  const type = parse(typeParam, req.params.type);
  const locale = parse(z.enum(LOCALES), req.params.locale);
  const body = parse(templateBody, req.body);
  const title = body.title.trim();
  const text = body.body.trim();
  if (!title && !text) {
    await prisma.notificationTemplate.deleteMany({ where: { type, locale } });
    invalidateTemplateCache();
    res.json({ override: null });
    return;
  }
  if (!title || !text) throw badRequest('TITLE_AND_BODY_REQUIRED');
  const unknown = [...placeholdersIn(title), ...placeholdersIn(text)].filter((p) => !PLACEHOLDERS[type].includes(p));
  if (unknown.length) throw badRequest('UNKNOWN_PLACEHOLDER', `Unknown placeholder(s): ${unknown.join(', ')}`);
  const row = await prisma.notificationTemplate.upsert({
    where: { type_locale: { type, locale } },
    create: { type, locale, title, body: text, updatedById: req.user!.id },
    update: { title, body: text, updatedById: req.user!.id },
  });
  invalidateTemplateCache();
  res.json({ override: { title: row.title, body: row.body, updatedAt: row.updatedAt } });
});

adminMessagingRouter.post('/templates/:type/preview', async (req, res) => {
  const type = parse(typeParam, req.params.type);
  const body = parse(z.object({ locale: z.enum(LOCALES), title: z.string().max(200), body: z.string().max(4000) }), req.body);
  const params = SAMPLE_PARAMS[body.locale];
  const unknown = [...placeholdersIn(body.title), ...placeholdersIn(body.body)].filter((p) => !PLACEHOLDERS[type].includes(p));
  res.json({ title: renderTemplate(body.title, params), body: renderTemplate(body.body, params), unknown });
});
