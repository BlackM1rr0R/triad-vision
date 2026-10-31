import { z } from 'zod';
import type { Company } from '@prisma/client';
import { MASK_CHAR, isMasked, maskValue } from '../privacy/mask.js';
import { bicValid, ibanValid, normaliseBic, normaliseIban } from '../partners/profile.js';

/**
 * Legal data of an employer (Company columns): validation for the admin form and the employer portal, the bank
 * view (ADMIN+ only — staff get the IBAN masked and the rest hidden, like ReferralPartner), the audit diff written
 * by company updates (shown in the partner-records timeline) and the "data for contracts" completeness score.
 */

export const LEGAL_FIELDS = [
  'betriebsnummer',
  'registerNumber',
  'registerCourt',
  'taxNumber',
  'street',
  'postalCode',
  'country',
  'managingDirector',
  'signatoryName',
  'signatoryRole',
  'fax',
  'foundedYear',
  'employeeCount',
  'collectiveAgreement',
] as const;
/** ADMIN+ only (view and edit). */
export const BANK_FIELDS = ['bankName', 'bankAccountHolder', 'iban', 'bic'] as const;
/** Staff-internal: the employer portal never sees or edits them. */
export const INTERNAL_FIELDS = [...BANK_FIELDS, 'note'] as const;

const blankToNull = (v: string | null | undefined) => (v === '' ? null : v);
const text = (max: number) => z.string().trim().max(max).nullable().optional().transform(blankToNull);
const int = (min: number, max: number) =>
  z
    .union([z.number(), z.string().trim()])
    .nullable()
    .optional()
    .transform((v, ctx) => {
      if (v === undefined) return undefined;
      if (v === null || v === '') return null;
      const n = typeof v === 'number' ? v : Number(v);
      if (!Number.isInteger(n) || n < min || n > max) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'INVALID_NUMBER' });
        return z.NEVER;
      }
      return n;
    });

/** Betriebsnummer: 8 digits (spaces allowed in the input). */
export const betriebsnummerField = z
  .string()
  .max(30)
  .nullable()
  .optional()
  .transform((v) => (v == null ? v : v.replace(/[\s.-]+/g, '') || null))
  .refine((v) => v == null || /^\d{8}$/.test(v), 'INVALID_BETRIEBSNUMMER');

export const companyLegalShape = {
  betriebsnummer: betriebsnummerField,
  registerNumber: text(40),
  registerCourt: text(120),
  taxNumber: text(40),
  street: text(160),
  postalCode: text(12),
  country: text(80),
  managingDirector: text(160),
  signatoryName: text(160),
  signatoryRole: text(80),
  fax: text(40),
  foundedYear: int(1800, new Date().getUTCFullYear() + 1),
  employeeCount: int(0, 10_000_000),
  collectiveAgreement: text(160),
};

export const companyBankShape = {
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
};

/** Masked bank values a form sends back unchanged ("•••• 3456") mean "not changed". */
export const stripMaskedBank = (body: unknown) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const o = body as Record<string, unknown>;
  for (const k of [...BANK_FIELDS, 'taxNumber', 'vatId']) if (isMasked(o[k])) delete o[k];
  return o;
};

const HIDDEN = MASK_CHAR.repeat(4);

/** The company as staff see it: bank data only for ADMIN+ (IBAN masked, the rest hidden otherwise). */
export const companyBankView = <C extends Pick<Company, (typeof BANK_FIELDS)[number]>>(c: C, canSeeBank: boolean) =>
  canSeeBank
    ? { ...c, bankLocked: false }
    : {
        ...c,
        bankLocked: true,
        bankName: c.bankName ? HIDDEN : null,
        bankAccountHolder: c.bankAccountHolder ? HIDDEN : null,
        iban: c.iban ? maskValue(c.iban, 'IBAN') : null,
        bic: c.bic ? HIDDEN : null,
      };

/** Bank data in the payload that would change something (staff may not). */
export const touchesBank = (body: Record<string, unknown>, current: Partial<Record<string, unknown>> | null) =>
  BANK_FIELDS.some((k) => body[k] !== undefined && (body[k] ?? null) !== (current?.[k] ?? null));

const comparable = (v: unknown): unknown => (v instanceof Date ? v.toISOString().slice(0, 10) : v === undefined ? null : v);
const same = (a: unknown, b: unknown) => JSON.stringify(comparable(a) ?? null) === JSON.stringify(comparable(b) ?? null);

/** Values never written into the audit log (only the field name). */
const SECRET = new Set<string>([...BANK_FIELDS, 'taxNumber', 'note']);

/**
 * What an update changed, for the audit log: { fields, changes: { field: { from, to } } } (the same shape as the
 * partner routes). Secret fields are listed by name only.
 */
export const auditDiff = (current: Record<string, unknown>, data: Record<string, unknown>, secret: Set<string> = SECRET) => {
  const fields: string[] = [];
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [k, to] of Object.entries(data)) {
    if (to === undefined) continue;
    const from = current[k];
    if (same(from, to)) continue;
    fields.push(k);
    if (!secret.has(k)) changes[k] = { from: comparable(from) ?? null, to: comparable(to) ?? null };
  }
  return { fields, changes };
};

/** Fields a contract with the employer needs (the profile's "7/10 filled"). */
export const CONTRACT_DATA_FIELDS = ['legalForm', 'street', 'postalCode', 'city', 'betriebsnummer', 'registerNumber', 'registerCourt', 'taxNumber', 'managingDirector', 'signatoryName'] as const;

export const completenessOf = (c: Partial<Record<string, unknown>>) => {
  const filled = (k: string) => {
    if (k === 'taxNumber') return !!(String(c.taxNumber ?? '').trim() || String(c.vatId ?? '').trim());
    if (k === 'signatoryName') return !!(String(c.signatoryName ?? '').trim() || String(c.managingDirector ?? '').trim());
    const v = c[k];
    return v !== null && v !== undefined && String(v).trim() !== '';
  };
  const missing = CONTRACT_DATA_FIELDS.filter((k) => !filled(k));
  return { filled: CONTRACT_DATA_FIELDS.length - missing.length, total: CONTRACT_DATA_FIELDS.length, missing };
};
