export type Dict = { [key: string]: unknown };

const isPlainObject = (v: unknown): v is Dict => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Deep-merges translation dictionaries: later sources win, nested objects merge,
 * arrays and strings are replaced as a whole. Inputs are never mutated.
 */
export const deepMerge = (...sources: (Dict | undefined)[]): Dict => {
  const out: Dict = {};
  for (const src of sources) {
    if (!src) continue;
    for (const [key, value] of Object.entries(src)) {
      const prev = out[key];
      out[key] = isPlainObject(prev) && isPlainObject(value) ? deepMerge(prev, value) : isPlainObject(value) ? deepMerge(value) : value;
    }
  }
  return out;
};

export const SUPPORTED = ['az', 'de', 'en', 'ru'] as const;
export type Lang = (typeof SUPPORTED)[number];

/** Picks the first supported language from device locale tags like "de-DE", "ru", "az-Latn-AZ". Defaults to az. */
export const pickLanguage = (tags: (string | null | undefined)[], fallback: Lang = 'az'): Lang => {
  for (const tag of tags) {
    const code = tag?.slice(0, 2).toLowerCase();
    if (code && (SUPPORTED as readonly string[]).includes(code)) return code as Lang;
  }
  return fallback;
};
