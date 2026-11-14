import { registerJob } from '../lib/scheduler.js';
import { pruneImageCache } from '../lib/imageProxy.js';

/** Daily: resized public images (/api/img, lib/imageProxy.ts) unused for 90 days or above IMAGE_CACHE_MAX_MB are deleted. */
registerJob({
  name: 'image-cache-prune',
  everyMs: 24 * 60 * 60 * 1000,
  firstRunAfterMs: 30 * 60 * 1000,
  run: async () => {
    const r = await pruneImageCache();
    if (r.deleted) console.log(`[job:image-cache-prune] files=${r.files} deleted=${r.deleted} bytes=${r.bytes}`);
  },
});
