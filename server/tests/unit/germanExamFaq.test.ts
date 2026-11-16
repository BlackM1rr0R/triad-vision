import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderHead, TOOL_PAGES, type SeoData } from '../../src/lib/seo.js';
import { SEO_LOCALES, STATIC_PAGES, TOOL_GROUPS } from '../../src/lib/seoCatalogue.js';
import { LEVEL_SELF_FAQ, MOCK_EXAM_FAQ } from '../../src/lib/germanExam/faq.js';
import { GERMAN_EXAM_FAQ_PAGES, germanExamFaqFor } from '../../src/lib/germanExam/seo.js';

/*
 * German mock exams (/german-mock-exam, /a1, /b1) and the level self-assessment (/german-level-test-self): the
 * FAQ the pages show (client lib/germanExam/faq.ts) is the one sent as FAQPage JSON-LD, the pages are in the
 * catalogue, the tools hub and marked up as free educational web applications.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const PAGES = ['/german-mock-exam', '/german-mock-exam/a1', '/german-mock-exam/b1', '/german-level-test-self'];

const data: SeoData = { visas: [], services: [], posts: [], faqs: [], jobs: [], settings: {}, rating: null };
const ldBlocks = (html: string) =>
  [...html.matchAll(/<script data-seo type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]) as Record<string, unknown>);
const url = (p: string, l: string) => (l === 'az' ? p : `/${l}${p}`);

describe('German exam pages: FAQ and SEO', () => {
  it('uses exactly the FAQ the client pages show', async () => {
    const client = (await import(/* @vite-ignore */ pathToFileURL(path.resolve(here, '../../../client/src/lib/germanExam/faq.ts')).href)) as {
      MOCK_EXAM_FAQ: unknown;
      LEVEL_SELF_FAQ: unknown;
    };
    expect(client.MOCK_EXAM_FAQ).toEqual(MOCK_EXAM_FAQ);
    expect(client.LEVEL_SELF_FAQ).toEqual(LEVEL_SELF_FAQ);
  });

  it('has the FAQ in all six languages', () => {
    for (const l of SEO_LOCALES) {
      expect(MOCK_EXAM_FAQ[l].length, l).toBeGreaterThanOrEqual(3);
      expect(LEVEL_SELF_FAQ[l].length, l).toBeGreaterThanOrEqual(3);
      for (const f of [...MOCK_EXAM_FAQ[l], ...LEVEL_SELF_FAQ[l]]) {
        expect(f.q.trim(), l).not.toBe('');
        expect(f.a.trim().length, l).toBeGreaterThan(40);
      }
    }
    // The independence statement is part of the mock exam FAQ in every language.
    for (const l of SEO_LOCALES) expect(MOCK_EXAM_FAQ[l][0].a, l).toMatch(/Goethe-(Institut|İnstitut)/);
  });

  it('registers the pages in the catalogue and the tools hub', () => {
    for (const p of PAGES) {
      expect(STATIC_PAGES[p], p).toBeDefined();
      expect(GERMAN_EXAM_FAQ_PAGES[p], p).toBeDefined();
    }
    const learn = TOOL_GROUPS.find((g) => g.key === 'learn')!.paths;
    expect(learn).toEqual(expect.arrayContaining(['/german-mock-exam', '/german-level-test-self']));
    for (const p of ['/german-mock-exam/a1', '/german-mock-exam/b1', '/german-level-test-self']) expect(TOOL_PAGES.has(p), p).toBe(true);
  });

  it('sends FAQPage JSON-LD in the page language', () => {
    for (const p of PAGES) {
      for (const l of SEO_LOCALES) {
        const faq = ldBlocks(renderHead(url(p, l), null, data)).find((b) => b['@type'] === 'FAQPage');
        expect(faq, `${p} ${l}`).toBeDefined();
        expect(faq!.inLanguage).toBe(l);
        const items = faq!.mainEntity as { name: string }[];
        expect(items.map((i) => i.name)).toEqual(germanExamFaqFor(p, l)!.map((f) => f.q));
      }
    }
    expect(germanExamFaqFor('/about', 'en')).toBeNull();
    expect(germanExamFaqFor('/german-mock-exam', 'xx')).toEqual(MOCK_EXAM_FAQ.en);
  });

  it('marks the exams and the self-assessment as free educational web applications', () => {
    for (const p of ['/german-mock-exam/a1', '/german-level-test-self']) {
      const app = ldBlocks(renderHead(url(p, 'de'), null, data)).find((b) => b['@type'] === 'WebApplication');
      expect(app, p).toBeDefined();
      expect(app!.applicationCategory).toBe('EducationalApplication');
      expect(app!.isAccessibleForFree).toBe(true);
    }
  });
});
