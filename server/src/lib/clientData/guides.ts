import type { DocumentGuide, Locale, Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { DEFAULT_REQUIREMENTS } from '../docsIntel/requirementTemplates.js';
import { GUIDE_ALIASES, GUIDE_DEFAULTS, type GuideLink, type GuideText } from './guideDefaults.js';

/**
 * "Necə almalı?" document guides per requirement key: where to get the document, how long it takes, the
 * approximate cost, apostille / translation, common mistakes, a sample image and links — in 4 languages.
 * Built-in drafts (guideDefaults.ts) are shown until an admin saves a guide; `verified` marks a guide an
 * admin has checked. Clients only see published guides.
 */

export const LANGS = ['az', 'de', 'en', 'ru'] as const;
export const GUIDE_FIELDS = ['summary', 'where', 'duration', 'cost', 'apostille', 'translation', 'mistakes', 'tips'] as const;

const text = z.string().trim().max(3000);
const guideText = z.object(Object.fromEntries(GUIDE_FIELDS.map((f) => [f, text])) as Record<(typeof GUIDE_FIELDS)[number], typeof text>);
export const guideSaveSchema = z.object({
  content: z.object({ az: guideText, de: guideText, en: guideText, ru: guideText }),
  links: z.array(z.object({ label: z.string().trim().min(1).max(120), url: z.string().trim().url().max(500).refine((u) => /^https?:\/\//i.test(u), 'HTTP_ONLY') })).max(10),
  sampleImage: z
    .string()
    .trim()
    .max(300)
    .regex(/^\/uploads\/[A-Za-z0-9._-]+$/, 'UPLOAD_URL')
    .nullable(),
  verified: z.boolean(),
  published: z.boolean(),
});
export type GuideSave = z.infer<typeof guideSaveSchema>;

export const guideKey = z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,39}$/);

export interface GuideDto {
  key: string;
  content: Record<Locale, GuideText>;
  links: GuideLink[];
  sampleImage: string | null;
  verified: boolean;
  published: boolean;
  /** true: built-in draft text, nothing saved yet. */
  builtIn: boolean;
  hasDefault: boolean;
  updatedAt: string | null;
  updatedById: string | null;
}

const DEFAULTS = new Map(GUIDE_DEFAULTS.map((g) => [g.key, g]));

const dto = (key: string, row: DocumentGuide | undefined): GuideDto | null => {
  const def = DEFAULTS.get(key);
  if (row)
    return {
      key,
      content: row.content as unknown as Record<Locale, GuideText>,
      links: (row.links as unknown as GuideLink[] | null) ?? [],
      sampleImage: row.sampleImage,
      verified: row.verified,
      published: row.published,
      builtIn: false,
      hasDefault: !!def,
      updatedAt: row.updatedAt.toISOString(),
      updatedById: row.updatedById,
    };
  if (!def) return null;
  return { key, content: def.content, links: def.links, sampleImage: null, verified: false, published: true, builtIn: true, hasDefault: true, updatedAt: null, updatedById: null };
};

/** Every requirement key staff may write a guide for (defaults, templates, saved guides). */
export const guideKeys = async () => {
  const [templates, rows] = await Promise.all([
    prisma.requirementTemplate.findMany({ where: { key: { not: null } }, select: { key: true }, distinct: ['key'] }),
    prisma.documentGuide.findMany({ select: { key: true } }),
  ]);
  const keys = new Set<string>([
    ...GUIDE_DEFAULTS.map((g) => g.key),
    ...DEFAULT_REQUIREMENTS.INITIAL.map((r) => r.key),
    ...DEFAULT_REQUIREMENTS.EMBASSY.map((r) => r.key),
    ...templates.map((t) => t.key!).filter(Boolean),
    ...rows.map((r) => r.key),
  ]);
  return [...keys].sort();
};

export const listGuides = async () => {
  const [keys, rows] = await Promise.all([guideKeys(), prisma.documentGuide.findMany()]);
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return keys.map((key) => ({ key, alias: GUIDE_ALIASES[key] ?? null, guide: dto(key, byKey.get(key)) }));
};

export const getGuide = async (key: string) => dto(key, (await prisma.documentGuide.findUnique({ where: { key } })) ?? undefined);

export const saveGuide = async (key: string, body: GuideSave, actorId: string) => {
  const data = {
    content: body.content as unknown as Prisma.InputJsonValue,
    links: body.links as unknown as Prisma.InputJsonValue,
    sampleImage: body.sampleImage,
    verified: body.verified,
    published: body.published,
    updatedById: actorId,
  };
  const row = await prisma.documentGuide.upsert({ where: { key }, create: { key, ...data }, update: data });
  return dto(key, row)!;
};

export const resetGuide = async (key: string) => {
  await prisma.documentGuide.deleteMany({ where: { key } });
  return dto(key, undefined);
};

/** Published guides for requirement keys, in one language (alias keys resolved), for the client portal. */
export const clientGuides = async (keys: string[], locale: Locale) => {
  const wanted = [...new Set(keys.map((k) => k.toUpperCase()))].slice(0, 60);
  const resolved = new Map(wanted.map((k) => [k, DEFAULTS.has(k) ? k : (GUIDE_ALIASES[k] ?? k)]));
  const rows = await prisma.documentGuide.findMany({ where: { key: { in: [...new Set([...wanted, ...resolved.values()])] } } });
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const out: Record<string, { key: string; text: GuideText; links: GuideLink[]; sampleImage: string | null; verified: boolean }> = {};
  for (const k of wanted) {
    const g = dto(k, byKey.get(k)) ?? dto(resolved.get(k)!, byKey.get(resolved.get(k)!));
    if (!g || !g.published) continue;
    const t = g.content[locale] ?? g.content.az;
    const fbT = g.content.az;
    const textOut = Object.fromEntries(GUIDE_FIELDS.map((f) => [f, t?.[f] || fbT?.[f] || ''])) as unknown as GuideText;
    if (!Object.values(textOut).some((v) => v)) continue;
    out[k] = { key: g.key, text: textOut, links: g.links, sampleImage: g.sampleImage, verified: g.verified };
  }
  return out;
};
