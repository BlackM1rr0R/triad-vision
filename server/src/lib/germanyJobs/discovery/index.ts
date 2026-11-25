import { prisma } from '../../../db.js';

/**
 * Housekeeping of the old employer e-mail discovery cache (EmployerEmailDiscovery). The discovery engine belonged to
 * the retired "apply via Triad Vision" automatic sending and was removed; nothing new is written to the table.
 */
export const purgeDiscoveryCache = (now = new Date()) => prisma.employerEmailDiscovery.deleteMany({ where: { expiresAt: { lt: now } } });
