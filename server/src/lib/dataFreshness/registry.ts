import {
  CURRENT_PARAMS,
  DEUTSCHLANDTICKET_STEPS,
  MINIMUM_WAGE_STEPS,
  deutschlandticketAt,
  minimumWageAt,
  stepAt,
} from '../budget/params.js';
import { GLOSSARY_AS_OF } from '../glossary/types.js';

/**
 * Data freshness registry (/admin/data-freshness): every time-sensitive figure or dated data set of the site, with
 * where it lives, its official source and when it must be checked again. Pure (no DB, no Node APIs).
 *
 * Drift protection: `value` is read from the real constant where the server can import it (budget params,
 * glossary); every `files[].needle` must occur verbatim in that file — tests/unit/dataFreshness.test.ts reads the
 * files, so changing a figure without updating this registry (or the other way round) fails CI.
 *
 * Yearly routine: most items are due on 1 January. After checking (and fixing the code), an admin clicks
 * "mark reviewed"; the next due date then moves one cadence ahead (lib/dataFreshness/schedule.ts). When a figure
 * changes in code, update `value` / the needle here and, if the next step is already known, `upcoming`.
 */

export type FreshnessCategory = 'wage' | 'tax' | 'social' | 'household' | 'residence' | 'fees' | 'health' | 'content' | 'calendar';
export const FRESHNESS_CATEGORIES: readonly FreshnessCategory[] = ['wage', 'tax', 'social', 'household', 'residence', 'fees', 'health', 'content', 'calendar'];

/** How often the item comes due again after a review. `once`: a single check (e.g. a dated switch). */
export type FreshnessCadence = 'yearly' | 'halfYearly' | 'once';

export interface FreshnessFile {
  /** Repository-relative path (forward slashes). */
  path: string;
  /** Exact text that must occur in the file (the current figure); checked by the unit test. */
  needle?: string;
}

export interface FreshnessItem {
  id: string;
  category: FreshnessCategory;
  label: { az: string; en: string };
  /** Current value as shown on the site (read from the source constant where possible). */
  value: string;
  files: FreshnessFile[];
  /** Search pattern for texts that repeat the figure (grep -rE in client/src, server/src, server/prisma/seed). */
  grep?: string;
  source: { label: string; url: string };
  /** First due date (ISO day). Later due dates follow `cadence` (lib/dataFreshness/schedule.ts). */
  reviewBy: string;
  cadence: FreshnessCadence;
  /** Known next value. `implemented`: the code already switches on that date. */
  upcoming?: { value: string; from: string; status: 'enacted' | 'decided' | 'proposed' | 'expected'; implemented: boolean };
  note: { az: string; en: string };
}

const eur = (n: number) => `${n.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })} €`;
const pct = (n: number) => `${Math.round(n * 1000) / 10} %`;
const P = CURRENT_PARAMS.payroll;
const C = CURRENT_PARAMS.costs;
const nextStep = (steps: readonly { from: string; value: number }[]) => steps[steps.length - 1];
const PARAMS = 'server/src/lib/budget/params.ts';
const CASE_AI = 'server/src/lib/ai/features/caseAi/config.ts';
const CITIES = 'client/src/lib/cities/data.ts';

export const FRESHNESS_ITEMS: readonly FreshnessItem[] = [
  // ── wages ──────────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'minimum-wage',
    category: 'wage',
    label: { az: 'Qanuni minimum əmək haqqı (saatlıq)', en: 'Statutory minimum wage (per hour)' },
    value: `${eur(minimumWageAt())} (since ${stepAt(MINIMUM_WAGE_STEPS).from})`,
    files: [
      { path: PARAMS, needle: "{ from: '2027-01-01', value: 14.6 }" },
      { path: CASE_AI, needle: "'2026': 13.9, '2027': 14.6" },
      { path: 'server/src/lib/officialForms/ezbWizard.ts', needle: "isoDay >= '2027-01-01' ? 14.6 : 13.9" },
    ],
    grep: '13[,.]90|14[,.]60',
    source: { label: 'MiLoV5 (BGBl. 2025 I Nr. 268)', url: 'https://www.gesetze-im-internet.de/milov5/BJNR10C0A0025.html' },
    reviewBy: '2027-07-01',
    cadence: 'yearly',
    upcoming: { value: eur(nextStep(MINIMUM_WAGE_STEPS).value), from: nextStep(MINIMUM_WAGE_STEPS).from, status: 'enacted', implemented: true },
    note: {
      az: '14,60 € 1.1.2027-dən kodda avtomatik keçir (params.ts MINIMUM_WAGE_STEPS). Mindestlohnkommission 2027-ci ilin ortasında 2028 üçün qərar verəcək — onda yeni addım əlavə edin; 2027-dən sonra mətnlərdə "13,90" qalmasın.',
      en: '14.60 € switches automatically on 1.1.2027 (params.ts MINIMUM_WAGE_STEPS). The Mindestlohnkommission decides the 2028 value around mid-2027 — add a step then; after 1.1.2027 texts should no longer present 13.90 € as current.',
    },
  },
  {
    id: 'minijob-limit',
    category: 'wage',
    label: { az: 'Minijob həddi / Midijob (Übergangsbereich)', en: 'Mini-job limit / midi-job range' },
    value: `${eur(P.minijobUpTo)} / ${eur(P.minijobUpTo + 0.01)}–${eur(P.midijobUpTo)}`,
    files: [
      { path: PARAMS, needle: 'minijobUpTo: 603,' },
      { path: 'client/src/i18n/pagesEmployerCost.ts', needle: '603 €' },
      { path: 'client/src/i18n/pagesTaxClass.ts', needle: '603 €' },
      { path: 'client/src/i18n/pagesTools.ts', needle: '603 €' },
    ],
    grep: '\\b603\\b',
    source: { label: 'Minijob-Zentrale: Minijob-Grenze 2027', url: 'https://magazin.minijob-zentrale.de/minijob-grenze-2027' },
    reviewBy: '2027-01-01',
    cadence: 'yearly',
    upcoming: { value: '633 € (633.01–2,000 €)', from: '2027-01-01', status: 'enacted', implemented: false },
    note: {
      az: 'Hədd minimum əmək haqqından hesablanır (× 130 / 3, § 8 Abs. 1a SGB IV): 2027-də 633 €. 2027 vergi parametrləri ilə birlikdə params.ts-də yeniləyin və mətnlərdəki "603"-ü dəyişin.',
      en: 'Derived from the minimum wage (× 130 / 3, § 8(1a) SGB IV): 633 € in 2027. Update params.ts together with the 2027 payroll parameters and replace "603" in the texts.',
    },
  },
  {
    id: 'construction-tariffs',
    category: 'wage',
    label: { az: 'Tikinti tarifləri (Bau LG3, rəssam minimumu)', en: 'Construction tariffs (Bau wage group 3, painters’ minimum)' },
    value: 'Bau LG3 23.97 €/h (1.4.2026); painters 16.13 €/h (1.7.2026)',
    files: [{ path: 'server/prisma/seed/guideDrafts/professions/bau.ts', needle: '23,97' }],
    source: { label: 'TV Mindestlohn Maler § 2 (painters; Bau LG3: IG BAU / SOKA-BAU tariff tables)', url: 'https://www.gesetze-im-internet.de/tvmindestlohn_maler_12/__2.html' },
    reviewBy: '2027-04-01',
    cadence: 'yearly',
    note: {
      az: 'Tarif addımları adətən 1 aprel / 1 iyul tarixlərindədir. Bələdçi mətni (seed) dəyişsə, admin bələdçisini də yeniləyin.',
      en: 'Tariff steps usually start on 1 April / 1 July. If the guide draft (seed) changes, update the published guide in the admin too.',
    },
  },
  // ── tax ────────────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'income-tax-tariff',
    category: 'tax',
    label: { az: 'Gəlir vergisi tarifi, Grundfreibetrag, PAP', en: 'Income tax tariff, basic allowance, wage-tax PAP' },
    value: `${P.year}: Grundfreibetrag ${eur(P.tax.gfb)}, Arbeitnehmer-Pauschbetrag ${eur(P.tax.anp)}, Kinderfreibetrag ${eur(P.tax.kfbFull)}`,
    files: [
      { path: PARAMS, needle: 'gfb: 12_348,' },
      { path: 'server/src/lib/glossary/terms/tax.ts', needle: '12.348' },
    ],
    grep: '12[.,  ]348|12_348|1[.,]230',
    source: { label: 'BMF – Programmablaufplan Lohnsteuer', url: 'https://www.bundesfinanzministerium.de/Web/DE/Themen/Steuern/Steuerarten/Lohnsteuer/Programmablaufplan/programmablaufplan.html' },
    reviewBy: '2027-01-01',
    cadence: 'yearly',
    upcoming: { value: 'Grundfreibetrag 12,564 €, ANP 1,430 € (Einkommensteuerreformgesetz 2027)', from: '2027-01-01', status: 'proposed', implemented: false },
    note: {
      az: 'BMF hər noyabrda növbəti ilin PAP-ını dərc edir. params.ts-də BUDGET_PARAMS_2027 yaradın, CURRENT_PARAMS-ı ona yönləndirin, budgetPayroll.test.ts istinad dəyərlərini PAP Prüftabelle ilə yeniləyin.',
      en: 'The BMF publishes the next PAP every November. Copy BUDGET_PARAMS_2026 to BUDGET_PARAMS_2027 in params.ts, point CURRENT_PARAMS at it and update the reference values in budgetPayroll.test.ts from the PAP test table.',
    },
  },
  {
    id: 'kindergeld',
    category: 'tax',
    label: { az: 'Kindergeld (uşaq pulu)', en: 'Kindergeld (child benefit)' },
    value: `${eur(C.kindergeld)} per child / month`,
    files: [
      { path: PARAMS, needle: 'kindergeld: 259,' },
      { path: CITIES, needle: 'export const KINDERGELD = 259;' },
      { path: 'server/src/lib/glossary/terms/family.ts', needle: '259 €' },
    ],
    grep: '\\b259 ?€|€ ?259\\b',
    source: { label: 'Familienkasse – Kindergeld', url: 'https://www.arbeitsagentur.de/familie-und-kinder/kindergeld' },
    reviewBy: '2027-01-01',
    cadence: 'yearly',
    upcoming: { value: '267 € (proposed, Einkommensteuerreformgesetz 2027)', from: '2027-01-01', status: 'proposed', implemented: false },
    note: {
      az: 'Qanun qəbul olunarsa 2027: 267 €. Server (params.ts), sayt (cities/data.ts, LifeArticle FALLBACK, BudgetCalculator fallback) və lüğət mətnlərini birlikdə dəyişin.',
      en: 'If the bill passes: 267 € in 2027. Change server (params.ts), site (cities/data.ts, LifeArticle FALLBACK, BudgetCalculator fallback) and glossary texts together.',
    },
  },
  // ── social insurance ───────────────────────────────────────────────────────────────────────────────────
  {
    id: 'social-insurance-limits',
    category: 'social',
    label: { az: 'Sosial sığorta hədləri (BBG, JAEG)', en: 'Social insurance ceilings (BBG, JAEG)' },
    value: `BBG RV/ALV ${eur(P.social.bbgRvAlvYear)}, KV/PV ${eur(P.social.bbgKvPvYear)}, JAEG ${eur(P.social.jaegYear)} / year`,
    files: [
      { path: PARAMS, needle: 'bbgRvAlvYear: 101_400,' },
      { path: PARAMS, needle: 'jaegYear: 77_400,' },
    ],
    source: { label: 'Bundesregierung – Beitragsbemessungsgrenzen 2027', url: 'https://www.bundesregierung.de/breg-de/bundesregierung/bundeskanzleramt/beitragsbemessungsgrenzen-2027-2454638' },
    reviewBy: '2027-01-01',
    cadence: 'yearly',
    upcoming: { value: 'BBG RV/ALV 106,200 €, KV/PV 76,500 €, JAEG 84,150 €', from: '2027-01-01', status: 'decided', implemented: false },
    note: {
      az: 'Kabinet təsdiqləyib, Bundesrat gözlənilir. Blue Card / § 18(2) / § 19c hədləri RV BBG-dən hesablanır — onları da yeniləyin.',
      en: 'Cabinet-approved, Bundesrat pending. The Blue Card / § 18(2) / § 19c thresholds derive from the pension BBG — update them too.',
    },
  },
  {
    id: 'contribution-rates',
    category: 'social',
    label: { az: 'Sığorta faizləri (orta Zusatzbeitrag, RV, PV, ALV)', en: 'Contribution rates (average Zusatzbeitrag, pension, care, unemployment)' },
    value: `avg. Zusatzbeitrag ${pct(P.social.averageZusatzbeitrag)}, RV ${pct(P.social.pensionEmployee * 2)}, ALV ${pct(P.social.unemploymentEmployee * 2)}, PV ${pct(P.social.careEmployee * 2)}`,
    files: [{ path: PARAMS, needle: 'averageZusatzbeitrag: 0.029,' }],
    source: { label: 'BMG – Zusatzbeitragssatz 2027', url: 'https://www.bundesgesundheitsministerium.de/presse/pressemitteilungen/zusatzbeitragssatz-gkv-2027-festgelegt' },
    reviewBy: '2027-01-01',
    cadence: 'yearly',
    upcoming: { value: 'avg. Zusatzbeitrag 2.9 % (unchanged)', from: '2027-01-01', status: 'decided', implemented: true },
    note: {
      az: 'Orta Zusatzbeitrag 2027 üçün də 2,9 %. RV 18,6 % hələ Rentenversicherungsbericht ilə təsdiqlənməlidir; PV/ALV dəyişikliklərini yoxlayın.',
      en: 'Average Zusatzbeitrag stays 2.9 % in 2027. Pension 18.6 % still to be confirmed by the Rentenversicherungsbericht; check care / unemployment too.',
    },
  },
  {
    id: 'health-insurance-funds',
    category: 'health',
    label: { az: 'Xəstəlik kassaları və Zusatzbeitrag (müqayisə)', en: 'Health insurance funds and their Zusatzbeitrag (comparison)' },
    value: 'checked 2026-11-16',
    files: [{ path: 'client/src/lib/healthInsurance/data.ts', needle: "export const KASSEN_CHECKED = '2026-11-16';" }],
    source: { label: 'GKV-Spitzenverband – Krankenkassenliste', url: 'https://www.gkv-spitzenverband.de/service/krankenkassenliste/krankenkassen.jsp' },
    reviewBy: '2027-01-01',
    cadence: 'halfYearly',
    note: {
      az: 'Kassalar faizləri adətən 1 yanvarda (bəzən il ərzində) dəyişir. Hər kassanı yoxlayın, KASSEN_CHECKED tarixini yeniləyin.',
      en: 'Funds usually change their rate on 1 January (sometimes mid-year). Check each fund and update KASSEN_CHECKED.',
    },
  },
  // ── household costs ────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'deutschlandticket',
    category: 'household',
    label: { az: 'Deutschlandticket qiyməti', en: 'Deutschlandticket price' },
    value: `${eur(deutschlandticketAt())} / month (since ${stepAt(DEUTSCHLANDTICKET_STEPS).from})`,
    files: [
      { path: PARAMS, needle: "{ from: '2027-01-01', value: 66.8 }" },
      { path: CITIES, needle: 'export const DEUTSCHLANDTICKET = deutschlandticketAt();' },
      { path: 'client/src/i18n/pagesWhichCity.ts', needle: '{{ticket}} €' },
    ],
    grep: 'Deutschlandticket.{0,40}63|63 €.{0,20}Deutschlandticket',
    source: { label: 'StMB Bayern – Deutschlandticket 2027 (VMK)', url: 'https://www.stmb.bayern.de/med/pressemitteilungen/pressearchiv/2026/115/index.php' },
    reviewBy: '2027-01-01',
    cadence: 'yearly',
    upcoming: { value: eur(nextStep(DEUTSCHLANDTICKET_STEPS).value), from: nextStep(DEUTSCHLANDTICKET_STEPS).from, status: 'decided', implemented: true },
    note: {
      az: '66,80 € 1.1.2027-dən kodda avtomatik (DEUTSCHLANDTICKET_STEPS). Şəhər bələdçisi, qiymət oyunu və pagesWhichCity qiyməti avtomatik götürür; yalnız yükləmə fallback-ları (LifeArticle, BudgetCalculator) və grep nəticələri əl ilə yoxlanmalıdır.',
      en: '66.80 € switches automatically on 1.1.2027 (DEUTSCHLANDTICKET_STEPS). City guide, price game and pagesWhichCity read the dated price; only the loading fallbacks (LifeArticle, BudgetCalculator) and grep hits need a manual check.',
    },
  },
  {
    id: 'rundfunkbeitrag',
    category: 'household',
    label: { az: 'Rundfunkbeitrag (yayım haqqı)', en: 'Rundfunkbeitrag (broadcasting fee)' },
    value: `${eur(C.rundfunkMonthly)} / month per household`,
    files: [
      { path: PARAMS, needle: 'rundfunkMonthly: 18.36,' },
      { path: CITIES, needle: 'export const RUNDFUNK = 18.36;' },
      { path: 'client/src/i18n/apartment/en.ts', needle: '18.36 €' },
    ],
    grep: '18[.,]36',
    source: { label: 'ARD ZDF Deutschlandradio Beitragsservice', url: 'https://www.rundfunkbeitrag.de/' },
    reviewBy: '2027-01-01',
    cadence: 'yearly',
    upcoming: { value: '18.64 € (KEF recommendation; needs the state treaty / BVerfG ruling pending)', from: '2027-01-01', status: 'proposed', implemented: false },
    note: {
      az: 'Artım yalnız 16 Landtag ratifikasiya etsə və ya BVerfG qərarı ilə. Qüvvəyə minəndə bütün "18,36" mətnlərini dəyişin.',
      en: 'An increase needs ratification by all 16 Länder or a BVerfG ruling. When it takes effect, replace every "18.36" text.',
    },
  },
  {
    id: 'blocked-account',
    category: 'household',
    label: { az: 'Bloklanmış hesab (Sperrkonto) məbləği', en: 'Blocked account (Sperrkonto) amount' },
    value: `${eur(C.blockedAccountYear)} / year`,
    files: [{ path: PARAMS, needle: 'blockedAccountYear: 11_904,' }],
    source: { label: 'Auswärtiges Amt – FAQ Sperrkonto', url: 'https://www.auswaertiges-amt.de/de/visa-service/buergerservice/faq/12-sperrkonto-606850' },
    reviewBy: '2027-01-01',
    cadence: 'yearly',
    note: {
      az: 'Məbləğ BAföG Höchstsatz-a bağlıdır; Auswärtiges Amt saytında yoxlayın (xərc kalkulyatoru parametrləri də).',
      en: 'Tied to the BAföG maximum; check the Federal Foreign Office page (and the cost calculator settings).',
    },
  },
  {
    id: 'city-costs',
    category: 'household',
    label: { az: 'Şəhər xərcləri (kirayə, ərzaq, kommunal)', en: 'City costs (rent, food, utilities)' },
    value: 'checked 2026-10-26 (data year 2026)',
    files: [
      { path: 'server/src/lib/budget/cities.ts', needle: "export const CITY_COSTS_CHECKED_AT = '2026-10-26';" },
      { path: CITIES, needle: 'export const DATA_YEAR = 2026;' },
    ],
    source: { label: 'Destatis – Verbraucherpreisindex', url: 'https://www.destatis.de/DE/Themen/Wirtschaft/Preise/Verbraucherpreisindex/_inhalt.html' },
    reviewBy: '2027-01-01',
    cadence: 'yearly',
    note: {
      az: 'Admin → Sayt → Şəhər xərcləri cədvəli və sayt üçün cities/data.ts aralıqları. Kirayə indekslərini yeniləyin, DATA_YEAR-ı artırın.',
      en: 'Admin → Site → City costs table and the ranges in cities/data.ts. Refresh rent indices and bump DATA_YEAR.',
    },
  },
  {
    id: 'price-game',
    category: 'household',
    label: { az: 'Qiymət oyunu məhsulları', en: 'Price game items' },
    value: 'as of 2026-11',
    files: [{ path: 'client/src/lib/games/price/items.ts', needle: "export const PRICE_AS_OF = '2026-11';" }],
    source: { label: 'Destatis – Verbraucherpreise', url: 'https://www.destatis.de/DE/Themen/Wirtschaft/Preise/Verbraucherpreisindex/_inhalt.html' },
    reviewBy: '2027-05-01',
    cadence: 'halfYearly',
    note: { az: '"estimate" qiymətlərini market saytları ilə müqayisə edin.', en: 'Sanity-check the "estimate" prices against retailer sites.' },
  },
  // ── residence law ──────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'blue-card-thresholds',
    category: 'residence',
    label: { az: 'Mavi Kart və 45+ yaş maaş hədləri', en: 'Blue Card and age-45+ salary thresholds' },
    value: '2026: 50,700 € / 45,934.20 € (shortage), 45+: 55,770 €, § 19c(2): 45,630 €',
    files: [
      { path: CASE_AI, needle: "'2026': { standard: 50_700, shortage: 45_934.2 }" },
      { path: CASE_AI, needle: "'2026': 55_770" },
      { path: 'server/src/lib/visaChecklist/index.ts', needle: '50.700' },
      { path: 'server/src/lib/glossary/terms/residence.ts', needle: '50.700 €' },
      { path: 'client/src/lib/seoContent/blueCard.ts', needle: '50,700 €' },
    ],
    grep: '50[.,  ]700|45[.,  ]934|55[.,  ]770|45[.,  ]630',
    source: { label: 'Make it in Germany – Blaue Karte EU', url: 'https://www.make-it-in-germany.com/de/visum-aufenthalt/arten/blaue-karte-eu' },
    reviewBy: '2027-01-01',
    cadence: 'yearly',
    upcoming: { value: 'expected 53,100 € / 48,108.60 €, 45+: 58,410 €, § 19c(2): 47,790 € (from BBG 106,200 €)', from: '2027-01-01', status: 'expected', implemented: false },
    note: {
      az: 'BMI rəqəmləri Bundesanzeiger-də dekabrda dərc edir. caseAi BLUE_CARD/OLDER_WORKER cədvəllərinə 2027 sətri əlavə edin (və ya admin panelində), sonra mətnləri (grep) yeniləyin; bələdçilər admin paneldə də.',
      en: 'The BMI publishes the figures in the Bundesanzeiger in December. Add a 2027 row to caseAi BLUE_CARD / OLDER_WORKER (or in the admin settings), then update the texts (grep); guides also in the admin.',
    },
  },
  {
    id: 'permanent-residence-rules',
    category: 'residence',
    label: { az: 'Daimi yaşayış və vətəndaşlıq qaydaları', en: 'Settlement permit and naturalisation rules' },
    value: 'as of 2026-11',
    files: [{ path: 'client/src/lib/permanentResidence/calc.ts', needle: "export const PR_AS_OF = '2026-11';" }],
    source: { label: 'AufenthG § 9', url: 'https://www.gesetze-im-internet.de/aufenthg_2004/__9.html' },
    reviewBy: '2027-05-01',
    cadence: 'halfYearly',
    note: { az: '§ 9, § 18c, § 28 AufenthG və StAG § 10 dəyişikliklərini yoxlayın.', en: 'Check §§ 9, 18c, 28 AufenthG and § 10 StAG for amendments.' },
  },
  {
    id: 'baku-reference-figures',
    category: 'wage',
    label: { az: 'Bakı/Azərbaycan rəqəmləri (ailəyə pul, 5 il)', en: 'Baku / Azerbaijan figures (money for family, 5 years)' },
    value: 'min. wage 400 AZN, subsistence 317 AZN, pension 595 AZN, avg wage 1,176.7 AZN, sector wages 2025',
    files: [{ path: 'client/src/lib/moneyHome/data.ts', needle: "export const MONEY_HOME_AS_OF = '2026-11-17';" }],
    source: { label: 'stat.gov.az – labour market', url: 'https://www.stat.gov.az/source/labour/?lang=en' },
    reviewBy: '2027-03-01',
    cadence: 'halfYearly',
    note: {
      az: 'Minimum əmək haqqı, 2027 yaşayış minimumu (qanun), DSMF orta pensiyası, stat.gov.az orta maaş və sahələr üzrə maaşlar (azfigures 2027), Bakı kirayəsi təxmini və Dünya Bankı köçürmə xərclərini yeniləyin.',
      en: 'Update the minimum wage, the 2027 subsistence minimum (law), the DSMF average pension, stat.gov.az average and sector wages (azfigures 2027), the Baku rent estimate and the World Bank remittance costs.',
    },
  },
  {
    id: 'rental-disclosure-dsk',
    category: 'household',
    label: { az: 'Mieterselbstauskunft (DSK Orientierungshilfe)', en: 'Tenant self-disclosure (DSK guidance)' },
    value: 'DSK Orientierungshilfe V2.0 (January 2026); SCHUFA BonitätsCheck about 29.95 €',
    files: [
      { path: 'client/src/lib/rentalDisclosure.ts', needle: "export const DISCLOSURE_AS_OF = '2026-11-17';" },
      { path: 'server/src/lib/rentalDisclosure/schema.ts', needle: 'Version 2.0, Stand Januar 2026' },
    ],
    source: { label: 'Datenschutzkonferenz – Orientierungshilfen', url: 'https://www.datenschutzkonferenz-online.de/orientierungshilfen.html' },
    reviewBy: '2027-05-17',
    cadence: 'yearly',
    note: {
      az: 'DSK-nın yeni versiyasını, § 551 BGB və SCHUFA qiymətini yoxlayın; sahələri server schema.ts və client rentalDisclosure.ts-də birlikdə dəyişin.',
      en: 'Check for a new DSK version, § 551 BGB and the SCHUFA price; change fields in server schema.ts and client rentalDisclosure.ts together.',
    },
  },
  {
    id: 'visa-checklists',
    category: 'residence',
    label: { az: 'Viza sənəd siyahıları (Bakı səfirliyi)', en: 'Visa document checklists (Baku embassy)' },
    value: 'as of 2026-11-16',
    files: [{ path: 'server/src/lib/visaChecklist/index.ts', needle: "export const CHECKLIST_AS_OF = '2026-11-16';" }],
    source: { label: 'Deutsche Botschaft Baku – Visa', url: 'https://baku.diplo.de/az-de/konsularservice/visa-und-einreise' },
    reviewBy: '2027-05-16',
    cadence: 'halfYearly',
    note: { az: 'Səfirliyin məlumat vərəqələri və Auslandsportal siyahıları ilə müqayisə edin.', en: 'Compare with the embassy leaflets and the Auslandsportal lists.' },
  },
  {
    id: 'ezb-form',
    category: 'residence',
    label: { az: 'Erklärung zum Beschäftigungsverhältnis forması', en: 'Erklärung zum Beschäftigungsverhältnis form' },
    value: 'checked 2026-11-16',
    files: [{ path: 'server/src/lib/officialForms/ezbWizard.ts', needle: "export const EZB_CHECKED = '2026-11-16';" }],
    source: { label: 'Bundesagentur für Arbeit – Formulare', url: 'https://www.arbeitsagentur.de/unternehmen/arbeitskraefte/fachkraefte-ausland' },
    reviewBy: '2027-05-16',
    cadence: 'halfYearly',
    note: { az: 'BA formanın yeni versiyasını dərc edibmi?', en: 'Has the BA published a new version of the form?' },
  },
  {
    id: 'family-reunion-rules',
    category: 'residence',
    label: { az: 'Ailə birləşməsi qaydaları', en: 'Family reunion rules' },
    value: 'as of 2026-10',
    files: [{ path: 'server/src/lib/family/legal.ts', needle: "asOf: '2026-10'" }],
    source: { label: 'AufenthG §§ 27–36', url: 'https://www.gesetze-im-internet.de/aufenthg_2004/__30.html' },
    reviewBy: '2027-04-01',
    cadence: 'halfYearly',
    note: { az: 'Dil tələbləri və subsidiar müdafiə ilə bağlı dəyişiklikləri yoxlayın.', en: 'Check language requirements and other amendments.' },
  },
  // ── fees ───────────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'visa-fee',
    category: 'fees',
    label: { az: 'Milli viza rüsumu', en: 'National visa fee' },
    value: '75 €',
    files: [
      { path: CASE_AI, needle: 'Visumgebühr 75 €' },
      { path: 'server/src/lib/glossary/terms/residence.ts', needle: '75 €' },
      { path: 'client/src/lib/publicCalc/employerCost.ts', needle: 'national visa 75 €' },
    ],
    grep: '\\b75 ?€|€ ?75\\b',
    source: { label: 'AufenthV § 46', url: 'https://www.gesetze-im-internet.de/aufenthv/__46.html' },
    reviewBy: '2027-01-01',
    cadence: 'yearly',
    note: { az: 'AufenthV dəyişikliyi və TLScontact servis haqqını yoxlayın.', en: 'Check for AufenthV amendments and the TLScontact service fee.' },
  },
  {
    id: 'fast-track-fee',
    category: 'fees',
    label: { az: '§ 81a sürətləndirilmiş prosedur rüsumu', en: '§ 81a fast-track procedure fee' },
    value: '411 €',
    files: [
      { path: 'client/src/lib/publicCalc/employerCost.ts', needle: 'acceleratedFee: 411,' },
      { path: 'server/src/lib/glossary/terms/residence.ts', needle: '411 €' },
    ],
    grep: '\\b411\\b',
    source: { label: 'AufenthV § 47', url: 'https://www.gesetze-im-internet.de/aufenthv/__47.html' },
    reviewBy: '2027-01-01',
    cadence: 'yearly',
    note: { az: 'AufenthV § 47 Abs. 1 Nr. 15.', en: 'AufenthV § 47(1) no. 15.' },
  },
  // ── content data sets ──────────────────────────────────────────────────────────────────────────────────
  {
    id: 'glossary',
    category: 'content',
    label: { az: 'Lüğət (məbləğlər, linklər)', en: 'Glossary (amounts, links)' },
    value: `as of ${GLOSSARY_AS_OF}`,
    files: [{ path: 'server/src/lib/glossary/types.ts', needle: `export const GLOSSARY_AS_OF = '${GLOSSARY_AS_OF}';` }],
    source: { label: 'Gesetze im Internet', url: 'https://www.gesetze-im-internet.de/' },
    reviewBy: '2027-01-01',
    cadence: 'yearly',
    note: {
      az: 'Kindergeld, Grundsicherung, Grundfreibetrag kimi məbləğləri və rəsmi linkləri (404) yoxlayın, GLOSSARY_AS_OF-u yeniləyin.',
      en: 'Check amounts (Kindergeld, Grundsicherung, Grundfreibetrag …) and official links (404s), then bump GLOSSARY_AS_OF.',
    },
  },
  {
    id: 'shortage-occupations',
    category: 'content',
    label: { az: 'Kadr çatışmazlığı peşələri (Engpassanalyse)', en: 'Shortage occupations (Engpassanalyse)' },
    value: 'as of 2026-11-16',
    files: [{ path: 'client/src/lib/shortage/data.ts', needle: "export const SHORTAGE_AS_OF = '2026-11-16';" }],
    source: { label: 'BA – Engpassanalyse', url: 'https://statistik.arbeitsagentur.de/DE/Navigation/Statistiken/Interaktive-Statistiken/Fachkraeftebedarf/Engpassanalyse-Nav.html' },
    reviewBy: '2027-07-01',
    cadence: 'yearly',
    note: { az: 'BA Engpassanalyse adətən yayda dərc olunur.', en: 'The BA usually publishes the Engpassanalyse in summer.' },
  },
  {
    id: 'country-comparison',
    category: 'content',
    label: { az: 'Ölkə müqayisəsi (DE, AT, PL, CZ …)', en: 'Country comparison (DE, AT, PL, CZ …)' },
    value: 'as of 2026-11-16',
    files: [{ path: 'client/src/lib/countryCompare/data.ts', needle: "export const COUNTRY_AS_OF = '2026-11-16';" }],
    source: { label: 'Make it in Germany', url: 'https://www.make-it-in-germany.com/' },
    reviewBy: '2027-05-16',
    cadence: 'halfYearly',
    note: { az: 'Minimum maaşlar, viza rüsumları və müddətlər hər ölkədə dəyişə bilər.', en: 'Minimum wages, visa fees and deadlines change in every country.' },
  },
  {
    id: 'salary-figures',
    category: 'content',
    label: { az: 'Peşə səhifələrində maaş aralıqları', en: 'Salary ranges on profession pages' },
    value: 'as of 2026-11-16',
    files: [{ path: 'client/src/lib/professionHubs.ts', needle: "export const HUB_SALARY_AS_OF = '2026-11-16';" }],
    source: { label: 'BA Entgeltatlas', url: 'https://web.arbeitsagentur.de/entgeltatlas/' },
    reviewBy: '2027-06-01',
    cadence: 'yearly',
    note: { az: 'Entgeltatlas adətən yazda yenilənir.', en: 'The Entgeltatlas is usually updated in spring.' },
  },
  {
    id: 'public-calculators',
    category: 'content',
    label: { az: 'İctimai kalkulyatorlar (işəgötürən xərci, növbə, vergi sinfi, kirayə)', en: 'Public calculators (employer cost, shift pay, tax class, rent check)' },
    value: 'checked 2026-11-16',
    files: [
      { path: 'client/src/lib/publicCalc/employerCost.ts', needle: "export const EMPLOYER_COST_CHECKED = '2026-11-16';" },
      { path: 'client/src/lib/publicCalc/shiftPay.ts', needle: "export const SHIFT_CHECKED = '2026-11-16';" },
      { path: 'client/src/lib/publicCalc/taxClass.ts', needle: "export const TAX_CLASS_CHECKED = '2026-11-16';" },
      { path: 'client/src/lib/publicCalc/rentCheck.ts', needle: "export const RENT_CHECKED = '2026-11-16';" },
    ],
    source: { label: 'BMF Steuerrechner', url: 'https://www.bmf-steuerrechner.de/' },
    reviewBy: '2027-01-01',
    cadence: 'yearly',
    note: {
      az: 'Payroll parametrləri params.ts-dən gəlir; burada yalnız səhifə mətnləri, U1/U2/U3 faizləri, tarixlər.',
      en: 'Payroll figures come from params.ts; check the page texts, U1/U2/U3 levies and the "checked" dates here.',
    },
  },
  {
    id: 'work-time-rules',
    category: 'content',
    label: { az: 'İş vaxtı və sürücü vaxtı qaydaları, cərimələr', en: 'Working-time and driving-time rules, fines' },
    value: 'checked 2026-11-16',
    files: [
      { path: 'client/src/lib/publicCalc/drivingTime.ts', needle: "export const DRIVING_CHECKED = '2026-11-16';" },
      { path: 'client/src/lib/publicCalc/workSchedule.ts', needle: "export const SCHEDULE_CHECKED = '2026-11-16';" },
    ],
    source: { label: 'ArbZG', url: 'https://www.gesetze-im-internet.de/arbzg/' },
    reviewBy: '2027-11-16',
    cadence: 'yearly',
    note: { az: 'ArbZG islahatı (həftəlik maksimum) müzakirə olunur — izləyin.', en: 'An ArbZG reform (weekly maximum) is under discussion — watch it.' },
  },
  {
    id: 'explainer-pages',
    category: 'content',
    label: { az: 'İzah səhifələri (mənzil, iş səhnələri, eAT, imtina məktubu)', en: 'Explainer pages (apartment, work scenes, eAT card, refusal letter)' },
    value: 'as of 2026-11-16',
    files: [
      { path: 'client/src/lib/apartment/hotspots.ts', needle: "export const APARTMENT_AS_OF = '2026-11-16';" },
      { path: 'client/src/lib/workScenes/types.ts', needle: "export const WORK_SCENES_AS_OF = '2026-11-16';" },
      { path: 'client/src/lib/residenceCard/card.ts', needle: "export const RESIDENCE_CARD_AS_OF = '2026-11-16';" },
      { path: 'client/src/lib/visaRefusal/letter.ts', needle: "export const REFUSAL_AS_OF = '2026-11-16';" },
    ],
    source: { label: 'Gesetze im Internet', url: 'https://www.gesetze-im-internet.de/' },
    reviewBy: '2027-11-16',
    cadence: 'yearly',
    note: { az: 'Linkləri (404) və istinad edilən paraqrafları yoxlayın.', en: 'Check links (404s) and the cited sections.' },
  },
  {
    id: 'seo-content',
    category: 'content',
    label: { az: 'SEO məzmun səhifələri (yoxlanma tarixi)', en: 'SEO content pages ("checked" date)' },
    value: '11/2026',
    files: [{ path: 'client/src/lib/seoContent/types.ts', needle: 'export const CONTENT_CHECKED = { month: 11, year: 2026 } as const;' }],
    source: { label: 'Make it in Germany', url: 'https://www.make-it-in-germany.com/' },
    reviewBy: '2027-05-01',
    cadence: 'halfYearly',
    note: { az: 'Məzmundakı rəqəmləri yoxlayın, sonra CONTENT_CHECKED-i yeniləyin.', en: 'Check the figures in the content, then bump CONTENT_CHECKED.' },
  },
  // ── calendar ───────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'public-holidays',
    category: 'calendar',
    label: { az: 'Bayram günləri (illər aralığı)', en: 'Public holidays (range of years)' },
    value: '2026–2028',
    files: [{ path: 'client/src/lib/publicCalc/holidays.ts', needle: 'export const HOLIDAY_YEARS = [2026, 2027, 2028] as const;' }],
    source: { label: 'Feiertagsgesetze der Länder', url: 'https://www.bmi.bund.de/DE/themen/verfassung/staatliche-symbole/nationale-feiertage/nationale-feiertage-node.html' },
    reviewBy: '2027-10-01',
    cadence: 'yearly',
    note: {
      az: 'Hər payız növbəti ili əlavə edin (məs. 2029) və keçmiş ili çıxarın; yeni Land bayramlarını yoxlayın.',
      en: 'Every autumn add the next year (e.g. 2029) and drop the past one; check for new state holidays.',
    },
  },
];

export const freshnessItem = (id: string) => FRESHNESS_ITEMS.find((i) => i.id === id) ?? null;
