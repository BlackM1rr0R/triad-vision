import { describe, expect, it } from 'vitest';
import { BAKU_POINT, flightMinutes, greatCircleKm } from '../../src/lib/life/cityProfile.js';

describe('city profile flight estimate', () => {
  it('computes the Baku to Berlin great-circle distance (about 3 100 km)', () => {
    const km = greatCircleKm(BAKU_POINT, { lat: 52.52, lng: 13.405 });
    expect(km).toBeGreaterThan(3000);
    expect(km).toBeLessThan(3300);
  });
  it('is zero for the same point', () => {
    expect(greatCircleKm(BAKU_POINT, BAKU_POINT)).toBeCloseTo(0, 5);
  });
  it('adds 30 minutes to the cruise time and rounds to 5 minutes', () => {
    expect(flightMinutes(800)).toBe(90);
    expect(flightMinutes(3200)).toBe(270);
    expect(flightMinutes(3100) % 5).toBe(0);
  });
});
