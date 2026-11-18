import { STAGE_TEXT, plannedArrival } from '../requests/workers.js';
import type { PanelRow } from './panel.js';
import { PANEL_TEXTS, type Loc } from './texts.js';
import { FULL_EXPORT, milestoneAllowed, nextActionAllowed, pickColumns, type WorkerExportPolicy } from '../companyAccess/workerExport.js';

/**
 * The worker panel as CSV (UTF-8 with BOM so Excel opens umlauts correctly, ";" as separator — the German
 * Excel default). Cells that start with = + - @ are prefixed with ' (no formula injection).
 */

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '');

const cell = (v: string | number) => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Column order of T.csvHeaders; `need` = what a restricted employer member must be allowed to see (lib/companyAccess/workerExport). */
const COLUMNS: { need?: 'documents' | 'contracts' }[] = [{}, {}, {}, {}, {}, {}, {}, { need: 'documents' }, { need: 'contracts' }, {}, {}, {}, {}, {}, {}];

export const workersCsv = (rows: PanelRow[], locale: Loc, policy: WorkerExportPolicy = FULL_EXPORT) => {
  const T = PANEL_TEXTS[locale];
  const cells = rows.map((r) => {
    const items = r.openItems.filter((i) => policy.item(i.kind));
    const next = r.next && milestoneAllowed(r.next.code, policy) ? r.next : null;
    const action = nextActionAllowed(r.nextAction, policy, new Set(items.map((i) => i.kind))) ? T.action[r.nextAction] : '';
    return [
      r.name,
      r.position,
      T.phase[r.phase],
      STAGE_TEXT[locale][r.stage],
      next ? T.milestone[next.code] : '',
      next ? day(next.at ?? next.to ?? next.from) : '',
      day(r.arrivedAt ?? plannedArrival(r)),
      r.title ? `${day(r.title.validUntil)} (${T.title[r.title.kind]}${r.title.warn !== 'OK' ? `, ${T.warn[r.title.warn]}` : ''})` : '',
      r.probation ? `${day(r.probation.endsAt)}${r.probation.warn !== 'OK' ? ` (${T.warn[r.probation.warn]})` : ''}` : '',
      r.checkIn.employer ? T.checkIn[r.checkIn.employer] : '',
      r.checkIn.worker ? T.checkIn[r.checkIn.worker] : '',
      r.risk ? T.risk[r.risk.level] : '',
      items.length,
      action,
      r.manager?.name ?? '',
    ];
  });
  const out = pickColumns(COLUMNS, policy, T.csvHeaders, cells);
  const lines = [out.headers.map(cell).join(';'), ...out.rows.map((r) => r.map(cell).join(';'))];
  return `﻿${lines.join('\r\n')}\r\n`;
};
