import type { CandidateShareLink, Locale } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { badRequest, conflict, notFound } from '../http.js';
import { FINAL_STATUSES } from '../caseFlow.js';
import { matchCandidate } from '../matching.js';
import { notifyStaff, notifyUser } from '../notifications.js';
import { currentConsents } from '../privacy/consents.js';
import { anonymisedName, anonymisedProfile, anonymisedProfileSelect } from '../vacancies.js';
import { TOKEN_RE, newShareToken, sha256 } from '../driveCollab/share.js';
import { introVideoInfo } from './introVideo.js';
import { applicationNoteLine, shareDecisionText } from './texts.js';

/**
 * Employer share links: staff send a link to one candidate's anonymised profile to an employer who has no
 * portal account. The token (32 random bytes, base64url) is shown once; only its SHA-256 is stored.
 *
 * The page (/kandidat/:token, API /api/candidate-share/:token) shows the anonymised profile, the anonymised
 * CV PDF, the match score when the link is for a vacancy, which required documents are approved / missing
 * (never the files), the intro video and two buttons "Interested" / "Not a fit". The decision notifies the
 * staff and is written to the application, if there is one.
 *
 * Consent: an explicit "no" to EMPLOYER_SHARING in the consent log blocks creating and opening links;
 * CandidateCv.shareWithEmployers = false hides the CV (same rule as the company CV endpoint).
 * Unknown, revoked and expired links all answer 404 without saying which.
 */

export const DEFAULT_LINK_DAYS = 14;
export const MAX_LINK_DAYS = 60;
const DAY = 24 * 60 * 60 * 1000;

export const SHARE_DECISIONS = ['INTERESTED', 'REJECTED'] as const;
export type ShareDecision = (typeof SHARE_DECISIONS)[number];

export const candidateShareUrl = (token: string) => `${config.clientUrl}/kandidat/${token}`;

export type ShareLinkStatus = 'active' | 'expired' | 'revoked';
export const shareLinkStatus = (l: Pick<CandidateShareLink, 'revokedAt' | 'expiresAt'>, now = Date.now()): ShareLinkStatus =>
  l.revokedAt ? 'revoked' : l.expiresAt.getTime() <= now ? 'expired' : 'active';

/** False only when the candidate explicitly said "no" to sharing with employers (no record = the old default, allowed). */
export const employerSharingAllowed = async (userId: string) => (await currentConsents(userId)).EMPLOYER_SHARING?.granted !== false;

/** A CV row with sharing switched off hides the CV; no row yet means the default (sharing on). */
export const cvShared = async (userId: string) => {
  const cv = await prisma.candidateCv.findUnique({ where: { userId }, select: { shareWithEmployers: true } });
  return !cv || cv.shareWithEmployers;
};

// ─── Staff side ─────────────────────────────────────────────────────────

export interface CreateShareInput {
  applicationId?: string | null;
  companyId?: string | null;
  vacancyId?: string | null;
  days?: number;
}

/** Creates a link for a candidate (optionally for an application / company / vacancy). Returns the one-time token. */
export const createShareLink = async (candidateId: string, input: CreateShareInput, createdById: string) => {
  const candidate = await prisma.user.findUnique({ where: { id: candidateId }, select: { id: true, role: true, isActive: true } });
  if (!candidate || candidate.role !== 'CLIENT') throw notFound('CANDIDATE_NOT_FOUND');
  if (!candidate.isActive) throw conflict('CANDIDATE_INACTIVE');
  if (!(await employerSharingAllowed(candidateId))) throw conflict('EMPLOYER_SHARING_DECLINED');

  let { applicationId = null, companyId = null, vacancyId = null } = input;
  if (applicationId) {
    const app = await prisma.vacancyApplication.findUnique({ where: { id: applicationId }, select: { userId: true, vacancyId: true, vacancy: { select: { companyId: true } } } });
    if (!app || app.userId !== candidateId) throw badRequest('INVALID_APPLICATION');
    vacancyId = app.vacancyId;
    companyId = companyId ?? app.vacancy.companyId;
  }
  if (vacancyId && !applicationId) {
    const v = await prisma.vacancy.findUnique({ where: { id: vacancyId }, select: { companyId: true } });
    if (!v) throw badRequest('INVALID_VACANCY');
    companyId = companyId ?? v.companyId;
  }
  if (companyId && !(await prisma.company.count({ where: { id: companyId } }))) throw badRequest('INVALID_COMPANY');

  const days = Math.min(MAX_LINK_DAYS, Math.max(1, input.days ?? DEFAULT_LINK_DAYS));
  const token = newShareToken();
  const link = await prisma.candidateShareLink.create({
    data: { tokenHash: sha256(token), candidateId, applicationId, companyId, vacancyId, createdById, expiresAt: new Date(Date.now() + days * DAY) },
  });
  return { link, token, url: candidateShareUrl(token) };
};

/** Staff list of a candidate's links (never the token, which only exists at creation). */
export const listShareLinks = async (candidateId: string) => {
  const links = await prisma.candidateShareLink.findMany({ where: { candidateId }, orderBy: { createdAt: 'desc' }, take: 100 });
  const ids = (k: 'companyId' | 'vacancyId' | 'createdById') => [...new Set(links.map((l) => l[k]).filter((v): v is string => !!v))];
  const [companies, vacancies, creators] = await Promise.all([
    prisma.company.findMany({ where: { id: { in: ids('companyId') } }, select: { id: true, name: true } }),
    prisma.vacancy.findMany({ where: { id: { in: ids('vacancyId') } }, select: { id: true, title: true } }),
    prisma.user.findMany({ where: { id: { in: ids('createdById') } }, select: { id: true, firstName: true, lastName: true } }),
  ]);
  const byId = <T extends { id: string }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]));
  const c = byId(companies);
  const v = byId(vacancies);
  const u = byId(creators);
  return links.map((l) => ({
    id: l.id,
    status: shareLinkStatus(l),
    applicationId: l.applicationId,
    company: l.companyId ? (c.get(l.companyId) ?? null) : null,
    vacancy: l.vacancyId ? (v.get(l.vacancyId) ?? null) : null,
    createdBy: l.createdById && u.get(l.createdById) ? `${u.get(l.createdById)!.firstName} ${u.get(l.createdById)!.lastName}`.trim() : null,
    createdAt: l.createdAt,
    expiresAt: l.expiresAt,
    revokedAt: l.revokedAt,
    viewCount: l.viewCount,
    lastViewedAt: l.lastViewedAt,
    decision: l.decision,
    decisionNote: l.decisionNote,
    decidedAt: l.decidedAt,
    decidedByName: l.decidedByName,
  }));
};

// ─── Public side ────────────────────────────────────────────────────────

/** The live link of a token with its candidate, or 404 (never says whether it existed, expired or was revoked). */
export const resolveShareLink = async (token: string) => {
  if (!TOKEN_RE.test(token)) throw notFound('SHARE_NOT_FOUND');
  const link = await prisma.candidateShareLink.findUnique({ where: { tokenHash: sha256(token) } });
  if (!link || shareLinkStatus(link) !== 'active') throw notFound('SHARE_NOT_FOUND');
  const candidate = await prisma.user.findUnique({
    where: { id: link.candidateId },
    select: { ...anonymisedProfileSelect, id: true, role: true, isActive: true, recognitionStatus: true, introVideoKey: true },
  });
  if (!candidate || candidate.role !== 'CLIENT' || !candidate.isActive) throw notFound('SHARE_NOT_FOUND');
  // Consent withdrawn after the link was sent: the link stops working.
  if (!(await employerSharingAllowed(candidate.id))) throw notFound('SHARE_NOT_FOUND');
  return { link, candidate };
};
export type ResolvedShare = Awaited<ReturnType<typeof resolveShareLink>>;

type DocState = 'approved' | 'inReview' | 'missing';

/** Which required documents of the candidate's current case are approved / in review / missing — titles only. */
export const documentStatusSummary = async (candidateId: string) => {
  const kase =
    (await prisma.case.findFirst({ where: { clientId: candidateId, status: { notIn: FINAL_STATUSES }, parentCaseId: null }, orderBy: { createdAt: 'desc' }, select: { id: true } })) ??
    (await prisma.case.findFirst({ where: { clientId: candidateId, parentCaseId: null }, orderBy: { createdAt: 'desc' }, select: { id: true } }));
  if (!kase) return null;
  const reqs = await prisma.documentRequirement.findMany({
    where: { caseId: kase.id, required: true, stage: { in: ['INITIAL', 'EMBASSY'] } },
    orderBy: [{ stage: 'asc' }, { sortOrder: 'asc' }],
    select: { id: true, title: true, stage: true, documents: { select: { status: true } } },
  });
  const items = reqs.map((r) => {
    const state: DocState = r.documents.some((d) => d.status === 'ACCEPTED') ? 'approved' : r.documents.some((d) => d.status === 'PENDING') ? 'inReview' : 'missing';
    return { id: r.id, title: r.title, stage: r.stage, state };
  });
  return {
    total: items.length,
    approved: items.filter((i) => i.state === 'approved').length,
    inReview: items.filter((i) => i.state === 'inReview').length,
    missing: items.filter((i) => i.state === 'missing').length,
    items,
  };
};

const visaForMatch = { select: { visaLabel: true, germanLevel: true } } as const;

/** What the employer sees on the share page. Contact data, documents, birth date and address never appear. */
export const publicShareView = async ({ link, candidate }: ResolvedShare) => {
  const [vacancy, company, cvAvailable, video, documents] = await Promise.all([
    link.vacancyId
      ? prisma.vacancy.findUnique({
          where: { id: link.vacancyId },
          select: { title: true, city: true, profession: true, germanLevel: true, minExperience: true, drivingLicence: true, visaCategory: visaForMatch },
        })
      : null,
    link.companyId ? prisma.company.findUnique({ where: { id: link.companyId }, select: { name: true } }) : null,
    cvShared(candidate.id),
    introVideoInfo(candidate.introVideoKey),
    documentStatusSummary(candidate.id),
  ]);
  const match = vacancy ? matchCandidate(candidate, vacancy) : null;
  return {
    candidate: { ...anonymisedProfile(candidate), recognitionStatus: candidate.recognitionStatus },
    company: company ? { name: company.name } : null,
    vacancy: vacancy ? { title: vacancy.title, city: vacancy.city, profession: vacancy.profession } : null,
    match,
    documents,
    cv: { available: cvAvailable },
    video: video ? { available: true, mimeType: video.mimeType, size: video.size } : { available: false },
    expiresAt: link.expiresAt,
    decision: link.decision ? { decision: link.decision, note: link.decisionNote, decidedAt: link.decidedAt, decidedByName: link.decidedByName } : null,
  };
};

export const markShareViewed = (linkId: string) =>
  prisma.candidateShareLink.update({ where: { id: linkId }, data: { viewCount: { increment: 1 }, lastViewedAt: new Date() } }).catch(() => undefined);

/**
 * Records the employer's answer (once per link), writes it to the application's employer note and tells the
 * staff: the link's creator and the candidate's case manager (admins when neither exists).
 */
export const decideShareLink = async (r: ResolvedShare, input: { decision: ShareDecision; name: string; note?: string | null }) => {
  const { link, candidate } = r;
  if (link.decision) throw conflict('ALREADY_DECIDED');
  const now = new Date();
  const note = input.note?.trim() || null;
  // Only the first answer counts, also when two requests race.
  const updated = await prisma.candidateShareLink.updateMany({
    where: { id: link.id, decision: null },
    data: { decision: input.decision, decisionNote: note, decidedByName: input.name, decidedAt: now },
  });
  if (!updated.count) throw conflict('ALREADY_DECIDED');

  if (link.applicationId) {
    const app = await prisma.vacancyApplication.findUnique({ where: { id: link.applicationId }, select: { companyNote: true } });
    if (app) {
      const line = applicationNoteLine(input.decision, input.name, note, now);
      await prisma.vacancyApplication.update({ where: { id: link.applicationId }, data: { companyNote: (app.companyNote ? `${app.companyNote}\n${line}` : line).slice(0, 5000) } });
    }
  }

  const company = link.companyId ? await prisma.company.findUnique({ where: { id: link.companyId }, select: { name: true } }) : null;
  const active = await prisma.case.findFirst({
    where: { clientId: candidate.id, status: { notIn: FINAL_STATUSES } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, assignedStaffId: true },
  });
  const recipients = [...new Set([link.createdById, active?.assignedStaffId].filter((id): id is string => !!id))];
  const staff = await prisma.user.findMany({ where: { id: { in: recipients }, isActive: true, role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] } }, select: { id: true, locale: true } });
  const candidateName = anonymisedName(candidate);
  const link_ = `/admin/candidates?id=${candidate.id}`;
  const text = (locale: Locale) => shareDecisionText(locale, { decision: input.decision, candidate: candidateName, employer: company?.name ?? null, name: input.name, note });
  if (staff.length) {
    for (const s of staff) {
      const t = text(s.locale);
      await notifyUser(s.id, { type: 'CANDIDATE_SHARE_DECISION', title: t.title, body: t.body, link: link_, caseId: active?.id });
    }
  } else {
    const t = text('az');
    await notifyStaff(t.title, t.body, { link: link_, caseId: active?.id, type: 'CANDIDATE_SHARE_DECISION' });
  }
  return prisma.candidateShareLink.findUniqueOrThrow({ where: { id: link.id } });
};
