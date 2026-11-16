import { describe, expect, it } from 'vitest';
import { BINS, WASTE_BINS, WASTE_ITEMS, wasteItem } from './items';
import { ROUND_SIZE, multiplierFor, parseSeed, pickRound, scoreAnswer, speedBonus, summarize, timeBonus, type Answer } from './game';

const LANGS = ['az', 'de', 'en', 'ru', 'tr', 'uk'] as const;

describe('waste items', () => {
  it('has about 60 items with unique ids', () => {
    expect(WASTE_ITEMS.length).toBeGreaterThanOrEqual(55);
    expect(new Set(WASTE_ITEMS.map((i) => i.id)).size).toBe(WASTE_ITEMS.length);
  });

  it('uses every bin and describes every bin in all languages', () => {
    for (const b of WASTE_BINS) expect(WASTE_ITEMS.some((i) => i.bin === b), b).toBe(true);
    expect(BINS.map((b) => b.key)).toEqual([...WASTE_BINS]);
    for (const b of BINS) for (const l of LANGS) expect(b.name[l] && b.hint[l], `${b.key} ${l}`).toBeTruthy();
  });

  it('has names and explanations in all six languages', () => {
    for (const i of WASTE_ITEMS)
      for (const l of LANGS) {
        expect(i.name[l]?.trim(), `${i.id} name ${l}`).toBeTruthy();
        expect(i.why[l]?.trim().length, `${i.id} why ${l}`).toBeGreaterThan(10);
      }
  });

  it('flags at least 10 tricky items and gives glass items a colour', () => {
    expect(WASTE_ITEMS.filter((i) => i.tricky).length).toBeGreaterThanOrEqual(10);
    for (const i of WASTE_ITEMS) expect(!!i.glass, i.id).toBe(i.bin === 'glas');
  });

  it('knows the classic answers', () => {
    expect(wasteItem('pizzakarton-sauber')?.bin).toBe('papier');
    expect(wasteItem('pizzakarton-fettig')?.bin).toBe('rest');
    expect(wasteItem('kassenbon')?.bin).toBe('rest');
    expect(wasteItem('getraenkekarton')?.bin).toBe('gelb');
    expect(wasteItem('batterien')?.bin).toBe('sonder');
    expect(wasteItem('pet-einweg')?.bin).toBe('pfand');
    expect(wasteItem('glasdeckel')?.bin).toBe('gelb');
    expect(wasteItem('trinkglas')?.bin).toBe('rest');
    expect(wasteItem('blaue-flasche')?.glass).toBe('gruen');
    expect(wasteItem('taschentuch')?.bin).toBe('rest');
  });
});

describe('waste game rules', () => {
  it('picks the same round for the same seed and a quarter tricky items', () => {
    const a = pickRound(4242).map((i) => i.id);
    expect(a).toEqual(pickRound(4242).map((i) => i.id));
    expect(a).toHaveLength(ROUND_SIZE);
    expect(new Set(a).size).toBe(ROUND_SIZE);
    expect(pickRound(4242).filter((i) => i.tricky).length).toBeGreaterThanOrEqual(ROUND_SIZE / 4);
    expect(pickRound(7).map((i) => i.id)).not.toEqual(a);
  });

  it('parses seeds strictly', () => {
    expect(parseSeed('123')).toBe(123);
    expect(parseSeed('0')).toBeNull();
    expect(parseSeed('abc')).toBeNull();
    expect(parseSeed('1234567')).toBeNull();
    expect(parseSeed(null)).toBeNull();
  });

  it('scores with a capped combo multiplier and a speed bonus', () => {
    expect([1, 2, 3, 6, 9, 12, 30].map(multiplierFor)).toEqual([1, 1, 1.5, 2, 2.5, 3, 3]);
    expect(speedBonus(2)).toBe(5);
    expect(speedBonus(5)).toBe(2);
    expect(speedBonus(9)).toBe(0);
    expect(scoreAnswer(true, 0, 10)).toEqual({ correct: true, points: 10, combo: 1 });
    expect(scoreAnswer(true, 2, 2)).toEqual({ correct: true, points: 20, combo: 3 });
    expect(scoreAnswer(true, 20, 10)).toEqual({ correct: true, points: 30, combo: 21 });
    expect(scoreAnswer(false, 5, 1)).toEqual({ correct: false, points: 0, combo: 0 });
    expect(timeBonus(33.7, true)).toBe(33);
    expect(timeBonus(33, false)).toBe(0);
  });

  it('summarises a round', () => {
    const answers: Answer[] = [
      { itemId: 'a', chosen: 'gelb', correct: true, points: 10 },
      { itemId: 'b', chosen: 'gelb', correct: true, points: 12 },
      { itemId: 'c', chosen: 'rest', correct: false, points: 0 },
      { itemId: 'd', chosen: 'bio', correct: true, points: 10 },
    ];
    const s = summarize(answers, 5);
    expect(s).toMatchObject({ answered: 4, correct: 3, accuracy: 75, points: 37, maxCombo: 2 });
    expect(s.mistakes.map((m) => m.itemId)).toEqual(['c']);
  });
});
