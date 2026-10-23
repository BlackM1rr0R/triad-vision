import type { Role } from '@prisma/client';

/**
 * Masking adapter of the report builder. The platform masking (lib/privacy/mask.ts: per-role groups set by the
 * super admin) is imported optionally, so the builder keeps working when that module is absent; then the
 * fallback applies: masked columns are shown in plain text to SUPER_ADMIN only.
 */

interface MaskModule {
  maskGroupsForViewer: (viewer: { role: Role }) => Promise<Set<string>>;
  groupOfField: (field: string) => string | undefined;
  maskValue: (value: string, group?: string) => string;
  resetMaskingCache?: () => void;
}

const SPEC = '../privacy/mask.js';
let loading: Promise<MaskModule | null> | null = null;

const loadModule = () =>
  (loading ??= import(/* @vite-ignore */ SPEC)
    .then((m: Partial<MaskModule>) =>
      typeof m.maskGroupsForViewer === 'function' && typeof m.groupOfField === 'function' && typeof m.maskValue === 'function' ? (m as MaskModule) : null,
    )
    .catch(() => null));

export const MASK_CHAR = '•';

/** "•••• 3456" (fallback format, same as the platform). */
export const fallbackMask = (value: string) => {
  const s = value.replace(/\s+/g, '');
  const visible = s.length >= 10 ? 4 : s.length >= 6 ? 3 : 0;
  return visible ? `${MASK_CHAR.repeat(4)} ${s.slice(-visible)}` : MASK_CHAR.repeat(4);
};

/** A masker for one viewer: `masks(field)` says whether a column with that maskField is masked. */
export interface Masker {
  masks: (field: string) => boolean;
  /** Personal columns (phone, birth date, address) are masked too (external recipients). */
  personal?: boolean;
  apply: (field: string, value: unknown) => unknown;
}

const NONE: Masker = { masks: () => false, apply: (_f, v) => v };

/**
 * `external` = the report goes to an address outside the team (scheduled e-mail): every masked field is
 * masked, whatever the role settings say.
 */
export const maskerFor = async (viewer: { role: Role }, opts: { external?: boolean } = {}): Promise<Masker> => {
  const mod = await loadModule();
  const maskStr = (field: string, v: unknown) => {
    if (v === null || v === undefined || v === '') return v;
    const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
    return mod ? mod.maskValue(s, mod.groupOfField(field)) : fallbackMask(s);
  };
  if (opts.external) return { masks: () => true, personal: true, apply: maskStr };
  if (!mod) {
    if (viewer.role === 'SUPER_ADMIN') return NONE;
    return { masks: () => true, apply: maskStr };
  }
  let groups: Set<string>;
  try {
    groups = await mod.maskGroupsForViewer(viewer);
  } catch {
    groups = new Set(['PASSPORT', 'ID_NUMBER', 'IBAN', 'TAX_ID', 'BIRTH_PLACE']);
  }
  if (!groups.size) return NONE;
  const masks = (field: string) => {
    const g = mod.groupOfField(field);
    return !!g && groups.has(g);
  };
  return { masks, apply: (field, v) => (masks(field) ? maskStr(field, v) : v) };
};

/** Tests: forget the platform's cached masking settings. */
export const resetMaskCache = async () => {
  (await loadModule())?.resetMaskingCache?.();
};
