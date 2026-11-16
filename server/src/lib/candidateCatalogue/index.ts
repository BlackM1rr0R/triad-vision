import { prisma } from '../../db.js';
import { cached } from '../cache.js';
import { canonicalProfession, germanRank } from '../matching.js';
import { isVisible, visibleProfileWhere } from '../pool/anonymous.js';
import { POOL_SCAN_LIMIT } from '../pool/constants.js';

/**
 * Public anonymous candidate catalogue (/kandidaten, German first): aggregated groups of the consented candidate
 * pool (lib/pool — consent on, not hidden by staff, active client account). k-anonymity:
 *
 *   - Every published group is one combination of ALL attributes shown (profession, German level band,
 *     experience band, availability band) and holds at least K_MIN candidates; smaller groups are suppressed.
 *   - Values are generalised (bands instead of exact years / levels / dates, canonical professions only;
 *     free-text professions are not published). No code, id, name, photo, age, city, region or free text.
 *   - Profession counts are the sum of the published groups (a suppressed candidate cannot be inferred from them);
 *     only the total number of suppressed profiles is given.
 *
 * The pool stores no city (only wished regions), so no place attribute is published at all.
 */

export const K_MIN = 3;

export const GERMAN_BANDS = ['A0_A2', 'B1', 'B2_PLUS'] as const;
export const EXPERIENCE_BANDS = ['0_2', '3_5', '6_10', '10_PLUS'] as const;
export const AVAILABILITY_BANDS = ['NOW', 'SOON', 'LATER'] as const;

export type GermanBand = (typeof GERMAN_BANDS)[number];
export type ExperienceBand = (typeof EXPERIENCE_BANDS)[number];
export type AvailabilityBand = (typeof AVAILABILITY_BANDS)[number];

export interface CatalogueGroup {
  profession: string;
  german: GermanBand;
  experience: ExperienceBand;
  availability: AvailabilityBand;
  count: number;
}

export interface Catalogue {
  groups: CatalogueGroup[];
  professions: { profession: string; count: number }[];
  total: number;
  suppressed: number;
  k: number;
  updatedAt: string;
}

/** The keys a public group may carry — tests assert nothing else leaves the server. */
export const GROUP_KEYS = ['profession', 'german', 'experience', 'availability', 'count'] as const;

export const germanBand = (level: string | null | undefined): GermanBand => {
  const r = germanRank(level);
  if (r >= germanRank('B2')) return 'B2_PLUS';
  if (r >= germanRank('B1')) return 'B1';
  return 'A0_A2';
};

export const experienceBand = (years: number | null | undefined): ExperienceBand => {
  const y = typeof years === 'number' && Number.isFinite(years) ? Math.max(0, years) : 0;
  if (y >= 10) return '10_PLUS';
  if (y >= 6) return '6_10';
  if (y >= 3) return '3_5';
  return '0_2';
};

const DAY = 24 * 60 * 60 * 1000;

/** NOW = immediately or within 30 days, SOON = within 3 months, LATER = later or unknown. */
export const availabilityBand = (p: { availability: string | null; earliestStart: Date | null }, now: Date): AvailabilityBand => {
  if (p.earliestStart) {
    const days = (p.earliestStart.getTime() - now.getTime()) / DAY;
    if (days <= 30) return 'NOW';
    if (days <= 92) return 'SOON';
    return 'LATER';
  }
  if (p.availability === 'IMMEDIATE') return 'NOW';
  if (p.availability === 'ONE_MONTH' || p.availability === 'THREE_MONTHS') return 'SOON';
  return 'LATER';
};

export interface CatalogueRow {
  profession: string | null;
  germanLevel: string | null;
  experienceYears: number | null;
  availability: string | null;
  earliestStart: Date | null;
}

/** Pure aggregation with suppression (unit-tested). */
export const buildCatalogue = (rows: CatalogueRow[], now = new Date(), k = K_MIN): Catalogue => {
  const counts = new Map<string, CatalogueGroup>();
  for (const r of rows) {
    const profession = canonicalProfession(r.profession);
    if (!profession) continue; // free-text professions are never published (counted as suppressed)
    const g = { profession, german: germanBand(r.germanLevel), experience: experienceBand(r.experienceYears), availability: availabilityBand(r, now) };
    const key = `${g.profession}|${g.german}|${g.experience}|${g.availability}`;
    const cur = counts.get(key);
    if (cur) cur.count++;
    else counts.set(key, { ...g, count: 1 });
  }
  const all = [...counts.values()];
  const groups = all
    .filter((g) => g.count >= k)
    .sort(
      (a, b) =>
        a.profession.localeCompare(b.profession) ||
        GERMAN_BANDS.indexOf(b.german) - GERMAN_BANDS.indexOf(a.german) ||
        EXPERIENCE_BANDS.indexOf(b.experience) - EXPERIENCE_BANDS.indexOf(a.experience) ||
        AVAILABILITY_BANDS.indexOf(a.availability) - AVAILABILITY_BANDS.indexOf(b.availability),
    );
  const byProfession = new Map<string, number>();
  for (const g of groups) byProfession.set(g.profession, (byProfession.get(g.profession) ?? 0) + g.count);
  const published = groups.reduce((s, g) => s + g.count, 0);
  return {
    groups,
    professions: [...byProfession.entries()].map(([profession, count]) => ({ profession, count })).sort((a, b) => b.count - a.count || a.profession.localeCompare(b.profession)),
    total: published,
    suppressed: rows.length - published,
    k,
    updatedAt: now.toISOString(),
  };
};

/** The live catalogue (lib/cache TTL; the same for every visitor). */
export const getCatalogue = () =>
  cached(
    'candidate-catalogue:v1',
    async () => {
      const rows = await prisma.candidatePoolProfile.findMany({
        where: visibleProfileWhere,
        select: {
          consentAt: true,
          hidden: true,
          availability: true,
          earliestStart: true,
          user: { select: { role: true, isActive: true, profession: true, germanLevel: true, experienceYears: true } },
        },
        take: POOL_SCAN_LIMIT,
      });
      return buildCatalogue(
        rows.filter((r) => isVisible(r)).map((r) => ({ profession: r.user.profession, germanLevel: r.user.germanLevel, experienceYears: r.user.experienceYears, availability: r.availability, earliestStart: r.earliestStart })),
      );
    },
  );
