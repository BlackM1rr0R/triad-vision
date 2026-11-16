import { describe, expect, it } from 'vitest';
import { EXAM_SETS, findSet, setsOf } from './sets';
import { moduleMax, partMax } from './scoring';
import { VOICE_PROFILES } from './voices';
import type { ChoicePart, ExamSet, ModuleKey } from './types';
import { pagesMockExam } from '@/i18n/pagesMockExam';

const LANGS = ['az', 'de', 'en', 'ru', 'tr', 'uk'] as const;
const RF = ['Richtig', 'Falsch'];

/** Official module structure (Goethe-Institut, Durchführungsbestimmungen, Stand 1 Sept 2023). */
const SPEC: Record<'a1' | 'b1', { order: ModuleKey[]; parts: Record<ModuleKey, number>; minutes: Record<ModuleKey, number>; max: Record<ModuleKey, number> }> = {
  a1: {
    order: ['hoeren', 'lesen', 'schreiben', 'sprechen'],
    parts: { hoeren: 3, lesen: 3, schreiben: 2, sprechen: 3 },
    minutes: { hoeren: 20, lesen: 25, schreiben: 20, sprechen: 15 },
    max: { hoeren: 15, lesen: 15, schreiben: 15, sprechen: 15 },
  },
  b1: {
    order: ['lesen', 'hoeren', 'schreiben', 'sprechen'],
    parts: { lesen: 5, hoeren: 4, schreiben: 3, sprechen: 3 },
    minutes: { lesen: 65, hoeren: 40, schreiben: 60, sprechen: 15 },
    max: { lesen: 30, hoeren: 30, schreiben: 100, sprechen: 100 },
  },
};

const choiceParts = (s: ExamSet) => s.modules.flatMap((m) => m.parts.filter((p): p is ChoicePart => p.type === 'choice'));
const allIds = (s: ExamSet) =>
  s.modules.flatMap((m) =>
    m.parts.flatMap((p) => [
      p.id,
      ...(p.type === 'choice' ? [...p.questions.map((q) => q.id), ...p.stimuli.map((x) => x.id)] : []),
      ...(p.type === 'form' ? p.fields.map((f) => f.id) : []),
    ]),
  );

describe('mock exam sets', () => {
  it('has at least one complete A1 and one complete B1 set, findable by level and id', () => {
    expect(setsOf('a1').length).toBeGreaterThanOrEqual(1);
    expect(setsOf('b1').length).toBeGreaterThanOrEqual(1);
    expect(findSet('a1', 'nope').level).toBe('a1');
    expect(findSet('b1', 'b1-1').id).toBe('b1-1');
  });

  it('uses unique ids across all sets', () => {
    const ids = EXAM_SETS.flatMap((s) => [s.id, ...allIds(s)]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const set of EXAM_SETS) {
    describe(set.id, () => {
      const spec = SPEC[set.level];

      it('follows the official module order, part counts, times and raw maxima', () => {
        expect(set.modules.map((m) => m.key)).toEqual(spec.order);
        for (const m of set.modules) {
          expect(m.parts.length, m.key).toBe(spec.parts[m.key]);
          expect(m.minutes, m.key).toBe(spec.minutes[m.key]);
          expect(moduleMax(m), m.key).toBe(spec.max[m.key]);
        }
        if (set.level === 'a1') {
          // Schreiben Teil 1: 5, Teil 2: 10; Sprechen 3 + 6 + 6.
          const s = set.modules.find((m) => m.key === 'schreiben')!;
          expect(s.parts.map(partMax)).toEqual([5, 10]);
          const sp = set.modules.find((m) => m.key === 'sprechen')!;
          expect(sp.parts.map(partMax)).toEqual([3, 6, 6]);
        } else {
          expect(set.modules.find((m) => m.key === 'sprechen')!.prepMinutes).toBe(15);
        }
      });

      it('gives every question exactly one correct answer among unique options', () => {
        for (const p of choiceParts(set)) {
          for (const q of p.questions) {
            expect(q.options.length, q.id).toBeGreaterThanOrEqual(2);
            expect(new Set(q.options).size, q.id).toBe(q.options.length);
            expect(Number.isInteger(q.answer), q.id).toBe(true);
            expect(q.answer, q.id).toBeGreaterThanOrEqual(0);
            expect(q.answer, q.id).toBeLessThan(q.options.length);
            expect(q.prompt.trim(), q.id).not.toBe('');
          }
        }
      });

      it('proves every answer with a sentence that appears verbatim in the text, script or options', () => {
        for (const p of choiceParts(set)) {
          const corpus = [...p.stimuli.map((s) => s.text ?? ''), ...p.stimuli.flatMap((s) => (s.audio ?? []).map((l) => l.text))].join('\n');
          for (const q of p.questions) {
            expect(q.evidence.trim().length, q.id).toBeGreaterThan(3);
            const inSource = corpus.includes(q.evidence) || q.options[q.answer].includes(q.evidence);
            expect(inSource, `${q.id}: «${q.evidence}»`).toBe(true);
            // The question's stimulus exists in its part.
            expect(p.stimuli.some((s) => s.id === q.stimulus), q.id).toBe(true);
          }
        }
      });

      it('has an audio script for every listening clip and a text for every reading text', () => {
        for (const m of set.modules) {
          for (const p of m.parts) {
            if (p.type !== 'choice') continue;
            for (const s of p.stimuli) {
              if (m.key === 'hoeren') {
                expect(s.audio?.length, s.id).toBeGreaterThan(0);
                for (const l of s.audio!) {
                  expect(l.text.trim(), s.id).not.toBe('');
                  expect(VOICE_PROFILES[l.voice], s.id).toBeDefined();
                }
              } else {
                expect(s.text?.trim(), s.id).toBeTruthy();
              }
            }
            if (m.key === 'hoeren') expect([1, 2], p.id).toContain(p.plays);
            else expect(p.plays, p.id).toBeUndefined();
            // Every clip / text is used by at least one question (shared pools: distractors allowed).
            if (!p.shared) for (const s of p.stimuli) expect(p.questions.some((q) => q.stimulus === s.id), s.id).toBe(true);
          }
        }
      });

      it('uses consistent answer formats (Richtig/Falsch, matching uses each ad at most once)', () => {
        for (const p of choiceParts(set)) {
          for (const q of p.questions) if (q.options.includes('Richtig')) expect(q.options, q.id).toEqual(RF);
          if (p.shared && p.questions[0].options.includes('0')) {
            const used = p.questions.map((q) => q.options[q.answer]).filter((o) => o !== '0');
            expect(new Set(used).size, p.id).toBe(used.length);
            expect(p.questions.some((q) => q.options[q.answer] === '0'), p.id).toBe(true);
            // Each answer letter matches the title of the ad it points to.
            for (const q of p.questions) {
              const letter = q.options[q.answer];
              if (letter !== '0') expect(p.stimuli.find((s) => s.id === q.stimulus)?.title, q.id).toBe(letter);
            }
          }
        }
      });

      it('has a balanced key (no part answered by one option only)', () => {
        for (const p of choiceParts(set)) {
          if (p.questions.length < 4 || p.shared) continue;
          const answers = new Set(p.questions.map((q) => q.options[q.answer]));
          expect(answers.size, p.id).toBeGreaterThan(1);
        }
      });

      it('has model answers, content points and rubrics for writing and speaking, and accepted answers for forms', () => {
        for (const m of set.modules) {
          for (const p of m.parts) {
            if (p.type === 'writing') {
              expect(p.model.split(/\s+/).length, p.id).toBeGreaterThanOrEqual(p.words * 0.8);
              expect(p.points.length, p.id).toBeGreaterThanOrEqual(2);
              expect(p.rubric.length, p.id).toBeGreaterThan(2);
            }
            if (p.type === 'speaking') {
              expect(p.cards.length, p.id).toBeGreaterThan(1);
              expect(p.phrases.length, p.id).toBeGreaterThan(2);
            }
            if (p.type === 'form') for (const f of p.fields) expect(f.accept.length, f.id).toBeGreaterThan(0);
            if (p.type === 'writing' || p.type === 'speaking') for (const r of p.rubric) expect(r.points, p.id).toBeGreaterThan(0);
          }
        }
      });

      it('has UI texts for every hint and rubric line in all six languages', () => {
        for (const m of set.modules) {
          for (const p of m.parts) {
            for (const l of LANGS) {
              const copy = pagesMockExam[l].mockExam;
              expect((copy.hints as Record<string, string>)[p.hint], `${l} hint ${p.hint}`).toBeTruthy();
              if (p.type === 'writing' || p.type === 'speaking') for (const r of p.rubric) expect((copy.rubric as Record<string, string>)[r.key], `${l} rubric ${r.key}`).toBeTruthy();
            }
          }
        }
      });
    });
  }
});

describe('mock exam i18n', () => {
  it('has the same keys in all six languages', () => {
    const keys = (o: unknown, prefix = ''): string[] =>
      o && typeof o === 'object' ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => keys(v, `${prefix}${k}.`)) : [prefix.slice(0, -1)];
    const en = keys(pagesMockExam.en).sort();
    for (const l of LANGS) expect(keys(pagesMockExam[l]).sort(), l).toEqual(en);
  });
});
