import crypto from 'node:crypto';
import { z } from 'zod';
import type { Locale, Prisma } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { notifyUser } from '../notifications.js';
import { GROWTH_SETTING_KEYS, readSetting } from './settings.js';

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
 */

const l10n = z.object({ az: z.string().max(2000), de: z.string().max(2000), en: z.string().max(2000), ru: z.string().max(2000) });

export const referralSchema = z.object({
  enabled: z.boolean().default(true),
  trigger: z.enum(['CASE_OPENED', 'VISA_APPROVED']).default('VISA_APPROVED'),
  kind: z.enum(['DISCOUNT', 'PAYOUT']).default('DISCOUNT'),
  amount: z.number().int().min(0).max(100_000).default(100),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default('AZN'),
  /** Optional extra terms shown in the portal. */
  terms: l10n.default({ az: '', de: '', en: '', ru: '' }),
});
export type ReferralSettings = z.infer<typeof referralSchema>;
export const REFERRAL_DEFAULTS: ReferralSettings = {
  enabled: true,
  trigger: 'VISA_APPROVED',
  kind: 'DISCOUNT',
  amount: 100,
  currency: 'AZN',
  terms: { az: '', de: '', en: '', ru: '' },
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
    return await prisma.clientReferral.create({
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
                create: { referrerId: owner.userId, kind: settings.kind, trigger: settings.trigger, amount: settings.amount, currency: settings.currency },
              },
            }),
      },
    });
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') return null; // already attributed
    console.error('[referral] attach failed', err);
    return null;
  }
};

const EARNED_TEXT: Record<Locale, (amount: string) => { title: string; body: string }> = {
  az: (a) => ({ title: 'Dostunuz üçün mükafat qazandınız', body: `Dəvət etdiyiniz dost növbəti mərhələyə çatdı. Mükafatınız: ${a}. Ətraflı "Dostunu gətir" bölməsində.` }),
  de: (a) => ({ title: 'Sie haben eine Empfehlungsprämie erhalten', body: `Die von Ihnen empfohlene Person hat den nächsten Schritt erreicht. Ihre Prämie: ${a}. Details unter „Freunde werben“.` }),
  en: (a) => ({ title: 'You earned a referral reward', body: `The friend you referred reached the next step. Your reward: ${a}. See "Refer a friend" for details.` }),
  ru: (a) => ({ title: 'Вы получили бонус за друга', body: `Приглашённый вами друг достиг следующего этапа. Ваш бонус: ${a}. Подробности в разделе «Приведи друга».` }),
};

/**
 * Brings referral stages and rewards up to date with the referred clients' cases (main applications
 * only): any case → CASE_OPENED, an APPROVED case → VISA_APPROVED; a PENDING reward whose trigger is
 * reached becomes EARNED (the referrer is notified once). Fraud found later (same phone / passport)
 * blocks the referral and cancels an unsettled reward. Returns the number of rewards earned.
 */
export const syncReferrals = async (where: Prisma.ClientReferralWhereInput = {}) => {
  const rows = await prisma.clientReferral.findMany({
    where: { ...where, stage: { not: 'BLOCKED' } },
    include: {
      reward: true,
      referrer: { select: { id: true, email: true, phone: true, passportNumber: true, locale: true } },
      referred: {
        select: {
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
  for (const r of rows) {
    const fraud = selfReferralReason(r.referrer, r.referred);
    if (fraud) {
      await prisma.clientReferral.update({ where: { id: r.id }, data: { stage: 'BLOCKED', blockedReason: fraud } });
      if (r.reward && ['PENDING', 'EARNED'].includes(r.reward.status)) {
        await prisma.referralReward.update({ where: { id: r.reward.id }, data: { status: 'CANCELLED', note: `auto: ${fraud}` } });
      }
      continue;
    }
    const cases = r.referred.cases;
    const approved = cases.find((c) => c.status === 'APPROVED');
    const stage = approved ? 'VISA_APPROVED' : cases.length ? 'CASE_OPENED' : 'REGISTERED';
    const rank = { REGISTERED: 0, CASE_OPENED: 1, VISA_APPROVED: 2, BLOCKED: -1 } as const;
    if (rank[stage] > rank[r.stage]) {
      await prisma.clientReferral.update({
        where: { id: r.id },
        data: {
          stage,
          caseOpenedAt: r.caseOpenedAt ?? cases[0]?.createdAt ?? new Date(),
          ...(approved ? { approvedAt: r.approvedAt ?? approved.decisionAt ?? approved.updatedAt } : {}),
        },
      });
    }
    const reached = Math.max(rank[stage], rank[r.stage]);
    const reward = r.reward;
    if (reward && reward.status === 'PENDING' && reached >= (reward.trigger === 'CASE_OPENED' ? 1 : 2)) {
      const { count } = await prisma.referralReward.updateMany({ where: { id: reward.id, status: 'PENDING' }, data: { status: 'EARNED', earnedAt: new Date() } });
      if (count) {
        earned++;
        const text = EARNED_TEXT[r.referrer.locale](`${reward.amount} ${reward.currency}`);
        await notifyUser(r.referrerId, { type: 'REFERRAL_EARNED', ...text, link: '/account/referral' }).catch((err) =>
          console.error('[referral] notify failed', err),
        );
      }
    }
  }
  return earned;
};

/** Masked display name of a referred person for the referrer's list ("Ali A."). */
export const maskedName = (first: string, last: string) => `${first.trim()} ${last.trim().charAt(0)}${last.trim() ? '.' : ''}`.trim();
