import { Router } from 'express';
import { z } from 'zod';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { requireMinRole } from '../../middleware/auth.js';
import { notFound, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { buildTvPayload } from '../../lib/tvDisplay/data.js';
import { publishTv } from '../../lib/tvDisplay/events.js';
import { saveTvSettings, getTvSettings, tvSettingsSchema, TV_PANELS } from '../../lib/tvDisplay/settings.js';
import { createTvToken, publicTvToken, revokeTvToken } from '../../lib/tvDisplay/tokens.js';
import { tvStream } from '../tv.js';

/**
 * Office TV mode, staff side — /api/admin/tv-display (STAFF+ via the admin router).
 *
 *   GET    /data                the TV payload for a signed-in staff member (open /admin/tv on an office PC)
 *   GET    /stream              the TV event stream for a signed-in staff member
 *   GET    /                    ADMIN+: settings + display tokens (last seen, revoked)
 *   PUT    /settings            ADMIN+: panels, rotation interval, celebration on/off, sound on/off
 *   POST   /tokens { name }     ADMIN+: new display token → shown ONCE with the TV URL (QR in the UI)
 *   DELETE /tokens/:id          ADMIN+: revoke (the row stays for the record; open TV streams are cut)
 */
export const adminTvDisplayRouter = Router();

adminTvDisplayRouter.get('/data', async (_req, res) => {
  res.json(await buildTvPayload());
});

adminTvDisplayRouter.get('/stream', (req, res) => {
  tvStream(req, res);
});

const admin = requireMinRole('ADMIN');

/** The TV opens this URL; the token sits in the fragment, which browsers never send to a server or a log. */
const tvUrl = (token: string) => `${config.clientUrl.replace(/\/$/, '')}/admin/tv#token=${token}`;

adminTvDisplayRouter.get('/', admin, async (_req, res) => {
  const [settings, tokens] = await Promise.all([getTvSettings(), prisma.tvDisplayToken.findMany({ orderBy: [{ revokedAt: 'asc' }, { createdAt: 'desc' }], take: 100 })]);
  res.json({ settings, panels: TV_PANELS, tokens: tokens.map(publicTvToken) });
});

adminTvDisplayRouter.put('/settings', admin, async (req, res) => {
  const body = parse(tvSettingsSchema.partial(), req.body);
  const settings = await saveTvSettings(body);
  await audit(req, 'TV_DISPLAY_SETTINGS_UPDATED', undefined, settings);
  publishTv('tv.refresh');
  res.json({ settings });
});

adminTvDisplayRouter.post('/tokens', admin, async (req, res) => {
  const { name } = parse(z.object({ name: z.string().trim().min(1).max(80) }), req.body);
  const { token, row } = await createTvToken(name, req.user!.id);
  await audit(req, 'TV_DISPLAY_TOKEN_CREATED', `tv-token:${row.id}`, { name });
  res.status(201).json({ token, url: tvUrl(token), display: publicTvToken(row) });
});

adminTvDisplayRouter.delete('/tokens/:id', admin, async (req, res) => {
  const id = String(req.params.id ?? '').slice(0, 60);
  const row = await prisma.tvDisplayToken.findUnique({ where: { id } });
  if (!row) throw notFound('TV_TOKEN_NOT_FOUND');
  const revoked = await revokeTvToken(id, req.user!.id);
  if (revoked) await audit(req, 'TV_DISPLAY_TOKEN_REVOKED', `tv-token:${id}`, { name: row.name });
  res.json({ ok: true, display: publicTvToken((await prisma.tvDisplayToken.findUnique({ where: { id } }))!) });
});
