import { registerJob } from '../lib/scheduler.js';
import { runBaUpload } from '../lib/jobFeeds/ba.js';

/**
 * BA Jobbörse (HR-BA-XML): daily full upload of the vacancies with the BA channel on. Does nothing until an
 * admin enters supplier id, partner id, client certificate, password and upload URL and switches the upload on
 * (Admin → İş elanı kanalları); until then the file is downloaded and uploaded by hand.
 */
registerJob({
  name: 'job-feeds-ba-upload',
  everyMs: 24 * 60 * 60 * 1000,
  firstRunAfterMs: 20 * 60 * 1000,
  run: async () => {
    const r = await runBaUpload();
    if ('error' in r) console.error(`[job:job-feeds-ba-upload] ${r.error}`);
    else if (r.ok) console.log(`[job:job-feeds-ba-upload] uploaded=${r.uploaded} invalid=${r.invalid}`);
  },
});
