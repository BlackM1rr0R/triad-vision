import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import {
  EXTRA_GROUP_KEYS,
  EXTRA_INPUT_KEYS,
  EXTRA_MASK_GROUPS,
  FAMILY_KEYS,
  LEGACY_MASK_GROUPS,
  PERSON_ADDRESS_KEYS,
  isExtraExcludedPath,
  isExtraGroup,
  isExtraValue,
  isFamilyObject,
  isHealthItem,
  isPersonObject,
  landlordKeysOf,
  maskExtraValue,
  type ExtraMaskGroup,
} from './sensitiveRules.js';

/**
 * Sensitive data masking (DSGVO data minimisation): roles below SUPER_ADMIN see passport / ID numbers,
 * bank details and tax ids as "•••• 3456" in API responses, per the super admin's settings
 * (Setting `privacy.masking`). The plaintext is only handed out by POST /api/admin/reveal, with a
 * reason, and every reveal is audited (SENSITIVE_REVEALED).
 *
 * Access Center (2026-11): further groups SALARY, HEALTH, ADDRESS, FAMILY (lib/privacy/sensitiveRules.ts: keys +
 * context rules; default VISIBLE everywhere = no change) and a third mode HIDDEN (value sent as null, no reveal).
 * Policy per viewer = per-user override → staff template override → role (HIDDEN row, else the Setting's masked
 * list) → VISIBLE. Overrides live in SensitiveFieldPolicy (routes/admin/accessSensitive.ts).
 *
 * Masking is a presentation concern: it is applied to the JSON sent to the browser (maskResponses)
 * and to exports a masked role generates. Server-side features (AI, PDFs for the embassy, matching)
 * keep reading the real values from the database.
 *
 * Reusable helpers for other modules (e.g. change history):
 *   maskFor(user, field, value)      one value, by field name ('passportNumber', 'iban', …)
 *   maskDeep(user, body)             a whole JSON body (keys + { field, value } pairs)
 *   loadMaskingSettings()            the role → groups map (cached 30 s)
 *   policyForViewer(user)            { masked, hidden } groups of one viewer (overrides included)
 */

export const MASK_GROUPS = [...LEGACY_MASK_GROUPS, ...EXTRA_MASK_GROUPS] as const;
export type MaskGroup = (typeof MASK_GROUPS)[number];
export { EXTRA_MASK_GROUPS, LEGACY_MASK_GROUPS, isExtraGroup };

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
  ...EXTRA_GROUP_KEYS,
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
  if (isExtraGroup(group)) return isExtraValue(v);
  const s = v.trim();
  if (s.length < 3 || isMasked(s)) return false;
  if (group === 'BIRTH_PLACE') return true;
  if (key === 'bic' || key === 'swift') return /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/i.test(s.replace(/\s+/g, ''));
  return (s.match(/\d/g) ?? []).length >= 2;
};

/** "•••• 3456": only the last characters stay visible (none for very short values). */
export const maskValue = (value: string, group?: MaskGroup) => {
  const s = value.replace(/\s+/g, '');
  if (group === 'BIRTH_PLACE' || (group && isExtraGroup(group))) return `${MASK_CHAR.repeat(4)}`;
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

/** Default: staff see every number masked (birth place stays visible), admins see plaintext. New groups: visible. */
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
  cachedOverrides = null;
  templateCache.clear();
};

type Viewer = { role: Role; id?: string } | undefined | null;

const isMaskableRole = (role: Role | undefined): role is MaskableRole => role === 'STAFF' || role === 'ADMIN';

/** The groups masked for this viewer's role (empty for SUPER_ADMIN and portal roles). Per-user overrides: policyForViewer. */
export const maskedGroupsFor = (viewer: Viewer, settings: MaskingSettings): Set<MaskGroup> => {
  if (!viewer || !isMaskableRole(viewer.role)) return new Set();
  return new Set(settings[viewer.role]);
};

// ─── Policy overrides (Access Center) ─────────────────────────────────

export const MASK_MODES = ['VISIBLE', 'MASKED', 'HIDDEN'] as const;
export type MaskMode = (typeof MASK_MODES)[number];
export type PolicySource = 'user' | 'template' | 'role' | 'default';

/** scope → group → mode. Scopes: role:STAFF | role:ADMIN | template:<id> | user:<id>. */
export type PolicyOverrides = Map<string, Map<MaskGroup, MaskMode>>;

let cachedOverrides: { at: number; value: PolicyOverrides } | null = null;

const isGroup = (g: string): g is MaskGroup => (MASK_GROUPS as readonly string[]).includes(g);
const isMode = (m: string): m is MaskMode => (MASK_MODES as readonly string[]).includes(m);

export const loadPolicyOverrides = async (): Promise<PolicyOverrides> => {
  if (cachedOverrides && Date.now() - cachedOverrides.at < SETTINGS_TTL_MS) return cachedOverrides.value;
  const value: PolicyOverrides = new Map();
  try {
    const rows = await prisma.sensitiveFieldPolicy.findMany({ select: { maskGroup: true, scope: true, mode: true } });
    for (const r of rows) {
      if (!isGroup(r.maskGroup) || !isMode(r.mode)) continue;
      if (!value.has(r.scope)) value.set(r.scope, new Map());
      value.get(r.scope)!.set(r.maskGroup, r.mode);
    }
  } catch {
    // Database hiccup (or table not migrated yet): no overrides = today's behaviour.
  }
  cachedOverrides = { at: Date.now(), value };
  return value;
};

export const clearPolicyOverridesCache = () => {
  cachedOverrides = null;
  templateCache.clear();
};

/**
 * Staff role templates belong to the core access engine (lib/access). It can register how to find a user's
 * template id (registerSensitiveTemplateResolver); otherwise the engine is probed once: lib/access/index.js
 * `staffTemplateIdOf(user)`, else `loadAccess(user).templateId` (index.js or store.js). Without the engine,
 * template rows simply never apply.
 */
type TemplateUser = { id: string; role: Role };
type TemplateResolver = (user: TemplateUser) => Promise<string | null> | string | null;
let templateResolver: TemplateResolver | null = null;
let probed: Promise<TemplateResolver | null> | null = null;
const ACCESS_SPECS = ['../access/index.js', '../access/store.js'];
const templateCache = new Map<string, { at: number; id: string | null }>();

export const registerSensitiveTemplateResolver = (fn: TemplateResolver | null) => {
  templateResolver = fn;
  templateCache.clear();
};

const probeAccess = async (): Promise<TemplateResolver | null> => {
  for (const spec of ACCESS_SPECS) {
    try {
      const m = (await import(/* @vite-ignore */ spec)) as { staffTemplateIdOf?: unknown; loadAccess?: unknown };
      if (typeof m.staffTemplateIdOf === 'function') return m.staffTemplateIdOf as TemplateResolver;
      if (typeof m.loadAccess === 'function') {
        const load = m.loadAccess as (u: TemplateUser) => Promise<{ templateId?: string | null }>;
        return async (u) => (await load(u))?.templateId ?? null;
      }
    } catch {
      // module not there (yet)
    }
  }
  return null;
};

const findResolver = async (): Promise<TemplateResolver | null> => {
  if (templateResolver) return templateResolver;
  probed ??= probeAccess();
  return probed;
};

export const templateIdOf = async (user: TemplateUser): Promise<string | null> => {
  const hit = templateCache.get(user.id);
  if (hit && Date.now() - hit.at < SETTINGS_TTL_MS) return hit.id;
  let id: string | null = null;
  try {
    const fn = await findResolver();
    id = fn ? ((await fn(user)) ?? null) : null;
  } catch {
    id = null;
  }
  templateCache.set(user.id, { at: Date.now(), id });
  return id;
};

/** Effective mode of every group for one viewer, with where it comes from (Access Center "test as user"). */
export const resolvePolicy = (
  viewer: Viewer,
  settings: MaskingSettings,
  overrides: PolicyOverrides,
  templateId: string | null,
): Record<MaskGroup, { mode: MaskMode; source: PolicySource }> => {
  const out = {} as Record<MaskGroup, { mode: MaskMode; source: PolicySource }>;
  for (const g of MASK_GROUPS) {
    if (!viewer || !isMaskableRole(viewer.role)) {
      out[g] = { mode: 'VISIBLE', source: 'default' };
      continue;
    }
    const user = viewer.id ? overrides.get(`user:${viewer.id}`)?.get(g) : undefined;
    const tpl = templateId ? overrides.get(`template:${templateId}`)?.get(g) : undefined;
    const roleHidden = overrides.get(`role:${viewer.role}`)?.get(g) === 'HIDDEN';
    if (user) out[g] = { mode: user, source: 'user' };
    else if (tpl) out[g] = { mode: tpl, source: 'template' };
    else if (roleHidden) out[g] = { mode: 'HIDDEN', source: 'role' };
    else if (settings[viewer.role].includes(g)) out[g] = { mode: 'MASKED', source: 'role' };
    else out[g] = { mode: 'VISIBLE', source: isExtraGroup(g) ? 'default' : 'role' };
  }
  return out;
};

export interface MaskPolicy {
  masked: Set<MaskGroup>;
  hidden: Set<MaskGroup>;
}

const EMPTY_POLICY: MaskPolicy = { masked: new Set(), hidden: new Set() };

export const policyFromModes = (modes: Record<MaskGroup, { mode: MaskMode }>): MaskPolicy => {
  const p: MaskPolicy = { masked: new Set(), hidden: new Set() };
  for (const g of MASK_GROUPS) {
    if (modes[g].mode === 'MASKED') p.masked.add(g);
    else if (modes[g].mode === 'HIDDEN') p.hidden.add(g);
  }
  return p;
};

/** The viewer's masked and hidden groups (role settings + overrides; empty for SUPER_ADMIN and portal roles). */
export const policyForViewer = async (viewer: Viewer): Promise<MaskPolicy> => {
  if (!viewer || !isMaskableRole(viewer.role)) return EMPTY_POLICY;
  const [settings, overrides] = await Promise.all([loadMaskingSettings(), loadPolicyOverrides()]);
  if (!overrides.size) {
    // Fast path (and exactly today's behaviour while no override exists).
    return { masked: maskedGroupsFor(viewer, settings), hidden: new Set() };
  }
  const templateId = viewer.id ? await templateIdOf({ id: viewer.id, role: viewer.role }) : null;
  return policyFromModes(resolvePolicy(viewer, settings, overrides, templateId));
};

/** Masked ∪ hidden (exports: hidden groups are at least masked). */
export const policyGroups = (p: MaskPolicy): Set<MaskGroup> => new Set([...p.masked, ...p.hidden]);

const withoutExtra = (p: MaskPolicy): MaskPolicy => ({
  masked: new Set([...p.masked].filter((g) => !isExtraGroup(g))),
  hidden: new Set([...p.hidden].filter((g) => !isExtraGroup(g))),
});

const hasExtra = (p: MaskPolicy) => [...p.masked, ...p.hidden].some(isExtraGroup);

// ─── Masking ───────────────────────────────────────────────────────────

/** Synchronous variant for code that already loaded the settings. */
export const maskWith = (groups: Set<MaskGroup>, field: string, value: string | null | undefined): string | null | undefined => {
  if (value === null || value === undefined) return value;
  const g = groupOfField(field);
  if (!g || !groups.has(g) || !looksLikeValue(field, g, value)) return value;
  return maskValue(value, g);
};

/** Any value (numbers, dates, Decimal) of a field of a new group, for exports: "••••" when masked. */
export const maskAnyWith = <T>(groups: Set<MaskGroup>, field: string, value: T, group?: ExtraMaskGroup): T | string => {
  const g = group ?? groupOfField(field);
  if (!g || !groups.has(g)) return value;
  if (isExtraGroup(g)) return isExtraValue(value) ? maskExtraValue(g, field, value) : value;
  return typeof value === 'string' && looksLikeValue(field, g, value) ? maskValue(value, g) : value;
};

/** One value for one viewer: masked when the viewer's policy masks (or hides) the field's group. */
export const maskFor = async (viewer: Viewer, field: string, value: string | null | undefined) => maskWith(policyGroups(await policyForViewer(viewer)), field, value);

/** Whether the viewer sees any group masked (lets exports skip the work). */
export const masksAnything = async (viewer: Viewer) => policyGroups(await policyForViewer(viewer)).size > 0;

const REF_KEYS = ['field', 'key', 'source', 'name'];
const MAX_DEPTH = 40;

const isPlainContainer = (v: unknown): v is Record<string, unknown> | unknown[] =>
  !!v && typeof v === 'object' && !(v instanceof Date) && !Buffer.isBuffer(v) && typeof (v as { toJSON?: unknown }).toJSON !== 'function';

const walk = (p: MaskPolicy, body: unknown, depth: number, parentKey?: string): unknown => {
  if ((!p.masked.size && !p.hidden.size) || depth > MAX_DEPTH || body === null || typeof body !== 'object') return body;
  if (body instanceof Date || Buffer.isBuffer(body)) return body;
  if (Array.isArray(body)) {
    let changed = false;
    const out = body.map((v) => {
      const m = walk(p, v, depth + 1, parentKey);
      if (m !== v) changed = true;
      return m;
    });
    return changed ? out : body;
  }
  const obj = body as Record<string, unknown>;
  if (typeof (obj as { toJSON?: unknown }).toJSON === 'function') return body; // Decimal etc.
  const active = (g: MaskGroup) => p.masked.has(g) || p.hidden.has(g);
  let out: Record<string, unknown> | null = null;
  const set = (k: string, v: unknown) => {
    out ??= { ...obj };
    out[k] = v;
  };
  // { field: 'passportNumber', value: 'C01X00T47' } (VIDEX fields, AI fixes, form fields)
  let refDone = false;
  if (typeof obj.value === 'string') {
    for (const rk of REF_KEYS) {
      const ref = obj[rk];
      if (typeof ref !== 'string' || REF_EXCLUDED.has(ref)) continue;
      const g = groupOfField(ref);
      if (g && active(g) && looksLikeValue(ref, g, obj.value)) {
        set('value', p.hidden.has(g) ? null : maskValue(obj.value, g));
        refDone = true;
        break;
      }
    }
  }
  // New groups: { source: 'contract.grossMonthly', value: 2500 } (official forms, change history), any scalar.
  if (!refDone && obj.value !== undefined && hasExtra(p)) {
    for (const rk of REF_KEYS) {
      const ref = obj[rk];
      if (typeof ref !== 'string') continue;
      const g = KEY_GROUP.get(ref.split('.').pop() ?? '');
      if (g && isExtraGroup(g) && active(g) && isExtraValue(obj.value)) {
        set('value', p.hidden.has(g) ? null : maskExtraValue(g, ref, obj.value));
        break;
      }
    }
  }
  // Passport OCR: the MRZ lines and the raw OCR text repeat the document number.
  const idGroups = active('PASSPORT') || active('ID_NUMBER');
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
  // Context rules of the new groups: which keys of *this* object are sensitive.
  let ctx: Map<string, ExtraMaskGroup[]> | null = null;
  const addCtx = (keys: string[], g: ExtraMaskGroup) => {
    ctx ??= new Map();
    for (const k of keys) ctx.set(k, [...(ctx.get(k) ?? []), g]);
  };
  if (active('FAMILY') && isFamilyObject(obj, parentKey)) addCtx(FAMILY_KEYS, 'FAMILY');
  if (active('ADDRESS')) {
    if (isPersonObject(obj, parentKey) || isFamilyObject(obj, parentKey)) addCtx(PERSON_ADDRESS_KEYS, 'ADDRESS');
    const landlord = landlordKeysOf(obj, parentKey);
    if (landlord) addCtx(landlord, 'ADDRESS');
  }
  if (active('HEALTH') && isHealthItem(obj)) addCtx(['expiresAt'], 'HEALTH');
  const ctxMap = ctx as Map<string, ExtraMaskGroup[]> | null;

  for (const [k, v] of Object.entries(obj)) {
    if (out && (k === 'lines' || k === 'raw' || k === 'value') && (out as Record<string, unknown>)[k] !== v) continue;
    const g = KEY_GROUP.get(k);
    // Original groups: strings only, exactly as before.
    let legacy: 'MASKED' | 'HIDDEN' | null = null;
    if (g && !isExtraGroup(g) && active(g) && typeof v === 'string' && looksLikeValue(k, g, v)) legacy = p.hidden.has(g) ? 'HIDDEN' : 'MASKED';
    // New groups: global keys + context keys, any scalar (numbers, dates, Decimal) or a whole sub-object.
    const extraGroups = [...(g && isExtraGroup(g) && active(g) ? [g] : []), ...(ctxMap?.get(k) ?? [])].filter(active);
    let extra: { mode: 'MASKED' | 'HIDDEN'; group: ExtraMaskGroup } | null = null;
    if (extraGroups.length) {
      const scalar = isExtraValue(v);
      const container = !scalar && isPlainContainer(v) && (Array.isArray(v) ? v.length > 0 : Object.keys(v).length > 0);
      if (scalar || container) {
        const hiddenG = extraGroups.find((x) => p.hidden.has(x));
        extra = hiddenG ? { mode: 'HIDDEN', group: hiddenG } : { mode: 'MASKED', group: extraGroups[0] };
      }
    }
    if (legacy === 'HIDDEN' || extra?.mode === 'HIDDEN') set(k, null);
    else if (legacy === 'MASKED') set(k, maskValue(v as string, g));
    else if (extra) set(k, maskExtraValue(extra.group, k, v));
    else if (v && typeof v === 'object') {
      const m = walk(p, v, depth + 1, k);
      if (m !== v) set(k, m);
    }
  }
  return out ?? body;
};

/** Masks a JSON-like value in place-free fashion (returns a copy only where something changed). */
export const maskJson = (groups: Set<MaskGroup>, body: unknown, depth = 0): unknown => walk({ masked: groups, hidden: new Set() }, body, depth);

/** Same with a full policy (masked + hidden groups). */
export const maskJsonPolicy = (policy: MaskPolicy, body: unknown): unknown => walk(policy, body, 0);

/** A whole response body for one viewer. */
export const maskDeep = async (viewer: Viewer, body: unknown) => walk(await policyForViewer(viewer), body, 0);

/**
 * Request bodies: a form that loaded a masked value and sends it back untouched must not overwrite the
 * stored plaintext with "•••• 3456". Masked values under sensitive keys are dropped (the field is
 * treated as "not changed"); { field, value } change lists lose the masked entries.
 * `extra`: also the keys of the new groups (address, names of family members, salary …).
 */
export const stripMaskedInput = (body: unknown, depth = 0, extra = false): unknown => {
  if (depth > MAX_DEPTH || body === null || typeof body !== 'object') return body;
  const sensitiveKey = (k: string) => KEY_GROUP.has(k) || (extra && EXTRA_INPUT_KEYS.has(k));
  const sensitiveRef = (ref: unknown) => typeof ref === 'string' && (!!groupOfField(ref) || (extra && EXTRA_INPUT_KEYS.has(ref.split('.').pop() ?? '')));
  if (Array.isArray(body)) {
    return body
      .filter((v) => {
        if (!v || typeof v !== 'object' || Array.isArray(v)) return true;
        const o = v as Record<string, unknown>;
        return !(isMasked(o.value) && REF_KEYS.some((rk) => sensitiveRef(o[rk])));
      })
      .map((v) => stripMaskedInput(v, depth + 1, extra));
  }
  const obj = body as Record<string, unknown>;
  // { key: 'passportNumber', value: '•••• 3456' } → the value is dropped (the stored / proposed one is used)
  if (isMasked(obj.value) && REF_KEYS.some((rk) => sensitiveRef(obj[rk]))) delete obj.value;
  for (const [k, v] of Object.entries(obj)) {
    if (isMasked(v) && sensitiveKey(k)) delete obj[k];
    else if (v && typeof v === 'object') obj[k] = stripMaskedInput(v, depth + 1, extra);
  }
  return obj;
};

/** Paths whose responses are never masked: the viewer's own account, and the reveal endpoint itself. */
const UNMASKED_PATHS = [/^\/api\/auth\//, /^\/api\/admin\/reveal(\/|$)/, /^\/api\/admin\/impersonate(\/|$)/, /^\/api\/account(\/|$)/, /^\/api\/agent(\/|$)/, /^\/api\/partner(\/|$)/, /^\/api\/company(\/|$)/, /^\/api\/admin\/access\/sensitive(\/|$)/];

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
  let policy: MaskPolicy;
  try {
    policy = await policyForViewer(viewer);
  } catch {
    return next();
  }
  if (hasExtra(policy) && isExtraExcludedPath(req.originalUrl)) policy = withoutExtra(policy);
  if (!policy.masked.size && !policy.hidden.size) return next();
  if (req.body && typeof req.body === 'object') stripMaskedInput(req.body, 0, hasExtra(policy));
  res.locals.maskGroups = policyGroups(policy);
  res.locals.maskPolicy = policy;
  const json = res.json.bind(res);
  res.json = (body: unknown) => json(walk(policy, body, 0));
  next();
};

/** Groups masked (or hidden) for the current request (set by maskResponses; empty when nothing is masked). */
export const requestMaskGroups = (res: Response): Set<MaskGroup> => (res.locals.maskGroups as Set<MaskGroup> | undefined) ?? new Set();

/** The full policy of the current request (masked + hidden groups). */
export const requestMaskPolicy = (res: Response): MaskPolicy => (res.locals.maskPolicy as MaskPolicy | undefined) ?? EMPTY_POLICY;

/** Groups masked (or hidden) for a viewer, without a response at hand (exports built outside the JSON path). */
export const maskGroupsForViewer = async (viewer: Viewer) => policyGroups(await policyForViewer(viewer));
