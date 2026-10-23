import crypto from 'node:crypto';
import { Prisma, type Campaign, type CampaignChannel, type CampaignRecipient, type Locale, type User } from '@prisma/client';
import { prisma } from '../../db.js';
import { config } from '../../config.js';
import { sendMailDetailed } from '../mailer.js';
import { publish } from '../messaging/realtime.js';
import { deliver } from '../messaging/outbound.js';
import { normalizePhone } from '../messaging/providers.js';
import { buildEmail, buildInApp, buildSms, legalFooterLine, pickLocale, readContent, recipientVars, type CampaignContent } from './content.js';
import { segmentDefinition, segmentWhere, type SegmentDefinition } from './segments.js';

/**
 * Sending engine. A campaign is queued once (startCampaign: one CampaignRecipient row per person and
 * channel, unique on campaignId+userId+channel), then the worker (campaignTick, every 10 s) sends the
 * queue in small throttled batches:
 *
 *  - throttling: per campaign emailsPerMinute / smsPerMinute over a sliding 60-second window, plus a
 *    global e-mail ceiling for all campaigns together (CAMPAIGN_MAX_EMAILS_PER_MINUTE, default 60) so
 *    our own mail server is never rate-limited or blacklisted;
 *  - idempotency: a row is claimed (QUEUED → SENDING) with a conditional update before anything goes
 *    out, so two workers or a restart never send it twice. A row left in SENDING by a crash is marked
 *    FAILED (INTERRUPTED), not re-sent;
 *  - retries: transient e-mail failures go back to QUEUED with exponential backoff (1, 2, 4 min …) up to
 *    MAX_ATTEMPTS; SMTP 5xx rejects are final (BOUNCED). SMS retries are left to the messaging module's
 *    outbound job (it retries the OutboundMessage row); the recipient row follows that row's status;
 *  - quiet hours: no SMS between 21:00 and 09:00 Baku time (they wait in the queue);
 *  - consent is checked again right before each send, so an unsubscribe is honoured immediately.
 */

const MINUTE = 60 * 1000;
export const TICK_MS = 10 * 1000;
export const MAX_ATTEMPTS = 4;
const STALE_SENDING_MS = 15 * MINUTE;
const IN_APP_BATCH = 200;

const globalEmailCap = () => {
  const n = Number(process.env.CAMPAIGN_MAX_EMAILS_PER_MINUTE ?? '');
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 60;
};

export const CHANNELS = ['EMAIL', 'SMS', 'IN_APP'] as const satisfies readonly CampaignChannel[];

export const readChannels = (raw: unknown): CampaignChannel[] =>
  Array.isArray(raw) ? CHANNELS.filter((c) => raw.includes(c)) : [];

export const readLinks = (raw: unknown): string[] => (Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []);

/** Baku is UTC+4 all year (no daylight saving since 2016). */
export const bakuHour = (d: Date) => (d.getUTCHours() + 4) % 24;
export const isQuietHour = (d: Date) => {
  const h = bakuHour(d);
  return h >= 21 || h < 9;
};

const newToken = () => crypto.randomBytes(18).toString('base64url');

type RecipientUser = Pick<User, 'id' | 'email' | 'phone' | 'locale' | 'isActive' | 'marketingOptIn' | 'emailNotifications' | 'smsNotifications'>;
const userSelect = { id: true, email: true, phone: true, locale: true, isActive: true, marketingOptIn: true, emailNotifications: true, smsNotifications: true } as const;

/** Why a person cannot get this channel right now (null = may be sent). */
export const skipReason = (kind: Campaign['kind'], channel: CampaignChannel, u: RecipientUser): string | null => {
  if (!u.isActive) return 'INACTIVE';
  if (kind === 'MARKETING' && !u.marketingOptIn) return 'NO_MARKETING_CONSENT';
  if (channel === 'EMAIL') {
    if (!u.email) return 'NO_EMAIL';
    if (u.emailNotifications === false) return 'EMAIL_OPTED_OUT';
  }
  if (channel === 'SMS') {
    if (!normalizePhone(u.phone)) return 'NO_PHONE';
    if (u.smsNotifications === false) return 'SMS_OPTED_OUT';
  }
  return null;
};

/**
 * Queues the recipients of a SCHEDULED (or DRAFT, when sent right away) campaign and switches it to
 * SENDING. The segment is evaluated now; its definition is frozen on the campaign. Returns the number
 * of rows written (0 when another worker already started it).
 */
export const startCampaign = async (campaignId: string, now = new Date()) => {
  const claimed = await prisma.campaign.updateMany({
    where: { id: campaignId, status: 'SCHEDULED' },
    data: { status: 'SENDING', startedAt: now },
  });
  if (claimed.count !== 1) return 0;
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId }, include: { segment: true } });
  const def: SegmentDefinition = segmentDefinition.parse(campaign.segmentSnapshot ?? campaign.segment?.definition ?? {});
  const content = readContent(campaign.content);
  const channels = readChannels(campaign.channels);
  const where = segmentWhere(def, now);
  let written = 0;
  let cursor: string | undefined;
  for (;;) {
    const users = await prisma.user.findMany({
      where,
      select: userSelect,
      orderBy: { id: 'asc' },
      take: 500,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (!users.length) break;
    cursor = users[users.length - 1]!.id;
    const rows: Prisma.CampaignRecipientCreateManyInput[] = [];
    for (const u of users) {
      for (const channel of channels) {
        const locale = pickLocale(content, u.locale, channel);
        const reason = locale ? skipReason(campaign.kind, channel, u) : 'NO_CONTENT';
        rows.push({
          campaignId,
          userId: u.id,
          channel,
          locale: locale ?? u.locale,
          status: reason ? 'SKIPPED' : 'QUEUED',
          skipReason: reason,
          token: newToken(),
          address: channel === 'EMAIL' ? u.email : channel === 'SMS' ? normalizePhone(u.phone) : null,
        });
      }
    }
    // skipDuplicates + the unique key: a second start can never queue anybody twice.
    const res = await prisma.campaignRecipient.createMany({ data: rows, skipDuplicates: true });
    written += res.count;
  }
  await prisma.campaign.update({ where: { id: campaignId }, data: { segmentSnapshot: def as Prisma.InputJsonValue } });
  return written;
};

// ─── Worker ────────────────────────────────────────────────────────────

const claim = async (r: CampaignRecipient, now: Date) =>
  (
    await prisma.campaignRecipient.updateMany({
      where: { id: r.id, status: 'QUEUED' },
      data: { status: 'SENDING', attempts: { increment: 1 }, lastAttemptAt: now },
    })
  ).count === 1;

const backoff = (attempts: number) => MINUTE * 2 ** Math.max(0, attempts - 1);

type Ctx = { campaign: Campaign; content: CampaignContent; links: string[]; footerLine: string; now: Date };

/** Re-checks consent and sends one claimed row. */
const sendOne = async (ctx: Ctx, r: CampaignRecipient) => {
  const { campaign, now } = ctx;
  const user = await prisma.user.findUnique({ where: { id: r.userId }, select: { ...userSelect, firstName: true, lastName: true } });
  const reason = user ? skipReason(campaign.kind, r.channel, user) : 'INACTIVE';
  if (!user || reason) {
    await prisma.campaignRecipient.update({ where: { id: r.id }, data: { status: 'SKIPPED', skipReason: reason === 'NO_MARKETING_CONSENT' ? 'UNSUBSCRIBED' : reason } });
    return;
  }
  const locale: Locale = r.locale;
  const vars = await recipientVars(user, locale);

  if (r.channel === 'IN_APP') {
    const { title, body } = buildInApp({ content: ctx.content, locale, vars });
    const n = await prisma.notification.create({ data: { userId: user.id, type: 'CAMPAIGN', title, body, link: null } });
    publish(user.id, 'notification', { id: n.id, type: 'CAMPAIGN', title, body, link: null, caseId: null });
    await prisma.campaignRecipient.update({ where: { id: r.id }, data: { status: 'SENT', sentAt: now, deliveredAt: now, notificationId: n.id, error: null } });
    return;
  }

  if (r.channel === 'SMS') {
    const to = normalizePhone(user.phone);
    const text = buildSms({ content: ctx.content, locale, vars, kind: campaign.kind, token: r.token });
    const row = to ? await deliver('SMS', to, text, { userId: user.id, templateKey: 'CAMPAIGN' }) : null;
    const ok = row && (row.status === 'SENT' || row.status === 'CONSOLE');
    await prisma.campaignRecipient.update({
      where: { id: r.id },
      data: ok
        ? { status: 'SENT', sentAt: now, address: to, outboundId: row.id, providerId: row.providerId ?? null, error: null }
        : { status: 'FAILED', address: to, outboundId: row?.id ?? null, error: (row?.error ?? 'SMS_NOT_SENT').slice(0, 2000) },
    });
    return;
  }

  // EMAIL
  const mail = buildEmail({ kind: campaign.kind, content: ctx.content, locale, vars, token: r.token, links: ctx.links, footerLine: ctx.footerLine });
  const res = await sendMailDetailed({ to: user.email, subject: mail.subject, html: mail.html, text: mail.text, headers: mail.headers });
  if (config.isTest) testOutbox.push({ to: user.email, ...mail });
  if (res.status !== 'FAILED') {
    await prisma.campaignRecipient.update({ where: { id: r.id }, data: { status: 'SENT', sentAt: now, deliveredAt: now, address: user.email, error: null } });
    return;
  }
  const permanent = (res.responseCode ?? 0) >= 500;
  const attempts = r.attempts + 1;
  await prisma.campaignRecipient.update({
    where: { id: r.id },
    data: permanent
      ? { status: 'BOUNCED', error: res.error ?? 'REJECTED' }
      : attempts >= MAX_ATTEMPTS
        ? { status: 'FAILED', error: res.error ?? 'FAILED' }
        : { status: 'QUEUED', nextAttemptAt: new Date(now.getTime() + backoff(attempts)), error: res.error ?? 'FAILED' },
  });
};

/** Messages the test run would have sent (only filled when NODE_ENV=test; nothing leaves the process). */
export const testOutbox: { to: string; subject: string; html: string; text: string; headers: Record<string, string> }[] = [];

const recentCount = (where: Prisma.CampaignRecipientWhereInput, now: Date) =>
  prisma.campaignRecipient.count({ where: { ...where, lastAttemptAt: { gt: new Date(now.getTime() - MINUTE) } } });

const due = (now: Date): Prisma.CampaignRecipientWhereInput => ({ status: 'QUEUED', OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] });

/** Budget for one tick: the sliding-window rest, smoothed to the share of one tick unless `burst`. */
const tickBudget = (perMinute: number, usedInWindow: number, burst: boolean) => {
  const rest = Math.max(0, perMinute - usedInWindow);
  return burst ? rest : Math.min(rest, Math.max(1, Math.ceil((perMinute * TICK_MS) / MINUTE)));
};

const processCampaign = async (campaign: Campaign, now: Date, burst: boolean, globalEmailRest: { n: number }) => {
  const ctx: Ctx = { campaign, content: readContent(campaign.content), links: readLinks(campaign.links), footerLine: await legalFooterLine(), now };

  // E-mail
  const emailUsed = await recentCount({ campaignId: campaign.id, channel: 'EMAIL' }, now);
  const emailBudget = Math.min(tickBudget(campaign.emailsPerMinute, emailUsed, burst), globalEmailRest.n);
  if (emailBudget > 0) {
    const rows = await prisma.campaignRecipient.findMany({ where: { campaignId: campaign.id, channel: 'EMAIL', ...due(now) }, orderBy: { id: 'asc' }, take: emailBudget });
    for (const r of rows) {
      if (!(await claim(r, now))) continue;
      globalEmailRest.n -= 1;
      await sendOne(ctx, r);
    }
  }

  // SMS (never during quiet hours)
  if (!(campaign.quietHours && isQuietHour(now))) {
    const smsUsed = await recentCount({ campaignId: campaign.id, channel: 'SMS' }, now);
    const smsBudget = tickBudget(campaign.smsPerMinute, smsUsed, burst);
    if (smsBudget > 0) {
      const rows = await prisma.campaignRecipient.findMany({ where: { campaignId: campaign.id, channel: 'SMS', ...due(now) }, orderBy: { id: 'asc' }, take: smsBudget });
      for (const r of rows) if (await claim(r, now)) await sendOne(ctx, r);
    }
  }

  // In-app (no external server involved)
  const inApp = await prisma.campaignRecipient.findMany({ where: { campaignId: campaign.id, channel: 'IN_APP', ...due(now) }, orderBy: { id: 'asc' }, take: IN_APP_BATCH });
  for (const r of inApp) if (await claim(r, now)) await sendOne(ctx, r);

  const open = await prisma.campaignRecipient.count({ where: { campaignId: campaign.id, status: { in: ['QUEUED', 'SENDING'] } } });
  if (open === 0) {
    await prisma.campaign.updateMany({ where: { id: campaign.id, status: 'SENDING' }, data: { status: 'COMPLETED', completedAt: now } });
  }
};

/** SMS rows marked FAILED whose OutboundMessage was later delivered by the messaging retry job. */
const syncSmsRetries = async (now: Date) => {
  const failed = await prisma.campaignRecipient.findMany({
    where: { channel: 'SMS', status: 'FAILED', outboundId: { not: null }, updatedAt: { gt: new Date(now.getTime() - 3 * 60 * MINUTE) } },
    select: { id: true, outboundId: true },
    take: 500,
  });
  if (!failed.length) return;
  const sent = await prisma.outboundMessage.findMany({ where: { id: { in: failed.map((f) => f.outboundId!) }, status: { in: ['SENT', 'CONSOLE'] } }, select: { id: true, sentAt: true, providerId: true } });
  for (const o of sent) {
    const r = failed.find((f) => f.outboundId === o.id)!;
    await prisma.campaignRecipient.update({ where: { id: r.id }, data: { status: 'SENT', sentAt: o.sentAt ?? now, providerId: o.providerId, error: null } });
  }
};

/**
 * One worker run. `burst` sends the whole sliding-window budget at once (tests); the scheduled job
 * spreads it over the minute.
 */
export const campaignTick = async (opts: { now?: Date; burst?: boolean } = {}) => {
  const now = opts.now ?? new Date();
  const burst = opts.burst ?? false;

  const dueCampaigns = await prisma.campaign.findMany({ where: { status: 'SCHEDULED', scheduledAt: { lte: now } }, select: { id: true } });
  for (const c of dueCampaigns) await startCampaign(c.id, now);

  // A crash between claim and result: the message may have gone out, so it is never re-sent.
  await prisma.campaignRecipient.updateMany({
    where: { status: 'SENDING', lastAttemptAt: { lt: new Date(now.getTime() - STALE_SENDING_MS) } },
    data: { status: 'FAILED', error: 'INTERRUPTED' },
  });

  await syncSmsRetries(now);

  const globalUsed = await recentCount({ channel: 'EMAIL' }, now);
  const globalEmailRest = { n: Math.max(0, globalEmailCap() - globalUsed) };
  const sending = await prisma.campaign.findMany({ where: { status: 'SENDING' }, orderBy: { startedAt: 'asc' } });
  for (const c of sending) await processCampaign(c, now, burst, globalEmailRest);
};

// ─── Controls ──────────────────────────────────────────────────────────

export const pauseCampaign = (id: string) =>
  prisma.campaign.updateMany({ where: { id, status: { in: ['SENDING', 'SCHEDULED'] } }, data: { status: 'PAUSED', pausedAt: new Date() } });

/** A paused campaign goes back to SENDING (or SCHEDULED when it was paused before it started). */
export const resumeCampaign = async (id: string) => {
  const c = await prisma.campaign.findUniqueOrThrow({ where: { id }, select: { status: true, startedAt: true } });
  if (c.status !== 'PAUSED') return { count: 0 };
  return prisma.campaign.updateMany({ where: { id, status: 'PAUSED' }, data: { status: c.startedAt ? 'SENDING' : 'SCHEDULED', pausedAt: null } });
};

export const cancelCampaign = async (id: string) => {
  const res = await prisma.campaign.updateMany({
    where: { id, status: { in: ['SCHEDULED', 'SENDING', 'PAUSED'] } },
    data: { status: 'CANCELLED', cancelledAt: new Date() },
  });
  if (res.count) await prisma.campaignRecipient.updateMany({ where: { campaignId: id, status: 'QUEUED' }, data: { status: 'SKIPPED', skipReason: 'CANCELLED' } });
  return res;
};

// ─── Statistics ────────────────────────────────────────────────────────

export interface CampaignStats {
  total: number;
  queued: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  failed: number;
  bounced: number;
  skipped: number;
  unsubscribed: number;
  inAppRead: number;
  byChannel: Record<string, Record<string, number>>;
}

export const campaignStats = async (ids: string[]): Promise<Record<string, CampaignStats>> => {
  const out: Record<string, CampaignStats> = {};
  for (const id of ids) {
    out[id] = { total: 0, queued: 0, sent: 0, delivered: 0, opened: 0, clicked: 0, failed: 0, bounced: 0, skipped: 0, unsubscribed: 0, inAppRead: 0, byChannel: {} };
  }
  if (!ids.length) return out;
  const [byStatus, delivered, opened, clicked, unsub, read] = await Promise.all([
    prisma.campaignRecipient.groupBy({ by: ['campaignId', 'channel', 'status'], where: { campaignId: { in: ids } }, _count: { _all: true } }),
    prisma.campaignRecipient.groupBy({ by: ['campaignId'], where: { campaignId: { in: ids }, status: 'SENT', deliveredAt: { not: null } }, _count: { _all: true } }),
    prisma.campaignRecipient.groupBy({ by: ['campaignId'], where: { campaignId: { in: ids }, channel: 'EMAIL', openedAt: { not: null } }, _count: { _all: true } }),
    prisma.campaignRecipient.groupBy({ by: ['campaignId'], where: { campaignId: { in: ids }, clickedAt: { not: null } }, _count: { _all: true } }),
    prisma.campaignRecipient.groupBy({ by: ['campaignId'], where: { campaignId: { in: ids }, unsubscribedAt: { not: null } }, _count: { _all: true } }),
    prisma.$queryRaw<{ campaignId: string; n: bigint | number }[]>`
      SELECT r.campaignId AS campaignId, COUNT(*) AS n FROM CampaignRecipient r
      JOIN Notification n ON n.id = r.notificationId
      WHERE r.campaignId IN (${Prisma.join(ids)}) AND n.readAt IS NOT NULL
      GROUP BY r.campaignId`,
  ]);
  for (const g of byStatus) {
    const s = out[g.campaignId]!;
    const n = g._count._all;
    s.total += n;
    const key = ({ QUEUED: 'queued', SENDING: 'queued', SENT: 'sent', FAILED: 'failed', BOUNCED: 'bounced', SKIPPED: 'skipped' } as const)[g.status];
    s[key] += n;
    (s.byChannel[g.channel] ??= {})[g.status] = ((s.byChannel[g.channel] ?? {})[g.status] ?? 0) + n;
  }
  for (const g of delivered) out[g.campaignId]!.delivered = g._count._all;
  for (const g of opened) out[g.campaignId]!.opened = g._count._all;
  for (const g of clicked) out[g.campaignId]!.clicked = g._count._all;
  for (const g of unsub) out[g.campaignId]!.unsubscribed = g._count._all;
  for (const g of read) out[g.campaignId]!.inAppRead = Number(g.n);
  return out;
};
