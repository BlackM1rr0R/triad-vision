import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { requireMinRole } from '../../middleware/auth.js';
import { badRequest, notFound, parse } from '../http.js';
import { audit } from '../audit.js';
import { customDataOf, MAX_FIELD_DEFS, PARTNER_FIELD_TYPES, type PartnerFieldType } from './profile.js';
import { fieldDefDto, listFieldDefs } from './fieldDefs.js';

export { listFieldDefs };

/**
 * Admin-defined extra fields of the referral partner form — mounted inside /api/admin/partners as
 * /fields. Staff read them (they fill them in on every partner form); ADMIN and above add, change,
 * reorder and delete them. Values live in ReferralPartner.customData (lib/partners/profile.ts).
 */
export const partnerFieldsRouter = Router();

const optionList = z
  .array(z.string().trim().min(1).max(80))
  .max(200)
  .transform((a) => [...new Set(a)]);
const fieldSchema = z.object({
  label: z.string().trim().min(1).max(80),
  type: z.enum(PARTNER_FIELD_TYPES).default('TEXT'),
  options: optionList.optional(),
});

const adminOnly = requireMinRole('ADMIN');

partnerFieldsRouter.get('/fields', async (_req, res) => {
  res.json({ fields: await listFieldDefs() });
});

partnerFieldsRouter.post('/fields', adminOnly, async (req, res) => {
  const body = parse(fieldSchema, req.body);
  if ((await prisma.partnerFieldDef.count()) >= MAX_FIELD_DEFS) throw badRequest('TOO_MANY_FIELDS');
  if (body.type === 'SELECT' && !body.options?.length) throw badRequest('OPTIONS_REQUIRED');
  const max = await prisma.partnerFieldDef.aggregate({ _max: { sortOrder: true } });
  const created = await prisma.partnerFieldDef.create({
    data: { label: body.label, type: body.type, options: body.type === 'SELECT' ? body.options : Prisma.DbNull, sortOrder: (max._max.sortOrder ?? -1) + 1 },
  });
  await audit(req, 'PARTNER_FIELD_ADDED', `partner-field:${created.id}`, { label: created.label, type: created.type });
  res.status(201).json({ field: fieldDefDto(created) });
});

partnerFieldsRouter.put('/fields/order', adminOnly, async (req, res) => {
  const { ids } = parse(z.object({ ids: z.array(z.string().min(1).max(40)).max(MAX_FIELD_DEFS * 2) }), req.body);
  const existing = await prisma.partnerFieldDef.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], select: { id: true } });
  const known = new Set(existing.map((c) => c.id));
  const order = [...new Set(ids)].filter((id) => known.has(id));
  for (const c of existing) if (!order.includes(c.id)) order.push(c.id);
  await prisma.$transaction(order.map((id, i) => prisma.partnerFieldDef.update({ where: { id }, data: { sortOrder: i } })));
  res.json({ fields: await listFieldDefs() });
});

partnerFieldsRouter.patch('/fields/:id', adminOnly, async (req, res) => {
  const body = parse(fieldSchema.partial(), req.body);
  const def = await prisma.partnerFieldDef.findUnique({ where: { id: String(req.params.id) } });
  if (!def) throw notFound('FIELD_NOT_FOUND');
  const type = body.type ?? (fieldDefDto(def).type as PartnerFieldType);
  const opts = body.options ?? fieldDefDto(def).options;
  if (type === 'SELECT' && !opts.length) throw badRequest('OPTIONS_REQUIRED');
  const updated = await prisma.partnerFieldDef.update({
    where: { id: def.id },
    data: { ...(body.label !== undefined ? { label: body.label } : {}), type, options: type === 'SELECT' ? opts : Prisma.DbNull },
  });
  await audit(req, 'PARTNER_FIELD_CHANGED', `partner-field:${def.id}`, { label: updated.label, type: updated.type, ...(updated.label !== def.label ? { from: def.label } : {}) });
  res.json({ field: fieldDefDto(updated) });
});

/** Deletes the definition and strips its values from every partner. */
partnerFieldsRouter.delete('/fields/:id', adminOnly, async (req, res) => {
  const def = await prisma.partnerFieldDef.findUnique({ where: { id: String(req.params.id) } });
  if (!def) throw notFound('FIELD_NOT_FOUND');
  await prisma.partnerFieldDef.delete({ where: { id: def.id } });
  let cleaned = 0;
  const partners = await prisma.referralPartner.findMany({ where: { customData: { not: Prisma.DbNull } }, select: { id: true, customData: true } });
  for (const p of partners) {
    const data = customDataOf(p.customData);
    if (!(def.id in data)) continue;
    delete data[def.id];
    await prisma.referralPartner.update({ where: { id: p.id }, data: { customData: Object.keys(data).length ? data : Prisma.DbNull } });
    cleaned++;
  }
  await audit(req, 'PARTNER_FIELD_DELETED', `partner-field:${def.id}`, { label: def.label, cleaned });
  res.json({ ok: true, cleaned });
});
