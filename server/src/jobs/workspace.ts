import { registerJob } from '../lib/scheduler.js';
import { closeExpiredPolls } from '../lib/workspace/polls.js';

/**
 * Team workspace housekeeping: polls past their `closesAt` get closed. Announcement expiry needs
 * no job (expired ones are filtered on read) and leave requests carry their own dates.
 */
const MIN = 60 * 1000;

export const runWorkspaceJobs = async (now = new Date()) => {
  await closeExpiredPolls(now);
};

registerJob({ name: 'workspace-housekeeping', everyMs: 5 * MIN, run: () => runWorkspaceJobs() });
