import crypto from 'node:crypto';
import { z } from 'zod';
import type { Locale, Prisma } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { notifyUser } from '../notifications.js';
import { GROWTH_SETTING_KEYS, readSetting } from './settings.js';
import { campaignMultiplier, caseOpenedBonus, dueTiers, friendDiscount, mainReward, scaled } from './referralRules.js';

/**
 * Client referral programme ("Dostunu gətir").
 *
 * - Every CLIENT gets one personal code (ClientReferralCode), shared as `/register?ref=CODE`.
 * - The site keeps `?ref=` for 60 days in the first-party cookie `tv_ref`; the register route reads the
 *   code from the form or that cookie.
 * - The same `ref` parameter is used by the B2B agent programme (Agent.code). An agent code is tried
 *   first and, when it attributes the sign-up, the client referral is skipped: agent attribution wins.
 * - Anti-fraud: no self-referral (same e-mail, phone or passport number as the referrer → BLOCKED, no
 *   reward); one attribution and so one reward per referred client (unique referredId / referralId).
 * - Reward ledger: PENDING at sign-up → EARNED when the referred client reaches the rule's trigger
 *   (case opened / visa approved) → PAID (payout) or USED (discount), set by an admin. CANCELLED if fraud
 *   shows up later or an admin cancels it.
 * - Optional extras (referralRules.ts, all off by default): an extra amount at "case opened", tier bonuses
 *   at N approved friends, a discount for the referred friend themself and a time-limited campaign
 *   multiplier. They are rows of the same ledger (type STAGE / TIER / FRIEND, unique dedupeKey).
 * - The referrer is told (in-app + e-mail, in their language) when a friend reaches a stage and when a
 *   reward is earned; each message goes out once, guarded by the atomic stage / status change.
 */

const l10n = z.object({ az: z.string().max(2000), de: z.string().max(2000), en: z.string().max(2000), ru: z.string().max(2000) });

/** A real YYYY-MM-DD calendar day. */
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v), 'INVALID_DATE');
/** Period filter of the admin leaderboard (Baku calendar days, both inclusive). */
export const referralPeriodQuery = z.object({ from: day.optional(), to: day.optional() });
const isoDay = z.union([z.literal(''), day]);
const money = z.number().int().min(0).max(100_000);

export const referralSchema = z.object({
  enabled: z.boolean().default(true),
  trigger: z.enum(['CASE_OPENED', 'VISA_APPROVED']).default('VISA_APPROVED'),
  kind: z.enum(['DISCOUNT', 'PAYOUT']).default('DISCOUNT'),
  amount: money.default(100),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default('AZN'),
  /** Optional extra terms shown in the portal. */
  terms: l10n.default({ az: '', de: '', en: '', ru: '' }),
  /** Extra reward already when the friend opens a case (only with trigger VISA_APPROVED; 0 = off). */
  caseOpenedBonus: money.default(0),
  /** Bonus when the referrer reaches N approved friends (e.g. 3 / 5 / 10). */
  tiers: z
    .array(z.object({ approved: z.number().int().min(1).max(1000), bonus: money }))
    .max(10)
    .refine((t) => new Set(t.map((x) => x.approved)).size === t.length, 'DUPLICATE_TIER')
    .default([]),
  /** Double-sided: the referred friend gets a discount on their own fee. */
  friendDiscount: z.object({ enabled: z.boolean().default(false), amount: money.default(0) }).default({ enabled: false, amount: 0 }),
  /** Time-limited multiplier (Baku calendar days, inclusive). */
  campaign: z
    .object({
      enabled: z.boolean().default(false),
      multiplier: z.number().min(1).max(5).default(2),
      startsAt: isoDay.default(''),
      endsAt: isoDay.default(''),
      label: l10n.default({ az: '', de: '', en: '', ru: '' }),
    })
    .refine((c) => !c.startsAt || !c.endsAt || c.startsAt <= c.endsAt, 'CAMPAIGN_DATES')
    .default({ enabled: false, multiplier: 2, startsAt: '', endsAt: '', label: { az: '', de: '', en: '', ru: '' } }),
});
export type ReferralSettings = z.infer<typeof referralSchema>;
export const REFERRAL_DEFAULTS: ReferralSettings = {
  enabled: true,
  trigger: 'VISA_APPROVED',
  kind: 'DISCOUNT',
  amount: 100,
  currency: 'AZN',
  terms: { az: '', de: '', en: '', ru: '' },
  caseOpenedBonus: 0,
  tiers: [],
  friendDiscount: { enabled: false, amount: 0 },
  campaign: { enabled: false, multiplier: 2, startsAt: '', endsAt: '', label: { az: '', de: '', en: '', ru: '' } },
};
export const getReferralSettings = () => readSetting(GROWTH_SETTING_KEYS.referral, referralSchema, REFERRAL_DEFAULTS);

export const REF_COOKIE = 'tv_ref';
export const REF_COOKIE_DAYS = 60;

/** Same normalisation as agent codes (upper-case letters, digits, dashes). */
export const normaliseRefCode = (code: string) => code.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 32);

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I
const randomCode = () => {
  const bytes = crypto.randomBytes(6);
  return `TV${[...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('')}`;
};

export const referralLink = (code: string) => `${config.clientUrl}/register?ref=${encodeURIComponent(code)}`;

/** The client's code, created on first use. Codes never collide with agent codes. */
export const ensureReferralCode = async (userId: string) => {
  const existing = await prisma.clientReferralCode.findUnique({ where: { userId } });
  if (existing) return existing;
  for (let i = 0; i < 8; i++) {
    const code = randomCode();
    if (await prisma.agent.findUnique({ where: { code }, select: { id: true } })) continue;
    try {
      return await prisma.clientReferralCode.create({ data: { userId, code } });
    } catch (err) {
      if ((err as { code?: string }).code !== 'P2002') throw err;
      const again = await prisma.clientReferralCode.findUnique({ where: { userId } });
      if (again) return again; // created concurrently
    }
  }
  throw new Error('REFERRAL_CODE_EXHAUSTED');
};

const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');
const samePhone = (a: string | null | undefined, b: string | null | undefined) => {
  const x = digits(a);
  const y = digits(b);
  return x.length >= 7 && y.length >= 7 && x.slice(-9) === y.slice(-9);
};
const passportKey = (s: string | null | undefined) => (s ?? '').replace(/[\s-]/g, '').toUpperCase();

type Person = { email: string; phone: string | null; passportNumber: string | null };
/** Why a referral would be a self-referral, or null. */
export const selfReferralReason = (referrer: Person, referred: Person) => {
  if (referrer.email.trim().toLowerCase() === referred.email.trim().toLowerCase()) return 'SAME_EMAIL';
  if (samePhone(referrer.phone, referred.phone)) return 'SAME_PHONE';
  const p = passportKey(referrer.passportNumber);
  if (p.length >= 5 && p === passportKey(referred.passportNumber)) return 'SAME_PASSPORT';
  return null;
};

/**
 * Attributes a freshly registered client to the client whose code they used. Call only when no agent
 * attribution happened. Unknown codes, a disabled programme and a code of the client themself are
 * ignored. Never throws; returns the referral row (possibly BLOCKED) or null.
 */
export const attachClientReferral = async (referredId: string, rawCode: string | null | undefined) => {
  if (!rawCode) return null;
  const code = normaliseRefCode(rawCode);
  if (!code) return null;
  try {
    const settings = await getReferralSettings();
    if (!settings.enabled) return null;
    const owner = await prisma.clientReferralCode.findUnique({
      where: { code },
      include: { user: { select: { id: true, role: true, isActive: true, email: true, phone: true, passportNumber: true } } },
    });
    if (!owner || owner.user.role !== 'CLIENT' || !owner.user.isActive || owner.userId === referredId) return null;
    const referred = await prisma.user.findUnique({
      where: { id: referredId },
      select: { id: true, email: true, phone: true, passportNumber: true, referredByAgentId: true },
    });
    if (!referred || referred.referredByAgentId) return null; // agent attribution wins
    const reason = selfReferralReason(owner.user, referred);
    const main = mainReward(settings, new Date());
    const welcome = reason ? 0 : friendDiscount(settings);
    const row = await prisma.clientReferral.create({
      data: {
        referrerId: owner.userId,
        referredId,
        code,
        stage: reason ? 'BLOCKED' : 'REGISTERED',
        blockedReason: reason,
        ...(reason
          ? {}
          : {
              reward: {
                create: { referrerId: owner.userId, kind: settings.kind, trigger: main.trigger, amount: main.amount, currency: settings.currency },
              },
            }),
      },
    });
    if (welcome) {
      // Double-sided programme: the friend's own discount, ready to use on their fee.
      await prisma.referralReward.create({
        data: {
          type: 'FRIEND',
          sourceReferralId: row.id,
          dedupeKey: `FRIEND:${row.id}`,
          referrerId: referredId,
          kind: 'DISCOUNT',
          trigger: 'REGISTERED',
          amount: welcome,
          currency: settings.currency,
          status: 'EARNED',
          earnedAt: new Date(),
        },
      });
    }
    return row;
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') return null; // already attributed
    console.error('[referral] attach failed', err);
    return null;
  }
};

/**
 * Which programme a typed referral code belongs to, for the live check on the sign-up form: an ACTIVE
 * agent's code ("AGENT") or an active client's "bring a friend" code while the programme is on ("CLIENT").
 * Returns null for unknown / paused codes. Reveals nothing about the owner. Never throws.
 */
export const resolveReferralCode = async (rawCode: string | null | undefined): Promise<'AGENT' | 'CLIENT' | null> => {
  const code = normaliseRefCode(rawCode ?? '');
  if (!code) return null;
  try {
    const agent = await prisma.agent.findFirst({ where: { code, status: 'ACTIVE' }, select: { id: true } });
    if (agent) return 'AGENT';
    const owner = await prisma.clientReferralCode.findUnique({ where: { code }, select: { user: { select: { role: true, isActive: true } } } });
    if (!owner || owner.user.role !== 'CLIENT' || !owner.user.isActive) return null;
    const settings = await getReferralSettings();
    return settings.enabled ? 'CLIENT' : null;
  } catch (err) {
    console.error('[referral] resolve failed', err);
    return null;
  }
};

const EARNED_TEXT: Record<Locale, (amount: string) => Msg> = {
  az: (a) => ({ title: 'Dostunuz üçün mükafat qazandınız', body: `Dəvət etdiyiniz dost növbəti mərhələyə çatdı. Mükafatınız: ${a}. Ətraflı "Dostunu gətir" bölməsində.` }),
  de: (a) => ({ title: 'Sie haben eine Empfehlungsprämie erhalten', body: `Die von Ihnen empfohlene Person hat den nächsten Schritt erreicht. Ihre Prämie: ${a}. Details unter „Freunde werben“.` }),
  en: (a) => ({ title: 'You earned a referral reward', body: `The friend you referred reached the next step. Your reward: ${a}. See "Refer a friend" for details.` }),
  ru: (a) => ({ title: 'Вы получили бонус за друга', body: `Приглашённый вами друг достиг следующего этапа. Ваш бонус: ${a}. Подробности в разделе «Приведи друга».` }),
};

type Msg = { title: string; body: string };

const TIER_TEXT: Record<Locale, (n: number, amount: string) => Msg> = {
  az: (n, a) => ({ title: 'Bonus qazandınız', body: `Dəvət etdiyiniz ${n} dostun vizası artıq təsdiqlənib. Bonusunuz: ${a}. Ətraflı "Dostunu gətir" bölməsində.` }),
  de: (n, a) => ({ title: 'Sie haben einen Bonus erhalten', body: `Bereits ${n} von Ihnen empfohlene Personen haben ihr Visum erhalten. Ihr Bonus: ${a}. Details unter „Freunde werben“.` }),
  en: (n, a) => ({ title: 'You earned a bonus', body: `${n} friends you referred have now got their visa. Your bonus: ${a}. See "Refer a friend" for details.` }),
  ru: (n, a) => ({ title: 'Вы получили бонус', body: `Уже ${n} приглашённых вами друзей получили визу. Ваш бонус: ${a}. Подробности в разделе «Приведи друга».` }),
};

const STAGE_TEXT: Record<Locale, Record<'CASE_OPENED' | 'VISA_APPROVED', (name: string) => Msg>> = {
  az: {
    CASE_OPENED: (n) => ({ title: 'Dostunuz müraciət açdı', body: `Dəvət etdiyiniz ${n} müraciətini açdı. Ətraflı "Dostunu gətir" bölməsində.` }),
    VISA_APPROVED: (n) => ({ title: 'Dostunuzun vizası təsdiqləndi', body: `Dəvət etdiyiniz ${n} vizasını aldı. Ətraflı "Dostunu gətir" bölməsində.` }),
  },
  de: {
    CASE_OPENED: (n) => ({ title: 'Ihre Empfehlung hat einen Antrag gestartet', body: `${n}, von Ihnen empfohlen, hat einen Antrag eröffnet. Details unter „Freunde werben“.` }),
    VISA_APPROVED: (n) => ({ title: 'Ihre Empfehlung hat das Visum erhalten', body: `${n}, von Ihnen empfohlen, hat das Visum erhalten. Details unter „Freunde werben“.` }),
  },
  en: {
    CASE_OPENED: (n) => ({ title: 'Your friend opened an application', body: `${n}, whom you referred, has opened an application. See "Refer a friend" for details.` }),
    VISA_APPROVED: (n) => ({ title: 'Your friend got the visa', body: `${n}, whom you referred, has got the visa. See "Refer a friend" for details.` }),
  },
  ru: {
    CASE_OPENED: (n) => ({ title: 'Ваш друг открыл заявку', body: `${n}, приглашённый вами, открыл заявку. Подробности в разделе «Приведи друга».` }),
    VISA_APPROVED: (n) => ({ title: 'Ваш друг получил визу', body: `${n}, приглашённый вами, получил визу. Подробности в разделе «Приведи друга».` }),
  },
};

const RANK = { REGISTERED: 0, CASE_OPENED: 1, VISA_APPROVED: 2, BLOCKED: -1 } as const;
const OPEN_STATUSES = ['PENDING', 'EARNED'] as const;

const tell = (userId: string, type: 'REFERRAL_EARNED' | 'REFERRAL_STAGE', text: Msg) =>
  notifyUser(userId, { type, ...text, link: '/account/referral' }).catch((err) => console.error('[referral] notify failed', err));

/** Creates a bonus row once (unique dedupeKey); true when this call created it. */
const grantBonus = async (data: Prisma.ReferralRewardUncheckedCreateInput) => {
  try {
    await prisma.referralReward.create({ data });
    return true;
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') return false;
    throw err;
  }
};

/** Blocks a referral and cancels its unsettled rewards (main and bonuses). False when it was blocked already. */
export const blockReferral = async (id: string, reason: string) => {
  const { count } = await prisma.clientReferral.updateMany({ where: { id, stage: { not: 'BLOCKED' } }, data: { stage: 'BLOCKED', blockedReason: reason } });
  if (!count) return false;
  await prisma.referralReward.updateMany({
    where: { OR: [{ referralId: id }, { sourceReferralId: id }], status: { in: [...OPEN_STATUSES] } },
    data: { status: 'CANCELLED', note: `auto: ${reason}` },
  });
  return true;
};

/**
 * Brings referral stages and rewards up to date with the referred clients' cases (main applications
 * only): any case → CASE_OPENED, an APPROVED case → VISA_APPROVED; a PENDING reward whose trigger is
 * reached becomes EARNED. Extras: the case-opened amount when a friend first opens a case, tier bonuses
 * when the referrer's approved count crosses a tier. The referrer hears once per stage and per reward
 * (a stage that also earned a reward sends only the reward message). Fraud found later (same phone /
 * passport) blocks the referral and cancels its unsettled rewards. Returns the number of rewards earned.
 */
export const syncReferrals = async (where: Prisma.ClientReferralWhereInput = {}) => {
  const settings = await getReferralSettings();
  const rows = await prisma.clientReferral.findMany({
    where: { ...where, stage: { not: 'BLOCKED' } },
    include: {
      reward: true,
      referrer: { select: { id: true, email: true, phone: true, passportNumber: true, locale: true } },
      referred: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          passportNumber: true,
          cases: { where: { parentCaseId: null }, select: { status: true, createdAt: true, decisionAt: true, updatedAt: true }, orderBy: { createdAt: 'asc' } },
        },
      },
    },
    take: 5000,
  });
  let earned = 0;
  const approvedNow = new Map<string, { count: number; lastId: string; locale: Locale }>(); // referrer → new approvals in this run
  for (const r of rows) {
    const fraud = selfReferralReason(r.referrer, r.referred);
    if (fraud) {
      await blockReferral(r.id, fraud);
      continue;
    }
    const cases = r.referred.cases;
    const approved = cases.find((c) => c.status === 'APPROVED');
    const stage = approved ? 'VISA_APPROVED' : cases.length ? 'CASE_OPENED' : 'REGISTERED';
    let moved = false;
    if (RANK[stage] > RANK[r.stage]) {
      // Conditional on the old stage: two syncs at once move (and notify) only once.
      const { count } = await prisma.clientReferral.updateMany({
        where: { id: r.id, stage: r.stage },
        data: {
          stage,
          caseOpenedAt: r.caseOpenedAt ?? cases[0]?.createdAt ?? new Date(),
          ...(approved ? { approvedAt: r.approvedAt ?? approved.decisionAt ?? approved.updatedAt } : {}),
        },
      });
      moved = count > 0;
    }
    const locale = r.referrer.locale;
    const earnedMsgs: Msg[] = [];
    const reached = Math.max(RANK[stage], RANK[r.stage]);
    const reward = r.reward;
    if (reward && reward.status === 'PENDING' && reached >= (reward.trigger === 'CASE_OPENED' ? 1 : 2)) {
      const { count } = await prisma.referralReward.updateMany({ where: { id: reward.id, status: 'PENDING' }, data: { status: 'EARNED', earnedAt: new Date() } });
      if (count) earnedMsgs.push(EARNED_TEXT[locale](`${reward.amount} ${reward.currency}`));
    }
    if (moved && settings.enabled && r.stage === 'REGISTERED') {
      const bonus = caseOpenedBonus(settings, r.createdAt);
      const granted =
        bonus > 0 &&
        (await grantBonus({
          type: 'STAGE',
          sourceReferralId: r.id,
          dedupeKey: `STAGE:${r.id}:CASE_OPENED`,
          referrerId: r.referrerId,
          kind: settings.kind,
          trigger: 'CASE_OPENED',
          amount: bonus,
          currency: settings.currency,
          status: 'EARNED',
          earnedAt: new Date(),
        }));
      if (granted) earnedMsgs.push(EARNED_TEXT[locale](`${bonus} ${settings.currency}`));
    }
    if (moved && stage === 'VISA_APPROVED') {
      const a = approvedNow.get(r.referrerId);
      approvedNow.set(r.referrerId, { count: (a?.count ?? 0) + 1, lastId: r.id, locale });
    }
    earned += earnedMsgs.length;
    if (moved && stage !== 'REGISTERED' && !earnedMsgs.length) {
      await tell(r.referrerId, 'REFERRAL_STAGE', STAGE_TEXT[locale][stage](maskedName(r.referred.firstName, r.referred.lastName)));
    }
    for (const m of earnedMsgs) await tell(r.referrerId, 'REFERRAL_EARNED', m);
  }
  if (settings.enabled && settings.tiers.length) {
    for (const [referrerId, a] of approvedNow) {
      const after = await prisma.clientReferral.count({ where: { referrerId, stage: 'VISA_APPROVED' } });
      for (const t of dueTiers(settings.tiers, after - a.count, after)) {
        const amount = scaled(t.bonus, campaignMultiplier(settings, new Date()));
        const granted = await grantBonus({
          type: 'TIER',
          sourceReferralId: a.lastId,
          dedupeKey: `TIER:${referrerId}:${t.approved}`,
          referrerId,
          kind: settings.kind,
          trigger: 'TIER',
          amount,
          currency: settings.currency,
          status: 'EARNED',
          earnedAt: new Date(),
          note: `tier ${t.approved}`,
        });
        if (!granted) continue;
        earned++;
        await tell(referrerId, 'REFERRAL_EARNED', TIER_TEXT[a.locale](t.approved, `${amount} ${settings.currency}`));
      }
    }
  }
  return earned;
};

/** Masked display name of a referred person for the referrer's list ("Ali A."). */
export const maskedName = (first: string, last: string) => `${first.trim()} ${last.trim().charAt(0)}${last.trim() ? '.' : ''}`.trim();
