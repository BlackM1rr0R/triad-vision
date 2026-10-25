import crypto from 'node:crypto';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import type { Prisma, SettlementEntry, SettlementStage } from '@prisma/client';
import { prisma } from '../../db.js';
import { badRequest, notFound } from '../http.js';
import { parseMemberInfo, FAMILY_EVENT } from '../journey/family.js';
import { storedShares } from './split.js';
import { nameScore, normaliseName } from './parse.js';
import { getSettings, listBeneficiaries, syncCommission, syncEntriesWithCases } from './service.js';
import {
  TEMPLATE_DOC,
  buildShares,
  companyScore,
  normaliseTable,
  parseCsv,
  personKey,
  templateHeaders,
  toCsv,
  type Cell,
  type NormalisedRow,
} from './rowImportParse.js';

/**
 * Row import of the settlement ledger (CSV / XLSX in the template format), with a preview the admin corrects
 * before anything is written:
 *
 *  1. preview  — parse + normalise the file, match each row to an existing case (client name, Azerbaijani / Latin
 *                spellings, any name order), the employer to a Company, the intermediary to a ReferralPartner and the
 *                share columns to SettlementBeneficiary records; flag duplicates of existing ledger rows.
 *  2. confirm  — the rows the admin kept (with the chosen case / company / partner / beneficiary per row) are
 *                written in ONE transaction; every entry carries the batch id in `shares._import` (metadata keys
 *                start with "_" and are ignored by the split), and the batch (entry ids + a fingerprint of each row
 *                as imported) is kept in Setting `settlement.importBatch.<id>` — the schema has no batch table.
 *  3. undo     — deletes the batch's entries (and what the batch created: partners, beneficiaries, placeholder
 *                companies, when nothing else uses them) as long as no entry was edited since.
 */

const BATCH_PREFIX = 'settlement.importBatch.';
export const IMPORT_META_KEY = '_import';

// ─── File reading ─────────────────────────────────────────────────────

const xlsxCell = (cell: ExcelJS.Cell): Cell => {
  const v = cell.value as unknown;
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'number' || typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  const o = v as { richText?: { text: string }[]; text?: unknown; result?: unknown; error?: unknown };
  if (o.richText) return o.richText.map((r) => r.text).join('');
  if ('result' in o) return o.result instanceof Date || typeof o.result === 'number' || typeof o.result === 'string' ? o.result : null;
  if ('text' in o) return o.text == null ? null : String(o.text);
  return null;
};

/** CSV / XLSX buffer → table of cells (XLSX: the "Import" sheet, else the first sheet). */
export const readTable = async (buffer: Buffer, fileName: string): Promise<Cell[][]> => {
  const isXlsx = buffer.subarray(0, 2).toString('latin1') === 'PK';
  if (!isXlsx) {
    if (/\.xlsx$/i.test(fileName)) throw badRequest('INVALID_XLSX');
    const text = buffer.toString('utf8');
    if (text.includes('\u0000')) throw badRequest('INVALID_CSV');
    return parseCsv(text);
  }
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw badRequest('INVALID_XLSX');
  }
  const ws = wb.worksheets.find((w) => /^(import|idxal|daten|data)$/i.test(w.name.trim())) ?? wb.worksheets[0];
  if (!ws) throw badRequest('INVALID_XLSX');
  const out: Cell[][] = [];
  const width = Math.min(ws.columnCount, 80);
  for (let r = 1; r <= Math.min(ws.rowCount, 5000); r++) {
    const row = ws.getRow(r);
    const cells: Cell[] = [];
    for (let c = 1; c <= width; c++) cells.push(xlsxCell(row.getCell(c)));
    out.push(cells);
  }
  return out;
};

// ─── Template ─────────────────────────────────────────────────────────

const EXAMPLES = (bens: string[]) => {
  const ben = (vals: Record<string, [string, string]>) => bens.flatMap((n) => vals[n] ?? ['', '']);
  return [
    ['Proyekt 1', 'Partner A', 'Nümunə Müştəri (CE)', '', 'Example Logistik GmbH', '01.06.2026', '09.07.2026', '', '3000', 'AZN', 'no', '', '', ...ben({ Xalid: ['1000', 'AZN'], Tofig: ['900', 'AZN'], Abdulla: ['900', 'AZN'], Team: ['200', 'AZN'] }), '', '', ''],
    ['Partner B', 'Partner B', 'Test Client', '', 'Sample Transport', '', '', '', '1500', 'EUR', 'yes', '500', 'EUR', ...ben({}), '', '', 'shares empty = computed by the rule'],
    ['Partner B', 'Partner B', 'Demo Person', '', '', '10.08.2026', '', 'atkaz', '3000', 'AZN', '', '500', 'EUR', ...ben({ Xalid: ['rawot', ''], Tofig: ['rawot', ''], Abdulla: ['rawot', ''] }), '', '', 'refusal: every share is cancelled'],
  ];
};

const activeBenNames = async () => (await listBeneficiaries()).filter((b) => b.active).map((b) => b.name);

export const templateCsv = async () => {
  const names = await activeBenNames();
  return `﻿${toCsv([templateHeaders(names), ...EXAMPLES(names)])}\r\n`;
};

export const templateXlsx = async () => {
  const names = await activeBenNames();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Import');
  ws.addRow(templateHeaders(names));
  for (const r of EXAMPLES(names)) ws.addRow(r);
  ws.getRow(1).font = { bold: true };
  ws.columns.forEach((c) => (c.width = 16));
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  const doc = wb.addWorksheet('Format');
  doc.addRow(['Column', 'Meaning']).font = { bold: true };
  for (const [c, m] of TEMPLATE_DOC) doc.addRow([c, m]);
  doc.getColumn(1).width = 26;
  doc.getColumn(2).width = 110;
  return Buffer.from(await wb.xlsx.writeBuffer());
};

// ─── Preview ──────────────────────────────────────────────────────────

interface CaseIdx {
  caseId: string;
  number: string;
  status: string;
  clientName: string;
  partnerId: string | null;
}

const loadCases = async (): Promise<CaseIdx[]> => {
  const cases = await prisma.case.findMany({
    select: {
      id: true,
      number: true,
      status: true,
      partnerId: true,
      parentCaseId: true,
      client: { select: { firstName: true, lastName: true } },
      events: { where: { type: FAMILY_EVENT }, select: { note: true }, take: 1, orderBy: { createdAt: 'asc' } },
    },
    orderBy: { createdAt: 'desc' },
    take: 10000,
  });
  return cases.map((c) => {
    const member = c.parentCaseId ? parseMemberInfo(c.events[0]?.note) : null;
    const name = member ? `${member.firstName} ${member.lastName ?? ''}`.trim() : `${c.client.firstName} ${c.client.lastName}`.trim();
    return { caseId: c.id, number: c.number, status: c.status, clientName: name, partnerId: c.partnerId };
  });
};

export type MatchStatus = 'matched' | 'fuzzy' | 'ambiguous' | 'none';

export interface PreviewRow {
  row: NormalisedRow;
  include: boolean;
  client: { status: MatchStatus; caseId: string | null; candidates: (CaseIdx & { score: number })[] };
  company: { status: MatchStatus; companyId: string | null; candidates: { id: string; name: string; score: number }[] };
  duplicates: { id: string; project: string; clientName: string; amount: string | null }[];
  warnings: string[];
}

export interface PreviewResult {
  fileName: string;
  rows: PreviewRow[];
  beneficiaryColumns: { column: string; beneficiaryId: string | null; action: 'map' | 'create' | 'ignore' }[];
  partners: { name: string; partnerId: string | null; action: 'map' | 'create'; candidates: { id: string; name: string }[] }[];
  options: {
    partners: { id: string; name: string }[];
    beneficiaries: { id: string; name: string; rule: string; active: boolean }[];
    companies: { id: string; name: string }[];
  };
  counts: Record<string, number>;
  skippedCredentials: number;
}

const pick = <T extends { score: number }>(cands: T[]): { status: MatchStatus; best: T | null } => {
  if (!cands.length) return { status: 'none', best: null };
  const top = cands[0]!.score;
  const tied = cands.filter((c) => c.score === top);
  if (tied.length > 1 && top >= 0.8) return { status: 'ambiguous', best: null };
  if (top === 1) return { status: 'matched', best: cands[0]! };
  if (top >= 0.8) return { status: 'fuzzy', best: cands[0]! };
  return { status: 'none', best: null };
};

const money = (c: number | null, cur: string) => (c == null ? null : `${c / 100} ${cur}`);

export const previewImport = async (buffer: Buffer, fileName: string): Promise<PreviewResult> => {
  const table = await readTable(buffer, fileName);
  const parsed = normaliseTable(table);
  if (parsed.errors.includes('NO_HEADER')) throw badRequest('IMPORT_NO_HEADER');
  if (!parsed.rows.length) throw badRequest('IMPORT_EMPTY');
  if (parsed.rows.length > 2000) throw badRequest('IMPORT_TOO_MANY_ROWS');

  const [cases, companies, partners, bens, existing] = await Promise.all([
    loadCases(),
    prisma.company.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 5000 }),
    prisma.referralPartner.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    listBeneficiaries(),
    prisma.settlementEntry.findMany({ select: { id: true, project: true, clientName: true, amountCents: true, currency: true } }),
  ]);
  const existingByName = new Map<string, typeof existing>();
  for (const e of existing) {
    const k = normaliseName(e.clientName);
    existingByName.set(k, [...(existingByName.get(k) ?? []), e]);
  }
  const inFile = new Map<string, number>();
  for (const r of parsed.rows) inFile.set(normaliseName(r.clientName), (inFile.get(normaliseName(r.clientName)) ?? 0) + 1);

  const rows: PreviewRow[] = parsed.rows.map((row) => {
    const warnings = [...row.warnings];
    const caseCands = cases
      .map((c) => ({ ...c, score: nameScore(row.clientName, c.clientName) }))
      .filter((c) => c.score >= 0.5)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
    const cm = pick(caseCands);
    if (cm.status === 'none') warnings.push('NO_CLIENT_MATCH');
    if (cm.status === 'ambiguous') warnings.push('AMBIGUOUS_CLIENT');
    if (cm.status === 'fuzzy') warnings.push('FUZZY_CLIENT');

    let company: PreviewRow['company'] = { status: 'none', companyId: null, candidates: [] };
    if (row.employer) {
      const cands = companies
        .map((c) => ({ ...c, score: companyScore(row.employer!, c.name) }))
        .filter((c) => c.score >= 0.5)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      const m = pick(cands);
      company = { status: m.status, companyId: m.best?.id ?? null, candidates: cands };
      if (m.status === 'none') warnings.push('NO_COMPANY_MATCH');
      if (m.status === 'ambiguous') warnings.push('AMBIGUOUS_COMPANY');
    }

    const dups = (existingByName.get(normaliseName(row.clientName)) ?? []).map((e) => ({
      id: e.id,
      project: e.project,
      clientName: e.clientName,
      amount: money(e.amountCents, e.currency),
    }));
    if (dups.length) warnings.push('DUPLICATE');
    if ((inFile.get(normaliseName(row.clientName)) ?? 0) > 1) warnings.push('DUPLICATE_IN_FILE');
    const blocking = dups.length > 0 || warnings.includes('UNSUPPORTED_CURRENCY');
    return {
      row,
      include: !blocking,
      client: { status: cm.status, caseId: cm.best?.caseId ?? null, candidates: caseCands },
      company,
      duplicates: dups.slice(0, 5),
      warnings: [...new Set(warnings)],
    };
  });

  // Beneficiary columns → existing beneficiaries (same name, any case / AZ spelling: Tofig = Tofiq).
  const beneficiaryColumns = parsed.beneficiaryColumns.map((column) => {
    const b = bens.find((x) => personKey(x.name) === personKey(column));
    return { column, beneficiaryId: b?.id ?? null, action: (b ? 'map' : 'create') as 'map' | 'create' };
  });

  // Intermediaries → partners (exact name ignoring case / spelling; containing names are offered).
  const names = [...new Set(parsed.rows.map((r) => r.intermediary).filter((x): x is string => !!x))];
  const partnerRows = names.map((name) => {
    const k = personKey(name);
    const exact = partners.find((p) => personKey(p.name) === k);
    const near = partners.filter((p) => p !== exact && k.length >= 3 && (personKey(p.name).includes(k) || k.includes(personKey(p.name))));
    return { name, partnerId: exact?.id ?? null, action: (exact ? 'map' : 'create') as 'map' | 'create', candidates: near.slice(0, 5) };
  });
  for (const r of rows) if (r.row.intermediary && !partnerRows.find((p) => p.name === r.row.intermediary)?.partnerId) r.warnings.push('NEW_PARTNER');

  const counts = {
    rows: rows.length,
    included: rows.filter((r) => r.include).length,
    clientMatched: rows.filter((r) => r.client.status === 'matched' || r.client.status === 'fuzzy').length,
    clientAmbiguous: rows.filter((r) => r.client.status === 'ambiguous').length,
    clientNone: rows.filter((r) => r.client.status === 'none').length,
    duplicates: rows.filter((r) => r.duplicates.length).length,
    cancelled: rows.filter((r) => r.row.stage === 'CANCELLED').length,
    refused: rows.filter((r) => r.row.stage === 'REFUSED').length,
    withWarnings: rows.filter((r) => r.warnings.some((w) => w !== 'NO_CLIENT_MATCH' && w !== 'NEW_PARTNER')).length,
  };
  return {
    fileName,
    rows,
    beneficiaryColumns,
    partners: partnerRows,
    options: {
      partners,
      beneficiaries: bens.map((b) => ({ id: b.id, name: b.name, rule: b.rule, active: b.active })),
      companies,
    },
    counts,
    skippedCredentials: parsed.skippedCredentials,
  };
};

// ─── Confirm ──────────────────────────────────────────────────────────

const cur = z.enum(['AZN', 'EUR']);
const shareCell = z.object({ cents: z.number().int().min(0).max(1e11).nullable(), currency: cur.nullable(), text: z.string().max(200).nullable() });
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();
const stage = z.enum(['NEW', 'IN_PROGRESS', 'VISA', 'REFUSED', 'CANCELLED']);

export const confirmSchema = z.object({
  fileName: z.string().max(200).default('import'),
  beneficiaryColumns: z
    .array(z.object({ column: z.string().min(1).max(80), action: z.enum(['map', 'create', 'ignore']), beneficiaryId: z.string().max(40).nullish() }))
    .max(30),
  partners: z.array(z.object({ name: z.string().min(1).max(120), action: z.enum(['map', 'create', 'none']), partnerId: z.string().max(40).nullish() })).max(500),
  rows: z
    .array(
      z.object({
        row: z.object({
          line: z.number().int().min(0),
          project: z.string().trim().min(1).max(80),
          intermediary: z.string().max(120).nullable(),
          clientName: z.string().trim().min(1).max(160),
          licence: z.string().max(20).nullable(),
          willNotWork: z.boolean(),
          employer: z.string().max(160).nullable(),
          tlsDate: day,
          visaDate: day,
          statusText: z.string().max(200).nullable(),
          refused: z.boolean(),
          cancelled: z.boolean(),
          stage,
          amountCents: z.number().int().min(0).max(1e11).nullable(),
          currency: cur,
          payAfterVisa: z.boolean(),
          instalments: z.array(z.number().int()).max(20),
          partnerShare: shareCell.nullable(),
          expenses: shareCell.nullable(),
          shares: z.record(z.string().max(80), shareCell),
          note: z.string().max(5000).nullable(),
          warnings: z.array(z.string().max(40)).max(40),
        }),
        caseId: z.string().max(40).nullable(),
        company: z.object({ action: z.enum(['map', 'create', 'none']), companyId: z.string().max(40).nullish() }),
        stage: stage.optional(),
      }),
    )
    .min(1)
    .max(2000),
});
export type ConfirmInput = z.infer<typeof confirmSchema>;

interface BatchRecord {
  id: string;
  at: string;
  actorId: string | null;
  fileName: string;
  entryIds: string[];
  fingerprints: Record<string, string>;
  created: { partners: string[]; beneficiaries: string[]; companies: string[] };
  counts: { rows: number; linked: number; cancelled: number; refused: number };
  undoneAt?: string | null;
  undoneById?: string | null;
}

const isoDay = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const sortKeys = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, sortKeys(x)])) : v;

/**
 * What the team can edit on a row. Fields an automatic case sync rewrites (stage, TLS / visa dates, partner of a
 * linked row that follows its case) are left out, so a sync does not count as an edit.
 */
export const entryFingerprint = (e: SettlementEntry) => {
  const follows = !!e.caseId && e.stageAuto;
  const data = {
    project: e.project,
    clientName: e.clientName,
    licence: e.licence,
    employer: e.employer,
    caseId: e.caseId,
    amountCents: e.amountCents,
    currency: e.currency,
    payAfterVisa: e.payAfterVisa,
    paidCents: e.paidCents,
    partnerShareCents: e.partnerShareCents,
    partnerShareCurrency: e.partnerShareCurrency,
    expensesCents: e.expensesCents,
    shares: sortKeys(storedShares(e.shares)),
    note: e.note,
    ...(follows ? {} : { stage: e.stage, stageAuto: e.stageAuto, tlsDate: isoDay(e.tlsDate), visaDate: isoDay(e.visaDate) }),
  };
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0, 32);
};

const newBatchId = () => `imp-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(4).toString('hex')}`;
const parseDay = (d: string | null) => (d ? new Date(`${d}T00:00:00.000Z`) : null);

export const confirmImport = async (input: ConfirmInput, actorId: string | null) => {
  const [bens, { eurAzn }] = await Promise.all([listBeneficiaries(), getSettings()]);
  const benIds = new Set(bens.map((b) => b.id));
  // Validate every reference before writing anything.
  const caseIds = [...new Set(input.rows.map((r) => r.caseId).filter((x): x is string => !!x))];
  if (caseIds.length && (await prisma.case.count({ where: { id: { in: caseIds } } })) !== caseIds.length) throw badRequest('CASE_NOT_FOUND');
  const companyIds = [...new Set(input.rows.filter((r) => r.company.action === 'map').map((r) => r.company.companyId).filter((x): x is string => !!x))];
  if (input.rows.some((r) => r.company.action === 'map' && !r.company.companyId)) throw badRequest('COMPANY_NOT_FOUND');
  const companyRows = companyIds.length ? await prisma.company.findMany({ where: { id: { in: companyIds } }, select: { id: true, name: true } }) : [];
  if (companyRows.length !== companyIds.length) throw badRequest('COMPANY_NOT_FOUND');
  const partnerIds = [...new Set(input.partners.filter((p) => p.action === 'map').map((p) => p.partnerId).filter((x): x is string => !!x))];
  if (input.partners.some((p) => p.action === 'map' && !p.partnerId)) throw badRequest('PARTNER_NOT_FOUND');
  if (partnerIds.length && (await prisma.referralPartner.count({ where: { id: { in: partnerIds } } })) !== partnerIds.length) throw badRequest('PARTNER_NOT_FOUND');
  for (const c of input.beneficiaryColumns) if (c.action === 'map' && (!c.beneficiaryId || !benIds.has(c.beneficiaryId))) throw badRequest('BENEFICIARY_NOT_FOUND');

  const batchId = newBatchId();
  const at = new Date().toISOString();
  const companyName = new Map(companyRows.map((c) => [c.id, c.name]));

  const result = await prisma.$transaction(
    async (tx) => {
      const created: BatchRecord['created'] = { partners: [], beneficiaries: [], companies: [] };
      // Partners.
      const partnerOf = new Map<string, string | null>();
      for (const p of input.partners) {
        if (p.action === 'map') partnerOf.set(p.name, p.partnerId!);
        else if (p.action === 'none') partnerOf.set(p.name, null);
        else {
          const name = p.name.trim().slice(0, 120);
          const found = await tx.referralPartner.findUnique({ where: { name }, select: { id: true } });
          if (found) partnerOf.set(p.name, found.id);
          else {
            const np = await tx.referralPartner.create({ data: { name, note: `Hesablaşma importu ${batchId}` }, select: { id: true } });
            created.partners.push(np.id);
            partnerOf.set(p.name, np.id);
          }
        }
      }
      // Beneficiaries: new ones get a neutral rule (fixed 0) so the other rows' split does not change.
      const columnToBen: Record<string, string> = {};
      const allBens = [...bens];
      let order = (await tx.settlementBeneficiary.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? -1;
      for (const c of input.beneficiaryColumns) {
        if (c.action === 'map') columnToBen[c.column] = c.beneficiaryId!;
        else if (c.action === 'create') {
          const name = c.column.trim().slice(0, 80);
          const found = await tx.settlementBeneficiary.findUnique({ where: { name } });
          if (found) {
            columnToBen[c.column] = found.id;
            continue;
          }
          const nb = await tx.settlementBeneficiary.create({ data: { name, rule: 'FIXED', value: 0, currency: 'AZN', active: true, sortOrder: ++order } });
          created.beneficiaries.push(nb.id);
          allBens.push({ id: nb.id, name: nb.name, rule: nb.rule, value: nb.value, currency: nb.currency, active: nb.active, sortOrder: nb.sortOrder, userId: null });
          columnToBen[c.column] = nb.id;
        }
      }
      // Placeholder companies (one per distinct name in this batch).
      const placeholderOf = new Map<string, string>();
      for (const r of input.rows) {
        if (r.company.action !== 'create' || !r.row.employer) continue;
        const key = r.row.employer.trim().toLowerCase();
        if (placeholderOf.has(key)) continue;
        const co = await tx.company.create({
          data: { name: r.row.employer.trim().slice(0, 160), status: 'PENDING', note: `Placeholder: hesablaşma importu ${batchId}` },
          select: { id: true, name: true },
        });
        created.companies.push(co.id);
        placeholderOf.set(key, co.id);
        companyName.set(co.id, co.name);
      }
      // Entries.
      const nextOrder = new Map<string, number>();
      const entries: SettlementEntry[] = [];
      for (const item of input.rows) {
        const r = item.row;
        const st = (item.stage ?? r.stage) as SettlementStage;
        const built = buildShares(r, st, columnToBen, allBens, eurAzn);
        const companyId = item.company.action === 'map' ? item.company.companyId! : item.company.action === 'create' && r.employer ? placeholderOf.get(r.employer.trim().toLowerCase())! : null;
        if (!nextOrder.has(r.project)) {
          const max = await tx.settlementEntry.aggregate({ where: { project: r.project }, _max: { sortOrder: true } });
          nextOrder.set(r.project, (max._max.sortOrder ?? -1) + 1);
        }
        const sortOrder = nextOrder.get(r.project)!;
        nextOrder.set(r.project, sortOrder + 1);
        const note = [r.note, ...built.notes].filter(Boolean).join('\n').slice(0, 5000) || null;
        const meta = { batch: batchId, at, line: r.line, ...(companyId ? { companyId } : {}), ...(r.willNotWork ? { willNotWork: true } : {}) };
        const e = await tx.settlementEntry.create({
          data: {
            project: r.project,
            caseId: item.caseId,
            partnerId: r.intermediary ? (partnerOf.get(r.intermediary) ?? null) : null,
            clientName: r.clientName,
            licence: r.licence,
            employer: companyId ? (companyName.get(companyId) ?? r.employer) : r.employer,
            tlsDate: parseDay(r.tlsDate),
            visaDate: parseDay(r.visaDate),
            stage: st,
            // The owner's cancel / refusal decision sticks even when the row is linked to a case.
            stageAuto: !(st === 'CANCELLED' || st === 'REFUSED' || item.stage),
            amountCents: r.amountCents,
            currency: r.currency,
            payAfterVisa: r.payAfterVisa,
            partnerShareCents: built.partnerShareCents,
            partnerShareCurrency: built.partnerShareCurrency,
            expensesCents: built.expensesCents,
            shares: { ...built.shares, [IMPORT_META_KEY]: meta } as Prisma.InputJsonValue,
            note,
            sortOrder,
            createdById: actorId,
          },
        });
        entries.push(e);
      }
      const record: BatchRecord = {
        id: batchId,
        at,
        actorId,
        fileName: input.fileName.slice(0, 200),
        entryIds: entries.map((e) => e.id),
        fingerprints: Object.fromEntries(entries.map((e) => [e.id, entryFingerprint(e)])),
        created,
        counts: {
          rows: entries.length,
          linked: entries.filter((e) => e.caseId).length,
          cancelled: entries.filter((e) => e.stage === 'CANCELLED').length,
          refused: entries.filter((e) => e.stage === 'REFUSED').length,
        },
      };
      await tx.setting.create({ data: { key: `${BATCH_PREFIX}${batchId}`, value: record as unknown as Prisma.InputJsonValue } });
      return { record, entries };
    },
    { timeout: 60_000, maxWait: 10_000 },
  );

  // After the commit: partner commissions and the case sync (both only touch fields outside the fingerprint).
  for (const e of result.entries) if (e.partnerId && e.partnerShareCents) await syncCommission(e.id);
  await syncEntriesWithCases(result.entries.filter((e) => e.caseId));
  return result.record;
};

// ─── Batches / undo ───────────────────────────────────────────────────

const readBatch = async (id: string) => {
  const s = await prisma.setting.findUnique({ where: { key: `${BATCH_PREFIX}${id}` } });
  return s ? (s.value as unknown as BatchRecord) : null;
};

const editedEntries = async (b: BatchRecord) => {
  const entries = await prisma.settlementEntry.findMany({ where: { id: { in: b.entryIds } } });
  const edited = entries.filter((e) => b.fingerprints[e.id] !== entryFingerprint(e));
  return { entries, edited };
};

export const listBatches = async (limit = 20) => {
  const rows = await prisma.setting.findMany({ where: { key: { startsWith: BATCH_PREFIX } } });
  const batches = rows.map((r) => r.value as unknown as BatchRecord).sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
  const actors = await prisma.user.findMany({ where: { id: { in: batches.map((b) => b.actorId).filter((x): x is string => !!x) } }, select: { id: true, firstName: true, lastName: true } });
  const actorName = new Map(actors.map((a) => [a.id, `${a.firstName} ${a.lastName}`.trim()]));
  const out = [];
  for (const b of batches) {
    const { entries, edited } = b.undoneAt ? { entries: [], edited: [] } : await editedEntries(b);
    out.push({
      id: b.id,
      at: b.at,
      fileName: b.fileName,
      actor: b.actorId ? (actorName.get(b.actorId) ?? null) : null,
      counts: b.counts,
      remaining: entries.length,
      edited: edited.length,
      undoneAt: b.undoneAt ?? null,
      canUndo: !b.undoneAt && edited.length === 0,
    });
  }
  return out;
};

export type UndoResult = { ok: true; deleted: number; removed: { partners: number; beneficiaries: number; companies: number } } | { ok: false; edited: { id: string; clientName: string }[] };

export const undoBatch = async (id: string, actorId: string | null): Promise<UndoResult> => {
  const b = await readBatch(id);
  if (!b) throw notFound('IMPORT_BATCH_NOT_FOUND');
  if (b.undoneAt) throw badRequest('IMPORT_ALREADY_UNDONE');
  const { entries, edited } = await editedEntries(b);
  if (edited.length) return { ok: false, edited: edited.slice(0, 50).map((e) => ({ id: e.id, clientName: e.clientName })) };
  const ids = entries.map((e) => e.id);
  const removed = { partners: 0, beneficiaries: 0, companies: 0 };
  await prisma.$transaction(
    async (tx) => {
      await tx.partnerCommission.deleteMany({ where: { settlementEntryId: { in: ids } } });
      await tx.settlementEntry.deleteMany({ where: { id: { in: ids } } });
      // What the batch created goes too, unless something else uses it by now.
      for (const pid of b.created.partners) {
        const p = await tx.referralPartner.findUnique({ where: { id: pid }, select: { userId: true, _count: { select: { cases: true, commissions: true, settlements: true } } } });
        if (p && !p.userId && !p._count.cases && !p._count.commissions && !p._count.settlements) {
          await tx.referralPartner.delete({ where: { id: pid } });
          removed.partners++;
        }
      }
      if (b.created.beneficiaries.length) {
        const rest = await tx.settlementEntry.findMany({ select: { shares: true } });
        for (const bid of b.created.beneficiaries) {
          const used = rest.some((e) => Object.prototype.hasOwnProperty.call(storedShares(e.shares), bid));
          if (!used && (await tx.settlementBeneficiary.findUnique({ where: { id: bid }, select: { id: true } }))) {
            await tx.settlementBeneficiary.delete({ where: { id: bid } });
            removed.beneficiaries++;
          }
        }
      }
      for (const cid of b.created.companies) {
        const c = await tx.company.findUnique({
          where: { id: cid },
          select: { _count: { select: { users: true, cases: true, vacancies: true, invoices: true, contacts: true, quotes: true, candidateRequests: true } } },
        });
        if (c && Object.values(c._count).every((n) => n === 0)) {
          await tx.company.delete({ where: { id: cid } });
          removed.companies++;
        }
      }
      const next: BatchRecord = { ...b, undoneAt: new Date().toISOString(), undoneById: actorId };
      await tx.setting.update({ where: { key: `${BATCH_PREFIX}${id}` }, data: { value: next as unknown as Prisma.InputJsonValue } });
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
  return { ok: true, deleted: ids.length, removed };
};
