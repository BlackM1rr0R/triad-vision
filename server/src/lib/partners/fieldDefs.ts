import type { PartnerFieldDef } from '@prisma/client';
import { prisma } from '../../db.js';
import { PARTNER_FIELD_TYPES, type FieldDef, type PartnerFieldType } from './profile.js';

/** Admin-defined partner form fields (PartnerFieldDef), as the API and the exports use them. */
export const fieldDefDto = (d: PartnerFieldDef): FieldDef & { sortOrder: number } => ({
  id: d.id,
  label: d.label,
  type: ((PARTNER_FIELD_TYPES as readonly string[]).includes(d.type) ? d.type : 'TEXT') as PartnerFieldType,
  options: Array.isArray(d.options) ? (d.options as unknown[]).filter((o): o is string => typeof o === 'string') : [],
  sortOrder: d.sortOrder,
});

export const listFieldDefs = async () => (await prisma.partnerFieldDef.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] })).map(fieldDefDto);
