import { z } from 'zod';
import { readSetting, writeSetting } from '../growth/settings.js';

/**
 * Staff settings of the "Life in Germany" features (Setting `lifeInGermany`, Admin → Settings):
 *
 *  - the live numbers board (home / about), on or off per place;
 *  - the Baku salary reference for the simulator's comparison block.
 *
 * Baku salaries: we have no free, official source of salaries by profession in Baku. The default is therefore
 * only the national figure the State Statistical Committee publishes — the average monthly NOMINAL (gross) wage in
 * Azerbaijan, all sectors (2025, preliminary: 1,102.9 AZN; stat.gov.az) — shown as "average of all professions,
 * whole country, estimate". Staff may enter a gross monthly figure per simulator profession (their own market
 * knowledge, job ads, partner data) with a source note; every figure stays labelled as a staff estimate on the
 * page. Leaving a profession empty falls back to the national average; switching the block off hides it.
 */

export const LIFE_SETTING_KEY = 'lifeInGermany';
/** Simulator professions (path finder families with a reference salary, lib/publicAi/pathFinder.ts). */
export const LIFE_PROFESSIONS = ['driver', 'care', 'construction', 'technical', 'hospitality', 'it', 'logistics'] as const;
export type LifeProfession = (typeof LIFE_PROFESSIONS)[number];

export const NATIONAL_AVERAGE_DEFAULT = {
  grossAzn: 1_102.9,
  year: 2025,
  source: 'State Statistical Committee of the Republic of Azerbaijan (stat.gov.az): average monthly nominal wage, all economic activities, 2025 (preliminary)',
};

const money = z.number().min(0).max(100_000);
const note = z.string().trim().max(200);

export const lifeSettingsSchema = z.object({
  board: z
    .object({
      enabled: z.boolean().default(true),
      showOnHome: z.boolean().default(true),
      showOnAbout: z.boolean().default(true),
    })
    .default({}),
  baku: z
    .object({
      enabled: z.boolean().default(true),
      nationalAverage: z
        .object({ grossAzn: money.nullable(), year: z.number().int().min(2000).max(2100), source: note })
        .default(NATIONAL_AVERAGE_DEFAULT),
      /** Gross AZN per month per profession (staff estimate), null/missing = use the national average. */
      professions: z.record(z.enum(LIFE_PROFESSIONS), z.object({ grossAzn: money.nullable(), note: note.default('') })).default({}),
    })
    .default({}),
});
export type LifeSettings = z.infer<typeof lifeSettingsSchema>;

export const LIFE_DEFAULTS: LifeSettings = lifeSettingsSchema.parse({});

export const getLifeSettings = () => readSetting(LIFE_SETTING_KEY, lifeSettingsSchema, LIFE_DEFAULTS);
export const saveLifeSettings = (s: LifeSettings) => writeSetting(LIFE_SETTING_KEY, s);
