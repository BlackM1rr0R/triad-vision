import { useCallback, useState } from 'react';

/** "I knew it" / "practise again" marks of the interview flip cards, kept in this browser only. */
export type FlipMark = 'knew' | 'again';
export type FlipMarks = Record<string, FlipMark>;

export const FLIP_STORAGE_KEY = 'tv.interviewPrep.flipMarks.v1';

/** Cleans whatever is stored (other versions, hand edits) into a valid marks map. */
export const parseMarks = (raw: string | null): FlipMarks => {
  try {
    const v: unknown = raw ? JSON.parse(raw) : {};
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter((e): e is [string, FlipMark] => e[1] === 'knew' || e[1] === 'again'));
  } catch {
    return {};
  }
};

/** New marks with `id` set to `mark` (null removes it). */
export const setMark = (marks: FlipMarks, id: string, mark: FlipMark | null): FlipMarks => {
  const next = { ...marks };
  if (mark) next[id] = mark;
  else delete next[id];
  return next;
};

/** The deck shown: all cards, or only the "practise again" ones — unmarked cards count as "again". */
export const deckOf = <T extends { id: string }>(items: T[], marks: FlipMarks, onlyAgain: boolean) => (onlyAgain ? items.filter((q) => marks[q.id] !== 'knew') : items);

export const countMarks = (ids: string[], marks: FlipMarks) => ({
  knew: ids.filter((id) => marks[id] === 'knew').length,
  again: ids.filter((id) => marks[id] === 'again').length,
});

/** Index after a step of `delta`, wrapping around a deck of `length`. */
export const stepIndex = (index: number, delta: number, length: number) => (length ? (((index + delta) % length) + length) % length : 0);

const load = () => {
  try {
    return parseMarks(window.localStorage.getItem(FLIP_STORAGE_KEY));
  } catch {
    return {};
  }
};

const save = (marks: FlipMarks) => {
  try {
    window.localStorage.setItem(FLIP_STORAGE_KEY, JSON.stringify(marks));
  } catch {
    // Private mode / storage blocked: the marks live for this visit only.
  }
};

export const useFlipMarks = () => {
  const [marks, setMarks] = useState<FlipMarks>(load);
  const mark = useCallback((id: string, m: FlipMark | null) => {
    setMarks((prev) => {
      const next = setMark(prev, id, m);
      save(next);
      return next;
    });
  }, []);
  const reset = useCallback((ids: string[]) => {
    setMarks((prev) => {
      const next = { ...prev };
      ids.forEach((id) => delete next[id]);
      save(next);
      return next;
    });
  }, []);
  return { marks, mark, reset };
};
