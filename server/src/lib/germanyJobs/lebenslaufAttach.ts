import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import { latestOrNewLebenslauf, lebenslaufFileName, lebenslaufPath } from '../cv/versions.js';
import { cvPath, type StoredCv } from './apply.js';

/**
 * "Attach my Lebenslauf" in the apply dialog: the application gets its own copy of the client's newest saved
 * Lebenslauf (a new version is built from the current CV when none exists), so later CV edits or deleting a
 * version never change what was sent, and anonymising the lead removes only that copy.
 */
export const attachLebenslaufCopy = async (userId: string): Promise<StoredCv> => {
  const v = await latestOrNewLebenslauf(userId);
  const storedName = `cv-${Date.now()}-${crypto.randomBytes(12).toString('hex')}.pdf`;
  await fsp.copyFile(lebenslaufPath(v.storageKey), cvPath(storedName));
  return { storedName, originalName: await lebenslaufFileName(userId, v), mime: 'application/pdf', size: v.size, lebenslaufVersionId: v.id };
};
