import { Router } from 'express';
import { changesPage } from '../lib/changes2027/content.js';

/**
 * "What changes in Germany on 1 January 2027" — mounted at /api/changes-2027 (public, no login, no DB):
 *   GET /?lng=az|de|en|ru|tr|uk → the localized page data built from the data freshness registry.
 */
export const changes2027Router = Router();

changes2027Router.get('/', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.json(changesPage(typeof req.query.lng === 'string' ? req.query.lng.slice(0, 2) : 'en'));
});
