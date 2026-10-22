import { prisma } from '../../src/db.js';
import { clearCache } from '../../src/lib/cache.js';

export { prisma };

/** Deletes all rows, children before parents so foreign keys are never violated. */
export const resetDb = async () => {
  await prisma.driveSmartFolder.deleteMany();
  await prisma.driveFolderTemplate.deleteMany();
  await prisma.driveTag.deleteMany();
  await prisma.documentInsight.deleteMany(); // smart uploads (no foreign keys)
  await prisma.managementReport.deleteMany(); // management AI (no foreign keys)
  await prisma.securityAlert.deleteMany();
  await prisma.aiConversation.deleteMany();
  await prisma.settlementEntry.deleteMany();
  await prisma.settlementBeneficiary.deleteMany();
  await prisma.driveActivity.deleteMany();
  await prisma.partnerCommission.deleteMany();
  await prisma.clientRegisterColumn.deleteMany();
  await prisma.referralPartner.deleteMany(); // cases keep partnerId = null (SetNull)
  // Interview prep, surveys, contract templates, employer requests
  await prisma.satisfactionSurvey.deleteMany();
  await prisma.interviewPrepQuestion.deleteMany();
  await prisma.contractTemplate.deleteMany();
  await prisma.candidateRequest.deleteMany();
  // Client tools
  await prisma.arrivalPlan.deleteMany();
  await prisma.motivationLetter.deleteMany();
  await prisma.candidateCv.deleteMany();
  await prisma.vaultDocument.deleteMany();
  // Agents, translation orders, privacy
  await prisma.agentCommission.deleteMany();
  await prisma.user.updateMany({ where: { referredByAgentId: { not: null } }, data: { referredByAgentId: null } });
  await prisma.agent.deleteMany();
  await prisma.translationOrderEvent.deleteMany();
  await prisma.translationOrderFile.deleteMany();
  await prisma.translationOrder.deleteMany();
  await prisma.consentRecord.deleteMany();
  await prisma.privacyRequest.deleteMany();
  // Team workspace: mail / chat / calendar / contacts / announcements / notes / polls / leave
  await prisma.pollVote.deleteMany();
  await prisma.pollOption.deleteMany();
  await prisma.poll.deleteMany();
  await prisma.announcementRead.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.note.deleteMany();
  await prisma.leaveRequest.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.calendarAttendee.deleteMany();
  await prisma.calendarEvent.deleteMany();
  await prisma.chatReaction.deleteMany();
  await prisma.chatAttachment.deleteMany();
  await prisma.chatMessage.updateMany({ data: { parentId: null } });
  await prisma.chatMessage.deleteMany();
  await prisma.chatMember.deleteMany();
  await prisma.chatChannel.deleteMany();
  await prisma.mailMessageLabel.deleteMany();
  await prisma.mailLabel.deleteMany();
  await prisma.mailAttachment.deleteMany();
  await prisma.mailMessage.deleteMany();
  await prisma.mailRule.deleteMany();
  await prisma.mailTemplate.deleteMany();
  await prisma.mailFolder.deleteMany();
  await prisma.mailAccount.deleteMany();
  // Operations / messaging / journey / document-intelligence rows (no dependants of their own)
  await prisma.webhookDelivery.deleteMany();
  await prisma.webhook.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.interview.deleteMany();
  await prisma.kbArticle.deleteMany();
  await prisma.kbCategory.deleteMany();
  await prisma.outboundMessage.deleteMany();
  await prisma.notificationTemplate.deleteMany();
  await prisma.caseOnboarding.deleteMany();
  await prisma.onboardingItem.deleteMany();
  await prisma.germanQuestion.deleteMany();
  await prisma.languageCourse.deleteMany();
  await prisma.requirementTemplate.deleteMany();
  // E-signatures (events and signers cascade with the request)
  await prisma.signatureEvent.deleteMany();
  await prisma.signatureSigner.deleteMany();
  await prisma.signatureRequest.deleteMany();
  // Team tasks (children first; before cases, users and drive nodes)
  await prisma.taskAttachment.deleteMany();
  await prisma.taskChecklistItem.deleteMany();
  await prisma.taskComment.deleteMany();
  await prisma.taskAssignee.deleteMany();
  await prisma.task.deleteMany();
  await prisma.reminderLog.deleteMany();
  await prisma.analyticsDaily.deleteMany();
  await prisma.review.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.consultationSlot.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.vacancyApplication.deleteMany();
  await prisma.emailVerificationToken.deleteMany();
  await prisma.emailOtpCode.deleteMany();
  // Team drive (task links cascade with the nodes; parents are detached first so no cascade chain is needed).
  await prisma.driveFavorite.deleteMany();
  await prisma.driveGrant.deleteMany();
  await prisma.driveFileVersion.deleteMany();
  await prisma.driveNode.updateMany({ data: { parentId: null } });
  await prisma.driveNode.deleteMany();
  await prisma.docGrant.deleteMany();
  await prisma.docFile.deleteMany();
  await prisma.docDir.deleteMany();
  await prisma.docFolder.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.session.deleteMany();
  await prisma.pushDevice.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.caseMessage.deleteMany();
  await prisma.caseEvent.deleteMany();
  await prisma.contract.deleteMany();
  await prisma.document.deleteMany();
  await prisma.documentRequirement.deleteMany();
  await prisma.case.deleteMany();
  await prisma.vacancy.deleteMany();
  await prisma.emailLog.deleteMany();
  await prisma.inquiry.deleteMany();
  await prisma.setting.deleteMany();
  await prisma.visaCategory.deleteMany();
  await prisma.service.deleteMany();
  await prisma.partner.deleteMany();
  await prisma.visaSample.deleteMany();
  await prisma.testimonial.deleteMany();
  await prisma.stat.deleteMany();
  await prisma.faq.deleteMany();
  await prisma.post.deleteMany();
  await prisma.user.deleteMany();
  await prisma.company.deleteMany();
  // The public content cache lives in this module graph; drop it with the data.
  clearCache();
};

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Gives fire-and-forget work (emails are sent with `void sendMail(...)`) time to land. */
export const settle = () => sleep(150);

/** Polls until `check` returns a truthy value (used for fire-and-forget email rows). */
export const waitFor = async <T>(check: () => Promise<T | null | undefined | false>, timeoutMs = 3000): Promise<T> => {
  const start = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - start > timeoutMs) throw new Error('waitFor: condition not met in time');
    await sleep(25);
  }
};

/** Email rows sent to `to`, waiting until at least `min` exist. */
export const emailsTo = async (to: string, min = 1) =>
  waitFor(async () => {
    const rows = await prisma.emailLog.findMany({ where: { to }, orderBy: { createdAt: 'asc' } });
    return rows.length >= min ? rows : null;
  });
