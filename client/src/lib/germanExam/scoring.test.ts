import { describe, expect, it } from 'vitest';
import { A1_SET_1 } from './sets/a1Set1';
import { B1_SET_1 } from './sets/b1Set1';
import { emptyAnswers, examOutcome, formFieldCorrect, grade, mistakes, moduleRaw, moduleResult, modulePoints, normalizeAnswer, partScore, rubricIds, secondsLeft, type ExamAnswers } from './scoring';
import { clearModule, countWords, emptySaved, expireDeadlines, sanitizeSaved } from './progress';
import { pickVoice, VOICE_PROFILES } from './voices';
import type { ChoicePart, ExamModule, ExamSet, ModuleKey } from './types';

const mod = (s: ExamSet, k: ModuleKey) => s.modules.find((m) => m.key === k)!;

/** All choice questions of a module answered correctly (or the first `n` correctly and the rest wrongly). */
const answerChoices = (m: ExamModule, correct = Infinity) => {
  const a = emptyAnswers();
  let i = 0;
  for (const p of m.parts)
    if (p.type === 'choice')
      for (const q of p.questions) {
        a.choice[q.id] = i < correct ? q.answer : (q.answer + 1) % q.options.length;
        i += 1;
      }
  return a;
};

const tickAll = (m: ExamModule, a: ExamAnswers = emptyAnswers()) => {
  for (const p of m.parts) if (p.type === 'writing' || p.type === 'speaking') a.rubric[p.id] = rubricIds(p.rubric);
  return a;
};

describe('B1 conversion (official table, raw × 3.33 rounded)', () => {
  // Durchführungsbestimmungen B1, 4.1 / 4.2: Messpunkte → Ergebnispunkte.
  const TABLE: [number, number][] = [
    [30, 100], [29, 97], [28, 93], [27, 90], [26, 87], [25, 83], [24, 80], [23, 77], [22, 73], [21, 70],
    [20, 67], [19, 63], [18, 60], [17, 57], [16, 53], [15, 50], [14, 47], [13, 43], [12, 40], [11, 37],
    [10, 33], [9, 30], [8, 27], [7, 23], [6, 20], [5, 17], [4, 13], [3, 10], [2, 7], [1, 3], [0, 0],
  ];
  it.each(TABLE)('%i raw points → %i', (raw, points) => expect(modulePoints('b1', raw, 30)).toBe(points));

  it('passes a B1 module from 60 points: 18 of 30 items', () => {
    const lesen = mod(B1_SET_1, 'lesen');
    expect(moduleResult('b1', lesen, answerChoices(lesen, 18)).passed).toBe(true);
    expect(moduleResult('b1', lesen, answerChoices(lesen, 17)).passed).toBe(false);
  });

  it('scores B1 writing and speaking out of 100 from the rubric', () => {
    const s = mod(B1_SET_1, 'schreiben');
    expect(moduleResult('b1', s, tickAll(s))).toMatchObject({ raw: 100, points: 100, passed: true });
    expect(moduleResult('b1', s, emptyAnswers())).toMatchObject({ raw: 0, points: 0, passed: false });
  });

  it('needs every B1 module passed for an overall pass', () => {
    const done = { lesen: { raw: 30, max: 30 }, hoeren: { raw: 18, max: 30 }, schreiben: { raw: 60, max: 100 }, sprechen: { raw: 59, max: 100 } };
    expect(examOutcome('b1', B1_SET_1.modules, done)).toMatchObject({ total: null, passed: false });
    expect(examOutcome('b1', B1_SET_1.modules, { ...done, sprechen: { raw: 60, max: 100 } }).passed).toBe(true);
    expect(examOutcome('b1', B1_SET_1.modules, { lesen: done.lesen }).passed).toBeNull();
  });
});

describe('A1 total (raw × 1.66, pass from 60 of 100)', () => {
  it('gives 100 for all 60 raw points and 60 at 36 raw points', () => {
    const all = Object.fromEntries(A1_SET_1.modules.map((m) => [m.key, { raw: 15, max: 15 }]));
    expect(examOutcome('a1', A1_SET_1.modules, all)).toMatchObject({ total: 100, passed: true });
    const pass = { hoeren: { raw: 9, max: 15 }, lesen: { raw: 9, max: 15 }, schreiben: { raw: 9, max: 15 }, sprechen: { raw: 9, max: 15 } };
    expect(examOutcome('a1', A1_SET_1.modules, pass)).toMatchObject({ total: 60, passed: true });
    const fail = { ...pass, sprechen: { raw: 8, max: 15 } };
    expect(examOutcome('a1', A1_SET_1.modules, fail)).toMatchObject({ total: 58, passed: false });
  });

  it('has no total until all four parts are taken', () => {
    expect(examOutcome('a1', A1_SET_1.modules, { hoeren: { raw: 15, max: 15 } })).toMatchObject({ total: null, passed: null });
  });

  it('can pass overall with a weak part (the per-part badge is only an orientation)', () => {
    const r = examOutcome('a1', A1_SET_1.modules, { hoeren: { raw: 15, max: 15 }, lesen: { raw: 15, max: 15 }, schreiben: { raw: 4, max: 15 }, sprechen: { raw: 4, max: 15 } });
    expect(r.passed).toBe(true);
    expect(r.modules.find((m) => m.key === 'schreiben')!.passed).toBe(false);
  });

  it('shows A1 module points out of 25', () => {
    expect(modulePoints('a1', 15, 15)).toBe(24.9);
    expect(modulePoints('a1', 10, 15)).toBe(16.6);
  });
});

describe('objective scoring', () => {
  it('counts correct choice answers and lists the mistakes', () => {
    const h = mod(A1_SET_1, 'hoeren');
    const a = answerChoices(h, 10);
    expect(moduleRaw(h, a)).toBe(10);
    expect(mistakes(h, a)).toHaveLength(5);
    expect(mistakes(h, answerChoices(h)).length).toBe(0);
    // Unanswered counts as a mistake.
    expect(mistakes(h, emptyAnswers())).toHaveLength(15);
  });

  it('accepts form answers case- and umlaut-insensitively', () => {
    const form = mod(A1_SET_1, 'schreiben').parts[0];
    if (form.type !== 'form') throw new Error('form expected');
    const f = (id: string) => form.fields.find((x) => x.id.endsWith(id))!;
    expect(formFieldCorrect(f('f4'), 'fussball')).toBe(true);
    expect(formFieldCorrect(f('f4'), ' Fußball. ')).toBe(true);
    expect(formFieldCorrect(f('f5'), 'ueberweisung')).toBe(true);
    expect(formFieldCorrect(f('f5'), 'bar')).toBe(false);
    expect(formFieldCorrect(f('f1'), '')).toBe(false);
    expect(normalizeAnswer('  50674,  Köln ')).toBe('50674 köln');
    const a = emptyAnswers();
    a.form[f('f1').id] = '28';
    a.form[f('f2').id] = 'aserbaidschan';
    expect(partScore(form, a)).toBe(2);
  });

  it('sums ticked rubric lines (repeated keys stay separate)', () => {
    const w = mod(A1_SET_1, 'schreiben').parts[1];
    if (w.type !== 'writing') throw new Error('writing expected');
    const ids = rubricIds(w.rubric);
    expect(new Set(ids).size).toBe(ids.length);
    const a = emptyAnswers();
    a.rubric[w.id] = [ids[0], ids[1]];
    expect(partScore(w, a)).toBe(4);
  });

  it('maps points to the official grades', () => {
    expect([100, 90, 89, 80, 79, 70, 69, 60, 59, 0].map(grade)).toEqual(['veryGood', 'veryGood', 'good', 'good', 'satisfactory', 'satisfactory', 'sufficient', 'sufficient', 'fail', 'fail']);
  });

  it('counts down the module timer', () => {
    expect(secondsLeft(10_000, 0)).toBe(10);
    expect(secondsLeft(10_000, 9_001)).toBe(1);
    expect(secondsLeft(10_000, 20_000)).toBe(0);
  });
});

describe('progress', () => {
  it('drops broken stored data', () => {
    expect(sanitizeSaved(null)).toEqual(emptySaved());
    expect(sanitizeSaved({ v: 2 })).toEqual(emptySaved());
    const s = sanitizeSaved({ v: 1, answers: { choice: { a: 1, b: 'x' }, form: { f: 'Köln', g: 3 }, rubric: { p: ['x', 2] } }, texts: { t: 'Hallo' }, plays: { s: 1 }, transcripts: ['s', 4], done: { lesen: '2026-11-16' }, deadlines: { hoeren: 5 } });
    expect(s.answers).toEqual({ choice: { a: 1 }, form: { f: 'Köln' }, rubric: { p: ['x'] } });
    expect(s.transcripts).toEqual(['s']);
    expect(s.done).toEqual({ lesen: '2026-11-16' });
  });

  it('clears one module and keeps the others', () => {
    const h = mod(A1_SET_1, 'hoeren');
    const l = mod(A1_SET_1, 'lesen');
    const first = (h.parts[0] as ChoicePart).questions[0].id;
    const other = (l.parts[0] as ChoicePart).questions[0].id;
    const sid = (h.parts[0] as ChoicePart).stimuli[0].id;
    const s = { ...emptySaved(), answers: { choice: { [first]: 1, [other]: 0 }, form: {}, rubric: {} }, plays: { [sid]: 2 }, done: { hoeren: 'x', lesen: 'y' }, deadlines: { hoeren: 1 } };
    const c = clearModule(s, h);
    expect(c.answers.choice).toEqual({ [other]: 0 });
    expect(c.plays).toEqual({});
    expect(c.done).toEqual({ lesen: 'y' });
    expect(c.deadlines).toEqual({});
  });

  it('marks modules whose time ran out as done', () => {
    const s = { ...emptySaved(), deadlines: { hoeren: 1000, lesen: 5000 } };
    const e = expireDeadlines(s, 2000);
    expect(Object.keys(e.done)).toEqual(['hoeren']);
    expect(e.deadlines).toEqual({ lesen: 5000 });
    expect(expireDeadlines(e, 2000)).toBe(e);
  });

  it('counts words', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('  Liebe Julia,\n ich  habe  Geburtstag ')).toBe(5);
  });
});

describe('voices', () => {
  const voices = [
    { name: 'Microsoft Katja - German (Germany)', lang: 'de-DE' },
    { name: 'Microsoft Conrad - German (Germany)', lang: 'de-DE' },
    { name: 'Google Deutsch', lang: 'de-DE' },
    { name: 'Google US English', lang: 'en-US' },
  ];
  it('picks a German voice of the speaker’s gender when one exists', () => {
    expect(pickVoice(voices, VOICE_PROFILES.m1)?.name).toContain('Conrad');
    expect(pickVoice(voices, VOICE_PROFILES.w1)?.name).toContain('Katja');
  });
  it('falls back to any German voice, or null without one', () => {
    expect(pickVoice([{ name: 'Anna', lang: 'de-DE' }], VOICE_PROFILES.m2)?.name).toBe('Anna');
    expect(pickVoice([{ name: 'Samantha', lang: 'en-US' }], VOICE_PROFILES.w1)).toBeNull();
  });
});
