import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: { method: string; url: string; body?: unknown }[] = [];
let serverTours: Record<string, { status: string; step: number }> = {};
let impersonating = false;

vi.mock('@/lib/api', () => ({
  getImpersonation: () => (impersonating ? { id: 'imp' } : null),
  api: {
    get: async (url: string) => {
      calls.push({ method: 'get', url });
      return { data: { tours: serverTours } };
    },
    put: async (url: string, body: unknown) => {
      calls.push({ method: 'put', url, body });
      return { data: { tours: serverTours } };
    },
  },
}));

const tour = await import('./tour');
const { registerTour, loadTourProgress, readSeen, resumeStep, saveTourProgress, shouldAutoStart, startTour, stopTour, writeSeen, resetTourProgressCache } = tour;

registerTour({ id: 't1', route: '/x', steps: [0, 1, 2, 3].map((i) => ({ id: `s${i}`, target: `t${i}`, titleKey: 'a', textKey: 'b' })) });

const puts = () => calls.filter((c) => c.method === 'put');

beforeEach(() => {
  calls.length = 0;
  serverTours = {};
  impersonating = false;
  resetTourProgressCache();
  stopTour();
});

describe('tour progress (server-backed)', () => {
  it('auto-starts until finished; finishing is sent to the server', async () => {
    await loadTourProgress('u1');
    expect(shouldAutoStart('u1', 't1')).toBe(true);
    writeSeen('u1', 't1', 'done', 3);
    expect(readSeen('u1', 't1')).toBe('done');
    expect(shouldAutoStart('u1', 't1')).toBe(false);
    expect(puts().at(-1)).toMatchObject({ url: '/tours/t1', body: { status: 'done', step: 3 } });
  });

  it('a finished tour on the server (other device) does not start; an interrupted one resumes at its step', async () => {
    serverTours = { t1: { status: 'done', step: 3 } };
    await loadTourProgress('u2');
    expect(shouldAutoStart('u2', 't1')).toBe(false);

    resetTourProgressCache();
    serverTours = { t1: { status: 'progress', step: 2 } };
    await loadTourProgress('u3');
    expect(shouldAutoStart('u3', 't1')).toBe(true);
    expect(resumeStep('u3', 't1')).toBe(2);

    resetTourProgressCache();
    serverTours = { t1: { status: 'progress', step: 40 } };
    await loadTourProgress('u4');
    expect(resumeStep('u4', 't1')).toBe(3); // clamped to the last step
  });

  it('progress is saved once per step; a replay of a finished tour does not reopen it, a restart does', async () => {
    await loadTourProgress('u5');
    saveTourProgress('u5', 't1', 1);
    saveTourProgress('u5', 't1', 1);
    expect(puts()).toHaveLength(1);
    writeSeen('u5', 't1', 'done');
    calls.length = 0;
    saveTourProgress('u5', 't1', 0);
    expect(puts()).toHaveLength(0);
    saveTourProgress('u5', 't1', 0, true);
    expect(puts()[0]).toMatchObject({ body: { status: 'progress', step: 0, restart: true } });
  });

  it('never writes or auto-starts while staff view a portal as the client', async () => {
    impersonating = true;
    await loadTourProgress('u6');
    expect(shouldAutoStart('u6', 't1')).toBe(false);
    saveTourProgress('u6', 't1', 2);
    writeSeen('u6', 't1', 'done');
    expect(puts()).toHaveLength(0);
  });

  it('loads once per user; startTour clamps the step', async () => {
    await Promise.all([loadTourProgress('u7'), loadTourProgress('u7')]);
    expect(calls.filter((c) => c.method === 'get')).toHaveLength(1);
    expect(startTour('t1', { step: 99 })).toBe(true);
    expect(tour.isTourActive()).toBe(true);
    expect(startTour('nope')).toBe(false);
  });
});
