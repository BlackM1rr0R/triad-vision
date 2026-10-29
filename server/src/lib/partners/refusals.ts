import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { FINAL_STATUSES } from '../caseFlow.js';
import { csvSafe } from '../csvSafe.js';
import { isRefused } from '../caseProcessing/index.js';

/**
 * Visa refusals ("Ablehnung") by referral partner and by employer company: per group the cases, visas,
 * refusals and the refusal rate (refusals / decided = visas + refusals). A case counts as refused when
 * CaseStatus is REJECTED or the team marked it "Ablehnung" (lib/caseProcessing).
 *
 * Period: `basis=created` counts the cases opened in [from, to]; `basis=decision` the cases decided then
 * (decisionAt, else closedAt for team-marked refusals still open).
 */

/** YYYY-MM-DD that is a real calendar day. */
const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v), 'INVALID_DATE');

export const refusalQuery = z.object({
  group: z.enum(['partner', 'company']).default('partner'),
  from: isoDay.optional(),
  to: isoDay.optional(),
  basis: z.enum(['created', 'decision']).default('created'),
  /** Only the cases of this partner (the company table on a partner's page); 'none' = without a partner. */
  partnerId: z.string().trim().min(1).max(40).optional(),
  /** '0' = every case (with a "no partner" row); by default only cases that came through a partner. */
  withPartner: z.enum(['1', '0']).optional(),
});
export type RefusalQuery = z.infer<typeof refusalQuery>;

export interface RefusalRow {
  id: string | null;
  name: string | null;
  cases: number;
  active: number;
  visas: number;
  refusals: number;
  cancelled: number;
  /** refusals / (visas + refusals), 0..1; null without decisions. */
  rate: number | null;
}

const DAY = 24 * 60 * 60 * 1000;
const dayStart = (s: string) => new Date(`${s}T00:00:00.000Z`);

const empty = (id: string | null, name: string | null): RefusalRow => ({ id, name, cases: 0, active: 0, visas: 0, refusals: 0, cancelled: 0, rate: null });
const rateOf = (r: RefusalRow) => (r.visas + r.refusals > 0 ? Math.round((r.refusals / (r.visas + r.refusals)) * 1000) / 1000 : null);

export const refusalReport = async (q: RefusalQuery) => {
  const range: Prisma.DateTimeFilter = {
    ...(q.from ? { gte: dayStart(q.from) } : {}),
    ...(q.to ? { lt: new Date(dayStart(q.to).getTime() + DAY) } : {}),
  };
  const hasRange = !!(q.from || q.to);
  const where: Prisma.CaseWhereInput = {
    ...(q.partnerId ? { partnerId: q.partnerId === 'none' ? null : q.partnerId } : q.withPartner !== '0' ? { partnerId: { not: null } } : {}),
    ...(hasRange
      ? q.basis === 'created'
        ? { createdAt: range }
        : { OR: [{ decisionAt: range }, { decisionAt: null, closedAt: range }, { decisionAt: null, closedAt: null, processingStage: 'REFUSED', processingStageAt: range }] }
      : {}),
  };
  const cases = await prisma.case.findMany({
    where,
    select: { status: true, processingStage: true, partnerId: true, companyId: true, partner: { select: { name: true } }, company: { select: { name: true } } },
  });
  const groups = new Map<string, RefusalRow>();
  const total = empty(null, null);
  for (const c of cases) {
    const id = q.group === 'partner' ? c.partnerId : c.companyId;
    const name = q.group === 'partner' ? (c.partner?.name ?? null) : (c.company?.name ?? null);
    const key = id ?? '';
    if (!groups.has(key)) groups.set(key, empty(id, name));
    for (const r of [groups.get(key)!, total]) {
      r.cases++;
      const refused = isRefused(c);
      if (refused) r.refusals++;
      else if (c.status === 'APPROVED') r.visas++;
      else if (c.status === 'CANCELLED') r.cancelled++;
      else if (!FINAL_STATUSES.includes(c.status)) r.active++;
    }
  }
  const rows = [...groups.values()].map((r) => ({ ...r, rate: rateOf(r) }));
  // Most refusals first, then the highest rate, then by name (the "no partner / no company" row last).
  rows.sort((a, b) => Number(!a.id) - Number(!b.id) || b.refusals - a.refusals || (b.rate ?? -1) - (a.rate ?? -1) || (a.name ?? '').localeCompare(b.name ?? ''));
  return { group: q.group, basis: q.basis, from: q.from ?? null, to: q.to ?? null, rows, total: { ...total, rate: rateOf(total) } };
};

const CSV_HEAD: Record<RefusalQuery['group'], string> = { partner: 'Partnyor', company: 'Şirkət' };

/** The report as CSV (semicolon, UTF-8 with BOM — opens in Excel with the Azerbaijani letters intact). */
export const refusalCsv = (r: Awaited<ReturnType<typeof refusalReport>>) => {
  const cell = (v: string | number | null) => {
    const s = v === null ? '' : String(v);
    const safe = csvSafe(s);
    return /[;"\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const pct = (x: number | null) => (x === null ? '' : `${(x * 100).toFixed(1).replace('.', ',')}%`);
  const none = r.group === 'partner' ? 'Partnyorsuz' : 'Şirkətsiz';
  const lines = [
    [CSV_HEAD[r.group], 'Müraciət', 'Aktiv', 'Viza', 'Rədd (Ablehnung)', 'Ləğv', 'Rədd faizi'].map(cell).join(';'),
    ...r.rows.map((x) => [x.name ?? none, x.cases, x.active, x.visas, x.refusals, x.cancelled, pct(x.rate)].map(cell).join(';')),
    ['Cəmi', r.total.cases, r.total.active, r.total.visas, r.total.refusals, r.total.cancelled, pct(r.total.rate)].map(cell).join(';'),
  ];
  return `﻿${lines.join('\r\n')}\r\n`;
};
