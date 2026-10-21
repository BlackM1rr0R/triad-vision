import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';

/**
 * Activity journal of the team drive (DriveActivity): who uploaded, moved, renamed, deleted… what, where
 * and when. One row per item and action; the folder journal lists the rows whose `folderId` is that
 * folder (actions on its direct children), the rows about the folder itself and moves out of it.
 *
 * Writing is fire-and-forget safe: `logDriveActivity` never throws, so a failing journal never breaks
 * the action it describes.
 */

export const DRIVE_ACTIONS = [
  'UPLOAD',
  'UPLOAD_VIA_LINK',
  'NEW_VERSION',
  'CREATE_FOLDER',
  'CREATE',
  'CONVERT',
  'RENAME',
  'MOVE',
  'COPY',
  'DELETE',
  'RESTORE',
  'PURGE',
  'SHARE_LINK_CREATED',
  'SHARE_LINK_REVOKED',
  'COMMENT',
  'TASK_CREATED',
  'LOCK',
  'UNLOCK',
  'SHEET_SAVE',
  // Document organisation (lib/drive/org)
  'TAG',
  'UNTAG',
  'STAGE',
  'FINAL',
  'UNFINAL',
] as const;
export type DriveAction = (typeof DRIVE_ACTIONS)[number];

export interface DriveActivityInput {
  nodeId?: string | null;
  /** The folder the action happened in; looked up from the node's parent when left out. */
  folderId?: string | null;
  actorId?: string | null;
  action: DriveAction;
  /** Item name at that moment (looked up when left out). */
  name?: string | null;
  meta?: Record<string, unknown> | null;
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

/** Records one action. Never throws. */
export const logDriveActivity = async (input: DriveActivityInput) => {
  try {
    let { folderId, name } = input;
    if (input.nodeId && (folderId === undefined || !name)) {
      const n = await prisma.driveNode.findUnique({ where: { id: input.nodeId }, select: { parentId: true, name: true } });
      if (folderId === undefined) folderId = n?.parentId ?? null;
      if (!name) name = n?.name ?? '';
    }
    await prisma.driveActivity.create({
      data: {
        nodeId: input.nodeId ?? null,
        folderId: folderId ?? null,
        actorId: input.actorId ?? null,
        action: input.action,
        name: clip(name ?? '', 255),
        meta: (input.meta ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (err) {
    console.error('[driveActivity] failed', input.action, err);
  }
};

/** Records several actions (bulk operations: one row per item). Never throws. */
export const logDriveActivities = async (inputs: DriveActivityInput[]) => {
  for (const i of inputs) await logDriveActivity(i);
};

/**
 * For the spreadsheet editor: a saved workbook is a new version of the file. Call after a successful
 * save (`version` = the version just written).
 */
export const logSheetSave = (nodeId: string, actorId: string, meta: { version?: number } & Record<string, unknown> = {}) =>
  logDriveActivity({ nodeId, actorId, action: 'SHEET_SAVE', meta });
