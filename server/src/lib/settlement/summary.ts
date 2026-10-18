import { prisma } from '../../db.js';
import { addTo, type Currency } from './split.js';
import { loadRows, type RowDto } from './service.js';

/**
 * Report numbers of the ledger. A row belongs to a month by its visa date, else TLS date, else creation;
 * a share counts as paid in the month of its payment date.
 *
 * Per beneficiary: owed (pending) and paid — this month and overall; per partner: commissions pending / paid;
 * counts by stage; revenue (agreed amount and received so far) by currency.
 */

type Bag = Partial<Record<Currency, number>>;
const thisMonth = () => new Date().toISOString().slice(0, 7);

export const buildSummary = async (month?: string) => {
  const m = month ?? thisMonth();
  const [{ rows, beneficiaries }, partners] = await Promise.all([loadRows(), prisma.referralPartner.findMany({ select: { id: true, name: true } })]);
  const bens = beneficiaries.filter((b) => b.active);
  const inMonth = (r: RowDto) => r.month === m;

  const perBeneficiary = bens.map((b) => {
    const out = { id: b.id, name: b.name, rule: b.rule, month: { pending: {} as Bag, paid: {} as Bag }, overall: { pending: {} as Bag, paid: {} as Bag } };
    for (const r of rows) {
      const s = r.shares[b.id];
      if (!s || s.status === 'NONE' || !s.cents) continue;
      if (s.status === 'PAID') {
        addTo(out.overall.paid, s.currency, s.cents);
        if ((s.paidAt ?? '').slice(0, 7) === m || (!s.paidAt && inMonth(r))) addTo(out.month.paid, s.currency, s.cents);
      } else {
        addTo(out.overall.pending, s.currency, s.cents);
        if (inMonth(r)) addTo(out.month.pending, s.currency, s.cents);
      }
    }
    return out;
  });

  const partnerName = new Map(partners.map((p) => [p.id, p.name]));
  const perPartnerMap = new Map<string, { id: string; name: string; clients: number; pending: Bag; paid: Bag; month: Bag }>();
  for (const r of rows) {
    if (!r.partnerId) continue;
    const p = perPartnerMap.get(r.partnerId) ?? { id: r.partnerId, name: partnerName.get(r.partnerId) ?? '', clients: 0, pending: {}, paid: {}, month: {} };
    p.clients++;
    if (r.partnerShareCents) {
      addTo(r.partnerPaid ? p.paid : p.pending, r.partnerShareCurrency, r.partnerShareCents);
      if (inMonth(r)) addTo(p.month, r.partnerShareCurrency, r.partnerShareCents);
    }
    perPartnerMap.set(r.partnerId, p);
  }

  const stages = { NEW: 0, IN_PROGRESS: 0, VISA: 0, REFUSED: 0, CANCELLED: 0 };
  const stagesMonth = { ...stages };
  const revenue = { agreed: {} as Bag, received: {} as Bag, monthAgreed: {} as Bag, monthReceived: {} as Bag, expenses: {} as Bag };
  for (const r of rows) {
    stages[r.stage]++;
    addTo(revenue.agreed, r.currency, r.amountCents);
    addTo(revenue.received, r.currency, r.paidCents);
    addTo(revenue.expenses, r.currency, r.expensesCents);
    if (inMonth(r)) {
      stagesMonth[r.stage]++;
      addTo(revenue.monthAgreed, r.currency, r.amountCents);
      addTo(revenue.monthReceived, r.currency, r.paidCents);
    }
  }

  return {
    month: m,
    rows: rows.length,
    beneficiaries: perBeneficiary,
    partners: [...perPartnerMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
    stages,
    stagesMonth,
    revenue,
  };
};
