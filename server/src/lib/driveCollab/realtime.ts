import type { Role } from '@prisma/client';
import { prisma } from '../../db.js';
import { publish } from '../messaging/realtime.js';

const STAFF: Role[] = ['STAFF', 'ADMIN', 'SUPER_ADMIN'];

/**
 * Tells every active staff member's open drive that something changed on a node (comments, locks).
 * Only ids go out — the browser refetches through the normal, access-checked endpoints.
 */
export const publishDrive = async (type: 'drive.comment' | 'drive.lock', payload: Record<string, unknown>) => {
  try {
    const staff = await prisma.user.findMany({ where: { role: { in: STAFF }, isActive: true }, select: { id: true } });
    publish(
      staff.map((s) => s.id),
      type,
      payload,
    );
  } catch (err) {
    console.error('[driveCollab] publish failed', type, err);
  }
};
