import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { seededRandom } from '../common';
import { EXAM_SIZE, SIGN_CATEGORIES, SIGNS, buildExam, grade, passMark, signsByCategory } from './signs';

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../public');
const LANGS = ['az', 'de', 'en', 'ru', 'tr', 'uk'] as const;

describe('traffic sign data', () => {
  it('has about 100 signs with unique ids', () => {
    expect(SIGNS.length).toBeGreaterThanOrEqual(95);
    expect(new Set(SIGNS.map((s) => s.id)).size).toBe(SIGNS.length);
    expect(new Set(SIGNS.map((s) => s.de)).size).toBe(SIGNS.length);
  });

  it('has at least 10 signs in every category', () => {
    for (const c of SIGN_CATEGORIES) expect(signsByCategory(c).length, c).toBeGreaterThanOrEqual(10);
  });

  it('bundles a sanitized SVG for every sign', () => {
    for (const s of SIGNS) {
      const file = path.join(publicDir, s.file);
      expect(existsSync(file), s.file).toBe(true);
      const svg = readFileSync(file, 'utf8');
      expect(svg, s.file).toMatch(/<svg[\s>]/);
      expect(svg, s.file).toMatch(/viewBox=/);
      expect(svg, s.file).not.toMatch(/<script|<foreignObject|\son[a-z]+=|href="(?:https?:|javascript:)/i);
    }
    expect(existsSync(path.join(publicDir, 'signs/LICENSE.md'))).toBe(true);
  });

  it('has a name and an explanation in all six languages', () => {
    for (const s of SIGNS) {
      for (const l of LANGS) {
        expect(s.name[l].trim(), `${s.id} name ${l}`).not.toBe('');
        expect(s.text[l].trim().length, `${s.id} text ${l}`).toBeGreaterThan(5);
      }
    }
  });
});

describe('exam', () => {
  it('builds 30 distinct questions with 4 distinct options including the answer', () => {
    for (const seed of [1, 2, 3, 42, 2026]) {
      const exam = buildExam(seededRandom(seed));
      expect(exam).toHaveLength(EXAM_SIZE);
      expect(new Set(exam.map((q) => q.signId)).size).toBe(EXAM_SIZE);
      for (const q of exam) {
        expect(q.options).toHaveLength(4);
        expect(new Set(q.options).size).toBe(4);
        expect(q.options).toContain(q.signId);
      }
    }
  });

  it('is reproducible with the same seed and limited to the pool', () => {
    expect(buildExam(seededRandom(7))).toEqual(buildExam(seededRandom(7)));
    const pool = SIGNS.slice(0, 5);
    const exam = buildExam(seededRandom(3), EXAM_SIZE, pool);
    expect(exam).toHaveLength(5);
    for (const q of exam) expect(pool.map((s) => s.id)).toContain(q.signId);
  });

  it('passes at 90 % (27 of 30)', () => {
    expect(passMark(30)).toBe(27);
    expect(passMark(10)).toBe(9);
    const exam = buildExam(seededRandom(5));
    const all = Object.fromEntries(exam.map((q, i) => [i, q.signId]));
    expect(grade(exam, all)).toMatchObject({ correct: 30, percent: 100, passed: true, mistakes: [] });
    const three = { ...all };
    delete three[0];
    delete three[1];
    three[2] = exam[2].options.find((o) => o !== exam[2].signId)!;
    expect(grade(exam, three)).toMatchObject({ correct: 27, passed: true });
    delete three[3];
    const r = grade(exam, three);
    expect(r).toMatchObject({ correct: 26, passed: false });
    expect(r.mistakes).toEqual([exam[0].signId, exam[1].signId, exam[2].signId, exam[3].signId]);
  });
});
