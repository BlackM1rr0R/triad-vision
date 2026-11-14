/**
 * Long-form explanatory text under the public tools (salary calculator, Chancenkarte points calculator, Blue Card
 * check, city guide). Plain data in all six site languages, rendered by components/seo/ContentArticle.tsx on the
 * server (SSR) and in the browser alike — so it is in the crawler HTML and hydrates without differences.
 *
 * Keep this folder free of `@/` imports and browser APIs: server/tests/unit/seoContent.test.ts imports it.
 *
 * Inline syntax inside strings: **bold**, [label](/internal-path) (bare path, the router adds the language) and
 * {{var}} placeholders the page fills with computed values (e.g. nets from the payroll engine).
 */

export const CONTENT_LOCALES = ['az', 'de', 'en', 'ru', 'tr', 'uk'] as const;
export type ContentLocale = (typeof CONTENT_LOCALES)[number];

export type Block =
  | string
  | { h3: string }
  | { ul: string[] }
  | { ol: string[] }
  | { table: { head: string[]; rows: string[][] } }
  | { note: string }
  /** Placeholder for a block the page renders itself from live data (e.g. a computed examples table). */
  | { slot: string };

export interface Section {
  /** Stable anchor id (same in every language). */
  id: string;
  h2: string;
  blocks: Block[];
}

export interface Faq {
  q: string;
  a: string;
}

export interface PageContent {
  /** Small label above the first heading. */
  eyebrow: string;
  sections: Section[];
  faqTitle: string;
  faq: Faq[];
  /** "As of" / sources line under the article. */
  sources: string;
  /** Extra labels for slot tables etc. */
  labels?: Record<string, string>;
}

export type LocalizedContent = Record<ContentLocale, PageContent>;

/** Placeholders used in a string ({{name}}). */
export const placeholdersOf = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);

/** Fills {{name}} placeholders; unknown names are left visible so a test catches them. */
export const fill = (s: string, vars: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (all, k: string) => vars[k] ?? all);

/** Every string of a page (for tests and placeholder checks). */
export const allStrings = (c: PageContent): string[] => {
  const out: string[] = [c.eyebrow, c.faqTitle, c.sources, ...Object.values(c.labels ?? {})];
  for (const s of c.sections) {
    out.push(s.h2);
    for (const b of s.blocks) {
      if (typeof b === 'string') out.push(b);
      else if ('h3' in b) out.push(b.h3);
      else if ('ul' in b) out.push(...b.ul);
      else if ('ol' in b) out.push(...b.ol);
      else if ('note' in b) out.push(b.note);
      else if ('table' in b) out.push(...b.table.head, ...b.table.rows.flat());
    }
  }
  for (const f of c.faq) out.push(f.q, f.a);
  return out;
};

/**
 * Deterministic euro formatting per language (no Intl: Chrome ships no "az" ICU data and Node does, which would
 * make the server and browser render different text → hydration mismatch).
 */
export const formatEuro = (n: number, lng: ContentLocale, cents = false) => {
  const fixed = Math.abs(n).toFixed(cents ? 2 : 0);
  const [int, dec] = fixed.split('.');
  const group = lng === 'en' ? ',' : lng === 'de' || lng === 'tr' ? '.' : ' ';
  const decimal = lng === 'en' ? '.' : ',';
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, group);
  const num = `${n < 0 ? '−' : ''}${grouped}${dec ? decimal + dec : ''}`;
  return lng === 'en' ? `€${num}` : `${num} €`;
};

/** Percent in the language's style: "2,9 %" (de/az/ru/uk), "2.9 %" (en), "%2,9" (tr). */
export const formatPercent = (fraction: number, lng: ContentLocale, digits = 1) => {
  const v = (Math.round(fraction * 100 * 10 ** digits) / 10 ** digits).toFixed(digits).replace(/\.0+$/, '');
  const num = lng === 'en' ? v : v.replace('.', ',');
  return lng === 'tr' ? `%${num}` : `${num} %`;
};

/** "November 2026" in each language (the "as of" line). */
export const MONTH_YEAR: Record<ContentLocale, (month: number, year: number) => string> = {
  de: (m, y) => `${['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'][m - 1]} ${y}`,
  en: (m, y) => `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m - 1]} ${y}`,
  ru: (m, y) => `${['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'][m - 1]} ${y}`,
  uk: (m, y) => `${['січень', 'лютий', 'березень', 'квітень', 'травень', 'червень', 'липень', 'серпень', 'вересень', 'жовтень', 'листопад', 'грудень'][m - 1]} ${y}`,
  az: (m, y) => `${['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avqust', 'sentyabr', 'oktyabr', 'noyabr', 'dekabr'][m - 1]} ${y}`,
  tr: (m, y) => `${['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'][m - 1]} ${y}`,
};

/** When the facts in lib/seoContent were last checked against the official sources. */
export const CONTENT_CHECKED = { month: 11, year: 2026 } as const;
