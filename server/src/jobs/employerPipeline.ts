import { registerJob } from '../lib/scheduler.js';
import { runPipelineDigests } from '../lib/employerPipeline/digest.js';

/**
 * Weekly employer pipeline digest (lib/employerPipeline/digest): hourly check; on Mondays from 08:00 Asia/Baku
 * every opted-in employer portal user gets one e-mail per week (claim row per user and week).
 */
registerJob({
  name: 'employer-pipeline-digest',
  everyMs: 60 * 60 * 1000,
  firstRunAfterMs: 9 * 60 * 1000,
  run: async () => {
    await runPipelineDigests();
  },
});
