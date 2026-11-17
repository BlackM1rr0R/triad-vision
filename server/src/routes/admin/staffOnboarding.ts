import { Router, type Request } from 'express';
import { z } from 'zod';
import { requireMinRole } from '../../middleware/auth.js';
import { parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { createEntry, deleteEntry, entryInputSchema, feedFor, manageList, markSeen, setHidden, updateEntry } from '../../lib/whatsNew/service.js';
import { myChecklist, teamProgress, tickTask } from '../../lib/staffOnboarding/service.js';
import { markSetupItem, setupChecklist } from '../../lib/ownerSetup/service.js';

/**
 * Staff onboarding & owner setup (STAFF+ via the admin router; ADMIN+ where noted):
 *
 *   /api/admin/whats-new
 *     GET  /                          my feed: entries for my role with `seen`, unseen count, ids for the login modal
 *     POST /seen                      { ids: string[] } | { all: true }
 *     GET  /manage                    ADMIN+: every entry (code, custom, older) with hidden flag
 *     POST /entries                   ADMIN+: { date?, title, body, roles, link? }   (audited)
 *     PATCH /entries/:id · DELETE     ADMIN+ (audited)
 *     POST /entries/:id/hidden        ADMIN+: { hidden } — hides a code / older entry (audited)
 *
 *   /api/admin/training-checklist
 *     GET  /me                        my tasks (auto-detected + manual ticks), progress
 *     POST /me/:taskId                { done } manual tick / untick
 *     GET  /team                      ADMIN+: progress per active staff member
 *
 *   /api/admin/setup-checklist        (mounted ADMIN+)
 *     GET  /                          items with state (auto / manual), detail, mark, progress
 *     POST /:itemId                   { state: 'done' | 'notNeeded' | null, note? } (audited)
 */

const viewer = (req: Request) => ({ id: req.user!.id, role: req.user!.role as string });
const admin = requireMinRole('ADMIN');
const idParam = (v: unknown) => String(v ?? '').slice(0, 60);

// ─── What's new ────────────────────────────────────────────────────────

export const adminWhatsNewRouter = Router();

adminWhatsNewRouter.get('/', async (req, res) => {
  res.json(await feedFor(viewer(req)));
});

adminWhatsNewRouter.post('/seen', async (req, res) => {
  const b = parse(z.union([z.object({ all: z.literal(true) }), z.object({ ids: z.array(z.string().min(1).max(60)).min(1).max(200) })]), req.body ?? {});
  res.json(await markSeen(viewer(req), 'all' in b ? 'all' : b.ids));
});

adminWhatsNewRouter.get('/manage', admin, async (_req, res) => {
  res.json(await manageList());
});

adminWhatsNewRouter.post('/entries', admin, async (req, res) => {
  const input = parse(entryInputSchema, req.body ?? {});
  const row = await createEntry(input, req.user!.id);
  await audit(req, 'WHATS_NEW_ENTRY_CREATED', `whats-new:${row.id}`, { title: input.title.az, roles: input.roles });
  res.status(201).json({ entry: row });
});

adminWhatsNewRouter.patch('/entries/:id', admin, async (req, res) => {
  const input = parse(entryInputSchema.partial(), req.body ?? {});
  const row = await updateEntry(idParam(req.params.id), input);
  await audit(req, 'WHATS_NEW_ENTRY_UPDATED', `whats-new:${row.id}`, { fields: Object.keys(input) });
  res.json({ entry: row });
});

adminWhatsNewRouter.delete('/entries/:id', admin, async (req, res) => {
  const id = idParam(req.params.id);
  await deleteEntry(id);
  await audit(req, 'WHATS_NEW_ENTRY_DELETED', `whats-new:${id}`);
  res.json({ ok: true });
});

adminWhatsNewRouter.post('/entries/:id/hidden', admin, async (req, res) => {
  const { hidden } = parse(z.object({ hidden: z.boolean() }), req.body ?? {});
  const id = idParam(req.params.id);
  await setHidden(id, hidden);
  await audit(req, hidden ? 'WHATS_NEW_ENTRY_HIDDEN' : 'WHATS_NEW_ENTRY_SHOWN', `whats-new:${id}`);
  res.json({ ok: true, hidden });
});

// ─── New staff training checklist ──────────────────────────────────────

export const adminTrainingChecklistRouter = Router();

adminTrainingChecklistRouter.get('/me', async (req, res) => {
  res.json(await myChecklist(req.user!.id));
});

adminTrainingChecklistRouter.post('/me/:taskId', async (req, res) => {
  const { done } = parse(z.object({ done: z.boolean() }), req.body ?? {});
  res.json(await tickTask(req.user!.id, idParam(req.params.taskId), done));
});

adminTrainingChecklistRouter.get('/team', admin, async (_req, res) => {
  res.json(await teamProgress());
});

// ─── Owner setup checklist (ADMIN+, mounted with requireMinRole) ───────

export const adminSetupChecklistRouter = Router();

adminSetupChecklistRouter.get('/', async (_req, res) => {
  res.json(await setupChecklist());
});

adminSetupChecklistRouter.post('/:itemId', async (req, res) => {
  const b = parse(z.object({ state: z.enum(['done', 'notNeeded']).nullable(), note: z.string().trim().max(500).optional().nullable() }), req.body ?? {});
  const u = req.user!;
  const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.email;
  const itemId = idParam(req.params.itemId);
  const result = await markSetupItem(itemId, b.state, b.note || null, { id: u.id, name });
  await audit(req, 'OWNER_SETUP_MARKED', `setup-checklist:${itemId}`, { state: b.state, note: b.note ?? null });
  res.json(result);
});
