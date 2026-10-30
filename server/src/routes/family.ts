import { Router } from 'express';
import { prisma } from '../db.js';
import { isStaff, requireAuth, type AuthUser } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { forbidden, notFound, parse } from '../lib/http.js';
import { notifyStaff } from '../lib/notifications.js';
import { addFamilyMember, removeFamilyMember } from '../lib/journey/family.js';
import { assertCanAdd, createMemberSchema, ensureProfile, familyOverview, loadMemberCase, rootCaseId, serializeProfile, updateMemberSchema, updateProfile } from '../lib/family/members.js';
import { copyForAllMembers, startReunion } from '../lib/family/reunion.js';
import { reunionInfoSchema, saveReunionInfo, WAITING_STAGES, waitingFamilies, type WaitingStage } from '../lib/family/readiness.js';

/**
 * Family members (Familiennachzug) — mounted at /api/family. The main client manages their family from
 * the portal / the app, staff from the admin case page (same endpoints):
 *
 *   GET    /cases/:id                 group of a case (main or member): members with details + checklists
 *   POST   /cases/:id/members         add a member (creates the member case with its relation's checklist)
 *   PATCH  /members/:caseId           edit a member's details (names as in passport, passport data …)
 *   DELETE /members/:caseId           remove a member case created by mistake (nothing uploaded yet)
 *   POST   /cases/:id/reunion/start   STAFF+: start the Familiennachzug of the LATER members (lib/family/reunion.ts)
 *   POST   /cases/:id/copy-documents  STAFF+: copy reusable main-case documents into every member case again
 *   PUT    /cases/:id/reunion/info    main applicant's title / flat / income for the readiness check (lib/family/readiness.ts)
 *   GET    /reunion/waiting           STAFF+: families with members joining later (?stage=waiting|ready|active|all)
 *
 * Access: the client who owns the case, or STAFF+. Passport fields are masked for staff by maskResponses.
 */
export const familyRouter = Router();
familyRouter.use(requireAuth);

const accessible = async (caseId: string, user: AuthUser) => {
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, clientId: true, parentCaseId: true } });
  if (!c || (c.clientId !== user.id && !isStaff(user))) throw notFound('CASE_NOT_FOUND');
  return c;
};

/** Clients act only as CLIENT (employers / agents never own visa cases). */
const assertActor = (user: AuthUser, ownerId: string) => {
  if (isStaff(user)) return true;
  if (user.role !== 'CLIENT' || user.id !== ownerId) throw forbidden();
  return false;
};

familyRouter.get('/cases/:id', async (req, res) => {
  const c = await accessible(String(req.params.id), req.user!);
  res.json(await familyOverview(c.id));
});

familyRouter.post('/cases/:id/members', async (req, res) => {
  const c = await accessible(String(req.params.id), req.user!);
  const staff = assertActor(req.user!, c.clientId);
  const body = parse(createMemberSchema, req.body ?? {});
  const main = await assertCanAdd(c.id, !staff);
  const created = await addFamilyMember(main.id, req.user!.id, { ...body, email: body.email || null });
  await audit(req, 'FAMILY_MEMBER_ADDED', `case:${created.id}`, { parentCaseId: main.id, relation: body.relation, by: staff ? 'staff' : 'client' });
  if (!staff) {
    await notifyStaff(`Ailə üzvü əlavə edildi: ${created.number}`, `Müştəri portalda ailə üzvü əlavə etdi: ${body.firstName} ${body.lastName} (${body.relation}).`, { caseId: created.id, link: `/admin/cases/${main.id}` }).catch(() => undefined);
  }
  res.status(201).json({ memberCaseId: created.id, number: created.number, ...(await familyOverview(main.id)) });
});

familyRouter.patch('/members/:caseId', async (req, res) => {
  const m = await loadMemberCase(String(req.params.caseId));
  await accessible(m.id, req.user!);
  const staff = assertActor(req.user!, m.clientId);
  const body = parse(updateMemberSchema, req.body ?? {});
  const { profile, changed } = await updateProfile(m.id, body, { id: req.user!.id, staff });
  // Field names only: the values (passport data) never go into the audit log.
  if (changed.length) await audit(req, 'FAMILY_MEMBER_UPDATED', `case:${m.id}`, { parentCaseId: m.parentCaseId, fields: changed });
  res.json({ profile: serializeProfile(profile), ...(await familyOverview(m.parentCaseId)) });
});

familyRouter.delete('/members/:caseId', async (req, res) => {
  const m = await loadMemberCase(String(req.params.caseId));
  await accessible(m.id, req.user!);
  assertActor(req.user!, m.clientId);
  await removeFamilyMember(m.parentCaseId, m.id);
  await audit(req, 'FAMILY_MEMBER_REMOVED', `case:${m.id}`, { parentCaseId: m.parentCaseId });
  res.json({ ok: true, ...(await familyOverview(m.parentCaseId)) });
});

/** One member's details (e.g. the member case page shows "who is this case for"). */
familyRouter.get('/members/:caseId', async (req, res) => {
  const m = await loadMemberCase(String(req.params.caseId));
  await accessible(m.id, req.user!);
  const profile = await ensureProfile(m.id);
  if (!profile) throw notFound('FAMILY_MEMBER_NOT_FOUND');
  res.json({ profile: serializeProfile(profile), mainCaseId: await rootCaseId(m.id) });
});

familyRouter.post('/cases/:id/reunion/start', async (req, res) => {
  if (!isStaff(req.user!)) throw forbidden();
  const mainId = await rootCaseId((await accessible(String(req.params.id), req.user!)).id);
  const out = await startReunion(mainId, req.user!.id);
  await audit(req, 'FAMILY_REUNION_STARTED', `case:${mainId}`, { members: out.started.map((m) => m.caseId), copied: out.started.reduce((a, m) => a + m.copied, 0) });
  res.json({ ...out, ...(await familyOverview(mainId)) });
});

familyRouter.post('/cases/:id/copy-documents', async (req, res) => {
  if (!isStaff(req.user!)) throw forbidden();
  const mainId = await rootCaseId((await accessible(String(req.params.id), req.user!)).id);
  const copied = await copyForAllMembers(mainId, req.user!.id);
  await audit(req, 'FAMILY_DOCS_COPIED', `case:${mainId}`, { copied: copied.filter((c) => c.copied).map((c) => ({ caseId: c.caseId, n: c.copied })) });
  res.json({ copied, ...(await familyOverview(mainId)) });
});

familyRouter.put('/cases/:id/reunion/info', async (req, res) => {
  const c = await accessible(String(req.params.id), req.user!);
  assertActor(req.user!, c.clientId);
  const body = parse(reunionInfoSchema, req.body ?? {});
  const mainId = await rootCaseId(c.id);
  const fields = await saveReunionInfo(mainId, body, req.user!.id);
  // Field names only: income and rent stay out of the audit log.
  await audit(req, 'FAMILY_REUNION_INFO_UPDATED', `case:${mainId}`, { fields });
  res.json(await familyOverview(mainId));
});

familyRouter.get('/reunion/waiting', async (req, res) => {
  if (!isStaff(req.user!)) throw forbidden();
  const q = String(req.query.stage ?? 'all');
  const stage: WaitingStage = (WAITING_STAGES as readonly string[]).includes(q) ? (q as WaitingStage) : 'all';
  res.json(await waitingFamilies(stage));
});
