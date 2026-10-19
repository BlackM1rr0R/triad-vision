import { z } from 'zod';
import type { AnyAiTool } from '../types.js';
import { defineTool, localeOf } from './common.js';
import { partnerIdOf, staffIdOf } from './refs.js';
import { GROUP_BYS, METRICS, METRIC_GROUPS, findSettlementAnomalies, runReport, type ReportFilters } from '../../aiStaff/report.js';
import { listRiskyCases } from '../../aiStaff/risk.js';

/** Read-only reporting tools of the super-admin assistant: plain-words analytics, settlement anomalies, risky cases. */

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const VISA_TYPES = ['WORK', 'AUSBILDUNG', 'WEITERBILDUNG', 'JOB_SEEKER', 'STUDY', 'FAMILY', 'TOURIST'] as const;

const reportQuery = defineTool({
  name: 'report_query',
  description: `Safe analytics over the agency's data (no SQL). Pick a metric, optionally a groupBy and filters; returns a small table (≤50 rows) + totals; money in whole units per currency.
Metrics and their groupBys (first = default): ${Object.entries(METRIC_GROUPS)
    .map(([m, g]) => `${m} [${g.join('|')}]`)
    .join('; ')}.
cases = created in the date range; approvals / refusals / decisions = decided in the range (decisions adds approval rate); avg_days_per_step = days spent per case status; documents = uploads by status; invoices / payments = employer invoices issued / paid; settlements = the Hesablaşma ledger (agreed, received, shares and partner share paid / unpaid; by beneficiary, partner, stage, month or project; a row's month = visa date, else TLS date, else creation); partner_commissions; ai_spend (USD).
Filters: from / to (YYYY-MM-DD), partner (name, e.g. "İlqar"), staff (name or e-mail), visaType, project (settlement sheet), paid (paid|unpaid|all for settlements / commissions).`,
  schema: z.object({
    metric: z.enum(METRICS),
    groupBy: z.enum(GROUP_BYS).optional(),
    from: day.optional(),
    to: day.optional(),
    partner: z.string().max(120).optional(),
    staff: z.string().max(120).optional(),
    visaType: z.enum(VISA_TYPES).optional(),
    project: z.string().max(80).optional(),
    paid: z.enum(['paid', 'unpaid', 'all']).optional(),
  }),
  run: async (a) => {
    const f: ReportFilters = { from: a.from, to: a.to, visaType: a.visaType, project: a.project, paid: a.paid };
    const resolved: Record<string, string> = {};
    if (a.partner) {
      const p = await partnerIdOf(a.partner);
      f.partnerId = p.id;
      resolved.partner = p.name;
    }
    if (a.staff) {
      const s = await staffIdOf(a.staff);
      f.staffId = s.id;
      resolved.staff = `${s.firstName} ${s.lastName}`.trim();
    }
    const r = await runReport(a.metric, a.groupBy, f);
    return { ...r, filters: { ...(a.from ? { from: a.from } : {}), ...(a.to ? { to: a.to } : {}), ...resolved, ...(a.visaType ? { visaType: a.visaType } : {}), ...(a.project ? { project: a.project } : {}), ...(a.paid ? { paid: a.paid } : {}) } };
  },
});

const ANOMALY_TYPES = ['OVER_ALLOCATED', 'RULE_MISMATCH', 'SHARES_WITHOUT_PAYMENT', 'REFUSED_BUT_PAID', 'DUPLICATE_CLIENT', 'CASE_STAGE_MISMATCH'] as const;

const settlementAnomalies = defineTool({
  name: 'settlement_anomalies',
  description:
    'Finds settlement (Hesablaşma) rows that look wrong: OVER_ALLOCATED (shares + partner share + expenses > payment), RULE_MISMATCH (a share differs from the split rule by more than the tolerance; manual overrides show up here), SHARES_WITHOUT_PAYMENT, REFUSED_BUT_PAID (refused/cancelled but something paid), DUPLICATE_CLIENT (same client name twice, e.g. in two projects), CASE_STAGE_MISMATCH (linked case status implies another stage). Read-only; fix rows with settlement_update after asking.',
  schema: z.object({
    project: z.string().max(80).optional(),
    toleranceUnits: z.number().min(0).max(10000).default(5).describe('allowed difference in whole currency units (also at least 5 % of the rule value)'),
    types: z.array(z.enum(ANOMALY_TYPES)).max(6).optional(),
  }),
  run: async (a) => findSettlementAnomalies({ project: a.project, toleranceUnits: a.toleranceUnits, types: a.types }),
});

const riskyCases = defineTool({
  name: 'risky_cases',
  description:
    'Open cases that need attention (deterministic rules): documents waiting for review > 3 days, client silent after a change request > 7 days, no activity > 14 days, embassy appointment in < 7 days with missing documents, passport expiring within 6 months, signature request expiring within 3 days, overdue translation order. Each risk has a severity (high/medium/low) and a suggested action. Filter by staff member (name / e-mail, or "none" for unassigned) and minimum severity.',
  schema: z.object({
    staff: z.string().max(120).optional(),
    minSeverity: z.enum(['high', 'medium', 'low']).default('medium'),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  run: async (a, ctx) => {
    const staffId = a.staff ? (a.staff.trim().toLowerCase() === 'none' ? 'none' : (await staffIdOf(a.staff)).id) : undefined;
    const all = await listRiskyCases({ staffId, minSeverity: a.minSeverity, locale: localeOf(ctx) });
    return {
      count: all.length,
      high: all.filter((c) => c.severity === 'high').length,
      items: all.slice(0, a.limit).map((c) => ({
        case: c.number,
        client: c.clientName,
        status: c.status,
        staff: c.staff?.name ?? null,
        severity: c.severity,
        risks: c.risks.map((r) => ({ severity: r.severity, risk: r.title, action: r.suggestion })),
      })),
    };
  },
});

export const reportTools: AnyAiTool[] = [reportQuery, settlementAnomalies, riskyCases];

/** Appended to the admin system prompt. */
export const reportPrompt = `
### Reports in plain words (read-only)
- report_query answers questions about numbers: cases, approvals / refusals / decisions, average days per step, documents, invoices / payments, the settlement ledger (paid / unpaid per beneficiary, partner, stage, month, project), partner commissions and AI spend — with filters for a date range, partner, staff member, visa type and project. Combine several calls for one question (e.g. "Bu ay İlqarın gətirdiyi müştərilərdən neçəsi viza alıb və nə qədər pul ödənilməyib?" → report_query metric=approvals partner=İlqar from=<first day of this month>, then metric=settlements groupBy=beneficiary partner=İlqar paid=unpaid). "This month" etc. are relative to today's date; say which period you used.
- settlement_anomalies lists ledger rows that break the split rule or contradict their case; explain each briefly and offer to fix them (settlement_update, with confirmation).
- risky_cases lists open cases that need attention with severity and a suggested action.
Answer with the numbers in a short sentence or a compact table; never invent numbers the tools did not return.`.trim();
