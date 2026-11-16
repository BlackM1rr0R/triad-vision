/**
 * All mock exam sets. To add a set: write sets/<level>Set<n>.ts (same shape as a1Set1 / b1Set1) and append it
 * here; the page lists every set of a level (?set=<id>) and sets.test.ts validates it.
 */
import type { ExamLevel, ExamSet } from '../types';
import { A1_SET_1 } from './a1Set1';
import { B1_SET_1 } from './b1Set1';

export const EXAM_SETS: ExamSet[] = [A1_SET_1, B1_SET_1];

export const setsOf = (level: ExamLevel) => EXAM_SETS.filter((s) => s.level === level);

/** The set with this id at this level, else the level's first set. */
export const findSet = (level: ExamLevel, id: string | null | undefined): ExamSet => {
  const list = setsOf(level);
  return list.find((s) => s.id === id) ?? list[0];
};
