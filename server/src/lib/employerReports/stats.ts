import { prisma } from '../../db.js';
import { bakuMidnight, bakuParts } from '../reports/dates.js';
import { plannedArrival } from '../requests/workers.js';
import { buildPanel, PHASES, type NextAction, type Phase, type PanelRow, type SafeRiskCode } from '../employerWorkers/panel.js';
import type { Stage } from '../requests/workers.js';
import type { ReportLang } from './texts.js';

/**
 * Numbers of the monthly employer report. The report month is a calendar month in Asia/Baku (the time zone
 * every scheduled job of the system uses); "now"-type facts (status, upcoming 60 days, open items, risks) are
 * taken at generation time, normally the 1st of the following month. Built from the same employer-safe panel
 * rows as the portal, so the report never shows more than the employer sees online.
 */

const DAY = 24 * 60 * 60 * 1000;
export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const UPCOMING_DAYS = 60;
export const CHECKIN_RATE_DAYS = 183;

export interface ReportStats {
  month: string;
  lang: ReportLang;
  generatedAt: string;
  company: { id: string; name: string };
  period: { from: string; to: string; newPlacements: number; approvals: number; arrivals: number; departures: number };
  phases: Record<Phase, number>;
  workers: {
    name: string;
    position: string;
    phase: Phase;
    stage: Stage;
    arrival: string | null;
    title: { kind: 'VISA' | 'RESIDENCE'; until: string; warn: string } | null;
    probationEnd: string | null;
    probationWarn: string | null;
    risk: 'LOW' | 'MEDIUM' | 'HIGH' | null;
    nextAction: NextAction;
  }[];
  upcoming: { code: 'ARRIVAL' | 'PROBATION_END' | 'TITLE_EXPIRY' | 'APPOINTMENT'; at: string; name: string }[];
  risks: { name: string; level: 'MEDIUM' | 'HIGH'; reasons: { code: SafeRiskCode; params?: Record<string, number> }[] }[];
  actions: { name: string; action: NextAction }[];
  checkIns: { employer: { sent: number; answered: number; rate: number | null }; worker: { sent: number; answered: number; rate: number | null } };
  openItems: { name: string; kind: string; title: string }[];
  totals: { workers: number; working: number; inProcess: number; atRisk: number; openItems: number };
}

/** [start, end) of a "YYYY-MM" month in Baku time. */
export const monthRange = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return { start: bakuMidnight(y, m - 1, 1), end: bakuMidnight(y, m, 1) };
};

/** The month before the one `now` falls into (Baku), as "YYYY-MM". */
export const previousMonth = (now = new Date()) => {
  const p = bakuParts(now);
  const d = new Date(Date.UTC(p.y, p.m - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/** Last calendar day of a 'YYYY-MM' month as 'YYYY-MM-DD'. */
const lastDay = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
};
const inRange = (d: Date | null | undefined, r: { start: Date; end: Date }) => !!d && d >= r.start && d < r.end;
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const rate = (answered: number, sent: number) => (sent ? Math.round((answered / sent) * 100) : null);

export const computeReportStats = async (companyId: string, month: string, lang: ReportLang, now = new Date()): Promise<ReportStats> => {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { id: true, name: true } });
  const range = monthRange(month);
  const rows = await buildPanel(companyId, now);

  const [newPlacements, approvals, checkIns] = await Promise.all([
    prisma.case.count({ where: { companyId, createdAt: { gte: range.start, lt: range.end } } }),
    prisma.case.count({ where: { companyId, status: 'APPROVED', decisionAt: { gte: range.start, lt: range.end } } }),
    prisma.arrivalCheckIn.findMany({
      where: { followUp: { case: { companyId } }, sentAt: { gte: new Date(range.end.getTime() - CHECKIN_RATE_DAYS * DAY), lt: range.end } },
      select: { audience: true, answeredAt: true },
    }),
  ]);
  const arrivals = rows.filter((r) => inRange(r.arrivedAt, range)).length;
  const departures = rows.filter((r) => inRange(r.leftAt, range)).length;

  // Workers who matter this month: everyone not closed, plus those who left during the month.
  const relevant = rows.filter((r) => r.phase !== 'CLOSED' && (r.phase !== 'LEFT' || (r.leftAt && r.leftAt >= range.start)));
  const phases = Object.fromEntries(PHASES.map((p) => [p, relevant.filter((r) => r.phase === p).length])) as Record<Phase, number>;
  const order: Record<Phase, number> = { WORKING: 0, TRAVELLING: 1, IN_PROCESS: 2, LEFT: 3, CLOSED: 4 };
  const sorted = [...relevant].sort((a, b) => order[a.phase] - order[b.phase] || a.name.localeCompare(b.name));

  const horizon = new Date(now.getTime() + UPCOMING_DAYS * DAY);
  const upcoming: ReportStats['upcoming'] = [];
  const soon = (d: Date | null | undefined) => !!d && d > now && d <= horizon;
  for (const r of relevant) {
    if (r.phase === 'LEFT') continue;
    const a = plannedArrival(r);
    if ((r.phase === 'TRAVELLING' || r.phase === 'IN_PROCESS') && soon(a)) upcoming.push({ code: 'ARRIVAL', at: a!.toISOString(), name: r.name });
    if (r.phase === 'IN_PROCESS' && soon(r.appointmentAt)) upcoming.push({ code: 'APPOINTMENT', at: r.appointmentAt!.toISOString(), name: r.name });
    if (r.probation && soon(r.probation.endsAt)) upcoming.push({ code: 'PROBATION_END', at: r.probation.endsAt.toISOString(), name: r.name });
    if (r.title && soon(r.title.validUntil)) upcoming.push({ code: 'TITLE_EXPIRY', at: r.title.validUntil.toISOString(), name: r.name });
  }
  upcoming.sort((a, b) => a.at.localeCompare(b.at));

  const active = relevant.filter((r) => r.phase !== 'LEFT');
  const risks = active
    .filter((r): r is PanelRow & { risk: NonNullable<PanelRow['risk']> } => !!r.risk && r.risk.level !== 'LOW')
    .sort((a, b) => (a.risk.level === b.risk.level ? 0 : a.risk.level === 'HIGH' ? -1 : 1))
    .map((r) => ({ name: r.name, level: r.risk.level as 'MEDIUM' | 'HIGH', reasons: r.risk.reasons }));
  const actions = active.filter((r) => r.nextAction !== 'NONE').map((r) => ({ name: r.name, action: r.nextAction }));
  const openItems = active.flatMap((r) => r.openItems.map((i) => ({ name: r.name, kind: i.kind, title: i.title })));

  const sent = (aud: 'EMPLOYER' | 'WORKER') => checkIns.filter((c) => c.audience === aud);
  const emp = sent('EMPLOYER');
  const wrk = sent('WORKER');

  return {
    month,
    lang,
    generatedAt: now.toISOString(),
    company,
    period: { from: `${month}-01`, to: lastDay(month), newPlacements, approvals, arrivals, departures },
    phases,
    workers: sorted.map((r) => ({
      name: r.name,
      position: r.position,
      phase: r.phase,
      stage: r.stage,
      arrival: iso(r.arrivedAt ?? plannedArrival(r)),
      title: r.title ? { kind: r.title.kind, until: r.title.validUntil.toISOString(), warn: r.title.warn } : null,
      probationEnd: iso(r.probation?.endsAt),
      probationWarn: r.probation?.warn ?? null,
      risk: r.risk?.level ?? null,
      nextAction: r.nextAction,
    })),
    upcoming,
    risks,
    actions,
    checkIns: {
      employer: { sent: emp.length, answered: emp.filter((c) => c.answeredAt).length, rate: rate(emp.filter((c) => c.answeredAt).length, emp.length) },
      worker: { sent: wrk.length, answered: wrk.filter((c) => c.answeredAt).length, rate: rate(wrk.filter((c) => c.answeredAt).length, wrk.length) },
    },
    openItems,
    totals: {
      workers: active.length,
      working: phases.WORKING,
      inProcess: phases.IN_PROCESS,
      atRisk: risks.length,
      openItems: openItems.length,
    },
  };
};
