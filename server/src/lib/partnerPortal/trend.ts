import { monthOf } from '../kpi/compute.js';

/**
 * Monthly trend of a partner's own business (partner dashboard): per Baku calendar month the new clients (month of
 * the client's first case), the cases opened and the visas granted (decision date). Pure, unit tested
 * (tests/unit/partnerTrend.test.ts); the caller passes only the partner's own cases.
 */
export interface TrendCase {
  clientId: string;
  createdAt: Date;
  status: string;
  decisionAt: Date | null;
}

/** The last `n` Baku months ending with the month of `now` ("2026-11"), oldest first. */
export const lastMonths = (now: Date, n = 12) => {
  const [y, m] = monthOf(now).split('-').map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
};

export const partnerTrend = (cases: TrendCase[], now: Date, n = 12) => {
  const months = lastMonths(now, n);
  const idx = new Map(months.map((m, i) => [m, i]));
  const clients = months.map(() => 0);
  const opened = months.map(() => 0);
  const approved = months.map(() => 0);
  const firstCase = new Map<string, Date>();
  for (const c of cases) {
    const i = idx.get(monthOf(c.createdAt));
    if (i !== undefined) opened[i]++;
    const prev = firstCase.get(c.clientId);
    if (!prev || c.createdAt < prev) firstCase.set(c.clientId, c.createdAt);
    if (c.status === 'APPROVED' && c.decisionAt) {
      const j = idx.get(monthOf(c.decisionAt));
      if (j !== undefined) approved[j]++;
    }
  }
  for (const at of firstCase.values()) {
    const i = idx.get(monthOf(at));
    if (i !== undefined) clients[i]++;
  }
  return { months, clients, cases: opened, approved };
};
