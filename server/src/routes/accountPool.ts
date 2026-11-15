import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { HttpError, forbidden, parse } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { POOL_AVAILABILITY, POOL_CONSENT_VERSION, POOL_LANGUAGE_LEVELS, POOL_LANGUAGES, POOL_LIMITS, POOL_REGIONS, POOL_TRACKS } from '../lib/pool/constants.js';
import { enumList, isVisible, languageList, poolCard, poolUserSelect, strList } from '../lib/pool/anonymous.js';
import { ensurePoolProfile, setPoolConsent } from '../lib/pool/service.js';

/**
 * Client side of the anonymous candidate pool — mounted at /api/account/candidate-pool (CLIENT):
 *
 *   GET /   own pool entry: consent state, pool details, the exact anonymous card employers see
 *   PUT /   { consent?, version?, professions?, languages?, regions?, earliestStart?, availability?, skills?, track? }
 *
 * The opt-in ("Show my anonymous profile to employers") is off by default and needs the current consent text
 * version; switching it off removes the profile from the pool at once. Design: lib/pool/anonymous.ts.
 */
export const accountPoolRouter = Router();
accountPoolRouter.use(requireAuth);
accountPoolRouter.use((req, _res, next) => (req.user?.role === 'CLIENT' ? next() : next(forbidden())));

const DAY = 24 * 60 * 60 * 1000;

const state = async (userId: string) => {
  const [p, user] = await Promise.all([ensurePoolProfile(userId), prisma.user.findUniqueOrThrow({ where: { id: userId }, select: poolUserSelect })]);
  const [views30d, interests] = await Promise.all([
    prisma.candidatePoolView.count({ where: { profileId: p.id, kind: 'DETAIL', createdAt: { gte: new Date(Date.now() - 30 * DAY) } } }),
    prisma.candidatePoolInterest.count({ where: { profileId: p.id } }),
  ]);
  return {
    currentVersion: POOL_CONSENT_VERSION,
    profile: {
      code: p.code,
      consent: !!p.consentAt,
      consentAt: p.consentAt,
      consentVersion: p.consentVersion,
      withdrawnAt: p.withdrawnAt,
      visible: isVisible({ ...p, user }),
      staffReady: p.staffReady,
      pausedByTeam: p.hidden,
      professions: strList(p.professions, POOL_LIMITS.professions, POOL_LIMITS.professionLength),
      languages: languageList(p.languages),
      regions: enumList(p.regions, POOL_REGIONS),
      earliestStart: p.earliestStart ? p.earliestStart.toISOString().slice(0, 10) : null,
      availability: p.availability,
      skills: strList(p.skills, POOL_LIMITS.skills, POOL_LIMITS.skillLength),
      track: p.track,
    },
    /** What is still missing before the profile can be shown (the main profession lives in the profile). */
    missing: user.profession?.trim() ? [] : ['profession'],
    /** Exactly what employers see. */
    preview: poolCard(p, user),
    stats: { views30d, interests },
  };
};

accountPoolRouter.get('/', async (req, res) => {
  res.json(await state(req.user!.id));
});

const item = (len: number) => z.string().trim().min(1).max(len);
const body = z
  .object({
    consent: z.boolean().optional(),
    version: z.string().max(40).optional(),
    professions: z.array(item(POOL_LIMITS.professionLength)).max(POOL_LIMITS.professions).optional(),
    languages: z.array(z.object({ lang: z.enum(POOL_LANGUAGES), level: z.enum(POOL_LANGUAGE_LEVELS) })).max(POOL_LIMITS.languages).optional(),
    regions: z.array(z.enum(POOL_REGIONS)).max(POOL_REGIONS.length).optional(),
    earliestStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    availability: z.enum(POOL_AVAILABILITY).nullable().optional(),
    skills: z.array(item(POOL_LIMITS.skillLength)).max(POOL_LIMITS.skills).optional(),
    track: z.enum(POOL_TRACKS).optional(),
  })
  .strict();

accountPoolRouter.put('/', async (req, res) => {
  const b = parse(body, req.body ?? {});
  const userId = req.user!.id;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, profession: true } });
  const p = await ensurePoolProfile(userId);
  const data: Prisma.CandidatePoolProfileUpdateInput = {};
  if (b.professions) data.professions = strList(b.professions, POOL_LIMITS.professions, POOL_LIMITS.professionLength);
  if (b.languages) data.languages = b.languages;
  if (b.regions) data.regions = [...new Set(b.regions)];
  if (b.earliestStart !== undefined) {
    const d = b.earliestStart ? new Date(`${b.earliestStart}T00:00:00Z`) : null;
    if (d && Number.isNaN(d.getTime())) throw new HttpError(400, 'INVALID_DATE');
    data.earliestStart = d;
  }
  if (b.availability !== undefined) data.availability = b.availability;
  if (b.skills) data.skills = strList(b.skills, POOL_LIMITS.skills, POOL_LIMITS.skillLength);
  if (b.track) data.track = b.track;
  if (Object.keys(data).length) await prisma.candidatePoolProfile.update({ where: { id: p.id }, data });

  if (b.consent !== undefined && b.consent !== !!p.consentAt) {
    if (b.consent && !user.profession?.trim()) throw new HttpError(409, 'PROFILE_INCOMPLETE');
    await setPoolConsent(req, userId, user.email, b.consent, b.version);
    await audit(req, b.consent ? 'CANDIDATE_POOL_OPT_IN' : 'CANDIDATE_POOL_OPT_OUT', `user:${userId}`, { code: p.code, version: b.consent ? POOL_CONSENT_VERSION : p.consentVersion });
  } else if (b.consent && p.consentVersion !== POOL_CONSENT_VERSION) {
    // Re-confirming after the consent text changed.
    await setPoolConsent(req, userId, user.email, true, b.version);
  }
  if (Object.keys(data).length) await audit(req, 'CANDIDATE_POOL_PROFILE_UPDATED', `user:${userId}`, { fields: Object.keys(data) });
  res.json(await state(userId));
});
