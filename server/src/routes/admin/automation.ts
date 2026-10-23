import { Router } from 'express';
import { z } from 'zod';
import type { Locale, Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { audit } from '../../lib/audit.js';
import { badRequest, notFound, parse } from '../../lib/http.js';
import { requireMinRole } from '../../middleware/auth.js';
import { NOTIFICATION_TYPES } from '../../lib/notifications.js';
import { invalidateAutomationCache } from '../../lib/automation/events.js';
import { ensureExampleRules } from '../../lib/automation/examples.js';
import { dryRunRule } from '../../lib/automation/dryRun.js';
import { PLACEHOLDER_KEYS, unknownPlaceholders } from '../../lib/automation/placeholders.js';
import {
  ACTION_TYPES,
  AUTOMATION_TRANSITIONS,
  CONDITION_TYPES,
  parseStoredRule,
  ruleInputSchema,
  TRIGGER_TYPES,
  type RuleInput,
} from '../../lib/automation/schema.js';
import {
  applyMoves,
  assignmentConfigSchema,
  loadOverview,
  normalizeConfig,
  prefsSchema,
  readPrefs,
  savePrefs,
  AUTO_ASSIGN_KEY,
} from '../../lib/assignment/index.js';
import { runHandovers } from '../../lib/assignment/handover.js';

/**
 * Admin → Automation ("Avtomatlaşdırma"), mounted at /api/admin/automation (ADMIN+):
 *   GET    /meta                       triggers, conditions, actions, placeholders, picker data
 *   GET    /rules                      rules with run counts (ships the 5 disabled example rules once)
 *   POST   /rules                      create · GET/PUT/DELETE /rules/:id · PATCH /rules/:id/enabled
 *   POST   /rules/:id/test             dry run on a case { caseId?, entityId? } · POST /test { rule, caseId? } (unsaved)
 *   GET    /rules/:id/runs             run log (succeeded / skipped / failed with reason, steps)
 *
 * Automatic assignment, mounted at /api/admin/assignment:
 *   GET/PUT /me                        own preferences (STAFF+)
 *   GET    /                           config, per-staff load + preferences, unassigned count, rebalance suggestion (ADMIN+)
 *   PUT    /config                     strategy + eligibility filters (ADMIN+)
 *   PUT    /staff/:userId/prefs        a staff member's preferences (ADMIN+)
 *   POST   /rebalance                  apply suggested moves (ADMIN+)
 *   GET    /handovers · POST /handovers/run   absence handovers (ADMIN+)
 */
export const adminAutomationRouter = Router();
adminAutomationRouter.use(requireMinRole('ADMIN'));

const localeOf = (l: string | undefined): Locale => (l === 'de' || l === 'en' || l === 'ru' ? l : 'az');

/** Save-time checks the schema cannot express (placeholders, referenced users exist). */
const validateRule = async (r: RuleInput) => {
  const texts: string[] = [];
  const staffIds: string[] = [];
  for (const a of r.actions) {
    if (a.type === 'CREATE_TASK') {
      texts.push(a.title, a.description ?? '');
      if (a.assignee.kind === 'USER') staffIds.push(a.assignee.userId);
    }
    if (a.type === 'NOTIFY_STAFF') {
      texts.push(a.title, a.body);
      if (a.target.kind === 'USER') staffIds.push(a.target.userId);
    }
    if (a.type === 'SEND_CLIENT_MESSAGE' && a.message.kind === 'CUSTOM') {
      texts.push(...Object.values(a.message.title), ...Object.values(a.message.body));
      if (!Object.values(a.message.body).some((s) => s.trim()) && !Object.values(a.message.title).some((s) => s.trim())) throw badRequest('MESSAGE_REQUIRED');
    }
    if (a.type === 'CHANGE_STATUS') texts.push(a.note);
    if (a.type === 'ADD_NOTE') texts.push(a.text);
    if (a.type === 'REQUEST_DOCUMENT' && !Object.values(a.title).some((s) => s.trim())) throw badRequest('TITLE_REQUIRED');
    if (a.type === 'ASSIGN' && a.mode === 'USER') {
      if (!a.userId) throw badRequest('ASSIGNEE_REQUIRED');
      staffIds.push(a.userId);
    }
  }
  const unknown = [...new Set(texts.flatMap(unknownPlaceholders))];
  if (unknown.length) throw badRequest('UNKNOWN_PLACEHOLDER', unknown.join(','));
  for (const c of r.conditions) if (c.type === 'ASSIGNED_STAFF' && (c.op === 'is' || c.op === 'is_not') && !c.values.length) throw badRequest('VALUES_REQUIRED');
  for (const c of r.conditions) if (c.type === 'COMPANY' && (c.op === 'in' || c.op === 'not_in') && !c.values.length) throw badRequest('VALUES_REQUIRED');
  const ids = [...new Set(staffIds)];
  if (ids.length) {
    const n = await prisma.user.count({ where: { id: { in: ids }, isActive: true, role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] } } });
    if (n !== ids.length) throw badRequest('INVALID_STAFF');
  }
};

const ruleData = (r: RuleInput) => ({
  name: r.name,
  description: r.description?.trim() || null,
  triggerType: r.trigger.type,
  trigger: r.trigger as Prisma.InputJsonValue,
  conditions: r.conditions as Prisma.InputJsonValue,
  actions: r.actions as unknown as Prisma.InputJsonValue,
});

const DAY = 86_400_000;

const ruleView = (r: Prisma.AutomationRuleGetPayload<object>, stats?: Record<string, number>) => {
  const parsed = parseStoredRule(r);
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    enabled: r.enabled,
    triggerType: r.triggerType,
    trigger: parsed?.trigger ?? r.trigger,
    conditions: parsed?.conditions ?? r.conditions,
    actions: parsed?.actions ?? r.actions,
    valid: !!parsed,
    exampleKey: r.exampleKey,
    runCount: r.runCount,
    lastRunAt: r.lastRunAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    stats30d: stats ?? {},
  };
};

adminAutomationRouter.get('/meta', async (_req, res) => {
  const [staff, categories, companies, templates] = await Promise.all([
    prisma.user.findMany({ where: { isActive: true, role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] } }, select: { id: true, firstName: true, lastName: true, role: true }, orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }] }),
    prisma.visaCategory.findMany({ select: { id: true, title: true, visaLabel: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.company.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 500 }),
    prisma.requirementTemplate.findMany({ where: { key: { not: null } }, select: { key: true, title: true, stage: true }, orderBy: [{ sortOrder: 'asc' }] }),
  ]);
  const requirements = [...new Map(templates.map((t) => [t.key as string, { key: t.key as string, title: t.title, stage: t.stage }])).values()];
  res.json({
    triggers: TRIGGER_TYPES,
    conditions: CONDITION_TYPES,
    actions: ACTION_TYPES,
    placeholders: PLACEHOLDER_KEYS,
    notificationTemplates: NOTIFICATION_TYPES,
    transitions: AUTOMATION_TRANSITIONS,
    staff,
    visaCategories: categories,
    companies,
    requirements,
  });
});

adminAutomationRouter.get('/rules', async (req, res) => {
  await ensureExampleRules(localeOf(req.user!.locale), req.user!.id);
  const rules = await prisma.automationRule.findMany({ orderBy: [{ enabled: 'desc' }, { createdAt: 'asc' }] });
  const grouped = await prisma.automationRun.groupBy({ by: ['ruleId', 'status'], where: { createdAt: { gte: new Date(Date.now() - 30 * DAY) } }, _count: { _all: true } });
  const stats = new Map<string, Record<string, number>>();
  for (const g of grouped) stats.set(g.ruleId, { ...(stats.get(g.ruleId) ?? {}), [g.status]: g._count._all });
  res.json({ rules: rules.map((r) => ruleView(r, stats.get(r.id))) });
});

adminAutomationRouter.post('/rules', async (req, res) => {
  const body = parse(ruleInputSchema, req.body);
  await validateRule(body);
  const rule = await prisma.automationRule.create({ data: { ...ruleData(body), enabled: body.enabled ?? false, createdById: req.user!.id, updatedById: req.user!.id } });
  invalidateAutomationCache();
  await audit(req, 'AUTOMATION_RULE_CREATED', rule.id, { name: rule.name, trigger: rule.triggerType, enabled: rule.enabled });
  res.status(201).json({ rule: ruleView(rule) });
});

const loadRule = async (id: string) => {
  const r = await prisma.automationRule.findUnique({ where: { id } });
  if (!r) throw notFound('RULE_NOT_FOUND');
  return r;
};

adminAutomationRouter.get('/rules/:id', async (req, res) => {
  res.json({ rule: ruleView(await loadRule(req.params.id)) });
});

adminAutomationRouter.put('/rules/:id', async (req, res) => {
  const existing = await loadRule(req.params.id);
  const body = parse(ruleInputSchema, req.body);
  await validateRule(body);
  const rule = await prisma.automationRule.update({ where: { id: existing.id }, data: { ...ruleData(body), ...(body.enabled !== undefined ? { enabled: body.enabled } : {}), updatedById: req.user!.id } });
  invalidateAutomationCache();
  await audit(req, 'AUTOMATION_RULE_UPDATED', rule.id, { name: rule.name, trigger: rule.triggerType, enabled: rule.enabled });
  res.json({ rule: ruleView(rule) });
});

adminAutomationRouter.patch('/rules/:id/enabled', async (req, res) => {
  const { enabled } = parse(z.object({ enabled: z.boolean() }), req.body);
  const existing = await loadRule(req.params.id);
  if (enabled && !parseStoredRule(existing)) throw badRequest('INVALID_RULE');
  const rule = await prisma.automationRule.update({ where: { id: existing.id }, data: { enabled, updatedById: req.user!.id } });
  invalidateAutomationCache();
  await audit(req, enabled ? 'AUTOMATION_RULE_ENABLED' : 'AUTOMATION_RULE_DISABLED', rule.id, { name: rule.name });
  res.json({ rule: ruleView(rule) });
});

adminAutomationRouter.delete('/rules/:id', async (req, res) => {
  const existing = await loadRule(req.params.id);
  await prisma.automationRule.delete({ where: { id: existing.id } });
  invalidateAutomationCache();
  await audit(req, 'AUTOMATION_RULE_DELETED', existing.id, { name: existing.name });
  res.json({ ok: true });
});

const testTarget = z.object({ caseId: z.string().trim().min(1).max(40).optional(), entityId: z.string().trim().min(1).max(40).optional() });

adminAutomationRouter.post('/rules/:id/test', async (req, res) => {
  const r = await loadRule(req.params.id);
  const parsed = parseStoredRule(r);
  if (!parsed) throw badRequest('INVALID_RULE');
  const target = parse(testTarget, req.body ?? {});
  const result = await dryRunRule({ ...parsed, id: r.id, name: r.name, description: r.description, createdById: r.createdById, updatedById: r.updatedById }, target);
  await audit(req, 'AUTOMATION_DRY_RUN', r.id, { caseId: target.caseId ?? null, matched: result.matched });
  res.json(result);
});

adminAutomationRouter.post('/test', async (req, res) => {
  const body = parse(testTarget.extend({ rule: ruleInputSchema }), req.body);
  await validateRule(body.rule);
  const result = await dryRunRule({ ...body.rule, createdById: req.user!.id, updatedById: req.user!.id }, body);
  await audit(req, 'AUTOMATION_DRY_RUN', 'draft', { caseId: body.caseId ?? null, matched: result.matched });
  res.json(result);
});

adminAutomationRouter.get('/rules/:id/runs', async (req, res) => {
  const r = await loadRule(req.params.id);
  const q = parse(z.object({ status: z.enum(['RUNNING', 'WAITING', 'SUCCEEDED', 'PARTIAL', 'SKIPPED', 'FAILED']).optional(), page: z.coerce.number().int().min(1).max(1000).default(1) }), req.query);
  const where: Prisma.AutomationRunWhereInput = { ruleId: r.id, ...(q.status ? { status: q.status } : {}) };
  const [total, runs] = await Promise.all([
    prisma.automationRun.count({ where }),
    prisma.automationRun.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * 50,
      take: 50,
      include: { steps: { orderBy: { index: 'asc' }, select: { index: true, actionType: true, status: true, runAt: true, executedAt: true, reason: true, onlyIfStillTrue: true, result: true } } },
    }),
  ]);
  const caseIds = [...new Set(runs.map((x) => x.caseId).filter((x): x is string => !!x))];
  const cases = new Map((await prisma.case.findMany({ where: { id: { in: caseIds } }, select: { id: true, number: true } })).map((c) => [c.id, c.number]));
  res.json({
    total,
    page: q.page,
    runs: runs.map((x) => ({
      id: x.id,
      status: x.status,
      reason: x.reason,
      triggerType: x.triggerType,
      entityType: x.entityType,
      entityId: x.entityId,
      caseId: x.caseId,
      caseNumber: x.caseId ? cases.get(x.caseId) ?? null : null,
      depth: x.depth,
      createdAt: x.createdAt,
      finishedAt: x.finishedAt,
      steps: x.steps,
    })),
  });
});

// ─── Automatic assignment ───────────────────────────────────────────────

export const adminAssignmentRouter = Router();
const adminOnly = requireMinRole('ADMIN');

adminAssignmentRouter.get('/me', async (req, res) => {
  res.json({ prefs: (await readPrefs([req.user!.id])).get(req.user!.id) });
});

adminAssignmentRouter.put('/me', async (req, res) => {
  const body = parse(prefsSchema, req.body);
  const prefs = await savePrefs(req.user!.id, body);
  await audit(req, 'ASSIGNMENT_PREFS_UPDATED', req.user!.id, { self: true, ...body });
  res.json({ prefs });
});

adminAssignmentRouter.get('/', adminOnly, async (_req, res) => {
  const [overview, handovers] = await Promise.all([loadOverview(), prisma.caseHandover.count({ where: { status: 'ACTIVE' } })]);
  res.json({ ...overview, activeHandovers: handovers });
});

adminAssignmentRouter.put('/config', adminOnly, async (req, res) => {
  const body = parse(assignmentConfigSchema, req.body);
  if (body.staffIds?.length) {
    const n = await prisma.user.count({ where: { id: { in: body.staffIds }, role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] } } });
    if (n !== new Set(body.staffIds).size) throw badRequest('INVALID_STAFF');
  }
  const value = normalizeConfig(body);
  await prisma.setting.upsert({ where: { key: AUTO_ASSIGN_KEY }, create: { key: AUTO_ASSIGN_KEY, value: value as unknown as Prisma.InputJsonValue }, update: { value: value as unknown as Prisma.InputJsonValue } });
  await audit(req, 'ASSIGNMENT_SETTINGS_UPDATED', `setting:${AUTO_ASSIGN_KEY}`, { mode: value.mode, handover: value.handover, inquiries: value.inquiries });
  res.json({ config: value });
});

adminAssignmentRouter.put('/staff/:userId/prefs', adminOnly, async (req, res) => {
  const u = await prisma.user.findUnique({ where: { id: String(req.params.userId) }, select: { id: true, role: true } });
  if (!u || !['STAFF', 'ADMIN', 'SUPER_ADMIN'].includes(u.role)) throw notFound('STAFF_NOT_FOUND');
  const body = parse(prefsSchema, req.body);
  const prefs = await savePrefs(u.id, body);
  await audit(req, 'ASSIGNMENT_PREFS_UPDATED', u.id, body);
  res.json({ prefs });
});

adminAssignmentRouter.post('/rebalance', adminOnly, async (req, res) => {
  const { moves } = parse(
    z.object({ moves: z.array(z.object({ caseId: z.string().min(1).max(40), fromId: z.string().min(1).max(40).nullable(), toId: z.string().min(1).max(40) })).min(1).max(50) }),
    req.body,
  );
  const result = await applyMoves(moves, req.user!.id);
  await audit(req, 'ASSIGNMENT_REBALANCED', undefined, { applied: result.applied.length, skipped: result.skipped.length });
  res.json(result);
});

adminAssignmentRouter.get('/handovers', adminOnly, async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(['ACTIVE', 'RETURNED', 'KEPT']).optional() }), req.query);
  const rows = await prisma.caseHandover.findMany({ where: status ? { status } : {}, orderBy: { startedAt: 'desc' }, take: 200 });
  const userIds = [...new Set(rows.flatMap((h) => [h.originalStaffId, h.substituteId]))];
  const [users, cases] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true } }),
    prisma.case.findMany({ where: { id: { in: rows.map((h) => h.caseId) } }, select: { id: true, number: true, status: true } }),
  ]);
  const u = new Map(users.map((x) => [x.id, `${x.firstName} ${x.lastName}`.trim()]));
  const c = new Map(cases.map((x) => [x.id, x]));
  res.json({
    handovers: rows.map((h) => ({ ...h, originalName: u.get(h.originalStaffId) ?? null, substituteName: u.get(h.substituteId) ?? null, caseNumber: c.get(h.caseId)?.number ?? null, caseStatus: c.get(h.caseId)?.status ?? null })),
  });
});

adminAssignmentRouter.post('/handovers/run', adminOnly, async (req, res) => {
  const result = await runHandovers();
  await audit(req, 'ASSIGNMENT_HANDOVER_RUN', undefined, result);
  res.json(result);
});
