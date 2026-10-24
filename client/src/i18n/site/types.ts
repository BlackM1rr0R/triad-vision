/**
 * Turkish (tr) and Ukrainian (uk) copy of the public website.
 *
 * The four base languages (az/de/en/ru) ship with every page module (registerCopy). The two extra site
 * languages live in their own chunks (site/tr, site/uk) that are downloaded only when a visitor actually uses
 * that language (i18n/index.ts → loadSiteLanguage), so az/de/en/ru visitors never pay for them.
 *
 * Each file mirrors one source copy module: same keys and nesting (a renamed or missing key is a type error),
 * but whole top-level sections (and single strings) may be left out — those strings (mostly logged-in portal screens) fall back to
 * English. Extra keys are allowed for plural forms a language needs (Ukrainian `_few` / `_many`).
 */
type Shape<T> = T extends string
  ? string
  : T extends readonly (infer U)[]
    ? Shape<U>[]
    : T extends object
      ? // Single strings may be missing (a key added to the source later falls back to English); nested
        // objects and lists stay complete, because pages read those whole (returnObjects).
        { [K in keyof T as T[K] extends string ? K : never]?: string } & {
          [K in keyof T as T[K] extends string ? never : K]: Shape<T[K]>;
        } & { [extra: string]: unknown }
      : T;

export type SiteCopy<T> = { [K in keyof T]?: Shape<T[K]> };
