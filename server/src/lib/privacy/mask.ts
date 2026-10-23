import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';

/**
 * Sensitive data masking (DSGVO data minimisation): roles below SUPER_ADMIN see passport / ID numbers,
 * bank details and tax ids as "•••• 3456" in API responses, per the super admin's settings
 * (Setting `privacy.masking`). The plaintext is only handed out by POST /api/admin/reveal, with a
 * reason, and every reveal is audited (SENSITIVE_REVEALED).
 *
 * Masking is a presentation concern: it is applied to the JSON sent to the browser (maskResponses)
 * and to exports a masked role generates. Server-side features (AI, PDFs for the embassy, matching)
 * keep reading the real values from the database.
 *
 * Reusable helpers for other modules (e.g. change history):
 *   maskFor(user, field, value)      one value, by field name ('passportNumber', 'iban', …)
 *   maskDeep(user, body)             a whole JSON body (keys + { field, value } pairs)
 *   loadMaskingSettings()            the role → groups map (cached 30 s)
 */

export const MASK_GROUPS = ['PASSPORT', 'ID_NUMBER', 'IBAN', 'TAX_ID', 'BIRTH_PLACE'] as const;
export type MaskGroup = (typeof MASK_GROUPS)[number];

/** Role whose responses can be masked (SUPER_ADMIN always sees plaintext; portal roles see only their own data). */
export const MASKABLE_ROLES = ['STAFF', 'ADMIN'] as const;
export type MaskableRole = (typeof MASKABLE_ROLES)[number];

/** JSON keys holding a value of each group (exact names, case-sensitive). */
const GROUP_KEYS: Record<MaskGroup, string[]> = {
  PASSPORT: ['passportNumber', 'passportNo', 'passport'],
  ID_NUMBER: ['documentNumber', 'idNumber', 'nationalId', 'nationalIdNumber', 'personalNumber', 'idCardNumber'],
  IBAN: ['iban', 'bic', 'swift', 'accountNumber', 'bankAccount'],
  TAX_ID: ['vatId', 'taxNumber', 'taxId', 'steuernummer', 'ustId', 'ustIdNr'],
  BIRTH_PLACE: ['placeOfBirth', 'birthPlace'],
};

const KEY_GROUP = new Map<string, MaskGroup>(Object.entries(GROUP_KEYS).flatMap(([g, keys]) => keys.map((k) => [k, g as MaskGroup] as const)));
/** `passport` alone is too generic as a field *name* in { field, value } pairs (VIDEX sources say 'passport'). */
const REF_EXCLUDED = new Set(['passport']);

export const groupOfField = (field: string): MaskGroup | undefined => KEY_GROUP.get(field);
export const fieldsOfGroup = (g: MaskGroup) => GROUP_KEYS[g];

export const MASK_CHAR = '•';
export const isMasked = (v: unknown) => typeof v === 'string' && v.includes(MASK_CHAR);

/**
 * Whether a string under a sensitive key really is a value (and not a label such as 'Pass-Nr.'):
 * numbers must contain digits, a BIC has its fixed shape, a birth place is any text.
 */
const looksLikeValue = (key: string, group: MaskGroup, v: string) => {
  const s = v.trim();
  if (s.length < 3 || isMasked(s)) return false;
  if (group === 'BIRTH_PLACE') return true;
  if (key === 'bic' || key === 'swift') return /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/i.test(s.replace(/\s+/g, ''));
  return (s.match(/\d/g) ?? []).length >= 2;
};

/** "•••• 3456": only the last characters stay visible (none for very short values). */
export const maskValue = (value: string, group?: MaskGroup) => {
  const s = value.replace(/\s+/g, '');
  if (group === 'BIRTH_PLACE') return `${MASK_CHAR.repeat(4)}`;
  const visible = s.length >= 10 ? 4 : s.length >= 6 ? 3 : 0;
  return visible ? `${MASK_CHAR.repeat(4)} ${s.slice(-visible)}` : MASK_CHAR.repeat(4);
};

// ─── Settings ──────────────────────────────────────────────────────────

export const MASKING_SETTING_KEY = 'privacy.masking';

export const maskingSettingsSchema = z.object({
  STAFF: z.array(z.enum(MASK_GROUPS)).max(MASK_GROUPS.length),
  ADMIN: z.array(z.enum(MASK_GROUPS)).max(MASK_GROUPS.length),
});
export type MaskingSettings = z.infer<typeof maskingSettingsSchema>;

/** Default: staff see every number masked (birth place stays visible), admins see plaintext. */
export const DEFAULT_MASKING: MaskingSettings = { STAFF: ['PASSPORT', 'ID_NUMBER', 'IBAN', 'TAX_ID'], ADMIN: [] };

const SETTINGS_TTL_MS = 30 * 1000;
let cachedSettings: { at: number; value: MaskingSettings } | null = null;

export const loadMaskingSettings = async (): Promise<MaskingSettings> => {
  if (cachedSettings && Date.now() - cachedSettings.at < SETTINGS_TTL_MS) return cachedSettings.value;
  let value = DEFAULT_MASKING;
  try {
    const row = await prisma.setting.findUnique({ where: { key: MASKING_SETTING_KEY } });
    const parsed = row ? maskingSettingsSchema.safeParse(row.value) : null;
    if (parsed?.success) value = { STAFF: [...new Set(parsed.data.STAFF)], ADMIN: [...new Set(parsed.data.ADMIN)] };
  } catch {
    // Database hiccup: fall back to the (strict) defaults.
  }
  cachedSettings = { at: Date.now(), value };
  return value;
};

export const saveMaskingSettings = async (value: MaskingSettings) => {
  const clean = { STAFF: [...new Set(value.STAFF)], ADMIN: [...new Set(value.ADMIN)] };
  await prisma.setting.upsert({ where: { key: MASKING_SETTING_KEY }, create: { key: MASKING_SETTING_KEY, value: clean }, update: { value: clean } });
  cachedSettings = { at: Date.now(), value: clean };
  return clean;
};

export const resetMaskingCache = () => {
  cachedSettings = null;
};

type Viewer = { role: Role } | undefined | null;

/** The groups masked for this viewer (empty for SUPER_ADMIN and portal roles). */
export const maskedGroupsFor = (viewer: Viewer, settings: MaskingSettings): Set<MaskGroup> => {
  if (!viewer || (viewer.role !== 'STAFF' && viewer.role !== 'ADMIN')) return new Set();
  return new Set(settings[viewer.role]);
};

/** Synchronous variant for code that already loaded the settings. */
export const maskWith = (groups: Set<MaskGroup>, field: string, value: string | null | undefined): string | null | undefined => {
  if (value === null || value === undefined) return value;
  const g = groupOfField(field);
  if (!g || !groups.has(g) || !looksLikeValue(field, g, value)) return value;
  return maskValue(value, g);
};

/** One value for one viewer: masked when the viewer's role masks the field's group. */
export const maskFor = async (viewer: Viewer, field: string, value: string | null | undefined) =>
  maskWith(maskedGroupsFor(viewer, await loadMaskingSettings()), field, value);

/** Whether the viewer sees any group masked (lets exports skip the work). */
export const masksAnything = async (viewer: Viewer) => maskedGroupsFor(viewer, await loadMaskingSettings()).size > 0;

const REF_KEYS = ['field', 'key', 'source', 'name'];
const MAX_DEPTH = 40;

/** Masks a JSON-like value in place-free fashion (returns a copy only where something changed). */
export const maskJson = (groups: Set<MaskGroup>, body: unknown, depth = 0): unknown => {
  if (!groups.size || depth > MAX_DEPTH || body === null || typeof body !== 'object') return body;
  if (body instanceof Date || Buffer.isBuffer(body)) return body;
  if (Array.isArray(body)) {
    let changed = false;
    const out = body.map((v) => {
      const m = maskJson(groups, v, depth + 1);
      if (m !== v) changed = true;
      return m;
    });
    return changed ? out : body;
  }
  const obj = body as Record<string, unknown>;
  if (typeof (obj as { toJSON?: unknown }).toJSON === 'function') return body; // Decimal etc.
  let out: Record<string, unknown> | null = null;
  const set = (k: string, v: unknown) => {
    out ??= { ...obj };
    out[k] = v;
  };
  // { field: 'passportNumber', value: 'C01X00T47' } (VIDEX fields, AI fixes, form fields)
  if (typeof obj.value === 'string') {
    for (const rk of REF_KEYS) {
      const ref = obj[rk];
      if (typeof ref !== 'string' || REF_EXCLUDED.has(ref)) continue;
      const g = groupOfField(ref);
      if (g && groups.has(g) && looksLikeValue(ref, g, obj.value)) {
        set('value', maskValue(obj.value, g));
        break;
      }
    }
  }
  // Passport OCR: the MRZ lines and the raw OCR text repeat the document number.
  const idGroups = groups.has('PASSPORT') || groups.has('ID_NUMBER');
  if (idGroups && typeof obj.documentNumber === 'string' && Array.isArray(obj.lines)) {
    set('lines', obj.lines.map((l) => (typeof l === 'string' ? MASK_CHAR.repeat(Math.min(l.length, 44)) : l)));
  }
  const mrz = obj.mrz as { documentNumber?: unknown } | null | undefined;
  if (idGroups && typeof obj.raw === 'string' && mrz && typeof mrz === 'object') {
    const no = typeof mrz.documentNumber === 'string' && mrz.documentNumber.length >= 4 ? mrz.documentNumber : null;
    const raw = obj.raw
      .split('\n')
      .map((line) => (line.includes('<<') ? MASK_CHAR.repeat(Math.min(line.length, 44)) : no ? line.split(no).join(maskValue(no)) : line))
      .join('\n');
    if (raw !== obj.raw) set('raw', raw);
  }
  for (const [k, v] of Object.entries(obj)) {
    if (out && (k === 'lines' || k === 'raw') && (out as Record<string, unknown>)[k] !== v) continue;
    if (typeof v === 'string') {
      const g = KEY_GROUP.get(k);
      if (g && groups.has(g) && looksLikeValue(k, g, v)) set(k, maskValue(v, g));
    } else if (v && typeof v === 'object') {
      const m = maskJson(groups, v, depth + 1);
      if (m !== v) set(k, m);
    }
  }
  return out ?? body;
};

/** A whole response body for one viewer. */
export const maskDeep = async (viewer: Viewer, body: unknown) => maskJson(maskedGroupsFor(viewer, await loadMaskingSettings()), body);

/**
 * Request bodies: a form that loaded a masked value and sends it back untouched must not overwrite the
 * stored plaintext with "•••• 3456". Masked values under sensitive keys are dropped (the field is
 * treated as "not changed"); { field, value } change lists lose the masked entries.
 */
export const stripMaskedInput = (body: unknown, depth = 0): unknown => {
  if (depth > MAX_DEPTH || body === null || typeof body !== 'object') return body;
  if (Array.isArray(body)) {
    return body
      .filter((v) => {
        if (!v || typeof v !== 'object' || Array.isArray(v)) return true;
        const o = v as Record<string, unknown>;
        return !(isMasked(o.value) && REF_KEYS.some((rk) => typeof o[rk] === 'string' && !!groupOfField(o[rk] as string)));
      })
      .map((v) => stripMaskedInput(v, depth + 1));
  }
  const obj = body as Record<string, unknown>;
  // { key: 'passportNumber', value: '•••• 3456' } → the value is dropped (the stored / proposed one is used)
  if (isMasked(obj.value) && REF_KEYS.some((rk) => typeof obj[rk] === 'string' && !!groupOfField(obj[rk] as string))) delete obj.value;
  for (const [k, v] of Object.entries(obj)) {
    if (isMasked(v) && KEY_GROUP.has(k)) delete obj[k];
    else if (v && typeof v === 'object') obj[k] = stripMaskedInput(v, depth + 1);
  }
  return obj;
};

/** Paths whose responses are never masked: the viewer's own account, and the reveal endpoint itself. */
const UNMASKED_PATHS = [/^\/api\/auth\//, /^\/api\/admin\/reveal(\/|$)/, /^\/api\/admin\/impersonate(\/|$)/, /^\/api\/account(\/|$)/, /^\/api\/agent(\/|$)/, /^\/api\/partner(\/|$)/, /^\/api\/company(\/|$)/];

/** The person really looking at the screen (the admin while they view a client's portal). */
export const viewerOf = (req: Request) => req.impersonator ?? req.user;

/**
 * Express middleware (mounted once in app.ts): masks every JSON response for viewers whose role masks
 * something, and drops masked values from their request bodies.
 */
export const maskResponses = async (req: Request, res: Response, next: NextFunction) => {
  const viewer = viewerOf(req);
  if (!viewer || (viewer.role !== 'STAFF' && viewer.role !== 'ADMIN')) return next();
  // While an admin views a client's portal the client's own pages are masked for the admin too.
  if (!req.impersonator && UNMASKED_PATHS.some((re) => re.test(req.originalUrl))) return next();
  let groups: Set<MaskGroup>;
  try {
    groups = maskedGroupsFor(viewer, await loadMaskingSettings());
  } catch {
    return next();
  }
  if (!groups.size) return next();
  if (req.body && typeof req.body === 'object') stripMaskedInput(req.body);
  res.locals.maskGroups = groups;
  const json = res.json.bind(res);
  res.json = (body: unknown) => json(maskJson(groups, body));
  next();
};

/** Groups masked for the current request (set by maskResponses; empty when nothing is masked). */
export const requestMaskGroups = (res: Response): Set<MaskGroup> => (res.locals.maskGroups as Set<MaskGroup> | undefined) ?? new Set();

/** Groups masked for a viewer, without a response at hand (exports built outside the JSON path). */
export const maskGroupsForViewer = async (viewer: Viewer) => maskedGroupsFor(viewer, await loadMaskingSettings());
