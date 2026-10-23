import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { FIELD_DEFS } from '../ai/features/caseAi/videx.js';
import type { VidexResult } from '../ai/features/caseAi/videx.js';
import type { L10n } from '../ai/features/caseAi/texts.js';

/**
 * Mapping registry of client data: where a questionnaire answer or a confirmed correction may be written.
 *
 *   profile.<column>   the client's User row (history recorded by the Prisma extension, lib/history)
 *   case.profession    the case
 *   videx.<key>        the VIDEX data sheet (lib/ai/features/caseAi/videx.ts FIELD_DEFS): stored as a
 *                      CaseDataValue (used by mapVidex on the next run) and patched into the latest VIDEX run
 *
 * Nothing else can be written through the client-data routes; every value is normalised here first.
 */

export type TargetEntity = 'profile' | 'case' | 'videx';
export type TargetKind = 'text' | 'longtext' | 'date' | 'int' | 'passport' | 'level' | 'education';

export interface TargetDef {
  target: string;
  entity: TargetEntity;
  /** Column (profile / case) or VIDEX field key. */
  field: string;
  kind: TargetKind;
  label: L10n;
  max?: number;
}

const L = (az: string, de: string, en: string, ru: string): L10n => ({ az, de, en, ru });

const PROFILE: TargetDef[] = [
  { field: 'firstName', kind: 'text', max: 80, label: L('Ad', 'Vorname', 'First name', 'Имя') },
  { field: 'lastName', kind: 'text', max: 80, label: L('Soyad', 'Nachname', 'Last name', 'Фамилия') },
  { field: 'phone', kind: 'text', max: 40, label: L('Telefon', 'Telefon', 'Phone', 'Телефон') },
  { field: 'birthDate', kind: 'date', label: L('Doğum tarixi', 'Geburtsdatum', 'Date of birth', 'Дата рождения') },
  { field: 'nationality', kind: 'text', max: 80, label: L('Vətəndaşlıq', 'Staatsangehörigkeit', 'Nationality', 'Гражданство') },
  { field: 'city', kind: 'text', max: 80, label: L('Şəhər', 'Ort', 'City', 'Город') },
  { field: 'address', kind: 'longtext', max: 300, label: L('Ünvan', 'Anschrift', 'Address', 'Адрес') },
  { field: 'profession', kind: 'text', max: 120, label: L('Peşə', 'Beruf', 'Profession', 'Профессия') },
  { field: 'experienceYears', kind: 'int', label: L('İş təcrübəsi (il)', 'Berufserfahrung (Jahre)', 'Experience (years)', 'Опыт работы (лет)') },
  { field: 'germanLevel', kind: 'level', label: L('Alman dili səviyyəsi', 'Deutschniveau', 'German level', 'Уровень немецкого') },
  { field: 'education', kind: 'education', label: L('Təhsil', 'Ausbildung', 'Education', 'Образование') },
  { field: 'drivingLicence', kind: 'text', max: 60, label: L('Sürücülük kateqoriyaları', 'Führerscheinklassen', 'Driving licence classes', 'Категории прав') },
  { field: 'passportNumber', kind: 'passport', label: L('Pasport nömrəsi', 'Passnummer', 'Passport number', 'Номер паспорта') },
  { field: 'passportExpiry', kind: 'date', label: L('Pasportun etibarlılıq tarixi', 'Pass gültig bis', 'Passport valid until', 'Паспорт действителен до') },
  { field: 'about', kind: 'longtext', max: 4000, label: L('Haqqında', 'Über mich', 'About', 'О себе') },
].map((d) => ({ ...d, entity: 'profile' as const, target: `profile.${d.field}` }) as TargetDef);

const CASE: TargetDef[] = [{ target: 'case.profession', entity: 'case', field: 'profession', kind: 'text', max: 120, label: L('Müraciət: peşə', 'Akte: Beruf', 'Case: profession', 'Заявка: профессия') }];

const VIDEX: TargetDef[] = FIELD_DEFS.map((d) => ({
  target: `videx.${d.key}`,
  entity: 'videx' as const,
  field: d.key,
  kind: 'longtext' as const,
  max: 600,
  label: { az: `VIDEX: ${d.label.az}`, de: `VIDEX: ${d.label.de}`, en: `VIDEX: ${d.label.en}`, ru: `VIDEX: ${d.label.ru}` },
}));

export const TARGETS: TargetDef[] = [...PROFILE, ...CASE, ...VIDEX];
const BY_TARGET = new Map(TARGETS.map((t) => [t.target, t]));
export const targetDef = (target: string | null | undefined) => (target ? BY_TARGET.get(target) : undefined);
export const TARGET_KEYS = TARGETS.map((t) => t.target);

const LEVELS = ['none', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const EDUCATION = ['school', 'vocational', 'university'];

/** "YYYY-MM-DD" from ISO / DD.MM.YYYY input, or null. */
export const isoDay = (raw: unknown): string | null => {
  const s = String(raw ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) {
    const d = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (d) m = ['', d[3], d[2].padStart(2, '0'), d[1].padStart(2, '0')] as unknown as RegExpMatchArray;
  }
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}`;
  const dt = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== iso) return null;
  const y = Number(m[1]);
  return y >= 1900 && y <= 2100 ? iso : null;
};

export const dmy = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

/** Normalised value for a target, or null when it is not valid there. */
export const normaliseTarget = (def: TargetDef, raw: unknown): string | null => {
  const s = typeof raw === 'string' ? raw.replace(/[ \t]+/g, ' ').trim() : raw === null || raw === undefined ? '' : String(raw).trim();
  switch (def.kind) {
    case 'date':
      return isoDay(s);
    case 'int': {
      const n = Number(s);
      return Number.isInteger(n) && n >= 0 && n <= 80 ? String(n) : null;
    }
    case 'passport': {
      const v = s.toUpperCase().replace(/[^A-Z0-9]/g, '');
      return v.length >= 5 && v.length <= 20 ? v : null;
    }
    case 'level':
      return LEVELS.find((l) => l.toLowerCase() === s.toLowerCase()) ?? null;
    case 'education':
      return EDUCATION.find((l) => l === s.toLowerCase()) ?? null;
    default: {
      const v = s.slice(0, def.max ?? 200);
      return v ? v : null;
    }
  }
};

const display = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : v === null || v === undefined ? '' : String(v));

export interface TargetContext {
  caseId: string;
  clientId: string;
  user: Record<string, unknown>;
  profession: string;
  dataValues: Map<string, string>;
  videxRun: { id: string; result: VidexResult } | null;
  /** Family member's case: the account (profile) is the main client's, so profile targets are not written. */
  familyMember: boolean;
}

export const loadTargetContext = async (caseId: string): Promise<TargetContext> => {
  const c = await prisma.case.findUniqueOrThrow({ where: { id: caseId }, select: { id: true, clientId: true, profession: true, familyProfile: { select: { id: true } } } });
  const [user, values, run] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: c.clientId }, select: Object.fromEntries(PROFILE.map((p) => [p.field, true])) as Prisma.UserSelect }),
    prisma.caseDataValue.findMany({ where: { caseId } }),
    prisma.caseAiRun.findFirst({ where: { caseId, kind: 'VIDEX' }, orderBy: { createdAt: 'desc' }, select: { id: true, result: true } }),
  ]);
  return {
    caseId: c.id,
    clientId: c.clientId,
    user: user as unknown as Record<string, unknown>,
    profession: c.profession,
    dataValues: new Map(values.map((v) => [v.key, v.value])),
    videxRun: run ? { id: run.id, result: run.result as unknown as VidexResult } : null,
    familyMember: !!c.familyProfile,
  };
};

/** Current value of a target (dates as YYYY-MM-DD for profile targets). */
export const currentValue = (ctx: TargetContext, def: TargetDef): string => {
  if (def.entity === 'profile') return display(ctx.user[def.field]);
  if (def.entity === 'case') return ctx.profession ?? '';
  return ctx.dataValues.get(def.field) ?? ctx.videxRun?.result.fields.find((f) => f.key === def.field)?.value ?? '';
};

/**
 * Writes normalised values. Profile / case columns go through prisma.user/case.update (field history with the
 * request's actor); VIDEX values are stored as CaseDataValue and patched into the latest VIDEX run.
 */
export const writeTargets = async (
  ctx: TargetContext,
  writes: { def: TargetDef; value: string }[],
  meta: { actorId: string; source: 'form' | 'confirmation'; sourceId: string },
) => {
  const profile: Record<string, unknown> = {};
  for (const w of writes.filter((x) => x.def.entity === 'profile' && !ctx.familyMember)) {
    profile[w.def.field] = w.def.kind === 'date' ? new Date(`${w.value}T00:00:00Z`) : w.def.kind === 'int' ? Number(w.value) : w.value;
  }
  if (Object.keys(profile).length) await prisma.user.update({ where: { id: ctx.clientId }, data: profile as Prisma.UserUpdateInput });
  const caseWrite = writes.find((x) => x.def.entity === 'case');
  if (caseWrite) await prisma.case.update({ where: { id: ctx.caseId }, data: { profession: caseWrite.value } });
  const videx = writes.filter((x) => x.def.entity === 'videx');
  for (const w of videx) {
    await prisma.caseDataValue.upsert({
      where: { caseId_key: { caseId: ctx.caseId, key: w.def.field } },
      create: { caseId: ctx.caseId, key: w.def.field, value: w.value, source: meta.source, sourceId: meta.sourceId, updatedById: meta.actorId },
      update: { value: w.value, source: meta.source, sourceId: meta.sourceId, updatedById: meta.actorId },
    });
    ctx.dataValues.set(w.def.field, w.value);
  }
  if (videx.length && ctx.videxRun) {
    const result = ctx.videxRun.result;
    const now = new Date().toISOString();
    for (const w of videx) {
      const f = result.fields.find((x) => x.key === w.def.field);
      if (!f) continue;
      f.value = w.value;
      f.source = 'manual';
      f.confidence = 'high';
      f.editedAt = now;
      f.editedById = meta.actorId;
    }
    await prisma.caseAiRun.update({ where: { id: ctx.videxRun.id }, data: { result: result as unknown as Prisma.InputJsonValue } });
  }
};
