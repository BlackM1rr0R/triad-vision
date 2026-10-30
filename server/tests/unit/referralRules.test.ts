import { describe, expect, it } from 'vitest';
import {
  bakuPeriod,
  campaignActive,
  caseOpenedBonus,
  dueTiers,
  friendDiscount,
  leaderboard,
  leaderboardCsv,
  mainReward,
  nextTier,
  signupBursts,
  type LbReferral,
  type LbReward,
  type RuleSettings,
} from '../../src/lib/growth/referralRules.js';
import { REFERRAL_DEFAULTS, referralSchema } from '../../src/lib/growth/referral.js';

const HOUR = 60 * 60 * 1000;
const rules = (over: Partial<RuleSettings> = {}): RuleSettings => ({ ...REFERRAL_DEFAULTS, ...over });
const campaign = (over: Partial<RuleSettings['campaign']> = {}) => ({ enabled: true, multiplier: 2, startsAt: '2026-11-01', endsAt: '2026-11-30', ...over });

describe('referral settings defaults', () => {
  it('parse an old stored setting (without the extras) to the previous behaviour', () => {
    const old = { enabled: true, trigger: 'VISA_APPROVED', kind: 'DISCOUNT', amount: 100, currency: 'AZN', terms: { az: '', de: '', en: '', ru: '' } };
    const s = referralSchema.parse(old);
    expect(s).toEqual(REFERRAL_DEFAULTS);
    const at = new Date('2026-11-10T10:00:00Z');
    expect(mainReward(s, at)).toEqual({ trigger: 'VISA_APPROVED', amount: 100 });
    expect(caseOpenedBonus(s, at)).toBe(0);
    expect(friendDiscount(s)).toBe(0);
    expect(dueTiers(s.tiers, 0, 50)).toEqual([]);
  });

  it('rejects duplicate tiers and reversed campaign dates', () => {
    expect(referralSchema.safeParse({ tiers: [{ approved: 3, bonus: 10 }, { approved: 3, bonus: 20 }] }).success).toBe(false);
    expect(referralSchema.safeParse({ campaign: { enabled: true, startsAt: '2026-12-01', endsAt: '2026-11-01' } }).success).toBe(false);
    expect(referralSchema.safeParse({ campaign: { startsAt: '2026-02-30' } }).success).toBe(false);
  });
});

describe('campaign multiplier', () => {
  it('applies on Baku calendar days, both ends inclusive', () => {
    const c = campaign();
    expect(campaignActive(c, new Date('2026-10-31T19:59:59Z'))).toBe(false); // 23:59:59 in Baku
    expect(campaignActive(c, new Date('2026-10-31T20:00:00Z'))).toBe(true); // 1 Nov 00:00 Baku
    expect(campaignActive(c, new Date('2026-11-30T19:59:59Z'))).toBe(true);
    expect(campaignActive(c, new Date('2026-11-30T20:00:00Z'))).toBe(false);
    expect(campaignActive({ ...c, enabled: false }, new Date('2026-11-10T00:00:00Z'))).toBe(false);
    expect(campaignActive({ ...c, multiplier: 1 }, new Date('2026-11-10T00:00:00Z'))).toBe(false);
    expect(campaignActive({ ...c, startsAt: '', endsAt: '' }, new Date('2026-11-10T00:00:00Z'))).toBe(false);
    expect(campaignActive({ ...c, startsAt: '' }, new Date('2020-01-01T00:00:00Z'))).toBe(true); // open start
  });

  it('multiplies the main reward and the case-opened amount, not the friend discount', () => {
    const s = rules({ campaign: campaign({ multiplier: 1.5 }), caseOpenedBonus: 25, friendDiscount: { enabled: true, amount: 50 } });
    const inside = new Date('2026-11-15T12:00:00Z');
    const outside = new Date('2026-12-15T12:00:00Z');
    expect(mainReward(s, inside).amount).toBe(150);
    expect(mainReward(s, outside).amount).toBe(100);
    expect(caseOpenedBonus(s, inside)).toBe(38); // 37.5 rounded
    expect(friendDiscount(s)).toBe(50);
  });

  it('gives the case-opened amount only when the main reward waits for the visa', () => {
    expect(caseOpenedBonus(rules({ caseOpenedBonus: 20 }), new Date())).toBe(20);
    expect(caseOpenedBonus(rules({ caseOpenedBonus: 20, trigger: 'CASE_OPENED' }), new Date())).toBe(0);
  });
});

describe('tier bonuses', () => {
  const tiers = [
    { approved: 10, bonus: 300 },
    { approved: 3, bonus: 50 },
    { approved: 5, bonus: 100 },
  ];
  it('are due only when the approved count crosses them, once', () => {
    expect(dueTiers(tiers, 2, 3)).toEqual([{ approved: 3, bonus: 50 }]);
    expect(dueTiers(tiers, 3, 4)).toEqual([]);
    expect(dueTiers(tiers, 2, 6).map((t) => t.approved)).toEqual([3, 5]);
    expect(dueTiers(tiers, 2, 6, [3])).toEqual([{ approved: 5, bonus: 100 }]);
    expect(dueTiers([{ approved: 3, bonus: 0 }], 2, 3)).toEqual([]); // zero bonus = off
  });
  it('tell the portal what the next tier is', () => {
    expect(nextTier(tiers, 0)).toEqual({ approved: 3, bonus: 50, remaining: 3 });
    expect(nextTier(tiers, 4)).toEqual({ approved: 5, bonus: 100, remaining: 1 });
    expect(nextTier(tiers, 10)).toBeNull();
    expect(nextTier([], 0)).toBeNull();
  });
});

describe('leaderboard', () => {
  const d = (s: string) => new Date(s);
  const referrals: LbReferral[] = [
    { referrerId: 'a', stage: 'VISA_APPROVED', createdAt: d('2026-09-01T10:00:00Z'), caseOpenedAt: d('2026-09-10T10:00:00Z'), approvedAt: d('2026-10-05T10:00:00Z') },
    { referrerId: 'a', stage: 'CASE_OPENED', createdAt: d('2026-10-02T10:00:00Z'), caseOpenedAt: d('2026-10-03T10:00:00Z'), approvedAt: null },
    { referrerId: 'b', stage: 'REGISTERED', createdAt: d('2026-10-20T10:00:00Z'), caseOpenedAt: null, approvedAt: null },
    { referrerId: 'b', stage: 'BLOCKED', createdAt: d('2026-10-21T10:00:00Z'), caseOpenedAt: null, approvedAt: null },
  ];
  const rewards: LbReward[] = [
    { referrerId: 'a', type: 'REFERRAL', status: 'PAID', amount: 100, createdAt: d('2026-09-01T10:00:00Z'), earnedAt: d('2026-10-05T10:00:00Z'), settledAt: d('2026-10-06T10:00:00Z') },
    { referrerId: 'a', type: 'STAGE', status: 'EARNED', amount: 20, createdAt: d('2026-10-03T10:00:00Z'), earnedAt: d('2026-10-03T10:00:00Z'), settledAt: null },
    { referrerId: 'a', type: 'REFERRAL', status: 'PENDING', amount: 100, createdAt: d('2026-10-02T10:00:00Z'), earnedAt: null, settledAt: null },
    { referrerId: 'b', type: 'REFERRAL', status: 'PENDING', amount: 100, createdAt: d('2026-10-20T10:00:00Z'), earnedAt: null, settledAt: null },
    { referrerId: 'b', type: 'REFERRAL', status: 'CANCELLED', amount: 100, createdAt: d('2026-10-21T10:00:00Z'), earnedAt: null, settledAt: null },
    { referrerId: 'x', type: 'FRIEND', status: 'EARNED', amount: 50, createdAt: d('2026-10-20T10:00:00Z'), earnedAt: d('2026-10-20T10:00:00Z'), settledAt: null },
  ];

  it('sums every stage and reward per referrer over all time (friend discounts left out)', () => {
    const rows = leaderboard(referrals, rewards);
    expect(rows.map((r) => r.referrerId)).toEqual(['a', 'b']);
    expect(rows[0]).toEqual({ referrerId: 'a', registered: 2, caseOpened: 2, visaApproved: 1, blocked: 0, earned: 120, pending: 100, settled: 100, outstanding: 20 });
    expect(rows[1]).toMatchObject({ registered: 1, blocked: 1, pending: 100, earned: 0 });
  });

  it('counts each event by its own date in the period', () => {
    const rows = leaderboard(referrals, rewards, bakuPeriod('2026-10-01', '2026-10-31'));
    expect(rows[0]).toMatchObject({ referrerId: 'a', registered: 1, caseOpened: 1, visaApproved: 1, earned: 120, settled: 100, pending: 100 });
    const sept = leaderboard(referrals, rewards, bakuPeriod('2026-09-01', '2026-09-30'));
    expect(sept).toHaveLength(1); // only a has September events
    expect(sept[0]).toMatchObject({ referrerId: 'a', registered: 1, caseOpened: 1, visaApproved: 0, earned: 0 });
  });

  it('exports CSV with a BOM, semicolons and formula-safe names', () => {
    const csv = leaderboardCsv([{ ...leaderboard(referrals, rewards)[0], name: '=HYPERLINK("x")', email: 'a@x.az' }], 'AZN');
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.trim().split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('Qazanılıb (AZN)');
    expect(lines[1]).toBe(`"'=HYPERLINK(""x"")";a@x.az;2;2;1;0;120;100;100;20`);
  });
});

describe('sign-up bursts', () => {
  it('flags referrers with many sign-ups inside 24 h', () => {
    const t0 = new Date('2026-10-01T00:00:00Z').getTime();
    const many = Array.from({ length: 6 }, (_, i) => ({ referrerId: 'a', createdAt: new Date(t0 + i * 2 * HOUR) }));
    const spread = Array.from({ length: 6 }, (_, i) => ({ referrerId: 'b', createdAt: new Date(t0 + i * 30 * HOUR) }));
    const r = signupBursts([...many, ...spread]);
    expect(r.get('a')).toBe(6);
    expect(r.has('b')).toBe(false);
    expect(signupBursts(spread, 2).has('b')).toBe(false); // 30 h apart
    expect(signupBursts(spread, 2, 31 * HOUR).get('b')).toBe(2);
  });
});
