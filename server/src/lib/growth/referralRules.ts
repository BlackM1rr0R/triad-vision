import { csvSafe } from '../csvSafe.js';

/**
 * Pure rules of the client referral programme (no database): campaign multiplier, the extra amount at
 * "case opened", tier bonuses, the referred friend's own discount, the admin leaderboard and the
 * suspicious-burst check. The settings shape lives in referral.ts (referralSchema); the defaults leave
 * every extra off, so the programme behaves as before (one reward per referral at its trigger).
 *
 * Campaign dates are calendar days in Baku (UTC+4, no DST), both inclusive. A campaign multiplies the
 * referrer's rewards of referrals that signed up inside the window (tier bonuses: when the tier is reached);
 * the friend discount is never multiplied.
 */

export type Trigger = 'CASE_OPENED' | 'VISA_APPROVED';
export interface Tier {
  approved: number;
  bonus: number;
}
export interface Campaign {
  enabled: boolean;
  multiplier: number;
  startsAt: string; // YYYY-MM-DD or ''
  endsAt: string;
}
export interface RuleSettings {
  trigger: Trigger;
  amount: number;
  caseOpenedBonus: number;
  tiers: Tier[];
  friendDiscount: { enabled: boolean; amount: number };
  campaign: Campaign;
}

const BAKU_OFFSET = '+04:00';
const DAY = 24 * 60 * 60 * 1000;
const dayStart = (d: string) => new Date(`${d}T00:00:00.000${BAKU_OFFSET}`);

/** Whether the campaign runs at `at` (an empty start / end is open-ended; both empty = never). */
export const campaignActive = (c: Campaign, at: Date) => {
  if (!c.enabled || c.multiplier <= 1 || (!c.startsAt && !c.endsAt)) return false;
  const t = at.getTime();
  if (c.startsAt && t < dayStart(c.startsAt).getTime()) return false;
  if (c.endsAt && t >= dayStart(c.endsAt).getTime() + DAY) return false;
  return true;
};

export const campaignMultiplier = (s: Pick<RuleSettings, 'campaign'>, at: Date) => (campaignActive(s.campaign, at) ? s.campaign.multiplier : 1);

/** Whole currency units after the multiplier. */
export const scaled = (amount: number, multiplier: number) => Math.max(0, Math.round(amount * multiplier));

/** The main reward of a referral that signs up at `at`. */
export const mainReward = (s: RuleSettings, at: Date) => ({ trigger: s.trigger, amount: scaled(s.amount, campaignMultiplier(s, at)) });

/** Extra amount when the friend opens a case — only when the main reward waits for the visa. */
export const caseOpenedBonus = (s: RuleSettings, signedUpAt: Date) =>
  s.trigger === 'VISA_APPROVED' && s.caseOpenedBonus > 0 ? scaled(s.caseOpenedBonus, campaignMultiplier(s, signedUpAt)) : 0;

/** The referred friend's own discount (0 = off). */
export const friendDiscount = (s: Pick<RuleSettings, 'friendDiscount'>) => (s.friendDiscount.enabled ? Math.max(0, s.friendDiscount.amount) : 0);

const sortedTiers = (tiers: Tier[]) => [...tiers].filter((t) => t.approved > 0 && t.bonus > 0).sort((a, b) => a.approved - b.approved);

/**
 * Tiers crossed when the referrer's approved count goes from `before` to `after` and not granted yet.
 * Only crossings count, so adding a tier later does not hand out bonuses for old approvals.
 */
export const dueTiers = (tiers: Tier[], before: number, after: number, granted: Iterable<number> = []) => {
  const done = new Set(granted);
  return sortedTiers(tiers).filter((t) => t.approved > before && t.approved <= after && !done.has(t.approved));
};

/** The next tier to reach (for the portal: "2 more approved friends → +50"), or null. */
export const nextTier = (tiers: Tier[], approved: number) => {
  const t = sortedTiers(tiers).find((x) => x.approved > approved);
  return t ? { ...t, remaining: t.approved - approved } : null;
};

// ─── Leaderboard ───────────────────────────────────────────────────────

export interface LbReferral {
  referrerId: string;
  stage: 'REGISTERED' | 'CASE_OPENED' | 'VISA_APPROVED' | 'BLOCKED';
  createdAt: Date;
  caseOpenedAt: Date | null;
  approvedAt: Date | null;
}
export interface LbReward {
  referrerId: string;
  type: string;
  status: 'PENDING' | 'EARNED' | 'PAID' | 'USED' | 'CANCELLED';
  amount: number;
  createdAt: Date;
  earnedAt: Date | null;
  settledAt: Date | null;
}
export interface LbRow {
  referrerId: string;
  registered: number;
  caseOpened: number;
  visaApproved: number;
  blocked: number;
  /** Earned in the period (also when settled since). */
  earned: number;
  /** Still waiting for the trigger (rewards created in the period). */
  pending: number;
  /** Paid out / used as a discount in the period. */
  settled: number;
  /** Earned and not settled yet (now, whatever the period) — what is owed. */
  outstanding: number;
}
export interface Period {
  from?: Date;
  to?: Date; // exclusive
}

const inPeriod = (d: Date | null, p: Period) => !!d && (!p.from || d >= p.from) && (!p.to || d < p.to);

/** Period of Baku calendar days [from, to] (both inclusive, either optional). */
export const bakuPeriod = (from?: string, to?: string): Period => ({
  ...(from ? { from: dayStart(from) } : {}),
  ...(to ? { to: new Date(dayStart(to).getTime() + DAY) } : {}),
});

/**
 * Per referrer: friends who signed up / opened a case / got the visa in the period (blocked ones only in
 * `blocked`), and the reward sums. The friend's own discount (FRIEND) is not the referrer's money and is
 * left out. Sorted by approved, then earned, then registered.
 */
export const leaderboard = (referrals: LbReferral[], rewards: LbReward[], p: Period = {}): LbRow[] => {
  const rows = new Map<string, LbRow>();
  const row = (id: string) => {
    let r = rows.get(id);
    if (!r) rows.set(id, (r = { referrerId: id, registered: 0, caseOpened: 0, visaApproved: 0, blocked: 0, earned: 0, pending: 0, settled: 0, outstanding: 0 }));
    return r;
  };
  for (const x of referrals) {
    if (x.stage === 'BLOCKED') {
      if (inPeriod(x.createdAt, p)) row(x.referrerId).blocked++;
      continue;
    }
    if (inPeriod(x.createdAt, p)) row(x.referrerId).registered++;
    if (inPeriod(x.caseOpenedAt, p)) row(x.referrerId).caseOpened++;
    if (x.stage === 'VISA_APPROVED' && inPeriod(x.approvedAt, p)) row(x.referrerId).visaApproved++;
  }
  for (const w of rewards) {
    if (w.type === 'FRIEND' || w.status === 'CANCELLED') continue;
    const r = row(w.referrerId);
    if (w.status === 'PENDING') {
      if (inPeriod(w.createdAt, p)) r.pending += w.amount;
      continue;
    }
    if (inPeriod(w.earnedAt, p)) r.earned += w.amount;
    if ((w.status === 'PAID' || w.status === 'USED') && inPeriod(w.settledAt, p)) r.settled += w.amount;
    if (w.status === 'EARNED') r.outstanding += w.amount;
  }
  return [...rows.values()]
    .filter((r) => r.registered || r.caseOpened || r.visaApproved || r.blocked || r.earned || r.pending || r.settled || r.outstanding)
    .sort((a, b) => b.visaApproved - a.visaApproved || b.earned - a.earned || b.registered - a.registered || a.referrerId.localeCompare(b.referrerId));
};

/** The leaderboard as CSV (semicolon, UTF-8 with BOM — opens in Excel with the Azerbaijani letters intact). */
export const leaderboardCsv = (rows: (LbRow & { name: string; email: string })[], currency: string) => {
  const cell = (v: string | number) => {
    const s = csvSafe(String(v));
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    ['Dəvət edən', 'E-poçt', 'Qeydiyyat', 'Müraciət', 'Viza', 'Bloklanıb', `Qazanılıb (${currency})`, `Gözləmədə (${currency})`, `Ödənilib (${currency})`, `Borc (${currency})`],
    ...rows.map((r) => [r.name, r.email, r.registered, r.caseOpened, r.visaApproved, r.blocked, r.earned, r.pending, r.settled, r.outstanding]),
  ];
  return `﻿${lines.map((l) => l.map(cell).join(';')).join('\r\n')}\r\n`;
};

// ─── Suspicious activity ───────────────────────────────────────────────

/**
 * Referrers with `threshold` or more sign-ups inside any `windowMs` (default 5 in 24 h) — typical for fake
 * accounts. Returns referrerId → the largest burst size.
 */
export const signupBursts = (referrals: Pick<LbReferral, 'referrerId' | 'createdAt'>[], threshold = 5, windowMs = DAY) => {
  const by = new Map<string, number[]>();
  for (const r of referrals) {
    const list = by.get(r.referrerId) ?? [];
    list.push(r.createdAt.getTime());
    by.set(r.referrerId, list);
  }
  const out = new Map<string, number>();
  for (const [id, times] of by) {
    times.sort((a, b) => a - b);
    let best = 0;
    for (let i = 0, j = 0; j < times.length; j++) {
      while (times[j] - times[i] >= windowMs) i++;
      best = Math.max(best, j - i + 1);
    }
    if (best >= threshold) out.set(id, best);
  }
  return out;
};
