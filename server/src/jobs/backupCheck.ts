import { registerJob } from '../lib/scheduler.js';
import { runBackupCheckNotify } from '../lib/ops/backupCheck.js';

/**
 * Weekly backup restore test (deploy/backup-verify.sh on the host writes Setting `ops:backupCheck`): hourly,
 * a new result becomes an admin notification + e-mail; a check older than 9 days triggers one warning.
 */
registerJob({
  name: 'backup-check',
  everyMs: 60 * 60 * 1000,
  firstRunAfterMs: 4 * 60 * 1000,
  run: async () => {
    await runBackupCheckNotify();
  },
});
