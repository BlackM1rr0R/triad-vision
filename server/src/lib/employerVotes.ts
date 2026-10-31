import type { Request } from 'express';
import { z } from 'zod';
import type { EmployerCandidateVote } from '@prisma/client';
import { prisma } from '../db.js';
import { HttpError, notFound } from './http.js';
import { notifyStaff } from './notifications.js';
import { notifyApplicationStatus } from './jobsNotifications.js';
import { audit } from './audit.js';
import { emitWebhook } from './ops/webhooks.js';

/**
 * Candidate votes of an employer's team (company portal): every portal user of the company may say
 * "like" / "invite to interview" / "reject" (+ comment, reject reason) about a presented candidate.
 * A vote is advisory — the company's decision stays VacancyApplication.status (routes/company.ts) — except
 * that an INTERVIEW vote on a PROPOSED candidate requests the interview exactly like the existing
 * "Müsahibə" decision (status → INTERVIEW); staff then schedule it (routes/interviews.ts) or the company
 * invites the candidate to pick a time (routes/interviewCalendar.ts).
 * The company sees only its own colleagues' votes; staff see all votes on the candidate / request.
 */

export const VOTES = ['LIKE', 'INTERVIEW', 'REJECT'] as const;
export type Vote = (typeof VOTES)[number];
export const REJECT_REASONS = ['GERMAN', 'EXPERIENCE', 'QUALIFICATION', 'SALARY', 'AVAILABILITY', 'OTHER'] as const;

/** Applications a company may vote on (open proposals). */
const VOTABLE = ['PROPOSED', 'INTERVIEW'];

export const voteInput = z
  .object({
    vote: z.enum(VOTES),
    rejectReason: z.enum(REJECT_REASONS).nullable().optional(),
    comment: z.string().trim().max(2000).nullable().optional(),
  })
  .transform((v) => ({ vote: v.vote, rejectReason: v.vote === 'REJECT' ? (v.rejectReason ?? null) : null, comment: v.comment?.trim() || null }));

export interface VoteView {
  id: string;
  userId: string | null;
  voterName: string;
  vote: Vote;
  rejectReason: string | null;
  comment: string | null;
  createdAt: Date;
  updatedAt: Date;
  mine?: boolean;
}

export const voteView = (v: EmployerCandidateVote, me?: string): VoteView => ({
  id: v.id,
  userId: v.userId,
  voterName: v.voterName,
  vote: v.vote as Vote,
  rejectReason: v.rejectReason,
  comment: v.comment,
  createdAt: v.createdAt,
  updatedAt: v.updatedAt,
  ...(me !== undefined ? { mine: v.userId === me } : {}),
});

export const voteSummary = (votes: Pick<VoteView, 'vote'>[]) => ({
  LIKE: votes.filter((v) => v.vote === 'LIKE').length,
  INTERVIEW: votes.filter((v) => v.vote === 'INTERVIEW').length,
  REJECT: votes.filter((v) => v.vote === 'REJECT').length,
});

/** Votes per application (oldest first), optionally restricted to one company. */
export const votesByApplication = async (applicationIds: string[], opts: { companyId?: string; me?: string } = {}) => {
  const map = new Map<string, VoteView[]>();
  if (!applicationIds.length) return map;
  const rows = await prisma.employerCandidateVote.findMany({
    where: { applicationId: { in: applicationIds }, ...(opts.companyId ? { companyId: opts.companyId } : {}) },
    orderBy: { createdAt: 'asc' },
  });
  for (const r of rows) {
    const list = map.get(r.applicationId) ?? [];
    list.push(voteView(r, opts.me));
    map.set(r.applicationId, list);
  }
  return map;
};

const VOTE_AZ: Record<Vote, string> = { LIKE: 'bəyəndi', INTERVIEW: 'müsahibəyə çağırmaq istəyir', REJECT: 'rədd etdi' };
const REASON_AZ: Record<string, string> = {
  GERMAN: 'alman dili',
  EXPERIENCE: 'təcrübə',
  QUALIFICATION: 'ixtisas',
  SALARY: 'maaş gözləntisi',
  AVAILABILITY: 'başlama tarixi',
  OTHER: 'digər',
};

/** Create or change the signed-in employer user's vote on an application of their company. */
export const castVote = async (req: Request, company: { id: string; name: string }, applicationId: string, input: z.output<typeof voteInput>) => {
  const userId = req.user!.id;
  const app = await prisma.vacancyApplication.findUnique({
    where: { id: applicationId },
    include: { vacancy: { select: { id: true, companyId: true, title: true } }, user: { select: { firstName: true, lastName: true } } },
  });
  if (!app || app.vacancy.companyId !== company.id || !['PROPOSED', 'INTERVIEW', 'ACCEPTED'].includes(app.status)) throw notFound('APPLICATION_NOT_FOUND');
  if (!VOTABLE.includes(app.status)) throw new HttpError(409, 'VOTING_CLOSED');

  const me = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
  const voterName = `${me?.firstName ?? ''} ${me?.lastName ?? ''}`.trim().slice(0, 160) || '—';
  const before = await prisma.employerCandidateVote.findUnique({ where: { applicationId_userId: { applicationId, userId } } });
  const saved = await prisma.employerCandidateVote.upsert({
    where: { applicationId_userId: { applicationId, userId } },
    create: { applicationId, companyId: company.id, userId, voterName, ...input },
    update: { voterName, ...input },
  });

  // "Invite to interview" on a fresh proposal = the existing interview request (PROPOSED → INTERVIEW).
  let interviewRequested = false;
  if (input.vote === 'INTERVIEW' && app.status === 'PROPOSED') {
    const { count } = await prisma.vacancyApplication.updateMany({
      where: { id: app.id, status: 'PROPOSED' },
      data: { status: 'INTERVIEW', companyNote: app.companyNote ?? input.comment ?? '' },
    });
    if (count) {
      interviewRequested = true;
      await notifyApplicationStatus(app.userId, app.vacancy, 'INTERVIEW');
      await emitWebhook('application.status_changed', { id: app.id, vacancyId: app.vacancy.id, from: app.status, to: 'INTERVIEW', by: 'company' }, company.id);
    }
  }

  const changed = !before || before.vote !== input.vote;
  if (changed) {
    const candidate = `${app.user.firstName} ${app.user.lastName}`.trim();
    const title = (app.vacancy.title as Record<string, string> | null)?.az ?? '';
    const lines = [
      `${voterName} (${company.name}) ${VOTE_AZ[input.vote]}: ${candidate} — "${title}".`,
      input.rejectReason ? `Səbəb: ${REASON_AZ[input.rejectReason] ?? input.rejectReason}` : '',
      input.comment ? `Şərh: ${input.comment}` : '',
      interviewRequested ? 'Müsahibə tələbi yaradıldı — vaxtı təyin edin.' : '',
    ].filter(Boolean);
    void notifyStaff(`İşəgötürən səsi: ${company.name}`.slice(0, 180), lines.join('\n'), {
      link: `/admin/candidates?id=${app.userId}`,
      type: 'EMPLOYER_VOTE',
    }).catch((e) => console.error('[employer-votes] staff notify failed', e));
  }
  await audit(req, before ? 'EMPLOYER_VOTE_CHANGED' : 'EMPLOYER_VOTE_CAST', `application:${app.id}`, { vote: input.vote, rejectReason: input.rejectReason });
  return { vote: voteView(saved, userId), interviewRequested, status: interviewRequested ? 'INTERVIEW' : app.status };
};

/** Withdraw the signed-in user's own vote. */
export const withdrawVote = async (req: Request, companyId: string, applicationId: string) => {
  const { count } = await prisma.employerCandidateVote.deleteMany({ where: { applicationId, companyId, userId: req.user!.id } });
  if (!count) throw notFound('VOTE_NOT_FOUND');
  await audit(req, 'EMPLOYER_VOTE_WITHDRAWN', `application:${applicationId}`);
};
