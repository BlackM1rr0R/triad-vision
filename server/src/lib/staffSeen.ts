import { prisma } from '../db.js';

/**
 * Per-staff "last opened" marks behind the sidebar badges "İstifadəçilər" (new registrations) and "Müraciətlər"
 * (new cases). Stored on StaffPreferences; written only by explicit POSTs from the pages (never by a GET).
 */
export type SeenKind = 'users' | 'cases';

/** Without a mark yet (never opened) only the last week counts as "new", so the badge does not show the whole history. */
export const SEEN_FALLBACK_MS = 7 * 24 * 60 * 60 * 1000;

export const seenSince = (seenAt: Date | null | undefined, now: Date = new Date()): Date => seenAt ?? new Date(now.getTime() - SEEN_FALLBACK_MS);

export const readSeenSince = async (userId: string, kind: SeenKind): Promise<Date> => {
  const row = await prisma.staffPreferences.findUnique({ where: { userId }, select: { usersSeenAt: true, casesSeenAt: true } });
  return seenSince(kind === 'users' ? row?.usersSeenAt : row?.casesSeenAt);
};

export const markSeen = async (userId: string, kind: SeenKind, now: Date = new Date()): Promise<void> => {
  const data = kind === 'users' ? { usersSeenAt: now } : { casesSeenAt: now };
  await prisma.staffPreferences.upsert({ where: { userId }, create: { userId, ...data }, update: data });
};
