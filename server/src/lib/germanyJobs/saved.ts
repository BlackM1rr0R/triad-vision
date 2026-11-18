import type { SavedGermanyJob } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { arbeitnowHas } from './arbeitnow.js';
import { isImpersonating } from '../privacy/impersonationContext.js';
import { PROVIDER_IDS, httpUrl } from './common.js';

/**
 * Saved ("heart") listings of the German job search for signed-in clients (model SavedGermanyJob). Visitors keep
 * the same snapshot in their browser only (client components/germanyJobs/savedJobs.ts); it is merged into the
 * account on sign-in (POST /api/germany-jobs/saved/sync).
 *
 * Only what the list needs is stored — title, company, place, source, link, job type, posting date — never the
 * description: the ad itself stays at its source and is opened through its own URL (provider terms).
 *
 * "No longer available": Arbeitnow listings are checked against the cached hourly feed (gone = left the feed);
 * the other sources have no cheap check (no extra API calls for this), so a listing is treated as expired once it
 * is older than STALE_DAYS (posting date, else the day it was saved).
 */

export const MAX_SAVED = 100;
export const STALE_DAYS = 60;
const DAY = 24 * 60 * 60 * 1000;

export const savedSnapshotSchema = z.object({
  id: z.string().trim().min(3).max(160).regex(/^[a-z]+:[^\s]+$/),
  source: z.enum(PROVIDER_IDS),
  title: z.string().trim().min(1).max(300),
  company: z.string().trim().max(200).nullable().optional(),
  location: z.string().trim().max(200).nullable().optional(),
  url: z
    .string()
    .trim()
    .max(1000)
    .refine((u) => !!httpUrl(u), 'URL'),
  type: z.enum(['job', 'ausbildung']).optional().default('job'),
  created: z.string().datetime({ offset: true }).nullable().optional().catch(null),
});
export type SavedSnapshot = z.infer<typeof savedSnapshotSchema>;

const rowData = (s: SavedSnapshot) => ({
  listingId: s.id,
  source: s.source,
  title: s.title,
  company: s.company || null,
  location: s.location || null,
  url: s.url,
  jobType: s.type,
  postedAt: s.created ? new Date(s.created) : null,
});

export type SavedStatus = 'available' | 'gone' | 'unknown';

export const savedView = (r: SavedGermanyJob, status: SavedStatus) => ({
  id: r.listingId,
  source: r.source,
  title: r.title,
  company: r.company,
  location: r.location,
  url: r.url,
  type: r.jobType,
  created: r.postedAt?.toISOString() ?? null,
  savedAt: r.createdAt.toISOString(),
  status,
});

/** Saves one listing (idempotent); false when the list is full. */
export const saveJob = async (userId: string, s: SavedSnapshot) => {
  const existing = await prisma.savedGermanyJob.findUnique({ where: { userId_listingId: { userId, listingId: s.id } } });
  if (existing) return { ok: true as const, row: existing };
  if ((await prisma.savedGermanyJob.count({ where: { userId } })) >= MAX_SAVED) return { ok: false as const, code: 'TOO_MANY_SAVED' };
  const row = await prisma.savedGermanyJob.create({ data: { userId, ...rowData(s) } });
  return { ok: true as const, row };
};

/** Merges the browser's list into the account (up to MAX_SAVED); returns how many were added. */
export const syncSaved = async (userId: string, items: SavedSnapshot[]) => {
  const have = new Set((await prisma.savedGermanyJob.findMany({ where: { userId }, select: { listingId: true } })).map((r) => r.listingId));
  const room = Math.max(0, MAX_SAVED - have.size);
  const fresh = items.filter((s, i) => !have.has(s.id) && items.findIndex((x) => x.id === s.id) === i).slice(0, room);
  if (fresh.length) await prisma.savedGermanyJob.createMany({ data: fresh.map((s) => ({ userId, ...rowData(s) })), skipDuplicates: true });
  return fresh.length;
};

/** The client's saved listings, newest first, with their availability (goneAt kept up to date). */
export const listSaved = async (userId: string, now = new Date()) => {
  const rows = await prisma.savedGermanyJob.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: MAX_SAVED });
  const feed = await arbeitnowHas(rows.filter((r) => r.source === 'arbeitnow').map((r) => r.listingId));
  const goneIds: string[] = [];
  const backIds: string[] = [];
  const items = rows.map((r) => {
    let status: SavedStatus;
    if (r.source === 'arbeitnow') {
      const present = feed?.get(r.listingId);
      status = present === undefined ? (r.goneAt ? 'gone' : 'unknown') : present ? 'available' : 'gone';
      if (present === false && !r.goneAt) goneIds.push(r.id);
      if (present === true && r.goneAt) backIds.push(r.id);
    } else {
      const age = now.getTime() - (r.postedAt ?? r.createdAt).getTime();
      status = r.goneAt || age > STALE_DAYS * DAY ? 'gone' : 'unknown';
      if (status === 'gone' && !r.goneAt) goneIds.push(r.id);
    }
    return savedView(r, status);
  });
  if (isImpersonating()) return items; // "view as client": the same statuses, not stored
  if (goneIds.length) await prisma.savedGermanyJob.updateMany({ where: { id: { in: goneIds } }, data: { goneAt: now } });
  if (backIds.length) await prisma.savedGermanyJob.updateMany({ where: { id: { in: backIds } }, data: { goneAt: null } });
  return items;
};

/** Art. 15 export of a client's saved listings. */
export const exportSavedJobs = async (userId: string) =>
  (await prisma.savedGermanyJob.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } })).map((r) => ({
    listingId: r.listingId,
    source: r.source,
    title: r.title,
    company: r.company,
    location: r.location,
    url: r.url,
    type: r.jobType,
    savedAt: r.createdAt,
    noLongerAvailableSince: r.goneAt,
  }));
