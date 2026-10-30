import { z } from 'zod';
import { prisma } from '../../db.js';

/**
 * Landing page builder: campaign / country pages assembled from typed sections, public at /l/:slug.
 * Each page is written in one language (LandingPage.locale). The section data is validated here, so the
 * public renderer only ever sees known section types with bounded text. Images are URLs from the content
 * upload (/uploads/…) or https; videos only YouTube / Vimeo.
 */

export const LANDING_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export const SECTION_TYPES = ['hero', 'text', 'benefits', 'steps', 'faq', 'testimonials', 'stats', 'video', 'cta', 'form'] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

export const FORM_FIELDS = ['name', 'phone', 'email', 'profession', 'germanLevel', 'country', 'message'] as const;
export type FormField = (typeof FORM_FIELDS)[number];

const text = (max: number) => z.string().trim().max(max).default('');
const imageUrl = z
  .string()
  .trim()
  .max(1000)
  .refine((u) => u === '' || /^https:\/\//i.test(u) || /^\/uploads\/[\w.-]+$/.test(u), 'IMAGE_URL')
  .default('');
/** CTA target: the page's form, the booking page, or an internal path / https link. */
const target = z
  .string()
  .trim()
  .max(500)
  .refine((u) => u === '' || u === '#form' || /^\/[^/]/.test(u) || u === '/' || /^https:\/\//i.test(u), 'CTA_TARGET')
  .default('#form');

const YOUTUBE = /^https:\/\/(www\.)?(youtube\.com\/(watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,20})/i;
const VIMEO = /^https:\/\/(www\.|player\.)?vimeo\.com\/(video\/)?(\d{5,12})/i;

/** YouTube / Vimeo page URL → privacy-friendly embed URL (null for anything else). */
export const videoEmbedUrl = (url: string) => {
  const y = YOUTUBE.exec(url);
  if (y) return `https://www.youtube-nocookie.com/embed/${y[4]}`;
  const v = VIMEO.exec(url);
  if (v) return `https://player.vimeo.com/video/${v[3]}?dnt=1`;
  return null;
};

const items = <T extends z.ZodTypeAny>(item: T, max = 12) => z.array(item).max(max).default([]);

export const sectionDataSchemas = {
  // imageAlt: alt text of the hero image (empty = decorative, the title says it all).
  hero: z.object({ title: text(200), subtitle: text(600), image: imageUrl, imageAlt: text(200), ctaLabel: text(60), ctaTarget: target }),
  text: z.object({ title: text(200), body: text(10_000) }),
  benefits: z.object({ title: text(200), items: items(z.object({ icon: text(40), title: text(120), text: text(400) })) }),
  steps: z.object({ title: text(200), items: items(z.object({ title: text(120), text: text(400) })) }),
  faq: z.object({ title: text(200), items: items(z.object({ q: text(300), a: text(2000) }), 20) }),
  testimonials: z.object({
    title: text(200),
    ids: z.array(z.string().min(1).max(40)).max(12).default([]),
    custom: items(z.object({ name: text(120), role: text(120), text: text(800), photo: imageUrl })),
  }),
  stats: z.object({ title: text(200), items: items(z.object({ value: text(30), label: text(120) }), 8) }),
  video: z.object({ title: text(200), url: z.string().trim().max(500).refine((u) => u === '' || videoEmbedUrl(u) !== null, 'VIDEO_URL').default('') }),
  cta: z.object({ title: text(200), text: text(600), label: text(60), target }),
  form: z.object({ title: text(200), text: text(600) }),
} satisfies Record<SectionType, z.ZodTypeAny>;

const sectionId = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/);

export const sectionSchema = z.discriminatedUnion(
  'type',
  SECTION_TYPES.map((type) => z.object({ id: sectionId, type: z.literal(type), data: sectionDataSchemas[type] })) as unknown as [
    z.ZodDiscriminatedUnionOption<'type'>,
    ...z.ZodDiscriminatedUnionOption<'type'>[],
  ],
);
export type LandingSection = { id: string; type: SectionType; data: Record<string, unknown> };

export const sectionsSchema = z
  .array(sectionSchema)
  .max(30)
  .refine((list) => new Set(list.map((s) => (s as LandingSection).id)).size === list.length, 'DUPLICATE_SECTION_ID');

const fieldRule = z.object({ show: z.boolean(), required: z.boolean() });

export const formConfigSchema = z
  .object({
    fields: z.object(Object.fromEntries(FORM_FIELDS.map((f) => [f, fieldRule])) as Record<FormField, typeof fieldRule>),
    /** Which inquiry the form creates (contact = candidate lead, company = employer lead). */
    kind: z.enum(['contact', 'company']).default('contact'),
    submitLabel: text(60),
    successText: text(400),
  })
  .refine((c) => c.fields.name.show && (c.fields.email.show || c.fields.phone.show), 'NAME_AND_CONTACT_REQUIRED');
export type FormConfig = z.infer<typeof formConfigSchema>;

export const DEFAULT_FORM_CONFIG: FormConfig = {
  fields: {
    name: { show: true, required: true },
    phone: { show: true, required: true },
    email: { show: true, required: false },
    profession: { show: true, required: false },
    germanLevel: { show: true, required: false },
    country: { show: false, required: false },
    message: { show: true, required: false },
  },
  kind: 'contact',
  submitLabel: '',
  successText: '',
};

/** Stored form config → valid config (old / broken rows fall back to the default). */
export const formConfigOf = (raw: unknown): FormConfig => {
  const parsed = formConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_FORM_CONFIG;
};

/** Stored sections → valid sections (an invalid section is dropped, never the whole page). */
export const sectionsOf = (raw: unknown): LandingSection[] => {
  if (!Array.isArray(raw)) return [];
  const out: LandingSection[] = [];
  for (const s of raw) {
    const p = sectionSchema.safeParse(s);
    if (p.success) out.push(p.data as LandingSection);
  }
  return out;
};

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'SLUG_FORMAT');

/** Free text → url slug ("Almaniyada sürücü işi" → "almaniyada-surucu-isi"). */
export const slugify = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ə/gi, 'e')
    .replace(/ı/g, 'i')
    .replace(/ş/gi, 's')
    .replace(/ç/gi, 'c')
    .replace(/ğ/gi, 'g')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);

export const uniqueLandingSlug = async (base: string, exceptId?: string) => {
  const root = slugify(base) || 'landing';
  for (let n = 1; n < 100; n++) {
    const slug = n === 1 ? root : `${root}-${n}`;
    const taken = await prisma.landingPage.findUnique({ where: { slug }, select: { id: true } });
    if (!taken || taken.id === exceptId) return slug;
  }
  return `${root}-${Date.now().toString(36)}`;
};

/** Conversion rate in percent with one decimal (null without views). */
export const conversionRate = (views: number, submissions: number) => (views > 0 ? Math.round((submissions / views) * 1000) / 10 : null);

// ─── SEO helpers (sitemap.xml + server-side head of /l/:slug) ─────────

export interface LandingSeo {
  slug: string;
  locale: string;
  title: string;
  seoTitle: string | null;
  seoDescription: string | null;
  ogImage: string | null;
  heroImage: string | null;
  heroSubtitle: string | null;
  updatedAt: Date;
}

/** Published landing pages for the sitemap and the head resolver (lib/seo.ts). */
export const publishedLandingsForSeo = async (): Promise<LandingSeo[]> => {
  const rows = await prisma.landingPage.findMany({
    where: { status: 'PUBLISHED' },
    orderBy: { publishedAt: 'desc' },
    take: 500,
    select: { slug: true, locale: true, title: true, seoTitle: true, seoDescription: true, ogImage: true, sections: true, updatedAt: true },
  });
  return rows.map((r) => {
    const hero = sectionsOf(r.sections).find((s) => s.type === 'hero');
    const data = (hero?.data ?? {}) as { image?: string; subtitle?: string };
    return {
      slug: r.slug,
      locale: r.locale,
      title: r.title,
      seoTitle: r.seoTitle,
      seoDescription: r.seoDescription,
      ogImage: r.ogImage,
      heroImage: data.image || null,
      heroSubtitle: data.subtitle || null,
      updatedAt: r.updatedAt,
    };
  });
};
