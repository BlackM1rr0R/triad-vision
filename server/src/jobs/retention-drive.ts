import { registerJob } from '../lib/scheduler.js';
import { runDriveRetention } from '../lib/retention/drive.js';

/** Daily DSGVO retention of the drive's client folders: archive after N months, warn 30 / 7 days ahead, then to the recycle bin. */
registerJob({
  name: 'retention-drive',
  everyMs: 24 * 60 * 60 * 1000,
  firstRunAfterMs: 25 * 60 * 1000,
  run: async () => {
    const r = await runDriveRetention();
    if (r.archived || r.purged || r.warned || r.failed) {
      console.log(`[retention-drive] archived ${r.archived}, purged ${r.purged}, warned ${r.warned}, skipped ${r.skipped}, failed ${r.failed}`);
    }
  },
});
