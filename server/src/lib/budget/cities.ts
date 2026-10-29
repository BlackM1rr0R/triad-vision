import type { CityCost } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { cached, clearCache } from '../cache.js';
import { FEDERAL_STATES, type FederalState, type Range } from './params.js';

/**
 * City cost data of the first-month budget (CityCost table, Admin → Sayt → Şəhər xərcləri).
 *
 * The defaults below seed the table the first time it is read while empty (Setting `cityCostsSeeded`
 * remembers it, so rows an admin deleted do not come back). They are conservative 2026 orientation values:
 * the 15 cities of the public city guide (client/src/lib/cities/data.ts: cold rent per m², WG room all-in,
 * utilities per m², groceries) turned into monthly amounts for a 35 m² 1-room and a 55 m² 2-room flat, plus
 * the places of our vacancies (Bonn, Mannheim, Kempten, Bielefeld/Versmold, Duisburg, Augsburg, Langenhagen →
 * Hannover, Mörfelden-Walldorf → Frankfurt) and three size-class fallbacks. Sources: rent indices
 * (Mietspiegel) and listing portals 2025 with a moderate increase, WG-Gesucht / MLP student housing report
 * for WG rooms, Destatis consumer prices for food. Company rooms: typical employer offers (shared rooms,
 * all-in).
 */

export const SIZE_CLASSES = ['METRO', 'LARGE', 'MEDIUM', 'SMALL'] as const;
export type SizeClass = (typeof SIZE_CLASSES)[number];
export const CITY_KINDS = ['CITY', 'GENERIC'] as const;

export const CITY_COSTS_SEEDED_KEY = 'cityCostsSeeded';
export const CITY_COSTS_CHECKED_AT = '2026-10-26';
const SOURCE =
  'Orientation values 2026: rent indices (Mietspiegel) and listing portals 2025 + moderate increase; WG rooms: WG-Gesucht/MLP; food: Destatis prices. Conservative estimate, not a quote.';

interface Seed {
  slug: string;
  name: string;
  kind?: 'CITY' | 'GENERIC';
  state: FederalState | null;
  size: SizeClass;
  aliases?: string;
  /** cold rent € per m²: 1-room, 2-room */
  r1: Range;
  r2: Range;
  wg: Range;
  /** utilities incl. heating € per m² */
  util: Range;
  food: Range;
}

const SEEDS: Seed[] = [
  { slug: 'berlin', name: 'Berlin', state: 'BE', size: 'METRO', aliases: 'Potsdam, Schönefeld', r1: [17, 23], r2: [14, 19], wg: [600, 720], util: [2.9, 3.6], food: [260, 340] },
  { slug: 'hamburg', name: 'Hamburg', state: 'HH', size: 'METRO', aliases: 'Norderstedt, Pinneberg', r1: [17, 22], r2: [14, 18], wg: [600, 700], util: [2.9, 3.6], food: [270, 350] },
  { slug: 'muenchen', name: 'München', state: 'BY', size: 'METRO', aliases: 'Munich, Garching, Freising, Unterschleißheim', r1: [24, 31], r2: [21, 26], wg: [760, 880], util: [3, 3.8], food: [290, 370] },
  { slug: 'koeln', name: 'Köln', state: 'NW', size: 'METRO', aliases: 'Cologne, Leverkusen, Hürth', r1: [16, 20], r2: [13, 16], wg: [560, 650], util: [2.8, 3.5], food: [260, 340] },
  { slug: 'frankfurt', name: 'Frankfurt am Main', state: 'HE', size: 'METRO', aliases: 'Frankfurt, Mörfelden-Walldorf, Offenbach, Kelsterbach, Raunheim, Eschborn', r1: [18, 24], r2: [15, 19], wg: [640, 740], util: [2.9, 3.6], food: [270, 350] },
  { slug: 'stuttgart', name: 'Stuttgart', state: 'BW', size: 'LARGE', aliases: 'Ludwigsburg, Esslingen, Böblingen, Sindelfingen', r1: [17, 22], r2: [15, 18], wg: [600, 700], util: [2.9, 3.6], food: [270, 350] },
  { slug: 'duesseldorf', name: 'Düsseldorf', state: 'NW', size: 'LARGE', aliases: 'Neuss, Ratingen', r1: [15, 19], r2: [12.5, 15.5], wg: [540, 630], util: [2.8, 3.5], food: [260, 340] },
  { slug: 'leipzig', name: 'Leipzig', state: 'SN', size: 'LARGE', aliases: 'Schkeuditz, Halle (Saale)', r1: [10, 13], r2: [8, 10.5], wg: [390, 460], util: [2.6, 3.3], food: [240, 310] },
  { slug: 'dresden', name: 'Dresden', state: 'SN', size: 'LARGE', r1: [10, 13], r2: [8.5, 10.5], wg: [390, 460], util: [2.6, 3.3], food: [240, 310] },
  { slug: 'hannover', name: 'Hannover', state: 'NI', size: 'LARGE', aliases: 'Hanover, Langenhagen, Laatzen, Garbsen, Lehrte', r1: [12, 15], r2: [10, 12.5], wg: [450, 530], util: [2.7, 3.4], food: [250, 320] },
  { slug: 'nuernberg', name: 'Nürnberg', state: 'BY', size: 'LARGE', aliases: 'Nuremberg, Fürth, Erlangen', r1: [13, 16.5], r2: [11, 13.5], wg: [480, 560], util: [2.8, 3.4], food: [260, 330] },
  { slug: 'dortmund', name: 'Dortmund', state: 'NW', size: 'LARGE', aliases: 'Unna, Schwerte', r1: [10, 13], r2: [8.5, 10.5], wg: [400, 470], util: [2.7, 3.4], food: [240, 310] },
  { slug: 'bremen', name: 'Bremen', state: 'HB', size: 'LARGE', aliases: 'Bremerhaven, Delmenhorst', r1: [11.5, 14], r2: [9.5, 12], wg: [420, 500], util: [2.7, 3.4], food: [250, 320] },
  { slug: 'essen', name: 'Essen', state: 'NW', size: 'LARGE', aliases: 'Bochum, Gelsenkirchen, Mülheim an der Ruhr, Oberhausen', r1: [10, 12.5], r2: [8.5, 10.5], wg: [390, 460], util: [2.7, 3.4], food: [240, 310] },
  { slug: 'duisburg', name: 'Duisburg', state: 'NW', size: 'LARGE', aliases: 'Moers, Dinslaken', r1: [8.5, 11], r2: [7.5, 9.5], wg: [350, 420], util: [2.7, 3.4], food: [240, 310] },
  { slug: 'bonn', name: 'Bonn', state: 'NW', size: 'LARGE', aliases: 'Sankt Augustin, Troisdorf, Siegburg', r1: [14, 18], r2: [11.5, 14.5], wg: [480, 580], util: [2.8, 3.5], food: [260, 340] },
  { slug: 'mannheim', name: 'Mannheim', state: 'BW', size: 'LARGE', aliases: 'Ludwigshafen, Heidelberg, Viernheim', r1: [13, 16.5], r2: [10.5, 13], wg: [450, 540], util: [2.8, 3.4], food: [260, 330] },
  { slug: 'augsburg', name: 'Augsburg', state: 'BY', size: 'LARGE', aliases: 'Gersthofen, Königsbrunn', r1: [14, 17.5], r2: [12, 14.5], wg: [480, 570], util: [2.8, 3.5], food: [260, 330] },
  { slug: 'bielefeld', name: 'Bielefeld', state: 'NW', size: 'LARGE', aliases: 'Gütersloh, Versmold, Herford, Halle (Westf.)', r1: [10, 12.5], r2: [8.5, 10.5], wg: [380, 450], util: [2.7, 3.4], food: [240, 310] },
  { slug: 'kempten', name: 'Kempten (Allgäu)', state: 'BY', size: 'MEDIUM', aliases: 'Kempten, Kaufbeuren, Memmingen', r1: [11, 14], r2: [9.5, 12], wg: [400, 480], util: [2.7, 3.4], food: [250, 320] },
  { slug: 'other-large', name: 'Großstadt (> 100.000)', kind: 'GENERIC', state: null, size: 'LARGE', r1: [11, 15], r2: [9, 12.5], wg: [400, 520], util: [2.7, 3.4], food: [250, 330] },
  { slug: 'other-medium', name: 'Mittelstadt (20.000–100.000)', kind: 'GENERIC', state: null, size: 'MEDIUM', r1: [9, 12], r2: [8, 10.5], wg: [350, 450], util: [2.6, 3.3], food: [240, 310] },
  { slug: 'other-small', name: 'Kleinstadt / ländlich', kind: 'GENERIC', state: null, size: 'SMALL', r1: [8, 11], r2: [7, 9], wg: [320, 400], util: [2.5, 3.2], food: [230, 300] },
];

const FLAT1_M2 = 35;
const FLAT2_M2 = 55;
const up10 = (n: number) => Math.ceil(n / 10) * 10;
const down10 = (n: number) => Math.floor(n / 10) * 10;

export type CityCostData = Omit<CityCost, 'id' | 'createdAt' | 'updatedAt'>;

/** The seed rows as table data (monthly euro amounts, rounded to 10 €: low down, high up). */
export const DEFAULT_CITY_COSTS: CityCostData[] = SEEDS.map((s, i) => ({
  slug: s.slug,
  name: s.name,
  kind: s.kind ?? 'CITY',
  state: s.state,
  sizeClass: s.size,
  aliases: s.aliases ?? null,
  wgMin: s.wg[0],
  wgMax: s.wg[1],
  flat1ColdMin: down10(s.r1[0] * FLAT1_M2),
  flat1ColdMax: up10(s.r1[1] * FLAT1_M2),
  flat1UtilMin: down10(s.util[0] * FLAT1_M2),
  flat1UtilMax: up10(s.util[1] * FLAT1_M2),
  flat2ColdMin: down10(s.r2[0] * FLAT2_M2),
  flat2ColdMax: up10(s.r2[1] * FLAT2_M2),
  flat2UtilMin: down10(s.util[0] * FLAT2_M2),
  flat2UtilMax: up10(s.util[1] * FLAT2_M2),
  // Employer rooms (often shared, all-in) are usually well below the WG market.
  companyMin: down10(s.wg[0] * 0.6),
  companyMax: up10(s.wg[1] * 0.75),
  foodMin: s.food[0],
  foodMax: s.food[1],
  transport: 63,
  depositMonths: 3,
  sourceNote: SOURCE,
  checkedAt: new Date(`${CITY_COSTS_CHECKED_AT}T00:00:00.000Z`),
  active: true,
  sortOrder: (i + 1) * 10,
}));

/** Admin input (create / update). Every minimum must not exceed its maximum. */
const eur = z.coerce.number().int().min(0).max(20_000);
export const cityCostSchema = z
  .object({
    slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(2).max(60),
    name: z.string().trim().min(2).max(80),
    kind: z.enum(CITY_KINDS).default('CITY'),
    state: z.enum(FEDERAL_STATES).nullable().default(null),
    sizeClass: z.enum(SIZE_CLASSES).default('LARGE'),
    aliases: z.string().trim().max(2000).nullable().default(null),
    wgMin: eur,
    wgMax: eur,
    flat1ColdMin: eur,
    flat1ColdMax: eur,
    flat1UtilMin: eur,
    flat1UtilMax: eur,
    flat2ColdMin: eur,
    flat2ColdMax: eur,
    flat2UtilMin: eur,
    flat2UtilMax: eur,
    companyMin: eur,
    companyMax: eur,
    foodMin: eur,
    foodMax: eur,
    transport: z.coerce.number().int().min(0).max(1_000).default(63),
    depositMonths: z.coerce.number().min(0).max(3).default(3),
    sourceNote: z.string().trim().max(2000).nullable().default(null),
    checkedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    active: z.boolean().default(true),
    sortOrder: z.coerce.number().int().min(0).max(100_000).default(0),
  })
  .superRefine((v, ctx) => {
    for (const k of ['wg', 'flat1Cold', 'flat1Util', 'flat2Cold', 'flat2Util', 'company', 'food'] as const) {
      if (v[`${k}Min`] > v[`${k}Max`]) ctx.addIssue({ code: 'custom', path: [`${k}Max`], message: 'MIN_ABOVE_MAX' });
    }
    if (v.kind === 'CITY' && !v.state) ctx.addIssue({ code: 'custom', path: ['state'], message: 'STATE_REQUIRED' });
  });
export type CityCostInput = z.infer<typeof cityCostSchema>;

export const toCityCostData = (v: CityCostInput): CityCostData => ({ ...v, checkedAt: new Date(`${v.checkedAt}T00:00:00.000Z`) });

/** Seeds the defaults once (first read of an empty table). Concurrent first reads are harmless (skipDuplicates). */
export const ensureCityCosts = async () => {
  const count = await prisma.cityCost.count();
  if (count > 0) return;
  const seeded = await prisma.setting.findUnique({ where: { key: CITY_COSTS_SEEDED_KEY } });
  if (seeded) return;
  await prisma.cityCost.createMany({ data: DEFAULT_CITY_COSTS, skipDuplicates: true });
  await prisma.setting.upsert({ where: { key: CITY_COSTS_SEEDED_KEY }, create: { key: CITY_COSTS_SEEDED_KEY, value: { at: new Date().toISOString() } }, update: {} });
  clearCache();
};

/** Active rows in display order (cached; every admin write clears the cache). */
export const activeCityCosts = () =>
  cached('budget:cities', async () => {
    await ensureCityCosts();
    return prisma.cityCost.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  });

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Best row for a free-text place (vacancy / arrival city): slug, name or alias match; otherwise null
 * (the caller then falls back to a size class).
 */
export const matchCity = (rows: readonly CityCost[], place: string | null | undefined): CityCost | null => {
  if (!place?.trim()) return null;
  const q = norm(place);
  if (!q) return null;
  const cities = rows.filter((r) => r.kind === 'CITY');
  const exact = cities.find((r) => r.slug === q.replace(/ /g, '-') || norm(r.name) === q);
  if (exact) return exact;
  const alias = cities.find((r) => (r.aliases ?? '').split(',').some((a) => norm(a) === q));
  if (alias) return alias;
  return cities.find((r) => q.startsWith(`${norm(r.name)} `) || norm(r.name).startsWith(`${q} `)) ?? null;
};

/** Public shape of a row (no internal ids). */
export const publicCity = (r: CityCost) => ({
  slug: r.slug,
  name: r.name,
  kind: r.kind,
  state: r.state,
  sizeClass: r.sizeClass,
  wg: [r.wgMin, r.wgMax] as Range,
  flat1: { cold: [r.flat1ColdMin, r.flat1ColdMax] as Range, utilities: [r.flat1UtilMin, r.flat1UtilMax] as Range },
  flat2: { cold: [r.flat2ColdMin, r.flat2ColdMax] as Range, utilities: [r.flat2UtilMin, r.flat2UtilMax] as Range },
  company: [r.companyMin, r.companyMax] as Range,
  food: [r.foodMin, r.foodMax] as Range,
  transport: r.transport,
  depositMonths: r.depositMonths,
  sourceNote: r.sourceNote,
  checkedAt: r.checkedAt.toISOString().slice(0, 10),
});
export type PublicCity = ReturnType<typeof publicCity>;
