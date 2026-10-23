import { open, seal } from '../secretBox.js';

/** A value as stored in FieldChange (JSON): dates as ISO strings, decimals / bigints as strings. */
export const toJsonValue = (v: unknown): unknown => {
  if (v === undefined || v === null) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'bigint') return v.toString();
  // Prisma.Decimal (decimal.js): stored as its string form.
  if (typeof v === 'object' && typeof (v as { toFixed?: unknown }).toFixed === 'function' && 'd' in (v as object)) return String(v);
  return v;
};

const stable = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return Object.fromEntries(Object.keys(o).sort().map((k) => [k, stable(o[k])]));
  }
  return v;
};

export const sameValue = (a: unknown, b: unknown) => JSON.stringify(stable(toJsonValue(a))) === JSON.stringify(stable(toJsonValue(b)));

const ENC = '$enc';

/** Sensitive values are sealed with the server key (lib/secretBox) before they are stored. */
export const sealValue = (v: unknown): unknown => {
  const json = toJsonValue(v);
  return json === null ? null : { [ENC]: seal(JSON.stringify(json)) };
};

/** Plain value of a stored one (sealed or not). A value sealed with another key comes back as null. */
export const openValue = (stored: unknown): unknown => {
  if (stored && typeof stored === 'object' && !Array.isArray(stored) && ENC in (stored as object)) {
    const plain = open(String((stored as Record<string, unknown>)[ENC]));
    if (plain === null) return null;
    try {
      return JSON.parse(plain);
    } catch {
      return null;
    }
  }
  return stored ?? null;
};

/** "•••123": enough to tell two numbers apart, not enough to use one. */
export const maskValue = (v: unknown): string | null => {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v);
  return `•••${s.length > 3 ? s.slice(-3) : ''}`;
};
