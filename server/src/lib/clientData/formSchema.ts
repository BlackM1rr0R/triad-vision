import { z } from 'zod';
import type { L10n } from '../ai/features/caseAi/texts.js';
import { dmy, isoDay, normaliseTarget, targetDef, TARGET_KEYS, type TargetDef } from './targets.js';

/**
 * Smart questionnaires ("Ağıllı anketlər"): the field model of a form template, validation of the client's
 * answers and the conversion of an answer into the value of its mapping target.
 *
 *   text | textarea | number | date | select | multi | yesno | group (repeatable rows) | file
 *   required, help text, show-if (another top-level field equals a value), mapping target (lib/clientData/targets.ts)
 *
 * Answers: text/textarea/select → string, number → number, date → "YYYY-MM-DD", multi → string[],
 * yesno → boolean, group → rows (objects of the sub-fields), file → document ids (Document stage OTHER).
 */

export const FIELD_TYPES = ['text', 'textarea', 'number', 'date', 'select', 'multi', 'yesno', 'group', 'file'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export interface FormOption {
  value: string;
  label: L10n;
}

export interface FormField {
  key: string;
  type: FieldType;
  label: L10n;
  help?: L10n | null;
  required?: boolean;
  options?: FormOption[];
  /** Sub-fields of a repeatable group (no nested groups / files). */
  fields?: FormField[];
  maxRows?: number;
  showIf?: { field: string; equals: string | boolean } | null;
  target?: string | null;
}

const l10n = z.object({ az: z.string().trim().max(300), de: z.string().trim().max(300), en: z.string().trim().max(300), ru: z.string().trim().max(300) });
const l10nLong = z.object({ az: z.string().trim().max(1000), de: z.string().trim().max(1000), en: z.string().trim().max(1000), ru: z.string().trim().max(1000) });
const fieldKey = z.string().trim().regex(/^[a-z][a-zA-Z0-9_]{0,39}$/, 'FIELD_KEY');
const option = z.object({ value: z.string().trim().min(1).max(120), label: l10n });

const base = {
  key: fieldKey,
  label: l10n.refine((v) => Object.values(v).some((s) => s), { message: 'LABEL_REQUIRED' }),
  help: l10nLong.nullable().optional(),
  required: z.boolean().optional(),
  options: z.array(option).max(40).optional(),
  showIf: z.object({ field: fieldKey, equals: z.union([z.string().max(120), z.boolean()]) }).nullable().optional(),
  target: z.string().max(60).nullable().optional(),
};

const subField = z.object({ ...base, type: z.enum(['text', 'textarea', 'number', 'date', 'select', 'multi', 'yesno']) });
const field = z.object({ ...base, type: z.enum(FIELD_TYPES), fields: z.array(subField).max(12).optional(), maxRows: z.number().int().min(1).max(30).optional() });

/** Template fields: unique keys, options where needed, valid show-if references, mapping fits the field type. */
export const fieldsSchema = z
  .array(field)
  .min(1)
  .max(60)
  .superRefine((fields, ctx) => {
    const seen = new Set<string>();
    fields.forEach((f, i) => {
      const at = (msg: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message: msg, path: [i, 'key'] });
      if (seen.has(f.key)) at('DUPLICATE_FIELD_KEY');
      if ((f.type === 'select' || f.type === 'multi') && !f.options?.length) at('OPTIONS_REQUIRED');
      if (f.type === 'group' && !f.fields?.length) at('GROUP_FIELDS_REQUIRED');
      if (f.showIf && !seen.has(f.showIf.field)) at('SHOW_IF_UNKNOWN_FIELD');
      if (f.target) {
        const def = targetDef(f.target);
        if (!def) at('UNKNOWN_TARGET');
        else if (!targetFits(f.type, def)) at('TARGET_TYPE_MISMATCH');
      }
      for (const s of f.fields ?? []) {
        if ((s.type === 'select' || s.type === 'multi') && !s.options?.length) at('OPTIONS_REQUIRED');
      }
      seen.add(f.key);
    });
  });

/** Which field types may feed which target kind. */
export const targetFits = (type: FieldType, def: TargetDef) => {
  if (type === 'file') return false;
  if (def.entity === 'videx' || def.kind === 'longtext') return true;
  switch (def.kind) {
    case 'date':
      return type === 'date' || type === 'text';
    case 'int':
      return type === 'number' || type === 'text';
    case 'level':
    case 'education':
      return type === 'select' || type === 'text';
    default:
      return type !== 'group' && type !== 'multi';
  }
};

export const isVisible = (f: FormField, answers: Record<string, unknown>) => {
  if (!f.showIf) return true;
  const v = answers[f.showIf.field];
  if (typeof f.showIf.equals === 'boolean') return v === f.showIf.equals;
  return Array.isArray(v) ? v.includes(f.showIf.equals) : v === f.showIf.equals;
};

const isEmpty = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

/** One answer, cleaned (unknown shapes dropped). */
const cleanValue = (f: FormField, raw: unknown): unknown => {
  if (raw === undefined || raw === null) return undefined;
  switch (f.type) {
    case 'text':
      return typeof raw === 'string' ? raw.slice(0, 500) : undefined;
    case 'textarea':
      return typeof raw === 'string' ? raw.slice(0, 4000) : undefined;
    case 'number': {
      if (raw === '') return undefined;
      const n = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'));
      return Number.isFinite(n) && Math.abs(n) < 1e9 ? n : undefined;
    }
    case 'date':
      return typeof raw === 'string' && raw ? (isoDay(raw) ?? undefined) : undefined;
    case 'select':
      return typeof raw === 'string' && f.options?.some((o) => o.value === raw) ? raw : undefined;
    case 'multi':
      return Array.isArray(raw) ? [...new Set(raw.filter((x): x is string => typeof x === 'string' && !!f.options?.some((o) => o.value === x)))] : undefined;
    case 'yesno':
      return typeof raw === 'boolean' ? raw : undefined;
    case 'file':
      return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string' && x.length <= 40).slice(0, 10) : undefined;
    case 'group': {
      if (!Array.isArray(raw)) return undefined;
      return raw
        .slice(0, f.maxRows ?? 20)
        .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object' && !Array.isArray(r))
        .map((r) => {
          const row: Record<string, unknown> = {};
          for (const s of f.fields ?? []) {
            const v = cleanValue(s, r[s.key]);
            if (!isEmpty(v)) row[s.key] = v;
          }
          return row;
        })
        .filter((r) => Object.keys(r).length > 0);
    }
  }
};

/** Answers limited to the template's fields and shapes (draft save). */
export const cleanAnswers = (fields: FormField[], raw: unknown): Record<string, unknown> => {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = cleanValue(f, src[f.key]);
    if (!isEmpty(v)) out[f.key] = v;
  }
  return out;
};

/** Required visible fields (and required sub-fields of group rows) without an answer: { key, row? }. */
export const missingRequired = (fields: FormField[], answers: Record<string, unknown>) => {
  const out: { key: string; row?: number; sub?: string }[] = [];
  for (const f of fields) {
    if (!isVisible(f, answers)) continue;
    const v = answers[f.key];
    if (f.required && isEmpty(v)) out.push({ key: f.key });
    if (f.type === 'group' && Array.isArray(v)) {
      (v as Record<string, unknown>[]).forEach((row, i) => {
        for (const s of f.fields ?? []) if (s.required && isEmpty(row[s.key])) out.push({ key: f.key, row: i, sub: s.key });
      });
    }
  }
  return out;
};

const optionLabel = (f: FormField, v: string) => f.options?.find((o) => o.value === v)?.label.de || v;

/** Human-readable text of an answer (German labels — the VIDEX sheet is German). */
export const answerText = (f: FormField, v: unknown): string => {
  if (isEmpty(v)) return '';
  switch (f.type) {
    case 'date':
      return dmy(String(v));
    case 'yesno':
      return v ? 'ja' : 'nein';
    case 'select':
      return String(v);
    case 'multi':
      return (v as string[]).map((x) => optionLabel(f, x)).join(', ');
    case 'group':
      return (v as Record<string, unknown>[])
        .map((row) =>
          (f.fields ?? [])
            .map((s) => answerText(s, row[s.key]))
            .filter(Boolean)
            .join(', '),
        )
        .filter(Boolean)
        .join('; ');
    case 'file':
      return '';
    default:
      return String(v);
  }
};

/**
 * Value for the mapping target, or null when there is nothing to write. A hidden or empty repeatable group
 * mapped to the VIDEX sheet means "none" (e.g. no Schengen visas) and is written as "keine".
 */
export const valueForTarget = (f: FormField, answers: Record<string, unknown>): { def: TargetDef; value: string } | null => {
  const def = targetDef(f.target);
  if (!def) return null;
  const visible = isVisible(f, answers);
  const v = visible ? answers[f.key] : undefined;
  if (f.type === 'group' && def.entity === 'videx' && isEmpty(v)) return { def, value: 'keine' };
  if (!visible || isEmpty(v)) return null;
  let raw: string;
  if (def.entity === 'videx' || def.kind === 'longtext' || def.kind === 'text') raw = f.type === 'select' && def.entity !== 'videx' ? optionLabel(f, String(v)) : answerText(f, v);
  else raw = f.type === 'yesno' ? (v ? 'ja' : 'nein') : String(v);
  if (f.type === 'select' && (def.kind === 'level' || def.kind === 'education')) raw = String(v);
  const value = normaliseTarget(def, raw);
  return value === null ? null : { def, value };
};

export const KNOWN_TARGETS = TARGET_KEYS;
