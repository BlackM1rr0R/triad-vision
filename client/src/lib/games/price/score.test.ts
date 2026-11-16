import { describe, expect, it } from 'vitest';
import { PRICE_ITEMS } from './items';
import { MAX_POINTS, ROUNDS, buildRounds, parseSeed, pointsFor, verdictFor } from './score';

describe('price game data', () => {
  it('has about 40 unique items with names in all six languages', () => {
    expect(PRICE_ITEMS.length).toBeGreaterThanOrEqual(38);
    expect(new Set(PRICE_ITEMS.map((i) => i.id)).size).toBe(PRICE_ITEMS.length);
    for (const i of PRICE_ITEMS) {
      for (const l of ['az', 'de', 'en', 'ru', 'tr', 'uk'] as const) expect(i.name[l], `${i.id} ${l}`).toBeTruthy();
      expect(i.price, i.id).toBeGreaterThan(0);
      if (i.basis === 'source') expect(i.source?.url, i.id).toMatch(/^(https:\/\/|\/)/);
    }
  });

  it('keeps the official amounts of 2026', () => {
    const p = (id: string) => PRICE_ITEMS.find((i) => i.id === id)?.price;
    expect(p('dticket')).toBe(63);
    expect(p('minWage')).toBe(13.9);
    expect(p('rundfunk')).toBe(18.36);
    expect(p('rentMunich')!).toBeGreaterThan(p('rentLeipzig')!);
  });
});

describe('price game rounds and scoring', () => {
  it('builds the same 10 distinct rounds from the same seed', () => {
    const a = buildRounds(123456);
    expect(a).toHaveLength(ROUNDS);
    expect(new Set(a.map((r) => r.item.id)).size).toBe(ROUNDS);
    expect(buildRounds(123456).map((r) => r.item.id)).toEqual(a.map((r) => r.item.id));
    expect(buildRounds(654321).map((r) => r.item.id)).not.toEqual(a.map((r) => r.item.id));
  });

  it('puts the price inside the slider range, below its upper end', () => {
    for (let s = 1; s < 50; s++)
      for (const r of buildRounds(s)) {
        expect(r.item.price).toBeLessThan(r.max);
        expect(r.start).toBeGreaterThanOrEqual(r.min);
        expect(r.start).toBeLessThanOrEqual(r.max);
      }
  });

  it('scores by closeness', () => {
    expect(pointsFor(10, 10)).toBe(MAX_POINTS);
    expect(pointsFor(10.4, 10)).toBe(MAX_POINTS);
    expect(pointsFor(13.5, 10)).toBe(50);
    expect(pointsFor(6.5, 10)).toBe(50);
    expect(pointsFor(17, 10)).toBe(0);
    expect(pointsFor(0, 10)).toBe(0);
    expect(verdictFor(10.2, 10)).toBe('spotOn');
    expect(verdictFor(11.5, 10)).toBe('close');
    expect(verdictFor(14, 10)).toBe('off');
    expect(verdictFor(20, 10)).toBe('far');
  });

  it('parses share-link seeds', () => {
    expect(parseSeed('123456')).toBe(123456);
    expect(parseSeed('abc')).toBeNull();
    expect(parseSeed(null)).toBeNull();
  });
});
