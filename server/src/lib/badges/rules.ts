/**
 * Client badges (achievements): deterministic rules over facts the portal already knows. Pure (unit-tested);
 * lib/badges/service.ts gathers the facts and stores what was earned with the date. A badge, once earned, is kept
 * (a later rejected document does not take "All documents uploaded" away). No ranking, no comparison with other
 * clients: badges are private to the client.
 */

export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type Level = (typeof LEVELS)[number];

export interface BadgeFacts {
  /** Profile completeness, 0–100 (routes/account.ts profileCompleteness). */
  profilePercent: number;
  /** Some own case has all its required documents uploaded (non-rejected file each; at least one required). */
  docsUploaded: boolean;
  /** Some own case has all its required documents accepted. */
  docsAccepted: boolean;
  contractSigned: boolean;
  visaApproved: boolean;
  arrived: boolean;
  /** Longest run of practice days in the vocabulary trainer. */
  bestStreak: number;
  /** Words with an interval of ≥ 21 days (lib/german/vocab isLearned). */
  wordsLearned: number;
  /** Highest German level reached (profile level, accepted certificate or placement test), or null. */
  level: string | null;
}

export type BadgeGroup = 'journey' | 'german';

export interface BadgeRule {
  key: string;
  group: BadgeGroup;
  /** Lucide icon name on the client. */
  icon: string;
  earned: (f: BadgeFacts) => boolean;
  /** Progress towards the badge (current / goal) for counters. */
  progress?: (f: BadgeFacts) => { value: number; goal: number };
}

const levelRank = (l: string | null | undefined) => (l ? LEVELS.indexOf(l.toUpperCase() as Level) : -1);
const atLeast = (level: Level) => (f: BadgeFacts) => levelRank(f.level) >= LEVELS.indexOf(level);
const count = (field: 'bestStreak' | 'wordsLearned', goal: number) => ({
  earned: (f: BadgeFacts) => f[field] >= goal,
  progress: (f: BadgeFacts) => ({ value: Math.min(goal, Math.max(0, f[field])), goal }),
});

export const BADGES: readonly BadgeRule[] = [
  { key: 'PROFILE_COMPLETE', group: 'journey', icon: 'user-check', earned: (f) => f.profilePercent >= 100, progress: (f) => ({ value: Math.round(f.profilePercent), goal: 100 }) },
  { key: 'DOCS_UPLOADED', group: 'journey', icon: 'upload', earned: (f) => f.docsUploaded },
  { key: 'DOCS_ACCEPTED', group: 'journey', icon: 'file-check', earned: (f) => f.docsAccepted },
  { key: 'CONTRACT_SIGNED', group: 'journey', icon: 'pen-line', earned: (f) => f.contractSigned },
  { key: 'VISA_APPROVED', group: 'journey', icon: 'stamp', earned: (f) => f.visaApproved },
  { key: 'ARRIVED', group: 'journey', icon: 'plane-landing', earned: (f) => f.arrived },
  { key: 'STREAK_7', group: 'german', icon: 'flame', ...count('bestStreak', 7) },
  { key: 'STREAK_30', group: 'german', icon: 'flame', ...count('bestStreak', 30) },
  { key: 'WORDS_100', group: 'german', icon: 'book-open', ...count('wordsLearned', 100) },
  { key: 'WORDS_500', group: 'german', icon: 'library', ...count('wordsLearned', 500) },
  { key: 'LEVEL_A1', group: 'german', icon: 'graduation-cap', earned: atLeast('A1') },
  { key: 'LEVEL_A2', group: 'german', icon: 'graduation-cap', earned: atLeast('A2') },
  { key: 'LEVEL_B1', group: 'german', icon: 'graduation-cap', earned: atLeast('B1') },
  { key: 'LEVEL_B2', group: 'german', icon: 'graduation-cap', earned: atLeast('B2') },
];

export const BADGE_KEYS = BADGES.map((b) => b.key);

/** Keys of every badge the facts satisfy. */
export const earnedKeys = (f: BadgeFacts) => BADGES.filter((b) => b.earned(f)).map((b) => b.key);

/** Highest of several level sources ("none" / unknown / null ignored). */
export const highestLevel = (...levels: (string | null | undefined)[]): Level | null => {
  let best = -1;
  for (const l of levels) best = Math.max(best, levelRank(l));
  return best >= 0 ? LEVELS[best] : null;
};

/**
 * Required documents of one case → uploaded / accepted. Same rule as the workflow: a requirement counts as uploaded
 * while it has a non-rejected file. A case without required documents earns neither.
 */
export const documentFacts = (requirements: { required: boolean; documents: { status: string }[] }[]) => {
  const required = requirements.filter((r) => r.required);
  if (!required.length) return { uploaded: false, accepted: false };
  return {
    uploaded: required.every((r) => r.documents.some((d) => d.status === 'PENDING' || d.status === 'ACCEPTED')),
    accepted: required.every((r) => r.documents.some((d) => d.status === 'ACCEPTED')),
  };
};
