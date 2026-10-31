import { z } from 'zod';
import type { Contact, Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { notFound } from '../http.js';
import { loadOwner, ownerData, ownerOfRow, ownerShape, ownerWhere, type Owner } from './owner.js';

/**
 * Contact persons of an employer / referral partner: shared rows of the address book (Contact, shared = true,
 * companyId or referralPartnerId set), so they also show up in the staff contacts. Exactly one may be the
 * primary contact per owner: setting one primary clears the others, the first contact becomes primary
 * automatically, and deleting the primary one promotes the oldest remaining contact.
 */

const opt = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === '' ? null : v));

export const contactFields = {
  firstName: z.string().trim().min(1).max(80),
  lastName: opt(80),
  position: opt(120),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(190)
    .nullable()
    .optional()
    .transform((v) => (v === '' ? null : v))
    .refine((v) => v == null || z.string().email().safeParse(v).success, 'INVALID_EMAIL'),
  phone: opt(40),
  notes: opt(5000),
  isPrimary: z.boolean().optional(),
};

export const contactCreateSchema = z.object({ ...ownerShape, ...contactFields });
export const contactUpdateSchema = z.object({ ...contactFields, firstName: contactFields.firstName.optional() });

/** "Anna Maria Schmidt" → first "Anna Maria", last "Schmidt" (for imports / a single name field). */
export const splitName = (full: string) => {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return { firstName: parts[0] ?? '', lastName: null };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
};

export const contactView = (c: Contact) => ({
  id: c.id,
  firstName: c.firstName,
  lastName: c.lastName,
  name: `${c.firstName} ${c.lastName ?? ''}`.trim(),
  position: c.position,
  email: c.email,
  phone: c.phone,
  notes: c.notes,
  isPrimary: c.isPrimary,
  companyId: c.companyId,
  referralPartnerId: c.referralPartnerId,
  userId: c.userId,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
});

export const listContacts = async (owner: Owner) => {
  await loadOwner(owner);
  return prisma.contact.findMany({ where: ownerWhere(owner), orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] });
};

export const loadContact = async (id: string) => {
  const c = await prisma.contact.findUnique({ where: { id } });
  if (!c || (!c.companyId && !c.referralPartnerId)) throw notFound('CONTACT_NOT_FOUND');
  return c;
};

type Tx = Prisma.TransactionClient;

const clearOtherPrimaries = (tx: Tx, owner: Owner, keepId: string) => tx.contact.updateMany({ where: { ...ownerWhere(owner), isPrimary: true, id: { not: keepId } }, data: { isPrimary: false } });

export const createContact = async (owner: Owner, body: z.infer<typeof contactCreateSchema>, createdById: string) => {
  const info = await loadOwner(owner);
  const { companyId: _c, referralPartnerId: _r, isPrimary, ...rest } = body;
  void _c;
  void _r;
  return prisma.$transaction(async (tx) => {
    const hasPrimary = (await tx.contact.count({ where: { ...ownerWhere(owner), isPrimary: true } })) > 0;
    const primary = isPrimary ?? !hasPrimary;
    const created = await tx.contact.create({
      data: { ...ownerData(owner), ...rest, company: info.name.slice(0, 120), isPrimary: primary, shared: true, source: 'MANUAL', createdById },
    });
    if (primary) await clearOtherPrimaries(tx, owner, created.id);
    return created;
  });
};

export const updateContact = async (c: Contact, body: z.infer<typeof contactUpdateSchema>) => {
  const owner = ownerOfRow(c);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.contact.update({ where: { id: c.id }, data: body });
    if (body.isPrimary === true) await clearOtherPrimaries(tx, owner, c.id);
    if (body.isPrimary === false && c.isPrimary) await promoteOldest(tx, owner, c.id);
    return updated;
  });
};

/** Makes the oldest other contact primary when none is left. */
const promoteOldest = async (tx: Tx, owner: Owner, exceptId: string) => {
  if (await tx.contact.count({ where: { ...ownerWhere(owner), isPrimary: true, id: { not: exceptId } } })) return;
  const next = await tx.contact.findFirst({ where: { ...ownerWhere(owner), id: { not: exceptId } }, orderBy: { createdAt: 'asc' } });
  if (next) await tx.contact.update({ where: { id: next.id }, data: { isPrimary: true } });
};

export const deleteContact = async (c: Contact) => {
  const owner = ownerOfRow(c);
  await prisma.$transaction(async (tx) => {
    await tx.contact.delete({ where: { id: c.id } });
    if (c.isPrimary) await promoteOldest(tx, owner, c.id);
  });
};
