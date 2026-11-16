import { z } from 'zod';
import type { EmployerChecklistTemplate } from '@prisma/client';
import { prisma } from '../db.js';
import { badRequest, notFound } from './http.js';

/**
 * Templates of the employer arrival checklist (lib/employerArrival.ts). The built-in items live here in code (so a
 * fresh database and the tests need no seed); ADMIN+ can override a built-in (labels, due-date rule, visibility,
 * order, switch it off) or add new items for every company — rows of EmployerChecklistTemplate
 * (Admin → Employers → "Arrival checklist templates", routes/admin/employerChecklist.ts).
 *
 * Due dates are relative to an anchor: ARRIVAL (the worker's arrival from the arrival plan) or FIRST_DAY (the first
 * work day: the employer's FIRST_DAY item, else the employment contract start). Recommended offsets (days):
 *   HOUSING −14 · WOHNUNGSGEBER −3 (the landlord's confirmation is needed for the Anmeldung, § 19 BMG) ·
 *   ANMELDUNG +7 (registration within two weeks of moving in, § 17 BMG) · BANK_ACCOUNT +10 ·
 *   HEALTH_INSURANCE +3 (the worker picks a Krankenkasse and tells the employer within two weeks of starting,
 *   § 175 SGB V) · TAX_ID +21 (the Steuer-ID arrives by post a few weeks after the Anmeldung) · BUDDY −7 before the
 *   first day · FIRST_DAY 0 · WORKWEAR −1 · SAFETY_BRIEFING 0 (before work starts, § 12 ArbSchG) · LANGUAGE_SUPPORT +14.
 * These are planning suggestions, not legal deadlines; each company can change any date per worker.
 */

export const DEFAULT_ITEMS = [
  'HOUSING',
  'WOHNUNGSGEBER',
  'ANMELDUNG',
  'BANK_ACCOUNT',
  'HEALTH_INSURANCE',
  'TAX_ID',
  'BUDDY',
  'FIRST_DAY',
  'WORKWEAR',
  'SAFETY_BRIEFING',
  'LANGUAGE_SUPPORT',
] as const;
export type DefaultItem = (typeof DEFAULT_ITEMS)[number];

export const ANCHORS = ['ARRIVAL', 'FIRST_DAY'] as const;
export type Anchor = (typeof ANCHORS)[number];
export const LABEL_LOCALES = ['de', 'en', 'az', 'ru'] as const;
export type LabelLocale = (typeof LABEL_LOCALES)[number];
export type Labels = Record<LabelLocale, string | null>;

export interface Template {
  key: string;
  builtIn: boolean;
  /** null for a built-in without an override: the UI uses its own translations (employerChecklist.item.KEY). */
  labels: Labels | null;
  anchor: Anchor;
  offsetDays: number | null;
  visibleToWorker: boolean;
  active: boolean;
  sortOrder: number;
}

const b = (key: DefaultItem, anchor: Anchor, offsetDays: number | null, sortOrder: number): Template => ({
  key,
  builtIn: true,
  labels: null,
  anchor,
  offsetDays,
  visibleToWorker: true,
  active: true,
  sortOrder,
});

/** sortOrder of the eight original items is unchanged (10…80) so existing checklists keep their order. */
export const BUILTIN_TEMPLATES: Template[] = [
  b('HOUSING', 'ARRIVAL', -14, 10),
  b('WOHNUNGSGEBER', 'ARRIVAL', -3, 15),
  b('ANMELDUNG', 'ARRIVAL', 7, 20),
  b('BANK_ACCOUNT', 'ARRIVAL', 10, 30),
  b('HEALTH_INSURANCE', 'ARRIVAL', 3, 40),
  b('TAX_ID', 'ARRIVAL', 21, 50),
  b('BUDDY', 'FIRST_DAY', -7, 55),
  b('FIRST_DAY', 'FIRST_DAY', 0, 60),
  b('WORKWEAR', 'FIRST_DAY', -1, 70),
  b('SAFETY_BRIEFING', 'FIRST_DAY', 0, 80),
  b('LANGUAGE_SUPPORT', 'FIRST_DAY', 14, 90),
];

const asAnchor = (v: string): Anchor => (v === 'FIRST_DAY' ? 'FIRST_DAY' : 'ARRIVAL');

/** Built-ins merged with the database rows (a row overrides the built-in of the same key; other rows are additions). */
export const mergeTemplates = (rows: Pick<EmployerChecklistTemplate, 'key' | 'labelDe' | 'labelEn' | 'labelAz' | 'labelRu' | 'anchor' | 'offsetDays' | 'visibleToWorker' | 'active' | 'sortOrder'>[]): Template[] => {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const out: Template[] = BUILTIN_TEMPLATES.map((t) => {
    const r = byKey.get(t.key);
    if (!r) return t;
    return {
      ...t,
      labels: { de: r.labelDe, en: r.labelEn, az: r.labelAz, ru: r.labelRu },
      anchor: t.key === 'FIRST_DAY' ? 'FIRST_DAY' : asAnchor(r.anchor),
      offsetDays: t.key === 'FIRST_DAY' ? 0 : r.offsetDays,
      visibleToWorker: r.visibleToWorker,
      active: r.active,
      sortOrder: r.sortOrder,
    };
  });
  for (const r of rows) {
    if ((DEFAULT_ITEMS as readonly string[]).includes(r.key)) continue;
    out.push({
      key: r.key,
      builtIn: false,
      labels: { de: r.labelDe, en: r.labelEn, az: r.labelAz, ru: r.labelRu },
      anchor: asAnchor(r.anchor),
      offsetDays: r.offsetDays,
      visibleToWorker: r.visibleToWorker,
      active: r.active,
      sortOrder: r.sortOrder,
    });
  }
  return out.sort((a, z2) => a.sortOrder - z2.sortOrder || a.key.localeCompare(z2.key));
};

export const loadTemplates = async () => mergeTemplates(await prisma.employerChecklistTemplate.findMany());

const DAY = 24 * 60 * 60 * 1000;
/** Calendar day (00:00 UTC) of a date. */
export const utcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

export interface Anchors {
  arrival: Date | null;
  firstDay: Date | null;
}

/** Due date of a template for a worker (calendar day), or null when the anchor date is unknown / no offset. */
export const dueFor = (t: Pick<Template, 'anchor' | 'offsetDays'>, anchors: Anchors): Date | null => {
  if (t.offsetDays == null) return null;
  const base = t.anchor === 'FIRST_DAY' ? anchors.firstDay : anchors.arrival;
  return base ? new Date(utcDay(base).getTime() + t.offsetDays * DAY) : null;
};

export type DueState = 'done' | 'none' | 'ok' | 'soon' | 'overdue';
/** Shown in the company / staff lists: overdue (past, open), soon (≤ 3 days), ok, none (no date), done. */
export const dueState = (i: { done: boolean; dueDate: Date | null }, now = new Date()): DueState => {
  if (i.done) return 'done';
  if (!i.dueDate) return 'none';
  const days = Math.round((utcDay(i.dueDate).getTime() - utcDay(now).getTime()) / DAY);
  return days < 0 ? 'overdue' : days <= 3 ? 'soon' : 'ok';
};

/** Label of an item in a locale: custom label, template label (locale → German), else null (UI translation). */
export const labelOf = (i: { key: string | null; label: string | null }, templates: Map<string, Template>) =>
  i.key ? (templates.get(i.key)?.labels ?? null) : null;

// ─── Admin edits ───────────────────────────────────────────────────────

const label = z.string().trim().min(1).max(200);
const optLabel = z
  .string()
  .trim()
  .max(200)
  .nullable()
  .optional()
  .transform((v) => (v ? v : null));

export const templateInput = z
  .object({
    labelDe: label,
    labelEn: optLabel,
    labelAz: optLabel,
    labelRu: optLabel,
    anchor: z.enum(ANCHORS).default('ARRIVAL'),
    offsetDays: z.number().int().min(-120).max(180).nullable().default(null),
    visibleToWorker: z.boolean().default(true),
    active: z.boolean().default(true),
    sortOrder: z.number().int().min(0).max(10_000).default(500),
  })
  .strict();

export const KEY_RE = /^[A-Z][A-Z0-9_]{2,29}$/;

/** Admin: create or replace the template of a key (built-in override or a new key). */
export const saveTemplate = async (key: string, input: z.output<typeof templateInput>, actorId: string) => {
  if (!KEY_RE.test(key)) throw badRequest('INVALID_KEY');
  const data = { ...input, updatedById: actorId };
  return prisma.employerChecklistTemplate.upsert({ where: { key }, create: { key, ...data }, update: data });
};

/** Admin: drop an override (a built-in returns to its defaults). New keys cannot be deleted — switch them off instead. */
export const resetTemplate = async (key: string) => {
  if (!(DEFAULT_ITEMS as readonly string[]).includes(key)) throw badRequest('ONLY_BUILT_IN_RESET');
  const { count } = await prisma.employerChecklistTemplate.deleteMany({ where: { key } });
  if (!count) throw notFound('TEMPLATE_NOT_FOUND');
};
