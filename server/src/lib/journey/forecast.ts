import type { CaseStatus, VisaType } from '@prisma/client';
import { prisma } from '../../db.js';

/**
 * Expected dates ("forecast") for the remaining steps of a case.
 *
 * Each step's duration is the historical median for the case's visa category (with the 25th–75th
 * percentile as the range), falling back to all cases, then to fixed defaults; an admin override
 * on VisaCategory.forecast wins over everything. Dates are projected from the moment the case
 * entered its current step. The historical ranges are cached per visa category for 10 minutes.
 */

export const STEP_KEYS = ['DOCUMENTS', 'CONTRACT', 'EMBASSY', 'APPOINTMENT', 'DECISION'] as const;
export type StepKey = (typeof STEP_KEYS)[number];

export const STEP_STATUSES: Record<StepKey, CaseStatus[]> = {
  DOCUMENTS: ['DOCUMENTS_PENDING', 'DOCUMENTS_REVIEW'],
  CONTRACT: ['CONTRACT_SENT', 'CONTRACT_SIGNED'],
  EMBASSY: ['EMBASSY_DOCUMENTS', 'EMBASSY_REVIEW'],
  APPOINTMENT: ['APPOINTMENT_SCHEDULED'],
  DECISION: ['DECISION_PENDING'],
};

/** Fallback when there is no usable history (days). */
export const DEFAULT_RANGES: Record<StepKey, [number, number]> = {
  DOCUMENTS: [10, 20],
  CONTRACT: [3, 7],
  EMBASSY: [14, 28],
  APPOINTMENT: [21, 45],
  DECISION: [14, 42],
};

/**
 * Fallback durations per kind of application (days), used until enough history exists. A Schengen
 * visitor visa takes weeks, a family reunion months; work and Ausbildung visas sit in between.
 */
export const DEFAULTS_BY_TYPE: Record<VisaType, Record<StepKey, [number, number]>> = {
  WORK: DEFAULT_RANGES,
  AUSBILDUNG: { DOCUMENTS: [10, 21], CONTRACT: [7, 21], EMBASSY: [14, 28], APPOINTMENT: [21, 60], DECISION: [21, 56] },
  WEITERBILDUNG: { DOCUMENTS: [10, 21], CONTRACT: [7, 14], EMBASSY: [14, 28], APPOINTMENT: [21, 60], DECISION: [21, 56] },
  JOB_SEEKER: { DOCUMENTS: [7, 14], CONTRACT: [2, 5], EMBASSY: [7, 21], APPOINTMENT: [21, 60], DECISION: [14, 42] },
  STUDY: { DOCUMENTS: [14, 28], CONTRACT: [3, 7], EMBASSY: [14, 28], APPOINTMENT: [21, 60], DECISION: [21, 56] },
  FAMILY: { DOCUMENTS: [10, 21], CONTRACT: [3, 7], EMBASSY: [14, 28], APPOINTMENT: [30, 90], DECISION: [30, 90] },
  TOURIST: { DOCUMENTS: [3, 7], CONTRACT: [1, 3], EMBASSY: [3, 7], APPOINTMENT: [7, 21], DECISION: [7, 15] },
};

/** Fewer samples than this and the history is not trusted for a step. */
export const MIN_SAMPLE = 3;
export const CACHE_TTL_MS = 10 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
/** Only the most recent cases feed the statistics (older practice is less representative). */
const HISTORY_CASES = 500;

export type BasedOn = 'history' | 'default' | 'override';

export interface StepRange {
  minDays: number;
  maxDays: number;
  basedOn: BasedOn;
  sample: number;
}
export type Ranges = Record<StepKey, StepRange>;

export interface ForecastStep extends StepRange {
  key: StepKey;
  status: 'done' | 'current' | 'upcoming';
  /** When the case entered / left the step (done and current steps). */
  enteredAt: Date | null;
  leftAt: Date | null;
  expectedFrom: Date | null;
  expectedTo: Date | null;
}

export interface Forecast {
  status: CaseStatus;
  /** Kind of application: the client names the contract step after it (work / Ausbildung contract). */
  visaType?: VisaType;
  currentStep: StepKey | null;
  currentSince: Date | null;
  steps: ForecastStep[];
  estimatedDecision: { from: Date; to: Date } | null;
}

export type ForecastOverride = Partial<Record<StepKey, [number, number] | null>>;

export const stepOf = (status: CaseStatus): StepKey | null =>
  STEP_KEYS.find((k) => STEP_STATUSES[k].includes(status)) ?? null;

// ─── Pure math ─────────────────────────────────────────────────────────

export const median = (values: number[]) => {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** Linear-interpolated quantile (0..1) of a sample. */
export const quantile = (values: number[], q: number) => {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
};

/** Range [min, max] in whole days from a sample of step durations: p25–p75 around the median, at least 1 day. */
export const rangeFromSample = (days: number[]): [number, number] => {
  const med = median(days);
  const min = Math.max(1, Math.round(Math.min(med, quantile(days, 0.25))));
  const max = Math.max(min, Math.round(Math.max(med, quantile(days, 0.75))));
  return [min, max];
};

export interface StatusPoint {
  status: CaseStatus;
  at: Date;
}

/**
 * Durations (days) per step for one case, from its status history (oldest → newest). A step counts
 * once the case left it for a different step or a final status; the current step is not included.
 */
export const stepDurations = (history: StatusPoint[]): Partial<Record<StepKey, number>> => {
  const out: Partial<Record<StepKey, number>> = {};
  let runStep: StepKey | null = null;
  let runStart: Date | null = null;
  for (const p of history) {
    const step = stepOf(p.status);
    if (step === runStep) continue;
    if (runStep && runStart && out[runStep] === undefined) {
      out[runStep] = Math.max(0, (p.at.getTime() - runStart.getTime()) / DAY);
    }
    runStep = step;
    runStart = step ? p.at : null;
  }
  return out;
};

/** Per-step ranges from historical samples (category first, then all cases), defaults and overrides. */
export const resolveRanges = (
  samples: { category: Partial<Record<StepKey, number[]>>; all: Partial<Record<StepKey, number[]>> },
  override: ForecastOverride | null | undefined,
  defaults: Record<StepKey, [number, number]> = DEFAULT_RANGES,
): Ranges => {
  const out = {} as Ranges;
  for (const key of STEP_KEYS) {
    const o = override?.[key];
    if (o && Array.isArray(o) && o.length === 2 && o[0] >= 0 && o[1] >= o[0]) {
      out[key] = { minDays: o[0], maxDays: o[1], basedOn: 'override', sample: 0 };
      continue;
    }
    const cat = samples.category[key] ?? [];
    const all = samples.all[key] ?? [];
    const use = cat.length >= MIN_SAMPLE ? cat : all.length >= MIN_SAMPLE ? all : null;
    if (use) {
      const [minDays, maxDays] = rangeFromSample(use);
      out[key] = { minDays, maxDays, basedOn: 'history', sample: use.length };
    } else {
      const [minDays, maxDays] = defaults[key];
      out[key] = { minDays, maxDays, basedOn: 'default', sample: 0 };
    }
  }
  return out;
};

const addDays = (d: Date, days: number) => new Date(d.getTime() + days * DAY);

/**
 * Projects the steps of a case: done steps carry their actual dates, the current step a window
 * from its entry time, and later steps chain from the previous window.
 */
export const computeForecast = (input: { status: CaseStatus; history: StatusPoint[]; ranges: Ranges; now?: Date }): Forecast => {
  const { status, ranges } = input;
  const now = input.now ?? new Date();
  const history = [...input.history].sort((a, b) => a.at.getTime() - b.at.getTime());
  const currentStep = stepOf(status);
  const final = status === 'APPROVED' || status === 'REJECTED' || status === 'CANCELLED';
  const cancelled = status === 'CANCELLED';

  // Entry/exit of every step: first entry, and the first later point that belongs to another step.
  const entered: Partial<Record<StepKey, Date>> = {};
  const left: Partial<Record<StepKey, Date>> = {};
  let run: StepKey | null = null;
  for (const p of history) {
    const s = stepOf(p.status);
    if (s === run) continue;
    if (run && !left[run]) left[run] = p.at;
    run = s;
    if (s && !entered[s]) entered[s] = p.at;
    // Re-entering a step (reopen / rollback) restarts its clock.
    if (s && left[s]) {
      entered[s] = p.at;
      delete left[s];
    }
  }
  const currentIndex = currentStep ? STEP_KEYS.indexOf(currentStep) : final ? STEP_KEYS.length : -1;
  const currentSince = currentStep ? entered[currentStep] ?? history.at(-1)?.at ?? now : null;

  let chainFrom: Date | null = null;
  let chainTo: Date | null = null;
  const steps: ForecastStep[] = STEP_KEYS.map((key, i) => {
    const r = ranges[key];
    const base = { key, ...r, enteredAt: entered[key] ?? null, leftAt: left[key] ?? null };
    if (cancelled) return { ...base, status: 'upcoming' as const, expectedFrom: null, expectedTo: null };
    if (i < currentIndex) return { ...base, status: 'done' as const, expectedFrom: null, expectedTo: null };
    if (i === currentIndex && currentStep) {
      const start = currentSince ?? now;
      chainFrom = addDays(start, r.minDays);
      chainTo = addDays(start, r.maxDays);
      // A step that already overran its window still ends "soon", never in the past.
      if (chainTo < now) chainTo = addDays(now, Math.max(1, Math.round((r.maxDays - r.minDays) / 2)));
      if (chainFrom < now) chainFrom = now;
      return { ...base, status: 'current' as const, expectedFrom: chainFrom, expectedTo: chainTo };
    }
    if (!chainFrom || !chainTo) return { ...base, status: 'upcoming' as const, expectedFrom: null, expectedTo: null };
    chainFrom = addDays(chainFrom, r.minDays);
    chainTo = addDays(chainTo, r.maxDays);
    return { ...base, status: 'upcoming' as const, expectedFrom: chainFrom, expectedTo: chainTo };
  });

  const decision = steps[steps.length - 1];
  return {
    status,
    currentStep,
    currentSince,
    steps,
    estimatedDecision: decision.expectedFrom && decision.expectedTo ? { from: decision.expectedFrom, to: decision.expectedTo } : null,
  };
};

// ─── Data access + cache ───────────────────────────────────────────────

type Samples = Partial<Record<StepKey, number[]>>;
const cache = new Map<string, { at: number; samples: Samples }>();
const inflight = new Map<string, Promise<Samples>>();

export const clearForecastCache = () => {
  cache.clear();
};

const sampleKey = (visaCategoryId: string | null) => (visaCategoryId ? `visa:${visaCategoryId}` : 'all');

/** Step duration samples over the most recent cases (of one visa category, or all). */
const loadSamples = async (visaCategoryId: string | null): Promise<Samples> => {
  const key = sampleKey(visaCategoryId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.samples;
  const pending = inflight.get(key);
  if (pending) return pending;
  const p = (async () => {
    const cases = await prisma.case.findMany({
      where: visaCategoryId ? { visaCategoryId } : {},
      select: { id: true },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_CASES,
    });
    const events = cases.length
      ? await prisma.caseEvent.findMany({
          where: { caseId: { in: cases.map((c) => c.id) }, toStatus: { not: null } },
          select: { caseId: true, toStatus: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        })
      : [];
    const byCase = new Map<string, StatusPoint[]>();
    for (const e of events) {
      const list = byCase.get(e.caseId) ?? [];
      list.push({ status: e.toStatus as CaseStatus, at: e.createdAt });
      byCase.set(e.caseId, list);
    }
    const samples: Samples = {};
    for (const history of byCase.values()) {
      const d = stepDurations(history);
      for (const k of STEP_KEYS) {
        if (d[k] !== undefined) (samples[k] ??= []).push(d[k]!);
      }
    }
    cache.set(key, { at: Date.now(), samples });
    return samples;
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
};

export const parseOverride = (raw: unknown): ForecastOverride | null => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: ForecastOverride = {};
  for (const k of STEP_KEYS) {
    const v = (raw as Record<string, unknown>)[k];
    if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' && typeof v[1] === 'number') out[k] = [v[0], v[1]];
  }
  return out;
};

/** Ranges for a visa category (null = cases without a category): history → defaults, overridden by the admin. */
export const rangesFor = async (visaCategoryId: string | null, visaType: VisaType = 'WORK'): Promise<Ranges> => {
  const [category, all, visa] = await Promise.all([
    visaCategoryId ? loadSamples(visaCategoryId) : Promise.resolve({} as Samples),
    // The history of all cases is mostly work visas, so it only stands in for work applications.
    visaType === 'WORK' ? loadSamples(null) : Promise.resolve({} as Samples),
    visaCategoryId ? prisma.visaCategory.findUnique({ where: { id: visaCategoryId }, select: { forecast: true } }) : null,
  ]);
  return resolveRanges({ category, all }, parseOverride(visa?.forecast), DEFAULTS_BY_TYPE[visaType]);
};

/** Forecast of one case from its stored status events. */
export const forecastForCase = async (caseId: string): Promise<Forecast> => {
  const c = await prisma.case.findUniqueOrThrow({
    where: { id: caseId },
    select: {
      status: true,
      visaCategoryId: true,
      visaType: true,
      createdAt: true,
      events: { where: { toStatus: { not: null } }, select: { toStatus: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
    },
  });
  const ranges = await rangesFor(c.visaCategoryId, c.visaType);
  const history: StatusPoint[] = c.events.map((e) => ({ status: e.toStatus as CaseStatus, at: e.createdAt }));
  if (!history.length) history.push({ status: 'DOCUMENTS_PENDING', at: c.createdAt });
  return { ...computeForecast({ status: c.status, history, ranges }), visaType: c.visaType };
};
