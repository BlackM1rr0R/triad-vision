import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * The "which visa fits me?" wizard of the comparison page (client/src/lib/visaCompare.ts). The client has no
 * test runner; the module is loaded by URL so the server type-check does not pull client sources in.
 */

type Answers = { qualification: string; recognition: string; offer: string; german: string; age: string; family: string };
type Rec = { route: string; score: number; fit: 'high' | 'medium' | 'low'; reasons: string[] };
interface Wizard {
  recommend: (a: Answers) => Rec[];
  topRecommendations: (r: Rec[]) => Rec[];
  visibleQuestions: (a: Partial<Answers>) => { key: string }[];
  chancenkartePoints: (a: Answers) => number;
}

let w: Wizard;
beforeAll(async () => {
  const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../client/src/lib/visaCompare.ts');
  w = (await import(pathToFileURL(file).href)) as Wizard;
});

const base: Answers = { qualification: 'degree', recognition: 'unknown', offer: 'none', german: 'none', age: 'u35', family: 'no' };
const top = (a: Partial<Answers>) => w.topRecommendations(w.recommend({ ...base, ...a })).map((r) => r.route);

describe('visa comparison wizard', () => {
  it('recommends the Blue Card for a graduate with a salary above the threshold', () => {
    const recs = w.recommend({ ...base, offer: 'above', recognition: 'full' });
    expect(recs[0]).toMatchObject({ route: 'blueCard', fit: 'high' });
    expect(recs[0].reasons).toEqual(expect.arrayContaining(['+degree', '+salaryAbove', '+noGermanNeeded']));
  });

  it('recommends the Opportunity Card without a job offer when the points are likely', () => {
    expect(top({ recognition: 'partial', german: 'A2' })).toContain('chancenkarte');
    const ck = w.recommend({ ...base, recognition: 'no', german: 'none', age: '45plus' }).find((r) => r.route === 'chancenkarte')!;
    expect(ck.reasons).toEqual(expect.arrayContaining(['-needA1', '-pointsLow']));
    expect(w.chancenkartePoints({ ...base, recognition: 'partial', german: 'B1', age: 'u35' })).toBe(8);
  });

  it('recommends §18a for recognised vocational training with an offer, and warns 45+ applicants with a low salary', () => {
    expect(top({ qualification: 'vocational', recognition: 'full', offer: 'below', german: 'A2' })[0]).toBe('skilled18a');
    const old = w.recommend({ ...base, qualification: 'vocational', recognition: 'full', offer: 'below', german: 'A2', age: '45plus' }).find((r) => r.route === 'skilled18a')!;
    expect(old.reasons).toContain('-age45Salary');
  });

  it('recommends Ausbildung for young people without a qualification and family reunification with a spouse in Germany', () => {
    expect(top({ qualification: 'none', german: 'B1' })[0]).toBe('ausbildung');
    expect(top({ qualification: 'none', family: 'yes' })[0]).toBe('family');
  });

  it('skips the recognition question without a qualification and always returns all five routes', () => {
    expect(w.visibleQuestions({ qualification: 'none' }).map((q) => q.key)).not.toContain('recognition');
    expect(w.visibleQuestions({ qualification: 'degree' })).toHaveLength(6);
    const recs = w.recommend(base);
    expect(recs.map((r) => r.route).sort()).toEqual(['ausbildung', 'blueCard', 'chancenkarte', 'family', 'skilled18a']);
    for (const r of recs) expect(r.score).toBeGreaterThanOrEqual(0);
  });
});
