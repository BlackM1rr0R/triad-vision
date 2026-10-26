import { Router } from 'express';
import { limiter } from '../lib/http.js';
import { FEED_CHANNELS, FEED_TTL_MS, checkFeedToken, getFeedXml, type FeedChannel } from '../lib/jobFeeds/service.js';

/**
 * Public job feeds for external boards — mounted at /feeds (Caddy forwards /feeds/* to the API):
 *   GET /feeds/indeed.xml?token=…    Indeed XML feed
 *   GET /feeds/stepstone.xml?token=… structured XML for StepStone / multiposting tools
 *   GET /feeds/generic.xml?token=…   the same structured XML for any other board
 * The token is the secret from Admin → İş elanı kanalları (rotatable). Built at most every 10 minutes.
 */
export const jobFeedsRouter = Router();

const feedLimiter = limiter({ windowMs: 60 * 1000, limit: 60 });

jobFeedsRouter.get('/:file', feedLimiter, async (req, res) => {
  const channel = /^([a-z]+)\.xml$/.exec(String(req.params.file))?.[1] as FeedChannel | undefined;
  res.setHeader('X-Robots-Tag', 'noindex');
  if (!channel || !(FEED_CHANNELS as readonly string[]).includes(channel)) {
    res.status(404).type('text/plain').send('Not found');
    return;
  }
  if (!(await checkFeedToken(req.query.token))) {
    res.status(403).type('text/plain').send('Invalid or missing feed token');
    return;
  }
  const { xml, cached } = await getFeedXml(channel);
  res.type('application/xml; charset=utf-8');
  // The URL carries a secret: shared caches must not keep it.
  res.setHeader('Cache-Control', `private, max-age=${FEED_TTL_MS / 1000}`);
  res.setHeader('X-Feed-Cache', cached ? 'HIT' : 'MISS');
  res.send(xml);
});
