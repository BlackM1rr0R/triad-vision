import type { SeoLocale } from '../seoCatalogue.js';
import type { ProfessionHubSlug } from '../professionHubs.js';

/**
 * Career landing content (profession hubs /for/<slug>, Ausbildung pages /ausbildung/<slug>, city pages
 * /cities/<slug>): the SEO texts that answer the job seekers' queries ("Almaniyada sürücü işi", "работа поваром
 * в Германии", "Almanya'da aşçı") — requirements, the visa path, how we work, FAQ, related pages.
 *
 * Written languages: az (main audience), ru, tr, en, de, uk (the Ukrainian texts are written natively, not machine-style).
 */
export const CAREER_LOCALES = ['az', 'ru', 'tr', 'en', 'de', 'uk'] as const satisfies readonly SeoLocale[];
export type CareerLocale = (typeof CAREER_LOCALES)[number];
export const isCareerLocale = (l: string): l is CareerLocale => (CAREER_LOCALES as readonly string[]).includes(l);

export interface Faq {
  q: string;
  a: string;
}

/** Profession hub texts of one language (the hub's h1 / intro / meta live in the client copy and the SEO catalogue). */
export interface HubCopy {
  /** Target search terms (shown to staff; not used for ranking). */
  keywords: string[];
  /** What the job needs: German level, licence, qualification / recognition. */
  requirements: string[];
  /** Which residence title and how (one paragraph). */
  visa: string;
  /** 5–6 questions specific to the profession (the shared ones are added after them). */
  faq: Faq[];
}

/** Ausbildung page texts of one language. */
export interface AusbildungCopy {
  keywords: string[];
  /** H1 and <title> (≤ 60 characters with " | Triad Vision" when it fits, else alone). */
  title: string;
  /** Meta description, 120–155 characters. */
  description: string;
  /** German occupation name as shown in the breadcrumb ("Pflegefachmann/-frau"). */
  name: string;
  intro: string;
  /** What the trainee learns and where they work. */
  about: string;
  requirements: string[];
  /** Training allowance paragraph (figures marked as estimates). */
  pay: string;
  /** After the training: job, salary orientation, residence. */
  after: string;
  faq: Faq[];
}

/** Language-neutral facts of an Ausbildung page. */
export interface AusbildungFacts {
  slug: AusbildungSlug;
  /** Training duration in years. */
  years: number;
  /** German level schools / employers usually ask for. */
  germanLevel: string;
  /** Indicative gross training allowance per month over the training years [low, high] in €. */
  allowance: readonly [number, number];
  /** Profession hub of the occupation. */
  hub: string;
  /** CMS visa category slug (/visas/<slug>) of the route after the training, if any. */
  visaSlug: string;
}

export const AUSBILDUNG_SLUGS = ['pflege', 'koch', 'hotelfach', 'mechatroniker', 'elektroniker', 'lagerlogistik', 'berufskraftfahrer'] as const;
export type AusbildungSlug = (typeof AUSBILDUNG_SLUGS)[number];

/** Shared labels and texts of one language. */
export interface SharedCopy {
  labels: {
    requirements: string;
    visa: string;
    visaLink: string;
    steps: string;
    faq: string;
    related: string;
    keywords: string;
    estimate: string;
    allowance: string;
    perMonth: string;
    years: string;
    germanLevel: string;
    about: string;
    after: string;
    ausbildungHub: string;
    ausbildungOthers: string;
    cities: string;
    cta: string;
    apply: string;
  };
  /** How we work, five steps (we prepare documents; the client applies; the embassy decides). */
  steps: { title: string; text: string }[];
  /** Questions every career page answers (no guarantee, no translation / apostille / appointments). */
  faq: Faq[];
  /** Allowance source note (Ausbildung pages). */
  allowanceNote: string;
}

export interface CareerCopy {
  hubs: Record<ProfessionHubSlug, HubCopy>;
  ausbildung: Record<AusbildungSlug, AusbildungCopy>;
  shared: SharedCopy;
}
