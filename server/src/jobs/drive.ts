import { audit } from '../lib/audit.js';
import { registerJob } from '../lib/scheduler.js';
import { purgeExpiredTrash } from '../lib/drive/trash.js';
import { runDriveStartup } from '../lib/drive/layout.js';

/** Drive housekeeping: items in the recycle bin longer than DRIVE_TRASH_DAYS (30) are deleted for good. */
registerJob({
  name: 'drive-trash-purge',
  everyMs: 6 * 60 * 60 * 1000,
  firstRunAfterMs: 5 * 60 * 1000,
  run: async () => {
    const r = await purgeExpiredTrash();
    if (r.roots === 0) return;
    await audit({ user: undefined, ip: undefined }, 'DRIVE_TRASH_AUTO_PURGED', undefined, r);
    console.log(`[drive] purged ${r.roots} trash item(s), ${r.nodes} node(s), ${(r.bytes / 1024 / 1024).toFixed(1)} MB`);
  },
});

/**
 * Shared workspace upkeep, shortly after every start and then every few hours: old personal spaces move
 * into "Mitarbeiter", every case gets its client folder, and (once) accepted case documents are copied in.
 */
registerJob({
  name: 'drive-shared-layout',
  everyMs: 6 * 60 * 60 * 1000,
  firstRunAfterMs: 20 * 1000,
  run: async () => {
    await runDriveStartup();
  },
});
