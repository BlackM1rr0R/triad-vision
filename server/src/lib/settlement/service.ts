import type { CaseStatus, Prisma, SettlementEntry, SettlementStage } from '@prisma/client';
import { prisma } from '../../db.js';
import {
  PARTNER_KEY,
  addTo,
  asCurrency,
  rowShares,
  storedShares,
  type BeneficiaryLike,
  type Currency,
  type EffectiveShare,
  type StoredShare,
} from './split.js';

/**
 * Database side of the settlement ledger: beneficiaries (seeded once), the AZN↔EUR rate setting, rows with
 * computed shares and totals, the case link (stage follows the case) and the partner commission sync.
 */

const SETTING_KEY = 'settlement';
const SEEDED_KEY = 'settlement.seeded';
export const DEFAULT_RATE = 2;

export const DEFAULT_BENEFICIARIES = [
  { name: 'Xalid', rule: 'THIRD_OF_NET' as const, value: 0, currency: null, sortOrder: 0 },
  { name: 'Tofig', rule: 'REMAINDER' as const, value: 0, currency: null, sortOrder: 1 },
  { name: 'Abdulla', rule: 'REMAINDER' as const, value: 0, currency: null, sortOrder: 2 },
  { name: 'Team', rule: 'FIXED' as const, value: 20000, currency: 'AZN', sortOrder: 3 },
];

/** Creates the default beneficiaries once (idempotent; never again after an admin removed them). */
export const ensureBeneficiaries = async () => {
  if ((await prisma.settlementBeneficiary.count()) > 0) return;
  if (await prisma.setting.findUnique({ where: { key: SEEDED_KEY } })) return;
  await prisma.settlementBeneficiary.createMany({ data: DEFAULT_BENEFICIARIES, skipDuplicates: true });
  await prisma.setting.upsert({ where: { key: SEEDED_KEY }, create: { key: SEEDED_KEY, value: true }, update: {} });
};

export interface SettlementSettings {
  /** AZN per 1 EUR. */
  eurAzn: number;
}

export const getSettings = async (): Promise<SettlementSettings> => {
  const row = await prisma.setting.findUnique({ where: { key: SETTING_KEY } });
  const v = (row?.value ?? {}) as { eurAzn?: unknown };
  const rate = typeof v.eurAzn === 'number' && v.eurAzn > 0 ? v.eurAzn : DEFAULT_RATE;
  return { eurAzn: rate };
};

export const saveSettings = async (s: SettlementSettings) => {
  await prisma.setting.upsert({ where: { key: SETTING_KEY }, create: { key: SETTING_KEY, value: { ...s } }, update: { value: { ...s } } });
  return s;
};

export const listBeneficiaries = async (): Promise<(BeneficiaryLike & { userId: string | null })[]> => {
  await ensureBeneficiaries();
  return prisma.settlementBeneficiary.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, rule: true, value: true, currency: true, active: true, sortOrder: true, userId: true },
  });
};

// ─── Case link ─────────────────────────────────────────────────────────

type CaseLite = { id: string; status: CaseStatus; appointmentAt: Date | null; visaValidFrom: Date | null; decisionAt: Date | null; partnerId: string | null };

const AFTER_DOCUMENTS: CaseStatus[] = ['CONTRACT_SENT', 'CONTRACT_SIGNED', 'EMBASSY_DOCUMENTS', 'EMBASSY_REVIEW', 'APPOINTMENT_SCHEDULED', 'DECISION_PENDING'];

/** Stage a linked case implies; null while the case is still collecting documents (the row keeps its stage). */
export const stageFromCase = (status: CaseStatus): SettlementStage | null => {
  if (status === 'APPROVED') return 'VISA';
  if (status === 'REJECTED') return 'REFUSED';
  if (status === 'CANCELLED') return 'CANCELLED';
  if (AFTER_DOCUMENTS.includes(status)) return 'IN_PROGRESS';
  return null;
};

const sameDay = (a: Date | null, b: Date | null) => (a?.getTime() ?? null) === (b?.getTime() ?? null);

/** Fields of an entry that should change to follow its case (empty object = nothing to do). */
export const caseSyncPatch = (
  e: Pick<SettlementEntry, 'stage' | 'stageAuto' | 'tlsDate' | 'visaDate' | 'partnerId'>,
  c: CaseLite,
): Prisma.SettlementEntryUncheckedUpdateInput => {
  const patch: Prisma.SettlementEntryUncheckedUpdateInput = {};
  if (!e.partnerId && c.partnerId) patch.partnerId = c.partnerId;
  if (!e.stageAuto) return patch;
  const stage = stageFromCase(c.status);
  if (stage && stage !== e.stage) patch.stage = stage;
  if (c.appointmentAt && !sameDay(e.tlsDate, c.appointmentAt)) patch.tlsDate = c.appointmentAt;
  const visa = c.status === 'APPROVED' ? (c.visaValidFrom ?? c.decisionAt) : null;
  if (visa && !sameDay(e.visaDate, visa)) patch.visaDate = visa;
  return patch;
};

const CASE_LITE = { id: true, status: true, appointmentAt: true, visaValidFrom: true, decisionAt: true, partnerId: true } as const;

/** Applies the case → entry sync to the given entries; returns the ids that changed. */
export const syncEntriesWithCases = async (entries: SettlementEntry[]) => {
  const linked = entries.filter((e) => e.caseId);
  if (!linked.length) return [] as string[];
  const cases = await prisma.case.findMany({ where: { id: { in: [...new Set(linked.map((e) => e.caseId!))] } }, select: CASE_LITE });
  const byId = new Map(cases.map((c) => [c.id, c]));
  const changed: string[] = [];
  for (const e of linked) {
    const c = byId.get(e.caseId!);
    if (!c) continue;
    const patch = caseSyncPatch(e, c);
    if (!Object.keys(patch).length) continue;
    const updated = await prisma.settlementEntry.update({ where: { id: e.id }, data: patch });
    Object.assign(e, updated);
    changed.push(e.id);
    if ('partnerId' in patch) await syncCommission(e.id);
  }
  return changed;
};

/** Called (fire-and-forget) after a case changed status: rows linked to it follow. Never throws. */
export const syncSettlementsForCase = async (caseId: string) => {
  try {
    const entries = await prisma.settlementEntry.findMany({ where: { caseId } });
    await syncEntriesWithCases(entries);
  } catch (err) {
    console.error('[settlement] case sync failed', caseId, err);
  }
};

// ─── Partner commission sync ───────────────────────────────────────────

export const partnerPaid = (shares: unknown) => storedShares(shares)[PARTNER_KEY]?.status === 'PAID';

/**
 * Keeps the PartnerCommission of a row in line with its partner share: upserted while the row has a partner and
 * a share > 0 (PENDING, or PAID when marked paid in the ledger), deleted otherwise. An automatic commission of the
 * same partner + case (created on assignment) is adopted instead of duplicated.
 */
export const syncCommission = async (entryId: string) => {
  const e = await prisma.settlementEntry.findUnique({ where: { id: entryId } });
  const existing = await prisma.partnerCommission.findUnique({ where: { settlementEntryId: entryId } });
  if (!e || !e.partnerId || !e.partnerShareCents || e.partnerShareCents <= 0) {
    if (existing) await prisma.partnerCommission.delete({ where: { id: existing.id } });
    return null;
  }
  const paid = partnerPaid(e.shares);
  const paidAtText = storedShares(e.shares)[PARTNER_KEY]?.paidAt;
  let target = existing;
  let caseId: string | null = e.caseId;
  if (caseId) {
    const clash = await prisma.partnerCommission.findFirst({ where: { partnerId: e.partnerId, caseId, ...(existing ? { id: { not: existing.id } } : {}) } });
    if (clash && !clash.settlementEntryId) {
      if (existing) await prisma.partnerCommission.delete({ where: { id: existing.id } });
      target = clash;
    } else if (clash) {
      caseId = null; // another ledger row already holds this partner + case
    }
  }
  const status = paid ? 'PAID' : target?.status === 'APPROVED' ? 'APPROVED' : 'PENDING';
  const data = {
    partnerId: e.partnerId,
    caseId,
    amountCents: e.partnerShareCents,
    currency: asCurrency(e.partnerShareCurrency, 'EUR'),
    status,
    paidAt: paid ? (target?.paidAt ?? (paidAtText ? new Date(paidAtText) : new Date())) : null,
    note: `Hesablaşma: ${e.clientName}`.slice(0, 500),
    settlementEntryId: e.id,
  } satisfies Prisma.PartnerCommissionUncheckedUpdateInput;
  if (target) return prisma.partnerCommission.update({ where: { id: target.id }, data });
  return prisma.partnerCommission.create({ data: { ...data, createdById: e.createdById } });
};

// ─── Rows ──────────────────────────────────────────────────────────────

export const ENTRY_INCLUDE = {
  case: { select: { id: true, number: true, status: true, client: { select: { firstName: true, lastName: true } } } },
} as const;
type EntryWithCase = Prisma.SettlementEntryGetPayload<{ include: typeof ENTRY_INCLUDE }>;

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** The month of a row for filters and reports: visa date, else TLS date, else when it was added. */
export const entryMonth = (e: Pick<SettlementEntry, 'visaDate' | 'tlsDate' | 'createdAt'>) => (e.visaDate ?? e.tlsDate ?? e.createdAt).toISOString().slice(0, 7);

export interface RowDto {
  id: string;
  project: string;
  caseId: string | null;
  case: { id: string; number: string; status: CaseStatus; clientName: string } | null;
  partnerId: string | null;
  clientName: string;
  licence: string | null;
  employer: string | null;
  tlsDate: string | null;
  visaDate: string | null;
  stage: SettlementStage;
  stageAuto: boolean;
  amountCents: number | null;
  currency: Currency;
  payAfterVisa: boolean;
  paidCents: number;
  partnerShareCents: number | null;
  partnerShareCurrency: Currency;
  partnerPaid: boolean;
  expensesCents: number | null;
  note: string | null;
  sortOrder: number;
  shares: Record<string, EffectiveShare | null>;
  netCents: number | null;
  roundingCents: number;
  month: string;
  updatedAt: string;
}

export const toDto = (e: EntryWithCase, bens: BeneficiaryLike[], rate: number): RowDto => {
  const { shares, netCents, roundingCents } = rowShares(e, bens, rate);
  return {
    id: e.id,
    project: e.project,
    caseId: e.caseId,
    case: e.case ? { id: e.case.id, number: e.case.number, status: e.case.status, clientName: `${e.case.client.firstName} ${e.case.client.lastName}`.trim() } : null,
    partnerId: e.partnerId,
    clientName: e.clientName,
    licence: e.licence,
    employer: e.employer,
    tlsDate: day(e.tlsDate),
    visaDate: day(e.visaDate),
    stage: e.stage,
    stageAuto: e.stageAuto,
    amountCents: e.amountCents,
    currency: asCurrency(e.currency),
    payAfterVisa: e.payAfterVisa,
    paidCents: e.paidCents,
    partnerShareCents: e.partnerShareCents,
    partnerShareCurrency: asCurrency(e.partnerShareCurrency, 'EUR'),
    partnerPaid: partnerPaid(e.shares),
    expensesCents: e.expensesCents,
    note: e.note,
    sortOrder: e.sortOrder,
    shares,
    netCents,
    roundingCents,
    month: entryMonth(e),
    updatedAt: e.updatedAt.toISOString(),
  };
};

export interface RowFilter {
  project?: string;
  partnerId?: string;
  stage?: SettlementStage;
  q?: string;
  month?: string;
  unpaid?: boolean;
  ids?: string[];
}

/** Rows with computed shares (linked rows are synced with their case first). */
export const loadRows = async (f: RowFilter = {}) => {
  const [bens, { eurAzn }] = await Promise.all([listBeneficiaries(), getSettings()]);
  const where: Prisma.SettlementEntryWhereInput = {};
  if (f.ids) where.id = { in: f.ids };
  if (f.project) where.project = f.project;
  if (f.partnerId) where.partnerId = f.partnerId === 'none' ? null : f.partnerId;
  if (f.q) where.OR = [{ clientName: { contains: f.q } }, { employer: { contains: f.q } }, { note: { contains: f.q } }];
  const entries = await prisma.settlementEntry.findMany({ where, include: ENTRY_INCLUDE, orderBy: [{ project: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }] });
  await syncEntriesWithCases(entries as unknown as SettlementEntry[]);
  let rows = entries.map((e) => toDto(e, bens, eurAzn));
  if (f.stage) rows = rows.filter((r) => r.stage === f.stage);
  if (f.month) rows = rows.filter((r) => r.month === f.month);
  if (f.unpaid) rows = rows.filter((r) => Object.values(r.shares).some((s) => s && s.status === 'PENDING' && s.cents > 0) || (!!r.partnerShareCents && !r.partnerPaid && !!r.partnerId));
  return { rows, beneficiaries: bens, eurAzn };
};

type Bag = Partial<Record<Currency, number>>;
export interface Totals {
  amount: Bag;
  paid: Bag;
  partnerShare: Bag;
  expenses: Bag;
  /** Per beneficiary id: total / pending / paid per currency. */
  shares: Record<string, { total: Bag; pending: Bag; paid: Bag }>;
  partner: { total: Bag; pending: Bag; paid: Bag };
  count: number;
}

export const totalsOf = (rows: RowDto[], bens: BeneficiaryLike[]): Totals => {
  const t: Totals = { amount: {}, paid: {}, partnerShare: {}, expenses: {}, shares: {}, partner: { total: {}, pending: {}, paid: {} }, count: rows.length };
  for (const b of bens) t.shares[b.id] = { total: {}, pending: {}, paid: {} };
  for (const r of rows) {
    addTo(t.amount, r.currency, r.amountCents);
    addTo(t.paid, r.currency, r.paidCents);
    addTo(t.expenses, r.currency, r.expensesCents);
    addTo(t.partnerShare, r.partnerShareCurrency, r.partnerShareCents);
    addTo(t.partner.total, r.partnerShareCurrency, r.partnerShareCents);
    addTo(r.partnerPaid ? t.partner.paid : t.partner.pending, r.partnerShareCurrency, r.partnerShareCents);
    for (const [id, s] of Object.entries(r.shares)) {
      if (!s || !t.shares[id]) continue;
      addTo(t.shares[id].total, s.currency, s.cents);
      if (s.status === 'PAID') addTo(t.shares[id].paid, s.currency, s.cents);
      else if (s.status === 'PENDING') addTo(t.shares[id].pending, s.currency, s.cents);
    }
  }
  return t;
};

export const projectsList = async () => {
  const g = await prisma.settlementEntry.groupBy({ by: ['project'], _count: { _all: true }, orderBy: { project: 'asc' } });
  return g.map((x) => ({ name: x.project, count: x._count._all }));
};

/** Sets one stored share (status / manual value) on the JSON. */
export const withShare = (raw: unknown, id: string, next: StoredShare | null) => {
  const s = { ...storedShares(raw) };
  if (next == null) delete s[id];
  else s[id] = next;
  return s as Prisma.InputJsonValue;
};
