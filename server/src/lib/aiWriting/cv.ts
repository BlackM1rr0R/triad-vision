import { z } from 'zod';
import { MONTH_RE, readCv, type CvData } from '../cv/schema.js';
import type { CvProfile } from '../cv/load.js';
import { clip } from './common.js';

/**
 * "AI ilə yaz" for the CV builder: a short wizard (target job, last jobs, education, languages and
 * licences, strengths) in any language → German CV entries in the builder's own shape (CvData).
 * The result is only a draft: the client reviews it and applies it to the builder; nothing is saved here.
 */

export const cvDraftSchema = z
  .object({
    target: z.string().trim().min(2).max(200),
    jobs: z.string().trim().max(3000).default(''),
    education: z.string().trim().max(1500).default(''),
    languages: z.string().trim().max(600).default(''),
    strengths: z.string().trim().max(800).default(''),
  })
  .strict();

export type CvDraftInput = z.infer<typeof cvDraftSchema>;

export const CV_SYSTEM = `You write German CVs (Lebenslauf) for candidates from Azerbaijan applying for jobs, vocational training or visas in Germany.
The candidate answers in any language (Azerbaijani, Russian, English, German). Write every CV text in German, Europass-like, B2 level, concise.
Rules:
- Use only facts the candidate gave (answers, profile, current CV). Never invent employers, dates, degrees or certificates. Unknown → leave the field empty.
- Job titles in German (e.g. "Berufskraftfahrer (LKW, Klasse CE)"). Tasks: 3–5 short bullet phrases starting with a verb or noun phrase ("Transport von Waren im internationalen Fernverkehr", "Durchführung der täglichen Fahrzeugkontrolle").
- Dates as "YYYY-MM" (only a year given → "YYYY-01"); a current job has "to": null. Most recent first.
- Countries and cities in German ("Aserbaidschan", "Baku").
- languages: level one of A1, A2, B1, B2, C1, C2, native. Mother tongue = "native".
- headline: the target position in German. summary: 2–3 sentences (max 400 characters) in the first person without "ich" at every start.
- skills: up to 8 short German terms. drivingLicences: EU classes only (e.g. "B", "C", "CE").
Answer with ONE JSON object only, no prose:
{"headline":"","summary":"","experience":[{"title":"","employer":"","city":"","country":"","from":"YYYY-MM","to":"YYYY-MM"|null,"tasks":[""]}],"education":[{"degree":"","institution":"","city":"","country":"","from":"YYYY-MM"|null,"to":"YYYY-MM"|null,"field":""}],"languages":[{"language":"","level":""}],"skills":[""],"certificates":[{"name":"","issuer":"","year":null}],"drivingLicences":[""],"interests":[]}`;

/** Compact prompt input: wizard answers, profile facts and the CV the client already has. */
export const cvPrompt = (input: CvDraftInput, profile: CvProfile, current: CvData) => {
  const lines = [
    `Target job / visa: ${clip(input.target, 200)}`,
    input.jobs && `Last jobs (years, duties): ${clip(input.jobs, 3000)}`,
    input.education && `Education: ${clip(input.education, 1500)}`,
    input.languages && `Languages and driving licences: ${clip(input.languages, 600)}`,
    input.strengths && `Strengths: ${clip(input.strengths, 800)}`,
    '',
    'Profile:',
    profile.profession && `- profession: ${clip(profile.profession, 120)}`,
    profile.experienceYears != null && `- years of experience: ${profile.experienceYears}`,
    profile.germanLevel && `- German level: ${profile.germanLevel}`,
    profile.education && `- education level: ${profile.education}`,
    profile.drivingLicence && `- driving licence: ${clip(profile.drivingLicence, 40)}`,
    profile.nationality && `- nationality: ${clip(profile.nationality, 60)}`,
    profile.about && `- about: ${clip(profile.about, 400)}`,
  ];
  const has = current.experience.length || current.education.length || current.languages.length;
  if (has) {
    lines.push('', 'Current CV entries (improve and keep their facts):');
    for (const e of current.experience.slice(0, 6)) lines.push(`- job: ${e.title}, ${e.employer}, ${e.from}–${e.to ?? 'now'}; ${e.tasks.slice(0, 4).join('; ')}`.slice(0, 400));
    for (const e of current.education.slice(0, 4)) lines.push(`- education: ${e.degree}, ${e.institution}, ${e.from ?? ''}–${e.to ?? ''}`.slice(0, 250));
    for (const l of current.languages.slice(0, 6)) lines.push(`- language: ${l.language} ${l.level}`);
  }
  return lines.filter((l): l is string => typeof l === 'string').join('\n');
};

/** "2019", "03.2019", "3/2019", "2019-3", "2019.03" → "2019-03"; "heute" / "now" / "" → null. */
export const normaliseMonth = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  if (MONTH_RE.test(s)) return s;
  let m = /^(\d{4})$/.exec(s);
  if (m) return MONTH_RE.test(`${m[1]}-01`) ? `${m[1]}-01` : null;
  m = /^(\d{1,2})[./-](\d{4})$/.exec(s);
  if (m) {
    const out = `${m[2]}-${m[1].padStart(2, '0')}`;
    return MONTH_RE.test(out) ? out : null;
  }
  m = /^(\d{4})[./-](\d{1,2})(?:[./-]\d{1,2})?$/.exec(s);
  if (m) {
    const out = `${m[1]}-${m[2].padStart(2, '0')}`;
    return MONTH_RE.test(out) ? out : null;
  }
  return null;
};

const LEVELS = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'native']);
const normLevel = (v: unknown) => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (/^(native|muttersprache|ana dili|родной)/i.test(s)) return 'native';
  const up = s.toUpperCase().slice(0, 2);
  return LEVELS.has(up) ? up : 'B1';
};

const arr = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]).filter((x) => x && typeof x === 'object') : []);
const s = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * Model JSON → valid CvData: dates normalised, over-long text cut, invalid entries dropped (readCv),
 * a "to" before "from" cleared instead of losing the job.
 */
export const toCvData = (json: Record<string, unknown>): CvData => {
  const experience = arr(json.experience).map((e) => {
    const from = normaliseMonth(e.from);
    let to = normaliseMonth(e.to);
    if (from && to && to < from) to = null;
    return {
      title: s(e.title, 120),
      employer: s(e.employer, 160),
      city: s(e.city, 80),
      country: s(e.country, 80),
      from: from ?? '',
      to,
      tasks: (Array.isArray(e.tasks) ? e.tasks : []).map((t) => s(t, 300)).filter(Boolean).slice(0, 12),
    };
  });
  const education = arr(json.education).map((e) => {
    const from = normaliseMonth(e.from);
    let to = normaliseMonth(e.to);
    if (from && to && to < from) to = null;
    return { degree: s(e.degree, 160), institution: s(e.institution, 160), city: s(e.city, 80), country: s(e.country, 80), from, to, field: s(e.field, 160) };
  });
  const languages = arr(json.languages).map((l) => ({ language: s(l.language, 60), level: normLevel(l.level) }));
  const certificates = arr(json.certificates).map((c) => ({
    name: s(c.name, 160),
    issuer: s(c.issuer, 160),
    year: typeof c.year === 'number' && c.year >= 1950 && c.year <= 2100 ? Math.round(c.year) : null,
  }));
  const list = (v: unknown, max: number) => (Array.isArray(v) ? v.map((x) => s(x, max)).filter(Boolean) : []);
  return readCv({
    headline: s(json.headline, 160),
    summary: s(json.summary, 1500),
    experience,
    education,
    languages,
    skills: [...new Set(list(json.skills, 80))].slice(0, 40),
    certificates,
    drivingLicences: [...new Set(list(json.drivingLicences, 10).map((x) => x.toUpperCase()))].slice(0, 16),
    interests: list(json.interests, 80).slice(0, 20),
  });
};
