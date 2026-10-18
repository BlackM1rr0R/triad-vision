import { z } from 'zod';
import type { SettlementStage } from '@prisma/client';
import { prisma } from '../../../db.js';
import { badRequest, notFound } from '../../http.js';
import { audit } from '../../audit.js';
import { listBeneficiaries, loadRows, syncCommission, totalsOf, type RowDto } from '../../settlement/service.js';
import { STAGES, applyChanges, markPaid, nextSortOrder, type Change, type ChangeValue } from '../../settlement/save.js';
import { linkCase, suggestCases } from '../../settlement/link.js';
import { buildSummary } from '../../settlement/summary.js';
import { parseAmount, splitName } from '../../settlement/parse.js';
import { PARTNER_KEY } from '../../settlement/split.js';
import type { AiToolContext, AnyAiTool } from '../types.js';
import { actorReq, bag, clip, defineTool, money, tr } from './common.js';
import { foldName } from './paths.js';
import { caseIdOf, partnerIdOf } from './refs.js';

/**
 * Settlement ledger ("Hesablaşmalar") tools. Reads use lib/settlement/service (rows with computed shares,
 * linked rows synced with their case first); writes go through the ledger's own batch save / markPaid /
 * linkCase, so partner commissions stay in sync, with the same audit actions as the admin routes.
 */

const via = { via: 'ai' } as const;
const stage = z.enum(STAGES as [SettlementStage, ...SettlementStage[]]);
const month = z.string().regex(/^\d{4}-\d{2}$/).describe('YYYY-MM');

type Ben = Awaited<ReturnType<typeof listBeneficiaries>>[number];

const partnerNames = async () => new Map((await prisma.referralPartner.findMany({ select: { id: true, name: true } })).map((p) => [p.id, p.name]));

/** Compact row for the model: money in major units with currency. */
const rowBrief = (r: RowDto, bens: Ben[], partners: Map<string, string>) => ({
  id: r.id,
  project: r.project,
  client: r.clientName,
  ...(r.licence ? { licence: r.licence } : {}),
  ...(r.case ? { case: `${r.case.number} (${r.case.status})`, caseId: r.case.id } : {}),
  partner: r.partnerId ? (partners.get(r.partnerId) ?? r.partnerId) : null,
  stage: r.stage,
  month: r.month,
  ...(r.tlsDate ? { tls: r.tlsDate } : {}),
  ...(r.visaDate ? { visa: r.visaDate } : {}),
  amount: money(r.amountCents, r.currency),
  ...(r.payAfterVisa ? { payAfterVisa: true } : {}),
  paid: money(r.paidCents, r.currency),
  ...(r.partnerShareCents ? { partnerShare: `${money(r.partnerShareCents, r.partnerShareCurrency)}${r.partnerPaid ? ' PAID' : ' pending'}` } : {}),
  ...(r.expensesCents ? { expenses: money(r.expensesCents, r.currency) } : {}),
  ...(r.netCents != null ? { net: money(r.netCents, r.currency) } : {}),
  shares: Object.fromEntries(
    bens
      .filter((b) => b.active)
      .map((b) => {
        const s = r.shares[b.id];
        return [b.name, s ? (s.text ? s.text : `${money(s.cents, s.currency)} ${s.status}`) : null];
      }),
  ),
  ...(r.employer ? { employer: r.employer } : {}),
  ...(r.note ? { note: clip(r.note, 200) } : {}),
});

const settlementQuery = defineTool({
  name: 'settlement_query',
  description: 'Rows of the settlement ledger with computed shares (Xalid, Tofig, Abdulla, Team) and totals. Filters: project (sheet), partner (name / id / "none"), stage, month (YYYY-MM by visa date, else TLS date, else creation), unpaid (some share still pending), q (client / employer / note text).',
  schema: z.object({
    project: z.string().trim().max(80).optional(),
    partner: z.string().trim().max(120).optional(),
    stage: stage.optional(),
    month: month.optional(),
    unpaid: z.boolean().optional(),
    q: z.string().trim().max(100).optional(),
    offset: z.number().int().min(0).default(0),
    limit: z.number().int().min(1).max(200).default(50),
  }),
  run: async (a) => {
    const partnerId = a.partner ? (a.partner === 'none' ? 'none' : (await partnerIdOf(a.partner)).id) : undefined;
    const { rows, beneficiaries } = await loadRows({ project: a.project || undefined, partnerId, stage: a.stage, month: a.month, unpaid: a.unpaid, q: a.q || undefined });
    // Client names with ə / ı are not matched by the database collation: refine in memory.
    const list = a.q && !rows.length ? (await loadRows({ project: a.project || undefined, partnerId, stage: a.stage, month: a.month, unpaid: a.unpaid })).rows.filter((r) => foldName(`${r.clientName} ${r.employer ?? ''} ${r.note ?? ''}`).includes(foldName(a.q!))) : rows;
    const t = totalsOf(list, beneficiaries);
    const partners = await partnerNames();
    const page = list.slice(a.offset, a.offset + a.limit);
    return {
      count: list.length,
      offset: a.offset,
      ...(a.offset + page.length < list.length ? { nextOffset: a.offset + page.length } : {}),
      totals: {
        amount: bag(t.amount),
        received: bag(t.paid),
        expenses: bag(t.expenses),
        partner: { total: bag(t.partner.total), pending: bag(t.partner.pending), paid: bag(t.partner.paid) },
        shares: Object.fromEntries(beneficiaries.filter((b) => b.active).map((b) => [b.name, { total: bag(t.shares[b.id]?.total ?? {}), pending: bag(t.shares[b.id]?.pending ?? {}), paid: bag(t.shares[b.id]?.paid ?? {}) }])),
      },
      rows: page.map((r) => rowBrief(r, beneficiaries, partners)),
    };
  },
});

const settlementSummary = defineTool({
  name: 'settlement_summary',
  description: 'Report of the ledger for a month (default: this month) and overall: per beneficiary owed (pending) / paid, per partner commissions pending / paid, rows per stage, revenue agreed / received.',
  schema: z.object({ month: month.optional() }),
  run: async (a) => {
    const s = await buildSummary(a.month);
    return {
      month: s.month,
      rows: s.rows,
      beneficiaries: s.beneficiaries.map((b) => ({ name: b.name, rule: b.rule, monthPending: bag(b.month.pending), monthPaid: bag(b.month.paid), owed: bag(b.overall.pending), paidOverall: bag(b.overall.paid) })),
      partners: s.partners.map((p) => ({ name: p.name, clients: p.clients, pending: bag(p.pending), paid: bag(p.paid), thisMonth: bag(p.month) })),
      stages: s.stages,
      stagesThisMonth: s.stagesMonth,
      revenue: { agreed: bag(s.revenue.agreed), received: bag(s.revenue.received), expenses: bag(s.revenue.expenses), monthAgreed: bag(s.revenue.monthAgreed), monthReceived: bag(s.revenue.monthReceived) },
    };
  },
});

// ─── Changes ─────────────────────────────────────────────────────────

/** Friendly money fields in major units → the ledger's cent fields. */
const MONEY_ALIASES: Record<string, string> = { amount: 'amountCents', paid: 'paidCents', partnerShare: 'partnerShareCents', expenses: 'expensesCents' };
const FIELDS = ['project', 'clientName', 'licence', 'employer', 'tlsDate', 'visaDate', 'stage', 'stageAuto', 'currency', 'payAfterVisa', 'partnerShareCurrency', 'note', 'partner', 'partnerPaid', ...Object.keys(MONEY_ALIASES)];

const changeValue = z.union([z.string().max(5000), z.number(), z.boolean(), z.null()]);

/**
 * Model change → ledger change: "amount" etc. in major units, "partner" by name, "share:Xalid" /
 * "shareStatus:Tofig" by beneficiary name.
 */
export const toLedgerChanges = async (changes: { id: string; field: string; value: string | number | boolean | null }[]): Promise<Change[]> => {
  const bens = await listBeneficiaries();
  const benId = (name: string) => {
    const b = bens.find((x) => x.id === name) ?? bens.find((x) => foldName(x.name) === foldName(name));
    if (!b) throw badRequest(`BENEFICIARY_NOT_FOUND: ${name} (${bens.map((x) => x.name).join(', ')})`);
    return b.id;
  };
  const out: Change[] = [];
  for (const c of changes) {
    let field = c.field.trim();
    let v: ChangeValue = c.value;
    if (MONEY_ALIASES[field]) {
      field = MONEY_ALIASES[field];
      if (typeof v === 'number') v = Math.round(v * 100);
    } else if (field === 'partner' || field === 'partnerId') {
      field = 'partnerId';
      v = v === null || v === '' ? null : (await partnerIdOf(String(v))).id;
    } else if (/^share(Status)?:/i.test(field)) {
      const [kind, name] = [field.slice(0, field.indexOf(':')), field.slice(field.indexOf(':') + 1)];
      field = `${kind.toLowerCase() === 'sharestatus' ? 'shareStatus' : 'share'}:${benId(name)}`;
      if (kind.toLowerCase() === 'share' && typeof v === 'number') v = String(v);
    }
    out.push({ id: c.id, field, value: v });
  }
  return out;
};

const describeRows = async (ids: string[]) => {
  const rows = await prisma.settlementEntry.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, clientName: true, project: true } });
  return new Map(rows.map((r) => [r.id, `${r.clientName} (${r.project})`]));
};

const settlementUpdate = defineTool({
  name: 'settlement_update',
  description: `Batch change of ledger rows (one confirm for all). Fields: ${FIELDS.join(', ')}, "share:<beneficiary name>" (manual share: "500", "500 EUR", "rawot" or null = back to the rule) and "shareStatus:<beneficiary name>" ("PAID"/"PENDING"). Money fields amount / paid / partnerShare / expenses are in major units (3000 = 3000 AZN); partner by name; dates "YYYY-MM-DD"; stage ${STAGES.join('/')}. Each change is validated on its own.`,
  confirm: true,
  schema: z.object({ changes: z.array(z.object({ id: z.string().trim().min(1).max(40), field: z.string().trim().min(1).max(80), value: changeValue })).min(1).max(2000) }),
  summary: async (a, ctx) => {
    const names = await describeRows(a.changes.map((c) => c.id));
    const sample = a.changes.slice(0, 6).map((c) => `${names.get(c.id) ?? c.id}: ${c.field} = ${c.value === null ? '∅' : String(c.value).slice(0, 40)}`);
    const more = a.changes.length > 6 ? ` +${a.changes.length - 6}` : '';
    return tr(ctx, { az: `Hesablaşmada ${a.changes.length} dəyişiklik: ${sample.join('; ')}${more}`, de: `${a.changes.length} Änderung(en) in der Abrechnung: ${sample.join('; ')}${more}`, en: `${a.changes.length} change(s) in the settlement ledger: ${sample.join('; ')}${more}`, ru: `${a.changes.length} изменени(й) в расчётах: ${sample.join('; ')}${more}` });
  },
  run: async (a, ctx) => {
    const changes = await toLedgerChanges(a.changes);
    const { results, touched } = await applyChanges(changes);
    const saved = results.filter((r) => r.ok).length;
    if (saved) {
      await audit(actorReq(ctx), 'SETTLEMENT_SAVED', undefined, { changes: saved, failed: results.length - saved, rows: touched.length, fields: [...new Set(results.filter((r) => r.ok).map((r) => r.field.split(':')[0]))].slice(0, 30), ...via });
    }
    const fresh = touched.length ? await loadRows({ ids: touched }) : null;
    const partners = await partnerNames();
    return { saved, failed: results.length - saved, errors: results.filter((r) => !r.ok), rows: fresh ? fresh.rows.map((r) => rowBrief(r, fresh.beneficiaries, partners)) : [] };
  },
});

const settlementMarkPaid = defineTool({
  name: 'settlement_mark_paid',
  description: 'Marks shares of ledger rows as paid (or unpaid with paid: false). beneficiary: a beneficiary name (Xalid, Tofig, Abdulla, Team), "partner" for the partner commission, or "*" for every share of the row. A paid share is frozen at its current amount.',
  confirm: true,
  schema: z.object({
    items: z.array(z.object({ id: z.string().trim().min(1).max(40), beneficiary: z.string().trim().min(1).max(80) })).min(1).max(2000),
    paid: z.boolean().default(true),
  }),
  summary: async (a, ctx) => {
    const names = await describeRows(a.items.map((i) => i.id));
    const sample = a.items.slice(0, 6).map((i) => `${names.get(i.id) ?? i.id} → ${i.beneficiary === '*' ? tr(ctx, { az: 'hamısı', de: 'alle', en: 'all', ru: 'все' }) : i.beneficiary}`);
    const more = a.items.length > 6 ? ` +${a.items.length - 6}` : '';
    return a.paid
      ? tr(ctx, { az: `Ödənildi kimi qeyd et: ${sample.join('; ')}${more}`, de: `Als bezahlt markieren: ${sample.join('; ')}${more}`, en: `Mark as paid: ${sample.join('; ')}${more}`, ru: `Отметить как оплаченное: ${sample.join('; ')}${more}` })
      : tr(ctx, { az: `Ödənilməyib kimi qeyd et: ${sample.join('; ')}${more}`, de: `Als unbezahlt markieren: ${sample.join('; ')}${more}`, en: `Mark as unpaid: ${sample.join('; ')}${more}`, ru: `Отметить как неоплаченное: ${sample.join('; ')}${more}` });
  },
  run: async (a, ctx) => {
    const bens = await listBeneficiaries();
    const keyOf = (b: string) => {
      if (b === '*') return '*';
      if (['partner', '_partner', 'partnyor', 'sanani'].includes(foldName(b))) return PARTNER_KEY;
      const hit = bens.find((x) => x.id === b) ?? bens.find((x) => foldName(x.name) === foldName(b));
      if (!hit) throw badRequest(`BENEFICIARY_NOT_FOUND: ${b}`);
      return hit.id;
    };
    const items = a.items.map((i) => ({ id: i.id, key: keyOf(i.beneficiary) }));
    const touched = await markPaid(items, a.paid);
    await audit(actorReq(ctx), a.paid ? 'SETTLEMENT_SHARE_PAID' : 'SETTLEMENT_SHARE_UNPAID', touched.length === 1 ? touched[0] : undefined, { count: items.length, keys: [...new Set(items.map((i) => i.key))].slice(0, 20), ...via });
    const fresh = touched.length ? await loadRows({ ids: touched }) : null;
    const partners = await partnerNames();
    return { updated: touched.length, notFound: [...new Set(a.items.map((i) => i.id))].filter((id) => !touched.includes(id)), rows: fresh ? fresh.rows.map((r) => rowBrief(r, fresh.beneficiaries, partners)) : [] };
  },
});

const settlementAddRow = defineTool({
  name: 'settlement_add_row',
  description: 'Adds a row to the ledger. amount: "3000 manat", "1500 EUR", "2000azn/2000azn viza sonrasi" or a number in major units; partnerShare in major units (currency partnerShareCurrency, default EUR); case: id / number / client name to link it (the row then follows the case).',
  confirm: true,
  schema: z.object({
    project: z.string().trim().min(1).max(80).default('Ümumi'),
    clientName: z.string().trim().min(1).max(160).describe('"Name Surname" — a licence in brackets "(CE)" goes to its own column.'),
    partner: z.string().trim().max(120).optional(),
    employer: z.string().trim().max(160).optional(),
    amount: z.union([z.string().max(60), z.number()]).optional(),
    currency: z.enum(['AZN', 'EUR']).optional(),
    partnerShare: z.number().min(0).max(1e8).optional(),
    partnerShareCurrency: z.enum(['AZN', 'EUR']).optional(),
    case: z.string().trim().max(120).optional(),
    note: z.string().max(5000).optional(),
  }),
  summary: async (a, ctx) => {
    const amount = a.amount !== undefined ? ` · ${a.amount}${typeof a.amount === 'number' ? ` ${a.currency ?? 'AZN'}` : ''}` : '';
    const p = a.partner ? ` · ${a.partner}${a.partnerShare ? ` ${a.partnerShare} ${a.partnerShareCurrency ?? 'EUR'}` : ''}` : '';
    return tr(ctx, { az: `Hesablaşmaya yeni sətir (${a.project}): ${a.clientName}${amount}${p}`, de: `Neue Abrechnungszeile (${a.project}): ${a.clientName}${amount}${p}`, en: `New ledger row (${a.project}): ${a.clientName}${amount}${p}`, ru: `Новая строка расчётов (${a.project}): ${a.clientName}${amount}${p}` });
  },
  run: async (a, ctx) => {
    const partnerId = a.partner ? (await partnerIdOf(a.partner)).id : null;
    const caseId = a.case ? await caseIdOf(a.case, ctx) : null;
    const amount = a.amount === undefined ? null : parseAmount(a.amount, a.currency ?? null);
    const sn = splitName(a.clientName);
    const created = await prisma.settlementEntry.create({
      data: {
        project: a.project,
        clientName: sn.name || a.clientName,
        licence: sn.licence,
        employer: a.employer ?? null,
        partnerId,
        caseId,
        amountCents: amount?.amountCents ?? null,
        currency: a.currency ?? amount?.currency ?? 'AZN',
        payAfterVisa: !!amount?.payAfterVisa,
        partnerShareCents: a.partnerShare != null ? Math.round(a.partnerShare * 100) : null,
        partnerShareCurrency: a.partnerShareCurrency ?? 'EUR',
        note: a.note ?? sn.note ?? null,
        sortOrder: await nextSortOrder(a.project),
        createdById: ctx.user.id,
        ...(caseId ? { stageAuto: true } : {}),
      },
    });
    if (caseId) await linkCase(created.id, caseId);
    else await syncCommission(created.id);
    await audit(actorReq(ctx), 'SETTLEMENT_CREATED', created.id, { project: created.project, ...via });
    const fresh = await loadRows({ ids: [created.id] });
    return { row: rowBrief(fresh.rows[0], fresh.beneficiaries, await partnerNames()) };
  },
});

const settlementLinkCase = defineTool({
  name: 'settlement_link_case',
  description: 'Links a ledger row to a case (stage, TLS / visa dates and partner then follow the case) or unlinks it with case: null. Use settlement_case_suggestions first to find the right case.',
  confirm: true,
  schema: z.object({ id: z.string().trim().min(1).max(40), case: z.string().trim().max(120).nullable() }),
  summary: async (a, ctx) => {
    const names = await describeRows([a.id]);
    const row = names.get(a.id) ?? a.id;
    return a.case
      ? tr(ctx, { az: `"${row}" sətrini ${a.case} müraciətinə bağla`, de: `Zeile „${row}“ mit dem Antrag ${a.case} verknüpfen`, en: `Link row "${row}" to case ${a.case}`, ru: `Связать строку «${row}» с заявкой ${a.case}` })
      : tr(ctx, { az: `"${row}" sətrinin müraciət bağlantısını sil`, de: `Verknüpfung von „${row}“ lösen`, en: `Unlink row "${row}" from its case`, ru: `Отвязать строку «${row}» от заявки` });
  },
  run: async (a, ctx) => {
    const e = await prisma.settlementEntry.findUnique({ where: { id: a.id }, select: { id: true } });
    if (!e) throw notFound('ENTRY_NOT_FOUND');
    const caseId = a.case ? await caseIdOf(a.case, ctx) : null;
    await linkCase(a.id, caseId);
    await audit(actorReq(ctx), caseId ? 'SETTLEMENT_LINKED' : 'SETTLEMENT_UNLINKED', a.id, { caseId, ...via });
    const fresh = await loadRows({ ids: [a.id] });
    return { row: rowBrief(fresh.rows[0], fresh.beneficiaries, await partnerNames()) };
  },
});

const settlementSuggestCases = defineTool({
  name: 'settlement_case_suggestions',
  description: 'Cases whose client name matches a ledger row (for settlement_link_case).',
  schema: z.object({ id: z.string().trim().min(1).max(40) }),
  run: async (a: { id: string }, _ctx: AiToolContext) => {
    const e = await prisma.settlementEntry.findUnique({ where: { id: a.id }, select: { clientName: true } });
    if (!e) throw notFound('ENTRY_NOT_FOUND');
    return { client: e.clientName, suggestions: await suggestCases(e.clientName) };
  },
});

export const settlementTools: AnyAiTool[] = [settlementQuery, settlementSummary, settlementSuggestCases, settlementUpdate, settlementMarkPaid, settlementAddRow, settlementLinkCase];
