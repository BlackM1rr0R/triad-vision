import { registerJob } from '../lib/scheduler.js';
import { campaignTick, TICK_MS } from '../lib/campaigns/engine.js';

/**
 * Campaigns: starts scheduled campaigns when their time comes and sends the queue in small,
 * throttled batches (see lib/campaigns/engine.ts). Runs every 10 seconds; never overlaps itself.
 */
registerJob({ name: 'campaigns', everyMs: TICK_MS, firstRunAfterMs: 90 * 1000, run: () => campaignTick() });
