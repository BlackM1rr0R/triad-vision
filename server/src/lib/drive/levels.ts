import type { DriveAccess } from '@prisma/client';

/** Access levels from least to most; every level includes the ones below it. */
export const LEVELS: DriveAccess[] = ['VIEW', 'DOWNLOAD', 'EXPORT', 'EDIT', 'MANAGE'];

export const RANK: Record<DriveAccess, number> = { VIEW: 1, DOWNLOAD: 2, EXPORT: 3, EDIT: 4, MANAGE: 5 };

export type Level = DriveAccess | null;

export const allows = (have: Level | undefined, need: DriveAccess) => !!have && RANK[have] >= RANK[need];

export const maxLevel = (a: Level | undefined, b: Level | undefined): Level => {
  if (!a) return b ?? null;
  if (!b) return a;
  return RANK[a] >= RANK[b] ? a : b;
};

export const minLevel = (a: Level, b: DriveAccess): Level => (a && RANK[a] > RANK[b] ? b : a);
