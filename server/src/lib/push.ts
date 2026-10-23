import { config } from '../config.js';
import { prisma } from '../db.js';
import { isImpersonating } from './privacy/impersonationContext.js';
import { sendWebPush } from './site/webPush.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_TOKEN = /^Expo(nent)?PushToken\[.+\]$/;

export const isExpoPushToken = (token: string) => EXPO_TOKEN.test(token);

interface ExpoTicket {
  status: 'ok' | 'error';
  details?: { error?: string };
}

/**
 * Sends a push notification to every phone of the given users via Expo's push service.
 * Never throws: push is a convenience on top of in-app + email notifications.
 */
export const sendPush = async (userIds: string[], msg: { title: string; body: string; data?: Record<string, string> }) => {
  if (userIds.length === 0) return;
  if (isImpersonating()) return; // "view as client" never pushes
  // Browsers (installed site / PWA): Web Push next to the phones' Expo push (lib/site/webPush.ts; fake transport in tests).
  void sendWebPush(userIds, { title: msg.title, body: msg.body, link: msg.data?.link || undefined, tag: msg.data?.type || undefined });
  if (config.isTest) return;
  try {
    const devices = await prisma.pushDevice.findMany({ where: { userId: { in: userIds } } });
    if (!devices.length) return;

    for (let i = 0; i < devices.length; i += 100) {
      const batch = devices.slice(i, i + 100);
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(
          batch.map((d) => ({ to: d.token, title: msg.title, body: msg.body.slice(0, 180), data: msg.data, sound: 'default', priority: 'high', channelId: 'default' })),
        ),
      });
      if (!res.ok) {
        console.error('[push] expo responded', res.status);
        continue;
      }
      const { data } = (await res.json()) as { data: ExpoTicket[] };
      // Forget phones where the app was uninstalled or notifications were revoked.
      const dead = batch.filter((_, j) => data[j]?.details?.error === 'DeviceNotRegistered').map((d) => d.token);
      if (dead.length) await prisma.pushDevice.deleteMany({ where: { token: { in: dead } } });
    }
  } catch (err) {
    console.error('[push] failed', err);
  }
};
