import { Router } from 'express';
import { prisma } from '../db.js';
import { limiter, notFound } from '../lib/http.js';
import { parseLocale, pick } from '../lib/seo.js';
import { openVacancyWhere } from '../lib/vacancies.js';
import { jobProfession } from '../lib/jobLandings.js';
import { hubBySlug, hubMatches } from '../lib/professionHubs.js';
import { placesFor } from '../lib/vacancyPlaces/service.js'; // free places (waitlist form when none is left)

/**
 * Profession hubs (/for/:slug, lib/professionHubs.ts) — mounted at /api/profession-hubs:
 *   GET /:slug/vacancies?lng=   open vacancies of the hub's professions (canonical profession of Vacancy.profession,
 *                               else of the title — the same rule as the profession × city landing pages), newest
 *                               first, at most 6, with the total count and how many of them still have a free place
 *                               (withFreePlaces: 0 → the page offers the vacancy waitlist). 404 for an unknown hub.
 */
export const professionHubsRouter = Router();

const publicLimiter = limiter({ windowMs: 60 * 1000, limit: 120 });
export const HUB_VACANCY_LIMIT = 6;

professionHubsRouter.get('/:slug/vacancies', publicLimiter, async (req, res) => {
  const hub = hubBySlug(String(req.params.slug));
  if (!hub) throw notFound('HUB_NOT_FOUND');
  const lng = parseLocale(req.query.lng) ?? 'az';
  const rows = await prisma.vacancy.findMany({
    where: openVacancyWhere(),
    orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    take: 500,
    select: { id: true, slug: true, title: true, profession: true, city: true, salaryMin: true, salaryMax: true, employmentType: true, publishedAt: true, positions: true, filledAdjustment: true },
  });
  const matching = rows.filter((v) => hubMatches(hub, jobProfession(v)));
  const places = await placesFor(matching);
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.json({
    total: matching.length,
    withFreePlaces: matching.filter((v) => (places.get(v.id)?.free ?? 0) > 0).length,
    items: matching.slice(0, HUB_VACANCY_LIMIT).map((v) => ({
      slug: v.slug,
      title: pick(v.title, lng),
      city: v.city,
      salaryMin: v.salaryMin,
      salaryMax: v.salaryMax,
      employmentType: v.employmentType,
      publishedAt: v.publishedAt,
      free: places.get(v.id)?.free ?? 0,
    })),
  });
});
