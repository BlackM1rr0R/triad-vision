import { Prisma, VisaType } from '@prisma/client';
import { prisma } from '../../db.js';
import { hasMinRole } from '../../middleware/auth.js';
import { MAX_AGE, MIN_AGE, ageOn, intlPhone, passportNo } from '../../routes/auth.js';
import { FAMILY_EVENT, parseMemberInfo, type FamilyMemberInfo } from '../journey/family.js';
import { NOTE_KEY, registerDataOf, type ColumnDto } from './rows.js';

/**
 * Batch save of the client register: [{ caseId, field, value }] → per-change results.
 *
 *  - client data (firstName, lastName, passportNumber, birthDate, phone) is written to the client user,
 *    for family-member cases name / birth date go to the member's details (passport / phone: read-only);
 *  - case fields: visaType, partnerId, assignedStaffId; status and dates are read-only here;
 *  - `_note` and admin-defined columns go to Case.registerData (validated by column type).
 */

export interface Change {
  caseId: string;
  field: string;
  value: unknown;
}

export interface ChangeResult {
  caseId: string;
  field: string;
  ok: boolean;
  error?: string;
}

const READ_ONLY = new Set(['number', 'email', 'category', 'status', 'createdAt', 'decisionAt']);
const USER_FIELDS = new Set(['firstName', 'lastName', 'passportNumber', 'birthDate', 'phone']);
/** Fields that change the client's drive folder name or place. */
export const FOLDER_FIELDS = new Set(['firstName', 'lastName', 'passportNumber', 'visaType', 'partnerId']);

class FieldError extends Error {}
const fail = (code: string): never => {
  throw new FieldError(code);
};

const isBlank = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
const asText = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : fail('INVALID_VALUE'));

const name = (v: unknown) => {
  const s = asText(v ?? '').trim();
  if (!s) fail('REQUIRED');
  if (s.length > 80) fail('TOO_LONG');
  return s;
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const parseDay = (v: unknown) => {
  const s = asText(v).trim();
  if (!ISO_DAY.test(s)) fail('INVALID_DATE');
  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) fail('INVALID_DATE');
  return { s, d };
};

const birth = (v: unknown, member: boolean) => {
  if (isBlank(v)) return null;
  const { s, d } = parseDay(v);
  if (d.getTime() > Date.now()) fail('DATE_IN_FUTURE');
  const age = ageOn(d);
  if (member ? age > 120 : age < MIN_AGE || age > MAX_AGE) fail('AGE_OUT_OF_RANGE');
  return { s, d };
};

const zodValue = <T>(schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { issues: { message: string }[] } } }, v: unknown, code: string) => {
  const r = schema.safeParse(typeof v === 'number' ? String(v) : v);
  if (!r.success) fail(r.error.issues[0]?.message?.startsWith('INVALID_') ? r.error.issues[0].message : code);
  return (r as { data: T }).data;
};

/** Value of an admin-defined column, or null to clear it. */
export const columnValue = (col: Pick<ColumnDto, 'type' | 'options'>, v: unknown): string | number | boolean | null => {
  if (col.type === 'CHECKBOX') {
    if (isBlank(v)) return null;
    if (typeof v === 'boolean') return v || null;
    const s = asText(v).trim().toLowerCase();
    if (['true', '1', 'yes', 'ja', 'bəli', 'да', 'x', '✓'].includes(s)) return true;
    if (['false', '0', 'no', 'nein', 'xeyr', 'нет'].includes(s)) return null;
    return fail('INVALID_BOOLEAN');
  }
  if (isBlank(v)) return null;
  switch (col.type) {
    case 'NUMBER': {
      const n = typeof v === 'number' ? v : Number(asText(v).trim().replace(/\s/g, '').replace(',', '.'));
      if (!Number.isFinite(n)) fail('INVALID_NUMBER');
      return n;
    }
    case 'DATE':
      return parseDay(v).s;
    case 'SELECT': {
      const s = asText(v).trim();
      if (!col.options.includes(s)) fail('INVALID_OPTION');
      return s;
    }
    default: {
      const s = asText(v);
      if (s.length > 1000) fail('TOO_LONG');
      return s;
    }
  }
};

interface CasePlan {
  user: Prisma.UserUpdateInput;
  kase: Prisma.CaseUncheckedUpdateInput;
  data: Record<string, string | number | boolean | null>;
  member: Partial<FamilyMemberInfo>;
}

export const applyChanges = async (changes: Change[], columns: ColumnDto[]) => {
  const colById = new Map(columns.map((c) => [c.id, c]));
  // Last change of a field wins.
  const latest = new Map<string, Change>();
  for (const ch of changes) latest.set(`${ch.caseId}\u0000${ch.field}`, ch);
  const list = [...latest.values()];

  const caseIds = [...new Set(list.map((c) => c.caseId))];
  const cases = await prisma.case.findMany({
    where: { id: { in: caseIds } },
    select: {
      id: true,
      clientId: true,
      parentCaseId: true,
      partnerId: true,
      registerData: true,
      events: { where: { type: FAMILY_EVENT }, orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, note: true } },
    },
  });
  const caseById = new Map(cases.map((c) => [c.id, c]));
  // Partner changes, so the automatic partner commissions follow (same as the bulk assign in admin/partners).
  const partnerChanges: { caseId: string; from: string | null; to: string | null }[] = [];

  const wanted = (field: string) => [...new Set(list.filter((c) => c.field === field && !isBlank(c.value)).map((c) => String(c.value)))];
  const [partners, staff] = await Promise.all([
    prisma.referralPartner.findMany({ where: { id: { in: wanted('partnerId') } }, select: { id: true } }),
    prisma.user.findMany({ where: { id: { in: wanted('assignedStaffId') } }, select: { id: true, role: true, isActive: true } }),
  ]);
  const partnerIds = new Set(partners.map((p) => p.id));
  const staffIds = new Set(staff.filter((u) => u.isActive && hasMinRole(u.role, 'STAFF')).map((u) => u.id));

  const results: ChangeResult[] = [];
  const plans = new Map<string, CasePlan>();
  const planOf = (id: string) => plans.get(id) ?? plans.set(id, { user: {}, kase: {}, data: {}, member: {} }).get(id)!;

  for (const ch of list) {
    const c = caseById.get(ch.caseId);
    try {
      if (!c) fail('CASE_NOT_FOUND');
      const kase = c!;
      const member = !!kase.parentCaseId;
      const plan = planOf(kase.id);
      const f = ch.field;
      if (READ_ONLY.has(f)) fail('READ_ONLY');
      if (USER_FIELDS.has(f)) {
        if (member) {
          if (f === 'firstName' || f === 'lastName') plan.member[f] = name(ch.value);
          else if (f === 'birthDate') plan.member.birthDate = birth(ch.value, true)?.s ?? null;
          else fail('READ_ONLY_FOR_MEMBER');
        } else if (f === 'firstName' || f === 'lastName') plan.user[f] = name(ch.value);
        else if (f === 'birthDate') plan.user.birthDate = birth(ch.value, false)?.d ?? null;
        else if (f === 'passportNumber') plan.user.passportNumber = isBlank(ch.value) ? null : zodValue(passportNo, ch.value, 'INVALID_PASSPORT');
        else if (f === 'phone') plan.user.phone = isBlank(ch.value) ? null : zodValue(intlPhone, ch.value, 'INVALID_PHONE');
      } else if (f === 'visaType') {
        const v = asText(ch.value ?? '');
        if (!(Object.values(VisaType) as string[]).includes(v)) fail('INVALID_VISA_TYPE');
        plan.kase.visaType = v as VisaType;
      } else if (f === 'partnerId') {
        if (isBlank(ch.value)) plan.kase.partnerId = null;
        else if (!partnerIds.has(String(ch.value))) fail('INVALID_PARTNER');
        else plan.kase.partnerId = String(ch.value);
      } else if (f === 'assignedStaffId') {
        if (isBlank(ch.value)) plan.kase.assignedStaffId = null;
        else if (!staffIds.has(String(ch.value))) fail('INVALID_STAFF');
        else plan.kase.assignedStaffId = String(ch.value);
      } else if (f === NOTE_KEY) {
        const s = isBlank(ch.value) ? null : asText(ch.value);
        if (s && s.length > 2000) fail('TOO_LONG');
        plan.data[NOTE_KEY] = s;
      } else {
        const col = colById.get(f);
        if (!col) fail('UNKNOWN_FIELD');
        plan.data[f] = columnValue(col!, ch.value);
      }
      results.push({ caseId: ch.caseId, field: ch.field, ok: true });
    } catch (err) {
      if (!(err instanceof FieldError)) throw err;
      results.push({ caseId: ch.caseId, field: ch.field, ok: false, error: err.message });
    }
  }

  // Apply, one transaction per case.
  const folderSync = new Set<string>();
  const clientsRenamed = new Set<string>();
  for (const [caseId, plan] of plans) {
    const c = caseById.get(caseId)!;
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    if (Object.keys(plan.user).length) {
      ops.push(prisma.user.update({ where: { id: c.clientId }, data: plan.user }));
      if ('firstName' in plan.user || 'lastName' in plan.user || 'passportNumber' in plan.user) clientsRenamed.add(c.clientId);
    }
    const data = { ...plan.kase };
    if (Object.keys(plan.data).length) {
      const merged: Record<string, string | number | boolean> = registerDataOf(c.registerData);
      for (const [k, v] of Object.entries(plan.data)) {
        if (v === null) delete merged[k];
        else merged[k] = v;
      }
      data.registerData = Object.keys(merged).length ? merged : Prisma.DbNull;
    }
    if (Object.keys(data).length) ops.push(prisma.case.update({ where: { id: caseId }, data }));
    if (Object.keys(plan.member).length) {
      const ev = c.events[0];
      const info = { ...(parseMemberInfo(ev?.note) ?? { firstName: '', lastName: '', birthDate: null, email: null, relation: 'spouse' }), ...plan.member };
      ops.push(
        ev
          ? prisma.caseEvent.update({ where: { id: ev.id }, data: { note: JSON.stringify(info) } })
          : prisma.caseEvent.create({ data: { caseId, type: FAMILY_EVENT, note: JSON.stringify(info), visibleToClient: false } }),
      );
    }
    if (!ops.length) continue;
    await prisma.$transaction(ops);
    if ('partnerId' in plan.kase && (plan.kase.partnerId ?? null) !== c.partnerId) partnerChanges.push({ caseId, from: c.partnerId, to: (plan.kase.partnerId as string | null) ?? null });
    const touched = Object.keys(plan.user).concat(Object.keys(plan.kase), Object.keys(plan.member));
    if (touched.some((k) => FOLDER_FIELDS.has(k))) folderSync.add(caseId);
  }
  // A client's name / passport is part of every one of their case folders.
  if (clientsRenamed.size) {
    const siblings = await prisma.case.findMany({ where: { clientId: { in: [...clientsRenamed] }, parentCaseId: null }, select: { id: true } });
    for (const s of siblings) folderSync.add(s.id);
  }
  return { results, touchedCaseIds: [...plans.keys()], folderSync: [...folderSync], partnerChanges };
};
