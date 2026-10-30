import { Router } from 'express';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { forbidden, notFound } from '../lib/http.js';
import { countdownsFor, familyCases, ownCaseId } from '../lib/clientPlus/portal.js';

/**
 * /api/account/plus — client portal extras (lib/clientPlus):
 *   GET /family                 the client's cases for the family switcher ("Mən", spouse, child: name)
 *   GET /countdowns?case=<id>   countdown cards (embassy, flight, Anmeldung, Bürgeramt) + destination weather
 *   GET /offline-pack           what the PWA keeps for "Oflayn saxla": the appointment card and the own
 *                               documents list (metadata only; files are fetched one by one via /api/files/:id)
 * Every case id is checked against Case.clientId (someone else's case → 404). Clients only.
 */
export const accountPlusRouter = Router();
accountPlusRouter.use(requireAuth);
accountPlusRouter.use((req, _res, next) => next(req.user!.role === 'CLIENT' ? undefined : forbidden('CLIENTS_ONLY')));

const caseParam = (q: unknown) => (typeof q === 'string' && q ? q.slice(0, 41) : null);

accountPlusRouter.get('/family', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ cases: await familyCases(req.user!.id) });
});

accountPlusRouter.get('/countdowns', async (req, res) => {
  const wanted = caseParam(req.query.case);
  const chosen = wanted ? await ownCaseId(req.user!.id, wanted) : null;
  if (wanted && !chosen) throw notFound('CASE_NOT_FOUND');
  res.setHeader('Cache-Control', 'no-store');
  res.json(await countdownsFor(req.user!.id, chosen));
});

/** Upper bound of documents listed for offline use (the device caches at most what the user ticks). */
const OFFLINE_DOCS = 200;

accountPlusRouter.get('/offline-pack', async (req, res) => {
  const userId = req.user!.id;
  const [user, cases] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { firstName: true, lastName: true } }),
    prisma.case.findMany({
      where: { clientId: userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        number: true,
        status: true,
        appointmentAt: true,
        appointmentPlace: true,
        parentCaseId: true,
        familyProfile: { select: { firstName: true, relation: true } },
        documents: {
          where: { stage: { in: ['INITIAL', 'EMBASSY', 'VISA', 'CONTRACT_SIGNED'] }, status: { not: 'REJECTED' } },
          orderBy: { createdAt: 'desc' },
          take: OFFLINE_DOCS,
          select: { id: true, originalName: true, mimeType: true, size: true, status: true, stage: true, createdAt: true, requirement: { select: { title: true, key: true } } },
        },
      },
    }),
  ]);
  const countdowns = await Promise.all(cases.map((c) => countdownsFor(userId, c.id, new Date(), { weather: false })));
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    generatedAt: new Date().toISOString(),
    holder: { firstName: user.firstName, lastName: user.lastName },
    cases: cases.map((c, i) => ({
      id: c.id,
      number: c.number,
      status: c.status,
      member: c.parentCaseId ? { firstName: c.familyProfile?.firstName ?? null, relation: c.familyProfile?.relation ?? null } : null,
      appointment: c.appointmentAt ? { at: c.appointmentAt.toISOString(), place: c.appointmentPlace } : null,
      cards: countdowns[i].cards,
      documents: c.documents.map((d) => ({
        id: d.id,
        name: d.originalName,
        mimeType: d.mimeType,
        size: d.size,
        status: d.status,
        stage: d.stage,
        createdAt: d.createdAt.toISOString(),
        title: d.requirement?.title ?? null,
        key: d.requirement?.key ?? null,
      })),
    })),
  });
});
