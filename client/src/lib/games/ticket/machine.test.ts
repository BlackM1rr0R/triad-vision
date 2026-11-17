import { describe, expect, it } from 'vitest';
import { FARES, GROUP_MAX, PENALTY_FARE, STATIONS, TASKS, TICKET_TYPES, ZONES, changeCoins, choiceProblems, emptyChoice, pickTasks, priceOf, scoreTask, searchStations, stationById, zoneFor, type TicketChoice, type TicketTask } from './machine';

const task = (id: string) => TASKS.find((t) => t.id === id)!;
const right = (t: TicketTask, extra: Partial<TicketChoice> = {}): TicketChoice => ({
  ...emptyChoice(),
  station: t.station,
  zone: zoneFor(stationById(t.station)!),
  type: t.types[0],
  adults: t.adults,
  children: t.children,
  cls: t.cls,
  stamped: true,
  ...extra,
});

describe('ticket machine data', () => {
  it('has fares for every type and zone, rising with the zone', () => {
    for (const t of TICKET_TYPES) {
      for (let i = 1; i < ZONES.length; i++) expect(FARES[t][ZONES[i]][0]).toBeGreaterThan(FARES[t][ZONES[i - 1]][0]);
    }
    expect(PENALTY_FARE).toBe(60);
  });

  it('searches stations like the machine keyboard (case and umlauts ignored)', () => {
    expect(searchStations('uni').map((s) => s.id)).toEqual(['universitaet']);
    expect(searchStations('UNIVERSITÄT').map((s) => s.id)).toEqual(['universitaet']);
    expect(searchStations('nord').map((s) => s.id)).toEqual(['klinikum']);
    expect(searchStations('')).toHaveLength(STATIONS.length);
    expect(searchStations('xyz')).toHaveLength(0);
  });

  it('prices a choice: per person, flat for the group ticket, 1st class surcharge', () => {
    expect(priceOf({ zone: 'AB', type: 'single', adults: 1, children: 1, cls: 2 })).toBeCloseTo(FARES.single.AB[0] + FARES.single.AB[1], 2);
    expect(priceOf({ zone: 'AB', type: 'dayGroup', adults: 4, children: 1, cls: 2 })).toBe(FARES.dayGroup.AB[0]);
    expect(priceOf({ zone: 'A', type: 'single', adults: 1, children: 0, cls: 1 })).toBeGreaterThan(FARES.single.A[0]);
    expect(choiceProblems({ ...emptyChoice(), type: 'dayGroup', adults: GROUP_MAX + 1 })).toContain('groupTooBig');
    expect(choiceProblems({ ...emptyChoice(), adults: 0 })).toContain('noPerson');
  });

  it('returns change in coins', () => {
    expect(changeCoins(5, 3.4)).toEqual([1, 0.5, 0.1]);
    expect(changeCoins(2.4, 2.4)).toEqual([]);
  });
});

describe('ticket task scoring', () => {
  it('gives full points for the expected ticket of every task', () => {
    for (const t of TASKS) {
      const r = scoreTask(t, right(t));
      expect(r.mistakes, t.id).toEqual([]);
      expect(r.points, t.id).toBe(100);
      expect(r.valid).toBe(true);
    }
  });

  it('marks a too small zone as invalid (penalty fare) and a too big one as overpaid', () => {
    const t = task('airport2');
    const low = scoreTask(t, right(t, { zone: 'A' }));
    expect(low.mistakes).toContain('zoneLow');
    expect(low.valid).toBe(false);
    const high = scoreTask(t, right(t, { zone: 'ABC' }));
    expect(high.mistakes).toEqual(['zoneHigh']);
    expect(high.valid).toBe(true);
    expect(high.points).toBeLessThan(100);
  });

  it('accepts the group day ticket for 2 adults but flags it as pricier; the reverse for 4 people', () => {
    expect(scoreTask(task('airport2'), right(task('airport2'), { type: 'dayGroup' })).mistakes).toEqual(['pricier']);
    expect(scoreTask(task('messeGroup'), right(task('messeGroup'), { type: 'day' })).mistakes).toEqual(['pricier']);
  });

  it('knows that children under 6 ride free and that a missing child ticket is invalid', () => {
    expect(scoreTask(task('toddler'), right(task('toddler'), { children: 1 })).mistakes).toEqual(['personsHigh']);
    const r = scoreTask(task('zooKid'), right(task('zooKid'), { children: 0 }));
    expect(r.mistakes).toEqual(['personsLow']);
    expect(r.valid).toBe(false);
    // a child ticket for an adult is not enough
    expect(scoreTask(task('uni'), right(task('uni'), { adults: 0, children: 1 })).mistakes).toContain('personsLow');
  });

  it('requires stamping the 4-ride ticket, and the right class and type', () => {
    const t = task('seedorf4');
    const r = scoreTask(t, right(t, { stamped: false }));
    expect(r.mistakes).toEqual(['notStamped']);
    expect(r.valid).toBe(false);
    expect(scoreTask(task('neustadt1'), right(task('neustadt1'), { cls: 2 })).mistakes).toEqual(['cls']);
    expect(scoreTask(task('uni'), right(task('uni'), { type: 'day' })).mistakes).toEqual(['type']);
  });

  it('never goes below 0 points and picks 5 different tasks per seed', () => {
    const t = task('zooKid');
    expect(scoreTask(t, { ...emptyChoice(), zone: 'A', type: 'fourRide', adults: 0, children: 0, cls: 1 }).points).toBe(0);
    const a = pickTasks(7).map((x) => x.id);
    expect(pickTasks(7).map((x) => x.id)).toEqual(a);
    expect(new Set(a).size).toBe(5);
  });
});
