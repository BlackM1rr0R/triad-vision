import { registerJob } from '../lib/scheduler.js';
import { runInquiryRetention } from '../lib/privacy/inquiries.js';

/** DSGVO: daily anonymisation of closed, never converted website leads past the retention period (lib/privacy/inquiries.ts). */
registerJob({
  name: 'inquiry-retention',
  everyMs: 24 * 60 * 60 * 1000,
  firstRunAfterMs: 15 * 60 * 1000,
  run: async () => {
    const r = await runInquiryRetention();
    if (r.anonymized || r.failed) console.log(`[inquiry-retention] anonymized ${r.anonymized} inquiries (${r.failed} failed)`);
  },
});
