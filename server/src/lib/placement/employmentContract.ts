import { Prisma, type EmploymentContract, type VisaType } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { badRequest, notFound } from '../http.js';
import { forYear, getCaseAiSettings, STATUTORY, type CaseAiSettings } from '../ai/features/caseAi/config.js';
import { isBlueCardCategory, type ContractResult } from '../ai/features/caseAi/contract.js';

/**
 * Employment contract tracker (Arbeitsvertrag), one per case: the agreed terms, the signature date, the
 * contract file in the drive and deterministic checks. The thresholds are the case-AI settings (minimum wage,
 * Blue Card standard / shortage per year — admins edit them on the case AI panel) and the fixed statutory
 * limits (ArbZG 48 h, BUrlG 20 days on a 5-day week, BGB § 622 (3) probation ≤ 6 months). Warnings are stored
 * on the row, so lists can filter "contract warnings"; probationEndsAt feeds the probation reminder job.
 */

export const CONTRACT_TYPES = ['UNLIMITED', 'FIXED', 'AUSBILDUNG'] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];
export type BlueCardCheck = 'OK' | 'SHORTAGE_OK' | 'BELOW' | 'NOT_APPLICABLE';

export type ContractWarningCode =
  | 'BLUE_CARD_BELOW'
  | 'BLUE_CARD_SHORTAGE_ONLY'
  | 'BELOW_MINIMUM_WAGE'
  | 'HOURS_TOO_HIGH'
  | 'VACATION_TOO_LOW'
  | 'PROBATION_TOO_LONG'
  | 'FIXED_WITHOUT_END'
  | 'END_BEFORE_START';

export interface ContractWarning {
  code: ContractWarningCode;
  severity: 'BLOCKER' | 'WARNING';
  params: Record<string, number | string>;
  /** English fallback text; the UI renders its own translation from code + params. */
  message: string;
}

export interface ContractFields {
  contractType: ContractType;
  grossMonthly: number | null;
  grossYearly: number | null;
  weeklyHours: number | null;
  vacationDays: number | null;
  startDate: Date | null;
  endDate: Date | null;
  probationMonths: number | null;
}

export interface ContractCheckContext {
  /** The case's visa category is the EU Blue Card (§ 18g). */
  blueCard: boolean;
  visaType: VisaType | null;
}

const DAY = 24 * 60 * 60 * 1000;
const money = (n: number) => Math.round(n * 100) / 100;

/** Last day of probation: start + months − 1 day (start 1 Jan, 6 months → 30 Jun); the day is clamped to the month's end. */
export const probationEnd = (start: Date, months: number) => {
  const y = start.getUTCFullYear();
  const m = start.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const end = new Date(Date.UTC(y, m, Math.min(start.getUTCDate(), lastDay)));
  return new Date(end.getTime() - DAY);
};

/** Monthly and yearly gross, each derived from the other when only one is known. */
export const salaryOf = (c: Pick<ContractFields, 'grossMonthly' | 'grossYearly'>) => {
  const monthly = c.grossMonthly ?? (c.grossYearly != null ? money(c.grossYearly / 12) : null);
  const yearly = c.grossYearly ?? (c.grossMonthly != null ? money(c.grossMonthly * 12) : null);
  return { monthly, yearly };
};

/** The deterministic checks. Pure: thresholds come from the settings passed in. */
export const checkContract = (
  c: ContractFields,
  ctx: ContractCheckContext,
  s: Pick<CaseAiSettings, 'minimumWage' | 'blueCard'>,
  now = new Date(),
): { blueCardCheck: BlueCardCheck | null; warnings: ContractWarning[] } => {
  const warnings: ContractWarning[] = [];
  const add = (code: ContractWarningCode, severity: ContractWarning['severity'], params: ContractWarning['params'], message: string) => warnings.push({ code, severity, params, message });
  const year = (c.startDate ?? now).getUTCFullYear();
  const { monthly, yearly } = salaryOf(c);

  let blueCardCheck: BlueCardCheck | null = ctx.blueCard ? null : 'NOT_APPLICABLE';
  if (ctx.blueCard && yearly !== null) {
    const bc = forYear(s.blueCard, year);
    if (bc) {
      if (yearly < bc.shortage) {
        blueCardCheck = 'BELOW';
        add('BLUE_CARD_BELOW', 'BLOCKER', { yearly, min: bc.shortage, year }, `Yearly gross ${yearly} € is below the Blue Card shortage threshold ${bc.shortage} € (${year}).`);
      } else if (yearly < bc.standard) {
        blueCardCheck = 'SHORTAGE_OK';
        add('BLUE_CARD_SHORTAGE_ONLY', 'WARNING', { yearly, min: bc.standard, year }, `Yearly gross ${yearly} € only meets the shortage-occupation threshold (standard ${bc.standard} €, ${year}).`);
      } else blueCardCheck = 'OK';
    }
  }

  // Trainees (Ausbildung) are not covered by the statutory minimum wage (§ 22 MiLoG).
  const trainee = c.contractType === 'AUSBILDUNG' || ctx.visaType === 'AUSBILDUNG';
  if (monthly !== null && !trainee) {
    const hours = c.weeklyHours && c.weeklyHours > 0 ? c.weeklyHours : 40;
    const hourly = monthly / (hours * STATUTORY.weeksPerMonth);
    const min = forYear(s.minimumWage, year);
    if (min !== null && hourly < min - 0.005) {
      add('BELOW_MINIMUM_WAGE', 'BLOCKER', { hourly: money(hourly), min, year }, `Hourly wage ${money(hourly)} € is below the minimum wage ${min} € (${year}).`);
    }
  }
  if (c.weeklyHours !== null && c.weeklyHours > STATUTORY.maxWeeklyHours) {
    add('HOURS_TOO_HIGH', 'BLOCKER', { hours: c.weeklyHours, max: STATUTORY.maxWeeklyHours }, `${c.weeklyHours} hours per week exceed the legal maximum of ${STATUTORY.maxWeeklyHours}.`);
  }
  if (c.vacationDays !== null && c.vacationDays < STATUTORY.minVacationDays5DayWeek) {
    add('VACATION_TOO_LOW', 'BLOCKER', { days: c.vacationDays, min: STATUTORY.minVacationDays5DayWeek }, `${c.vacationDays} vacation days are below the statutory ${STATUTORY.minVacationDays5DayWeek} (5-day week).`);
  }
  if (c.probationMonths !== null && c.probationMonths > STATUTORY.maxProbationMonths) {
    add('PROBATION_TOO_LONG', 'WARNING', { months: c.probationMonths, max: STATUTORY.maxProbationMonths }, `Probation of ${c.probationMonths} months is longer than ${STATUTORY.maxProbationMonths}.`);
  }
  if (c.contractType === 'FIXED' && !c.endDate) add('FIXED_WITHOUT_END', 'WARNING', {}, 'Fixed-term contract without an end date.');
  if (c.startDate && c.endDate && c.endDate.getTime() < c.startDate.getTime()) add('END_BEFORE_START', 'WARNING', {}, 'The end date is before the start date.');
  return { blueCardCheck, warnings };
};

// ─── Input ──────────────────────────────────────────────────────────────

/** "YYYY-MM-DD" (UTC midnight) or a full ISO timestamp; '' / null clears. */
const dateField = z
  .union([z.null(), z.literal(''), z.string().max(40)])
  .optional()
  .transform((v, ctx) => {
    if (v === undefined) return undefined;
    if (v === null || v === '') return null;
    const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00.000Z`) : new Date(v);
    if (Number.isNaN(d.getTime()) || d.getUTCFullYear() < 1990 || d.getUTCFullYear() > 2100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'INVALID_DATE' });
      return z.NEVER;
    }
    return d;
  });
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === '' ? null : v));
const optNum = (max: number) => z.number().min(0).max(max).nullable().optional();

export const contractInput = z.object({
  employerName: optText(200),
  companyId: z.string().max(40).nullable().optional(),
  jobTitle: optText(160),
  contractType: z.enum(CONTRACT_TYPES).optional(),
  grossMonthly: optNum(100_000),
  grossYearly: optNum(1_200_000),
  weeklyHours: optNum(80),
  vacationDays: z.number().int().min(0).max(60).nullable().optional(),
  startDate: dateField,
  endDate: dateField,
  probationMonths: z.number().int().min(0).max(24).nullable().optional(),
  /** Set to override the computed end of probation; null = compute from start + months. */
  probationEndsAt: dateField,
  signedAt: dateField,
  driveNodeId: z.string().max(40).nullable().optional(),
  note: optText(4000),
});
export type ContractInput = z.infer<typeof contractInput>;

const num = (d: Prisma.Decimal | null) => (d === null ? null : Number(d));

export const contractView = (c: EmploymentContract) => ({
  id: c.id,
  caseId: c.caseId,
  companyId: c.companyId,
  employerName: c.employerName,
  jobTitle: c.jobTitle,
  contractType: c.contractType as ContractType,
  grossMonthly: num(c.grossMonthly),
  grossYearly: num(c.grossYearly),
  weeklyHours: num(c.weeklyHours),
  vacationDays: c.vacationDays,
  startDate: c.startDate,
  endDate: c.endDate,
  probationMonths: c.probationMonths,
  probationEndsAt: c.probationEndsAt,
  signedAt: c.signedAt,
  driveNodeId: c.driveNodeId,
  blueCardCheck: c.blueCardCheck as BlueCardCheck | null,
  warnings: (Array.isArray(c.warnings) ? c.warnings : []) as unknown as ContractWarning[],
  note: c.note,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
});
export type ContractView = ReturnType<typeof contractView>;

const caseForContract = (caseId: string) =>
  prisma.case.findUnique({
    where: { id: caseId },
    select: { id: true, number: true, visaType: true, companyId: true, company: { select: { name: true } }, vacancy: { select: { title: true, profession: true } }, visaCategory: { select: { visaLabel: true, slug: true } } },
  });

export const contractContext = (c: { visaType: VisaType; visaCategory: { visaLabel: string; slug: string } | null }): ContractCheckContext => ({
  blueCard: isBlueCardCategory(c.visaCategory),
  visaType: c.visaType,
});

/** The case's contract (or null) with the check context, for the panel. */
export const loadContract = async (caseId: string) => {
  const c = await caseForContract(caseId);
  if (!c) throw notFound('CASE_NOT_FOUND');
  const row = await prisma.employmentContract.findUnique({ where: { caseId } });
  return {
    contract: row ? contractView(row) : null,
    context: { ...contractContext(c), companyId: c.companyId, companyName: c.company?.name ?? null },
  };
};

/** Creates or updates the case's contract (fields left out keep their value), recomputing checks and probation end. */
export const saveContract = async (caseId: string, body: ContractInput, userId: string) => {
  const c = await caseForContract(caseId);
  if (!c) throw notFound('CASE_NOT_FOUND');
  if (body.companyId && !(await prisma.company.count({ where: { id: body.companyId } }))) throw badRequest('INVALID_COMPANY');
  if (body.driveNodeId && !(await prisma.driveNode.count({ where: { id: body.driveNodeId, kind: 'FILE', deletedAt: null } }))) throw badRequest('INVALID_FILE');
  const before = await prisma.employmentContract.findUnique({ where: { caseId } });
  const prev = before ? contractView(before) : null;
  const pick = <K extends keyof ContractInput & keyof ContractView>(k: K, fallback: unknown = null) => (body[k] !== undefined ? body[k] : (prev?.[k] ?? fallback));

  const fields: ContractFields = {
    contractType: pick('contractType', c.visaType === 'AUSBILDUNG' ? 'AUSBILDUNG' : 'UNLIMITED') as ContractType,
    grossMonthly: pick('grossMonthly') as number | null,
    grossYearly: pick('grossYearly') as number | null,
    weeklyHours: pick('weeklyHours') as number | null,
    vacationDays: pick('vacationDays') as number | null,
    startDate: pick('startDate') as Date | null,
    endDate: pick('endDate') as Date | null,
    probationMonths: pick('probationMonths') as number | null,
  };
  // A salary given only one way is completed the other way (12 monthly salaries).
  const touchedSalary = body.grossMonthly !== undefined || body.grossYearly !== undefined;
  if (touchedSalary) {
    if (body.grossMonthly !== undefined && body.grossYearly === undefined) fields.grossYearly = fields.grossMonthly !== null ? money(fields.grossMonthly * 12) : null;
    if (body.grossYearly !== undefined && body.grossMonthly === undefined) fields.grossMonthly = fields.grossYearly !== null ? money(fields.grossYearly / 12) : null;
  }
  const computed = fields.startDate && fields.probationMonths ? probationEnd(fields.startDate, fields.probationMonths) : null;
  let probationEndsAt: Date | null;
  if (body.probationEndsAt !== undefined) probationEndsAt = body.probationEndsAt ?? computed;
  else if (body.startDate !== undefined || body.probationMonths !== undefined) probationEndsAt = computed;
  else probationEndsAt = prev?.probationEndsAt ?? computed;

  const settings = await getCaseAiSettings();
  const { blueCardCheck, warnings } = checkContract(fields, contractContext(c), settings);
  const data = {
    companyId: (pick('companyId', c.companyId) as string | null) ?? null,
    employerName: (pick('employerName', c.company?.name ?? null) as string | null) ?? null,
    jobTitle: pick('jobTitle') as string | null,
    ...fields,
    probationEndsAt,
    signedAt: pick('signedAt') as Date | null,
    driveNodeId: pick('driveNodeId') as string | null,
    note: pick('note') as string | null,
    blueCardCheck,
    warnings: warnings.length ? (warnings as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
    updatedById: userId,
  };
  const row = before
    ? await prisma.employmentContract.update({ where: { caseId }, data })
    : await prisma.employmentContract.create({ data: { ...data, caseId, createdById: userId } });
  return { contract: contractView(row), created: !before, case: c };
};

/** Panel fields proposed from the latest AI contract check of the case (not saved; staff review and save). */
export const prefillFromAi = async (caseId: string) => {
  const c = await caseForContract(caseId);
  if (!c) throw notFound('CASE_NOT_FOUND');
  const run = await prisma.caseAiRun.findFirst({ where: { caseId, kind: 'CONTRACT' }, orderBy: { createdAt: 'desc' } });
  if (!run) throw notFound('NO_CONTRACT_CHECK');
  const r = run.result as unknown as ContractResult;
  const t = r?.terms;
  if (!t) throw notFound('NO_CONTRACT_CHECK');
  const hours = t.weeklyHours ?? null;
  const monthly = t.grossMonthlySalary ?? (t.hourlyWage !== null && t.hourlyWage !== undefined ? money(t.hourlyWage * (hours ?? 40) * STATUTORY.weeksPerMonth) : null);
  const contractType: ContractType | null = c.visaType === 'AUSBILDUNG' ? 'AUSBILDUNG' : t.contractType === 'fixed_term' ? 'FIXED' : t.contractType === 'permanent' ? 'UNLIMITED' : null;
  return {
    runId: run.id,
    generatedAt: r.generatedAt ?? run.createdAt.toISOString(),
    file: r.file ? { name: r.file.name, nodeId: r.file.nodeId ?? null } : null,
    proposal: {
      employerName: t.employer?.name ?? null,
      jobTitle: t.position ?? null,
      contractType,
      grossMonthly: monthly,
      grossYearly: monthly !== null ? money(monthly * 12) : null,
      weeklyHours: hours,
      vacationDays: t.vacationDays ?? null,
      startDate: t.startDate ?? null,
      endDate: t.endDate ?? null,
      probationMonths: t.probationMonths ?? null,
      driveNodeId: r.file?.nodeId ?? null,
    },
  };
};

// ─── Lists ──────────────────────────────────────────────────────────────

export const CONTRACT_FILTERS = ['warnings', 'probation', 'all'] as const;
export type ContractFilter = (typeof CONTRACT_FILTERS)[number];
export const PROBATION_WINDOW_DAYS = 30;

/** Contracts with warnings, or whose probation ends within the next 30 days (open and closed cases). */
export const listContracts = async (filter: ContractFilter, now = new Date()) => {
  const where: Prisma.EmploymentContractWhereInput =
    filter === 'warnings'
      ? { warnings: { not: Prisma.DbNull } }
      : filter === 'probation'
        ? { probationEndsAt: { gte: new Date(now.getTime() - DAY), lte: new Date(now.getTime() + PROBATION_WINDOW_DAYS * DAY) } }
        : {};
  const rows = await prisma.employmentContract.findMany({
    where,
    orderBy: filter === 'probation' ? { probationEndsAt: 'asc' } : { updatedAt: 'desc' },
    take: 200,
  });
  const cases = await prisma.case.findMany({
    where: { id: { in: rows.map((r) => r.caseId) } },
    select: { id: true, number: true, status: true, client: { select: { id: true, firstName: true, lastName: true } }, assignedStaff: { select: { id: true, firstName: true, lastName: true } } },
  });
  const byId = new Map(cases.map((c) => [c.id, c]));
  const [warnings, probation] = await Promise.all([
    prisma.employmentContract.count({ where: { warnings: { not: Prisma.DbNull } } }),
    prisma.employmentContract.count({ where: { probationEndsAt: { gte: new Date(now.getTime() - DAY), lte: new Date(now.getTime() + PROBATION_WINDOW_DAYS * DAY) } } }),
  ]);
  return {
    items: rows.filter((r) => byId.has(r.caseId)).map((r) => ({ ...contractView(r), case: byId.get(r.caseId)! })),
    counts: { warnings, probation },
  };
};
