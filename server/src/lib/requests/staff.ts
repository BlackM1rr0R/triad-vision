import type { Request } from 'express';
import type { CandidateRequest, Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { FINAL_STATUSES } from '../caseFlow.js';
import { GERMAN_LEVELS, germanRank, licenceCovers, matchCandidate, normaliseText, professionSimilarity, type MatchGap } from '../matching.js';
import { fillL10n, uniqueSlug } from '../vacancies.js';
import { audit } from '../audit.js';
import { emitWebhook } from '../ops/webhooks.js';
import { onVacancyPublished } from '../jobAlerts/service.js';
import { notifyApplicationStatus, notifyCandidateProposed } from '../jobsNotifications.js';
import { conflict } from '../http.js';

/** Upper bound of candidate rows scored in memory. */
const POOL_LIMIT = 3000;
export const SUGGESTION_LIMIT = 50;

/** Bonus points on top of the 0–100 match score (only used for ordering). */
const CITY_BONUS = 5;
const VERIFIED_BONUS = 2;

export type ReasonCode = 'PROFESSION_EXACT' | 'PROFESSION_RELATED' | 'GERMAN_OK' | 'LICENCE_OK' | 'EXPERIENCE_OK' | 'CITY' | 'VERIFIED' | 'ACTIVE_CASE';

export interface Suggestion {
  user: {
    id: string;
    firstName: string;
    lastName: string;
    city: string | null;
    profession: string | null;
    experienceYears: number | null;
    germanLevel: string | null;
    education: string | null;
    drivingLicence: string | null;
    emailVerifiedAt: Date | null;
  };
  score: number;
  rank: number;
  reasons: ReasonCode[];
  gaps: MatchGap[];
  activeCase: { id: string; number: string; status: string } | null;
  application: { id: string; status: string } | null;
}

type VisaForMatch = { visaLabel: string; germanLevel: string | null } | null;

const visaOf = async (id: string | null): Promise<VisaForMatch> =>
  id ? await prisma.visaCategory.findUnique({ where: { id }, select: { visaLabel: true, germanLevel: true } }) : null;

/**
 * Ranks CLIENT users for a request.
 * Hard filters: active account; German level ≥ the requested minimum; driving licence covers the requested
 * categories; not already placed with another employer through an active case.
 * Score: the shared matchCandidate() score (profession, German, experience, licence, visa fit), plus a small
 * bonus for the requested city / region and a verified e-mail. Top 50.
 */
export const suggestCandidates = async (r: CandidateRequest): Promise<Suggestion[]> => {
  const visa = await visaOf(r.visaCategoryId);
  const target = { profession: r.profession, germanLevel: r.germanLevel, minExperience: r.minExperience, drivingLicence: r.drivingLicence, visaCategory: visa };

  const and: Prisma.UserWhereInput[] = [
    { role: 'CLIENT', isActive: true },
    // Placed elsewhere: an active case linked to a different employer.
    { NOT: { cases: { some: { status: { notIn: FINAL_STATUSES }, companyId: { not: null, notIn: [r.companyId] } } } } },
  ];
  if (germanRank(r.germanLevel) > 0) and.push({ germanLevel: { in: GERMAN_LEVELS.filter((l) => germanRank(l) >= germanRank(r.germanLevel)) } });
  if (r.drivingLicence) and.push({ drivingLicence: { not: null } });

  const rows = await prisma.user.findMany({
    where: { AND: and },
    orderBy: { createdAt: 'desc' },
    take: POOL_LIMIT,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      city: true,
      profession: true,
      experienceYears: true,
      germanLevel: true,
      education: true,
      drivingLicence: true,
      recognitionStatus: true,
      emailVerifiedAt: true,
      cases: { where: { status: { notIn: FINAL_STATUSES } }, select: { id: true, number: true, status: true }, orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });
  const apps = r.vacancyId
    ? await prisma.vacancyApplication.findMany({ where: { vacancyId: r.vacancyId }, select: { id: true, userId: true, status: true } })
    : [];
  const appBy = new Map(apps.map((a) => [a.userId, { id: a.id, status: a.status }]));
  const wantedCity = r.city ? normaliseText(r.city) : '';

  const scored = rows
    .filter((u) => licenceCovers(u.drivingLicence, r.drivingLicence))
    .map(({ cases, ...u }) => {
      const m = matchCandidate(u, target);
      const reasons: ReasonCode[] = [];
      const prof = professionSimilarity(u.profession, r.profession);
      if (prof >= 1) reasons.push('PROFESSION_EXACT');
      else if (prof > 0) reasons.push('PROFESSION_RELATED');
      if (germanRank(u.germanLevel) >= germanRank(r.germanLevel)) reasons.push('GERMAN_OK');
      if (r.drivingLicence) reasons.push('LICENCE_OK');
      if (!r.minExperience || (u.experienceYears ?? 0) >= r.minExperience) reasons.push('EXPERIENCE_OK');
      let bonus = 0;
      const city = u.city ? normaliseText(u.city) : '';
      if (wantedCity && city && (city.includes(wantedCity) || wantedCity.includes(city))) {
        reasons.push('CITY');
        bonus += CITY_BONUS;
      }
      if (u.emailVerifiedAt) {
        reasons.push('VERIFIED');
        bonus += VERIFIED_BONUS;
      }
      if (cases[0]) reasons.push('ACTIVE_CASE');
      return { user: u, score: m.score, rank: m.score + bonus, reasons, gaps: m.gaps, activeCase: cases[0] ?? null, application: appBy.get(u.id) ?? null };
    });
  scored.sort((a, b) => b.rank - a.rank || b.score - a.score);
  return scored.slice(0, SUGGESTION_LIMIT);
};

/** Vacancy description (German first; other languages are filled with it until staff translate). */
const describe = (r: CandidateRequest) => {
  const lines = [
    `${r.quantity} × ${r.profession}`,
    r.city ? `Einsatzort: ${r.city}` : null,
    r.germanLevel && r.germanLevel !== 'none' ? `Deutschkenntnisse: mindestens ${r.germanLevel}` : null,
    r.drivingLicence ? `Führerschein: ${r.drivingLicence}` : null,
    r.minExperience ? `Berufserfahrung: mindestens ${r.minExperience} Jahre` : null,
    r.startDate ? `Arbeitsbeginn: ${r.startDate.toISOString().slice(0, 10)}` : null,
    r.notes ? `\n${r.notes}` : null,
  ];
  return lines.filter(Boolean).join('\n').slice(0, 8000);
};

/**
 * Creates the vacancy candidates are proposed through, or returns the linked one when it still exists and is
 * not closed. Staff-created vacancies follow the admin rule: published (OPEN) right away, or kept for review
 * (PENDING) when `publish` is false.
 */
export const ensureVacancy = async (req: Request, r: CandidateRequest, publish: boolean) => {
  if (r.vacancyId) {
    const existing = await prisma.vacancy.findUnique({ where: { id: r.vacancyId } });
    if (existing && existing.status !== 'CLOSED') return { vacancy: existing, created: false };
  }
  const company = await prisma.company.findUniqueOrThrow({ where: { id: r.companyId }, select: { sector: true, status: true } });
  if (company.status !== 'ACTIVE') throw conflict('COMPANY_NOT_ACTIVE');
  const title = fillL10n({ de: r.title });
  const open = publish;
  const vacancy = await prisma.vacancy.create({
    data: {
      slug: await uniqueSlug(title, r.city),
      companyId: r.companyId,
      visaCategoryId: r.visaCategoryId && (await prisma.visaCategory.count({ where: { id: r.visaCategoryId } })) ? r.visaCategoryId : null,
      title,
      description: fillL10n({ de: describe(r) }),
      sector: company.sector,
      city: r.city,
      profession: r.profession,
      germanLevel: r.germanLevel,
      minExperience: r.minExperience,
      drivingLicence: r.drivingLicence,
      salaryMin: r.salaryMin,
      salaryMax: r.salaryMax,
      positions: r.quantity,
      status: open ? 'OPEN' : 'PENDING',
      publishedAt: open ? new Date() : null,
    },
  });
  await prisma.candidateRequest.update({ where: { id: r.id }, data: { vacancyId: vacancy.id } });
  await audit(req, 'VACANCY_CREATED', `vacancy:${vacancy.id}`, { companyId: vacancy.companyId, status: vacancy.status, requestId: r.id });
  if (vacancy.status === 'OPEN') {
    await emitWebhook('vacancy.published', { id: vacancy.id, slug: vacancy.slug, publishedAt: vacancy.publishedAt?.toISOString() ?? null }, vacancy.companyId);
    onVacancyPublished(); // job alert digests (background)
  }
  return { vacancy, created: true };
};

/**
 * Proposes candidates to the employer on the request's vacancy — the same transition, score, notifications,
 * audit entries and webhooks as moving an application to PROPOSED in the staff candidates area.
 * Candidates already PROPOSED / INTERVIEW / ACCEPTED are skipped; NEW, SHORTLISTED, WITHDRAWN and REJECTED
 * applications are (re-)proposed with a fresh employer decision.
 */
export const proposeCandidates = async (req: Request, vacancyId: string, userIds: string[]) => {
  const vacancy = await prisma.vacancy.findUniqueOrThrow({
    where: { id: vacancyId },
    include: { visaCategory: { select: { visaLabel: true, germanLevel: true } }, company: { select: { status: true } } },
  });
  if (vacancy.status === 'CLOSED') throw conflict('VACANCY_CLOSED');
  if (vacancy.companyId && vacancy.company?.status !== 'ACTIVE') throw conflict('COMPANY_NOT_ACTIVE');
  const users = await prisma.user.findMany({ where: { id: { in: userIds }, role: 'CLIENT' } });
  const existing = await prisma.vacancyApplication.findMany({ where: { vacancyId, userId: { in: users.map((u) => u.id) } } });
  const byUser = new Map(existing.map((a) => [a.userId, a]));
  const proposed: { applicationId: string; userId: string }[] = [];
  const skipped: { userId: string; reason: string }[] = userIds.filter((id) => !users.some((u) => u.id === id)).map((userId) => ({ userId, reason: 'NOT_A_CANDIDATE' }));

  for (const u of users) {
    const prev = byUser.get(u.id);
    if (prev && ['PROPOSED', 'INTERVIEW', 'ACCEPTED'].includes(prev.status)) {
      skipped.push({ userId: u.id, reason: 'ALREADY_PROPOSED' });
      continue;
    }
    const score = matchCandidate(u, vacancy).score;
    const app = prev
      ? await prisma.vacancyApplication.update({ where: { id: prev.id }, data: { status: 'PROPOSED', matchScore: score, companyNote: null } })
      : await prisma.vacancyApplication.create({ data: { vacancyId, userId: u.id, status: 'PROPOSED', matchScore: score } });
    await notifyApplicationStatus(u.id, vacancy, 'PROPOSED');
    await audit(req, 'APPLICATION_STATUS_CHANGED', `application:${app.id}`, { from: prev?.status ?? null, to: 'PROPOSED' });
    await emitWebhook('application.status_changed', { id: app.id, vacancyId, from: prev?.status ?? null, to: 'PROPOSED', by: 'staff' }, vacancy.companyId);
    proposed.push({ applicationId: app.id, userId: u.id });
  }
  // One notification per batch for the employer's users.
  if (proposed.length) await notifyCandidateProposed(vacancy);
  return { proposed, skipped };
};
