import { z } from 'zod';
import type { Prisma, StudyProgramme } from '@prisma/client';
import { prisma } from '../../db.js';
import { cached } from '../cache.js';
import { slugify } from '../vacancies.js';
import { berlinToday, closesWithinMonths, deadlineList, isoOf, isSoon, upcomingDeadlines, type DeadlineOccurrence, type Ymd } from './deadlines.js';

/**
 * "Study in Germany" programme catalogue (/study, /study/:slug): curated by staff (routes/admin/study.ts), never
 * scraped. Constants, the admin input schema, the public shape (with the computed next deadlines) and the
 * catalogue filters. The published rows are cached with the other public CMS reads (cleared on every write).
 */

export const DEGREES = ['BACHELOR', 'MASTER', 'STUDIENKOLLEG', 'AUSBILDUNG_DUAL'] as const;
export type Degree = (typeof DEGREES)[number];
export const SUBJECTS = [
  'computer-science',
  'data-science',
  'engineering',
  'natural-sciences',
  'mathematics',
  'medicine-health',
  'business',
  'economics',
  'social-sciences',
  'law',
  'humanities',
  'arts-design',
  'agriculture-environment',
  'other',
] as const;
export type Subject = (typeof SUBJECTS)[number];
export const TEACHING_LANGUAGES = ['EN', 'DE', 'EN_DE'] as const;
export const ROUTES = ['UNI_ASSIST', 'DIRECT', 'VPD', 'HOCHSCHULSTART'] as const;
/** German federal states (ISO 3166-2:DE without "DE-") with their German names (same in every language on the page). */
export const STATES = {
  BW: 'Baden-Württemberg',
  BY: 'Bayern',
  BE: 'Berlin',
  BB: 'Brandenburg',
  HB: 'Bremen',
  HH: 'Hamburg',
  HE: 'Hessen',
  MV: 'Mecklenburg-Vorpommern',
  NI: 'Niedersachsen',
  NW: 'Nordrhein-Westfalen',
  RP: 'Rheinland-Pfalz',
  SL: 'Saarland',
  SN: 'Sachsen',
  ST: 'Sachsen-Anhalt',
  SH: 'Schleswig-Holstein',
  TH: 'Thüringen',
} as const;
export type StateCode = keyof typeof STATES;
export const STATE_CODES = Object.keys(STATES) as StateCode[];

const text = (max: number) => z.string().trim().max(max);
const l10n = z.object({ az: text(3000), de: text(3000), en: text(3000), ru: text(3000) });
const l10nList = z.object({ az: z.array(text(300)).max(30), de: z.array(text(300)).max(30), en: z.array(text(300)).max(30), ru: z.array(text(300)).max(30) });
const httpUrl = z
  .string()
  .trim()
  .max(1000)
  .url()
  .refine((u) => /^https?:$/.test(new URL(u).protocol), 'URL_PROTOCOL');

/** Admin create / update body (also the target of a CSV row). */
export const programmeInput = z.object({
  slug: z
    .string()
    .trim()
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'SLUG')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  university: text(200).min(2),
  city: text(100).min(2),
  federalState: z.enum(STATE_CODES as [StateCode, ...StateCode[]]),
  degree: z.enum(DEGREES),
  subjectArea: z.enum(SUBJECTS),
  name: text(250).min(2),
  teachingLanguage: z.enum(TEACHING_LANGUAGES),
  languageRequirement: text(500)
    .nullable()
    .optional()
    .transform((v) => v || null),
  durationSemesters: z.coerce.number().int().min(1).max(14),
  tuitionPerSemester: z.coerce.number().int().min(0).max(100_000).default(0),
  semesterContribution: z.coerce.number().int().min(0).max(5_000).nullable().optional().transform((v) => v ?? null),
  deadlines: deadlineList.default([]),
  applicationRoute: z.enum(ROUTES),
  officialUrl: httpUrl,
  description: l10n.nullable().optional(),
  requirements: l10nList.nullable().optional(),
  published: z.boolean().default(false),
  featured: z.boolean().default(false),
  staffNote: text(5000)
    .nullable()
    .optional()
    .transform((v) => v || null),
  checkedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional()
    .transform((v) => (v ? new Date(`${v}T00:00:00.000Z`) : null)),
});
export type ProgrammeInput = z.infer<typeof programmeInput>;

const jsonOrNull = (v: unknown) => (v == null ? (null as unknown as Prisma.InputJsonValue) : (v as Prisma.InputJsonValue));
const emptyText = (v: Record<string, string> | null | undefined) => !v || Object.values(v).every((s) => !s.trim());
const emptyList = (v: Record<string, string[]> | null | undefined) => !v || Object.values(v).every((l) => !l.length);

/** Prisma data of an input (slug resolved by the caller). */
export const programmeData = (b: ProgrammeInput, slug: string) => ({
  slug,
  university: b.university,
  city: b.city,
  federalState: b.federalState,
  degree: b.degree,
  subjectArea: b.subjectArea,
  name: b.name,
  teachingLanguage: b.teachingLanguage,
  languageRequirement: b.languageRequirement,
  durationSemesters: b.durationSemesters,
  tuitionPerSemester: b.tuitionPerSemester,
  semesterContribution: b.semesterContribution,
  deadlines: b.deadlines as unknown as Prisma.InputJsonValue,
  applicationRoute: b.applicationRoute,
  officialUrl: b.officialUrl,
  description: emptyText(b.description) ? jsonOrNull(null) : jsonOrNull(b.description),
  requirements: emptyList(b.requirements) ? jsonOrNull(null) : jsonOrNull(b.requirements),
  published: b.published,
  featured: b.featured,
  staffNote: b.staffNote,
  checkedAt: b.checkedAt,
});

/** "data-engineering-and-analytics-tum", unique ("-2" …). */
export const uniqueProgrammeSlug = async (b: Pick<ProgrammeInput, 'name' | 'university' | 'city' | 'slug'>, exceptId?: string, db: Prisma.TransactionClient = prisma) => {
  const short = b.university.match(/\(([A-Za-zÄÖÜäöü]{2,10})\)/)?.[1] ?? b.city;
  const base = (b.slug || slugify(`${b.name.replace(/,?\s*(Master|Bachelor) of (Science|Arts|Engineering)|\((M|B)\.\s?(Sc|A|Eng)\.?\)|(M|B)\.\s?(Sc|A|Eng)\.?/gi, ' ')} ${short}`) || 'programme').slice(0, 110);
  for (let i = 1; i < 200; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    const hit = await db.studyProgramme.findUnique({ where: { slug }, select: { id: true } });
    if (!hit || hit.id === exceptId) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
};

// ─── public shape ─────────────────────────────────────────────────────

export type PublicRow = Omit<StudyProgramme, 'staffNote' | 'checkedAt' | 'createdAt' | 'id'>;

/** Published programmes (cached; the deadlines are computed per request from these rows). */
export const publishedProgrammes = () =>
  cached('study:published', () =>
    prisma.studyProgramme.findMany({ where: { published: true }, omit: { staffNote: true, checkedAt: true, createdAt: true, id: true }, orderBy: { name: 'asc' } }),
  );

export interface PublicProgramme extends Omit<PublicRow, 'updatedAt' | 'deadlines'> {
  updatedAt: string;
  deadlines: DeadlineOccurrence[];
  nextDeadline: DeadlineOccurrence | null;
  soon: boolean;
}

export const toPublic = (r: PublicRow, today: Ymd): PublicProgramme => {
  const deadlines = upcomingDeadlines(r.deadlines, today);
  const next = deadlines[0] ?? null;
  return { ...r, updatedAt: r.updatedAt.toISOString(), deadlines, nextDeadline: next, soon: isSoon(next) };
};

/** Sort: next deadline first (programmes without a deadline last), then featured, then name. */
export const byNextDeadline = (a: PublicProgramme, b: PublicProgramme) =>
  (a.nextDeadline?.daysLeft ?? Number.MAX_SAFE_INTEGER) - (b.nextDeadline?.daysLeft ?? Number.MAX_SAFE_INTEGER) ||
  Number(b.featured) - Number(a.featured) ||
  a.name.localeCompare(b.name);

const flag = z
  .union([z.literal('1'), z.literal('true'), z.literal('0'), z.literal('false'), z.literal('')])
  .optional()
  .transform((v) => v === '1' || v === 'true');

export const catalogueQuery = z.object({
  q: z.string().trim().max(120).optional(),
  degree: z.enum(DEGREES).optional().or(z.literal('').transform(() => undefined)),
  subject: z.enum(SUBJECTS).optional().or(z.literal('').transform(() => undefined)),
  city: z.string().trim().max(100).optional(),
  state: z.enum(STATE_CODES as [StateCode, ...StateCode[]]).optional().or(z.literal('').transform(() => undefined)),
  /** en = taught (also) in English, de = (also) in German, en_only / de_only = only that language */
  lang: z.enum(['en', 'de', 'en_only', 'de_only']).optional().or(z.literal('').transform(() => undefined)),
  free: flag,
  /** Next deadline within N months */
  within: z.coerce.number().int().refine((n) => [1, 2, 3, 6, 12].includes(n), 'WITHIN').optional().or(z.literal('').transform(() => undefined)),
});
export type CatalogueQuery = z.infer<typeof catalogueQuery>;

const fold = (s: string) =>
  s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');

const LANG_MATCH: Record<NonNullable<CatalogueQuery['lang']>, string[]> = { en: ['EN', 'EN_DE'], de: ['DE', 'EN_DE'], en_only: ['EN'], de_only: ['DE'] };

/** Catalogue filters (all optional, combined with AND). */
export const filterProgrammes = (items: PublicProgramme[], q: CatalogueQuery, today: Ymd) => {
  const words = q.q ? fold(q.q).split(/\s+/).filter(Boolean) : [];
  return items.filter((p) => {
    if (q.degree && p.degree !== q.degree) return false;
    if (q.subject && p.subjectArea !== q.subject) return false;
    if (q.state && p.federalState !== q.state) return false;
    if (q.city && fold(p.city) !== fold(q.city)) return false;
    if (q.lang && !LANG_MATCH[q.lang].includes(p.teachingLanguage)) return false;
    if (q.free && p.tuitionPerSemester > 0) return false;
    if (q.within && !closesWithinMonths(p.nextDeadline, today, q.within)) return false;
    if (words.length) {
      const hay = fold(`${p.name} ${p.university} ${p.city} ${STATES[p.federalState as StateCode] ?? ''} ${p.subjectArea}`);
      if (!words.every((w) => hay.includes(w))) return false;
    }
    return true;
  });
};

const count = (values: string[]) =>
  [...values.reduce((m, v) => m.set(v, (m.get(v) ?? 0) + 1), new Map<string, number>())].map(([value, n]) => ({ value, count: n })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

/** Facets over the whole published catalogue (so a filter never hides its own alternatives). */
export const facetsOf = (items: PublicProgramme[]) => ({
  degrees: count(items.map((p) => p.degree)),
  subjects: count(items.map((p) => p.subjectArea)),
  cities: count(items.map((p) => p.city)),
  states: count(items.map((p) => p.federalState)),
});

/** The public catalogue: filtered, sorted by next deadline, with facets. */
export const catalogue = async (q: CatalogueQuery, now = new Date()) => {
  const today = berlinToday(now);
  const all = (await publishedProgrammes()).map((r) => toPublic(r, today));
  const items = filterProgrammes(all, q, today).sort(byNextDeadline);
  return { items, total: items.length, facets: facetsOf(all), today: isoOf(today) };
};

/** One published programme + up to 4 related ones (same subject, then same degree; soonest deadline first). */
export const programmeDetail = async (slug: string, now = new Date()) => {
  const today = berlinToday(now);
  const all = (await publishedProgrammes()).map((r) => toPublic(r, today));
  const programme = all.find((p) => p.slug === slug);
  if (!programme) return null;
  const others = all.filter((p) => p.slug !== slug);
  const related = [...others.filter((p) => p.subjectArea === programme.subjectArea), ...others.filter((p) => p.subjectArea !== programme.subjectArea && p.degree === programme.degree)]
    .slice(0, 8)
    .sort(byNextDeadline)
    .slice(0, 4);
  return { programme, related, today: isoOf(today) };
};
