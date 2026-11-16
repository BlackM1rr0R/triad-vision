import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TOOLS } from '@/components/audience/tools';
import { SCENE_META } from './workScenes/meta';
import { PROFESSION_HUB_SLUGS, PROFESSION_HUBS, germanyJobsLink, hubBySlug, hubPath, salaryMid } from './professionHubs';

const glossarySlugs = () => {
  const dir = new URL('../../../server/src/lib/glossary/terms/', import.meta.url);
  const slugs = new Set<string>();
  for (const f of readdirSync(dir)) for (const m of readFileSync(new URL(f, dir), 'utf8').matchAll(/slug: '([a-z0-9-]+)'/g)) slugs.add(m[1]);
  return slugs;
};

describe('profession hubs data', () => {
  const toolPaths = new Set([...TOOLS.map((t) => t.to), ...SCENE_META.map((s) => s.path), '/german-mock-exam/a1', '/german-mock-exam/b1']);

  it('has one hub per slug with existing tools, scenes and glossary terms', () => {
    expect(PROFESSION_HUBS.map((h) => h.slug)).toEqual([...PROFESSION_HUB_SLUGS]);
    const glossary = glossarySlugs();
    for (const h of PROFESSION_HUBS) {
      for (const p of h.tools) expect(toolPaths.has(p), `${h.slug} ${p}`).toBe(true);
      expect(SCENE_META.some((s) => s.id === h.scene), h.slug).toBe(true);
      expect(toolPaths.has(h.mockExam)).toBe(true);
      for (const g of h.glossary) expect(glossary.has(g), `${h.slug} ${g}`).toBe(true);
      expect(h.salary[0]).toBeGreaterThanOrEqual(2410); // never below the 2026 minimum wage at 40 h
      expect(h.salary[1]).toBeGreaterThan(h.salary[0]);
      expect(h.professions.length).toBeGreaterThan(0);
    }
  });

  it('matches the professions of the work scene it shows', () => {
    for (const h of PROFESSION_HUBS) {
      const scene = SCENE_META.find((s) => s.id === h.scene)!;
      expect(h.professions.some((p) => scene.professions.includes(p)), h.slug).toBe(true);
    }
  });

  it('builds links', () => {
    const cook = hubBySlug('cook')!;
    expect(hubPath('cook')).toBe('/for/cook');
    expect(salaryMid(cook)).toBe(2750);
    expect(germanyJobsLink(cook)).toBe('/jobs/germany/search?q=Koch');
    expect(hubBySlug('nope')).toBeNull();
  });
});
