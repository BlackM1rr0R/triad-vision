import { STAGE_TEXT, plannedArrival } from '../requests/workers.js';
import type { PanelRow } from './panel.js';
import { PANEL_TEXTS, type Loc } from './texts.js';

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

export const workersCsv = (rows: PanelRow[], locale: Loc) => {
  const T = PANEL_TEXTS[locale];
  const lines = [T.csvHeaders.map(cell).join(';')];
  for (const r of rows) {
    const milestoneDate = r.next ? day(r.next.at ?? r.next.to ?? r.next.from) : '';
    lines.push(
      [
        r.name,
        r.position,
        T.phase[r.phase],
        STAGE_TEXT[locale][r.stage],
        r.next ? T.milestone[r.next.code] : '',
        milestoneDate,
        day(r.arrivedAt ?? plannedArrival(r)),
        r.title ? `${day(r.title.validUntil)} (${T.title[r.title.kind]}${r.title.warn !== 'OK' ? `, ${T.warn[r.title.warn]}` : ''})` : '',
        r.probation ? `${day(r.probation.endsAt)}${r.probation.warn !== 'OK' ? ` (${T.warn[r.probation.warn]})` : ''}` : '',
        r.checkIn.employer ? T.checkIn[r.checkIn.employer] : '',
        r.checkIn.worker ? T.checkIn[r.checkIn.worker] : '',
        r.risk ? T.risk[r.risk.level] : '',
        r.openItems.length,
        T.action[r.nextAction],
        r.manager?.name ?? '',
      ]
        .map(cell)
        .join(';'),
    );
  }
  return `﻿${lines.join('\r\n')}\r\n`;
};
