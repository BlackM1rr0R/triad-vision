import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { reviewMarksSchema } from '../../src/lib/review/marks.js';

/**
 * Client helpers of the review marks (client/src/components/review/marks.ts): drag → box, API clean-up and the
 * tolerant reader. Loaded by URL (the client has no test runner); the output must pass the server schema.
 */

interface Mark {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  note: string;
}
interface MarksModule {
  boxFromPoints: (a: { x: number; y: number }, b: { x: number; y: number }, page: number) => Mark | null;
  cleanMarks: (marks: Mark[]) => Mark[];
  marksOf: (doc: unknown) => Mark[];
  MAX_MARKS: number;
}

let m: MarksModule;
beforeAll(async () => {
  const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../client/src/components/review/marks.ts');
  m = (await import(/* @vite-ignore */ pathToFileURL(file).href)) as MarksModule;
});

describe('review marks (client helpers)', () => {
  it('a drag in any direction becomes a box inside the page; a click is no box', () => {
    expect(m.boxFromPoints({ x: 0.6, y: 0.5 }, { x: 0.2, y: 0.1 }, 2)).toEqual({ page: 2, x: 0.2, y: 0.1, w: 0.4, h: 0.4, note: '' });
    expect(m.boxFromPoints({ x: 0.9, y: 0.9 }, { x: 1.4, y: 1.2 }, 1)).toEqual({ page: 1, x: 0.9, y: 0.9, w: 0.1, h: 0.1, note: '' });
    expect(m.boxFromPoints({ x: 0.5, y: 0.5 }, { x: 0.503, y: 0.6 }, 1)).toBeNull();
  });

  it('cleanMarks output is accepted by the server schema', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ page: 1.7, x: i / 25, y: 0.95, w: 0.5, h: 0.2, note: `  n${i}  ${'x'.repeat(400)}` }));
    const clean = m.cleanMarks(many);
    expect(clean).toHaveLength(m.MAX_MARKS);
    expect(clean[0].page).toBe(1);
    expect(clean[0].note.length).toBeLessThanOrEqual(300);
    expect(reviewMarksSchema.safeParse(clean.filter((x) => x.w >= 0.005 && x.h >= 0.005)).success).toBe(true);
  });

  it('marksOf tolerates missing or malformed data', () => {
    expect(m.marksOf(null)).toEqual([]);
    expect(m.marksOf({ reviewMarks: 'x' })).toEqual([]);
    expect(m.marksOf({ reviewMarks: [{ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, { x: 'a' }] })).toEqual([{ page: 1, x: 0.1, y: 0.1, w: 0.2, h: 0.2, note: '' }]);
  });
});
