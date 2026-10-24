import { afterEach, describe, expect, it } from 'vitest';
import { subscribe, type RealtimeEvent } from '../../src/lib/messaging/realtime.js';
import { PRESENCE_TTL_MS, heartbeat, leave, resetPresence, sweep, viewers } from '../../src/lib/presence/viewers.js';

const aysel = { id: 'u-aysel', firstName: 'Aysel', lastName: 'Q' };
const murad = { id: 'u-murad', firstName: 'Murad', lastName: 'H' };

/** Collects `viewers.updated` events pushed to a user. */
const inbox = (userId: string) => {
  const events: RealtimeEvent[] = [];
  const off = subscribe(userId, (ev) => {
    if (ev.type === 'viewers.updated') events.push(ev);
  });
  return { events, off };
};

afterEach(() => resetPresence());

describe('presence viewers (in memory)', () => {
  it('join adds the viewer and announces it to everyone in the room', () => {
    const a = inbox(aysel.id);
    const m = inbox(murad.id);
    const t0 = 1_000_000;
    expect(heartbeat('case', 'c1', aysel, null, t0).map((v) => v.userId)).toEqual([aysel.id]);
    const list = heartbeat('case', 'c1', murad, null, t0 + 10);
    expect(list.map((v) => v.userId)).toEqual([aysel.id, murad.id]);
    // Aysel got both joins, Murad only his own.
    expect(a.events).toHaveLength(2);
    expect(m.events).toHaveLength(1);
    expect(m.events[0].payload).toMatchObject({ kind: 'case', id: 'c1' });
    expect((m.events[0].payload.viewers as { userId: string }[]).map((v) => v.userId)).toEqual([aysel.id, murad.id]);
    a.off();
    m.off();
  });

  it('a plain heartbeat is silent; the editing flag is announced', () => {
    const t0 = 2_000_000;
    heartbeat('case', 'c1', aysel, null, t0);
    const a = inbox(aysel.id);
    heartbeat('case', 'c1', aysel, null, t0 + 15_000);
    expect(a.events).toHaveLength(0);
    const list = heartbeat('case', 'c1', aysel, 'details', t0 + 16_000);
    expect(list[0].editing).toBe('details');
    expect(a.events).toHaveLength(1);
    a.off();
  });

  it('leave removes the viewer and tells the one who left and the rest', () => {
    const t0 = 3_000_000;
    heartbeat('inquiry', 'i1', aysel, null, t0);
    heartbeat('inquiry', 'i1', murad, null, t0);
    const a = inbox(aysel.id);
    const m = inbox(murad.id);
    expect(leave('inquiry', 'i1', murad.id, t0 + 5).map((v) => v.userId)).toEqual([aysel.id]);
    expect(a.events).toHaveLength(1);
    expect(m.events).toHaveLength(1);
    expect(viewers('inquiry', 'i1', t0 + 6).map((v) => v.userId)).toEqual([aysel.id]);
    // Leaving twice is a no-op.
    leave('inquiry', 'i1', murad.id, t0 + 7);
    expect(m.events).toHaveLength(1);
    a.off();
    m.off();
  });

  it('a viewer without heartbeat times out after the TTL (lazy read and background sweep)', () => {
    const t0 = 4_000_000;
    heartbeat('case', 'c2', aysel, null, t0);
    heartbeat('case', 'c2', murad, null, t0 + PRESENCE_TTL_MS - 1000);
    expect(viewers('case', 'c2', t0 + PRESENCE_TTL_MS).map((v) => v.userId)).toEqual([aysel.id, murad.id]);
    const m = inbox(murad.id);
    // Aysel's last beat is now older than the TTL.
    expect(viewers('case', 'c2', t0 + PRESENCE_TTL_MS + 1).map((v) => v.userId)).toEqual([murad.id]);
    expect(m.events).toHaveLength(1);

    // Sweep drops Murad as well once he stops beating.
    expect(sweep(t0 + 3 * PRESENCE_TTL_MS)).toBe(1);
    expect(viewers('case', 'c2', t0 + 3 * PRESENCE_TTL_MS)).toEqual([]);
    m.off();
  });

  it('rooms are separate per record and kind', () => {
    const t0 = 5_000_000;
    heartbeat('case', 'x', aysel, null, t0);
    heartbeat('inquiry', 'x', murad, null, t0);
    expect(viewers('case', 'x', t0).map((v) => v.userId)).toEqual([aysel.id]);
    expect(viewers('inquiry', 'x', t0).map((v) => v.userId)).toEqual([murad.id]);
  });
});
