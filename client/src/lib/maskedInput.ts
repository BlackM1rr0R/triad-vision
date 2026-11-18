/**
 * Forms that loaded masked values ("••••", "•••• 3456" — server lib/privacy/mask.ts): a masked value must never be
 * sent back as if it were the new value. The server drops such values too (maskResponses → stripMaskedInput); this
 * keeps the request clean on the client side as well, so an unchanged masked field simply is not part of the save.
 */

/** Same rule as the server: a masked value contains the mask character. */
export const isMasked = (v: unknown): v is string => typeof v === 'string' && v.includes('•');

/** A copy of a flat request body without the fields whose value is still masked. */
export const dropMasked = <T extends Record<string, unknown>>(body: T): Partial<T> => {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(body) as [keyof T, T[keyof T]][]) if (!isMasked(v)) out[k] = v;
  return out;
};

/** Field names of `body` that are still masked (to tell the user which values stay as stored). */
export const maskedKeys = (body: Record<string, unknown>) => Object.keys(body).filter((k) => isMasked(body[k]));
