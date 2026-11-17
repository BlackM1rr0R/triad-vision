/**
 * "Germany Ready" activity registry — the ONE list of learning activities that count towards the practice
 * certificate (/account/germany-ready), the weekly challenge and the employer readiness profile.
 *
 * Plain data, no imports (the server unit test `readyRegistry.test.ts` imports this file and checks that the
 * server copy in server/src/lib/readyProgress/activities.ts has exactly the same ids, points and limits — the
 * server validates every synced result against its copy and clamps the scores).
 *
 * How to add a game (e.g. a new /something-game):
 *   1. add an entry here (id: kebab-case, stable forever — results are stored under it),
 *   2. add the same entry to server/src/lib/readyProgress/activities.ts,
 *   3. in the game call `useReadyReport()` (client/src/lib/readyProgress/sync.ts) when a round ends:
 *        report({ activityId: 'something-game', score, max })        // item optional (scene / module id)
 *      Nothing is sent for visitors who are not signed in as a client; it never blocks or throws.
 *   4. add the activity title to client/src/i18n/pagesGermanyReady.ts (`gready.act.<id>`).
 *
 * Fields
 *   source       'client' = the browser reports results (self-reported practice, POST /api/account/ready/results);
 *                'server' = computed from data the server already has (vocabulary trainer, readiness score).
 *   points       points of the activity when complete; partial progress gives a proportional share.
 *   passPercent  a result counts as "passed" at this percentage of max (0 = taking part is enough).
 *   items        allowed sub-items (scene / module ids); 'any' = any id matching /^[a-z0-9-]{1,40}$/;
 *                omitted = no sub-items (one result per round).
 *   requiredItems  distinct passed items needed for full points (default 1).
 *   maxScore     upper bound of `max` the server accepts (score is clamped to 0…max).
 */

export type ReadyGroup = 'work' | 'german' | 'everyday' | 'exam' | 'interview' | 'portal';

export interface ReadyActivity {
  id: string;
  group: ReadyGroup;
  source: 'client' | 'server';
  /** Where to practise (site path; portal paths start with /account). */
  path: string;
  points: number;
  passPercent: number;
  items?: readonly string[] | 'any';
  requiredItems?: number;
  maxScore: number;
}

export const READY_ACTIVITIES = [
  { id: 'work-scenes', group: 'work', source: 'client', path: '/work-scenes', points: 10, passPercent: 80, items: ['restaurant-kitchen', 'truck-cab', 'hospital-ward', 'construction-site', 'electrical-panel'], requiredItems: 1, maxScore: 100 },
  { id: 'german-simulator', group: 'german', source: 'client', path: '/german-simulator', points: 15, passPercent: 70, items: ['anmeldung', 'bank', 'doctor', 'heating', 'work'], requiredItems: 3, maxScore: 100 },
  { id: 'pronunciation', group: 'german', source: 'client', path: '/pronunciation', points: 10, passPercent: 70, items: 'any', requiredItems: 10, maxScore: 100 },
  { id: 'price-game', group: 'everyday', source: 'client', path: '/price-game', points: 5, passPercent: 60, maxScore: 1000 },
  { id: 'traffic-signs', group: 'everyday', source: 'client', path: '/traffic-signs', points: 10, passPercent: 90, maxScore: 100 },
  { id: 'waste-sorting', group: 'everyday', source: 'client', path: '/waste-sorting', points: 5, passPercent: 70, maxScore: 100 },
  { id: 'german-street', group: 'everyday', source: 'client', path: '/german-street', points: 5, passPercent: 70, items: 'any', requiredItems: 1, maxScore: 1000 },
  { id: 'ticket-machine', group: 'everyday', source: 'client', path: '/ticket-machine', points: 5, passPercent: 70, items: 'any', requiredItems: 1, maxScore: 1000 },
  { id: 'supermarket-game', group: 'everyday', source: 'client', path: '/supermarket-game', points: 5, passPercent: 70, items: 'any', requiredItems: 1, maxScore: 1000 },
  { id: 'advent-calendar', group: 'everyday', source: 'client', path: '/advent-calendar', points: 5, passPercent: 100, items: 'any', requiredItems: 4, maxScore: 1 },
  { id: 'workplace-etiquette', group: 'work', source: 'client', path: '/workplace-etiquette', points: 5, passPercent: 70, maxScore: 100 },
  { id: 'mock-a1', group: 'exam', source: 'client', path: '/german-mock-exam/a1', points: 10, passPercent: 60, items: ['hoeren', 'lesen', 'schreiben', 'sprechen'], requiredItems: 2, maxScore: 1000 },
  { id: 'mock-b1', group: 'exam', source: 'client', path: '/german-mock-exam/b1', points: 15, passPercent: 60, items: ['hoeren', 'lesen', 'schreiben', 'sprechen'], requiredItems: 2, maxScore: 1000 },
  { id: 'level-self', group: 'exam', source: 'client', path: '/german-level-test-self', points: 5, passPercent: 0, maxScore: 4 },
  { id: 'interview-prep', group: 'interview', source: 'client', path: '/account/interview-prep', points: 10, passPercent: 50, items: ['EMBASSY', 'EMPLOYER'], requiredItems: 1, maxScore: 500 },
  { id: 'vocabulary', group: 'german', source: 'server', path: '/account/german', points: 10, passPercent: 100, maxScore: 100 },
  { id: 'readiness', group: 'portal', source: 'server', path: '/account/readiness', points: 10, passPercent: 60, maxScore: 100 },
] as const satisfies readonly ReadyActivity[];

export type ReadyActivityId = (typeof READY_ACTIVITIES)[number]['id'];

export const readyActivity = (id: string): ReadyActivity | undefined => (READY_ACTIVITIES as readonly ReadyActivity[]).find((a) => a.id === id);
