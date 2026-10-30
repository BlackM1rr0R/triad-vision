import { Router, type Request } from 'express';
import { z } from 'zod';
import type { ApplicationStatus, CaseStatus, Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { audit } from '../../lib/audit.js';
import { badRequest, conflict, notFound, parse } from '../../lib/http.js';
import { staffCancel, staffConfirmContract, staffMarkLodged, staffReopen, staffRequestChanges, FINAL_STATUSES } from '../../lib/caseFlow.js';
import { moveSchema, moveStage } from '../../lib/caseProcessing/index.js';
import { createCaseMessage } from '../../lib/messaging/caseMessages.js';
import { notifyUser } from '../../lib/notifications.js';
import { renderEmail, sendMail } from '../../lib/mailer.js';
import { licenceCovers, matchCandidate } from '../../lib/matching.js';
import { notifyApplicationStatus, notifyCandidateProposed } from '../../lib/jobsNotifications.js';
import { emitWebhook } from '../../lib/ops/webhooks.js';
import { BULK_MAX, CASE_BULK_ACTION_KEYS, commonCaseActions, renderTemplate, runBatched, summarize, toCsv, type BulkItemResult } from '../../lib/bulk/index.js';
import { caseListQuery, caseListWhere } from './cases.js';
import { candidateListQuery, candidateListWhere } from './candidates.js';

/**
 * Bulk actions of the admin lists (mounted on /api/admin/bulk, STAFF+). Every write returns per-item results
 * ({ id, ok, error }) plus counts, is capped at BULK_MAX items, runs in small parallel batches and leaves one
 * audit entry. A selection is either explicit ids or "all matching" the list filters (cases, candidates).
 *
 *   Cases       POST /cases/resolve | /cases/assign | /cases/restore-assign | /cases/status | /cases/processing
 *               POST /cases/message | /cases/export
 *   Inquiries   POST /inquiries/status | /inquiries/restore-status | /inquiries/message | /inquiries/export
 *   Candidates  POST /candidates/resolve | /candidates/assign | /candidates/status | /candidates/message | /candidates/export
 *
 * Inquiries have no responsible staff field yet (no bulk assign) — that needs Inquiry.assignedStaffId.
 */
export const adminBulkRouter = Router();

const id = z.string().min(1).max(40);
const ids = z.array(id).min(1).max(BULK_MAX);

const selection = <T extends z.ZodTypeAny>(filters: T) =>
  z.object({ ids: ids.optional(), all: filters.optional() }).refine((s) => !!s.ids !== !!s.all, 'IDS_OR_ALL');

const send = async (req: Request, action: string, results: BulkItemResult[], details: Record<string, unknown> = {}) => {
  const c = summarize(results);
  await audit(req, action, undefined, { requested: results.length, ...c, ids: results.slice(0, 50).map((r) => r.id), ...details } as Prisma.InputJsonValue);
  return { results, ...c };
};

const assertStaff = async (staffId: string | null) => {
  if (!staffId) return;
  const staff = await prisma.user.findUnique({ where: { id: staffId }, select: { role: true, isActive: true } });
  if (!staff || !staff.isActive || !['STAFF', 'ADMIN', 'SUPER_ADMIN'].includes(staff.role)) throw badRequest('INVALID_STAFF');
};

const actorOf = async (req: Request) => {
  const a = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { id: true, firstName: true, lastName: true } });
  if (!a) throw notFound('USER_NOT_FOUND');
  return a;
};

// ─── Cases ─────────────────────────────────────────────────────────────

const caseSelection = selection(caseListQuery.omit({ page: true }).partial());

/** Explicit ids (existing ones, order kept) or every case matching the list filters, at most BULK_MAX. */
const resolveCases = async (req: Request, sel: z.infer<typeof caseSelection>) => {
  if (sel.ids) {
    const rows = await prisma.case.findMany({ where: { id: { in: sel.ids } }, select: { id: true, status: true } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return { rows: sel.ids.map((x) => byId.get(x)).filter((r): r is { id: string; status: CaseStatus } => !!r), total: rows.length };
  }
  const where = caseListWhere({ page: 1, ...sel.all! }, req.user!.id);
  const [rows, total] = await Promise.all([
    prisma.case.findMany({ where, orderBy: { updatedAt: 'desc' }, take: BULK_MAX, select: { id: true, status: true } }),
    prisma.case.count({ where }),
  ]);
  return { rows, total };
};

/** Preview of a selection: the ids, the status mix and the workflow actions valid for every case in it. */
adminBulkRouter.post('/cases/resolve', async (req, res) => {
  const sel = parse(caseSelection, req.body ?? {});
  const { rows, total } = await resolveCases(req, sel);
  const statuses: Partial<Record<CaseStatus, number>> = {};
  for (const r of rows) statuses[r.status] = (statuses[r.status] ?? 0) + 1;
  res.json({ ids: rows.map((r) => r.id), total, capped: total > rows.length, max: BULK_MAX, statuses, actions: commonCaseActions(rows.map((r) => r.status)) });
});

adminBulkRouter.post('/cases/assign', async (req, res) => {
  const body = parse(z.object({ selection: caseSelection, staffId: id.nullable() }), req.body ?? {});
  await assertStaff(body.staffId);
  const { rows } = await resolveCases(req, body.selection);
  const before = await prisma.case.findMany({ where: { id: { in: rows.map((r) => r.id) } }, select: { id: true, assignedStaffId: true } });
  const prev = new Map(before.map((b) => [b.id, b.assignedStaffId]));
  const results = await runBatched(rows.map((r) => r.id), async (caseId) => {
    await prisma.case.update({ where: { id: caseId }, data: { assignedStaffId: body.staffId } });
    await prisma.caseEvent.create({ data: { caseId, type: 'CASE_UPDATED', actorId: req.user!.id, visibleToClient: false, note: 'bulk: assignee' } });
  });
  const previous = results.filter((r) => r.ok).map((r) => ({ id: r.id, staffId: prev.get(r.id) ?? null }));
  res.json({ ...(await send(req, 'BULK_CASES_ASSIGNED', results, { staffId: body.staffId })), previous });
});

/** Undo of a bulk assignment: puts every case back to the staff member it had before. */
adminBulkRouter.post('/cases/restore-assign', async (req, res) => {
  const body = parse(z.object({ items: z.array(z.object({ id, staffId: id.nullable() })).min(1).max(BULK_MAX) }), req.body ?? {});
  const staffIds = [...new Set(body.items.map((i) => i.staffId).filter((x): x is string => !!x))];
  const valid = new Set(
    (await prisma.user.findMany({ where: { id: { in: staffIds }, role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] } }, select: { id: true } })).map((u) => u.id),
  );
  const target = new Map(body.items.map((i) => [i.id, i.staffId]));
  const results = await runBatched(body.items.map((i) => i.id), async (caseId) => {
    const staffId = target.get(caseId) ?? null;
    if (staffId && !valid.has(staffId)) throw badRequest('INVALID_STAFF');
    await prisma.case.update({ where: { id: caseId }, data: { assignedStaffId: staffId } });
  });
  res.json(await send(req, 'BULK_CASES_ASSIGN_UNDONE', results));
});

const statusBody = z.object({
  selection: caseSelection,
  action: z.enum(CASE_BULK_ACTION_KEYS as [string, ...string[]]),
  note: z.string().trim().min(3).max(2000).optional(),
  reason: z.string().trim().min(3).max(2000).optional(),
  to: z.enum(['DOCUMENTS_PENDING', 'EMBASSY_DOCUMENTS']).optional(),
});

/**
 * Workflow step for many cases. The action must be valid for every selected case (otherwise 409 with the
 * statuses that do not fit); a case can still fail on its own (four-eyes gate, another active case) — reported per item.
 */
adminBulkRouter.post('/cases/status', async (req, res) => {
  const body = parse(statusBody, req.body ?? {});
  if (body.action === 'REQUEST_CHANGES' && !body.note) throw badRequest('NOTE_REQUIRED');
  if (body.action === 'CANCEL' && !body.reason) throw badRequest('REASON_REQUIRED');
  if (body.action === 'REOPEN' && !body.to) throw badRequest('TARGET_REQUIRED');
  const { rows } = await resolveCases(req, body.selection);
  if (!rows.length) throw badRequest('EMPTY_SELECTION');
  if (!commonCaseActions(rows.map((r) => r.status)).includes(body.action as never)) throw conflict('ACTION_NOT_VALID_FOR_ALL');
  const actor = req.user!.id;
  const results = await runBatched(rows.map((r) => r.id), async (caseId) => {
    switch (body.action) {
      case 'REQUEST_CHANGES':
        return staffRequestChanges(caseId, actor, body.note!);
      case 'CONFIRM_CONTRACT':
        return staffConfirmContract(caseId, actor);
      case 'MARK_LODGED':
        return staffMarkLodged(caseId, actor);
      case 'CANCEL':
        return staffCancel(caseId, actor, body.reason!);
      case 'REOPEN':
        return staffReopen(caseId, actor, body.to!, body.note);
    }
  });
  const from = new Map(rows.map((r) => [r.id, r.status]));
  res.json({ ...(await send(req, 'BULK_CASES_STATUS', results, { action: body.action })), previous: results.filter((r) => r.ok).map((r) => ({ id: r.id, status: from.get(r.id) })) });
});

adminBulkRouter.post('/cases/processing', async (req, res) => {
  const body = parse(z.object({ selection: caseSelection }).merge(moveSchema), req.body ?? {});
  const actor = await actorOf(req);
  const { rows } = await resolveCases(req, body.selection);
  const results = await runBatched(rows.map((r) => r.id), async (caseId) => {
    await moveStage(caseId, actor, { stage: body.stage, assigneeId: body.assigneeId, note: body.note });
  });
  res.json(await send(req, 'BULK_CASES_PROCESSING', results, { stage: body.stage, assigneeId: body.assigneeId ?? null }));
});

const messageBody = z.string().trim().min(1).max(4000);

/** One chat message per case (client gets the usual "new message" notification); {{variables}} filled per case. */
adminBulkRouter.post('/cases/message', async (req, res) => {
  const body = parse(z.object({ selection: caseSelection, body: messageBody }), req.body ?? {});
  const actor = await actorOf(req);
  const { rows } = await resolveCases(req, body.selection);
  const cases = await prisma.case.findMany({
    where: { id: { in: rows.map((r) => r.id) } },
    select: { id: true, number: true, profession: true, client: { select: { firstName: true, lastName: true } }, company: { select: { name: true } } },
  });
  const byId = new Map(cases.map((c) => [c.id, c]));
  const staffName = `${actor.firstName} ${actor.lastName}`.trim();
  const results = await runBatched(rows.map((r) => r.id), async (caseId) => {
    const c = byId.get(caseId)!;
    const text = renderTemplate(body.body, {
      firstName: c.client.firstName,
      lastName: c.client.lastName,
      fullName: `${c.client.firstName} ${c.client.lastName}`.trim(),
      caseNumber: c.number,
      profession: c.profession,
      companyName: c.company?.name,
      staffName,
    }).trim();
    if (!text) throw badRequest('EMPTY_MESSAGE');
    await createCaseMessage({ caseId, authorId: actor.id, body: text, side: 'staff' });
  }, 5);
  res.json(await send(req, 'BULK_CASES_MESSAGED', results));
});

const csvResponse = (res: import('express').Response, name: string, csv: string) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
};

adminBulkRouter.post('/cases/export', async (req, res) => {
  const body = parse(z.object({ selection: caseSelection }), req.body ?? {});
  const { rows } = await resolveCases(req, body.selection);
  const cases = await prisma.case.findMany({
    where: { id: { in: rows.map((r) => r.id) } },
    orderBy: { updatedAt: 'desc' },
    select: {
      number: true, status: true, processingStage: true, profession: true, visaType: true, createdAt: true, updatedAt: true,
      client: { select: { firstName: true, lastName: true, email: true, phone: true } },
      assignedStaff: { select: { firstName: true, lastName: true } },
      visaCategory: { select: { visaLabel: true } },
      partner: { select: { name: true } },
    },
  });
  await audit(req, 'BULK_CASES_EXPORTED', undefined, { count: cases.length });
  csvResponse(
    res,
    'cases',
    toCsv(
      ['number', 'client', 'email', 'phone', 'profession', 'visa', 'status', 'processing', 'staff', 'partner', 'created', 'updated'],
      cases.map((c) => [
        c.number, `${c.client.firstName} ${c.client.lastName}`, c.client.email, c.client.phone, c.profession, c.visaCategory?.visaLabel ?? c.visaType, c.status,
        c.processingStage ?? '', c.assignedStaff ? `${c.assignedStaff.firstName} ${c.assignedStaff.lastName}` : '', c.partner?.name ?? '', c.createdAt, c.updatedAt,
      ]),
    ),
  );
});

// ─── Inquiries ─────────────────────────────────────────────────────────

const INQUIRY_STATUSES = ['NEW', 'IN_PROGRESS', 'DONE', 'ARCHIVED'] as const;

adminBulkRouter.post('/inquiries/status', async (req, res) => {
  const body = parse(z.object({ ids, status: z.enum(INQUIRY_STATUSES) }), req.body ?? {});
  const before = await prisma.inquiry.findMany({ where: { id: { in: body.ids } }, select: { id: true, status: true } });
  const prev = new Map(before.map((b) => [b.id, b.status]));
  const results = await runBatched(body.ids, async (inquiryId) => {
    if (!prev.has(inquiryId)) throw notFound('INQUIRY_NOT_FOUND');
    await prisma.inquiry.update({ where: { id: inquiryId }, data: { status: body.status } });
  });
  res.json({ ...(await send(req, 'BULK_INQUIRIES_STATUS', results, { status: body.status })), previous: results.filter((r) => r.ok).map((r) => ({ id: r.id, status: prev.get(r.id)! })) });
});

/** Undo of a bulk / inline status change: every inquiry back to its own previous status. */
adminBulkRouter.post('/inquiries/restore-status', async (req, res) => {
  const body = parse(z.object({ items: z.array(z.object({ id, status: z.enum(INQUIRY_STATUSES) })).min(1).max(BULK_MAX) }), req.body ?? {});
  const to = new Map(body.items.map((i) => [i.id, i.status]));
  const results = await runBatched(body.items.map((i) => i.id), async (inquiryId) => {
    await prisma.inquiry.update({ where: { id: inquiryId }, data: { status: to.get(inquiryId)! } });
  });
  res.json(await send(req, 'BULK_INQUIRIES_STATUS_UNDONE', results));
});

/** E-mail to each inquiry's contact (subject + body with {{contactName}} / {{companyName}} / {{staffName}}). */
adminBulkRouter.post('/inquiries/message', async (req, res) => {
  const body = parse(z.object({ ids, subject: z.string().trim().min(1).max(200), body: messageBody }), req.body ?? {});
  const actor = await actorOf(req);
  const rows = await prisma.inquiry.findMany({ where: { id: { in: body.ids } }, select: { id: true, email: true, contactName: true, companyName: true } });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const staffName = `${actor.firstName} ${actor.lastName}`.trim();
  const results = await runBatched(body.ids, async (inquiryId) => {
    const i = byId.get(inquiryId);
    if (!i) throw notFound('INQUIRY_NOT_FOUND');
    const vars = { contactName: i.contactName, fullName: i.contactName, companyName: i.companyName, staffName };
    const subject = renderTemplate(body.subject, vars).trim();
    const text = renderTemplate(body.body, vars).trim();
    if (!text || !subject) throw badRequest('EMPTY_MESSAGE');
    await sendMail(i.email, subject, renderEmail(subject, text));
  }, 5);
  res.json(await send(req, 'BULK_INQUIRIES_MESSAGED', results));
});

adminBulkRouter.post('/inquiries/export', async (req, res) => {
  const body = parse(z.object({ ids }), req.body ?? {});
  const rows = await prisma.inquiry.findMany({ where: { id: { in: body.ids } }, orderBy: { createdAt: 'desc' } });
  await audit(req, 'BULK_INQUIRIES_EXPORTED', undefined, { count: rows.length });
  csvResponse(
    res,
    'inquiries',
    toCsv(
      ['created', 'kind', 'status', 'company', 'contact', 'email', 'phone', 'sector', 'workers', 'score', 'level', 'message'],
      rows.map((i) => [i.createdAt, i.kind, i.status, i.companyName, i.contactName, i.email, i.phone, i.sector, i.workersNeeded, i.score, i.scoreLevel, i.message]),
    ),
  );
});

// ─── Candidates ────────────────────────────────────────────────────────

const candidateSelection = selection(candidateListQuery.omit({ page: true }).partial());

const resolveCandidates = async (sel: z.infer<typeof candidateSelection>) => {
  if (sel.ids) {
    const rows = await prisma.user.findMany({ where: { id: { in: sel.ids }, role: 'CLIENT' }, select: { id: true } });
    const ok = new Set(rows.map((r) => r.id));
    const list = sel.ids.filter((x) => ok.has(x));
    return { ids: list, total: list.length };
  }
  const q = { page: 1, ...sel.all! };
  const where = candidateListWhere(q);
  if (q.licence) {
    const rows = await prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, take: 3000, select: { id: true, drivingLicence: true } });
    const hit = rows.filter((r) => licenceCovers(r.drivingLicence, q.licence));
    return { ids: hit.slice(0, BULK_MAX).map((r) => r.id), total: hit.length };
  }
  const [rows, total] = await Promise.all([
    prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, take: BULK_MAX, select: { id: true } }),
    prisma.user.count({ where }),
  ]);
  return { ids: rows.map((r) => r.id), total };
};

adminBulkRouter.post('/candidates/resolve', async (req, res) => {
  const sel = parse(candidateSelection, req.body ?? {});
  const r = await resolveCandidates(sel);
  res.json({ ...r, capped: r.total > r.ids.length, max: BULK_MAX });
});

/** Responsible staff of each candidate's active visa case (candidates without one are reported as NO_ACTIVE_CASE). */
adminBulkRouter.post('/candidates/assign', async (req, res) => {
  const body = parse(z.object({ selection: candidateSelection, staffId: id.nullable() }), req.body ?? {});
  await assertStaff(body.staffId);
  const { ids: userIds } = await resolveCandidates(body.selection);
  const cases = await prisma.case.findMany({
    where: { clientId: { in: userIds }, status: { notIn: FINAL_STATUSES } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, clientId: true, assignedStaffId: true },
  });
  const caseOf = new Map<string, (typeof cases)[number]>();
  for (const c of cases) if (!caseOf.has(c.clientId)) caseOf.set(c.clientId, c);
  const results = await runBatched(userIds, async (userId) => {
    const c = caseOf.get(userId);
    if (!c) throw conflict('NO_ACTIVE_CASE');
    await prisma.case.update({ where: { id: c.id }, data: { assignedStaffId: body.staffId } });
    await prisma.caseEvent.create({ data: { caseId: c.id, type: 'CASE_UPDATED', actorId: req.user!.id, visibleToClient: false, note: 'bulk: assignee' } });
  });
  // Undo goes through /cases/restore-assign (the previous assignee per case).
  const previous = results.filter((r) => r.ok).map((r) => ({ id: caseOf.get(r.id)!.id, staffId: caseOf.get(r.id)!.assignedStaffId }));
  res.json({ ...(await send(req, 'BULK_CANDIDATES_ASSIGNED', results, { staffId: body.staffId })), previous });
});

const APP_STATUSES = ['NEW', 'SHORTLISTED', 'PROPOSED', 'INTERVIEW', 'ACCEPTED', 'REJECTED'] as const;

/** Application status for one vacancy (the list ranked for that vacancy); candidates without an application fail. */
adminBulkRouter.post('/candidates/status', async (req, res) => {
  const body = parse(z.object({ selection: candidateSelection, vacancyId: id, status: z.enum(APP_STATUSES), message: z.string().trim().max(2000).optional() }), req.body ?? {});
  const vacancy = await prisma.vacancy.findUnique({
    where: { id: body.vacancyId },
    include: { visaCategory: { select: { visaLabel: true, germanLevel: true } }, company: { select: { status: true } } },
  });
  if (!vacancy) throw badRequest('INVALID_VACANCY');
  if (body.status === 'PROPOSED' && vacancy.companyId && vacancy.company?.status !== 'ACTIVE') throw conflict('COMPANY_NOT_ACTIVE');
  const { ids: userIds } = await resolveCandidates(body.selection);
  const apps = await prisma.vacancyApplication.findMany({ where: { vacancyId: vacancy.id, userId: { in: userIds } }, include: { user: true } });
  const appOf = new Map(apps.map((a) => [a.userId, a]));
  let proposed = 0;
  const results = await runBatched(userIds, async (userId) => {
    const app = appOf.get(userId);
    if (!app) throw conflict('NO_APPLICATION');
    if (app.status === 'WITHDRAWN') throw conflict('APPLICATION_WITHDRAWN');
    if (app.status === body.status) return;
    await prisma.vacancyApplication.update({
      where: { id: app.id },
      data: { status: body.status, matchScore: matchCandidate(app.user, vacancy).score, ...(body.status === 'PROPOSED' ? { companyNote: null } : {}) },
    });
    if (body.status === 'PROPOSED') proposed++;
    await notifyApplicationStatus(app.userId, vacancy, body.status as ApplicationStatus, body.message);
    await emitWebhook('application.status_changed', { id: app.id, vacancyId: vacancy.id, from: app.status, to: body.status, by: 'staff' }, vacancy.companyId);
  });
  if (proposed) await notifyCandidateProposed(vacancy);
  res.json(await send(req, 'BULK_APPLICATIONS_STATUS', results, { vacancyId: vacancy.id, status: body.status }));
});

/** In-app notification (+ e-mail / push per the candidate's settings) with {{firstName}} / {{lastName}} / {{staffName}}. */
adminBulkRouter.post('/candidates/message', async (req, res) => {
  const body = parse(z.object({ selection: candidateSelection, title: z.string().trim().min(1).max(160), body: messageBody }), req.body ?? {});
  const actor = await actorOf(req);
  const { ids: userIds } = await resolveCandidates(body.selection);
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true, profession: true } });
  const byId = new Map(users.map((u) => [u.id, u]));
  const staffName = `${actor.firstName} ${actor.lastName}`.trim();
  const results = await runBatched(userIds, async (userId) => {
    const u = byId.get(userId)!;
    const vars = { firstName: u.firstName, lastName: u.lastName, fullName: `${u.firstName} ${u.lastName}`.trim(), profession: u.profession, staffName };
    const title = renderTemplate(body.title, vars).trim();
    const text = renderTemplate(body.body, vars).trim();
    if (!title || !text) throw badRequest('EMPTY_MESSAGE');
    await notifyUser(userId, { type: 'STAFF_MESSAGE', title, body: text, link: '/account' });
  }, 5);
  res.json(await send(req, 'BULK_CANDIDATES_MESSAGED', results));
});

adminBulkRouter.post('/candidates/export', async (req, res) => {
  const body = parse(z.object({ selection: candidateSelection }), req.body ?? {});
  const { ids: userIds } = await resolveCandidates(body.selection);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    orderBy: { createdAt: 'desc' },
    select: {
      firstName: true, lastName: true, email: true, phone: true, city: true, profession: true, germanLevel: true, experienceYears: true,
      drivingLicence: true, education: true, createdAt: true, emailVerifiedAt: true,
      cases: { where: { status: { notIn: FINAL_STATUSES } }, select: { number: true, status: true }, take: 1, orderBy: { createdAt: 'desc' } },
    },
  });
  await audit(req, 'BULK_CANDIDATES_EXPORTED', undefined, { count: users.length });
  csvResponse(
    res,
    'candidates',
    toCsv(
      ['name', 'email', 'phone', 'city', 'profession', 'german', 'experience', 'licence', 'education', 'verified', 'case', 'caseStatus', 'registered'],
      users.map((u) => [
        `${u.firstName} ${u.lastName}`, u.email, u.phone, u.city, u.profession, u.germanLevel, u.experienceYears, u.drivingLicence, u.education,
        u.emailVerifiedAt ? 'yes' : 'no', u.cases[0]?.number ?? '', u.cases[0]?.status ?? '', u.createdAt,
      ]),
    ),
  );
});
