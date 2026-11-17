import { prisma } from '../../db.js';

/** Latest "Müştəriyə göndər" per case (drive listing chip "Müştəriyə göndərilib"). Only the database: safe to import anywhere. */
export const lastSentAt = async (caseIds: string[]) => {
  if (!caseIds.length) return new Map<string, Date>();
  const rows = await prisma.caseReadyDocsSend.groupBy({ by: ['caseId'], where: { caseId: { in: caseIds } }, _max: { createdAt: true } });
  return new Map(rows.filter((r) => r._max.createdAt).map((r) => [r.caseId, r._max.createdAt!]));
};
