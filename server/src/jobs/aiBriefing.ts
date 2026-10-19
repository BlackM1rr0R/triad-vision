import { registerJob } from '../lib/scheduler.js';
import { runBriefingJob } from '../lib/aiStaff/briefing.js';

/**
 * Daily AI briefing e-mail (lib/aiStaff/briefing.ts): hourly check, sends from 08:00 Asia/Baku to opted-in
 * SUPER_ADMIN / ADMIN users, once per Baku day (Setting flag), skipped on days with nothing to report.
 */
registerJob({
  name: 'ai-briefing',
  everyMs: 60 * 60 * 1000,
  firstRunAfterMs: 5 * 60 * 1000,
  run: async () => {
    await runBriefingJob();
  },
});
