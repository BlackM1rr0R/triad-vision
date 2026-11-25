import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { notifyStatusChange } from './applicationStatus.js';
import { readMissing } from './autoCheck.js';
import { dayStart } from './autoSettings.js';

/**
 * Automatic handling of "apply via Triad Vision" applications — RETIRED (owner decision: for external listings the
 * candidate applies to the employer directly; EXTERNAL_APPLY_RETIRED in autoSettings.ts). The pipeline (checks,
 * Anschreiben, employer e-mail discovery run, sending in our name, client hand-over, reminders, staff "send now" /
 * "resume") was removed. Earlier applications keep their rows as history; what stays for them
 * (routes/admin/externalApplications.ts):
 *   autoView          staff view of an application's automation fields (state, missing data, employer address, …)
 *   sentToday         employer e-mails sent today (overview)
 *   markSentByStaff   "Göndərildi": staff sent the package outside the system → FORWARDED + client notice
 *   stopAutomation    "stop" on a row that is still open
 * Employer answers to e-mails sent earlier are still matched in the agency mailbox (lib/germanyJobs/replies.ts,
 * lib/deliverability/inbound.ts).
 */

export const AUTO_STATES = ['NO_CONSENT', 'NEEDS_DATA', 'SEARCHING', 'CLIENT_SEND', 'READY', 'QUEUED', 'SENDING', 'SENT', 'STOPPED', 'DUPLICATE'] as const;
export type AutoState = (typeof AUTO_STATES)[number];

const appInclude = { inquiry: { select: { contactName: true, email: true, phone: true, locale: true, anonymizedAt: true } } } satisfies Prisma.ExternalJobApplicationInclude;

const loadApp = (id: string) => prisma.externalJobApplication.findUnique({ where: { id }, include: appInclude });

/**
 * "autoState is not one of …" including rows without a state. SQL `NOT IN` / `<>` are never true for NULL, so a bare
 * `{ notIn }` would silently skip rows without a state.
 */
const stateNotIn = (states: AutoState[]): Prisma.ExternalJobApplicationWhereInput => ({ OR: [{ autoState: null }, { autoState: { notIn: states } }] });

/** Employer e-mails sent today (all, and to one employer domain). */
export const sentToday = async (domain?: string, now = new Date()) => {
  const since = dayStart(now);
  const total = await prisma.externalJobApplication.count({ where: { autoSentAt: { gte: since }, autoSentMode: { in: ['AUTO', 'STAFF'] } } });
  const toDomain = domain
    ? await prisma.externalJobApplication.count({
        where: { autoSentAt: { gte: since }, autoSentMode: { in: ['AUTO', 'STAFF'] }, OR: [{ employerEmail: { endsWith: `@${domain}` } }, { employerEmail: { endsWith: `.${domain}` } }] },
      })
    : 0;
  return { total, toDomain };
};

// ─── Staff records (routes/admin/externalApplications.ts) ─────────────────

/** Staff sent the package outside the system ("Göndərildi"): FORWARDED + notice; never sends an e-mail. */
export const markSentByStaff = async (applicationId: string, staffId: string) => {
  const app = await loadApp(applicationId);
  if (!app || app.autoSentAt || app.inquiry.anonymizedAt) return false;
  const at = new Date();
  const claimed = await prisma.externalJobApplication.updateMany({ where: { id: app.id, autoSentAt: null, ...stateNotIn(['SENDING']) }, data: { autoState: 'SENT', autoSentAt: at, autoSentMode: 'MANUAL', autoReason: null, autoNextAt: null } });
  if (!claimed.count) return false;
  const forward = app.status === 'SUBMITTED';
  if (forward) {
    await prisma.$transaction([
      prisma.externalJobApplication.update({ where: { id: app.id }, data: { status: 'FORWARDED', statusNote: null, statusChangedAt: at } }),
      prisma.externalJobApplicationEvent.create({ data: { applicationId: app.id, status: 'FORWARDED', staffId, createdAt: at } }),
    ]);
    await notifyStatusChange(app, 'FORWARDED', null);
  }
  return true;
};

export const stopAutomation = (applicationId: string) =>
  prisma.externalJobApplication.updateMany({ where: { id: applicationId, ...stateNotIn(['SENDING']), autoSentAt: null }, data: { autoState: 'STOPPED', autoNextAt: null } });

/** Staff view of the automation of one application. */
export const autoView = (app: {
  autoState: string | null;
  autoMissing: string | null;
  autoCheckedAt: Date | null;
  autoReason: string | null;
  autoNextAt: Date | null;
  autoSentAt: Date | null;
  autoSentMode: string | null;
  employerEmail: string | null;
  employerEmailSource: string | null;
  employerEmailEvidence: string | null;
  employerEmailEvidenceUrl: string | null;
  employerPageUrl: string | null;
  discoveryState: string | null;
  discoveryAt: Date | null;
  clientSendAt: Date | null;
  clientRemindedAt: Date | null;
  clientHelpAt: Date | null;
  forwardConsentAt: Date | null;
  requiredGerman: string | null;
}) => ({
  state: (app.autoState as AutoState | null) ?? null,
  missing: readMissing(app.autoMissing),
  checkedAt: app.autoCheckedAt,
  reason: app.autoReason,
  nextAt: app.autoNextAt,
  sentAt: app.autoSentAt,
  sentMode: app.autoSentMode,
  employerEmail: app.employerEmail,
  employerEmailSource: app.employerEmailSource,
  employerEmailEvidence: app.employerEmailEvidence,
  employerEmailEvidenceUrl: app.employerEmailEvidenceUrl,
  employerPageUrl: app.employerPageUrl,
  discoveryState: app.discoveryState,
  discoveryAt: app.discoveryAt,
  clientSendAt: app.clientSendAt,
  clientRemindedAt: app.clientRemindedAt,
  clientHelpAt: app.clientHelpAt,
  forwardConsentAt: app.forwardConsentAt,
  requiredGerman: app.requiredGerman,
});
