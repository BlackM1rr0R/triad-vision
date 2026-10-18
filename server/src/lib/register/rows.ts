import type { CaseStatus, ClientRegisterColumn, Prisma, RegisterColumnType, VisaType } from '@prisma/client';
import { prisma } from '../../db.js';
import { FAMILY_EVENT, parseMemberInfo } from '../journey/family.js';
import type { Lang } from './labels.js';

/**
 * Rows of the client register: one row per case (main applications and family-member cases), with the
 * client's personal data, the case's fixed fields and the admin-defined extra columns (Case.registerData).
 * The internal note lives in registerData under `_note` (Case.staffNote is shown to the client).
 */

export const NOTE_KEY = '_note';
export const MAX_ROWS = 5000;

export interface RegisterRow {
  id: string;
  number: string;
  kind: 'main' | 'member';
  parentId: string | null;
  parentNumber: string | null;
  relation: string | null;
  clientId: string;
  firstName: string;
  lastName: string;
  passportNumber: string | null;
  birthDate: string | null;
  phone: string | null;
  email: string | null;
  visaType: VisaType;
  category: string | null;
  partnerId: string | null;
  status: CaseStatus;
  assignedStaffId: string | null;
  createdAt: string;
  decisionAt: string | null;
  _note: string;
  data: Record<string, string | number | boolean>;
}

export const rowSelect = {
  id: true,
  number: true,
  parentCaseId: true,
  relation: true,
  clientId: true,
  visaType: true,
  status: true,
  partnerId: true,
  assignedStaffId: true,
  createdAt: true,
  decisionAt: true,
  registerData: true,
  parentCase: { select: { number: true } },
  visaCategory: { select: { title: true, visaLabel: true } },
  client: { select: { firstName: true, lastName: true, passportNumber: true, birthDate: true, phone: true, email: true } },
  events: { where: { type: FAMILY_EVENT }, orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, note: true } },
} satisfies Prisma.CaseSelect;

type RowSource = Prisma.CaseGetPayload<{ select: typeof rowSelect }>;

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

export const registerDataOf = (v: Prisma.JsonValue | null | undefined): Record<string, string | number | boolean> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: Record<string, string | number | boolean> = {};
  for (const [k, x] of Object.entries(v)) if (typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean') out[k] = x;
  return out;
};

const titleIn = (title: Prisma.JsonValue, lang: Lang) => {
  if (title && typeof title === 'object' && !Array.isArray(title)) {
    const t = title as Record<string, unknown>;
    const v = t[lang] ?? t.az ?? t.en;
    if (typeof v === 'string' && v) return v;
  }
  return null;
};

export const toRow = (c: RowSource, lang: Lang): RegisterRow => {
  const member = c.parentCaseId ? parseMemberInfo(c.events[0]?.note) : null;
  const data = registerDataOf(c.registerData);
  const note = typeof data[NOTE_KEY] === 'string' ? (data[NOTE_KEY] as string) : '';
  delete data[NOTE_KEY];
  const isMember = !!c.parentCaseId;
  return {
    id: c.id,
    number: c.number,
    kind: isMember ? 'member' : 'main',
    parentId: c.parentCaseId,
    parentNumber: c.parentCase?.number ?? null,
    relation: c.relation,
    clientId: c.clientId,
    firstName: isMember ? (member?.firstName ?? '') : c.client.firstName,
    lastName: isMember ? (member?.lastName ?? '') : c.client.lastName,
    // A member's own passport / phone are not stored; the main applicant's would be misleading.
    passportNumber: isMember ? null : c.client.passportNumber,
    birthDate: isMember ? (member?.birthDate ?? null) : day(c.client.birthDate),
    phone: isMember ? null : c.client.phone,
    email: isMember ? (member?.email ?? null) : c.client.email,
    visaType: c.visaType,
    category: c.visaCategory ? (titleIn(c.visaCategory.title, lang) ?? c.visaCategory.visaLabel) : null,
    partnerId: c.partnerId,
    status: c.status,
    assignedStaffId: c.assignedStaffId,
    createdAt: c.createdAt.toISOString(),
    decisionAt: c.decisionAt ? c.decisionAt.toISOString() : null,
    _note: note,
    data,
  };
};

/** Rows in register order: newest main cases first, each followed by its family members. */
export const loadRows = async (lang: Lang, opts: { q?: string; ids?: string[] } = {}) => {
  const q = opts.q?.trim();
  const where: Prisma.CaseWhereInput = {
    ...(opts.ids ? { id: { in: opts.ids } } : {}),
    ...(q
      ? {
          OR: [
            { number: { contains: q } },
            { client: { firstName: { contains: q } } },
            { client: { lastName: { contains: q } } },
            { client: { email: { contains: q } } },
            { client: { phone: { contains: q } } },
            { client: { passportNumber: { contains: q } } },
          ],
        }
      : {}),
  };
  const rows = await prisma.case.findMany({ where, select: rowSelect, orderBy: { createdAt: 'desc' }, take: MAX_ROWS + 1 });
  const truncated = rows.length > MAX_ROWS;
  const list = rows.slice(0, MAX_ROWS).map((r) => toRow(r, lang));
  // Members right below their main case (when both are in the list).
  const byParent = new Map<string, RegisterRow[]>();
  const present = new Set(list.map((r) => r.id));
  for (const r of list) if (r.parentId && present.has(r.parentId)) (byParent.get(r.parentId) ?? byParent.set(r.parentId, []).get(r.parentId)!).push(r);
  const ordered: RegisterRow[] = [];
  for (const r of list) {
    if (r.parentId && present.has(r.parentId)) continue;
    ordered.push(r);
    for (const m of (byParent.get(r.id) ?? []).sort((a, b) => a.createdAt.localeCompare(b.createdAt))) ordered.push(m);
  }
  return { rows: ordered, truncated };
};

export const columnDto = (c: ClientRegisterColumn) => ({
  id: c.id,
  label: c.label,
  type: c.type as RegisterColumnType,
  options: Array.isArray(c.options) ? (c.options as unknown[]).filter((o): o is string => typeof o === 'string') : [],
  width: c.width,
  sortOrder: c.sortOrder,
});

export const listColumns = async () => (await prisma.clientRegisterColumn.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] })).map(columnDto);
export type ColumnDto = ReturnType<typeof columnDto>;
