import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import type { NextFunction, Request, Response } from 'express';
import { requireMinRole } from '../middleware/auth.js';
import { limiter, notFound, parse } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { clientCalendarName, clientFeedEvents } from '../lib/calendar/clientFeed.js';
import { buildCalendar, calendarFeedUrl, calendarName, newCalendarToken, staffFeedEvents } from '../lib/ops/calendar.js';

/**
 * Personal calendar feed — mounted at /api/calendar.
 *   GET    /:token.ics   the feed (no session; the token is the credential)
 *   GET    /token        whether the signed-in user (staff or client) has a feed, and its URL
 *   POST   /token        create or rotate the token (the old URL stops working)
 *   DELETE /token        switch the feed off
 */
export const calendarRouter = Router();

const feedLimiter = limiter({ windowMs: 60 * 1000, limit: 60, skip: () => config.isTest });
const tokenParam = z.string().regex(/^[A-Za-z0-9_-]{20,80}$/);

/** Staff (with the usual 2FA gate) and clients manage their own feed; employers and agents have none. */
const feedOwner = (req: Request, res: Response, next: NextFunction) => {
  if (req.user?.role === 'CLIENT') return next();
  return requireMinRole('STAFF')(req, res, next);
};

calendarRouter.get('/token', feedOwner, async (req, res) => {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { calendarToken: true } });
  res.json({ enabled: !!u.calendarToken, url: u.calendarToken ? calendarFeedUrl(u.calendarToken) : null });
});

calendarRouter.post('/token', feedOwner, async (req, res) => {
  const token = newCalendarToken();
  const before = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { calendarToken: true } });
  await prisma.user.update({ where: { id: req.user!.id }, data: { calendarToken: token } });
  await audit(req, before.calendarToken ? 'CALENDAR_TOKEN_ROTATED' : 'CALENDAR_TOKEN_CREATED', `user:${req.user!.id}`);
  res.status(201).json({ enabled: true, url: calendarFeedUrl(token), token });
});

calendarRouter.delete('/token', feedOwner, async (req, res) => {
  await prisma.user.update({ where: { id: req.user!.id }, data: { calendarToken: null } });
  await audit(req, 'CALENDAR_TOKEN_REMOVED', `user:${req.user!.id}`);
  res.json({ enabled: false, url: null });
});

// Calendar clients send no cookies and no Origin; the token alone grants read access to this one feed.
calendarRouter.get('/:token', feedLimiter, async (req, res) => {
  const raw = String(req.params.token).replace(/\.ics$/i, '');
  const token = parse(tokenParam, raw);
  const user = await prisma.user.findUnique({ where: { calendarToken: token }, select: { id: true, locale: true, firstName: true, lastName: true, isActive: true, role: true } });
  if (!user || !user.isActive || user.role === 'COMPANY' || user.role === 'AGENT') throw notFound('FEED_NOT_FOUND');
  const body =
    user.role === 'CLIENT'
      ? buildCalendar(`${clientCalendarName(user.locale)} · ${user.firstName}`, await clientFeedEvents(user))
      : buildCalendar(`${calendarName(user.locale)} · ${user.firstName}`, await staffFeedEvents(user));
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline; filename="triad-vision.ics"');
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.send(body);
});
