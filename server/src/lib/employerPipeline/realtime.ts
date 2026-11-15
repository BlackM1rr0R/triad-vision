import { prisma } from '../../db.js';
import { publish } from '../messaging/realtime.js';

/**
 * Realtime hint for the employer pipeline: `pipeline.updated` { caseId } over the existing SSE stream
 * (/api/messaging/events) to the active portal users of the case's company. The payload carries no case data —
 * the portal refetches /api/company/pipeline, which applies the normal permission rules. Never throws.
 */
export const publishPipelineChange = async (caseId: string) => {
  try {
    const c = await prisma.case.findUnique({ where: { id: caseId }, select: { companyId: true } });
    if (!c?.companyId) return;
    const users = await prisma.user.findMany({ where: { companyId: c.companyId, role: 'COMPANY', isActive: true }, select: { id: true } });
    if (users.length) publish(users.map((u) => u.id), 'pipeline.updated', { caseId });
  } catch (err) {
    console.error('[pipeline] realtime publish failed', err);
  }
};
