import { Router } from 'express';
import { getCatalogue } from '../lib/candidateCatalogue/index.js';
import { PROFESSION_LABELS } from '../lib/candidateCatalogue/labels.js';

/**
 * Public anonymous candidate catalogue — mounted at /api/candidate-catalogue (no login, SSR query key
 * "candidate-catalogue"): aggregated k-anonymous groups of the consented pool (lib/candidateCatalogue).
 */
export const candidateCatalogueRouter = Router();

candidateCatalogueRouter.get('/', async (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=600');
  const c = await getCatalogue();
  res.json({ ...c, labels: Object.fromEntries(c.professions.map((p) => [p.profession, PROFESSION_LABELS[p.profession] ?? null])) });
});
