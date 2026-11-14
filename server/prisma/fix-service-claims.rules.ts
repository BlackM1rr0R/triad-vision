/**
 * Pure logic of fix-service-claims.ts (no database access, unit-tested in tests/unit/fixServiceClaims.test.ts).
 *
 * Business decision 2026-11-14: Triad Vision does not do apostilles or translations, and it does not book embassy
 * appointments (we prepare and give the client the complete embassy document set; the client applies, the embassy
 * gives the appointment and the decision). The seeds were reworded; these rules carry the change over to rows that
 * already exist in a database, touching only text that still holds the old seeded wording.
 *
 * Rules for one fix { old, new }:
 * - a long `old` (≥ MIN_SUBSTRING characters) is replaced wherever it occurs inside a string;
 * - a short `old` (a title, a list item) only replaces a string that is exactly `old`, so a short phrase inside
 *   an owner-written text is never rewritten;
 * - `new: null` removes an array item that is exactly `old`; anywhere else it only flags the place for review;
 * - idempotent: an occurrence of `old` that is part of an occurrence of `new` (when `new` extends `old`) is left
 *   alone, so a second run changes nothing.
 */

export type FixModel = 'Service' | 'Faq' | 'GuidePage' | 'ContractTemplate' | 'TrainingLesson' | 'AutomationRule' | 'Setting';

export interface TextFix {
  model: FixModel;
  /** Service slug, AutomationRule exampleKey or Setting key; omitted = every row of the model. */
  where?: string;
  old: string;
  new: string | null;
  /**
   * Language alternatives of one text (an example automation rule is created once, in one language): the fixes of
   * a group count as found when one of them is found.
   */
  group?: string;
}

export const MIN_SUBSTRING = 30;

export interface IndexedFix {
  index: number;
  fix: TextFix;
}

export interface ValueChange {
  /** JSON path inside the field ('' = the field itself), e.g. "az", "de[2]", "catalogue[1].name". */
  path: string;
  fix: number;
  action: 'replaced' | 'removed-item';
}

export interface ValueFlag {
  path: string;
  fix: number;
  reason: string;
}

export interface FixResult {
  value: unknown;
  changed: boolean;
  changes: ValueChange[];
  flags: ValueFlag[];
  /** Fixes whose new wording is already there (applied before, or by hand). */
  present: Set<number>;
}

const isLong = (s: string) => s.length >= MIN_SUBSTRING;

/** Replaces every `old` that is not part of an occurrence of `neu`. */
export const replaceOutsideNew = (s: string, old: string, neu: string): string => {
  if (!old) return s;
  if (!neu.includes(old)) return s.split(old).join(neu);
  return s
    .split(neu)
    .map((part) => part.split(old).join(neu))
    .join(neu);
};

const fixString = (s: string, fixes: readonly IndexedFix[], path: string, out: FixResult): string => {
  let v = s;
  for (const { index, fix } of fixes) {
    if (fix.new === null) {
      // Only an exact array item can be removed (handled by the caller); here the text is merely flagged.
      if (isLong(fix.old) ? v.includes(fix.old) : v === fix.old) out.flags.push({ path, fix: index, reason: 'old wording inside a text, not a list item: remove by hand' });
      continue;
    }
    if (isLong(fix.old)) {
      if (v.includes(fix.new)) out.present.add(index);
      const next = replaceOutsideNew(v, fix.old, fix.new);
      if (next !== v) {
        v = next;
        out.changes.push({ path, fix: index, action: 'replaced' });
        out.present.add(index);
      }
    } else if (v === fix.old) {
      v = fix.new;
      out.changes.push({ path, fix: index, action: 'replaced' });
      out.present.add(index);
    } else if (v === fix.new) {
      out.present.add(index);
    }
  }
  return v;
};

const walk = (value: unknown, fixes: readonly IndexedFix[], path: string, out: FixResult): unknown => {
  if (typeof value === 'string') return fixString(value, fixes, path, out);
  if (Array.isArray(value)) {
    const next: unknown[] = [];
    value.forEach((item, i) => {
      const p = `${path}[${i}]`;
      if (typeof item === 'string') {
        const removal = fixes.find(({ fix }) => fix.new === null && item === fix.old);
        if (removal) {
          out.changes.push({ path: p, fix: removal.index, action: 'removed-item' });
          return;
        }
      }
      next.push(walk(item, fixes, p, out));
    });
    return next;
  }
  if (value && typeof value === 'object') {
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) next[k] = walk(v, fixes, path ? `${path}.${k}` : k, out);
    return next;
  }
  return value;
};

/** Applies the fixes to a string or a JSON value (L10n object, L10n list, settings object …). */
export const applyFixes = (value: unknown, fixes: readonly IndexedFix[]): FixResult => {
  const out: FixResult = { value, changed: false, changes: [], flags: [], present: new Set() };
  if (!fixes.length) return out;
  out.value = walk(value, fixes, '', out);
  out.changed = out.changes.length > 0;
  return out;
};

/** The fixes for one row: same model, and `where` (if any) equal to the row's slug / exampleKey / key. */
export const fixesFor = (all: readonly TextFix[], model: FixModel, rowKey?: string | null): IndexedFix[] =>
  all.flatMap((fix, index) => (fix.model === model && (!fix.where || fix.where === rowKey) ? [{ index, fix }] : []));

// ─── Review scan ──────────────────────────────────────────────────────────────────────────────────────────

/**
 * Words that may still describe apostille / translation or an embassy appointment after the fixes. A hit is
 * not necessarily wrong (a guide may state that the embassy needs an apostille); it lists the place for a
 * human check. Only the category names are printed, never the text.
 */
export const REVIEW_PATTERNS: Record<string, RegExp> = {
  apostille: /apostil|апостил/i,
  translation: /tərcümə|übersetz|translat|перевод|переклад|tercüme|çeviri|notari|нотари|beglaubig|beeidig|sworn/i,
  embassyAppointment:
    /botschaftstermin|terminvereinbarung|termin (bei|in) der botschaft|embassy appointment|appointment at the embassy|səfirlik görüş|səfirlik növbə|запис\S* (в|на|до) (посольств|при[её]м|прийом)|büyükelçilik randevu|konsolosluk randevu/i,
};

/**
 * "We / our" in the six languages (incl. Azerbaijani and Turkish first-person plural verb endings). A sentence with
 * one of these next to a review word may still describe apostille / translation / the appointment as our work.
 */
export const FIRST_PERSON =
  /\b(we|our|us|wir|unser\w*|uns)\b|(^|[^\p{L}])(biz|bizim|bizə|мы|наш\p{L}*|нами|нас|ми|нам)([^\p{L}]|$)|\p{L}(ırıq|irik|uruq|ürük|arıq|ərik|yırıq|yirik|ıyoruz|iyoruz|uyoruz|üyoruz|ırız|iriz|arız|eriz)([^\p{L}]|$)|triad vision/iu;

/** The new wording: the client has it done / applies themselves. Such a sentence is not a claim. */
export const CLIENT_DOES_IT = /özünüz|özü edir|selbst|yourself|themselves|самостоятельно|самостійно|(^|[^\p{L}])(сами|самі|сам)([^\p{L}]|$)|kendiniz|kendisi/iu;

const strings = (value: unknown, out: string[] = []): string[] => {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => strings(v, out));
  return out;
};

/** Review categories found anywhere in the value. */
export const reviewHits = (value: unknown): string[] => {
  const hits = new Set<string>();
  for (const s of strings(value)) for (const [name, re] of Object.entries(REVIEW_PATTERNS)) if (re.test(s)) hits.add(name);
  return [...hits];
};

/** Review categories found in a sentence that also says "we / our" — the likely leftover claims. */
export const claimHits = (value: unknown): string[] => {
  const hits = new Set<string>();
  for (const s of strings(value))
    for (const sentence of s.split(/(?<=[.!?;:])\s+|\n+/))
      if (FIRST_PERSON.test(sentence) && !CLIENT_DOES_IT.test(sentence)) for (const [name, re] of Object.entries(REVIEW_PATTERNS)) if (re.test(sentence)) hits.add(name);
  return [...hits];
};

/** A slug / key that names a page or package that only sells apostille or translation. */
export const SALES_ONLY_SLUG = /apostil|translat|ubersetz|uebersetz|übersetz|tercume|tercüme|tərcümə|perevod|pereklad|ceviri|çeviri|notar/i;

export const isSalesOnlySlug = (slug: string | null | undefined) => !!slug && SALES_ONLY_SLUG.test(slug);

// ─── Setting "quotes" ─────────────────────────────────────────────────────────────────────────────────────

/** The catalogue item the quote settings shipped with for translation work. */
export const QUOTE_TRANSLATION_ITEM = { id: 'translation', name: 'Übersetzung und Beglaubigung von Dokumenten' } as const;

/**
 * Deactivates (never deletes) the shipped translation item of a saved quote catalogue, only while it still has
 * its shipped name. Returns null when nothing changes.
 */
export const deactivateQuoteTranslationItem = (value: unknown): { value: unknown; path: string } | null => {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { catalogue?: unknown }).catalogue)) return null;
  const catalogue = (value as { catalogue: unknown[] }).catalogue;
  const i = catalogue.findIndex((it) => {
    const item = it as { id?: unknown; name?: unknown; active?: unknown };
    return item && item.id === QUOTE_TRANSLATION_ITEM.id && item.name === QUOTE_TRANSLATION_ITEM.name && item.active !== false;
  });
  if (i < 0) return null;
  const next = catalogue.map((it, j) => (j === i ? { ...(it as object), active: false } : it));
  return { value: { ...(value as object), catalogue: next }, path: `catalogue[${i}].active` };
};
