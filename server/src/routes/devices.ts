import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { parse } from '../lib/http.js';
import { isExpoPushToken } from '../lib/push.js';

export const devicesRouter = Router();
devicesRouter.use(requireAuth);

/** Registers (or re-assigns) the phone's Expo push token to the logged-in user. */
devicesRouter.post('/', async (req, res) => {
  const body = parse(
    z.object({ token: z.string().max(200).refine(isExpoPushToken, 'INVALID_PUSH_TOKEN'), platform: z.enum(['ios', 'android']) }),
    req.body,
  );
  const device = await prisma.pushDevice.upsert({
    where: { token: body.token },
    create: { token: body.token, platform: body.platform, userId: req.user!.id },
    update: { userId: req.user!.id, platform: body.platform, lastSeenAt: new Date() },
  });
  res.status(201).json({ device: { id: device.id, platform: device.platform } });
});

/** Called on logout so the phone stops receiving this user's notifications. */
devicesRouter.delete('/', async (req, res) => {
  const { token } = parse(z.object({ token: z.string().max(200) }), req.body);
  await prisma.pushDevice.deleteMany({ where: { token, userId: req.user!.id } });
  res.json({ ok: true });
});
