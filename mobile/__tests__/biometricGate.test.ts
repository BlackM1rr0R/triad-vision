import { LOCK_AFTER_MS, gateEventForAppState, initialGate, reduceGate, shouldLockOnForeground, type GateState } from '@/lib/biometricGate';

const run = (state: GateState, ...events: Parameters<typeof reduceGate>[1][]) => events.reduce((s, e) => reduceGate(s, e), state);

describe('biometric gate', () => {
  it('starts locked on a cold start only when the feature is on', () => {
    expect(reduceGate(initialGate, { type: 'boot', enabled: true })).toEqual({ enabled: true, locked: true, backgroundedAt: null });
    expect(reduceGate(initialGate, { type: 'boot', enabled: false })).toEqual({ enabled: false, locked: false, backgroundedAt: null });
  });

  it('unlocks after a successful authentication', () => {
    const locked = reduceGate(initialGate, { type: 'boot', enabled: true });
    expect(reduceGate(locked, { type: 'unlock' }).locked).toBe(false);
  });

  it('locks when the app returns after more than 2 minutes in the background', () => {
    const s = run(initialGate, { type: 'boot', enabled: true }, { type: 'unlock' });
    const t0 = 1_000_000;
    const back = run(s, { type: 'background', at: t0 }, { type: 'foreground', at: t0 + LOCK_AFTER_MS + 1 });
    expect(back.locked).toBe(true);
    expect(back.backgroundedAt).toBeNull();
  });

  it('does not lock after a short trip to the background', () => {
    const s = run(initialGate, { type: 'boot', enabled: true }, { type: 'unlock' });
    const t0 = 1_000_000;
    expect(run(s, { type: 'background', at: t0 }, { type: 'foreground', at: t0 + 30_000 }).locked).toBe(false);
  });

  it('counts from the first background moment, not from a later inactive → background transition', () => {
    const s = run(initialGate, { type: 'boot', enabled: true }, { type: 'unlock' });
    const t0 = 1_000_000;
    const twice = run(s, { type: 'background', at: t0 }, { type: 'background', at: t0 + LOCK_AFTER_MS });
    expect(twice.backgroundedAt).toBe(t0);
    expect(reduceGate(twice, { type: 'foreground', at: t0 + LOCK_AFTER_MS + 10 }).locked).toBe(true);
  });

  it('never locks while the feature is off', () => {
    const s = reduceGate(initialGate, { type: 'boot', enabled: false });
    const t0 = 5_000;
    expect(run(s, { type: 'background', at: t0 }, { type: 'foreground', at: t0 + 10 * LOCK_AFTER_MS }).locked).toBe(false);
    expect(reduceGate(s, { type: 'lock' }).locked).toBe(false);
  });

  it('enabling does not lock the user who just enabled it; disabling unlocks', () => {
    const on = reduceGate(initialGate, { type: 'enable' });
    expect(on).toEqual({ enabled: true, locked: false, backgroundedAt: null });
    const locked = reduceGate(on, { type: 'lock' });
    expect(locked.locked).toBe(true);
    expect(reduceGate(locked, { type: 'disable' })).toEqual({ enabled: false, locked: false, backgroundedAt: null });
  });

  it('keeps the lock when the app is backgrounded while already locked', () => {
    const s = reduceGate(initialGate, { type: 'boot', enabled: true });
    expect(run(s, { type: 'background', at: 1 }, { type: 'foreground', at: 2 }).locked).toBe(true);
  });

  it('returns the same object when nothing changes (cheap re-renders)', () => {
    const s = reduceGate(initialGate, { type: 'boot', enabled: true });
    expect(reduceGate(s, { type: 'lock' })).toBe(s);
    const off = reduceGate(initialGate, { type: 'boot', enabled: false });
    expect(reduceGate(off, { type: 'foreground', at: 1 })).toBe(off);
  });

  it('maps AppState strings to events', () => {
    expect(gateEventForAppState('active', 9)).toEqual({ type: 'foreground', at: 9 });
    expect(gateEventForAppState('background', 9)).toEqual({ type: 'background', at: 9 });
    expect(gateEventForAppState('inactive', 9)).toEqual({ type: 'background', at: 9 });
    expect(gateEventForAppState('unknown', 9)).toBeNull();
  });

  it('shouldLockOnForeground is strict about the threshold', () => {
    expect(shouldLockOnForeground(null, 10)).toBe(false);
    expect(shouldLockOnForeground(0, LOCK_AFTER_MS)).toBe(false);
    expect(shouldLockOnForeground(0, LOCK_AFTER_MS + 1)).toBe(true);
  });
});
