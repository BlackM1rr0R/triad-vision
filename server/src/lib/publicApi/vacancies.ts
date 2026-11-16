import { canonicalProfession, germanRank, GERMAN_LEVELS, normaliseText } from '../matching.js';
import type { publicVacancy } from '../vacancies.js';

/**
 * Vacancy view of the public partner API (GET /api/public/v1/vacancies). Only Triad Vision's own published
 * vacancies (the public board: OPEN, not past closesAt) — never the third-party Germany-jobs listings, whose
 * terms forbid redistribution. Texts in one language (`lng`), an absolute page URL and the partner's apply link.
 */

export const API_LANGS = ['az', 'de', 'en', 'ru'] as const;
export type ApiLang = (typeof API_LANGS)[number];
export const API_VERSION = '1.0';

type PublicVacancy = ReturnType<typeof publicVacancy>;

const FALLBACK: ApiLang[] = ['en', 'de', 'az', 'ru'];

const pick = (v: unknown, lng: ApiLang): string | null => {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  for (const l of [lng, ...FALLBACK]) if (typeof o[l] === 'string' && o[l]) return o[l] as string;
  return null;
};
const pickList = (v: unknown, lng: ApiLang): string[] => {
  if (!v || typeof v !== 'object') return [];
  const o = v as Record<string, unknown>;
  for (const l of [lng, ...FALLBACK]) {
    const list = o[l];
    if (Array.isArray(list) && list.length) return list.filter((x): x is string => typeof x === 'string');
  }
  return [];
};

const trimSlash = (s: string) => s.replace(/\/$/, '');
const abs = (base: string, url: string) => (/^https?:\/\//.test(url) ? url : `${trimSlash(base)}${url.startsWith('/') ? '' : '/'}${url}`);

/** Apply link with partner attribution: `ref` = partner sign-up code (cookie tv_ref), `src` = key prefix (cookie tv_src). */
export const applyUrl = (siteUrl: string, slug: string, partnerCode: string, keyPrefix: string) => {
  const qs = new URLSearchParams();
  if (partnerCode) qs.set('ref', partnerCode);
  qs.set('src', keyPrefix);
  return `${trimSlash(siteUrl)}/jobs/${encodeURIComponent(slug)}?${qs.toString()}`;
};

export const apiVacancy = (v: PublicVacancy, opts: { lng: ApiLang; siteUrl: string; partnerCode: string; keyPrefix: string }) => ({
  id: v.id,
  slug: v.slug,
  language: opts.lng,
  title: pick(v.title, opts.lng) ?? '',
  description: pick(v.description, opts.lng) ?? '',
  requirements: pickList(v.requirements, opts.lng),
  benefits: pickList(v.benefits, opts.lng),
  profession: v.profession,
  professionKey: canonicalProfession(v.profession),
  sector: v.sector,
  city: v.city,
  country: 'DE' as const,
  germanLevel: v.germanLevel,
  minExperienceYears: v.minExperience,
  drivingLicence: v.drivingLicence,
  salary: v.salaryMin || v.salaryMax ? { min: v.salaryMin, max: v.salaryMax, currency: 'EUR', period: 'MONTH', gross: true } : null,
  positions: v.positions,
  employmentType: v.employmentType,
  datePosted: v.datePosted,
  validThrough: v.validThrough,
  companyName: v.companyName,
  visaCategory: v.visaCategory ? { slug: v.visaCategory.slug, label: v.visaCategory.visaLabel } : null,
  imageUrl: v.images[0] ? abs(opts.siteUrl, v.images[0].url) : null,
  url: `${trimSlash(opts.siteUrl)}/jobs/${encodeURIComponent(v.slug)}`,
  applyUrl: applyUrl(opts.siteUrl, v.slug, opts.partnerCode, opts.keyPrefix),
});
export type ApiVacancy = ReturnType<typeof apiVacancy>;

export interface VacancyFilter {
  profession?: string;
  city?: string;
  germanLevel?: (typeof GERMAN_LEVELS)[number];
}

const titleText = (t: unknown) => (t && typeof t === 'object' ? Object.values(t as Record<string, unknown>).filter((x) => typeof x === 'string').join(' ') : '');

/** In-memory filter (pure): profession by canonical key or text, city by text, "I speak B1" = minimum ≤ B1. */
export const matchesFilter = (v: { profession: string | null; city: string | null; germanLevel: string | null; title: unknown }, f: VacancyFilter) => {
  if (f.profession) {
    const want = canonicalProfession(f.profession);
    const have = canonicalProfession(v.profession) ?? canonicalProfession(titleText(v.title));
    const text = normaliseText(`${v.profession ?? ''} ${titleText(v.title)}`);
    if (!(want && have === want) && !text.includes(normaliseText(f.profession))) return false;
  }
  if (f.city && !normaliseText(v.city ?? '').includes(normaliseText(f.city))) return false;
  if (f.germanLevel && germanRank(v.germanLevel) > germanRank(f.germanLevel)) return false;
  return true;
};
