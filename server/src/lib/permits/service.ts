import type { Locale, Prisma, ResidenceTitleKind } from '@prisma/client';
import { prisma } from '../../db.js';
import { FINAL_STATUSES } from '../caseFlow.js';
import { formatDay } from '../growthTexts.js';
import { notifyUser } from '../notifications.js';
import {
  EXPIRED_NOTICE_DAYS,
  PERMIT_SETTING_KEY,
  daysLeft,
  parsePermitSettings,
  permitReminderKey,
  permitReminderPrefix,
  permitTone,
  permitWindow,
  titleItem,
  type PermitItem,
  type PermitSettings,
  type PermitTone,
} from './rules.js';
import { PERMIT_TEXTS } from './texts.js';

export * from './rules.js';

/**
 * Permit expiry reminders for the worker in Germany (daily job `permit-expiry`, jobs/permits.ts):
 *
 *   - residence title (Case.residenceTitleExpiresAt; Case.residenceTitleKind tells an EU Blue Card from an
 *     ordinary Aufenthaltserlaubnis), health insurance (Case.healthInsuranceExpiresAt) and passport
 *     (User.passportExpiry) of "care" cases: APPROVED, client active, not replaced by an APPROVED renewal case;
 *   - the passport only while the client has no open case — during a case it is warned by jobs/reminders.ts
 *     (profile date) or jobs/expiry.ts (case document), never twice;
 *   - each item is reminded once per window (default 90 / 60 / 30 days, passport 180 / 90 / 60 / 30; admin
 *     setting `permitReminders`) plus once when it expired: the client in-app + e-mail in their language, the
 *     assigned staff member in-app (+ e-mail when `staffEmail`), every admin in-app when nobody is assigned.
 *     Idempotent through ReminderLog (lib/permits/rules.ts permitReminderKey).
 *
 * The residence-title renewal case itself is opened by lib/renewals (90 days ahead) — the reminders here keep
 * the worker and the team informed until the new title is entered.
 */

const DAY = 24 * 60 * 60 * 1000;

export const getPermitSettings = async (): Promise<PermitSettings> => {
  const row = await prisma.setting.findUnique({ where: { key: PERMIT_SETTING_KEY } });
  return parsePermitSettings(row?.value ?? {});
};

export const savePermitSettings = async (s: PermitSettings) => {
  await prisma.setting.upsert({ where: { key: PERMIT_SETTING_KEY }, create: { key: PERMIT_SETTING_KEY, value: s }, update: { value: s } });
  return s;
};

/** Same as jobs/reminders.ts claimReminder (kept local: lib must not import the job modules). */
const claimReminder = async (key: string, now: Date) => {
  try {
    await prisma.reminderLog.create({ data: { key: key.slice(0, 191), sentAt: now } });
    return true;
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') return false;
    throw err;
  }
};

const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`.trim();

const careSelect = {
  id: true,
  number: true,
  clientId: true,
  createdAt: true,
  residenceTitleKind: true,
  residenceTitleExpiresAt: true,
  healthInsuranceExpiresAt: true,
  client: { select: { id: true, firstName: true, lastName: true, locale: true, passportExpiry: true } },
  assignedStaff: { select: { id: true, locale: true, isActive: true } },
} satisfies Prisma.CaseSelect;
type CareCase = Prisma.CaseGetPayload<{ select: typeof careSelect }>;

/** APPROVED cases of active clients, without the ones an APPROVED renewal case replaced; newest first. */
const careCases = async (where: Prisma.CaseWhereInput = {}): Promise<CareCase[]> => {
  const cases = await prisma.case.findMany({
    where: { status: 'APPROVED', client: { is: { isActive: true, role: 'CLIENT' } }, ...where },
    orderBy: { createdAt: 'desc' },
    select: careSelect,
    take: 2000,
  });
  if (!cases.length) return [];
  const renewed = await prisma.case.findMany({ where: { renewalOfCaseId: { in: cases.map((c) => c.id) }, status: 'APPROVED' }, select: { renewalOfCaseId: true } });
  const replaced = new Set(renewed.map((r) => r.renewalOfCaseId));
  return cases.filter((c) => !replaced.has(c.id));
};

/** Clients with an open (non-final) case — their passport is warned by the case reminders. */
const clientsWithOpenCase = async (clientIds: string[]) => {
  if (!clientIds.length) return new Set<string>();
  const rows = await prisma.case.findMany({ where: { clientId: { in: clientIds }, status: { notIn: FINAL_STATUSES } }, select: { clientId: true } });
  return new Set(rows.map((r) => r.clientId));
};

/**
 * Clients whose passport these reminders cover (an APPROVED care case, no open case). jobs/reminders.ts
 * skips them so the passport is never warned twice. Empty when the reminders are switched off.
 */
export const clientsInPermitCare = async (clientIds: string[]) => {
  if (!clientIds.length || !(await getPermitSettings()).enabled) return new Set<string>();
  const care = await careCases({ clientId: { in: clientIds } });
  const open = await clientsWithOpenCase([...new Set(care.map((c) => c.clientId))]);
  return new Set(care.map((c) => c.clientId).filter((id) => !open.has(id)));
};

export interface PermitEntry {
  item: PermitItem;
  expiresAt: Date;
  /** ReminderLog subject: the case for title / insurance, the client for the passport. */
  subjectId: string;
  case: CareCase;
}

/** Items with a date of the given care cases (passport once per client, on its newest care case). */
export const permitEntries = (cases: CareCase[], openClients: Set<string>): PermitEntry[] => {
  const out: PermitEntry[] = [];
  const passportDone = new Set<string>();
  for (const c of cases) {
    if (c.residenceTitleExpiresAt) out.push({ item: titleItem(c.residenceTitleKind), expiresAt: c.residenceTitleExpiresAt, subjectId: c.id, case: c });
    if (c.healthInsuranceExpiresAt) out.push({ item: 'insurance', expiresAt: c.healthInsuranceExpiresAt, subjectId: c.id, case: c });
    if (c.client.passportExpiry && !openClients.has(c.clientId) && !passportDone.has(c.clientId)) {
      passportDone.add(c.clientId);
      out.push({ item: 'passport', expiresAt: c.client.passportExpiry, subjectId: c.clientId, case: c });
    }
  }
  return out;
};

const admins = () => prisma.user.findMany({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, isActive: true }, select: { id: true, locale: true } });

const notifyEntry = async (e: PermitEntry, now: Date, settings: PermitSettings) => {
  const c = e.case;
  const days = daysLeft(e.expiresAt, now);
  const tx = PERMIT_TEXTS[c.client.locale];
  const link = e.item === 'passport' ? '/account/profile' : '/account#permits';
  const msg = tx.client({ item: e.item, firstName: c.client.firstName, date: formatDay(e.expiresAt, c.client.locale), days });
  await notifyUser(c.clientId, { type: 'PERMIT_EXPIRY', ...msg, link, caseId: c.id, ctaLabel: tx.cta }).catch((err) => console.error('[job:permit-expiry] client notify failed', err));

  const assigned = c.assignedStaff?.isActive ? c.assignedStaff : null;
  const staff: { id: string; locale: Locale; email: boolean }[] = assigned
    ? [{ id: assigned.id, locale: assigned.locale, email: settings.staffEmail }]
    : (await admins()).map((a) => ({ ...a, email: false }));
  for (const s of staff) {
    const st = PERMIT_TEXTS[s.locale];
    const m = st.staff({ item: e.item, client: fullName(c.client), number: c.number, date: formatDay(e.expiresAt, s.locale), days });
    await notifyUser(s.id, { type: 'PERMIT_EXPIRY_STAFF', ...m, link: `/admin/cases/${c.id}`, caseId: c.id, email: s.email }).catch((err) =>
      console.error('[job:permit-expiry] staff notify failed', err),
    );
  }
};

/** One run (idempotent): every due window of every care item; returns the number of reminders sent. */
export const runPermitReminders = async (now = new Date(), s?: PermitSettings) => {
  const settings = s ?? (await getPermitSettings());
  if (!settings.enabled) return 0;
  const widest = Math.max(...Object.values(settings.windows).flat());
  const range = { gte: new Date(now.getTime() - EXPIRED_NOTICE_DAYS * DAY), lte: new Date(now.getTime() + widest * DAY) };
  const cases = await careCases({ OR: [{ residenceTitleExpiresAt: range }, { healthInsuranceExpiresAt: range }, { client: { is: { passportExpiry: range } } }] });
  const open = await clientsWithOpenCase([...new Set(cases.map((c) => c.clientId))]);
  let sent = 0;
  for (const e of permitEntries(cases, open)) {
    const window = permitWindow(settings.windows[e.item], e.expiresAt, now);
    if (window === null) continue;
    if (!(await claimReminder(permitReminderKey(e.item, e.subjectId, e.expiresAt, window), now))) continue;
    await notifyEntry(e, now, settings);
    sent++;
  }
  return sent;
};

// ─── Reads ────────────────────────────────────────────────────────────

export interface PermitView {
  item: PermitItem;
  expiresAt: string;
  daysLeft: number;
  tone: PermitTone;
  case: { id: string; number: string };
  /** Windows already reminded for this date (0 = the "expired" notice). */
  remindedWindows: number[];
  /** When the next reminder goes out (null: none left). */
  nextReminderAt: string | null;
}

const reminded = async (entries: PermitEntry[]) => {
  if (!entries.length) return new Map<string, number[]>();
  const prefixes = entries.map((e) => permitReminderPrefix(e.item, e.subjectId, e.expiresAt));
  const rows = await prisma.reminderLog.findMany({ where: { OR: prefixes.map((p) => ({ key: { startsWith: p } })) }, select: { key: true } });
  const map = new Map<string, number[]>();
  for (const p of prefixes) map.set(p, rows.filter((r) => r.key.startsWith(p)).map((r) => Number(r.key.slice(p.length))).filter(Number.isFinite).sort((a, b) => b - a));
  return map;
};

const views = async (entries: PermitEntry[], settings: PermitSettings, now: Date): Promise<PermitView[]> => {
  const sent = await reminded(entries);
  return entries
    .map((e) => {
      const windows = settings.windows[e.item];
      const prefix = permitReminderPrefix(e.item, e.subjectId, e.expiresAt);
      const next = [...windows, 0].map((w) => e.expiresAt.getTime() - w * DAY).filter((t) => t > now.getTime()).sort((a, b) => a - b)[0];
      return {
        item: e.item,
        expiresAt: e.expiresAt.toISOString(),
        daysLeft: daysLeft(e.expiresAt, now),
        tone: permitTone(windows, e.expiresAt, now),
        case: { id: e.case.id, number: e.case.number },
        remindedWindows: sent.get(prefix) ?? [],
        nextReminderAt: settings.enabled && next ? new Date(next).toISOString() : null,
      };
    })
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
};

/** Client portal: the own residence title, insurance and passport dates (empty before the visa). */
export const clientPermits = async (userId: string, now = new Date()) => {
  const settings = await getPermitSettings();
  // The client view always shows the passport (also while a renewal case is open).
  const entries = permitEntries(await careCases({ clientId: userId }), new Set());
  return { items: (await views(entries, settings, now)).map(({ remindedWindows: _r, nextReminderAt: _n, ...v }) => v) };
};

/** Admin case page: kind / dates of the case, the client's passport, what was reminded and what comes next. */
export const casePermits = async (caseId: string, now = new Date()) => {
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { ...careSelect, status: true } });
  if (!c) return null;
  const settings = await getPermitSettings();
  const [care] = await careCases({ id: caseId });
  const open = await clientsWithOpenCase([c.clientId]);
  return {
    caseId: c.id,
    status: c.status,
    /** Reminders run for this case (APPROVED, not replaced by an approved renewal). */
    active: !!care && settings.enabled,
    residenceTitleKind: (c.residenceTitleKind ?? null) as ResidenceTitleKind | null,
    residenceTitleExpiresAt: c.residenceTitleExpiresAt,
    healthInsuranceExpiresAt: c.healthInsuranceExpiresAt,
    passportExpiry: c.client.passportExpiry,
    /** The passport is warned by the case reminders while the client has an open case. */
    passportByCaseReminders: open.has(c.clientId),
    items: care ? await views(permitEntries([care], open), settings, now) : [],
    settings,
  };
};
