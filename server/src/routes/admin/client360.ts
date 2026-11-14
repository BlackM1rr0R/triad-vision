import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../../lib/audit.js';
import { notFound, parse } from '../../lib/http.js';
import { TIMELINE_TYPES, client360, clientTimeline, loadClientUser, saveClientTags, type TimelineType } from '../../lib/client360.js';

/**
 * Client 360° — mounted at /api/admin/clients (STAFF+ via the admin router; every staff role sees every case,
 * as in the cases list, and the JSON passes the global masking middleware).
 *
 *   GET /:id                                      header, flags, counts and the section lists (lib/client360)
 *   GET /:id/timeline?types=&before=&limit=&caseId=   merged history, newest first, paged backwards
 *   PUT /:id/tags { tags: string[] }              manual tags (stored on the client's shared contact)
 */
export const adminClient360Router = Router();

const loadClient = async (id: string) => {
  const u = await loadClientUser(id);
  if (!u || u.role !== 'CLIENT') throw notFound('CLIENT_NOT_FOUND');
  return u;
};

adminClient360Router.get('/:id', async (req, res) => {
  await loadClient(req.params.id);
  const data = await client360(req.params.id);
  if (!data) throw notFound('CLIENT_NOT_FOUND');
  res.json(data);
});

const timelineQuery = z.object({
  types: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').filter((t): t is TimelineType => (TIMELINE_TYPES as readonly string[]).includes(t)) : undefined)),
  before: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  caseId: z.string().trim().min(1).max(40).optional(),
});

adminClient360Router.get('/:id/timeline', async (req, res) => {
  const q = parse(timelineQuery, req.query);
  await loadClient(req.params.id);
  res.json(await clientTimeline(req.params.id, q));
});

adminClient360Router.put('/:id/tags', async (req, res) => {
  const { tags } = parse(z.object({ tags: z.array(z.string().max(60)).max(30) }), req.body);
  const u = await loadClient(req.params.id);
  const saved = await saveClientTags(u, tags, req.user!.id);
  await audit(req, 'CLIENT_TAGS_UPDATED', `user:${u.id}`, { tags: saved.tags });
  res.json(saved);
});
