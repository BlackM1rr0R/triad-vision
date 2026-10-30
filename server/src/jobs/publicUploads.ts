import { registerJob } from '../lib/scheduler.js';
import { runOrphanSweepIfDue } from '../lib/publicImageRefs.js';

/**
 * Nightly (from 03:00 Baku, once a day): public upload files no DB record references and older than 7 days are
 * deleted — CMS root folder, /uploads/vacancies, /uploads/logos (lib/publicImageRefs.ts). The first run on an
 * installation is a dry run; at most 500 files per run; the count goes to the audit log.
 */
registerJob({
  name: 'public-uploads-orphans',
  everyMs: 60 * 60 * 1000,
  firstRunAfterMs: 20 * 60 * 1000,
  run: async () => {
    const r = await runOrphanSweepIfDue();
    if (r && (r.orphans || r.skipped)) {
      console.log(`[job:public-uploads-orphans] ${r.dryRun ? 'dry run: ' : ''}scanned=${r.scanned} orphans=${r.orphans} deleted=${r.deleted} bytes=${r.bytes}${r.skipped ? ` skipped=${r.skipped}` : ''}`);
    }
  },
});
