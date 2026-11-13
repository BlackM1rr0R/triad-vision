import { registerJob } from '../lib/scheduler.js';
import { runIndexNow } from '../lib/indexNow.js';

/** IndexNow: push new / changed sitemap URLs to Bing, Yandex & co. (lib/indexNow), every 3 h, first 10 min after start. */
registerJob({
  name: 'indexnow',
  everyMs: 3 * 60 * 60 * 1000,
  firstRunAfterMs: 10 * 60 * 1000,
  run: async () => {
    const sent = await runIndexNow();
    if (sent) console.log(`[indexnow] submitted ${sent} URL(s)`);
  },
});
