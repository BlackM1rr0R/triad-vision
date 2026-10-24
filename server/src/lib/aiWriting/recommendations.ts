import crypto from 'node:crypto';
import type { Locale } from '@prisma/client';
import { prisma } from '../../db.js';
import { aiComplete, CHEAP_MODEL } from '../ai/complete.js';
import { pickL10n } from '../jobsNotifications.js';
import { matchCandidate, type MatchGap } from '../matching.js';
import { openVacancyWhere } from '../vacancies.js';
import { LANG_NAMES, clip, str } from './common.js';

/**
 * "Vacancies that fit you": the top published vacancies by the shared match score, with one short AI line
 * per vacancy ("why this fits you") and one improvement tip. Cached per user for 24 h in memory and
 * recomputed as soon as the profile (or the set of top vacancies) changes. Without AI (limit, failure)
 * the same matches come back with deterministic reasons (`met` / `gaps` codes the client translates).
 */

export const TTL_MS = 24 * 60 * 60 * 1000;
/** A result without AI lines is only kept briefly, so the AI is tried again later in the day. */
export const FALLBACK_TTL_MS = 60 * 60 * 1000;
const TOP = 5;
/** Criteria a vacancy does not ask for count as met (licence, visa, recognition ≈ 32 points), so the floor sits above that. */
const MIN_SCORE = 45;

export type MetCode = 'PROFESSION' | 'GERMAN' | 'EXPERIENCE' | 'LICENCE' | 'VISA';

export interface RecommendationItem {
  vacancy: { id: string; slug: string; title: string; city: string | null; company: string | null; salaryMin: number | null; salaryMax: number | null; germanLevel: string | null; visaLabel: string | null };
  score: number;
  met: MetCode[];
  gaps: MatchGap[];
  why: string | null;
}

export interface Recommendations {
  items: RecommendationItem[];
  tip: string | null;
  ai: boolean;
  generatedAt: string;
}

const profileSelect = { profession: true, experienceYears: true, germanLevel: true, education: true, drivingLicence: true, recognitionStatus: true } as const;

const cache = new Map<string, { at: number; ttl: number; hash: string; locale: Locale; value: Recommendations }>();

export const clearRecommendationCache = () => cache.clear();

/** Criteria of the vacancy the candidate already meets (only those the vacancy actually asks for). */
const metCodes = (v: { profession: string | null; germanLevel: string | null; minExperience: number | null; drivingLicence: string | null; visaCategory: unknown }, gaps: MatchGap[]): MetCode[] => {
  const has = (c: string) => gaps.some((g) => g.code === c);
  const out: MetCode[] = [];
  if (v.profession && !has('PROFESSION')) out.push('PROFESSION');
  if (v.germanLevel && v.germanLevel !== 'none' && !has('GERMAN')) out.push('GERMAN');
  if (v.minExperience && !has('EXPERIENCE')) out.push('EXPERIENCE');
  if (v.drivingLicence && !has('LICENCE')) out.push('LICENCE');
  if (v.visaCategory && !has('VISA_GERMAN') && !has('VISA_EDUCATION')) out.push('VISA');
  return out;
};

const AI_SYSTEM = (lang: Locale) => `You are a friendly career adviser of Triad Vision (jobs in Germany for candidates from Azerbaijan).
For each vacancy write ONE short sentence (max 110 characters) in ${LANG_NAMES[lang]} saying why it fits the candidate, based only on the given facts.
Then ONE practical tip (max 140 characters) in ${LANG_NAMES[lang]} on what would improve their chances or salary (e.g. a higher German level, a licence class). Only use figures that appear in the data; never promise a job or a visa.
Answer with JSON only: {"why":{"<id>":"…"},"tip":"…"}`;

/** Top matches for a client; `force` skips the cache. */
export const recommendationsFor = async (userId: string, locale: Locale, opts: { force?: boolean } = {}): Promise<Recommendations> => {
  const [user, vacancies] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: profileSelect }),
    prisma.vacancy.findMany({
      where: openVacancyWhere(),
      orderBy: { publishedAt: 'desc' },
      take: 300,
      select: {
        id: true,
        slug: true,
        title: true,
        city: true,
        showCompany: true,
        company: { select: { name: true } },
        profession: true,
        germanLevel: true,
        minExperience: true,
        drivingLicence: true,
        salaryMin: true,
        salaryMax: true,
        visaCategory: { select: { visaLabel: true, germanLevel: true } },
      },
    }),
  ]);

  const ranked = vacancies
    .map((v) => ({ v, m: matchCandidate(user, v) }))
    .filter((x) => x.m.score >= MIN_SCORE)
    .sort((a, b) => b.m.score - a.m.score)
    .slice(0, TOP);

  const hash = crypto
    .createHash('sha1')
    .update(JSON.stringify([user, ranked.map((r) => [r.v.id, r.m.score])]))
    .digest('hex');
  const hit = cache.get(userId);
  if (!opts.force && hit && hit.hash === hash && hit.locale === locale && Date.now() - hit.at < hit.ttl) return hit.value;

  const items: RecommendationItem[] = ranked.map(({ v, m }) => ({
    vacancy: {
      id: v.id,
      slug: v.slug,
      title: pickL10n(v.title, locale),
      city: v.city,
      company: v.showCompany ? (v.company?.name ?? null) : null,
      salaryMin: v.salaryMin,
      salaryMax: v.salaryMax,
      germanLevel: v.germanLevel,
      visaLabel: v.visaCategory?.visaLabel ?? null,
    },
    score: m.score,
    met: metCodes(v, m.gaps),
    gaps: m.gaps,
    why: null,
  }));

  let tip: string | null = null;
  let ai = false;
  if (items.length) {
    const facts = [
      `Candidate: profession ${clip(user.profession, 80) || '—'}, experience ${user.experienceYears ?? '—'} years, German ${user.germanLevel || 'none'}, education ${user.education || '—'}, licence ${clip(user.drivingLicence, 30) || '—'}`,
      ...items.map(
        (it) =>
          `[${it.vacancy.id}] ${clip(it.vacancy.title, 90)}${it.vacancy.city ? `, ${it.vacancy.city}` : ''}; score ${it.score}; salary ${it.vacancy.salaryMin ?? '?'}–${it.vacancy.salaryMax ?? '?'} EUR; German ${it.vacancy.germanLevel ?? '—'}; meets: ${it.met.join(',') || '—'}; missing: ${it.gaps.map((g) => `${g.code}=${g.required}`).join(',') || '—'}`,
      ),
    ].join('\n');
    const r = await aiComplete({ userId, scope: 'CLIENT', purpose: 'vacancy-recommendations', model: CHEAP_MODEL, system: AI_SYSTEM(locale), input: facts, maxTokens: 350, json: true, timeoutMs: 20_000 });
    if (r.ok && r.json) {
      const why = (r.json.why && typeof r.json.why === 'object' ? r.json.why : {}) as Record<string, unknown>;
      for (const it of items) it.why = str(why[it.vacancy.id], 160) || null;
      tip = str(r.json.tip, 200) || null;
      ai = items.some((it) => it.why) || !!tip;
    }
  }

  const value: Recommendations = { items, tip, ai, generatedAt: new Date().toISOString() };
  cache.set(userId, { at: Date.now(), ttl: ai || !items.length ? TTL_MS : FALLBACK_TTL_MS, hash, locale, value });
  if (cache.size > 5000) cache.delete(cache.keys().next().value!);
  return value;
};
