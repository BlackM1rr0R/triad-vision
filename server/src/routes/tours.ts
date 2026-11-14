import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { badRequest, parse } from '../lib/http.js';
import { TOUR_ID, TooManyToursError, applyTourUpdate, readTours, tourUpdateSchema, updateTours } from '../lib/tours.js';

/**
 * Guided-tour progress of the signed-in user, any role (lib/tours.ts; client: components/onboarding/tour.ts):
 *
 *   GET /api/tours              { tours: { [tourId]: { status: 'progress' | 'done' | 'never', step, at } } }
 *   PUT /api/tours/:tourId      { status: 'progress' | 'done' | 'never' | 'reset', step?, restart? } → { tours }
 *
 * While a staff member views the portal as a client (impersonation) the PUT is refused by the read-only guard,
 * so looking at a client's portal never marks the client's tour as seen.
 */
export const toursRouter = Router();
toursRouter.use(requireAuth);

toursRouter.get('/', async (req, res) => {
  res.json({ tours: await readTours(req.user!.id) });
});

toursRouter.put('/:tourId', async (req, res) => {
  const tourId = parse(TOUR_ID, req.params.tourId);
  const update = parse(tourUpdateSchema, req.body ?? {});
  try {
    const tours = await updateTours(req.user!.id, (doc) => applyTourUpdate(doc, tourId, update));
    res.json({ tours });
  } catch (err) {
    if (err instanceof TooManyToursError) throw badRequest('TOO_MANY_TOURS');
    throw err;
  }
});
