import { describe, expect, it } from 'vitest';
import { PRICE_BY_ID } from '@/lib/games/price/items';
import { AISLES, CONFUSABLE, EMPTIES, PRODUCTS, PRODUCT_BY_ID, productsIn } from './items';
import { EMPTIES_PER_ROUND, MAX_LIST, MIN_LIST, buildReceipt, buildRound, cashFor, maxPoints, parseSeed, pick, summarize } from './game';

describe('supermarket data', () => {
  it('has about 60 unique products in all six languages, in every aisle', () => {
    expect(PRODUCTS.length).toBeGreaterThanOrEqual(58);
    expect(new Set(PRODUCTS.map((p) => p.id)).size).toBe(PRODUCTS.length);
    for (const p of PRODUCTS) {
      for (const l of ['az', 'de', 'en', 'ru', 'tr', 'uk'] as const) expect(p.name[l], `${p.id} ${l}`).toBeTruthy();
      expect(p.price, p.id).toBeGreaterThan(0);
      expect(p.unit, p.id).toBeTruthy();
    }
    for (const a of AISLES) expect(productsIn(a).length, a).toBeGreaterThanOrEqual(6);
  });

  it('uses the price game figures where the product is the same', () => {
    expect(PRODUCT_BY_ID.get('milch')?.price).toBe(PRICE_BY_ID.get('milk')?.price);
    expect(PRODUCT_BY_ID.get('sprudel')?.price).toBe(PRICE_BY_ID.get('water')?.price);
    expect(PRODUCT_BY_ID.get('milch')?.basis).toBe('priceGame');
    expect(PRODUCT_BY_ID.get('quark')?.basis).toBe('estimate');
  });

  it('keeps the deposit and VAT rules: 0.25 € single-use, 0.08 / 0.15 € reusable, drinks 19 %, milk 7 %', () => {
    for (const p of PRODUCTS.filter((x) => x.aisle === 'getraenke')) expect(p.vat, p.id).toBe(19);
    expect(PRODUCT_BY_ID.get('milch')?.vat).toBe(7);
    expect(PRODUCT_BY_ID.get('cola')?.pfand).toBe(0.25);
    expect(PRODUCT_BY_ID.get('bier')?.pfand).toBe(0.08);
    expect(PRODUCT_BY_ID.get('saft')?.pfand).toBeUndefined();
    for (const e of EMPTIES) expect([0, 0.08, 0.15, 0.25]).toContain(e.pfand);
  });

  it('explains every look-alike pair and points only to existing products', () => {
    for (const [id, others] of Object.entries(CONFUSABLE)) {
      expect(PRODUCT_BY_ID.get(id)?.note, id).toBeTruthy();
      for (const o of others) expect(PRODUCT_BY_ID.has(o), o).toBe(true);
    }
    expect(PRODUCT_BY_ID.get('hackgemischt')?.note?.en).toMatch(/pork/i);
  });
});

describe('supermarket rounds', () => {
  it('builds the same round from the same seed, 5–8 items, no look-alikes together', () => {
    for (let seed = 1; seed < 300; seed++) {
      const a = buildRound(seed);
      expect(buildRound(seed).list.map((p) => p.id)).toEqual(a.list.map((p) => p.id));
      expect(a.list.length).toBeGreaterThanOrEqual(MIN_LIST);
      expect(a.list.length).toBeLessThanOrEqual(MAX_LIST);
      expect(new Set(a.list.map((p) => p.id)).size).toBe(a.list.length);
      for (const p of a.list) for (const q of a.list) expect(CONFUSABLE[p.id]?.includes(q.id) ?? false, `${seed} ${p.id} ${q.id}`).toBe(false);
      expect(a.list.filter((p) => CONFUSABLE[p.id]).length).toBeGreaterThanOrEqual(2);
      expect(a.empties).toHaveLength(EMPTIES_PER_ROUND);
      expect(a.empties.some((e) => e.pfand === 0)).toBe(true);
    }
  });

  it('parses only valid seeds', () => {
    expect(parseSeed('42')).toBe(42);
    expect(parseSeed('0')).toBeNull();
    expect(parseSeed('abc')).toBeNull();
    expect(parseSeed('1234567')).toBeNull();
  });

  it('tells found, again and wrong picks apart and names the look-alike', () => {
    const list = ['quark', 'mehl405', 'bananen'].map((id) => PRODUCT_BY_ID.get(id)!);
    expect(pick(list, [], 'quark')?.kind).toBe('found');
    expect(pick(list, ['quark'], 'quark')?.kind).toBe('again');
    const w = pick(list, [], 'joghurt');
    expect(w?.kind).toBe('wrong');
    expect(w && w.kind === 'wrong' ? w.meant?.id : null).toBe('quark');
    const w2 = pick(list, [], 'mehl1050');
    expect(w2 && w2.kind === 'wrong' ? w2.meant?.id : null).toBe('mehl405');
    expect(pick(list, [], 'nope')).toBeNull();
  });

  it('scores found items, mistakes, Pfand answers, own bag and the time bonus', () => {
    expect(summarize({ found: 6, listSize: 6, wrong: 0, pfandRight: 4, secondsLeft: 60, bag: 'own' }).points).toBe(600 + 80 + 20 + 120);
    expect(summarize({ found: 5, listSize: 6, wrong: 2, pfandRight: 1, secondsLeft: 60, bag: 'paper' }).points).toBe(500 - 40 + 20);
    expect(summarize({ found: 0, listSize: 6, wrong: 9, pfandRight: 0, secondsLeft: 0, bag: null }).points).toBe(0);
    expect(maxPoints(6)).toBe(600 + 80 + 20 + 360);
  });

  it('prints a receipt with Pfand lines, the paper bag, the voucher and the VAT split', () => {
    const products = ['milch', 'cola', 'spuelmittel'].map((id) => PRODUCT_BY_ID.get(id)!);
    const r = buildReceipt(products, 'paper', 0.33);
    const milk = PRODUCT_BY_ID.get('milch')!.price;
    const cola = PRODUCT_BY_ID.get('cola')!.price;
    expect(r.lines.map((l) => l.code)).toEqual(['A', 'B', 'B', 'B', 'B', null]);
    expect(r.total).toBeCloseTo(milk + cola + 0.25 + 0.95 + 0.2 - 0.33, 2);
    const a = r.vat.find((v) => v.code === 'A')!;
    expect(a.gross).toBeCloseTo(milk, 2);
    expect(a.net + a.tax).toBeCloseTo(a.gross, 2);
    expect(cashFor(7.4)).toEqual({ given: 10, change: 2.6 });
    expect(cashFor(23.1).given).toBe(50);
  });
});
