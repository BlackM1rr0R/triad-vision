import type { Request } from 'express';
import type { CandidatePoolProfile, Locale, PoolInterestStatus } from '@prisma/client';
import { prisma } from '../../db.js';
import { HttpError } from '../http.js';
import { isImpersonating } from '../privacy/impersonationContext.js';
import { notifyStaff, notifyUser } from '../notifications.js';
import { recordConsent } from '../privacy/consents.js';
import { POOL_CONSENT_VERSION, POOL_DAILY_DETAIL_LIMIT, POOL_DAILY_SEARCH_LIMIT } from './constants.js';
import { randomPoolCode } from './anonymous.js';

const DAY = 24 * 60 * 60 * 1000;

/** The client's pool row, created on first use with a fresh random code. */
export const ensurePoolProfile = async (userId: string) => {
  const existing = await prisma.candidatePoolProfile.findUnique({ where: { userId } });
  if (existing) return existing;
  // "View as client" never writes: an unsaved, opted-out profile (the code is assigned on the client's own first visit).
  if (isImpersonating()) {
    const now = new Date();
    return {
      id: `transient-${userId}`,
      userId,
      code: 'TV-K-····',
      consentAt: null,
      consentVersion: null,
      withdrawnAt: null,
      professions: null,
      languages: null,
      regions: null,
      earliestStart: null,
      availability: null,
      skills: null,
      track: 'JOB',
      staffReady: false,
      hidden: false,
      hiddenReason: null,
      summary: null,
      staffUpdatedById: null,
      staffUpdatedAt: null,
      createdAt: now,
      updatedAt: now,
    } satisfies CandidatePoolProfile;
  }
  for (let i = 0; i < 40; i++) {
    const code = randomPoolCode(i < 20 ? 4 : 5);
    if (await prisma.candidatePoolProfile.findUnique({ where: { code }, select: { id: true } })) continue;
    try {
      return await prisma.candidatePoolProfile.create({ data: { userId, code } });
    } catch (err) {
      // Unique race (same code or a parallel create for this user): retry / re-read.
      if ((err as { code?: string }).code !== 'P2002') throw err;
      const again = await prisma.candidatePoolProfile.findUnique({ where: { userId } });
      if (again) return again;
    }
  }
  throw new Error('pool code space exhausted');
};

/**
 * Switches the client's own opt-in. On: requires the current consent text version. Off: takes effect at
 * once (employers' shortlists of the profile are removed; staff keep the interest history). Every change is
 * appended to the consent log (CANDIDATE_POOL, with the text version).
 */
export const setPoolConsent = async (req: Request, userId: string, email: string, on: boolean, version?: string) => {
  const p = await ensurePoolProfile(userId);
  if (on) {
    if (version !== POOL_CONSENT_VERSION) throw new HttpError(409, 'CONSENT_VERSION_OUTDATED');
    if (p.consentAt && p.consentVersion === POOL_CONSENT_VERSION) return p;
    const updated = await prisma.candidatePoolProfile.update({ where: { id: p.id }, data: { consentAt: new Date(), consentVersion: POOL_CONSENT_VERSION, withdrawnAt: null } });
    await recordConsent({ userId, email, type: 'CANDIDATE_POOL', granted: true, version: POOL_CONSENT_VERSION, source: 'PROFILE', req });
    return updated;
  }
  if (!p.consentAt) return p;
  const updated = await prisma.candidatePoolProfile.update({ where: { id: p.id }, data: { consentAt: null, withdrawnAt: new Date() } });
  await prisma.candidatePoolSaved.deleteMany({ where: { profileId: p.id } });
  await recordConsent({ userId, email, type: 'CANDIDATE_POOL', granted: false, version: p.consentVersion ?? POOL_CONSENT_VERSION, source: 'PROFILE', req });
  return updated;
};

// ─── View log and daily caps ────────────────────────────────────────────

/**
 * Logs one search page / opened profile and enforces the per-company daily caps. Crossing a cap notifies
 * staff once (the request that hits it) and answers 429 POOL_DAILY_LIMIT from then on for 24 h.
 */
export const logPoolView = async (input: { companyId: string; companyName: string; userId: string; kind: 'SEARCH' | 'DETAIL'; profileId?: string; results?: number }) => {
  // "View as employer": nothing is logged and the company's daily cap is not used up (the cap is still enforced).
  const readOnly = isImpersonating();
  const limit = input.kind === 'DETAIL' ? POOL_DAILY_DETAIL_LIMIT : POOL_DAILY_SEARCH_LIMIT;
  const since = new Date(Date.now() - DAY);
  const count = await prisma.candidatePoolView.count({ where: { companyId: input.companyId, kind: input.kind, createdAt: { gte: since } } });
  if (count >= limit) {
    if (count === limit && !readOnly) {
      // One marker row above the cap, so the notification is sent once.
      await prisma.candidatePoolView.create({ data: { companyId: input.companyId, userId: input.userId, kind: input.kind, results: 0 } });
      await notifyStaff(
        `Namizəd bazası: limit aşıldı — ${input.companyName}`.slice(0, 180),
        `${input.companyName} son 24 saatda ${limit} ${input.kind === 'DETAIL' ? 'profil açıb' : 'axtarış edib'}. Giriş müvəqqəti bloklandı. Baxış jurnalını yoxlayın.`,
        { link: '/admin/candidate-pool?tab=views', type: 'CANDIDATE_POOL_LIMIT' },
      );
    }
    throw new HttpError(429, 'POOL_DAILY_LIMIT');
  }
  if (readOnly) return;
  await prisma.candidatePoolView.create({
    data: { companyId: input.companyId, userId: input.userId, kind: input.kind, profileId: input.profileId ?? null, results: input.results ?? 0 },
  });
};

// ─── Employer notifications (status set by staff) ───────────────────────

const STATUS_TEXT: Record<Locale, Record<PoolInterestStatus, string>> = {
  de: { NEW: 'Neu', CONTACTED: 'Kandidat kontaktiert', INTERVIEW: 'Vorstellungsgespräch vereinbart', CLOSED: 'Abgeschlossen' },
  en: { NEW: 'New', CONTACTED: 'Candidate contacted', INTERVIEW: 'Interview arranged', CLOSED: 'Closed' },
  az: { NEW: 'Yeni', CONTACTED: 'Namizədlə əlaqə saxlanıldı', INTERVIEW: 'Müsahibə təyin edildi', CLOSED: 'Bağlandı' },
  ru: { NEW: 'Новый', CONTACTED: 'Кандидат уведомлён', INTERVIEW: 'Собеседование назначено', CLOSED: 'Закрыт' },
};

const TITLE: Record<Locale, (code: string) => string> = {
  de: (c) => `Ihre Anfrage zu ${c}`,
  en: (c) => `Your request about ${c}`,
  az: (c) => `${c} üzrə sorğunuz`,
  ru: (c) => `Ваш запрос по ${c}`,
};

const BODY: Record<Locale, (status: string) => string> = {
  de: (s) => `Neuer Status: ${s}.`,
  en: (s) => `New status: ${s}.`,
  az: (s) => `Yeni status: ${s}.`,
  ru: (s) => `Новый статус: ${s}.`,
};

export const notifyEmployerInterestStatus = async (employerUserId: string | null, code: string, status: PoolInterestStatus) => {
  if (!employerUserId) return;
  const u = await prisma.user.findUnique({ where: { id: employerUserId }, select: { locale: true, role: true } });
  if (!u || u.role !== 'COMPANY') return;
  await notifyUser(employerUserId, {
    type: 'CANDIDATE_POOL_INTEREST',
    title: TITLE[u.locale](code),
    body: BODY[u.locale](STATUS_TEXT[u.locale][status]),
    link: '/company/candidates/pool/interests',
  });
};
