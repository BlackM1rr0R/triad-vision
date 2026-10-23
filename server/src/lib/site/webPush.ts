import crypto from 'node:crypto';
import { prisma } from '../../db.js';

/**
 * Web Push (RFC 8030) for the installable site (PWA): VAPID authentication (RFC 8292, ES256 JWT) and
 * aes128gcm payload encryption (RFC 8188 / RFC 8291), implemented with node:crypto only — no `web-push`
 * dependency (it would pull in http_ece, asn1.js, jws… for ~150 lines of standard crypto).
 *
 * Keys: VAPID_PUBLIC_KEY (65-byte uncompressed P-256 point, base64url) and VAPID_PRIVATE_KEY (32-byte scalar,
 * base64url), VAPID_SUBJECT (mailto: or https: contact for the push services). Generate a pair with
 *   node -e "const e=require('crypto').createECDH('prime256v1');e.generateKeys();console.log('VAPID_PUBLIC_KEY='+e.getPublicKey('base64url')+'\nVAPID_PRIVATE_KEY='+e.getPrivateKey('base64url'))"
 * Without keys web push is simply off (the browser never gets a public key, so nobody subscribes).
 */

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

const b64u = (buf: Buffer | Uint8Array) => Buffer.from(buf).toString('base64url');
const fromB64u = (s: string) => Buffer.from(s, 'base64url');

let override: VapidKeys | null | undefined;

/** Tests (and nothing else) set keys here; production reads the environment. */
export const setVapidKeys = (keys: VapidKeys | null | undefined) => {
  override = keys;
  privateKeyCache = null;
};

export const vapidKeys = (): VapidKeys | null => {
  if (override !== undefined) return override;
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim() ?? '';
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() ?? '';
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: process.env.VAPID_SUBJECT?.trim() || 'mailto:info@triad-vision.de' };
};

export const generateVapidKeys = () => {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  return { publicKey: ecdh.getPublicKey('base64url'), privateKey: ecdh.getPrivateKey('base64url') };
};

let privateKeyCache: { raw: string; key: crypto.KeyObject } | null = null;

const signingKey = (keys: VapidKeys) => {
  if (privateKeyCache?.raw === keys.privateKey) return privateKeyCache.key;
  const pub = fromB64u(keys.publicKey);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('VAPID_PUBLIC_KEY must be an uncompressed P-256 point (65 bytes, base64url)');
  const key = crypto.createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', d: keys.privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) },
    format: 'jwk',
  });
  privateKeyCache = { raw: keys.privateKey, key };
  return key;
};

/** `Authorization: vapid t=<JWT>, k=<public key>` for one push service origin (valid 12 h). */
export const vapidAuthorization = (endpoint: string, keys: VapidKeys, now = Date.now()) => {
  const aud = new URL(endpoint).origin;
  const header = b64u(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u(Buffer.from(JSON.stringify({ aud, exp: Math.floor(now / 1000) + 12 * 3600, sub: keys.subject })));
  const input = `${header}.${claims}`;
  const sig = crypto.sign('sha256', Buffer.from(input), { key: signingKey(keys), dsaEncoding: 'ieee-p1363' });
  return `vapid t=${input}.${b64u(sig)}, k=${keys.publicKey}`;
};

/** Record size announced in the aes128gcm header (one record: payloads are far below it). */
const RECORD_SIZE = 4096;

/**
 * Encrypts one push message for a subscription (RFC 8291): ephemeral ECDH with the browser's p256dh key,
 * the auth secret as HKDF salt, a fresh 16-byte salt per message, one aes128gcm record.
 */
export const encryptPayload = (
  payload: Buffer,
  sub: { p256dh: string; auth: string },
  opts: { salt?: Buffer; ecdh?: crypto.ECDH } = {},
) => {
  const uaPublic = fromB64u(sub.p256dh);
  const authSecret = fromB64u(sub.auth);
  if (uaPublic.length !== 65 || authSecret.length < 16) throw new Error('INVALID_SUBSCRIPTION_KEYS');
  const ecdh = opts.ecdh ?? crypto.createECDH('prime256v1');
  if (!opts.ecdh) ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);
  const salt = opts.salt ?? crypto.randomBytes(16);

  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', shared, authSecret, keyInfo, 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));

  if (payload.length + 1 + 16 > RECORD_SIZE) throw new Error('PAYLOAD_TOO_LARGE');
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  // 0x02 = padding delimiter of the last (only) record.
  const body = Buffer.concat([cipher.update(Buffer.concat([payload, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);

  const header = Buffer.alloc(16 + 4 + 1);
  salt.copy(header, 0);
  header.writeUInt32BE(RECORD_SIZE, 16);
  header.writeUInt8(asPublic.length, 20);
  return Buffer.concat([header, asPublic, body]);
};

// ─── Transport (replaceable in tests) ─────────────────────────────────

export interface PushRequest {
  endpoint: string;
  headers: Record<string, string>;
  body: Buffer;
}
export type PushTransport = (req: PushRequest) => Promise<{ status: number }>;

const fetchTransport: PushTransport = async (req) => {
  const res = await fetch(req.endpoint, { method: 'POST', headers: req.headers, body: new Uint8Array(req.body), signal: AbortSignal.timeout(10_000) });
  return { status: res.status };
};

let transport: PushTransport | null = null;
/** Tests install a fake push service; null restores the real one (which never runs under NODE_ENV=test). */
export const setPushTransport = (t: PushTransport | null) => {
  transport = t;
};

export interface WebPushMessage {
  title: string;
  body: string;
  link?: string;
  tag?: string;
}

/** Only https endpoints of the known browser push services (no requests to arbitrary hosts from the API). */
const PUSH_HOSTS = [
  /(^|\.)fcm\.googleapis\.com$/,
  /(^|\.)android\.googleapis\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)notify\.windows\.com$/,
  /(^|\.)push\.apple\.com$/,
];
export const isAllowedEndpoint = (endpoint: string) => {
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && PUSH_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
};

/**
 * Sends a notification to every browser subscription of the given users. Never throws. Subscriptions the
 * push service reports as gone (404 / 410) are deleted.
 */
export const sendWebPush = async (userIds: string[], msg: WebPushMessage) => {
  const keys = vapidKeys();
  const send = transport ?? (process.env.NODE_ENV === 'test' ? null : fetchTransport);
  if (!keys || !send || userIds.length === 0) return { sent: 0, removed: 0 };
  let sent = 0;
  let removed = 0;
  try {
    const subs = await prisma.webPushSubscription.findMany({ where: { userId: { in: userIds } } });
    const payload = Buffer.from(
      JSON.stringify({ title: msg.title.slice(0, 120), body: msg.body.slice(0, 240), link: msg.link || '/', tag: msg.tag }),
    );
    for (const sub of subs) {
      try {
        const res = await send({
          endpoint: sub.endpoint,
          headers: {
            Authorization: vapidAuthorization(sub.endpoint, keys),
            'Content-Encoding': 'aes128gcm',
            'Content-Type': 'application/octet-stream',
            TTL: String(24 * 3600),
            Urgency: 'normal',
          },
          body: encryptPayload(payload, sub),
        });
        if (res.status === 404 || res.status === 410) {
          await prisma.webPushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
          removed++;
        } else if (res.status >= 200 && res.status < 300) {
          sent++;
        } else {
          await prisma.webPushSubscription
            .update({ where: { id: sub.id }, data: { lastError: `HTTP ${res.status}` } })
            .catch(() => undefined);
        }
      } catch (err) {
        console.error('[web-push] send failed', (err as Error).message);
      }
    }
  } catch (err) {
    console.error('[web-push] failed', err);
  }
  return { sent, removed };
};

export const endpointHash = (endpoint: string) => crypto.createHash('sha256').update(endpoint).digest('hex');
