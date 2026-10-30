import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { audit } from '../../lib/audit.js';
import { forbidden, notFound, parse, badRequest } from '../../lib/http.js';
import { hasMinRole } from '../../middleware/auth.js';
import {
  TEAM_VIEWS_MAX,
  VIEWS_PER_USER_MAX,
  VIEW_PAGES,
  WHATS_NEW_OVERRIDES_KEY,
  cleanParams,
  newViewId,
  normalizeTablePrefs,
  overridesSchema,
  readOverrides,
  readStaffUi,
  readTeamViews,
  readUserViews,
  tablePrefsSchema,
  viewInputSchema,
  viewPatchSchema,
  viewsFor,
  whatsNewFeed,
  writeStaffUi,
  writeTeamViews,
  writeUserViews,
  type SavedView,
} from '../../lib/staffUi/index.js';

/**
 * Staff power-user UI state (mounted on /api/admin, STAFF+), stored in Setting rows (lib/staffUi):
 *
 *   GET    /me/saved-views?page=cases        { views: [{ id, page, name, params, columns, shared, mine, pinned, ownerName }] }
 *   POST   /me/saved-views                   { page, name, params, columns?, shared?, pinned? }
 *   PATCH  /me/saved-views/:id               { name?, params?, columns?, shared?, pinned? }   rename / share / pin
 *   DELETE /me/saved-views/:id
 *   GET    /me/table-prefs                   { tables: { [tableId]: { order, hidden, widths, mode } } }
 *   PUT    /me/table-prefs/:tableId          { prefs: {...} | null }                        null = back to the default
 *   GET    /me/whats-new                     { items, unread, latest, seen }
 *   POST   /me/whats-new/seen                { id }                                         marks the panel as read
 *   PUT    /whats-new/overrides              { hidden, extra }                              SUPER_ADMIN
 *
 * Team views: anyone may pin them; only the owner (or ADMIN+) renames, unshares or deletes them.
 */
export const adminStaffUiRouter = Router();

const pageQuery = z.object({ page: z.enum(VIEW_PAGES).optional() });

adminStaffUiRouter.get('/me/saved-views', async (req, res) => {
  const { page } = parse(pageQuery, req.query);
  res.json({ views: await viewsFor(req.user!.id, page) });
});

adminStaffUiRouter.post('/me/saved-views', async (req, res) => {
  const body = parse(viewInputSchema, req.body ?? {});
  const userId = req.user!.id;
  const now = new Date().toISOString();
  const view: SavedView = {
    id: newViewId(),
    page: body.page,
    name: body.name,
    params: cleanParams(body.params),
    columns: body.columns ? normalizeTablePrefs(body.columns) : null,
    ownerId: userId,
    createdAt: now,
    updatedAt: now,
  };
  const own = await readUserViews(userId);
  if (body.shared) {
    const team = await readTeamViews();
    if (team.views.length >= TEAM_VIEWS_MAX) throw badRequest('TOO_MANY_VIEWS');
    await writeTeamViews({ views: [...team.views, view] });
    await audit(req, 'SAVED_VIEW_SHARED', `view:${view.id}`, { page: view.page, name: view.name });
  } else {
    if (own.views.length >= VIEWS_PER_USER_MAX) throw badRequest('TOO_MANY_VIEWS');
    own.views.push(view);
  }
  if (body.pinned) own.pins = [...new Set([...own.pins, view.id])];
  await writeUserViews(userId, own);
  res.status(201).json({ view: { ...view, shared: body.shared, mine: true, pinned: body.pinned } });
});

/** Locates a view the user may see: own private or team. */
const locate = async (userId: string, id: string) => {
  const [own, team] = await Promise.all([readUserViews(userId), readTeamViews()]);
  const ownIdx = own.views.findIndex((v) => v.id === id);
  const teamIdx = team.views.findIndex((v) => v.id === id);
  if (ownIdx < 0 && teamIdx < 0) throw notFound('VIEW_NOT_FOUND');
  return { own, team, ownIdx, teamIdx };
};

adminStaffUiRouter.patch('/me/saved-views/:id', async (req, res) => {
  const body = parse(viewPatchSchema, req.body ?? {});
  const user = req.user!;
  const id = String(req.params.id);
  const { own, team, ownIdx, teamIdx } = await locate(user.id, id);
  const isTeam = teamIdx >= 0;
  const current = isTeam ? team.views[teamIdx] : own.views[ownIdx];
  const editsContent = body.name !== undefined || body.params !== undefined || body.columns !== undefined || body.shared !== undefined;
  // Pinning is personal; changing a team view needs its owner or ADMIN+.
  if (isTeam && editsContent && current.ownerId !== user.id && !hasMinRole(user.role, 'ADMIN')) throw forbidden('NOT_VIEW_OWNER');
  const next: SavedView = {
    ...current,
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...(body.params !== undefined ? { params: cleanParams(body.params) } : {}),
    ...(body.columns !== undefined ? { columns: body.columns ? normalizeTablePrefs(body.columns) : null } : {}),
    updatedAt: editsContent ? new Date().toISOString() : current.updatedAt,
  };
  const wantShared = body.shared ?? isTeam;
  if (wantShared && !isTeam) {
    if (team.views.length >= TEAM_VIEWS_MAX) throw badRequest('TOO_MANY_VIEWS');
    own.views.splice(ownIdx, 1);
    team.views.push(next);
    await audit(req, 'SAVED_VIEW_SHARED', `view:${id}`, { page: next.page, name: next.name });
  } else if (!wantShared && isTeam) {
    // Unsharing moves the view back to its owner's private list.
    team.views.splice(teamIdx, 1);
    if (next.ownerId === user.id) own.views.push(next);
    else {
      const owner = await readUserViews(next.ownerId);
      owner.views.push(next);
      await writeUserViews(next.ownerId, owner);
    }
  } else if (isTeam) team.views[teamIdx] = next;
  else own.views[ownIdx] = next;
  if (body.pinned !== undefined) own.pins = body.pinned ? [...new Set([...own.pins, id])] : own.pins.filter((p) => p !== id);
  if (isTeam || wantShared) await writeTeamViews(team);
  await writeUserViews(user.id, own);
  res.json({ view: { ...next, shared: wantShared, mine: next.ownerId === user.id, pinned: own.pins.includes(id) } });
});

adminStaffUiRouter.delete('/me/saved-views/:id', async (req, res) => {
  const user = req.user!;
  const id = String(req.params.id);
  const { own, team, ownIdx, teamIdx } = await locate(user.id, id);
  if (teamIdx >= 0) {
    const v = team.views[teamIdx];
    if (v.ownerId !== user.id && !hasMinRole(user.role, 'ADMIN')) throw forbidden('NOT_VIEW_OWNER');
    team.views.splice(teamIdx, 1);
    await writeTeamViews(team);
    await audit(req, 'SAVED_VIEW_DELETED', `view:${id}`, { page: v.page, name: v.name, shared: true });
  } else own.views.splice(ownIdx, 1);
  own.pins = own.pins.filter((p) => p !== id);
  await writeUserViews(user.id, own);
  res.json({ ok: true });
});

// ─── Table settings ────────────────────────────────────────────────────

const TABLE_ID = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.-]{0,39}$/);
const TABLES_MAX = 40;

adminStaffUiRouter.get('/me/table-prefs', async (req, res) => {
  res.json({ tables: (await readStaffUi(req.user!.id)).tables });
});

adminStaffUiRouter.put('/me/table-prefs/:tableId', async (req, res) => {
  const tableId = parse(TABLE_ID, req.params.tableId);
  const { prefs } = parse(z.object({ prefs: tablePrefsSchema.nullable() }), req.body ?? {});
  const doc = await readStaffUi(req.user!.id);
  if (prefs) {
    if (!doc.tables[tableId] && Object.keys(doc.tables).length >= TABLES_MAX) throw badRequest('TOO_MANY_TABLES');
    doc.tables[tableId] = normalizeTablePrefs(prefs);
  } else delete doc.tables[tableId];
  await writeStaffUi(req.user!.id, doc);
  res.json({ prefs: doc.tables[tableId] ?? null });
});

// ─── What's new ────────────────────────────────────────────────────────

adminStaffUiRouter.get('/me/whats-new', async (req, res) => {
  const [doc, overrides] = await Promise.all([readStaffUi(req.user!.id), readOverrides()]);
  res.json({ ...whatsNewFeed(overrides, doc.whatsNewSeen), seen: doc.whatsNewSeen });
});

adminStaffUiRouter.post('/me/whats-new/seen', async (req, res) => {
  const { id } = parse(z.object({ id: z.string().min(1).max(40) }), req.body ?? {});
  const [doc, overrides] = await Promise.all([readStaffUi(req.user!.id), readOverrides()]);
  if (!whatsNewFeed(overrides, null).items.some((i) => i.id === id)) throw notFound('NOTE_NOT_FOUND');
  doc.whatsNewSeen = id;
  await writeStaffUi(req.user!.id, doc);
  res.json({ ...whatsNewFeed(overrides, id), seen: id });
});

adminStaffUiRouter.put('/whats-new/overrides', async (req, res) => {
  if (!hasMinRole(req.user!.role, 'SUPER_ADMIN')) throw forbidden();
  const value = parse(overridesSchema, req.body ?? {});
  await prisma.setting.upsert({ where: { key: WHATS_NEW_OVERRIDES_KEY }, create: { key: WHATS_NEW_OVERRIDES_KEY, value }, update: { value } });
  await audit(req, 'WHATS_NEW_OVERRIDES_UPDATED', `setting:${WHATS_NEW_OVERRIDES_KEY}`, { hidden: value.hidden.length, extra: value.extra.length });
  res.json({ overrides: value });
});
