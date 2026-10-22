import { registerJob } from '../lib/scheduler.js';
import { sweepPendingInsights } from '../lib/uploadAi/index.js';

/**
 * Smart uploads: recognitions are queued in-process right after each upload; this sweep (every 5 minutes)
 * finishes the ones a restart left PENDING.
 */
registerJob({ name: 'upload-ai-sweep', everyMs: 5 * 60_000, firstRunAfterMs: 120_000, run: async () => void (await sweepPendingInsights()) });
