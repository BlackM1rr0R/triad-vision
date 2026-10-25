import type { Prisma, SettlementEntry, SettlementStage } from '@prisma/client';
import { prisma } from '../../db.js';
import { PARTNER_KEY, RAWOT, asCurrency, computeSplit, fixedShares, storedShares, type StoredShare } from './split.js';
import { getSettings, listBeneficiaries, syncCommission, syncEntriesWithCases } from './service.js';
import { parseAmount, splitName } from './parse.js';

/**
 * Writes to the settlement ledger: batch field changes, share overrides and payment status, recalculation.
 */

export const STAGES: SettlementStage[] = ['NEW', 'IN_PROGRESS', 'VISA', 'REFUSED', 'CANCELLED'];
export type ChangeValue = string | number | boolean | null | { cents?: number | null; currency?: string | null; text?: string | null };
export interface Change {
  id: string;
  field: string;
  value: ChangeValue;
}
export interface ChangeResult {
  id: string;
  field: string;
  ok: boolean;
  error?: string;
}

class FieldError extends Error {}
const fail = (code: string): never => {
  throw new FieldError(code);
};

const str = (v: ChangeValue, max: number, required = false) => {
  if (v == null || v === '') {
    if (required) fail('REQUIRED');
    return null;
  }
  if (typeof v === 'object') fail('INVALID_VALUE');
  const s = String(v).trim();
  if (!s && required) fail('REQUIRED');
  if (s.length > max) fail('TOO_LONG');
  return s || null;
};

const cents = (v: ChangeValue) => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || Math.abs(v) > 1e11) fail('INVALID_AMOUNT');
    return Math.round(v);
  }
  if (typeof v === 'string') {
    const a = parseAmount(v);
    if (a.amountCents == null) fail('INVALID_AMOUNT');
    return a.amountCents!;
  }
  return fail('INVALID_AMOUNT');
};

const date = (v: ChangeValue) => {
  if (v == null || v === '') return null;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(v)) fail('INVALID_DATE');
  const d = new Date(`${(v as string).slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) fail('INVALID_DATE');
  return d;
};

const currency = (v: ChangeValue) => {
  if (v === 'AZN' || v === 'EUR') return v;
  return fail('INVALID_CURRENCY');
};

const bool = (v: ChangeValue) => {
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === 1) return true;
  if (v === 'false' || v === 0 || v == null) return false;
  return fail('INVALID_VALUE');
};

/** Parses a manual share value: number (cents), "rawot", "500 euro", { cents, currency, text } or null (= back to the rule). */
export const manualShare = (v: ChangeValue, fallbackCurrency: string, previous?: StoredShare): StoredShare | null => {
  if (v == null || v === '') return null;
  const keep = previous?.status && previous.status !== 'NONE' ? { status: previous.status, ...(previous.paidAt ? { paidAt: previous.paidAt } : {}) } : { status: 'PENDING' as const };
  if (typeof v === 'number') return { cents: Math.round(v), currency: asCurrency(fallbackCurrency), manual: true, ...keep };
  if (typeof v === 'string') {
    if (v.trim().toLowerCase() === RAWOT) return { cents: 0, currency: asCurrency(fallbackCurrency), text: RAWOT, status: 'NONE', manual: true };
    const a = parseAmount(v, asCurrency(fallbackCurrency));
    if (a.amountCents == null) fail('INVALID_AMOUNT');
    return { cents: a.amountCents!, currency: a.currency ?? asCurrency(fallbackCurrency), manual: true, ...keep };
  }
  if (typeof v === 'object') {
    if (v.text) {
      const text = String(v.text).trim().slice(0, 40);
      return { cents: 0, currency: asCurrency(v.currency ?? fallbackCurrency), text, status: 'NONE', manual: true };
    }
    if (typeof v.cents !== 'number' || !Number.isFinite(v.cents)) fail('INVALID_AMOUNT');
    return { cents: Math.round(v.cents!), currency: asCurrency(v.currency ?? fallbackCurrency), manual: true, ...keep };
  }
  return fail('INVALID_VALUE');
};

/** Applies the payment status of one share (beneficiary id or "_partner"); frozen at its current amount when paid. */
export const setShareStatus = async (entry: SettlementEntry, key: string, paid: boolean, rate?: number) => {
  const shares = { ...storedShares(entry.shares) };
  const prev = shares[key] ?? {};
  if (key === PARTNER_KEY) {
    shares[key] = paid ? { status: 'PAID', paidAt: prev.paidAt ?? new Date().toISOString() } : { status: 'PENDING' };
    return shares;
  }
  if (prev.text) return shares; // "rawot": nothing to pay
  if (paid) {
    let value = prev.manual ? { cents: prev.cents ?? 0, currency: prev.currency ?? entry.currency } : null;
    if (!value) {
      const bens = await listBeneficiaries();
      const split = computeSplit(entry, bens, rate ?? (await getSettings()).eurAzn, fixedShares(shares, asCurrency(entry.currency)));
      const c = split?.shares[key];
      if (!c) return shares; // nothing computed: no amount
      value = { cents: c.cents, currency: c.currency };
    }
    shares[key] = { ...prev, ...value, status: 'PAID', paidAt: prev.paidAt ?? new Date().toISOString() };
  } else {
    const next: StoredShare = { ...prev, status: 'PENDING' };
    delete next.paidAt;
    if (!prev.manual) {
      delete next.cents;
      delete next.currency;
    }
    shares[key] = next;
  }
  return shares;
};

const DIRECT: Record<string, (v: ChangeValue) => Prisma.SettlementEntryUncheckedUpdateInput> = {
  project: (v) => ({ project: str(v, 80, true)! }),
  clientName: (v) => {
    const s = str(v, 160, true)!;
    return { clientName: s };
  },
  licence: (v) => ({ licence: str(v, 20)?.toUpperCase() ?? null }),
  employer: (v) => ({ employer: str(v, 160) }),
  tlsDate: (v) => ({ tlsDate: date(v) }),
  visaDate: (v) => ({ visaDate: date(v) }),
  stage: (v) => {
    if (!STAGES.includes(v as SettlementStage)) fail('INVALID_STAGE');
    return { stage: v as SettlementStage, stageAuto: false };
  },
  stageAuto: (v) => ({ stageAuto: bool(v) }),
  amountCents: (v) => ({ amountCents: cents(v) }),
  currency: (v) => ({ currency: currency(v) }),
  payAfterVisa: (v) => ({ payAfterVisa: bool(v) }),
  paidCents: (v) => {
    const c = cents(v) ?? 0;
    if (c < 0) fail('INVALID_AMOUNT');
    return { paidCents: c };
  },
  partnerShareCents: (v) => ({ partnerShareCents: cents(v) }),
  partnerShareCurrency: (v) => ({ partnerShareCurrency: currency(v) }),
  expensesCents: (v) => ({ expensesCents: cents(v) }),
  note: (v) => ({ note: str(v, 5000) }),
};

export const EDITABLE_FIELDS = [...Object.keys(DIRECT), 'partnerId', 'partnerPaid', 'share:<id>', 'shareStatus:<id>'];

/**
 * Batch save: each change is validated and applied on its own (a bad value does not stop the others).
 * Returns per-change results and the ids of touched rows.
 */
export const applyChanges = async (changes: Change[]) => {
  const ids = [...new Set(changes.map((c) => c.id))];
  const entries = new Map((await prisma.settlementEntry.findMany({ where: { id: { in: ids } } })).map((e) => [e.id, e]));
  const benIds = new Set((await listBeneficiaries()).map((b) => b.id));
  const partnerIds = new Set(
    (await prisma.referralPartner.findMany({ where: { id: { in: changes.filter((c) => c.field === 'partnerId' && typeof c.value === 'string').map((c) => c.value as string) } }, select: { id: true } })).map((p) => p.id),
  );
  const rate = (await getSettings()).eurAzn;
  const results: ChangeResult[] = [];
  const touched = new Set<string>();
  const commission = new Set<string>();
  for (const ch of changes) {
    const e = entries.get(ch.id);
    if (!e) {
      results.push({ id: ch.id, field: ch.field, ok: false, error: 'NOT_FOUND' });
      continue;
    }
    try {
      let data: Prisma.SettlementEntryUncheckedUpdateInput;
      if (DIRECT[ch.field]) {
        data = DIRECT[ch.field]!(ch.value);
        if (ch.field === 'clientName') {
          // "Name (CE)" typed in the name cell: the licence goes to its own column.
          const s = splitName(String(data.clientName));
          if (s.licence && s.name) data = { clientName: s.name, licence: s.licence };
        }
      } else if (ch.field === 'partnerId') {
        const v = ch.value == null || ch.value === '' ? null : String(ch.value);
        if (v && !partnerIds.has(v)) fail('PARTNER_NOT_FOUND');
        data = { partnerId: v };
      } else if (ch.field === 'partnerPaid') {
        data = { shares: (await setShareStatus(e, PARTNER_KEY, bool(ch.value), rate)) as Prisma.InputJsonValue };
      } else if (ch.field.startsWith('share:')) {
        const bid = ch.field.slice(6);
        if (!benIds.has(bid)) fail('BENEFICIARY_NOT_FOUND');
        const shares = { ...storedShares(e.shares) };
        const next = manualShare(ch.value, e.currency, shares[bid]);
        if (next) shares[bid] = next;
        else if (shares[bid]?.status && shares[bid]!.status !== 'NONE') shares[bid] = { status: shares[bid]!.status === 'PAID' ? 'PENDING' : shares[bid]!.status };
        else delete shares[bid];
        data = { shares: shares as Prisma.InputJsonValue };
      } else if (ch.field.startsWith('shareStatus:')) {
        const bid = ch.field.slice(12);
        if (!benIds.has(bid)) fail('BENEFICIARY_NOT_FOUND');
        const v = ch.value;
        if (v !== 'PAID' && v !== 'PENDING' && v !== true && v !== false) fail('INVALID_VALUE');
        data = { shares: (await setShareStatus(e, bid, v === 'PAID' || v === true, rate)) as Prisma.InputJsonValue };
      } else {
        fail('UNKNOWN_FIELD');
      }
      const updated = await prisma.settlementEntry.update({ where: { id: e.id }, data: data! });
      entries.set(e.id, updated);
      touched.add(e.id);
      if (['partnerId', 'partnerShareCents', 'partnerShareCurrency', 'partnerPaid', 'clientName'].includes(ch.field)) commission.add(e.id);
      results.push({ id: ch.id, field: ch.field, ok: true });
    } catch (err) {
      if (err instanceof FieldError) results.push({ id: ch.id, field: ch.field, ok: false, error: err.message });
      else throw err;
    }
  }
  for (const id of commission) await syncCommission(id);
  // A linked row switched back to "follow the case" catches up right away.
  const auto = [...touched].map((id) => entries.get(id)!).filter((e) => e.caseId && e.stageAuto);
  if (auto.length) await syncEntriesWithCases(auto);
  return { results, touched: [...touched] };
};

/** Drops manual values (incl. "rawot"); paid shares keep their frozen amount, everything else follows the rules. */
export const recalculate = async (ids: string[]) => {
  const entries = await prisma.settlementEntry.findMany({ where: { id: { in: ids } } });
  for (const e of entries) {
    const shares = storedShares(e.shares);
    const next: Record<string, StoredShare> = {};
    for (const [k, s] of Object.entries(shares)) {
      // "_partner" and other metadata keys ("_import": the import batch) are kept.
      if (k === PARTNER_KEY || k.startsWith('_')) {
        next[k] = s;
        continue;
      }
      if (s.status === 'PAID' && !s.text) next[k] = { cents: s.cents, currency: s.currency, status: 'PAID', ...(s.paidAt ? { paidAt: s.paidAt } : {}) };
      else if (s.status === 'NONE' && !s.text) next[k] = { status: 'NONE' };
    }
    await prisma.settlementEntry.update({ where: { id: e.id }, data: { shares: next as Prisma.InputJsonValue } });
  }
  return entries.map((e) => e.id);
};

/** Marks shares paid / unpaid: `key` = beneficiary id, "_partner", or "*" (every share of the row). */
export const markPaid = async (items: { id: string; key: string }[], paid: boolean) => {
  const entries = new Map((await prisma.settlementEntry.findMany({ where: { id: { in: [...new Set(items.map((i) => i.id))] } } })).map((e) => [e.id, e]));
  const bens = await listBeneficiaries();
  const rate = (await getSettings()).eurAzn;
  const touched = new Set<string>();
  for (const it of items) {
    let e = entries.get(it.id);
    if (!e) continue;
    const keys = it.key === '*' ? [...bens.filter((b) => b.active).map((b) => b.id), ...(e.partnerId && e.partnerShareCents ? [PARTNER_KEY] : [])] : [it.key];
    for (const k of keys) {
      const shares = await setShareStatus(e, k, paid, rate);
      e = await prisma.settlementEntry.update({ where: { id: e.id }, data: { shares: shares as Prisma.InputJsonValue } });
      entries.set(e.id, e);
    }
    touched.add(e.id);
    if (keys.includes(PARTNER_KEY)) await syncCommission(e.id);
  }
  return [...touched];
};

export const nextSortOrder = async (project: string) => {
  const max = await prisma.settlementEntry.aggregate({ where: { project }, _max: { sortOrder: true } });
  return (max._max.sortOrder ?? -1) + 1;
};
