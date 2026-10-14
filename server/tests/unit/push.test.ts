import { afterEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ prisma: { pushDevice: { findMany: vi.fn(), deleteMany: vi.fn() } } }));
vi.mock('../../src/db.js', () => ({ prisma: m.prisma }));

const { isExpoPushToken, sendPush } = await import('../../src/lib/push.js');
const { decodeOriginalName } = await import('../../src/middleware/upload.js');

afterEach(() => vi.restoreAllMocks());

describe('isExpoPushToken', () => {
  it.each(['ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]', 'ExpoPushToken[abc-123_DEF]', 'ExponentPushToken[a]'])(
    'accepts %s',
    (t) => expect(isExpoPushToken(t)).toBe(true),
  );

  it.each([
    '',
    'ExponentPushToken[]',
    'ExponentPushToken',
    'exponentpushtoken[abc]',
    'ExpoPushToken[abc] ',
    ' ExpoPushToken[abc]',
    'FCMToken[abc]',
    'abc',
    'ExpoPushToken(abc)',
  ])('rejects %j', (t) => expect(isExpoPushToken(t)).toBe(false));
});

describe('sendPush', () => {
  it('never calls Expo in the test environment', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await sendPush(['u1'], { title: 't', body: 'b' });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(m.prisma.pushDevice.findMany).not.toHaveBeenCalled();
  });
});

describe('decodeOriginalName', () => {
  it('restores UTF-8 names that multer decoded as latin1', () => {
    for (const name of ['pasport şəkli.pdf', 'Паспорт.pdf', 'Zeugnis-Müller.pdf', 'plain.pdf']) {
      expect(decodeOriginalName(Buffer.from(name, 'utf8').toString('latin1'))).toBe(name);
    }
  });
});
