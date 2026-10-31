import type { Request } from 'express';
import { z } from 'zod';
import type { EmployerArrivalItem, Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { badRequest, notFound } from './http.js';
import { audit } from './audit.js';
import { notifyUser } from './notifications.js';
import { anonymisedProfile, anonymisedProfileSelect } from './vacancies.js';
import { isImpersonating } from './privacy/impersonationContext.js';

/**
 * Employer arrival checklist (company portal → "Workers" → worker → "Arrival checklist").
 * For every worker placed with the company whose visa was approved (Case.status APPROVED, travelling or
 * arrived, not marked as left), the company ticks its own preparations: housing, Anmeldung appointment,
 * bank account, health insurance, first work day / Einarbeitung, workwear … Default items are created lazily
 * on first view; the company may add its own items. Each item: done + when + who, a date and a note.
 *   - staff see the list read-only in the arrival view (routes/admin/arrivals.ts)
 *   - the worker sees the items marked visibleToWorker read-only on their arrival page (routes/arrival.ts),
 *     without the company's notes or who ticked them
 *   - jobs/employerArrival.ts reminds the company's portal users when the first work day is near and items are open
 * The client's own "first steps" checklist (lib/housing, lib/journey) is separate: this one is the employer's side.
 */

export const DEFAULT_ITEMS = ['HOUSING', 'ANMELDUNG', 'BANK_ACCOUNT', 'HEALTH_INSURANCE', 'TAX_ID', 'FIRST_DAY', 'WORKWEAR', 'SAFETY_BRIEFING'] as const;
export type DefaultItem = (typeof DEFAULT_ITEMS)[number];
export const MAX_CUSTOM_ITEMS = 30;
/** Reminder this many days before the first work day (when items are still open). */
export const FIRST_DAY_REMIND_DAYS = 3;

const DAY = 24 * 60 * 60 * 1000;

/** Cases of the company that get a checklist (404 for anything else, so ids cannot be probed). */
const eligibleWhere = (companyId: string): Prisma.CaseWhereInput => ({
  companyId,
  status: 'APPROVED',
  OR: [{ arrivalFollowUp: null }, { arrivalFollowUp: { leftJobAt: null } }],
});

export const eligibleCase = (companyId: string, caseId: string) =>
  prisma.case.findFirst({ where: { id: caseId, ...eligibleWhere(companyId) }, select: { id: true, companyId: true, clientId: true } });

/** Creates the default items of a case once (idempotent); the first work day comes from the employment contract. */
export const ensureItems = async (companyId: string, caseId: string) => {
  if (isImpersonating()) return;
  const existing = await prisma.employerArrivalItem.count({ where: { caseId, key: { not: null } } });
  if (existing >= DEFAULT_ITEMS.length) return;
  const contract = await prisma.employmentContract.findUnique({ where: { caseId }, select: { startDate: true } });
  await prisma.employerArrivalItem.createMany({
    data: DEFAULT_ITEMS.map((key, i) => ({ caseId, companyId, key, sortOrder: (i + 1) * 10, dueDate: key === 'FIRST_DAY' ? (contract?.startDate ?? null) : null })),
    skipDuplicates: true,
  });
};

const ordered = { orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }] };

export const itemView = (i: EmployerArrivalItem) => ({
  id: i.id,
  key: i.key,
  label: i.label,
  custom: i.key === null,
  done: i.done,
  doneAt: i.doneAt,
  doneByName: i.doneByName,
  dueDate: i.dueDate,
  note: i.note,
  visibleToWorker: i.visibleToWorker,
  updatedAt: i.updatedAt,
});

/** What the worker sees: no notes, no names. */
export const workerItemView = (i: EmployerArrivalItem) => ({ id: i.id, key: i.key, label: i.label, done: i.done, doneAt: i.doneAt, dueDate: i.dueDate });

export const progressOf = (items: Pick<EmployerArrivalItem, 'done'>[]) => ({ done: items.filter((i) => i.done).length, total: items.length });

export const firstDayOf = (items: Pick<EmployerArrivalItem, 'key' | 'dueDate'>[]) => items.find((i) => i.key === 'FIRST_DAY')?.dueDate ?? null;

export const listItems = (caseId: string) => prisma.employerArrivalItem.findMany({ where: { caseId }, ...ordered });

/** Company view of one worker's checklist. */
export const companyChecklist = async (companyId: string, caseId: string) => {
  const c = await eligibleCase(companyId, caseId);
  if (!c) throw notFound('WORKER_NOT_FOUND');
  await ensureItems(companyId, caseId);
  const items = await listItems(caseId);
  return { caseId, items: items.map(itemView), progress: progressOf(items), firstDay: firstDayOf(items) };
};

/** All eligible workers of the company with checklist progress (company "arrival checklists" overview). */
export const companyOverview = async (companyId: string) => {
  const cases = await prisma.case.findMany({
    where: eligibleWhere(companyId),
    orderBy: { createdAt: 'desc' },
    select: { id: true, profession: true, client: { select: anonymisedProfileSelect }, arrivalPlan: { select: { status: true, arrivalTime: true, flightDate: true } } },
  });
  for (const c of cases) await ensureItems(companyId, c.id);
  const items = cases.length ? await prisma.employerArrivalItem.findMany({ where: { caseId: { in: cases.map((c) => c.id) } }, ...ordered }) : [];
  return cases.map((c) => {
    const mine = items.filter((i) => i.caseId === c.id);
    const plan = c.arrivalPlan && c.arrivalPlan.status !== 'CANCELLED' ? c.arrivalPlan : null;
    return {
      caseId: c.id,
      name: anonymisedProfile(c.client).name,
      profession: c.profession,
      arrival: plan ? (plan.arrivalTime ?? plan.flightDate) : null,
      firstDay: firstDayOf(mine),
      progress: progressOf(mine),
      openKeys: mine.filter((i) => !i.done).map((i) => i.key ?? i.label ?? ''),
    };
  });
};

// ─── Edits (company) ───────────────────────────────────────────────────

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .optional()
  .transform((v) => (v === undefined ? undefined : v === null ? null : new Date(`${v}T00:00:00.000Z`)));
const note = z
  .string()
  .trim()
  .max(1000)
  .nullable()
  .optional()
  .transform((v) => (v === undefined ? undefined : v || null));

export const createInput = z.object({
  label: z.string().trim().min(1).max(200),
  dueDate: day,
  note,
  visibleToWorker: z.boolean().optional(),
});

export const patchInput = z
  .object({ done: z.boolean().optional(), dueDate: day, note, visibleToWorker: z.boolean().optional(), label: z.string().trim().min(1).max(200).optional() })
  .strict();

const actorName = async (userId: string) => {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
  return `${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim().slice(0, 160) || null;
};

export const addItem = async (req: Request, companyId: string, caseId: string, input: z.output<typeof createInput>) => {
  if (!(await eligibleCase(companyId, caseId))) throw notFound('WORKER_NOT_FOUND');
  if ((await prisma.employerArrivalItem.count({ where: { caseId, key: null } })) >= MAX_CUSTOM_ITEMS) throw badRequest('TOO_MANY_ITEMS');
  const last = await prisma.employerArrivalItem.findFirst({ where: { caseId }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
  const item = await prisma.employerArrivalItem.create({
    data: {
      caseId,
      companyId,
      label: input.label,
      dueDate: input.dueDate ?? null,
      note: input.note ?? null,
      visibleToWorker: input.visibleToWorker ?? false,
      sortOrder: (last?.sortOrder ?? 0) + 10,
      createdById: req.user!.id,
    },
  });
  await audit(req, 'EMPLOYER_ARRIVAL_ITEM_ADDED', `case:${caseId}`, { itemId: item.id });
  return itemView(item);
};

const loadItem = async (companyId: string, caseId: string, itemId: string) => {
  if (!(await eligibleCase(companyId, caseId))) throw notFound('WORKER_NOT_FOUND');
  const item = await prisma.employerArrivalItem.findFirst({ where: { id: itemId, caseId, companyId } });
  if (!item) throw notFound('ITEM_NOT_FOUND');
  return item;
};

export const updateItem = async (req: Request, companyId: string, caseId: string, itemId: string, input: z.output<typeof patchInput>) => {
  const item = await loadItem(companyId, caseId, itemId);
  if (input.label !== undefined && item.key) throw badRequest('DEFAULT_ITEM_LABEL');
  const data: Prisma.EmployerArrivalItemUpdateInput = {};
  if (input.done !== undefined && input.done !== item.done) {
    data.done = input.done;
    data.doneAt = input.done ? new Date() : null;
    data.doneById = input.done ? req.user!.id : null;
    data.doneByName = input.done ? await actorName(req.user!.id) : null;
  }
  if (input.dueDate !== undefined) {
    data.dueDate = input.dueDate;
    // A moved first work day gets a fresh reminder.
    if (item.key === 'FIRST_DAY' && (input.dueDate?.getTime() ?? null) !== (item.dueDate?.getTime() ?? null)) data.remindedAt = null;
  }
  if (input.note !== undefined) data.note = input.note;
  if (input.visibleToWorker !== undefined) data.visibleToWorker = input.visibleToWorker;
  if (input.label !== undefined) data.label = input.label;
  const saved = await prisma.employerArrivalItem.update({ where: { id: item.id }, data });
  await audit(req, 'EMPLOYER_ARRIVAL_ITEM_UPDATED', `case:${caseId}`, { itemId: item.id, key: item.key, done: input.done });
  return itemView(saved);
};

export const deleteItem = async (req: Request, companyId: string, caseId: string, itemId: string) => {
  const item = await loadItem(companyId, caseId, itemId);
  if (item.key) throw badRequest('DEFAULT_ITEM'); // default items can only be ticked, not removed
  await prisma.employerArrivalItem.delete({ where: { id: item.id } });
  await audit(req, 'EMPLOYER_ARRIVAL_ITEM_DELETED', `case:${caseId}`, { itemId: item.id });
};

// ─── Staff / worker views ──────────────────────────────────────────────

/** Staff: the checklist of a case (null when the case has no employer or no items yet). */
export const staffChecklist = async (caseId: string) => {
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { companyId: true, company: { select: { id: true, name: true } } } });
  if (!c?.companyId) return null;
  const items = await listItems(caseId);
  return { company: c.company, items: items.map(itemView), progress: progressOf(items), firstDay: firstDayOf(items) };
};

/** Staff list: progress per case id. */
export const progressByCase = async (caseIds: string[]) => {
  const map = new Map<string, { done: number; total: number; firstDay: Date | null }>();
  if (!caseIds.length) return map;
  const items = await prisma.employerArrivalItem.findMany({ where: { caseId: { in: caseIds } }, select: { caseId: true, done: true, key: true, dueDate: true } });
  for (const id of caseIds) {
    const mine = items.filter((i) => i.caseId === id);
    if (mine.length) map.set(id, { ...progressOf(mine), firstDay: firstDayOf(mine) });
  }
  return map;
};

/** Worker: the items the employer shares (read-only). */
export const workerChecklist = async (caseId: string) => {
  const items = await prisma.employerArrivalItem.findMany({ where: { caseId, visibleToWorker: true }, ...ordered });
  return items.length ? { items: items.map(workerItemView), progress: progressOf(items) } : null;
};

// ─── First-work-day reminder (jobs/employerArrival.ts) ──────────────────

type Loc = 'az' | 'de' | 'en' | 'ru';
const REMINDER: Record<Loc, (p: { name: string; date: string; open: number }) => { title: string; body: string }> = {
  az: (p) => ({ title: `${p.name}: ilk iş günü yaxınlaşır`, body: `${p.name} ${p.date} tarixində işə başlayır. Gəliş siyahısında hələ ${p.open} açıq bənd var.` }),
  de: (p) => ({ title: `${p.name}: erster Arbeitstag naht`, body: `${p.name} beginnt am ${p.date}. In der Ankunfts-Checkliste sind noch ${p.open} Punkte offen.` }),
  en: (p) => ({ title: `${p.name}: first work day is coming up`, body: `${p.name} starts on ${p.date}. ${p.open} item(s) of the arrival checklist are still open.` }),
  ru: (p) => ({ title: `${p.name}: скоро первый рабочий день`, body: `${p.name} начинает работу ${p.date}. В чек-листе приезда ещё ${p.open} открытых пунктов.` }),
};
const fmtDay = (d: Date, loc: Loc) =>
  new Intl.DateTimeFormat({ az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' }[loc], { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(d);

export const runFirstDayReminders = async (now = new Date()) => {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const due = await prisma.employerArrivalItem.findMany({
    where: { key: 'FIRST_DAY', remindedAt: null, dueDate: { gte: today, lte: new Date(today.getTime() + FIRST_DAY_REMIND_DAYS * DAY) } },
    select: { id: true, caseId: true, companyId: true, dueDate: true },
  });
  let sent = 0;
  for (const f of due) {
    const c = await eligibleCase(f.companyId, f.caseId);
    if (!c) continue;
    const open = await prisma.employerArrivalItem.count({ where: { caseId: f.caseId, done: false } });
    // Claim first so two scheduler ticks never send twice.
    const { count } = await prisma.employerArrivalItem.updateMany({ where: { id: f.id, remindedAt: null }, data: { remindedAt: now } });
    if (!count || !open) continue;
    const client = await prisma.case.findUnique({ where: { id: f.caseId }, select: { client: { select: anonymisedProfileSelect } } });
    const name = client ? anonymisedProfile(client.client).name : '—';
    const users = await prisma.user.findMany({ where: { companyId: f.companyId, role: 'COMPANY', isActive: true }, select: { id: true, locale: true } });
    for (const u of users) {
      const loc: Loc = u.locale;
      const t = REMINDER[loc]({ name, date: fmtDay(f.dueDate!, loc), open });
      await notifyUser(u.id, { type: 'EMPLOYER_ARRIVAL_CHECKLIST', title: t.title, body: t.body, link: `/company/workers?checklist=${f.caseId}` }).catch((e) =>
        console.error('[employer-arrival] reminder failed', e),
      );
    }
    sent++;
  }
  return sent;
};
