import { describe, expect, it } from 'vitest';

/**
 * Hydration guard (lib/ssr.ts): server-rendered public components must not read localStorage in a useState
 * initialiser — the server renders the empty default, a returning visitor's browser the stored value, and React
 * throws the markup away (React #418, QA PUB-5). They load stored values in a useEffect after mount instead.
 */
const SOURCES = import.meta.glob<string>(['../pages/tools/Cities.tsx', '../components/tools/DocChecklist.tsx'], {
  eager: true,
  query: '?raw',
  import: 'default',
});

describe('no localStorage read while hydrating', () => {
  it('covers the files', () => expect(Object.keys(SOURCES).length).toBe(2));
  it.each(Object.entries(SOURCES))('%s', (_file, src) => {
    const initialisers = [...src.matchAll(/useState(?:<[^>]*>)?\((.*)$/gm)].map((m) => m[1]);
    for (const init of initialisers) expect(init).not.toMatch(/\b(load|read)[A-Za-z]*\b|localStorage/);
  });
});
