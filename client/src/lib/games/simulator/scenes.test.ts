import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SCENES } from './scenes';
import { scorePath, type Scene } from './types';

const here = path.dirname(fileURLToPath(import.meta.url));
const LANGS5 = ['az', 'en', 'ru', 'tr', 'uk'] as const;
const LANGS6 = ['az', 'de', 'en', 'ru', 'tr', 'uk'] as const;

/** Slugs of the glossary (server lib/glossary/terms/*.ts), read as text so the client test needs no server import. */
const glossarySlugs = () => {
  const dir = path.resolve(here, '../../../../../server/src/lib/glossary/terms');
  const slugs = new Set<string>();
  for (const f of readdirSync(dir)) for (const m of readFileSync(path.join(dir, f), 'utf8').matchAll(/slug: '([a-z0-9-]+)'/g)) slugs.add(m[1]);
  return slugs;
};

/** Every path from start, as lists of node ids (the graph is small; a cycle would throw). */
const allPaths = (scene: Scene) => {
  const byId = new Map(scene.nodes.map((n) => [n.id, n]));
  const paths: string[][] = [];
  const walk = (id: string, trail: string[]) => {
    if (trail.includes(id)) throw new Error(`${scene.id}: cycle at ${id}`);
    const node = byId.get(id)!;
    if (!node.choices.length) return void paths.push([...trail, id]);
    for (const c of node.choices) walk(c.next, [...trail, id]);
  };
  walk(scene.start, []);
  return paths;
};

describe('German simulator scenes', () => {
  it('has at least five scenes with unique ids', () => {
    expect(SCENES.length).toBeGreaterThanOrEqual(5);
    expect(new Set(SCENES.map((s) => s.id)).size).toBe(SCENES.length);
  });

  for (const scene of SCENES) {
    describe(scene.id, () => {
      const byId = new Map(scene.nodes.map((n) => [n.id, n]));

      it('has unique node ids, a valid start and only existing targets', () => {
        expect(byId.size).toBe(scene.nodes.length);
        expect(byId.has(scene.start)).toBe(true);
        for (const n of scene.nodes) for (const c of n.choices) expect(byId.has(c.next), `${n.id} → ${c.next}`).toBe(true);
      });

      it('offers exactly three replies (good, ok, bad) on every line and none on endings', () => {
        for (const n of scene.nodes) {
          if (n.end) expect(n.choices, n.id).toHaveLength(0);
          else {
            expect(n.choices, n.id).toHaveLength(3);
            expect(n.choices.map((c) => c.quality).sort(), n.id).toEqual(['bad', 'good', 'ok']);
          }
        }
      });

      it('reaches every node from the start', () => {
        const seen = new Set<string>();
        const stack = [scene.start];
        while (stack.length) {
          const id = stack.pop()!;
          if (seen.has(id)) continue;
          seen.add(id);
          for (const c of byId.get(id)!.choices) stack.push(c.next);
        }
        for (const n of scene.nodes) expect(seen.has(n.id), `${n.id} unreachable`).toBe(true);
      });

      it('ends every path (acyclic) and has a success and a non-success ending', () => {
        const paths = allPaths(scene);
        expect(paths.length).toBeGreaterThan(3);
        for (const p of paths) expect(byId.get(p[p.length - 1])!.end, p.join(' → ')).toBeTruthy();
        const outcomes = new Set(scene.nodes.filter((n) => n.end).map((n) => n.end!.outcome));
        expect(outcomes.has('success')).toBe(true);
        expect(outcomes.has('fail') || outcomes.has('partial')).toBe(true);
      });

      it('translates every line and explains every weak or wrong reply', () => {
        for (const l of LANGS6) {
          expect(scene.title[l], `title ${l}`).toBeTruthy();
          expect(scene.setting[l], `setting ${l}`).toBeTruthy();
        }
        for (const n of scene.nodes) {
          expect(n.de, n.id).toBeTruthy();
          for (const l of LANGS5) expect(n.tx[l], `${n.id} ${l}`).toBeTruthy();
          if (n.end) for (const l of LANGS6) expect(n.end.summary[l], `${n.id} summary ${l}`).toBeTruthy();
          for (const c of n.choices) {
            for (const l of LANGS5) expect(c.tx[l], `${n.id} ${c.de} ${l}`).toBeTruthy();
            if (c.quality !== 'good') for (const l of LANGS6) expect(c.feedback?.[l], `${n.id} ${c.de} feedback ${l}`).toBeTruthy();
          }
        }
      });

      it('links key phrases to existing glossary terms', () => {
        const slugs = glossarySlugs();
        expect(scene.phrases.length).toBeGreaterThanOrEqual(4);
        for (const p of scene.phrases) {
          for (const l of LANGS5) expect(p.tx[l], `${p.de} ${l}`).toBeTruthy();
          if (p.glossary) expect(slugs.has(p.glossary), `${p.de} → /glossary/${p.glossary}`).toBe(true);
        }
      });

      it('scores the best path 100 %', () => {
        const steps: { node: string; choice: number }[] = [];
        let id = scene.start;
        for (let guard = 0; guard < 50; guard++) {
          const n = byId.get(id)!;
          if (!n.choices.length) break;
          const choice = n.choices.findIndex((c) => c.quality === 'good');
          steps.push({ node: id, choice });
          id = n.choices[choice].next;
        }
        expect(scorePath(scene, steps).percent).toBe(100);
        expect(byId.get(id)!.end?.outcome).toBe('success');
      });
    });
  }
});
