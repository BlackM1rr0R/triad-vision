import { quantile } from '../journey/forecast.js';

/**
 * Real salary database (/real-salaries): pure aggregation of the gross monthly salaries in the employment
 * contracts (EmploymentContract) of workers placed by Triad Vision. Unit-tested (tests/unit/realSalaries.test.ts).
 *
 * Disclosure rules — only ranges of groups ever leave this module, never a single contract:
 *  - k-anonymity: a group is published only with at least K_MIN (3) DISTINCT workers. A worker with several
 *    contracts in a group counts once (their latest contract).
 *  - dominance: a group is hidden when one value (rounded to 50 €) is held by more than DOMINANCE_SHARE of its
 *    workers, or when P25 and P75 round to the same amount (a zero-width range would reveal what each one earns).
 *  - every published amount (P25, median, P75) is rounded to 50 €; the sample size is shown as a band
 *    ("3–5", "6–9", "10+"), not as an exact count.
 *  - groups: profession × city and profession nationwide (all cities).
 * Records staff excluded, part-time contracts (< FULL_TIME_MIN_HOURS a week), Ausbildung contracts (training
 * allowance, not a salary) and implausible amounts are left out before grouping.
 */

export const K_MIN = 3;
export const DOMINANCE_SHARE = 0.5;
export const FULL_TIME_MIN_HOURS = 30;
/** Plausible gross monthly range (€); anything outside is a typo (yearly amount in the monthly field, cents …). */
export const PLAUSIBLE_GROSS: readonly [number, number] = [1000, 15000];

export const SAMPLE_BANDS = ['3-5', '6-9', '10+'] as const;
export type SampleBand = (typeof SAMPLE_BANDS)[number];

export const round50 = (n: number) => Math.round(n / 50) * 50;

export const sampleBand = (n: number): SampleBand | null => (n < K_MIN ? null : n <= 5 ? '3-5' : n <= 9 ? '6-9' : '10+');

export interface SalaryRecord {
  /** EmploymentContract.caseId (the unit staff exclude). */
  caseId: string;
  /** The worker (Case.clientId): k counts distinct workers. */
  workerId: string;
  /** Canonical profession key (lib/matching.ts) or null when not recognised. */
  profession: string | null;
  /** Normalised city name (CityCost row name when matched) or null. */
  city: string | null;
  /** Federal state code of the city when known. */
  state: string | null;
  grossMonthly: number | null;
  grossYearly: number | null;
  weeklyHours: number | null;
  contractType: string;
  /** When the contract counts (signedAt ?? startDate ?? createdAt): the latest wins per worker and group. */
  at: Date;
  excluded: boolean;
}

export type SkipReason = 'EXCLUDED' | 'NO_AMOUNT' | 'IMPLAUSIBLE' | 'PART_TIME' | 'AUSBILDUNG' | 'NO_PROFESSION';

/** The monthly gross of a record (yearly / 12 when only the yearly amount is filled), or why it is not used. */
export const monthlyOf = (r: SalaryRecord): { gross: number } | { skip: SkipReason } => {
  if (r.excluded) return { skip: 'EXCLUDED' };
  if (r.contractType === 'AUSBILDUNG') return { skip: 'AUSBILDUNG' };
  if (r.weeklyHours !== null && r.weeklyHours > 0 && r.weeklyHours < FULL_TIME_MIN_HOURS) return { skip: 'PART_TIME' };
  if (!r.profession) return { skip: 'NO_PROFESSION' };
  const gross = r.grossMonthly && r.grossMonthly > 0 ? r.grossMonthly : r.grossYearly && r.grossYearly > 0 ? r.grossYearly / 12 : null;
  if (gross === null) return { skip: 'NO_AMOUNT' };
  if (gross < PLAUSIBLE_GROSS[0] || gross > PLAUSIBLE_GROSS[1]) return { skip: 'IMPLAUSIBLE' };
  return { gross };
};

export type SuppressReason = 'TOO_FEW' | 'DOMINANT_VALUE' | 'NO_SPREAD';

export interface GroupStat {
  p25: number;
  median: number;
  p75: number;
  band: SampleBand;
}

/** The published figures of one group's values (one per worker), or why the group stays hidden. */
export const groupStat = (values: number[]): { stat: GroupStat } | { suppressed: SuppressReason } => {
  const xs = values.filter((v) => Number.isFinite(v) && v > 0);
  const band = sampleBand(xs.length);
  if (!band) return { suppressed: 'TOO_FEW' };
  const counts = new Map<number, number>();
  for (const v of xs) counts.set(round50(v), (counts.get(round50(v)) ?? 0) + 1);
  const top = Math.max(...counts.values());
  if (top / xs.length > DOMINANCE_SHARE) return { suppressed: 'DOMINANT_VALUE' };
  const p25 = round50(quantile(xs, 0.25));
  const p75 = round50(quantile(xs, 0.75));
  if (p25 === p75) return { suppressed: 'NO_SPREAD' };
  return { stat: { p25, median: round50(quantile(xs, 0.5)), p75, band } };
};

export interface PublicGroup extends GroupStat {
  profession: string;
  /** null = nationwide (all cities). */
  city: string | null;
  state: string | null;
}

export interface SalaryTable {
  groups: PublicGroup[];
  /** Professions with at least one recorded salary (no counts), so the page can say "collecting data". */
  professionsCollecting: string[];
  /** Published group count; hidden groups are only counted (never listed publicly). */
  hiddenGroups: number;
  /** Total distinct workers behind the published groups as a band (null below K_MIN). */
  workersBand: SampleBand | null;
}

export interface StaffGroup {
  profession: string;
  city: string | null;
  workers: number;
  result: { stat: GroupStat } | { suppressed: SuppressReason };
}

/** Latest usable value per worker for each group key. */
const collect = (records: SalaryRecord[]) => {
  const groups = new Map<string, { profession: string; city: string | null; state: string | null; byWorker: Map<string, { at: number; gross: number }> }>();
  const skipped: Partial<Record<SkipReason, number>> = {};
  const workers = new Set<string>();
  for (const r of records) {
    const m = monthlyOf(r);
    if ('skip' in m) {
      skipped[m.skip] = (skipped[m.skip] ?? 0) + 1;
      continue;
    }
    workers.add(r.workerId);
    const keys: { key: string; city: string | null; state: string | null }[] = [{ key: `${r.profession}|`, city: null, state: null }];
    if (r.city) keys.push({ key: `${r.profession}|${r.city}`, city: r.city, state: r.state });
    for (const k of keys) {
      const g = groups.get(k.key) ?? { profession: r.profession!, city: k.city, state: k.state, byWorker: new Map() };
      const prev = g.byWorker.get(r.workerId);
      if (!prev || r.at.getTime() > prev.at) g.byWorker.set(r.workerId, { at: r.at.getTime(), gross: m.gross });
      groups.set(k.key, g);
    }
  }
  return { groups: [...groups.values()], skipped, workers };
};

const order = <T extends { profession: string; city: string | null }>(a: T, b: T) =>
  a.profession.localeCompare(b.profession) || (a.city === null ? -1 : b.city === null ? 1 : a.city.localeCompare(b.city));

/** The public table: only groups that pass every rule. */
export const buildSalaryTable = (records: SalaryRecord[]): SalaryTable => {
  const { groups } = collect(records);
  const published: PublicGroup[] = [];
  const publishedWorkers = new Set<string>();
  let hidden = 0;
  for (const g of groups) {
    const res = groupStat([...g.byWorker.values()].map((v) => v.gross));
    if ('stat' in res) {
      published.push({ profession: g.profession, city: g.city, state: g.city ? g.state : null, ...res.stat });
      for (const w of g.byWorker.keys()) publishedWorkers.add(w);
    } else hidden++;
  }
  return {
    groups: published.sort(order),
    professionsCollecting: [...new Set(groups.map((g) => g.profession))].sort(),
    hiddenGroups: hidden,
    workersBand: sampleBand(publishedWorkers.size),
  };
};

/** Staff preview: every group with its exact worker count and the reason it is hidden (internal only). */
export const staffGroups = (records: SalaryRecord[]): { groups: StaffGroup[]; skipped: Partial<Record<SkipReason, number>>; workers: number } => {
  const { groups, skipped, workers } = collect(records);
  return {
    groups: groups
      .map((g) => ({ profession: g.profession, city: g.city, workers: g.byWorker.size, result: groupStat([...g.byWorker.values()].map((v) => v.gross)) }))
      .sort(order),
    skipped,
    workers: workers.size,
  };
};
