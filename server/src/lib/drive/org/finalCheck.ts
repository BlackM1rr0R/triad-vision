import { prisma } from '../../../db.js';
import { HttpError } from '../../http.js';

/** 423 FILE_FINAL (see final.ts). No imports from the drive listing code, so lib/driveCollab/lock.ts can use it. */
export const FILE_FINAL = 'FILE_FINAL';
export const finalError = () => new HttpError(423, FILE_FINAL);

/** 423 FILE_FINAL when the node itself is final. */
export const assertNotFinal = async (nodeId: string) => {
  const n = await prisma.driveNode.findUnique({ where: { id: nodeId }, select: { finalAt: true } });
  if (n?.finalAt) throw finalError();
};
