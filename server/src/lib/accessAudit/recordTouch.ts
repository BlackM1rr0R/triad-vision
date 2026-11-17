import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../../db.js';

/**
 * Record-access counter for the anomaly rule "a staff member opened many different clients / cases in one hour".
 * Only the detail pages are counted (GET /api/admin/cases/:id, /api/admin/clients/:id[/…] first segment), kept in
 * memory and flushed in one createMany per minute (duplicates of the same user × record × hour are skipped by the
 * primary key). Lightweight: no write on the request path. Rows older than 14 days are pruned by the anomaly job.
 */

const DETAIL_RE = /^\/admin\/(cases|clients)\/([A-Za-z0-9_-]{6,64})(?:\/|$)/;
const HOUR = 60 * 60 * 1000;
const FLUSH_MS = 60 * 1000;
const MAX_BUFFER = 20_000;

const buffer = new Map<string, { userId: string; record: string; hour: Date }>();
let timer: NodeJS.Timeout | null = null;

export const hourOf = (d: Date) => new Date(Math.floor(d.getTime() / HOUR) * HOUR);

/** Pure: the record a request opens ("case:<id>" / "client:<id>"), or null. */
export const recordOfPath = (method: string, path: string): string | null => {
  if (method !== 'GET') return null;
  const m = DETAIL_RE.exec(path);
  if (!m) return null;
  if (m[1] === 'cases' && ['board', 'export', 'stats', 'count', 'search', 'new'].includes(m[2])) return null;
  return `${m[1] === 'cases' ? 'case' : 'client'}:${m[2]}`;
};

export const flushRecordTouches = async () => {
  if (!buffer.size) return;
  const rows = [...buffer.values()];
  buffer.clear();
  await prisma.staffRecordAccess.createMany({ data: rows, skipDuplicates: true }).catch(() => undefined);
};

const schedule = () => {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    void flushRecordTouches();
  }, FLUSH_MS);
  timer.unref?.();
};

/** Mounted on /api after the staff access guard; STAFF / ADMIN only (SUPER_ADMIN is never restricted or reviewed here). */
export const recordTouchMiddleware = (req: Request, _res: Response, next: NextFunction) => {
  const u = req.user;
  if (u && (u.role === 'STAFF' || u.role === 'ADMIN') && !req.impersonator) {
    const record = recordOfPath(req.method, req.path);
    if (record && buffer.size < MAX_BUFFER) {
      const hour = hourOf(new Date());
      buffer.set(`${u.id}|${record}|${hour.getTime()}`, { userId: u.id, record, hour });
      schedule();
    }
  }
  next();
};
