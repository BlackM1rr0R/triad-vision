import crypto from 'node:crypto';
import { prisma } from '../../db.js';
import { publish, subscribe, type RealtimeEvent } from '../messaging/realtime.js';
import { approvedCaseSelect, approvedEntry } from './data.js';

/**
 * Realtime for the office TV: events go over the existing in-process realtime bus (lib/messaging/realtime.ts) on
 * a reserved channel that no user id can collide with (ids are cuids). The TV streams (/api/tv/stream with a
 * display token, /api/admin/tv-display/stream with a staff session) subscribe to it.
 *
 *   tv.approved  { key, client, profession, city, at }   a case became APPROVED → full-screen celebration
 *   tv.refresh   {}                                      data changed (settings saved) → reload the payload
 */
export const TV_CHANNEL = '__tv_display__';

export const subscribeTv = (handler: (ev: RealtimeEvent) => void) => subscribe(TV_CHANNEL, handler);

export const publishTv = (type: 'tv.approved' | 'tv.refresh', payload: Record<string, unknown> = {}) => publish(TV_CHANNEL, type, payload);

/** Called by lib/caseFlow.ts after a case moved to APPROVED (fire-and-forget; never throws). */
export const onCaseApproved = async (caseId: string) => {
  try {
    const c = await prisma.case.findUnique({ where: { id: caseId }, select: { ...approvedCaseSelect, status: true } });
    if (!c || c.status !== 'APPROVED') return;
    const entry = approvedEntry(c);
    publishTv('tv.approved', { key: crypto.randomBytes(6).toString('hex'), ...entry, at: (entry.at ?? new Date()).toISOString() });
  } catch {
    /* the TV is a nice-to-have: a failure here must never affect the decision */
  }
};
