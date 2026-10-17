/**
 * Pure maths for the satisfaction survey results (no database access, unit tested).
 * NPS = % promoters (9–10) − % detractors (0–6); passives (7–8) only count in the total.
 */

export const RATING_KEYS = ['communication', 'speed', 'clarity', 'support'] as const;
export type RatingKey = (typeof RATING_KEYS)[number];
export type Ratings = Partial<Record<RatingKey, number>>;

export interface NpsResult {
  total: number;
  promoters: number;
  passives: number;
  detractors: number;
  /** −100 … 100, rounded; null without answers */
  score: number | null;
}

export const npsCategory = (score: number): 'promoter' | 'passive' | 'detractor' => (score >= 9 ? 'promoter' : score >= 7 ? 'passive' : 'detractor');

export const npsOf = (scores: (number | null | undefined)[]): NpsResult => {
  const valid = scores.filter((s): s is number => typeof s === 'number' && Number.isFinite(s) && s >= 0 && s <= 10);
  let promoters = 0;
  let passives = 0;
  let detractors = 0;
  for (const s of valid) {
    const c = npsCategory(s);
    if (c === 'promoter') promoters++;
    else if (c === 'passive') passives++;
    else detractors++;
  }
  const total = valid.length;
  return { total, promoters, passives, detractors, score: total ? Math.round(((promoters - detractors) / total) * 100) : null };
};

/** Reads the stored Json safely: only integer 1–5 values of the known keys survive. */
export const parseRatings = (raw: unknown): Ratings => {
  const out: Ratings = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const k of RATING_KEYS) {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5) out[k] = v;
  }
  return out;
};

/** Average per rating key (one decimal), null for a key nobody rated. */
export const averageRatings = (list: unknown[]): Record<RatingKey, number | null> => {
  const sums = Object.fromEntries(RATING_KEYS.map((k) => [k, { sum: 0, n: 0 }])) as Record<RatingKey, { sum: number; n: number }>;
  for (const raw of list) {
    const r = parseRatings(raw);
    for (const k of RATING_KEYS) {
      if (r[k] !== undefined) {
        sums[k].sum += r[k]!;
        sums[k].n++;
      }
    }
  }
  return Object.fromEntries(RATING_KEYS.map((k) => [k, sums[k].n ? Math.round((sums[k].sum / sums[k].n) * 10) / 10 : null])) as Record<RatingKey, number | null>;
};

/** 0–1 share of answered surveys, null when nothing was sent. */
export const responseRate = (sent: number, answered: number) => (sent > 0 ? Math.round((answered / sent) * 1000) / 1000 : null);

/** "YYYY-MM" (UTC) for monthly trends. */
export const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

/** Every month key from `from` to `to` inclusive, so the trend has no holes. */
export const monthRange = (from: Date, to: Date) => {
  const out: string[] = [];
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1);
  while (d.getTime() <= end && out.length < 120) {
    out.push(monthKey(d));
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
};

export interface SurveyRow {
  sentAt: Date;
  answeredAt: Date | null;
  score: number | null;
  ratings: unknown;
}

/** Sent / answered / NPS / ratings for one group of surveys. */
export const summarize = (rows: SurveyRow[]) => {
  const answered = rows.filter((r) => r.answeredAt);
  return {
    sent: rows.length,
    answered: answered.length,
    responseRate: responseRate(rows.length, answered.length),
    nps: npsOf(answered.map((r) => r.score)),
    ratings: averageRatings(answered.map((r) => r.ratings)),
  };
};

/** Monthly trend by the month the survey was sent. */
export const monthlyTrend = (rows: SurveyRow[], from: Date, to: Date) => {
  const buckets = new Map<string, SurveyRow[]>(monthRange(from, to).map((m) => [m, []]));
  for (const r of rows) buckets.get(monthKey(r.sentAt))?.push(r);
  return [...buckets.entries()].map(([month, list]) => {
    const s = summarize(list);
    return { month, sent: s.sent, answered: s.answered, nps: s.nps.score };
  });
};
