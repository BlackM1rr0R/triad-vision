/**
 * Automatic daily-limit adjustment of the external auto-send (pure, unit-tested). Over the last 7 days:
 *   problem rate = (hard bounces + failed sends) / (sent + failed sends)
 * - rate > 5 % (with at least MIN_SAMPLE mails): the limit is halved (factor 1 → ½ → ¼ → ⅛), at most once per day;
 * - rate ≤ 2 %: it recovers slowly, +¼ of the configured limit every 3 days, up to the full limit.
 * The effective limit = configured daily limit × factor (at least 1 while sending is allowed at all).
 */

export interface SendHealth {
  factor: number;
  /** When the factor last changed (ISO). */
  changedAt: string | null;
  /** Why it is below 1 (the last decrease). */
  reason: 'BOUNCES' | null;
  /** Figures of the last evaluation (shown in the panel). */
  last: { sent: number; hardBounces: number; failures: number; rate: number; at: string } | null;
}

export interface SendStats {
  sent: number;
  hardBounces: number;
  failures: number;
}

export const DEFAULT_HEALTH: SendHealth = { factor: 1, changedAt: null, reason: null, last: null };
export const PROBLEM_THRESHOLD = 0.05;
export const RECOVER_BELOW = 0.02;
export const MIN_SAMPLE = 10;
export const MIN_FACTOR = 0.125;
export const RECOVER_STEP = 0.25;
const DAY = 24 * 60 * 60 * 1000;
export const DECREASE_COOLDOWN_MS = DAY;
export const RECOVER_EVERY_MS = 3 * DAY;

export const problemRate = (s: SendStats) => {
  const total = s.sent + s.failures;
  return total > 0 ? (s.hardBounces + s.failures) / total : 0;
};

export const adjustHealth = (state: SendHealth, stats: SendStats, now: Date): SendHealth => {
  const rate = problemRate(stats);
  const last = { ...stats, rate: Math.round(rate * 1000) / 1000, at: now.toISOString() };
  const since = state.changedAt ? now.getTime() - new Date(state.changedAt).getTime() : Infinity;
  const enough = stats.sent + stats.failures >= MIN_SAMPLE;
  if (enough && rate > PROBLEM_THRESHOLD) {
    if (state.factor > MIN_FACTOR && since >= DECREASE_COOLDOWN_MS) {
      return { factor: Math.max(MIN_FACTOR, state.factor / 2), changedAt: now.toISOString(), reason: 'BOUNCES', last };
    }
    return { ...state, last };
  }
  if (state.factor < 1 && rate <= RECOVER_BELOW && since >= RECOVER_EVERY_MS) {
    const factor = Math.min(1, state.factor + RECOVER_STEP);
    return { factor, changedAt: now.toISOString(), reason: factor < 1 ? state.reason : null, last };
  }
  return { ...state, last };
};

/** Configured limit × factor; 0 stays 0 (sending switched off by limit), otherwise at least 1. */
export const effectiveDailyLimit = (dailyLimit: number, factor: number) => (dailyLimit <= 0 ? 0 : Math.max(1, Math.floor(dailyLimit * Math.min(1, Math.max(MIN_FACTOR, factor)))));

/** Stored value → state (bad / old values fall back to the default). */
export const readHealth = (raw: unknown): SendHealth => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_HEALTH };
  const r = raw as Partial<SendHealth>;
  const factor = typeof r.factor === 'number' && Number.isFinite(r.factor) ? Math.min(1, Math.max(MIN_FACTOR, r.factor)) : 1;
  return {
    factor,
    changedAt: typeof r.changedAt === 'string' ? r.changedAt : null,
    reason: r.reason === 'BOUNCES' && factor < 1 ? 'BOUNCES' : null,
    last: r.last && typeof r.last === 'object' ? (r.last as SendHealth['last']) : null,
  };
};
