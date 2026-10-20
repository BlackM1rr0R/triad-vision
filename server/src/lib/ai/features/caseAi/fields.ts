import { isoDate, str } from '../../../aiDocs/input.js';

/**
 * Profile / case fields an AI finding may propose a value for ("Apply value"). Nothing else can be written
 * through the case AI routes; every value is validated and normalised here before it is stored.
 */

export type ApplyTarget = 'user' | 'case';

export const APPLY_FIELDS: Record<string, { target: ApplyTarget; kind: 'text' | 'date' | 'passport' | 'level'; max?: number }> = {
  firstName: { target: 'user', kind: 'text', max: 80 },
  lastName: { target: 'user', kind: 'text', max: 80 },
  birthDate: { target: 'user', kind: 'date' },
  nationality: { target: 'user', kind: 'text', max: 80 },
  passportNumber: { target: 'user', kind: 'passport' },
  passportExpiry: { target: 'user', kind: 'date' },
  germanLevel: { target: 'user', kind: 'level' },
  education: { target: 'user', kind: 'text', max: 40 },
  address: { target: 'user', kind: 'text', max: 300 },
  city: { target: 'user', kind: 'text', max: 80 },
  profession: { target: 'case', kind: 'text', max: 120 },
};

const LEVELS = ['none', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export const normaliseFieldValue = (field: string, raw: unknown): { ok: true; value: string } | { ok: false } => {
  const def = APPLY_FIELDS[field];
  if (!def) return { ok: false };
  switch (def.kind) {
    case 'date': {
      const d = isoDate(raw);
      if (!d) {
        // DD.MM.YYYY
        const m = typeof raw === 'string' ? raw.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/) : null;
        const iso = m ? isoDate(`${m[3]}-${m[2]}-${m[1]}`) : null;
        return iso ? { ok: true, value: iso } : { ok: false };
      }
      const y = Number(d.slice(0, 4));
      return y >= 1900 && y <= 2100 ? { ok: true, value: d } : { ok: false };
    }
    case 'passport': {
      const v = String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      return v.length >= 5 && v.length <= 20 ? { ok: true, value: v } : { ok: false };
    }
    case 'level': {
      const v = String(raw ?? '').trim();
      const hit = LEVELS.find((l) => l.toLowerCase() === v.toLowerCase());
      return hit ? { ok: true, value: hit } : { ok: false };
    }
    default: {
      const v = str(raw, def.max ?? 200);
      return v && v.length >= (field === 'profession' ? 2 : 1) ? { ok: true, value: v } : { ok: false };
    }
  }
};

/** Prisma data for the normalised value. */
export const fieldData = (field: string, value: string) => (APPLY_FIELDS[field].kind === 'date' ? { [field]: new Date(`${value}T00:00:00Z`) } : { [field]: value });

export const displayValue = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : v === null || v === undefined ? '' : String(v));
