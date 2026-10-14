import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Exercises the real sending path, which is disabled when NODE_ENV=test.
const m = vi.hoisted(() => ({ prisma: { pushDevice: { findMany: vi.fn(), deleteMany: vi.fn() } } }));
vi.mock('../../src/db.js', () => ({ prisma: m.prisma }));
vi.mock('../../src/config.js', async (importOriginal) => {
  const { config } = await importOriginal<typeof import('../../src/config.js')>();
  return { config: { ...config, isTest: false } };
});

const { sendPush } = await import('../../src/lib/push.js');

const devices = (n: number) => Array.from({ length: n }, (_, i) => ({ token: `ExponentPushToken[${i}]`, userId: 'u1' }));
const okResponse = (data: unknown[]) => new Response(JSON.stringify({ data }), { status: 200 });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('sendPush (production path)', () => {
  it('does nothing without users or devices', async () => {
    await sendPush([], { title: 't', body: 'b' });
    expect(m.prisma.pushDevice.findMany).not.toHaveBeenCalled();
    m.prisma.pushDevice.findMany.mockResolvedValue([]);
    await sendPush(['u1'], { title: 't', body: 'b' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends batches of 100 to Expo with a truncated body', async () => {
    m.prisma.pushDevice.findMany.mockResolvedValue(devices(150));
    fetchMock.mockImplementation(async (_url: string, init: { body: string }) => okResponse(JSON.parse(init.body).map(() => ({ status: 'ok' }))));
    await sendPush(['u1'], { title: 'Hello', body: 'x'.repeat(500), data: { caseId: 'c1' } });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://exp.host/--/api/v2/push/send');
    const first = JSON.parse(init.body);
    expect(first).toHaveLength(100);
    expect(first[0]).toEqual({ to: 'ExponentPushToken[0]', title: 'Hello', body: 'x'.repeat(180), data: { caseId: 'c1' }, sound: 'default', priority: 'high', channelId: 'default' });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toHaveLength(50);
    expect(m.prisma.pushDevice.deleteMany).not.toHaveBeenCalled();
  });

  it('forgets devices Expo reports as DeviceNotRegistered', async () => {
    m.prisma.pushDevice.findMany.mockResolvedValue(devices(3));
    fetchMock.mockResolvedValue(okResponse([{ status: 'ok' }, { status: 'error', details: { error: 'DeviceNotRegistered' } }, { status: 'error', details: { error: 'MessageTooBig' } }]));
    await sendPush(['u1'], { title: 't', body: 'b' });
    expect(m.prisma.pushDevice.deleteMany).toHaveBeenCalledWith({ where: { token: { in: ['ExponentPushToken[1]'] } } });
  });

  it('skips a failed batch and never throws', async () => {
    m.prisma.pushDevice.findMany.mockResolvedValue(devices(1));
    fetchMock.mockResolvedValue(new Response('nope', { status: 500 }));
    await expect(sendPush(['u1'], { title: 't', body: 'b' })).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith('[push] expo responded', 500);

    fetchMock.mockRejectedValue(new Error('network down'));
    await expect(sendPush(['u1'], { title: 't', body: 'b' })).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith('[push] failed', expect.any(Error));
  });
});
