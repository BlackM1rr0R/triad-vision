import { describe, expect, it } from 'vitest';
import { PLACES, STREET_W, placeById } from './buildings';
import { streetStates, streetSummary, type Reader } from './progress';

const reader =
  (store: Record<string, unknown>): Reader =>
  <T,>(key: string, fallback: T) =>
    (key in store ? (store[key] as T) : fallback);

describe('german street', () => {
  it('has 15 places in walking order, inside the street, with intros in six languages and links', () => {
    expect(PLACES).toHaveLength(15);
    expect(new Set(PLACES.map((p) => p.id)).size).toBe(15);
    for (let i = 0; i < PLACES.length; i++) {
      const p = PLACES[i];
      expect(p.x + p.w, p.id).toBeLessThanOrEqual(STREET_W);
      if (i > 0) expect(p.x, p.id).toBeGreaterThanOrEqual(PLACES[i - 1].x + PLACES[i - 1].w);
      for (const l of ['az', 'de', 'en', 'ru', 'tr', 'uk'] as const) expect(p.intro[l], `${p.id} ${l}`).toBeTruthy();
      expect(p.links.length, p.id).toBeGreaterThan(0);
      for (const link of p.links) expect(link.to, p.id).toMatch(/^\//);
    }
    expect(placeById('bank')?.links[0].to).toBe('/german-simulator?scene=bank');
    expect(placeById('nope')).toBeNull();
  });

  it('reads completion from the keys the games already write', () => {
    const s = streetStates(
      reader({
        'simulator.best': { anmeldung: 80, doctor: 50 },
        'price.best': 420,
        'waste.best': 0,
        'signs.known': ['vorfahrt'],
        'mockExam.a1-1': { v: 1, done: { hoeren: '2026-11-01' } },
        'ticket.best': 300,
        'street.visited': ['post', 'bank'],
      }),
    );
    expect(s.buergeramt).toBe('done');
    expect(s.arztpraxis).toBe('done');
    expect(s.bank).toBe('visited');
    expect(s.baeckerei).toBe('done');
    expect(s.muell).toBe('done'); // a best of 0 points is still a finished round
    expect(s.schilder).toBe('done');
    expect(s.sprachschule).toBe('done');
    expect(s.bahnhof).toBe('done');
    expect(s.supermarkt).toBe('new');
    expect(s.post).toBe('visited');
    expect(s.baustelle).toBe('new');
    const sum = streetSummary(s);
    expect(sum.done).toBe(7);
    expect(sum.trackable).toBe(10);
    expect(sum.seen).toBe(9);
    expect(sum.total).toBe(15);
  });

  it('ignores broken stored values', () => {
    const s = streetStates(reader({ 'simulator.best': 'x', 'price.best': 'y', 'street.visited': 'z', 'pron.best': [1], 'mockExam.b1-1': { done: [] } }));
    expect(Object.values(s).every((v) => v === 'new')).toBe(true);
  });
});
