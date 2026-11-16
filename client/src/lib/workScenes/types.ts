/**
 * Work scenes (/work-scenes/*): interactive workplaces (restaurant kitchen, truck cab, hospital ward,
 * construction site, electrical panel) with hotspots that teach the German word, its pronunciation, a
 * translation, an explanation, the safety rule and a common mistake. Plain data, no React (unit-testable).
 *
 * Content lives in lib/workScenes/scenes/<scene>.ts as typed six-language texts (`Tx`), so a missing language
 * is a type error. UI copy: i18n/pagesWorkScenes.ts (keys ws.*).
 */
import type { Tx } from '@/lib/games/common';

export const SCENE_IDS = ['restaurant-kitchen', 'truck-cab', 'hospital-ward', 'construction-site', 'electrical-panel'] as const;
export type SceneId = (typeof SCENE_IDS)[number];

/** As-of date of the facts (safety rules, HACCP colours, 5 R, 5 safety rules …) shown on every scene page. */
export const WORK_SCENES_AS_OF = '2026-11-16';

export interface SceneSpot {
  /** Stable id (camelCase, ASCII), unique within the scene. */
  id: string;
  /** Marker position in the scene illustration's viewBox. */
  x: number;
  y: number;
  /** The German term with its article ("der Herd", "die Fahrerkarte"); "die …" for plural-only nouns. */
  de: string;
  /** Plural with article, when useful ("die Herde"). */
  plural?: string;
  /** A short German example sentence from daily work (read aloud too). */
  example: string;
  /** Translation of the term (de: a short German paraphrase / synonym). */
  name: Tx;
  /** What it is and what it is used for (1–3 sentences). */
  what: Tx;
  /** The safety / hygiene rule that belongs to it (verified, see the scene's sources). */
  safety: Tx;
  /** A typical mistake of newcomers. */
  mistake: Tx;
  /** Glossary slugs (/glossary/:slug, server lib/glossary/terms) — only existing ones. */
  glossary?: string[];
}

export interface SceneSource {
  /** Short label (organisation + document), shown as the link text. */
  label: string;
  url: string;
}

export interface WorkScene {
  id: SceneId;
  /** viewBox size of the illustration. */
  width: number;
  height: number;
  spots: SceneSpot[];
  sources: SceneSource[];
}
