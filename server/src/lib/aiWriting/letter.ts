import { z } from 'zod';
import type { Locale } from '@prisma/client';
import type { CvData } from '../cv/schema.js';
import type { CvProfile } from '../cv/load.js';
import { LANG_NAMES, clip, str } from './common.js';

/**
 * AI cover letter (Anschreiben): German, DIN-5008-like structure, 250–350 words, B1–B2 friendly and
 * specific to the job, plus a short explanation in the client's language so they understand it.
 * Only drafts — the client saves through the existing letters API after reading it.
 */

export const EXPLAIN_LANGS = ['az', 'ru', 'en', 'de'] as const;

export const letterDraftSchema = z
  .object({
    vacancyId: z.string().trim().max(40).optional(),
    company: z.string().trim().max(160).optional(),
    position: z.string().trim().max(160).optional(),
    city: z.string().trim().max(80).optional(),
    notes: z.string().trim().max(1200).optional(),
    explainLang: z.enum(EXPLAIN_LANGS).optional(),
  })
  .strict()
  .refine((b) => !!b.vacancyId || !!b.position, { message: 'POSITION_REQUIRED', path: ['position'] });

export const LETTER_VARIANTS = ['shorter', 'formal', 'personal'] as const;
export type LetterVariant = (typeof LETTER_VARIANTS)[number];

export const letterRewriteSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    body: z.string().trim().min(20).max(6000),
    variant: z.enum(LETTER_VARIANTS),
    explainLang: z.enum(EXPLAIN_LANGS).optional(),
  })
  .strict();

const OUTPUT = (lang: Locale) =>
  `Answer with ONE JSON object only: {"title":"Bewerbung als …","body":"…","explanation":"…"}.
"body" = the letter text only (no address block, no date, no subject line): "Sehr geehrte Damen und Herren," (or a named contact if given), 4–5 paragraphs separated by a blank line, then "Mit freundlichen Grüßen" and the candidate's full name on the line after an empty line.
"explanation" = 3–5 short sentences in ${LANG_NAMES[lang]} explaining what the letter says, so a candidate who does not read German understands it.`;

export const LETTER_SYSTEM = (lang: Locale) => `You write German cover letters (Anschreiben) for candidates from Azerbaijan applying to employers in Germany through the agency Triad Vision.
Rules:
- German, DIN 5008 style, 250–350 words, clear sentences a B1–B2 learner can read and explain in an interview. No exaggeration, no clichés like "hochmotiviert" in every paragraph.
- Specific to the job: refer to the position, the tasks and the company/city when known. Use only facts from the candidate data; never invent employers, years, certificates or German levels.
- Structure: why this position → relevant experience with 1–2 concrete examples → skills, German level and readiness to learn → availability / relocation → request for an interview (video is fine).
- The candidate's notes may be in any language; translate their meaning.
${OUTPUT(lang)}`;

export const REWRITE_SYSTEM = (lang: Locale, variant: LetterVariant) => `You revise a German cover letter (Anschreiben). Keep every fact; do not add new facts.
Change: ${
  variant === 'shorter'
    ? 'make it shorter — about 180–230 words, 3–4 paragraphs, keep the strongest points.'
    : variant === 'formal'
      ? 'make it more formal and businesslike (Sie-Form, neutral tone, precise wording), 250–350 words.'
      : 'make it more personal and warm (own motivation, concrete examples, still polite), 250–350 words.'
}
Keep B1–B2 friendly German and the same structure rules (salutation, paragraphs separated by blank lines, "Mit freundlichen Grüßen" and the name).
${OUTPUT(lang)}`;

export interface LetterJob {
  position: string;
  company?: string | null;
  city?: string | null;
  tasks?: string | null;
  requirements?: string | null;
}

export const letterPrompt = (job: LetterJob, profile: CvProfile, cv: CvData, notes?: string) => {
  const lines = [
    `Position: ${clip(job.position, 160)}`,
    job.company && `Company: ${clip(job.company, 160)}`,
    job.city && `City: ${clip(job.city, 80)}`,
    job.tasks && `Job description: ${clip(job.tasks, 900)}`,
    job.requirements && `Requirements: ${clip(job.requirements, 500)}`,
    '',
    `Candidate: ${profile.firstName} ${profile.lastName}`.trim(),
    profile.profession && `Profession: ${clip(profile.profession, 120)}`,
    profile.experienceYears != null && `Years of experience: ${profile.experienceYears}`,
    profile.germanLevel && `German level: ${profile.germanLevel}`,
    profile.drivingLicence && `Driving licence: ${clip(profile.drivingLicence, 40)}`,
    cv.headline && `CV headline: ${clip(cv.headline, 160)}`,
    ...cv.experience.slice(0, 4).map((e) => `Job: ${e.title}${e.employer ? `, ${e.employer}` : ''} (${e.from}–${e.to ?? 'heute'}): ${e.tasks.slice(0, 3).join('; ')}`.slice(0, 350)),
    ...cv.education.slice(0, 2).map((e) => `Education: ${e.degree}${e.institution ? `, ${e.institution}` : ''}`.slice(0, 200)),
    cv.languages.length ? `Languages: ${cv.languages.map((l) => `${l.language} ${l.level}`).join(', ')}` : null,
    cv.skills.length ? `Skills: ${cv.skills.slice(0, 8).join(', ')}` : null,
    notes && `Candidate's own notes: ${clip(notes, 1200)}`,
  ];
  return lines.filter((l): l is string => typeof l === 'string').join('\n');
};

export interface LetterDraft {
  title: string;
  body: string;
  explanation: string;
  words: number;
}

export const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Model JSON → draft; null when the letter is missing or obviously not a letter. */
export const toLetterDraft = (json: Record<string, unknown>, fallbackTitle: string): LetterDraft | null => {
  const body = str(json.body, 6000).replace(/\n{3,}/g, '\n\n');
  if (wordCount(body) < 40) return null;
  return { title: str(json.title, 200) || fallbackTitle.slice(0, 200), body, explanation: str(json.explanation, 1500), words: wordCount(body) };
};
