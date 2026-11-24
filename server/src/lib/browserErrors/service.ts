import { z } from 'zod';
import type { BrowserErrorGroup } from '@prisma/client';
import { prisma } from '../../db.js';
import { notifyStaff } from '../notifications.js';
import { ERROR_KINDS, fingerprint, isNoise, sanitizeMessage, sanitizeRoute, trimStack } from './sanitize.js';

/**
 * Browser error log: client errors (uncaught errors, unhandled rejections, React render errors, failed chunk loads,
 * API 5xx) grouped by fingerprint with a count and first / last seen. Admin page "Brauzer xətaları", daily digest,
 * 30 days retention (jobs/browserErrors.ts).
 */

export const BROWSER_ERROR_STATUSES = ['NEW', 'RESOLVED', 'IGNORED'] as const;
export type BrowserErrorStatus = (typeof BROWSER_ERROR_STATUSES)[number];
export const RETENTION_DAYS = 30;
const DAY = 86_400_000;

export const clientErrorSchema = z.object({
  kind: z.enum(ERROR_KINDS),
  message: z.string().min(1).max(2000),
  stack: z.string().max(8000).optional(),
  /** Page URL or path (sanitised on the server: no query except the allowlist, no hash, ids replaced). */
  route: z.string().max(2000).optional(),
  release: z.string().max(60).optional(),
  userAgent: z.string().max(500).optional(),
});
export type ClientErrorInput = z.infer<typeof clientErrorSchema>;

export interface RecordContext {
  userId?: string | null;
  role?: string | null;
  serverUserAgent?: string | null;
}

/** Stores one occurrence. Returns false when the report was dropped as noise. */
export const recordClientError = async (input: ClientErrorInput, ctx: RecordContext = {}): Promise<boolean> => {
  const stack = trimStack(input.stack);
  const message = sanitizeMessage(input.message);
  if (!message || isNoise(message, input.stack ?? '')) return false;
  const fp = fingerprint(input.kind, message, stack);
  const now = new Date();
  const data = {
    route: sanitizeRoute(input.route ?? '/'),
    release: (input.release ?? '').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 40) || null,
    role: ctx.role?.slice(0, 20) ?? null,
    userId: ctx.userId ?? null,
    userAgent: (input.userAgent ?? ctx.serverUserAgent ?? '').replace(/[\r\n]/g, ' ').slice(0, 300) || null,
  };
  const create = {
    fingerprint: fp,
    kind: input.kind,
    message,
    topFrame: stack.split('\n').find((l) => /^\s*at\s|@.*:\d+/.test(l))?.slice(0, 300) ?? '',
    sampleStack: stack || null,
    ...data,
    count: 1,
    firstSeenAt: now,
    lastSeenAt: now,
  };
  const attempt = async () => {
    const existing = await prisma.browserErrorGroup.findUnique({ where: { fingerprint: fp }, select: { status: true } });
    if (!existing) {
      await prisma.browserErrorGroup.create({ data: create });
      return;
    }
    await prisma.browserErrorGroup.update({
      where: { fingerprint: fp },
      data: {
        ...data,
        count: { increment: 1 },
        lastSeenAt: now,
        // A resolved error that happens again is a regression: back to NEW (and into the next digest). Ignored stays ignored.
        ...(existing.status === 'RESOLVED' ? { status: 'NEW', statusAt: now, statusById: null, digestedAt: null } : {}),
      },
    });
  };
  try {
    await attempt();
  } catch {
    await attempt(); // two reports of a new error at the same moment: the second finds the first
  }
  return true;
};

export const groupView = (g: BrowserErrorGroup) => ({
  id: g.id,
  kind: g.kind,
  message: g.message,
  topFrame: g.topFrame,
  sampleStack: g.sampleStack,
  route: g.route,
  release: g.release,
  role: g.role,
  userId: g.userId,
  userAgent: g.userAgent,
  count: g.count,
  status: g.status as BrowserErrorStatus,
  firstSeenAt: g.firstSeenAt.toISOString(),
  lastSeenAt: g.lastSeenAt.toISOString(),
});

/** Unresolved (NEW) groups with an occurrence in the last 24 hours: the number on the admin nav badge. */
export const recentNewCount = (now = new Date()) =>
  prisma.browserErrorGroup.count({ where: { status: 'NEW', lastSeenAt: { gte: new Date(now.getTime() - DAY) } } });

/** Deletes groups not seen for RETENTION_DAYS (any status). */
export const purgeOldErrors = async (now = new Date()) =>
  (await prisma.browserErrorGroup.deleteMany({ where: { lastSeenAt: { lt: new Date(now.getTime() - RETENTION_DAYS * DAY) } } })).count;

/** One notification to the admins when error groups appeared that were never announced. Returns the group count. */
export const runErrorDigest = async (now = new Date()): Promise<number> => {
  const fresh = await prisma.browserErrorGroup.findMany({
    where: { status: 'NEW', digestedAt: null, lastSeenAt: { gte: new Date(now.getTime() - DAY) } },
    orderBy: { count: 'desc' },
    take: 50,
    select: { id: true, message: true, count: true },
  });
  if (!fresh.length) return 0;
  const top = fresh
    .slice(0, 3)
    .map((g) => `• ${g.message.slice(0, 80)} (${g.count}×)`)
    .join('\n');
  await notifyStaff(
    `Brauzer xətaları: ${fresh.length} yeni qrup`,
    `Son 24 saatda ${fresh.length} yeni brauzer xətası qrupu qeydə alındı.\n${top}`,
    { link: '/admin/browser-errors', type: 'BROWSER_ERRORS' },
  );
  await prisma.browserErrorGroup.updateMany({ where: { id: { in: fresh.map((g) => g.id) } }, data: { digestedAt: now } });
  return fresh.length;
};
