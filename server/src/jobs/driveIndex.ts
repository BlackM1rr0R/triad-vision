import { config } from '../config.js';
import { registerJob } from '../lib/scheduler.js';
import { runDriveIndex } from '../lib/driveIntel/indexer.js';

/**
 * Drive full-text index: every 2 minutes a small batch of new / changed files gets its text extracted
 * (PDF text layer, DOCX, XLSX, TXT/CSV; OCR for images and scanned PDF pages). See lib/driveIntel/indexer.ts.
 */
registerJob({
  name: 'drive-index',
  everyMs: 2 * 60_000,
  firstRunAfterMs: 3 * 60_000,
  run: async () => {
    if (config.isTest) return;
    await runDriveIndex();
  },
});
