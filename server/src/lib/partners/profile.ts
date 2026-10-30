import { z } from 'zod';
import type { Prisma, ReferralPartner } from '@prisma/client';
import { MASK_CHAR, isMasked, maskValue, maskWith, type MaskGroup } from '../privacy/mask.js';

/**
 * Profile of a referral partner beyond name / phone / e-mail: type, company, contacts, address, tax id
 * (VÖEN), bank details, contract dates, language, website, tags, the values of the admin-defined fields
 * (PartnerFieldDef → ReferralPartner.customData) and the partner's own extra fields (label + value).
 * Pure helpers (validation, masking, audit diff) shared by the admin routes and the exports.
 *
 * Bank data (bank, account holder, IBAN, BIC) is for ADMIN and above only: staff get it masked and may
 * not change it. The tax id follows the usual masking settings (group TAX_ID, reveal entity "partner").
 */

export const PARTNER_TYPES = ['INDIVIDUAL', 'COMPANY'] as const;
export const PARTNER_LANGS = ['az', 'de', 'en', 'ru', 'tr'] as const;
export const PARTNER_FIELD_TYPES = ['TEXT', 'LONG_TEXT', 'NUMBER', 'DATE', 'SELECT', 'CHECKBOX'] as const;
export type PartnerFieldType = (typeof PARTNER_FIELD_TYPES)[number];

/** Only ADMIN+ see and edit these. */
export const BANK_FIELDS = ['bankName', 'bankAccountHolder', 'iban', 'bic'] as const;
export type BankField = (typeof BANK_FIELDS)[number];
/** Fields that may come back masked from a form ("•••• 3456") and then mean "unchanged". */
const MASKABLE_INPUT = [...BANK_FIELDS, 'taxId'] as const;

export const MAX_TAGS = 20;
export const MAX_EXTRA_FIELDS = 30;
export const MAX_FIELD_DEFS = 60;

// ─── Normalising and checking single values ─────────────────────────────

export const normaliseIban = (v: string) => v.replace(/[\s-]+/g, '').toUpperCase();

/** ISO 13616 shape and mod-97 check digits. */
export const ibanValid = (iban: string) => {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  let rem = 0;
  for (const ch of iban.slice(4) + iban.slice(0, 4)) {
    const n = ch >= 'A' && ch <= 'Z' ? ch.charCodeAt(0) - 55 : Number(ch);
    rem = Number(`${rem}${n}`) % 97;
  }
  return rem === 1;
};

export const normaliseBic = (v: string) => v.replace(/\s+/g, '').toUpperCase();
export const bicValid = (bic: string) => /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic);

/** "triad.az" → "https://triad.az"; null when it is not an http(s) address with a host name. */
export const normaliseWebsite = (v: string): string | null => {
  const s = v.trim();
  if (!s) return null;
  const withProto = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s.replace(/^\/+/, '')}`;
  try {
    const u = new URL(withProto);
    if ((u.protocol !== 'http:' && u.protocol !== 'https:') || !u.hostname.includes('.')) return null;
    return withProto;
  } catch {
    return null;
  }
};

/** "2026-11-01" (a real calendar day) or null. */
export const parseDay = (v: string): string | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null;
};
export const dayToDate = (v: string | null | undefined) => (v ? new Date(`${v}T00:00:00.000Z`) : v === null ? null : undefined);
export const dateToDay = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

/** Trimmed, without empties and case-insensitive duplicates. */
export const cleanTags = (tags: string[]) => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    const s = t.trim().replace(/\s+/g, ' ');
    if (!s || seen.has(s.toLocaleLowerCase())) continue;
    seen.add(s.toLocaleLowerCase());
    out.push(s);
  }
  return out;
};

// ─── Request schema (merged into the partner body of the admin routes) ──

const blankToNull = (v: string | null | undefined) => (v === '' ? null : v);
const text = (max: number) => z.string().trim().max(max).nullable().optional().transform(blankToNull);

const day = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform(blankToNull)
  .refine((v) => v == null || parseDay(v) !== null, 'INVALID_DATE');

export interface ExtraField {
  label: string;
  value: string;
}

export const partnerProfileShape = {
  partnerType: z.enum(PARTNER_TYPES).optional(),
  companyName: text(160),
  contactPerson: text(120),
  phone2: text(40),
  whatsapp: text(40),
  address: text(255),
  city: text(120),
  country: text(80),
  taxId: text(40),
  bankName: text(120),
  bankAccountHolder: text(120),
  iban: z
    .string()
    .max(60)
    .nullable()
    .optional()
    .transform((v) => (v == null ? v : normaliseIban(v) || null))
    .refine((v) => v == null || ibanValid(v), 'INVALID_IBAN'),
  bic: z
    .string()
    .max(20)
    .nullable()
    .optional()
    .transform((v) => (v == null ? v : normaliseBic(v) || null))
    .refine((v) => v == null || bicValid(v), 'INVALID_BIC'),
  contractStart: day,
  contractEnd: day,
  preferredLanguage: z
    .union([z.literal(''), z.enum(PARTNER_LANGS)])
    .nullable()
    .optional()
    .transform(blankToNull),
  website: z
    .string()
    .max(255)
    .nullable()
    .optional()
    .transform((v, ctx) => {
      if (v == null || !v.trim()) return v == null ? v : null;
      const url = normaliseWebsite(v);
      if (!url || url.length > 255) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'INVALID_WEBSITE' });
        return z.NEVER;
      }
      return url;
    }),
  tags: z
    .array(z.string().max(40))
    .max(MAX_TAGS)
    .nullable()
    .optional()
    .transform((v) => (v == null ? v : cleanTags(v))),
  /** { [PartnerFieldDef.id]: value }; null / '' clears a field; checked against the definitions by the route. */
  customData: z.record(z.string().min(1).max(40), z.union([z.string().max(5000), z.number(), z.boolean(), z.null()])).optional(),
  extraFields: z
    .array(z.object({ label: z.string().trim().min(1).max(80), value: z.string().trim().max(2000) }))
    .max(MAX_EXTRA_FIELDS)
    .nullable()
    .optional()
    .transform((v) => (v == null ? v : v.filter((f) => f.value !== ''))),
};

/** Contract end before the start (on the merged values of a create / update). */
export const contractDatesInvalid = (start: string | Date | null | undefined, end: string | Date | null | undefined) => {
  const s = start instanceof Date ? dateToDay(start) : start;
  const e = end instanceof Date ? dateToDay(end) : end;
  return !!s && !!e && e < s;
};

/** Masked values of bank / tax fields sent back unchanged by a form are dropped (= not changed). */
export const stripMaskedProfileInput = (body: unknown) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const o = body as Record<string, unknown>;
  for (const k of MASKABLE_INPUT) if (isMasked(o[k])) delete o[k];
  return o;
};

// ─── Admin-defined fields ───────────────────────────────────────────────

export interface FieldDef {
  id: string;
  label: string;
  type: PartnerFieldType;
  options: string[];
}

export type CustomValue = string | number | boolean;

export class CustomFieldError extends Error {
  constructor(
    public code: string,
    public field: string,
  ) {
    super(code);
  }
}

/** The stored JSON as a plain record (anything else is ignored). */
export const customDataOf = (v: Prisma.JsonValue | null | undefined): Record<string, CustomValue> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: Record<string, CustomValue> = {};
  for (const [k, x] of Object.entries(v)) if (typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean') out[k] = x;
  return out;
};

export const extraFieldsOf = (v: Prisma.JsonValue | null | undefined): ExtraField[] =>
  Array.isArray(v)
    ? v.flatMap((x) => (x && typeof x === 'object' && !Array.isArray(x) && typeof x.label === 'string' && typeof x.value === 'string' ? [{ label: x.label, value: x.value }] : []))
    : [];

export const tagsOf = (v: Prisma.JsonValue | null | undefined): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

const isBlank = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

/** The value of one admin-defined field, or null to clear it; throws CustomFieldError. */
export const customValue = (def: Pick<FieldDef, 'id' | 'type' | 'options'>, v: unknown): CustomValue | null => {
  const fail = (code: string): never => {
    throw new CustomFieldError(code, def.id);
  };
  if (def.type === 'CHECKBOX') {
    if (isBlank(v) || v === false) return null;
    if (v === true) return true;
    const s = String(v).trim().toLowerCase();
    if (['true', '1', 'yes', 'ja', 'bəli', 'да'].includes(s)) return true;
    if (['false', '0', 'no', 'nein', 'xeyr', 'нет'].includes(s)) return null;
    return fail('INVALID_BOOLEAN');
  }
  if (isBlank(v)) return null;
  if (typeof v === 'boolean') return fail('INVALID_VALUE');
  switch (def.type) {
    case 'NUMBER': {
      const n = typeof v === 'number' ? v : Number(String(v).trim().replace(/\s/g, '').replace(',', '.'));
      return Number.isFinite(n) ? n : fail('INVALID_NUMBER');
    }
    case 'DATE':
      return parseDay(String(v).trim()) ?? fail('INVALID_DATE');
    case 'SELECT': {
      const s = String(v).trim();
      return def.options.includes(s) ? s : fail('INVALID_OPTION');
    }
    case 'LONG_TEXT': {
      const s = String(v).trim();
      return s.length <= 5000 ? s : fail('TOO_LONG');
    }
    default: {
      const s = String(v).trim();
      return s.length <= 500 ? s : fail('TOO_LONG');
    }
  }
};

/**
 * The partner's custom data after a change: values of unknown (deleted) fields are dropped, the changed
 * ones validated by type. Returns null when nothing is left.
 */
export const mergeCustomData = (defs: FieldDef[], current: Prisma.JsonValue | null | undefined, patch: Record<string, unknown>) => {
  const byId = new Map(defs.map((d) => [d.id, d]));
  const out: Record<string, CustomValue> = {};
  for (const [k, v] of Object.entries(customDataOf(current))) if (byId.has(k)) out[k] = v;
  for (const [k, v] of Object.entries(patch)) {
    const def = byId.get(k);
    if (!def) throw new CustomFieldError('UNKNOWN_FIELD', k);
    const value = customValue(def, v);
    if (value === null) delete out[k];
    else out[k] = value;
  }
  return Object.keys(out).length ? out : null;
};

// ─── Output: what a viewer sees ─────────────────────────────────────────

const HIDDEN = MASK_CHAR.repeat(4);

/**
 * A partner record for the browser: days as "YYYY-MM-DD", JSON columns as arrays / records, and the bank
 * data masked for viewers below ADMIN (`bankLocked: true`).
 */
export const partnerView = <P extends ReferralPartner>(p: P, opts: { canSeeBank: boolean }) => ({
  ...p,
  contractStart: dateToDay(p.contractStart),
  contractEnd: dateToDay(p.contractEnd),
  tags: tagsOf(p.tags),
  customData: customDataOf(p.customData),
  extraFields: extraFieldsOf(p.extraFields),
  ...(opts.canSeeBank
    ? { bankLocked: false }
    : {
        bankLocked: true,
        bankName: p.bankName ? HIDDEN : null,
        bankAccountHolder: p.bankAccountHolder ? HIDDEN : null,
        iban: p.iban ? maskValue(p.iban, 'IBAN') : null,
        bic: p.bic ? HIDDEN : null,
      }),
});

// ─── Audit: what changed ────────────────────────────────────────────────

const comparable = (v: unknown): unknown => (v instanceof Date ? dateToDay(v) : v === undefined ? null : v);
const same = (a: unknown, b: unknown) => JSON.stringify(comparable(a)) === JSON.stringify(comparable(b));

/**
 * Audit details of an update: every changed field name, the before / after values of ordinary fields
 * and only the names for bank data and the tax id (never their values).
 */
export const profileChanges = (current: Record<string, unknown>, data: Record<string, unknown>, fieldLabels: Map<string, string> = new Map()) => {
  const fields: string[] = [];
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const secret = new Set<string>([...MASKABLE_INPUT]);
  for (const [k, to] of Object.entries(data)) {
    if (to === undefined) continue;
    const from = current[k];
    if (k === 'customData') {
      const a = customDataOf(from as Prisma.JsonValue);
      const b = customDataOf(to as Prisma.JsonValue);
      for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (same(a[id], b[id])) continue;
        const key = `custom:${fieldLabels.get(id) ?? id}`;
        fields.push(key);
        changes[key] = { from: a[id] ?? null, to: b[id] ?? null };
      }
      continue;
    }
    if (same(from, to)) continue;
    fields.push(k);
    if (!secret.has(k) && k !== 'note' && k !== 'extraFields') changes[k] = { from: comparable(from), to: comparable(to) };
  }
  return { fields, changes };
};

// ─── Exports ────────────────────────────────────────────────────────────

const TYPE_LABEL_AZ: Record<string, string> = { INDIVIDUAL: 'Fiziki şəxs', COMPANY: 'Şirkət' };
const dmy = (d: string | null) => (d ? d.split('-').reverse().join('.') : '');

/**
 * The partner's profile as label / value rows (Azerbaijani labels, like the rest of the partner Excel):
 * empty values are left out, the tax id follows the viewer's masking, bank data only for ADMIN+.
 */
export const profileRows = (p: ReferralPartner, defs: FieldDef[], opts: { mask: Set<MaskGroup>; canSeeBank: boolean }): [string, string][] => {
  const custom = customDataOf(p.customData);
  const rows: [string, string | null | undefined][] = [
    ['Ad', p.name],
    ['Növ', TYPE_LABEL_AZ[p.partnerType] ?? p.partnerType],
    ['Şirkət', p.companyName],
    ['Əlaqədar şəxs', p.contactPerson],
    ['Telefon', p.phone],
    ['Telefon 2', p.phone2],
    ['WhatsApp', p.whatsapp],
    ['E-poçt', p.email],
    ['Ünvan', p.address],
    ['Şəhər', p.city],
    ['Ölkə', p.country],
    ['VÖEN', maskWith(opts.mask, 'taxId', p.taxId)],
    ...(opts.canSeeBank
      ? ([
          ['Bank', p.bankName],
          ['Hesab sahibi', p.bankAccountHolder],
          ['IBAN', maskWith(opts.mask, 'iban', p.iban)],
          ['BIC / SWIFT', maskWith(opts.mask, 'bic', p.bic)],
        ] as [string, string | null][])
      : []),
    ['Müqavilə başlanğıcı', dmy(dateToDay(p.contractStart))],
    ['Müqavilə sonu', dmy(dateToDay(p.contractEnd))],
    ['Dil', p.preferredLanguage],
    ['Veb sayt', p.website],
    ['Teqlər', tagsOf(p.tags).join(', ')],
    ...defs.map((d): [string, string] => {
      const v = custom[d.id];
      return [d.label, v === undefined ? '' : typeof v === 'boolean' ? (v ? 'Bəli' : '') : d.type === 'DATE' ? dmy(String(v)) : String(v)];
    }),
    ...extraFieldsOf(p.extraFields).map((f): [string, string] => [f.label, f.value]),
    ['Qeyd', p.note],
  ];
  return rows.filter((r): r is [string, string] => !!r[1]);
};

/** GDPR export of a partner login (Art. 15): the profile with readable custom field labels, without the internal note. */
export const partnerExportProfile = (p: ReferralPartner, defs: FieldDef[]) => {
  const custom = customDataOf(p.customData);
  return {
    name: p.name,
    partnerType: p.partnerType,
    companyName: p.companyName,
    contactPerson: p.contactPerson,
    phone: p.phone,
    phone2: p.phone2,
    whatsapp: p.whatsapp,
    email: p.email,
    address: p.address,
    city: p.city,
    country: p.country,
    taxId: p.taxId,
    bankName: p.bankName,
    bankAccountHolder: p.bankAccountHolder,
    iban: p.iban,
    bic: p.bic,
    contractStart: dateToDay(p.contractStart),
    contractEnd: dateToDay(p.contractEnd),
    preferredLanguage: p.preferredLanguage,
    website: p.website,
    tags: tagsOf(p.tags),
    customFields: defs.filter((d) => custom[d.id] !== undefined).map((d) => ({ label: d.label, value: custom[d.id] })),
    extraFields: extraFieldsOf(p.extraFields),
    commissionCents: p.commissionCents,
    currency: p.currency,
    code: p.code,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
};
