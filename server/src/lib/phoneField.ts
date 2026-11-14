import { badRequest } from './http.js';
import { parsePhone, type PhoneCountry } from './phone.js';

/**
 * Value to store for a phone field of a form (profile, admin dialogs):
 *  - undefined (field not sent) → undefined (column untouched);
 *  - null / "" → null (cleared);
 *  - the stored value sent back unchanged → kept as it is, even when it is a legacy value the
 *    normaliser cannot read (saving a profile without touching the phone must keep working);
 *  - anything else → the normalised number, or 400 INVALID_PHONE.
 */
export const phoneInput = (input: string | null | undefined, opts: { current?: string | null; country?: PhoneCountry | null } = {}): string | null | undefined => {
  if (input === undefined) return undefined;
  const v = (input ?? '').trim();
  if (!v) return null;
  if (opts.current != null && v === opts.current.trim()) return opts.current;
  const r = parsePhone(v, { country: opts.country });
  if (!r.ok) throw badRequest('INVALID_PHONE', r.reason);
  return r.value;
};

export type PhoneMigrationRow = { id: string; phone: string | null; role?: string | null; country?: PhoneCountry | null };

export type PhoneMigrationPlan = {
  /** Rows whose stored value changes (from → to). */
  updates: { id: string; from: string; to: string }[];
  /** Already normalised (or empty) rows: nothing to do. */
  unchanged: number;
  /** Values the normaliser cannot read unambiguously: left exactly as they are, listed for staff to fix by hand. */
  flagged: { id: string; value: string; reason: string }[];
};

/**
 * Plans the one-off normalisation of stored phone numbers (prisma/normalize-phones.ts). Pure, so it is
 * unit-tested; running it twice gives no updates the second time (normalised values are fixed points).
 */
export const planPhoneMigration = (rows: PhoneMigrationRow[]): PhoneMigrationPlan => {
  const plan: PhoneMigrationPlan = { updates: [], unchanged: 0, flagged: [] };
  for (const row of rows) {
    if (row.phone == null || !row.phone.trim()) {
      plan.unchanged++;
      continue;
    }
    const r = parsePhone(row.phone, { country: row.country ?? null });
    if (!r.ok) plan.flagged.push({ id: row.id, value: row.phone, reason: r.reason });
    else if (r.value === row.phone) plan.unchanged++;
    else plan.updates.push({ id: row.id, from: row.phone, to: r.value });
  }
  return plan;
};
