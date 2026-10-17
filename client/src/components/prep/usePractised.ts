import { useCallback, useState } from 'react';

const STORAGE_KEY = 'tv.interviewPrep.practised.v1';

const load = (): string[] => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const v: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

const save = (ids: string[]) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Private mode / storage blocked: progress lives for this visit only.
  }
};

/** "I practised this" marks, kept in this browser only. */
export const usePractised = () => {
  const [ids, setIds] = useState<Set<string>>(() => new Set(load()));

  const toggle = useCallback((id: string, on: boolean) => {
    setIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      save([...next]);
      return next;
    });
  }, []);

  const reset = useCallback((only: string[]) => {
    setIds((prev) => {
      const next = new Set(prev);
      only.forEach((id) => next.delete(id));
      save([...next]);
      return next;
    });
  }, []);

  return { practised: ids, toggle, reset };
};
