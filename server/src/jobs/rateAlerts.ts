import { registerJob } from '../lib/scheduler.js';
import { purgeRateAlerts, runRateAlerts } from '../lib/rateAlerts/service.js';

/**
 * EUR → AZN rate alerts (lib/rateAlerts/service.ts): getEurAzn() asks CBAR at most once per Baku day (the daily
 * fetch), then alerts whose condition holds fire once and pause; 6-month expiry notices; DSGVO housekeeping.
 */
registerJob({
  name: 'rate-alerts',
  everyMs: 30 * 60 * 1000,
  firstRunAfterMs: 4 * 60 * 1000,
  run: async () => {
    await runRateAlerts();
    await purgeRateAlerts();
  },
});
