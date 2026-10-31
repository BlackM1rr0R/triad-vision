import { Router } from 'express';
import { z } from 'zod';
import { requireMinRole } from '../../middleware/auth.js';
import { audit } from '../../lib/audit.js';
import { parse } from '../../lib/http.js';
import {
  addCaseLink,
  AUTHORITY_TYPES,
  authorityInput,
  authorityOptions,
  caseAuthorities,
  caseAuthoritiesInput,
  caseLinkInput,
  createAuthority,
  deleteAuthority,
  findMatches,
  linkMatches,
  listAuthorities,
  listQuery,
  loadAuthority,
  removeCaseLink,
  setCaseAuthorities,
  updateAuthority,
} from '../../lib/authorities/service.js';

/**
 * Authorities catalogue (Botschaft / Ausländerbehörde / Agentur für Arbeit / recognition bodies) — mounted at
 * /api/admin/authorities. Reading is STAFF+, catalogue writes ADMIN+ (audited); linking a case is STAFF+.
 *
 *   GET    /?q&type&city&active          list + cities + counts per type (waiting time: manual + computed)
 *   GET    /options?type                  active authorities for pickers
 *   GET    /:id                           detail: contacts, requirements, checklist, waiting time, linked cases
 *   POST   /                              create (ADMIN+) { type, name, …, checklist[], contacts[] }
 *   PUT    /:id                           full update, contacts replaced (ADMIN+)
 *   DELETE /:id                           ADMIN+, 409 AUTHORITY_IN_USE while cases point at it
 *   GET    /:id/matches                   cases whose free text names it and that are not linked yet (ADMIN+)
 *   POST   /:id/matches { caseIds }       link those cases (only empty links are filled) (ADMIN+)
 *   GET    /cases/:caseId                 case card: embassy, Ausländerbehörde, further authorities
 *   PUT    /cases/:caseId                 { embassyAuthorityId?, abhAuthorityId? } (null clears)
 *   POST   /cases/:caseId/links           { authorityId, note? } further authority
 *   DELETE /cases/:caseId/links/:authorityId
 */
export const adminAuthoritiesRouter = Router();

// Case links are part of case work (STAFF); the catalogue itself is edited by ADMIN+.
// The free-text match list (case numbers + client names across all cases) belongs to the ADMIN linking tool.
adminAuthoritiesRouter.use((req, res, next) =>
  (req.method === 'GET' && !req.path.endsWith('/matches')) || req.path.startsWith('/cases/') ? next() : requireMinRole('ADMIN')(req, res, next),
);

const id = (v: unknown) => String(v);

adminAuthoritiesRouter.get('/', async (req, res) => {
  res.json(await listAuthorities(parse(listQuery, req.query)));
});

adminAuthoritiesRouter.get('/options', async (req, res) => {
  const { type } = parse(z.object({ type: z.enum(AUTHORITY_TYPES).optional() }), req.query);
  res.json({ items: await authorityOptions(type) });
});

adminAuthoritiesRouter.get('/cases/:caseId', async (req, res) => {
  res.json(await caseAuthorities(id(req.params.caseId)));
});

adminAuthoritiesRouter.put('/cases/:caseId', async (req, res) => {
  const caseId = id(req.params.caseId);
  const { changed } = await setCaseAuthorities(caseId, parse(caseAuthoritiesInput, req.body), req.user!.id);
  if (Object.keys(changed).length) await audit(req, 'CASE_AUTHORITIES_SET', caseId, changed);
  res.json(await caseAuthorities(caseId));
});

adminAuthoritiesRouter.post('/cases/:caseId/links', async (req, res) => {
  const caseId = id(req.params.caseId);
  const a = await addCaseLink(caseId, parse(caseLinkInput, req.body), req.user!.id);
  await audit(req, 'CASE_AUTHORITY_LINKED', caseId, { authorityId: a.id });
  res.status(201).json(await caseAuthorities(caseId));
});

adminAuthoritiesRouter.delete('/cases/:caseId/links/:authorityId', async (req, res) => {
  const caseId = id(req.params.caseId);
  await removeCaseLink(caseId, id(req.params.authorityId), req.user!.id);
  await audit(req, 'CASE_AUTHORITY_UNLINKED', caseId, { authorityId: id(req.params.authorityId) });
  res.json(await caseAuthorities(caseId));
});

adminAuthoritiesRouter.post('/', async (req, res) => {
  const body = parse(authorityInput, req.body);
  const row = await createAuthority(body, req.user!.id);
  await audit(req, 'AUTHORITY_CREATED', row.id, { type: row.type, name: row.name, city: row.city });
  res.status(201).json(await loadAuthority(row.id));
});

adminAuthoritiesRouter.get('/:id/matches', async (req, res) => {
  res.json({ items: await findMatches(id(req.params.id)) });
});

adminAuthoritiesRouter.post('/:id/matches', async (req, res) => {
  const { caseIds } = parse(z.object({ caseIds: z.array(z.string().min(1).max(40)).min(1).max(500) }), req.body);
  await loadAuthority(id(req.params.id)); // 404 for an unknown id
  const linked = await linkMatches(id(req.params.id), caseIds, req.user!.id);
  if (linked.length) await audit(req, 'AUTHORITY_CASES_LINKED', id(req.params.id), { count: linked.length, caseIds: linked });
  res.json({ linked: linked.length });
});

adminAuthoritiesRouter.get('/:id', async (req, res) => {
  res.json(await loadAuthority(id(req.params.id)));
});

adminAuthoritiesRouter.put('/:id', async (req, res) => {
  const { row, changed } = await updateAuthority(id(req.params.id), parse(authorityInput, req.body));
  await audit(req, 'AUTHORITY_UPDATED', row.id, { name: row.name, changed });
  res.json(await loadAuthority(row.id));
});

adminAuthoritiesRouter.delete('/:id', async (req, res) => {
  const a = await deleteAuthority(id(req.params.id));
  await audit(req, 'AUTHORITY_DELETED', a.id, { type: a.type, name: a.name });
  res.status(204).end();
});
