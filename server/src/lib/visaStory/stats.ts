/**
 * Pure computations of the client's "Your visa story" (Triad Wrapped) and the staff "Year in review".
 * No database access here (unit tested: tests/unit/visaStory.test.ts); lib/visaStory/service.ts gathers the rows.
 */

const DAY_MS = 86_400_000;
const EARTH_RADIUS_KM = 6371.0088; // mean Earth radius (IUGG)

/** Great-circle distance in km (haversine), rounded to whole km. */
export const haversineKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h))));
};

/** Whole days from `from` to `to` (never negative). */
export const daysBetween = (from: Date, to: Date) => Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY_MS));

export const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
const rank = (l: string | null | undefined) => (l ? CEFR.indexOf(l.trim().toUpperCase() as (typeof CEFR)[number]) : -1);

/**
 * German level progress: the first level we know of (oldest placement test, else the profile level when
 * nothing older exists) → the highest level now (profile, tests, passed exams). `steps` = CEFR steps gained.
 */
export const levelProgress = (firstKnown: (string | null | undefined)[], current: (string | null | undefined)[]) => {
  const first = firstKnown.map(rank).find((r) => r >= 0) ?? -1;
  const best = Math.max(-1, ...current.map(rank), first);
  return {
    from: first >= 0 ? CEFR[first] : null,
    to: best >= 0 ? CEFR[best] : null,
    steps: first >= 0 && best >= 0 ? best - first : 0,
  };
};

export interface StoryNumbers {
  days: number;
  docsUploaded: number;
  docsApproved: number;
  messages: number;
  km: number | null;
  wordsLearned: number;
}

export type FunFact =
  | { key: 'words'; perWeek: number; words: number }
  | { key: 'walk'; walkDays: number; km: number }
  | { key: 'messages'; perWeek: number; messages: number }
  | { key: 'docs'; docs: number }
  | { key: 'days'; weekends: number; days: number };

/** Walking pace for the "on foot" fact: 5 km/h for 8 hours a day. */
export const WALK_KM_PER_DAY = 40;

/**
 * The one fun fact of the story, from the client's own numbers (deterministic priority, nothing invented):
 * vocabulary (≥ 100 words) → the walk to the city → many messages (≥ 30) → documents (≥ 10) → weekends waited.
 */
export const topFunFact = (n: StoryNumbers): FunFact => {
  const weeks = Math.max(1, n.days / 7);
  if (n.wordsLearned >= 100) return { key: 'words', words: n.wordsLearned, perWeek: Math.max(1, Math.round(n.wordsLearned / weeks)) };
  if (n.km !== null && n.km > 0) return { key: 'walk', km: n.km, walkDays: Math.max(1, Math.round(n.km / WALK_KM_PER_DAY)) };
  if (n.messages >= 30) return { key: 'messages', messages: n.messages, perWeek: Math.max(1, Math.round(n.messages / weeks)) };
  if (n.docsUploaded >= 10) return { key: 'docs', docs: n.docsUploaded };
  return { key: 'days', days: n.days, weekends: Math.floor(n.days / 7) };
};

/** First word of a name ("Leyla Sara" → "Leyla"), or null. */
export const firstNameOnly = (name: string | null | undefined) => name?.trim().split(/\s+/)[0] || null;

// ─── Year in review (staff) ─────────────────────────────────────────────

export interface ReviewCase {
  number: string;
  createdAt: Date;
  decisionAt: Date | null;
  status: string;
  profession: string;
  city: string | null;
  staffId: string | null;
  staffName: string | null;
}

const monthFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baku', year: 'numeric', month: '2-digit' });
/** Year and month (1–12) of a date in Baku time (the office). */
export const bakuYearMonth = (d: Date) => {
  const [y, m] = monthFmt.format(d).split('-').map(Number);
  return { year: y, month: m };
};

const capFirst = (s: string) => (s[0] && s[0] !== s[0].toLocaleLowerCase('de') ? 1 : 0);

/** Top N labels by count, case-insensitive grouping (the most frequent spelling is shown, capitalised first), ties by name. */
export const topCounts = (values: (string | null | undefined)[], n = 5) => {
  const groups = new Map<string, { counts: Map<string, number>; total: number }>();
  for (const raw of values) {
    const label = raw?.trim().replace(/\s+/g, ' ');
    if (!label) continue;
    const key = label.toLocaleLowerCase('de');
    const g = groups.get(key) ?? { counts: new Map(), total: 0 };
    g.counts.set(label, (g.counts.get(label) ?? 0) + 1);
    g.total += 1;
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => ({ name: [...g.counts.entries()].sort((a, b) => b[1] - a[1] || capFirst(b[0]) - capFirst(a[0]) || a[0].localeCompare(b[0]))[0][0], count: g.total }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, n);
};

export interface YearReview {
  year: number;
  opened: number;
  approved: number;
  rejected: number;
  openedByMonth: number[];
  approvedByMonth: number[];
  busiestMonth: { month: number; count: number } | null;
  topProfessions: { name: string; count: number }[];
  topCities: { name: string; count: number }[];
  fastest: { number: string; profession: string; days: number } | null;
  medianDays: number | null;
  perStaff: { id: string; name: string; opened: number; approved: number }[];
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

/**
 * Year in review over the cases (Baku calendar year): cases opened in the year (createdAt), approved / rejected in
 * the year (decisionAt), busiest month by cases opened (ties: the earlier month), top professions of the opened
 * cases, top cities of the approved ones, the fastest approval (days from opening to the decision) and per
 * staff member the cases opened and approved (assigned staff).
 */
export const yearReview = (cases: ReviewCase[], year: number): YearReview => {
  const inYear = (d: Date | null) => !!d && bakuYearMonth(d).year === year;
  const opened = cases.filter((c) => inYear(c.createdAt));
  const approved = cases.filter((c) => c.status === 'APPROVED' && inYear(c.decisionAt));
  const rejected = cases.filter((c) => c.status === 'REJECTED' && inYear(c.decisionAt));
  const openedByMonth = Array.from({ length: 12 }, () => 0);
  const approvedByMonth = Array.from({ length: 12 }, () => 0);
  opened.forEach((c) => (openedByMonth[bakuYearMonth(c.createdAt).month - 1] += 1));
  approved.forEach((c) => (approvedByMonth[bakuYearMonth(c.decisionAt!).month - 1] += 1));
  const max = Math.max(...openedByMonth);
  const busiestMonth = max > 0 ? { month: openedByMonth.indexOf(max) + 1, count: max } : null;

  const durations = approved.map((c) => ({ c, days: daysBetween(c.createdAt, c.decisionAt!) }));
  const fastestRow = [...durations].sort((a, b) => a.days - b.days || a.c.number.localeCompare(b.c.number))[0];

  const staff = new Map<string, { id: string; name: string; opened: number; approved: number }>();
  const bump = (c: ReviewCase, field: 'opened' | 'approved') => {
    if (!c.staffId) return;
    const row = staff.get(c.staffId) ?? { id: c.staffId, name: c.staffName ?? '—', opened: 0, approved: 0 };
    row[field] += 1;
    staff.set(c.staffId, row);
  };
  opened.forEach((c) => bump(c, 'opened'));
  approved.forEach((c) => bump(c, 'approved'));

  return {
    year,
    opened: opened.length,
    approved: approved.length,
    rejected: rejected.length,
    openedByMonth,
    approvedByMonth,
    busiestMonth,
    topProfessions: topCounts(opened.map((c) => c.profession)),
    topCities: topCounts(approved.map((c) => c.city)),
    fastest: fastestRow ? { number: fastestRow.c.number, profession: fastestRow.c.profession, days: fastestRow.days } : null,
    medianDays: median(durations.map((d) => d.days)),
    perStaff: [...staff.values()].sort((a, b) => b.approved - a.approved || b.opened - a.opened || a.name.localeCompare(b.name)),
  };
};
