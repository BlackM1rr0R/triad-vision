import { z } from 'zod';

/**
 * CV data stored in CandidateCv.data. The PUT schema is strict (unknown keys are rejected); `readCv`
 * tolerantly turns whatever is stored into the same shape so old or partial rows never break rendering.
 */

export const CV_TEMPLATES = ['lebenslauf', 'europass'] as const;
export type CvTemplate = (typeof CV_TEMPLATES)[number];
export const CV_LANGS = ['de', 'en'] as const;
export type CvLang = (typeof CV_LANGS)[number];
export const LANGUAGE_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'native'] as const;
export type LanguageLevel = (typeof LANGUAGE_LEVELS)[number];

export const MONTH_RE = /^(19[5-9]\d|20\d\d)-(0[1-9]|1[0-2])$/;

const text = (max: number) => z.string().trim().max(max);
const month = z.string().trim().regex(MONTH_RE, 'MONTH_FORMAT');
/** Optional month: '' and null both mean "not given". */
const optMonth = z
  .union([month, z.literal('')])
  .nullable()
  .optional()
  .transform((v) => (v ? v : null));

export const experienceSchema = z
  .object({
    title: text(120).min(1),
    employer: text(160).default(''),
    city: text(80).default(''),
    country: text(80).default(''),
    from: month,
    /** null = current position */
    to: optMonth,
    tasks: z.array(text(300).min(1)).max(12).default([]),
  })
  .strict()
  .refine((e) => !e.to || e.to >= e.from, { message: 'TO_BEFORE_FROM', path: ['to'] });

export const educationSchema = z
  .object({
    degree: text(160).min(1),
    institution: text(160).default(''),
    city: text(80).default(''),
    country: text(80).default(''),
    from: optMonth,
    to: optMonth,
    field: text(160).default(''),
  })
  .strict()
  .refine((e) => !e.from || !e.to || e.to >= e.from, { message: 'TO_BEFORE_FROM', path: ['to'] });

export const languageSchema = z.object({ language: text(60).min(1), level: z.enum(LANGUAGE_LEVELS) }).strict();
export const certificateSchema = z
  .object({
    name: text(160).min(1),
    issuer: text(160).default(''),
    year: z
      .union([z.number().int().min(1950).max(2100), z.literal(''), z.null()])
      .optional()
      .transform((v) => (typeof v === 'number' ? v : null)),
  })
  .strict();

export const cvDataSchema = z
  .object({
    headline: text(160).default(''),
    summary: text(1500).default(''),
    experience: z.array(experienceSchema).max(20).default([]),
    education: z.array(educationSchema).max(12).default([]),
    languages: z.array(languageSchema).max(12).default([]),
    skills: z.array(text(80).min(1)).max(40).default([]),
    certificates: z.array(certificateSchema).max(20).default([]),
    drivingLicences: z.array(text(10).min(1)).max(16).default([]),
    interests: z.array(text(80).min(1)).max(20).default([]),
  })
  .strict();

export type CvData = z.infer<typeof cvDataSchema>;
export type CvExperience = CvData['experience'][number];
export type CvEducation = CvData['education'][number];

export const cvPutSchema = z
  .object({
    data: cvDataSchema,
    template: z.enum(CV_TEMPLATES).optional(),
    shareWithEmployers: z.boolean().optional(),
  })
  .strict();

export const emptyCv = (): CvData => ({
  headline: '',
  summary: '',
  experience: [],
  education: [],
  languages: [],
  skills: [],
  certificates: [],
  drivingLicences: [],
  interests: [],
});

/** Stored JSON → CvData; invalid entries are dropped instead of failing the whole CV. */
export const readCv = (value: unknown): CvData => {
  const o = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Record<string, unknown>;
  const out = emptyCv();
  const s = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  out.headline = s(o.headline, 160);
  out.summary = s(o.summary, 1500);
  const list = <T>(v: unknown, schema: z.ZodType<T, z.ZodTypeDef, unknown>, max: number): T[] =>
    (Array.isArray(v) ? v : [])
      .map((x) => schema.safeParse(x))
      .filter((r): r is z.SafeParseSuccess<T> => r.success)
      .map((r) => r.data)
      .slice(0, max);
  out.experience = list(o.experience, experienceSchema, 20);
  out.education = list(o.education, educationSchema, 12);
  out.languages = list(o.languages, languageSchema, 12);
  out.skills = list(o.skills, text(80).min(1), 40);
  out.certificates = list(o.certificates, certificateSchema, 20);
  out.drivingLicences = list(o.drivingLicences, text(10).min(1), 16);
  out.interests = list(o.interests, text(80).min(1), 20);
  return out;
};

export const readTemplate = (v: unknown): CvTemplate => (v === 'europass' ? 'europass' : 'lebenslauf');

/** Rough completeness score 0..100 (the client computes the same for its live meter). */
export const cvCompleteness = (cv: CvData, profile: { birthDate?: Date | string | null; address?: string | null; phone?: string | null; nationality?: string | null }) => {
  const checks = [
    !!cv.headline,
    cv.summary.length >= 60,
    cv.experience.length > 0,
    cv.experience.some((e) => e.tasks.length > 0),
    cv.education.length > 0,
    cv.languages.length > 0,
    cv.skills.length >= 3,
    !!profile.birthDate,
    !!profile.address,
    !!profile.phone,
    !!profile.nationality,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
};
