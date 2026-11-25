import type { GuideLocale, GuidePageSeed } from '../../guides/types.js';
import { livingCostsGuide } from './livingCosts.js';
import { visaDocumentsGuide } from './visaDocuments.js';
import { skilledWorkerVisaGuide } from './skilledWorkerVisa.js';

/**
 * SEO guides 2026 for the job-seeker audience ("Almaniyada yaşamaq üçün aylıq xərclər", "документы на рабочую
 * визу в Германию", "Almanya nitelikli işçi vizesi" …), one key per topic, written in az (main), ru, tr and uk.
 *
 * Their figures come from the repository only: city costs from server/src/lib/budget/cities.ts (DEFAULT seed
 * rows), Deutschlandticket / Rundfunkbeitrag / SIM / internet ranges from lib/budget/params.ts, net salary
 * examples from the salary-net guide, thresholds (Blue Card, 45+) from lib/seo.ts COMPARE_FALLBACK and the
 * document lists from lib/visaChecklist + the case AI default checklists. Estimates are marked as such.
 *
 * Business rules hold in every text: we prepare documents together with the client, the client applies, the
 * embassy decides; no apostille, no translation, no embassy appointment booking, no job or visa promise.
 */
export const SEO2026_KEYS = ['living-costs', 'visa-documents', 'skilled-worker-visa'] as const;
export type Seo2026Key = (typeof SEO2026_KEYS)[number];

export interface Seo2026Guide {
  key: Seo2026Key;
  pages: Partial<Record<GuideLocale, GuidePageSeed>>;
}

/** Languages every SEO 2026 guide is written in. */
export const SEO2026_LOCALES: readonly GuideLocale[] = ['az', 'ru', 'tr', 'uk'];

export const SEO2026_GUIDES: Seo2026Guide[] = [livingCostsGuide, visaDocumentsGuide, skilledWorkerVisaGuide];

/** The SEO 2026 guides of one language, by key (merged into the per-language draft maps). */
export const seo2026Pages = (locale: GuideLocale): Partial<Record<Seo2026Key, GuidePageSeed>> =>
  Object.fromEntries(SEO2026_GUIDES.flatMap((g) => (g.pages[locale] ? [[g.key, g.pages[locale]!]] : [])));
