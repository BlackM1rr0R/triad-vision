import { prisma } from '../../db.js';
import { publicUser } from '../../routes/auth.js';
import { buildAccessLog } from './accessLog.js'; // "who viewed my documents"

/**
 * GDPR export (Art. 15 / 20): everything stored about the user, as plain JSON (file metadata only,
 * never file contents, password hashes, tokens or staff-internal notes). Shared by
 * GET /api/account/export and the privacy centre's GET /api/privacy/export.
 * Team chat and mailboxes belong to staff accounts (company data) and are not part of the export.
 */
export const buildUserExport = async (userId: string) => {
  const [user, cases, notifications, devices, translationOrders, interviews, applications, consents, privacyRequests, supportViews] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    prisma.case.findMany({
      where: { clientId: userId },
      orderBy: { createdAt: 'asc' },
      include: {
        visaCategory: { select: { slug: true, title: true, visaLabel: true } },
        assignedStaff: { select: { firstName: true, lastName: true } },
        requirements: { orderBy: [{ stage: 'asc' }, { sortOrder: 'asc' }], select: { id: true, stage: true, title: true, required: true } },
        documents: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, requirementId: true, stage: true, originalName: true, mimeType: true, size: true, status: true, reviewNote: true, createdAt: true },
        },
        contract: {
          select: { version: true, sentAt: true, signedAt: true, signerName: true, signerIp: true, signerUserAgent: true },
        },
        events: {
          where: { visibleToClient: true },
          orderBy: { createdAt: 'asc' },
          select: { type: true, fromStatus: true, toStatus: true, note: true, createdAt: true },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          select: { body: true, createdAt: true, author: { select: { id: true, firstName: true, lastName: true, role: true } } },
        },
      },
    }),
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { type: true, title: true, body: true, link: true, readAt: true, createdAt: true },
    }),
    prisma.pushDevice.findMany({ where: { userId }, select: { platform: true, createdAt: true, lastSeenAt: true } }),
    prisma.translationOrder.findMany({
      where: { clientId: userId },
      orderBy: { createdAt: 'asc' },
      select: {
        number: true,
        service: true,
        sourceLang: true,
        targetLang: true,
        documentTypes: true,
        pages: true,
        urgency: true,
        status: true,
        priceCents: true,
        currency: true,
        quoteNote: true,
        dueAt: true,
        deliveryMethod: true,
        deliveryAddress: true,
        trackingNumber: true,
        clientNote: true,
        acceptedAt: true,
        completedAt: true,
        createdAt: true,
        files: { orderBy: { createdAt: 'asc' }, select: { kind: true, filename: true, mimeType: true, size: true, createdAt: true } },
        events: { where: { visibleToClient: true }, orderBy: { createdAt: 'asc' }, select: { status: true, note: true, createdAt: true } },
      },
    }),
    prisma.interview.findMany({
      where: { candidateId: userId },
      orderBy: { startsAt: 'asc' },
      select: { startsAt: true, endsAt: true, status: true, meetingUrl: true, createdAt: true, company: { select: { name: true } } },
    }),
    prisma.vacancyApplication.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { status: true, matchScore: true, message: true, createdAt: true, updatedAt: true, vacancy: { select: { slug: true, title: true, city: true } } },
    }),
    prisma.consentRecord.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { type: true, granted: true, version: true, source: true, ip: true, userAgent: true, createdAt: true },
    }),
    prisma.privacyRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { type: true, status: true, message: true, decisionNote: true, dueAt: true, completedAt: true, createdAt: true },
    }),
    // Transparency: every time a team member opened the portal "as" this user (read-only support view).
    prisma.impersonationSession.findMany({
      where: { targetUserId: userId },
      orderBy: { startedAt: 'asc' },
      select: { startedAt: true, endedAt: true, reason: true, requestCount: true },
    }),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    service: 'Triad Vision',
    profile: { ...publicUser(user), isActive: user.isActive, updatedAt: user.updatedAt },
    cases: cases.map(({ clientId: _clientId, assignedStaffId: _staffId, visaCategoryId: _visaId, messages, ...c }) => ({
      ...c,
      messages: messages.map((m) => ({
        body: m.body,
        createdAt: m.createdAt,
        from: m.author.id === userId ? 'me' : 'Triad Vision',
        authorName: `${m.author.firstName} ${m.author.lastName}`,
      })),
    })),
    translationOrders: translationOrders.map((o) => ({ ...o, number: `TR-${String(o.number).padStart(4, '0')}` })),
    interviews: interviews.map(({ company, ...i }) => ({ ...i, company: company?.name ?? null })),
    vacancyApplications: applications,
    consents,
    privacyRequests,
    notifications,
    devices,
    supportViews: supportViews.map((v) => ({
      startedAt: v.startedAt,
      endedAt: v.endedAt,
      reason: v.reason,
      pagesViewed: v.requestCount,
      note: 'A Triad Vision team member viewed your portal read-only (no changes possible).',
    })),
    // Who on the team accessed your documents and sensitive data (previews, downloads, reveals, checks).
    accessLog: (await buildAccessLog(userId)).days.flatMap((d) => d.items.map(({ id: _id, ...i }) => i)),
  };
};

export const exportFilename = () => `triad-vision-my-data-${new Date().toISOString().slice(0, 10)}.json`;
