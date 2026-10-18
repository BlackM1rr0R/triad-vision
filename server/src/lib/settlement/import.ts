import ExcelJS from 'exceljs';
import type { Prisma, SettlementEntry, SettlementStage } from '@prisma/client';
import { prisma } from '../../db.js';
import { badRequest } from '../http.js';
import { computeSplit, fixedShares, storedShares, type BeneficiaryLike, type Currency, type StoredShare } from './split.js';
import { headerKey, looksLikeCredential, normaliseName, parseAmount, parseShareCell, parseStatus, splitName, stageFromColor } from './parse.js';
import { getSettings, listBeneficiaries, syncCommission } from './service.js';

/**
 * Import of the team's settlement workbook (.xlsx):
 * - every sheet becomes a project (sheet name); sheets with a "Zwischen Person" column take the partner from it,
 *   middleman sheets (first header = sheet name, or a "Sanani" column) take the sheet name as the partner;
 * - headers are matched fuzzily; amounts, currencies, "viza sonrası", instalments, "rawot", TLS / visa dates,
 *   refusals and driving licence classes are parsed; the row stage comes from the fill colour (status text fallback);
 * - anything that looks like login data (e-mail + password) is never stored, only counted;
 * - re-importing the same file updates the rows it created (project + normalised client name), never duplicates.
 */

type ColKey = 'partner' | 'name' | 'employer' | 'status' | 'payment' | 'partnerShare' | 'expenses' | 'note' | 'afterVisa' | 'paid' | `ben:${string}`;

const HEADERS: Record<Exclude<ColKey, `ben:${string}`>, string[]> = {
  partner: ['zwischenperson', 'zwischen', 'vasitechi', 'vasiteci', 'partnyor', 'partner', 'middleman'],
  name: ['name', 'musteriadi', 'musteri', 'ad', 'adsoyad', 'client', 'kunde', 'klient'],
  employer: ['transporte', 'transport', 'isegoturen', 'employer', 'arbeitgeber', 'firma', 'sirket'],
  status: ['status', 'veziyyet'],
  payment: ['bezahlung', 'odeniw', 'odenis', 'odenish', 'payment', 'zahlung'],
  partnerShare: ['sanani', 'senani', 'partnyorpayi', 'provision', 'commission'],
  expenses: ['rasxod', 'rashod', 'xerc', 'xercler', 'expenses', 'ausgaben'],
  note: ['qeyd', 'note', 'notes', 'bemerkung', 'comment'],
  afterVisa: ['vizasonrasi', 'aftervisa'],
  paid: ['odenilib', 'paid', 'bezahlt'],
};

interface SheetMap {
  headerRow: number;
  cols: Map<number, ColKey>;
  firstHeader: string;
}

const cellValue = (cell: ExcelJS.Cell): unknown => {
  const v = cell.value as unknown;
  if (v == null) return null;
  if (typeof v === 'object' && !(v instanceof Date)) {
    const o = v as { richText?: { text: string }[]; text?: unknown; result?: unknown; error?: unknown };
    if (o.richText) return o.richText.map((r) => r.text).join('');
    if ('result' in o) return o.result ?? null;
    if ('text' in o) return o.text == null ? null : String(o.text);
    if ('error' in o) return null;
    return null;
  }
  return v;
};

const textOf = (v: unknown) => (v == null ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim());

const fillOf = (cell: ExcelJS.Cell) => {
  const f = cell.fill as ExcelJS.FillPattern | undefined;
  if (f?.type !== 'pattern' || f.pattern !== 'solid') return null;
  const c = f.fgColor as { argb?: string } | undefined;
  return c?.argb ?? null;
};

const mapSheet = (ws: ExcelJS.Worksheet, bens: BeneficiaryLike[]): SheetMap | null => {
  const benKeys = new Map(bens.map((b) => [headerKey(b.name), b.id]));
  const last = Math.min(ws.rowCount, 15);
  for (let r = 1; r <= last; r++) {
    const row = ws.getRow(r);
    const cols = new Map<number, ColKey>();
    let firstHeader = '';
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const raw = textOf(cellValue(cell));
      if (!raw) return;
      if (!firstHeader) firstHeader = raw;
      const k = headerKey(raw);
      if (!k) return;
      const ben = benKeys.get(k);
      if (ben) {
        cols.set(col, `ben:${ben}`);
        return;
      }
      for (const [key, words] of Object.entries(HEADERS)) {
        if (words.includes(k) && ![...cols.values()].includes(key as ColKey)) {
          cols.set(col, key as ColKey);
          return;
        }
      }
    });
    if ([...cols.values()].includes('name') && cols.size >= 2) return { headerRow: r, cols, firstHeader };
  }
  return null;
};

export interface ImportPreviewRow {
  sheet: string;
  row: number;
  project: string;
  partner: string | null;
  clientName: string;
  licence: string | null;
  employer: string | null;
  stage: SettlementStage;
  tlsDate: string | null;
  visaDate: string | null;
  amount: string | null;
  partnerShare: string | null;
  action: 'create' | 'update';
}

export interface ImportReport {
  dryRun: boolean;
  sheets: { name: string; kind: 'project' | 'partner' | 'skipped'; partner: string | null; rows: number; created: number; updated: number; skippedEmpty: number }[];
  rows: number;
  created: number;
  updated: number;
  newPartners: string[];
  warnings: string[];
  /** Cells that looked like login data (e-mail / password): never stored. */
  skippedCredentials: number;
  preview: ImportPreviewRow[];
}

interface Parsed {
  project: string;
  partnerName: string | null;
  clientName: string;
  licence: string | null;
  employer: string | null;
  tlsDate: Date | null;
  visaDate: Date | null;
  stage: SettlementStage;
  amountCents: number | null;
  currency: Currency;
  payAfterVisa: boolean;
  paidCents: number | null;
  partnerShareCents: number | null;
  partnerShareCurrency: Currency;
  expensesCents: number | null;
  overrides: Record<string, StoredShare>;
  note: string | null;
  sortOrder: number;
  key: string;
  sheet: string;
  row: number;
}

const fmt = (c: number | null, cur: string) => (c == null ? null : `${c / 100} ${cur}`);
const pkey = (s: string) => s.trim().toLowerCase();

export const importWorkbook = async (buffer: Buffer, opts: { dryRun: boolean; actorId: string | null }): Promise<ImportReport> => {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw badRequest('INVALID_XLSX');
  }
  const [bens, { eurAzn }, partners] = await Promise.all([listBeneficiaries(), getSettings(), prisma.referralPartner.findMany({ select: { id: true, name: true } })]);
  const activeBens = bens.filter((b) => b.active);
  const partnerByKey = new Map(partners.map((p) => [pkey(p.name), p]));
  const newPartners = new Map<string, string>(); // key → display name
  const report: ImportReport = { dryRun: opts.dryRun, sheets: [], rows: 0, created: 0, updated: 0, newPartners: [], warnings: [], skippedCredentials: 0, preview: [] };
  const parsed: Parsed[] = [];

  const partnerRef = (name: string) => {
    const k = pkey(name);
    if (!partnerByKey.has(k) && !newPartners.has(k)) newPartners.set(k, name.trim().slice(0, 120));
    return name.trim().slice(0, 120);
  };

  for (const ws of wb.worksheets) {
    const sheetName = ws.name.trim().slice(0, 80);
    // Credentials anywhere in the sheet are counted and their cells never read.
    const blocked = new Set<string>();
    ws.eachRow({ includeEmpty: false }, (row, r) => {
      row.eachCell({ includeEmpty: false }, (cell, c) => {
        if (looksLikeCredential(cellValue(cell))) {
          blocked.add(`${r}:${c}`);
          report.skippedCredentials++;
        }
      });
    });
    const map = mapSheet(ws, activeBens);
    if (!map) {
      report.sheets.push({ name: sheetName, kind: 'skipped', partner: null, rows: 0, created: 0, updated: 0, skippedEmpty: 0 });
      if (ws.actualRowCount > 0) report.warnings.push(`"${sheetName}": başlıq sətri tapılmadı (Name / Musteri adi), vərəq ötürüldü`);
      continue;
    }
    const keys = [...map.cols.values()];
    const hasPartnerCol = keys.includes('partner');
    const isPartnerSheet = !hasPartnerCol && (headerKey(map.firstHeader) === headerKey(sheetName) || keys.includes('partnerShare'));
    const sheetPartner = isPartnerSheet ? partnerRef(sheetName) : null;
    const sheetInfo = { name: sheetName, kind: (isPartnerSheet ? 'partner' : 'project') as 'partner' | 'project', partner: sheetPartner, rows: 0, created: 0, updated: 0, skippedEmpty: 0 };
    report.sheets.push(sheetInfo);
    const colOf = (k: ColKey) => [...map.cols.entries()].find(([, v]) => v === k)?.[0];
    const occurrences = new Map<string, number>();

    for (let r = map.headerRow + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const get = (k: ColKey) => {
        const c = colOf(k);
        if (!c || blocked.has(`${r}:${c}`)) return null;
        return cellValue(row.getCell(c));
      };
      const nameRaw = textOf(get('name'));
      if (!nameRaw) {
        const anything = [...map.cols.keys()].some((c) => !blocked.has(`${r}:${c}`) && textOf(cellValue(row.getCell(c))));
        if (anything) {
          sheetInfo.skippedEmpty++;
          report.warnings.push(`"${sheetName}" sətir ${r}: müştəri adı yoxdur, ötürüldü`);
        }
        continue;
      }
      // A totals row ("Cəmi: 8", "Total") is not a client.
      if (/^(c[əe]mi|total|summe|gesamt|итого|всего)\b/i.test(nameRaw)) continue;
      const sn = splitName(nameRaw);
      if (!sn.name) continue;
      const notes: string[] = [];
      if (sn.note) notes.push(sn.note);

      const status = parseStatus(get('status'));
      const nameCell = row.getCell(colOf('name')!);
      const colour = stageFromColor(fillOf(nameCell)) ?? stageFromColor(fillOf(row.getCell(colOf('status') ?? colOf('name')!)));
      const stage: SettlementStage = colour ?? status.stage;
      if (status.raw && !status.tlsDate && !status.visaDate && !status.refused && !/^tls\/?$/i.test(status.raw)) notes.push(`Status: ${status.raw}`);

      const pay = parseAmount(get('payment'), null);
      const currency: Currency = pay.currency ?? 'AZN';
      if (pay.marker) notes.push(`Bezahlung: ${pay.marker}`);
      if (pay.instalments.length > 1) notes.push(`Hissələr: ${pay.instalments.map((c) => c / 100).join(' / ')} ${currency}`);

      const shareRaw = get('partnerShare');
      const ps = parseAmount(shareRaw, 'EUR');
      if (ps.marker) notes.push(`Sanani: ${ps.marker}`);
      const exp = parseAmount(get('expenses'), currency);
      const afterVisa = /^(1|true|b[əe]li|yes|ja|да|x|✓)$/i.test(textOf(get('afterVisa')));
      const paidSoFar = parseAmount(get('paid'), currency).amountCents;
      const noteCol = textOf(get('note'));
      if (noteCol) notes.push(noteCol);

      let partnerName = sheetPartner;
      if (hasPartnerCol) {
        const p = textOf(get('partner'));
        partnerName = p ? partnerRef(p) : null;
      }

      const amounts = {
        amountCents: pay.amountCents,
        currency,
        partnerShareCents: ps.amountCents,
        partnerShareCurrency: (ps.currency ?? 'EUR') as Currency,
        expensesCents: exp.amountCents,
      };
      // Sheet values that differ from the rule become manual values; the REMAINDER shares are compared with what
      // the rule gives after those (Xalid typed 830 of 2500 -> Tofig 735 is the rule, not a manual value).
      const cells = new Map<string, { cents: number; currency: Currency; text?: string }>();
      for (const b of activeBens) {
        const fallback: Currency = b.rule === 'FIXED' && (b.currency === 'AZN' || b.currency === 'EUR') ? b.currency : currency;
        const cell = parseShareCell(get(`ben:${b.id}`), fallback);
        if (cell) cells.set(b.id, cell);
      }
      const overrides: Record<string, StoredShare> = {};
      const compare = (remainderPass: boolean) => {
        const split = computeSplit(amounts, activeBens, eurAzn, fixedShares(overrides, currency));
        for (const b of activeBens) {
          if ((b.rule === 'REMAINDER') !== remainderPass) continue;
          const cell = cells.get(b.id);
          if (!cell) continue;
          const comp = split?.shares[b.id];
          if (cell.text) overrides[b.id] = { cents: 0, currency: cell.currency, text: cell.text, status: 'NONE', manual: true };
          else if (!comp || comp.cents !== cell.cents || comp.currency !== cell.currency) overrides[b.id] = { cents: cell.cents, currency: cell.currency, status: 'PENDING', manual: true };
        }
      };
      compare(false);
      compare(true);

      const project = sheetName;
      const nk = normaliseName(sn.name);
      const n = (occurrences.get(nk) ?? 0) + 1;
      occurrences.set(nk, n);
      parsed.push({
        project,
        partnerName,
        clientName: sn.name.slice(0, 160),
        licence: sn.licence,
        employer: textOf(get('employer')).slice(0, 160) || null,
        tlsDate: status.tlsDate,
        visaDate: status.visaDate,
        stage,
        ...amounts,
        payAfterVisa: pay.payAfterVisa || afterVisa,
        paidCents: colOf('paid') ? (paidSoFar ?? 0) : null,
        overrides,
        note: notes.join('\n').slice(0, 5000) || null,
        sortOrder: r,
        key: `${project}|${nk}|${n}`,
        sheet: sheetName,
        row: r,
      });
      sheetInfo.rows++;
    }
  }

  // Existing rows: same project + name (nth occurrence), or for middleman sheets the same partner + name anywhere.
  const existing = await prisma.settlementEntry.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  const byKey = new Map<string, SettlementEntry>();
  const occ = new Map<string, number>();
  for (const e of existing) {
    const nk = normaliseName(e.clientName);
    const base = `${e.project}|${nk}`;
    const n = (occ.get(base) ?? 0) + 1;
    occ.set(base, n);
    byKey.set(`${base}|${n}`, e);
  }
  const partnerIdOf = (name: string | null) => (name ? (partnerByKey.get(pkey(name))?.id ?? null) : null);
  const used = new Set<string>();
  /** `viaPartner`: a middleman-sheet row found in another project (the same client listed twice) — its project stays. */
  const matchOf = (p: Parsed): { entry: SettlementEntry; viaPartner: boolean } | null => {
    const direct = byKey.get(p.key);
    if (direct && !used.has(direct.id)) return { entry: direct, viaPartner: false };
    const pid = partnerIdOf(p.partnerName);
    const sheet = report.sheets.find((s) => s.name === p.sheet);
    if (pid && sheet?.kind === 'partner') {
      const nk = normaliseName(p.clientName);
      const hit = existing.find((e) => e.partnerId === pid && e.project !== p.project && normaliseName(e.clientName) === nk);
      if (hit) return { entry: hit, viaPartner: true };
    }
    return null;
  };

  report.newPartners = [...newPartners.values()];
  report.rows = parsed.length;

  if (!opts.dryRun) {
    for (const [k, name] of newPartners) {
      const p = await prisma.referralPartner.upsert({ where: { name }, create: { name }, update: {}, select: { id: true, name: true } });
      partnerByKey.set(k, p);
    }
  }

  for (const p of parsed) {
    const found = matchOf(p);
    const match = found?.entry ?? null;
    if (match) used.add(match.id);
    const sheet = report.sheets.find((s) => s.name === p.sheet)!;
    if (match) {
      sheet.updated++;
      report.updated++;
    } else {
      sheet.created++;
      report.created++;
    }
    if (report.preview.length < 300) {
      report.preview.push({
        sheet: p.sheet,
        row: p.row,
        project: p.project,
        partner: p.partnerName,
        clientName: p.clientName,
        licence: p.licence,
        employer: p.employer,
        stage: p.stage,
        tlsDate: p.tlsDate?.toISOString().slice(0, 10) ?? null,
        visaDate: p.visaDate?.toISOString().slice(0, 10) ?? null,
        amount: fmt(p.amountCents, p.currency),
        partnerShare: fmt(p.partnerShareCents, p.partnerShareCurrency),
        action: match ? 'update' : 'create',
      });
    }
    if (opts.dryRun) continue;

    const partnerId = partnerIdOf(p.partnerName);
    const base = {
      project: p.project,
      clientName: p.clientName,
      licence: p.licence,
      employer: p.employer,
      tlsDate: p.tlsDate,
      visaDate: p.visaDate,
      amountCents: p.amountCents,
      currency: p.currency,
      payAfterVisa: p.payAfterVisa,
      ...(p.paidCents != null ? { paidCents: p.paidCents } : {}),
      partnerShareCents: p.partnerShareCents,
      partnerShareCurrency: p.partnerShareCurrency,
      expensesCents: p.expensesCents,
      sortOrder: p.sortOrder,
    };
    let id: string;
    if (match) {
      // Keep what the team did in the app: case link, payment statuses, an automatic stage of a linked row.
      const stored = storedShares(match.shares);
      const shares: Record<string, StoredShare> = {};
      for (const [k, s] of Object.entries(stored)) {
        if (s.status === 'PAID' || s.status === 'NONE' || k.startsWith('_')) shares[k] = s.manual || s.status === 'PAID' || k.startsWith('_') ? s : { status: s.status };
      }
      for (const [k, o] of Object.entries(p.overrides)) {
        if (stored[k]?.status === 'PAID') continue;
        shares[k] = o;
      }
      const followCase = !!match.caseId && match.stageAuto;
      await prisma.settlementEntry.update({
        where: { id: match.id },
        data: {
          ...base,
          ...(found?.viaPartner ? { project: match.project, sortOrder: match.sortOrder } : {}),
          ...(followCase ? { tlsDate: match.tlsDate ?? p.tlsDate, visaDate: match.visaDate ?? p.visaDate } : { stage: p.stage }),
          partnerId: partnerId ?? match.partnerId,
          note: p.note ?? match.note,
          shares: shares as Prisma.InputJsonValue,
        },
      });
      id = match.id;
    } else {
      const created = await prisma.settlementEntry.create({
        data: { ...base, stage: p.stage, partnerId, note: p.note, shares: p.overrides as Prisma.InputJsonValue, createdById: opts.actorId },
      });
      id = created.id;
    }
    await syncCommission(id);
  }
  return report;
};
