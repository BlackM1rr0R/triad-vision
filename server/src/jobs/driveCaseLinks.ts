import { audit } from '../lib/audit.js';
import { registerJob } from '../lib/scheduler.js';
import { backfillCaseLinks } from '../lib/drive/workflowLinks.js';

/**
 * Case links in the drive (lib/drive/workflowLinks.ts), idempotent: current client folders get the client folder
 * mark, legacy "İş axını" copies are linked to their case by name where exactly one case matches, and client
 * folders left behind in the partner area (case deleted) are marked, so they stay hidden from partners. Shortly
 * after every start, then daily (cheap when there is nothing to do).
 */
registerJob({
  name: 'drive-case-links',
  everyMs: 24 * 60 * 60 * 1000,
  firstRunAfterMs: 90 * 1000,
  run: async () => {
    const r = await backfillCaseLinks();
    if (!r.clientFoldersMarked && !r.workflowLinked && !r.orphansMarked) return;
    await audit({ user: undefined, ip: undefined }, 'DRIVE_CASE_LINKS_BACKFILLED', undefined, { ...r });
    console.log(`[drive] case links: ${r.clientFoldersMarked} client folder(s) marked, ${r.workflowLinked} workflow folder(s) linked, ${r.orphansMarked} left-behind client folder(s) marked`);
  },
});
