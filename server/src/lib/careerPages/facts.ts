import type { ProfessionHubSlug } from '../professionHubs.js';
import type { AusbildungFacts, AusbildungSlug } from './types.js';

/**
 * Language-neutral facts of the career pages. Visa slugs are the CMS visa categories (/visas/<slug>, seeded in
 * prisma/seed.ts; a link is shown only while the category is published). Figures are orientation values and are
 * always shown as estimates ("təxmini").
 */

export interface HubFacts {
  /** CMS visa category of the usual route. */
  visaSlug: string;
  /** Residence titles of the usual routes (German law references). */
  visaLabel: string;
  /** Ausbildung page of the occupation (/ausbildung/<slug>), if we have one. */
  ausbildung: AusbildungSlug | null;
  /** German level employers / the route usually ask for. */
  germanLevel: string;
  /** Guide keys linked in the related block (CMS guides, shown when published in the language). */
  guides: string[];
}

export const HUB_FACTS: Record<ProfessionHubSlug, HubFacts> = {
  'truck-driver': { visaSlug: 'lkw-fahrer', visaLabel: '§ 19c AufenthG + § 24a BeschV', ausbildung: 'berufskraftfahrer', germanLevel: 'A2', guides: ['driver-jobs', 'work-visa', 'visa-documents', 'salary-net'] },
  cook: { visaSlug: 'gastronomie-hotel', visaLabel: '§ 18a AufenthG · § 16d · § 19c', ausbildung: 'koch', germanLevel: 'A2–B1', guides: ['anerkennung-koch', 'skilled-worker-visa', 'salary-net', 'living-costs'] },
  nurse: { visaSlug: 'pflege-gesundheit', visaLabel: '§ 16d → § 18a AufenthG', ausbildung: 'pflege', germanLevel: 'B1–B2', guides: ['pflege', 'anerkennung', 'skilled-worker-visa', 'familiennachzug'] },
  'care-worker': { visaSlug: 'pflege-gesundheit', visaLabel: '§ 16a AufenthG (Ausbildung) · § 16d', ausbildung: 'pflege', germanLevel: 'A2–B1', guides: ['pflege', 'ausbildung', 'living-costs', 'salary-net'] },
  electrician: { visaSlug: 'industrie-technik', visaLabel: '§ 18a AufenthG · § 16d · § 18g', ausbildung: 'elektroniker', germanLevel: 'B1', guides: ['anerkennung-elektroniker', 'skilled-worker-visa', 'blue-card', 'salary-net'] },
  'construction-worker': { visaSlug: 'bau-handwerk', visaLabel: '§ 18a AufenthG · § 16d · § 19c', ausbildung: null, germanLevel: 'A2', guides: ['anerkennung-bau', 'skilled-worker-visa', 'visa-documents', 'living-costs'] },
  courier: { visaSlug: 'kurierfahrer', visaLabel: '§ 19c AufenthG + § 24a BeschV', ausbildung: 'berufskraftfahrer', germanLevel: 'A2', guides: ['driver-jobs', 'work-visa', 'living-costs', 'salary-net'] },
  warehouse: { visaSlug: 'industrie-technik', visaLabel: '§ 18a AufenthG · § 16a · § 19c', ausbildung: 'lagerlogistik', germanLevel: 'A2', guides: ['skilled-worker-visa', 'ausbildung', 'living-costs', 'salary-net'] },
  hospitality: { visaSlug: 'gastronomie-hotel', visaLabel: '§ 18a AufenthG · § 16a · § 19c', ausbildung: 'hotelfach', germanLevel: 'A2–B1', guides: ['ausbildung', 'skilled-worker-visa', 'salary-net', 'living-costs'] },
  agriculture: { visaSlug: 'landwirtschaft', visaLabel: '§ 15a BeschV · § 18a AufenthG', ausbildung: null, germanLevel: 'A1–A2', guides: ['work-visa', 'living-costs', 'first-month', 'salary-net'] },
  mechatronics: { visaSlug: 'industrie-technik', visaLabel: '§ 18a AufenthG · § 16d · § 16a', ausbildung: 'mechatroniker', germanLevel: 'B1', guides: ['anerkennung', 'skilled-worker-visa', 'ausbildung', 'salary-net'] },
  'it-specialist': { visaSlug: 'it-buero', visaLabel: '§ 18g AufenthG (Blue Card) · § 18b', ausbildung: null, germanLevel: 'A1–B1', guides: ['blue-card', 'chancenkarte', 'skilled-worker-visa', 'familiennachzug'] },
};

/**
 * Ausbildung pages. Allowance: indicative gross per month over the training years, rounded and conservative —
 * collective agreements of the sector (TVAöD-Pflege, DEHOGA, Kfz-/Elektrohandwerk, IG Metall, Spedition und
 * Logistik) as reported in the BIBB database of training allowances; the employer's contract decides.
 */
export const AUSBILDUNG_FACTS: Record<AusbildungSlug, AusbildungFacts> = {
  pflege: { slug: 'pflege', years: 3, germanLevel: 'B1–B2', allowance: [1300, 1600], hub: 'care-worker', visaSlug: 'pflege-gesundheit' },
  koch: { slug: 'koch', years: 3, germanLevel: 'B1', allowance: [950, 1250], hub: 'cook', visaSlug: 'gastronomie-hotel' },
  hotelfach: { slug: 'hotelfach', years: 3, germanLevel: 'B1', allowance: [950, 1250], hub: 'hospitality', visaSlug: 'gastronomie-hotel' },
  mechatroniker: { slug: 'mechatroniker', years: 3.5, germanLevel: 'B1', allowance: [950, 1300], hub: 'mechatronics', visaSlug: 'industrie-technik' },
  elektroniker: { slug: 'elektroniker', years: 3.5, germanLevel: 'B1', allowance: [900, 1400], hub: 'electrician', visaSlug: 'industrie-technik' },
  lagerlogistik: { slug: 'lagerlogistik', years: 3, germanLevel: 'A2–B1', allowance: [1000, 1300], hub: 'warehouse', visaSlug: 'industrie-technik' },
  berufskraftfahrer: { slug: 'berufskraftfahrer', years: 3, germanLevel: 'A2–B1', allowance: [950, 1250], hub: 'truck-driver', visaSlug: 'lkw-fahrer' },
};

/** Date the career texts and figures were last checked (sitemap lastmod, "as of" on the pages). */
export const CAREER_AS_OF = '2026-11-25';
export const CAREER_LASTMOD = new Date(`${CAREER_AS_OF}T00:00:00.000Z`);
