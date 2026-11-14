import type { GuideLocale, GuidePageSeed } from '../../guides/types.js';
import { kochGuide } from './koch.js';
import { architektGuide } from './architekt.js';
import { buchhalterGuide } from './buchhalter.js';
import { oekonomGuide } from './oekonom.js';
import { zahnarztGuide } from './zahnarzt.js';
import { arztGuide } from './arzt.js';
import { ingenieurGuide } from './ingenieur.js';
import { elektronikerGuide } from './elektroniker.js';

/**
 * Profession-specific recognition guides ("подтверждение диплома повара в Германии" …), one key per profession,
 * written in az and ru (primary audience) plus de and en. tr / uk readers get the English version (guide lists
 * fall back to en for a missing language). Their facts were checked against official sources when they were
 * written (anerkennung-in-deutschland.de, IHK FOSA, ZAB / kmk.org, Bundesagentur für Arbeit, chambers and Land
 * authorities, BGBl.) and contain no review placeholder, so the seed creates them PUBLISHED (see
 * PUBLISHED_ON_CREATE_KEYS in ../index.ts). Like every draft, an existing row is never touched.
 *
 * Nurses (guide:pflege) and truck drivers (guide:driver-jobs) already have their own guides; the profession
 * guides link to them instead of duplicating them.
 */
export const PROFESSION_KEYS = [
  'anerkennung-koch',
  'anerkennung-architekt',
  'anerkennung-buchhalter',
  'anerkennung-oekonom',
  'anerkennung-zahnarzt',
  'anerkennung-arzt',
  'anerkennung-ingenieur',
  'anerkennung-elektroniker',
] as const;
export type ProfessionKey = (typeof PROFESSION_KEYS)[number];

export interface ProfessionGuide {
  key: ProfessionKey;
  pages: Partial<Record<GuideLocale, GuidePageSeed>>;
}

/** Languages every profession guide is written in. */
export const PROFESSION_LOCALES: readonly GuideLocale[] = ['az', 'ru', 'de', 'en'];

export const PROFESSION_GUIDES: ProfessionGuide[] = [
  kochGuide,
  architektGuide,
  buchhalterGuide,
  oekonomGuide,
  zahnarztGuide,
  arztGuide,
  ingenieurGuide,
  elektronikerGuide,
];

/** The profession guides of one language, by key (merged into the per-language draft maps). */
export const professionPages = (locale: GuideLocale): Partial<Record<ProfessionKey, GuidePageSeed>> =>
  Object.fromEntries(PROFESSION_GUIDES.flatMap((g) => (g.pages[locale] ? [[g.key, g.pages[locale]!]] : [])));
