import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db.js';

/**
 * Guided-tour progress per user (client tours: components/onboarding), stored in one Setting row so it follows the
 * user across browsers and devices without a schema change:
 *
 *   tours:<userId>   { [tourId]: { status: 'progress' | 'done' | 'never', step: number, at: ISO date } }
 *
 *   progress  started (or skipped for now): the next first-login start resumes at `step`
 *   done      finished: never starts on its own again (the help menu can restart it)
 *   never     "don't show again": same as done for the auto-start
 *
 * The key contains ":" so the generic settings route can never write it; the settings listing leaves the prefix
 * out (lib/staffUi STAFF_UI_PREFIXES).
 */

export const TOURS_PREFIX = 'tours:';
export const toursKey = (userId: string) => `${TOURS_PREFIX}${userId}`;

export const TOUR_ID = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/);
export const TOURS_MAX = 40;
export const STEP_MAX = 50;

export type TourStatus = 'progress' | 'done' | 'never';
export interface TourEntry {
  status: TourStatus;
  step: number;
  at: string;
}
export type ToursDoc = Record<string, TourEntry>;

export const tourUpdateSchema = z.object({
  /** `reset` forgets the tour (it starts on its own again after the next login). */
  status: z.enum(['progress', 'done', 'never', 'reset']),
  step: z.number().int().min(0).max(STEP_MAX).optional(),
  /** Started again from the help menu: reopens a finished / dismissed tour. */
  restart: z.boolean().optional(),
});
export type TourUpdate = z.infer<typeof tourUpdateSchema>;

const entrySchema = z.object({
  status: z.enum(['progress', 'done', 'never']),
  step: z.number().int().min(0).max(STEP_MAX).catch(0),
  at: z.string().max(40).catch(''),
});

/** Drops anything malformed (the row is JSON written by older code or by hand). */
export const cleanToursDoc = (raw: unknown): ToursDoc => {
  const out: ToursDoc = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (Object.keys(out).length >= TOURS_MAX) break;
    if (!TOUR_ID.safeParse(id).success) continue;
    const r = entrySchema.safeParse(v);
    if (r.success) out[id] = r.data;
  }
  return out;
};

export class TooManyToursError extends Error {
  constructor() {
    super('TOO_MANY_TOURS');
  }
}

/**
 * Applies one update. A finished / dismissed tour is not reopened by a stray "progress" (an old tab still running
 * the tour): only an explicit restart from the help menu (`restart: true`) does that.
 */
export const applyTourUpdate = (doc: ToursDoc, tourId: string, update: TourUpdate, now = new Date()): ToursDoc => {
  const next = { ...doc };
  if (update.status === 'reset') {
    delete next[tourId];
    return next;
  }
  const prev = next[tourId];
  if (!prev && Object.keys(next).length >= TOURS_MAX) throw new TooManyToursError();
  if (update.status === 'progress' && prev && prev.status !== 'progress' && !update.restart) return next;
  next[tourId] = { status: update.status, step: update.step ?? prev?.step ?? 0, at: now.toISOString() };
  return next;
};

export const readTours = async (userId: string): Promise<ToursDoc> =>
  cleanToursDoc((await prisma.setting.findUnique({ where: { key: toursKey(userId) } }))?.value);

/** Read-modify-write under a row lock (two tabs finishing the same tour at once keep both writes consistent). */
export const updateTours = async (userId: string, fn: (doc: ToursDoc) => ToursDoc): Promise<ToursDoc> => {
  const key = toursKey(userId);
  await prisma.$executeRaw`INSERT IGNORE INTO \`Setting\` (\`key\`, \`value\`) VALUES (${key}, JSON_OBJECT())`;
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT \`key\` FROM \`Setting\` WHERE \`key\` = ${key} FOR UPDATE`;
    const doc = fn(cleanToursDoc((await tx.setting.findUnique({ where: { key } }))?.value));
    await tx.setting.update({ where: { key }, data: { value: doc as unknown as Prisma.InputJsonValue } });
    return doc;
  });
};
