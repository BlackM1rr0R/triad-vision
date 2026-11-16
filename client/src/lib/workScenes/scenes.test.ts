import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { seededRandom } from '@/lib/games/common';
import { SITE_LOCALES } from '@/lib/siteLocale';
import { SCENE_META, sceneForGuide, sceneForProfession } from './meta';
import { answerQuiz, currentTarget, isFinished, nextQuestion, quizOptions, quizPercent, startQuiz } from './quiz';
import { SCENE_IDS, type WorkScene } from './types';
import { RESTAURANT_KITCHEN } from './scenes/restaurantKitchen';
import { TRUCK_CAB } from './scenes/truckCab';
import { HOSPITAL_WARD } from './scenes/hospitalWard';
import { CONSTRUCTION_SITE } from './scenes/constructionSite';
import { ELECTRICAL_PANEL } from './scenes/electricalPanel';

const SCENES: WorkScene[] = [RESTAURANT_KITCHEN, TRUCK_CAB, HOSPITAL_WARD, CONSTRUCTION_SITE, ELECTRICAL_PANEL];

/** Glossary slugs of the server's static glossary (server/src/lib/glossary/terms/*). */
const glossarySlugs = () => {
  const dir = new URL('../../../../server/src/lib/glossary/terms/', import.meta.url);
  const slugs = new Set<string>();
  for (const f of readdirSync(dir)) for (const m of readFileSync(new URL(f, dir), 'utf8').matchAll(/slug: '([a-z0-9-]+)'/g)) slugs.add(m[1]);
  return slugs;
};

describe('work scenes data', () => {
  it('has one data set per scene id and meta entry', () => {
    expect(SCENES.map((s) => s.id).sort()).toEqual([...SCENE_IDS].sort());
    expect(SCENE_META.map((s) => s.id).sort()).toEqual([...SCENE_IDS].sort());
    for (const m of SCENE_META) expect(m.path).toBe(`/work-scenes/${m.id}`);
  });

  it('has valid, well-spread hotspots with complete texts', () => {
    const slugs = glossarySlugs();
    expect(slugs.size).toBeGreaterThan(100);
    for (const s of SCENES) {
      expect(s.spots.length, s.id).toBeGreaterThanOrEqual(12);
      expect(new Set(s.spots.map((p) => p.id)).size, s.id).toBe(s.spots.length);
      expect(new Set(s.spots.map((p) => p.de.toLowerCase())).size, `${s.id} distinct German words`).toBe(s.spots.length);
      expect(s.sources.length, s.id).toBeGreaterThanOrEqual(3);
      for (const src of s.sources) expect(src.url, src.label).toMatch(/^https:\/\//);
      for (const p of s.spots) {
        const at = `${s.id}/${p.id}`;
        expect(p.x, at).toBeGreaterThan(0);
        expect(p.x, at).toBeLessThan(s.width);
        expect(p.y, at).toBeGreaterThan(0);
        expect(p.y, at).toBeLessThan(s.height);
        expect(p.de, at).toMatch(/^(der|die|das) \S/);
        expect(p.example.trim(), at).not.toBe('');
        for (const field of [p.name, p.what, p.safety, p.mistake]) for (const l of SITE_LOCALES) expect(field[l]?.trim(), `${at} ${l}`).toBeTruthy();
        for (const g of p.glossary ?? []) expect(slugs.has(g), `${at} glossary ${g}`).toBe(true);
      }
      for (const a of s.spots)
        for (const b of s.spots) if (a.id < b.id) expect(Math.hypot(a.x - b.x, a.y - b.y), `${s.id} ${a.id}↔${b.id}`).toBeGreaterThanOrEqual(40);
    }
  });

  it('maps professions and guides to scenes', () => {
    expect(sceneForProfession('cook')?.id).toBe('restaurant-kitchen');
    expect(sceneForProfession('truck_driver')?.id).toBe('truck-cab');
    expect(sceneForProfession('nurse')?.id).toBe('hospital-ward');
    expect(sceneForProfession('electrician')?.id).toBe('electrical-panel');
    expect(sceneForProfession('it')).toBeNull();
    expect(sceneForProfession(null)).toBeNull();
    expect(sceneForGuide('anerkennung-koch')?.id).toBe('restaurant-kitchen');
    expect(sceneForGuide('pflege')?.id).toBe('hospital-ward');
    expect(sceneForGuide('blue-card')).toBeNull();
  });
});

describe('work scenes quiz', () => {
  const items = RESTAURANT_KITCHEN.spots;

  it('gives four distinct options including the target', () => {
    const rnd = seededRandom(7);
    for (const it of items) {
      const opts = quizOptions(it.id, items, rnd);
      expect(opts).toHaveLength(4);
      expect(opts.map((o) => o.id)).toContain(it.id);
      expect(new Set(opts.map((o) => o.de)).size).toBe(4);
    }
    expect(quizOptions('nope', items)).toEqual([]);
    expect(quizOptions('a', [{ id: 'a', de: 'der A' }, { id: 'b', de: 'der B' }])).toHaveLength(2);
  });

  it('asks every hotspot once and counts the score', () => {
    let s = startQuiz(items, seededRandom(1));
    expect(new Set(s.order).size).toBe(items.length);
    let i = 0;
    while (!isFinished(s)) {
      const target = currentTarget(s)!;
      const wrong = items.find((x) => x.id !== target)!.id;
      s = answerQuiz(s, i % 2 ? wrong : target);
      expect(answerQuiz(s, target)).toBe(s); // second answer ignored
      s = nextQuestion(s);
      i++;
    }
    expect(s.correct).toBe(Math.ceil(items.length / 2));
    expect(s.missed).toHaveLength(Math.floor(items.length / 2));
    expect(quizPercent(s)).toBe(Math.round((s.correct / items.length) * 100));
    expect(nextQuestion({ ...s, answer: null })).toEqual({ ...s, answer: null });
  });
});
