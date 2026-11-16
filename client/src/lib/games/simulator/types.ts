/**
 * Bürgeramt simulator (/german-simulator): scripted dialogue scenes as data. A scene is a directed graph of
 * nodes; every non-final node is a line spoken by the other person (in German, translated) and offers exactly
 * three replies. Good replies move on, weak ones still work but cost points, rude or wrong ones branch to a
 * realistic consequence from which you can usually recover. Final nodes close the scene with an outcome and a
 * short explanation. The graph is acyclic, so every path ends (scenes.test.ts checks it).
 */
import type { Tx, TxNoDe } from '@/lib/games/common';

export type Quality = 'good' | 'ok' | 'bad';
export type Outcome = 'success' | 'partial' | 'fail';

export interface Choice {
  quality: Quality;
  de: string;
  tx: TxNoDe;
  next: string;
  /** Why this reply is weak or wrong (shown after choosing; good replies get a generic "well done"). */
  feedback?: Tx;
}

export interface SceneNode {
  id: string;
  /** What the other person says (German). */
  de: string;
  tx: TxNoDe;
  choices: Choice[];
  /** Final nodes only. */
  end?: { outcome: Outcome; summary: Tx };
}

export interface KeyPhrase {
  de: string;
  tx: TxNoDe;
  /** /glossary/:slug of the term, when it has one. */
  glossary?: string;
}

export interface Scene {
  id: string;
  title: Tx;
  /** Where you are and who you talk to (UI language). */
  setting: Tx;
  /** Name / role of the other person, shown above their lines (German, e.g. "Sachbearbeiterin"). */
  speaker: string;
  start: string;
  nodes: SceneNode[];
  phrases: KeyPhrase[];
}

export const POINTS: Record<Quality, number> = { good: 2, ok: 1, bad: 0 };

// ─── compact builders for the scene files ─────────────────────────────────────

type T5 = [az: string, en: string, ru: string, tr: string, uk: string];
type T6 = [az: string, de: string, en: string, ru: string, tr: string, uk: string];

export const t5 = ([az, en, ru, tr, uk]: T5): TxNoDe => ({ az, en, ru, tr, uk });
export const t6 = ([az, de, en, ru, tr, uk]: T6): Tx => ({ az, de, en, ru, tr, uk });

/** A reply: quality, German, translations, next node, optional feedback. */
export const reply = (quality: Quality, de: string, tx: T5, next: string, feedback?: T6): Choice => ({ quality, de, tx: t5(tx), next, feedback: feedback ? t6(feedback) : undefined });

export const line = (id: string, de: string, tx: T5, choices: Choice[]): SceneNode => ({ id, de, tx: t5(tx), choices });

export const ending = (id: string, de: string, tx: T5, outcome: Outcome, summary: T6): SceneNode => ({ id, de, tx: t5(tx), choices: [], end: { outcome, summary: t6(summary) } });

export const phrase = (de: string, tx: T5, glossary?: string): KeyPhrase => ({ de, tx: t5(tx), glossary });

// ─── playing ─────────────────────────────────────────────────────────────────

export interface Step {
  node: string;
  choice: number;
}

/** Score of a finished or running path: points over the maximum (2 per reply), as a percentage. */
export const scorePath = (scene: Scene, steps: Step[]) => {
  const byId = new Map(scene.nodes.map((n) => [n.id, n]));
  const points = steps.reduce((s, st) => s + POINTS[byId.get(st.node)?.choices[st.choice]?.quality ?? 'bad'], 0);
  const max = steps.length * POINTS.good;
  return { points, max, percent: max ? Math.round((points / max) * 100) : 0 };
};
