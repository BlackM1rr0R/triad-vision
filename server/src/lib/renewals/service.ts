import type { Locale } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { createCase, FINAL_STATUSES } from '../caseFlow.js';
import { formatDay } from '../growthTexts.js';
import { HttpError } from '../http.js';
import { invalidateMyWork } from '../myWork.js';
import { notifyUser } from '../notifications.js';
import { createNumbered } from '../tasks/core.js';
import { promptEmployerCheckIn } from '../checkIns/service.js';
import { renewalTexts } from './texts.js';

/**
 * After the visa: residence-title renewal and the probation-end reminder (daily job `renewals`).
 *
 * (a) Case.residenceTitleExpiresAt (set by staff on the admin case page). `residenceLeadDays` (default 90)
 *     before it, a renewal case is opened for the same client: same visa type / category, profession,
 *     employer and assigned staff member; Case.renewalOfCaseId → the old case, status = the initial one,
 *     a "Renewal of …" event on both. Case.renewalCaseCreatedAt on the old case is claimed first, so a
 *     re-run (or a second API instance) never opens two. Staff + client are notified in their language.
 *     A client who has another open case is skipped (createCase allows one active case) and retried later.
 * (b) EmploymentContract.probationEndsAt: `probationLeadDays` (default 14) before it, the responsible staff
 *     member gets a task + notification and (optional) the employer a check-in (lib/checkIns);
 *     Case.probationReminderAt is the claim.
 */

const DAY = 24 * 60 * 60 * 1000;
export const RENEWAL_SETTING_KEY = 'renewals';
/** A title that expired longer ago than this is not renewed automatically any more. */
export const EXPIRED_GRACE_DAYS = 60;

export const renewalSettingsSchema = z.object({
  enabled: z.boolean(),
  residenceLeadDays: z.number().int().min(14).max(365),
  probationLeadDays: z.number().int().min(1).max(90),
  probationEmployerCheckIn: z.boolean(),
});
export type RenewalSettings = z.infer<typeof renewalSettingsSchema>;
export const DEFAULT_RENEWAL_SETTINGS: RenewalSettings = { enabled: true, residenceLeadDays: 90, probationLeadDays: 14, probationEmployerCheckIn: true };

export const getRenewalSettings = async (): Promise<RenewalSettings> => {
  const row = await prisma.setting.findUnique({ where: { key: RENEWAL_SETTING_KEY } });
  const parsed = renewalSettingsSchema.safeParse({ ...DEFAULT_RENEWAL_SETTINGS, ...((row?.value ?? {}) as object) });
  return parsed.success ? parsed.data : DEFAULT_RENEWAL_SETTINGS;
};

export const saveRenewalSettings = async (s: RenewalSettings) => {
  await prisma.setting.upsert({ where: { key: RENEWAL_SETTING_KEY }, create: { key: RENEWAL_SETTING_KEY, value: s }, update: { value: s } });
  return s;
};

const fullName = (u: { firstName: string; lastName: string } | null | undefined) => (u ? `${u.firstName} ${u.lastName}`.trim() : '');
const daysUntil = (d: Date, now: Date) => Math.max(0, Math.ceil((d.getTime() - now.getTime()) / DAY));

/** The assigned staff member when active, else every active admin. */
const responsible = async (assignedStaffId: string | null) => {
  const staff = assignedStaffId ? await prisma.user.findFirst({ where: { id: assignedStaffId, isActive: true, role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] } }, select: { id: true, locale: true } }) : null;
  return staff ? [staff] : prisma.user.findMany({ where: { isActive: true, role: { in: ['ADMIN', 'SUPER_ADMIN'] } }, select: { id: true, locale: true } });
};

// ─── (a) Residence title renewal ──────────────────────────────────────

/** Opens the renewal case of one case (claimed; null when it was claimed already or cannot be opened now). */
export const openRenewalCase = async (caseId: string, now = new Date(), actorId?: string) => {
  const claim = await prisma.case.updateMany({ where: { id: caseId, renewalCaseCreatedAt: null, residenceTitleExpiresAt: { not: null } }, data: { renewalCaseCreatedAt: now } });
  if (!claim.count) return null;
  const old = await prisma.case.findUniqueOrThrow({
    where: { id: caseId },
    select: { id: true, number: true, clientId: true, profession: true, visaType: true, visaCategoryId: true, assignedStaffId: true, companyId: true, residenceTitleExpiresAt: true, client: { select: { firstName: true, lastName: true, locale: true } } },
  });
  let created;
  try {
    created = await createCase(old.clientId, { profession: old.profession, visaType: old.visaType, visaCategoryId: old.visaCategoryId, actorId, quiet: true });
  } catch (err) {
    // Not now (e.g. another open case of the client): release the claim, the next run tries again.
    await prisma.case.update({ where: { id: old.id }, data: { renewalCaseCreatedAt: null } });
    if (err instanceof HttpError && err.status === 409) return null;
    throw err;
  }
  await prisma.case.update({
    where: { id: created.id },
    data: { renewalOfCaseId: old.id, companyId: old.companyId, ...(old.assignedStaffId ? { assignedStaffId: old.assignedStaffId } : {}) },
  });
  const expires = old.residenceTitleExpiresAt!;
  const days = daysUntil(expires, now);
  const p = (l: Locale) => ({ firstName: old.client.firstName, worker: fullName(old.client), number: old.number, newNumber: created.number, date: formatDay(expires, l), days });
  await prisma.caseEvent.createMany({
    data: [
      { caseId: created.id, type: 'RENEWAL_OPENED', note: renewalTexts(old.client.locale).eventNew(p(old.client.locale)), actorId: actorId ?? null, visibleToClient: true },
      { caseId: old.id, type: 'RENEWAL_CASE_CREATED', note: renewalTexts(old.client.locale).eventOld(p(old.client.locale)), actorId: actorId ?? null, visibleToClient: true },
    ],
  });
  const ct = renewalTexts(old.client.locale);
  await notifyUser(old.clientId, { type: 'RENEWAL_OPENED', title: ct.clientTitle, body: ct.clientBody(p(old.client.locale)), link: `/account/cases/${created.id}`, caseId: created.id, ctaLabel: ct.clientCta }).catch(() => undefined);
  for (const u of await responsible(old.assignedStaffId)) {
    const t = renewalTexts(u.locale);
    await notifyUser(u.id, { type: 'RENEWAL_OPENED', title: t.staffTitle(p(u.locale)), body: t.staffBody(p(u.locale)), link: `/admin/cases/${created.id}`, caseId: created.id }).catch(() => undefined);
    invalidateMyWork(u.id);
  }
  return created;
};

export const runResidenceRenewals = async (now = new Date(), s?: RenewalSettings) => {
  const settings = s ?? (await getRenewalSettings());
  const due = await prisma.case.findMany({
    where: {
      renewalCaseCreatedAt: null,
      status: { not: 'CANCELLED' },
      residenceTitleExpiresAt: { lte: new Date(now.getTime() + settings.residenceLeadDays * DAY), gte: new Date(now.getTime() - EXPIRED_GRACE_DAYS * DAY) },
    },
    select: { id: true },
    take: 200,
  });
  let opened = 0;
  for (const c of due) if (await openRenewalCase(c.id, now).catch((e) => (console.error('[renewals] open failed', c.id, e), null))) opened++;
  return opened;
};

// ─── (b) Probation end ────────────────────────────────────────────────

export const runProbationReminders = async (now = new Date(), s?: RenewalSettings) => {
  const settings = s ?? (await getRenewalSettings());
  const contracts = await prisma.employmentContract.findMany({
    where: { probationEndsAt: { gte: now, lte: new Date(now.getTime() + settings.probationLeadDays * DAY) } },
    select: { caseId: true, probationEndsAt: true },
    take: 500,
  });
  let reminded = 0;
  for (const k of contracts) {
    const claim = await prisma.case.updateMany({ where: { id: k.caseId, probationReminderAt: null, status: { not: 'CANCELLED' } }, data: { probationReminderAt: now } });
    if (!claim.count) continue;
    const kase = await prisma.case.findUniqueOrThrow({ where: { id: k.caseId }, select: { id: true, number: true, assignedStaffId: true, client: { select: { firstName: true, lastName: true } } } });
    const ends = k.probationEndsAt!;
    const recipients = await responsible(kase.assignedStaffId);
    const p = (l: Locale) => ({ worker: fullName(kase.client) || kase.number, number: kase.number, date: formatDay(ends, l), days: daysUntil(ends, now) });
    const locale: Locale = recipients[0]?.locale ?? 'az';
    if (recipients.length) {
      await createNumbered(async (txn, number) => {
        const min = await txn.task.aggregate({ where: { status: 'TODO' }, _min: { sortOrder: true } });
        return txn.task.create({
          data: {
            number,
            title: renewalTexts(locale).probationTask(p(locale)).slice(0, 200),
            description: renewalTexts(locale).probationBody(p(locale)).slice(0, 8000),
            status: 'TODO',
            priority: 'NORMAL',
            dueAt: new Date(Math.max(now.getTime() + DAY, ends.getTime() - 3 * DAY)),
            sortOrder: min._min.sortOrder === null ? 0 : min._min.sortOrder - 1024,
            caseId: kase.id,
            assignees: { create: recipients.map((u) => ({ userId: u.id })) },
          },
        });
      });
    }
    await prisma.caseEvent.create({ data: { caseId: kase.id, type: 'PROBATION_REMINDER', note: renewalTexts(locale).probationBody(p(locale)).slice(0, 2000), visibleToClient: false } });
    for (const u of recipients) {
      const t = renewalTexts(u.locale);
      await notifyUser(u.id, { type: 'PROBATION_ENDING', title: t.probationTitle(p(u.locale)), body: t.probationBody(p(u.locale)), link: `/admin/cases/${kase.id}`, caseId: kase.id }).catch(() => undefined);
      invalidateMyWork(u.id);
    }
    if (settings.probationEmployerCheckIn) await promptEmployerCheckIn(kase.id, now).catch(() => false);
    reminded++;
  }
  return reminded;
};

/** Daily job: both parts (idempotent). */
export const runRenewals = async (now = new Date()) => {
  const s = await getRenewalSettings();
  if (!s.enabled) return { renewals: 0, probation: 0 };
  return { renewals: await runResidenceRenewals(now, s), probation: await runProbationReminders(now, s) };
};

// ─── Reads ────────────────────────────────────────────────────────────

/** Admin case page card: residence title, probation, the renewal links in both directions. */
export const caseCare = async (caseId: string) => {
  const c = await prisma.case.findUnique({
    where: { id: caseId },
    select: { id: true, number: true, status: true, residenceTitleExpiresAt: true, renewalOfCaseId: true, renewalCaseCreatedAt: true, probationReminderAt: true, visaValidTo: true },
  });
  if (!c) return null;
  const [renewalOf, renewals, contract, settings] = await Promise.all([
    c.renewalOfCaseId ? prisma.case.findUnique({ where: { id: c.renewalOfCaseId }, select: { id: true, number: true, status: true, residenceTitleExpiresAt: true } }) : null,
    prisma.case.findMany({ where: { renewalOfCaseId: c.id }, orderBy: { createdAt: 'desc' }, select: { id: true, number: true, status: true, createdAt: true } }),
    prisma.employmentContract.findUnique({ where: { caseId: c.id }, select: { probationEndsAt: true } }),
    getRenewalSettings(),
  ]);
  const autoAt = c.residenceTitleExpiresAt ? new Date(c.residenceTitleExpiresAt.getTime() - settings.residenceLeadDays * DAY) : null;
  return {
    caseId: c.id,
    status: c.status,
    final: FINAL_STATUSES.includes(c.status),
    visaValidTo: c.visaValidTo,
    residenceTitleExpiresAt: c.residenceTitleExpiresAt,
    renewalCaseCreatedAt: c.renewalCaseCreatedAt,
    /** When the job opens the renewal case (null once opened or without a date). */
    renewalDueAt: c.renewalCaseCreatedAt ? null : autoAt,
    probationEndsAt: contract?.probationEndsAt ?? null,
    probationReminderAt: c.probationReminderAt,
    renewalOf,
    renewals,
    settings,
  };
};

/** Expiring page: residence titles and probation periods ending within `days`. */
export const upcomingCare = async (days: number, opts: { staffId?: string; now?: Date } = {}) => {
  const now = opts.now ?? new Date();
  const until = new Date(now.getTime() + days * DAY);
  const staffWhere = opts.staffId === 'none' ? { assignedStaffId: null } : opts.staffId ? { assignedStaffId: opts.staffId } : {};
  const caseSelect = { id: true, number: true, status: true, visaType: true, renewalCaseCreatedAt: true, residenceTitleExpiresAt: true, client: { select: { id: true, firstName: true, lastName: true } }, assignedStaff: { select: { id: true, firstName: true, lastName: true } } } as const;
  const titles = await prisma.case.findMany({
    where: { ...staffWhere, status: { not: 'CANCELLED' }, residenceTitleExpiresAt: { lte: until, gte: new Date(now.getTime() - EXPIRED_GRACE_DAYS * DAY) } },
    orderBy: { residenceTitleExpiresAt: 'asc' },
    take: 300,
    select: caseSelect,
  });
  const renewalRows = titles.length ? await prisma.case.findMany({ where: { renewalOfCaseId: { in: titles.map((t) => t.id) } }, select: { id: true, number: true, status: true, renewalOfCaseId: true } }) : [];
  const contracts = await prisma.employmentContract.findMany({ where: { probationEndsAt: { lte: until, gte: new Date(now.getTime() - 7 * DAY) } }, orderBy: { probationEndsAt: 'asc' }, take: 300, select: { caseId: true, probationEndsAt: true, employerName: true } });
  const probationCases = contracts.length ? await prisma.case.findMany({ where: { id: { in: contracts.map((k) => k.caseId) }, ...staffWhere, status: { not: 'CANCELLED' } }, select: { ...caseSelect, probationReminderAt: true, company: { select: { name: true } } } }) : [];
  const byId = new Map(probationCases.map((c) => [c.id, c]));
  const person = (u: { id: string; firstName: string; lastName: string } | null) => (u ? { id: u.id, name: fullName(u) } : null);
  const left = (d: Date) => Math.ceil((d.getTime() - now.getTime()) / DAY);
  return {
    residence: titles.map((c) => {
      const r = renewalRows.find((x) => x.renewalOfCaseId === c.id) ?? null;
      return {
        case: { id: c.id, number: c.number, status: c.status, visaType: c.visaType },
        client: { id: c.client.id, name: fullName(c.client) },
        staff: person(c.assignedStaff),
        expiresAt: c.residenceTitleExpiresAt,
        daysLeft: left(c.residenceTitleExpiresAt!),
        renewal: r ? { id: r.id, number: r.number, status: r.status } : null,
      };
    }),
    probation: contracts
      .filter((k) => byId.has(k.caseId))
      .map((k) => {
        const c = byId.get(k.caseId)!;
        return {
          case: { id: c.id, number: c.number, status: c.status, visaType: c.visaType },
          client: { id: c.client.id, name: fullName(c.client) },
          staff: person(c.assignedStaff),
          employer: c.company?.name ?? k.employerName ?? null,
          endsAt: k.probationEndsAt,
          daysLeft: left(k.probationEndsAt!),
          remindedAt: c.probationReminderAt,
        };
      }),
  };
};
