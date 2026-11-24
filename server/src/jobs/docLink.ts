import { audit } from '../lib/audit.js';
import { registerJob } from '../lib/scheduler.js';
import { backfillLinkedDocuments } from '../lib/docLink/service.js';

/**
 * Linked case documents (lib/docLink): open cases that already have both lists get the matching ACCEPTED documents
 * of one list linked into the empty requirements of the other (passport in the initial list → passport in the embassy
 * list). Idempotent: the first run after the deploy fills existing cases once; later daily runs only catch documents
 * that reached a requirement outside the upload paths (drive link, AI move) and find nothing to do otherwise.
 */
registerJob({
  name: 'doc-link-backfill',
  everyMs: 24 * 60 * 60 * 1000,
  firstRunAfterMs: 3 * 60 * 1000,
  run: async () => {
    const r = await backfillLinkedDocuments();
    if (!r.linked) return;
    await audit({ user: undefined, ip: undefined }, 'DOCUMENTS_LINKED_BACKFILLED', undefined, { ...r });
    console.log(`[doc-link] ${r.linked} document(s) linked in ${r.cases} case(s)`);
  },
});
