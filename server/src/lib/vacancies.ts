import { Prisma, type ApplicationStatus, type User, type Vacancy } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db.js';
import { GERMAN_LEVELS, matchCandidate, type MatchResult } from './matching.js';
import { vacancyImagesField, vacancyImagesOf } from './vacancyImages.js';

/** Shared pieces of the employers & vacancies area (company portal, public board, staff admin). */

export const LOCALES = ['az', 'de', 'en', 'ru'] as const;
type Loc = (typeof LOCALES)[number];
export type L10n = Record<Loc, string>;
export type L10nList = Record<Loc, string[]>;

export const SECTORS = ['logistics', 'courier', 'industry', 'construction', 'hospitality', 'healthcare', 'agriculture', 'other'] as const;
export const EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'SEASONAL', 'AUSBILDUNG'] as const;
export const APPLICATION_STATUSES = ['NEW', 'SHORTLISTED', 'PROPOSED', 'INTERVIEW', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'] as const;

/** Application statuses an employer may see (REJECTED only when the employer itself decided). */
export const EMPLOYER_VISIBLE: ApplicationStatus[] = ['PROPOSED', 'INTERVIEW', 'ACCEPTED'];
export const employerVisibleWhere: Prisma.VacancyApplicationWhereInput = {
  OR: [{ status: { in: EMPLOYER_VISIBLE } }, { status: 'REJECTED', companyNote: { not: null } }],
};

/** Open on the public board: OPEN and not past `closesAt`. */
export const openVacancyWhere = (now = new Date()): Prisma.VacancyWhereInput => ({
  status: 'OPEN',
  OR: [{ closesAt: null }, { closesAt: { gt: now } }],
});

export const isOpen = (v: Pick<Vacancy, 'status' | 'closesAt'>, now = new Date()) =>
  v.status === 'OPEN' && (!v.closesAt || v.closesAt > now);

// ─── Input validation ──────────────────────────────────────────────────

const text = (max: number) => z.string().trim().max(max);

/** At least one language filled; the others are filled with the same text until staff translate. */
const partialL10n = (max: number) =>
  z
    .object({ az: text(max).optional(), de: text(max).optional(), en: text(max).optional(), ru: text(max).optional() })
    .refine((v) => LOCALES.some((l) => v[l]), 'ONE_LANGUAGE_REQUIRED');

const itemList = z.array(z.string().trim().min(1).max(300)).max(30);
const partialL10nList = z.object({ az: itemList.optional(), de: itemList.optional(), en: itemList.optional(), ru: itemList.optional() });

/** Fills empty languages with the first filled one (de → en → az → ru). */
export const fillL10n = (v: Partial<Record<Loc, string | undefined>>): L10n => {
  const source = v.de || v.en || v.az || v.ru || '';
  return { az: v.az || source, de: v.de || source, en: v.en || source, ru: v.ru || source };
};
export const fillL10nList = (v: Partial<Record<Loc, string[] | undefined>> | null | undefined): L10nList | null => {
  if (!v) return null;
  const pick = (l: Loc) => (v[l]?.length ? v[l] : undefined);
  const source = pick('de') ?? pick('en') ?? pick('az') ?? pick('ru');
  if (!source) return null;
  return { az: pick('az') ?? source, de: pick('de') ?? source, en: pick('en') ?? source, ru: pick('ru') ?? source };
};

/** YYYY-MM-DD (end of that day, UTC) or a full ISO timestamp. Null clears. `future`: must be in the future. */
const dateField = (opts: { future: boolean; endOfDay: boolean }) =>
  z
    .union([z.null(), z.literal(''), z.string().max(40)])
    .optional()
    .transform((v, ctx) => {
      if (v === undefined) return undefined;
      if (v === null || v === '') return null;
      const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T${opts.endOfDay ? '23:59:59' : '00:00:00'}.000Z`) : new Date(v);
      if (Number.isNaN(d.getTime())) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'INVALID_DATE' });
        return z.NEVER;
      }
      if (opts.future && d.getTime() <= Date.now()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'DATE_NOT_IN_FUTURE' });
        return z.NEVER;
      }
      return d;
    });
/** Employers: the closing date must lie in the future. */
const closesAt = dateField({ future: true, endOfDay: true });
/**
 * Staff: any valid date. The admin route still refuses a new past date for STAFF / ADMIN (an unchanged one
 * may be sent back, so expired vacancies stay editable); SUPER_ADMIN may set any date.
 */
const staffClosesAt = dateField({ future: false, endOfDay: true });

const optStr = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === '' ? null : v));

const vacancyFields = {
  requirements: partialL10nList.nullable().optional(),
  benefits: partialL10nList.nullable().optional(),
  sector: z.enum(SECTORS).nullable().optional(),
  city: optStr(80),
  profession: optStr(120),
  germanLevel: z.enum(GERMAN_LEVELS).nullable().optional(),
  minExperience: z.number().int().min(0).max(40).nullable().optional(),
  drivingLicence: optStr(40),
  salaryMin: z.number().int().min(0).max(100_000).nullable().optional(),
  salaryMax: z.number().int().min(0).max(100_000).nullable().optional(),
  positions: z.number().int().min(1).max(500).optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
  showCompany: z.boolean().optional(),
  closesAt,
  /** Cover + gallery (lib/vacancyImages.ts); null / [] clears. */
  images: vacancyImagesField,
};

const salaryOrder = (v: { salaryMin?: number | null; salaryMax?: number | null }) =>
  v.salaryMin == null || v.salaryMax == null || v.salaryMin <= v.salaryMax;

/** Employer input: title/description in at least one language. */
export const companyVacancyInput = z
  .object({ title: partialL10n(160), description: partialL10n(8000), ...vacancyFields })
  .refine(salaryOrder, { message: 'SALARY_RANGE', path: ['salaryMax'] });
export const companyVacancyPatch = z
  .object({ title: partialL10n(160).optional(), description: partialL10n(8000).optional(), ...vacancyFields })
  .refine(salaryOrder, { message: 'SALARY_RANGE', path: ['salaryMax'] });

export const VACANCY_STATUSES = ['DRAFT', 'PENDING', 'OPEN', 'CLOSED'] as const;
/** Staff input: the same plus company / visa category / slug; languages may still be partial (auto-filled). */
const staffExtra = {
  closesAt: staffClosesAt,
  companyId: z.string().max(40).nullable().optional(),
  visaCategoryId: z.string().max(40).nullable().optional(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
};
export const staffVacancyInput = z
  .object({ title: partialL10n(160), description: partialL10n(8000), ...vacancyFields, ...staffExtra, publish: z.boolean().optional() })
  .refine(salaryOrder, { message: 'SALARY_RANGE', path: ['salaryMax'] });
export const staffVacancyPatch = z
  .object({
    title: partialL10n(160).optional(),
    description: partialL10n(8000).optional(),
    ...vacancyFields,
    ...staffExtra,
    // SUPER_ADMIN only (checked in the route): set the status / publication date directly, whatever the state.
    status: z.enum(VACANCY_STATUSES).optional(),
    publishedAt: dateField({ future: false, endOfDay: false }),
  })
  .refine(salaryOrder, { message: 'SALARY_RANGE', path: ['salaryMax'] });

type VacancyBody = z.infer<typeof staffVacancyPatch>;

/** Turns validated input into Prisma data (languages filled, lists filled, JSON nulls handled). */
export const vacancyData = (b: VacancyBody) => {
  const data: Prisma.VacancyUncheckedUpdateInput = {};
  if (b.title) data.title = fillL10n(b.title);
  if (b.description) data.description = fillL10n(b.description);
  if (b.requirements !== undefined) data.requirements = fillL10nList(b.requirements) ?? Prisma.DbNull;
  if (b.benefits !== undefined) data.benefits = fillL10nList(b.benefits) ?? Prisma.DbNull;
  if (b.images !== undefined) data.images = b.images?.length ? b.images : Prisma.DbNull;
  for (const k of ['sector', 'city', 'profession', 'germanLevel', 'minExperience', 'drivingLicence', 'salaryMin', 'salaryMax', 'positions', 'employmentType', 'showCompany', 'closesAt'] as const) {
    if (b[k] !== undefined) (data as Record<string, unknown>)[k] = b[k];
  }
  return data;
};

// ─── Slugs ──────────────────────────────────────────────────────────────

const CYR: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/ə/g, 'e')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/[а-яё]/g, (c) => CYR[c] ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70)
    .replace(/-+$/g, '');

/** Readable unique slug, e.g. "lkw-fahrer-ce-hamburg", "lkw-fahrer-ce-hamburg-2". */
export const uniqueSlug = async (title: L10n, city?: string | null, exceptId?: string) => {
  const base = slugify([title.de || title.en || title.az || title.ru, city].filter(Boolean).join(' ')) || 'vacancy';
  for (let i = 1; i < 50; i++) {
    const candidate = i === 1 ? base : `${base}-${i}`;
    const taken = await prisma.vacancy.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!taken || taken.id === exceptId) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
};

// ─── Serialisation ──────────────────────────────────────────────────────

type VacancyWithRels = Vacancy & {
  company?: { name: string } | null;
  visaCategory?: { slug: string; title: unknown; visaLabel: string; germanLevel?: string | null } | null;
};

/** What the public board shows (also everything a JobPosting needs). Never internal notes or ids of people. */
export const publicVacancy = (v: VacancyWithRels) => ({
  id: v.id,
  slug: v.slug,
  title: v.title,
  description: v.description,
  requirements: v.requirements,
  benefits: v.benefits,
  sector: v.sector,
  city: v.city,
  profession: v.profession,
  germanLevel: v.germanLevel,
  minExperience: v.minExperience,
  drivingLicence: v.drivingLicence,
  salaryMin: v.salaryMin,
  salaryMax: v.salaryMax,
  salaryCurrency: 'EUR',
  salaryPeriod: 'MONTH',
  positions: v.positions,
  employmentType: v.employmentType,
  datePosted: v.publishedAt,
  validThrough: v.closesAt,
  companyName: v.showCompany && v.company ? v.company.name : null,
  visaCategory: v.visaCategory ? { slug: v.visaCategory.slug, title: v.visaCategory.title, visaLabel: v.visaCategory.visaLabel } : null,
  images: vacancyImagesOf(v.images),
});

/** "Ali M." — the only name an employer ever sees. */
export const anonymisedName = (u: Pick<User, 'firstName' | 'lastName'>) =>
  `${u.firstName.trim()}${u.lastName.trim() ? ` ${u.lastName.trim()[0].toUpperCase()}.` : ''}`;

export type ProfileFields = Pick<User, 'firstName' | 'lastName' | 'profession' | 'experienceYears' | 'germanLevel' | 'education' | 'drivingLicence' | 'city'>;

export const anonymisedProfileSelect = {
  firstName: true,
  lastName: true,
  profession: true,
  experienceYears: true,
  germanLevel: true,
  education: true,
  drivingLicence: true,
  city: true,
} as const;

/** Anonymised candidate profile for employers: no contact data, documents, birth date or address. */
export const anonymisedProfile = (u: ProfileFields) => ({
  name: anonymisedName(u),
  profession: u.profession,
  experienceYears: u.experienceYears,
  germanLevel: u.germanLevel,
  education: u.education,
  drivingLicence: u.drivingLicence,
  city: u.city,
});

export const matchFor = (
  candidate: Pick<User, 'profession' | 'experienceYears' | 'germanLevel' | 'education' | 'drivingLicence' | 'recognitionStatus'>,
  v: Pick<Vacancy, 'profession' | 'germanLevel' | 'minExperience' | 'drivingLicence'> & { visaCategory?: { visaLabel: string; germanLevel: string | null } | null },
): MatchResult => matchCandidate(candidate, v);

export const visaForMatch = { select: { visaLabel: true, germanLevel: true } } as const;
