/**
 * Same keys as server lib/navModules.ts (MODULE_KEYS). Labels: anav.modules.<key>.title / .desc.
 * Own module (re-exported by navRegistry.ts) so the public /platform page lists the modules without pulling in
 * the whole staff navigation registry and its icons.
 */
export const MODULE_KEYS = [
  'campaigns',
  'liveChat',
  'calls',
  'landingPages',
  'events',
  'referrals',
  'agents',
  'training',
  'shifts',
  'waitingRoom',
  'aiAssistant',
  'settlements',
  'originals',
  'surveys',
  'reviews',
  'announcements',
  'interviewPrep',
  'translations',
  'timeTracking',
  'kpi',
  'examDates',
  'journey',
  'bookings',
  'knowledgeBase',
  'quotes',
  'checkIns',
  'guides',
] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];
