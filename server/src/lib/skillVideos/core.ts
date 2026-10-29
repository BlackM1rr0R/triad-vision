import type { Locale, Prisma, SkillVideo } from '@prisma/client';
import { prisma } from '../../db.js';
import { FINAL_STATUSES } from '../caseFlow.js';
import { canonicalProfession } from '../matching.js';
import { employerVisibleWhere } from '../vacancies.js';
import { notifyUser } from '../notifications.js';
import { removeSkillFile } from './media.js';

/**
 * Skill videos (routes: skillVideos.ts for the candidate, admin/skillVideos.ts for staff,
 * companySkillVideos.ts for employers).
 *
 * Who sees a video
 *   - the candidate: always (own videos);
 *   - staff (STAFF+): always, to review it (approve / reject with a reason);
 *   - an employer: only when the video is APPROVED, the candidate's consent is active
 *     (consentAt set, consentWithdrawnAt null) and the candidate is presented to that company under the
 *     usual rule (an application to one of its vacancies in an employer-visible status, see
 *     lib/vacancies.ts employerVisibleWhere). Withdrawing consent or rejecting hides it on the next request.
 * Views by employers are logged (who / when) for staff; the candidate sees the number of employers.
 * Retention: deleted with the case documents' retention period once all of the candidate's cases are closed
 * longer than that (jobs/retention.ts → purgeSkillVideos).
 */

export const SKILL_VIDEO_MAX_COUNT = 5;

export const SKILL_TAGS = [
  'driver',
  'welder',
  'cook',
  'nurse',
  'electrician',
  'construction',
  'mechanic',
  'warehouse',
  'cleaning',
  'safety',
  'other',
] as const;
export type SkillTag = (typeof SKILL_TAGS)[number];

/** Profession key (lib/matching.ts) → the tag a new video gets by default. */
const TAG_FOR_PROFESSION: Record<string, SkillTag> = {
  truck_driver: 'driver',
  bus_driver: 'driver',
  courier: 'driver',
  welder: 'welder',
  cook: 'cook',
  baker: 'cook',
  butcher: 'cook',
  nurse: 'nurse',
  electrician: 'electrician',
  construction_worker: 'construction',
  carpenter: 'construction',
  painter: 'construction',
  plumber: 'construction',
  mechanic: 'mechanic',
  warehouse: 'warehouse',
  cleaner: 'cleaning',
  hotel: 'cleaning',
};

export const suggestedSkill = (profession: string | null | undefined): SkillTag => TAG_FOR_PROFESSION[canonicalProfession(profession) ?? ''] ?? 'other';

export const consentActive = (v: Pick<SkillVideo, 'consentAt' | 'consentWithdrawnAt'>) => !!v.consentAt && !v.consentWithdrawnAt;

/** Videos an employer may watch (plus the candidate filter of the caller). */
export const employerVideoWhere = (companyId: string): Prisma.SkillVideoWhereInput => ({
  status: 'APPROVED',
  consentAt: { not: null },
  consentWithdrawnAt: null,
  user: { applications: { some: { vacancy: { companyId }, AND: [employerVisibleWhere] } } },
});

/** Distinct employers (companies) that watched each video. */
export const employerCounts = async (videoIds: string[]) => {
  if (!videoIds.length) return new Map<string, number>();
  const rows = await prisma.skillVideoView.groupBy({ by: ['videoId', 'companyId'], where: { videoId: { in: videoIds } } });
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.videoId, (m.get(r.videoId) ?? 0) + 1);
  return m;
};

const base = (v: SkillVideo) => ({
  id: v.id,
  title: v.title,
  skill: v.skill,
  source: v.source,
  mimeType: v.mimeType,
  size: v.size,
  durationSec: v.durationSec,
  hasPoster: !!v.posterName,
  createdAt: v.createdAt,
  updatedAt: v.updatedAt,
});

/** The candidate's own view: status, reason, consent and how many employers watched it. */
export const ownerView = (v: SkillVideo, employers: number) => ({
  ...base(v),
  status: v.status,
  rejectReason: v.status === 'REJECTED' ? v.rejectReason : null,
  reviewedAt: v.reviewedAt,
  consent: consentActive(v),
  consentAt: v.consentAt,
  consentWithdrawnAt: v.consentWithdrawnAt,
  employerViews: employers,
  visibleToEmployers: v.status === 'APPROVED' && consentActive(v),
});

export const staffView = (v: SkillVideo & { user?: { id: string; firstName: string; lastName: string; profession: string | null } }, employers: number) => ({
  ...ownerView(v, employers),
  rejectReason: v.rejectReason,
  reviewedById: v.reviewedById,
  caseId: v.caseId,
  candidate: v.user ? { id: v.user.id, firstName: v.user.firstName, lastName: v.user.lastName, profession: v.user.profession } : undefined,
});

/** Employers get no status, consent dates or file names — only what the player needs. */
export const employerView = (v: SkillVideo) => base(v);

// ─── Notifications (candidate's language) ───────────────────────────────

const TEXTS: Record<Locale, { rejected: (t: string, r: string) => { title: string; body: string }; approved: (t: string) => { title: string; body: string } }> = {
  az: {
    rejected: (t, r) => ({ title: 'Bacarıq videosu qəbul edilmədi', body: `"${t}" videosu qəbul edilmədi.\n\nSəbəb: ${r}\n\nVideonu profilinizdə əvəz edə və ya silə bilərsiniz.` }),
    approved: (t) => ({ title: 'Bacarıq videosu təsdiqləndi', body: `"${t}" videosu təsdiqləndi. Razılıq verdiyiniz müddətcə sizə baxan işəgötürənlər onu görə bilər.` }),
  },
  de: {
    rejected: (t, r) => ({ title: 'Kompetenzvideo nicht angenommen', body: `Das Video „${t}" wurde nicht angenommen.\n\nGrund: ${r}\n\nSie können es in Ihrem Profil ersetzen oder löschen.` }),
    approved: (t) => ({ title: 'Kompetenzvideo freigegeben', body: `Das Video „${t}" wurde freigegeben. Solange Ihre Einwilligung besteht, sehen es Arbeitgeber, denen Sie vorgestellt werden.` }),
  },
  en: {
    rejected: (t, r) => ({ title: 'Skill video not accepted', body: `The video "${t}" was not accepted.\n\nReason: ${r}\n\nYou can replace or delete it in your profile.` }),
    approved: (t) => ({ title: 'Skill video approved', body: `The video "${t}" was approved. While your consent stands, employers you are presented to can watch it.` }),
  },
  ru: {
    rejected: (t, r) => ({ title: 'Видео навыков не принято', body: `Видео «${t}» не принято.\n\nПричина: ${r}\n\nВы можете заменить или удалить его в профиле.` }),
    approved: (t) => ({ title: 'Видео навыков одобрено', body: `Видео «${t}» одобрено. Пока действует ваше согласие, его могут смотреть работодатели, которым вас представили.` }),
  },
};

const LINK = '/account/profile?tab=professional#skill-videos';

export const notifyReview = async (v: SkillVideo, outcome: 'approved' | 'rejected') => {
  const user = await prisma.user.findUnique({ where: { id: v.userId }, select: { locale: true } });
  const t = TEXTS[user?.locale ?? 'az'];
  const msg = outcome === 'rejected' ? t.rejected(v.title, v.rejectReason ?? '—') : t.approved(v.title);
  // Approval is good news: in-app + push only. A rejection needs action, so it is also e-mailed.
  await notifyUser(v.userId, { type: outcome === 'rejected' ? 'SKILL_VIDEO_REJECTED' : 'SKILL_VIDEO_APPROVED', ...msg, link: LINK, email: outcome === 'rejected' });
};

// ─── Deletion + retention ───────────────────────────────────────────────

/** Deletes rows and files (views cascade). Returns the bytes freed. */
export const deleteVideos = async (videos: Pick<SkillVideo, 'id' | 'storedName' | 'posterName'>[]) => {
  if (!videos.length) return 0;
  await prisma.skillVideo.deleteMany({ where: { id: { in: videos.map((v) => v.id) } } });
  let bytes = 0;
  for (const v of videos) bytes += (await removeSkillFile(v.storedName)) + (await removeSkillFile(v.posterName));
  return bytes;
};

/**
 * DSGVO retention (faces are personal data): a candidate's skill videos are deleted once the candidate
 * has at least one case, none of them is open and the last one closed before `cutoff` (the case
 * documents' retention period, Admin → Settings → Retention). Called by jobs/retention.ts.
 */
export const purgeSkillVideos = async (cutoff: Date) => {
  const due = await prisma.skillVideo.findMany({
    where: {
      user: {
        cases: {
          some: { status: { in: FINAL_STATUSES }, closedAt: { lt: cutoff } },
          none: { OR: [{ status: { notIn: FINAL_STATUSES } }, { closedAt: null }, { closedAt: { gte: cutoff } }] },
        },
      },
    },
    select: { id: true, storedName: true, posterName: true, userId: true },
    take: 500,
  });
  const bytes = await deleteVideos(due);
  return { videos: due.length, candidates: new Set(due.map((d) => d.userId)).size, bytes };
};
