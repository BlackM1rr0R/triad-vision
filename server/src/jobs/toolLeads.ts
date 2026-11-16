import { registerJob } from '../lib/scheduler.js';
import { purgeToolLeads, runToolFollowUps } from '../lib/toolLeads/service.js';

// "E-mail me my result": the one follow-up e-mail 3 days after a confirmed opt-in (double opt-in), and DSGVO
// housekeeping (unconfirmed opt-ins dropped after 7 days, lead rows deleted after 60 days).
registerJob({
  name: 'tool-result-follow-ups',
  everyMs: 30 * 60 * 1000,
  run: async () => {
    await runToolFollowUps();
    await purgeToolLeads();
  },
});
