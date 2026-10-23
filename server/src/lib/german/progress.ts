import type { GermanExamProvider, Locale, Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { notifyUser } from '../notifications.js';
import { LANGUAGE_CERT_KEYS, LEVEL_RANK } from '../journey/german.js';

/**
 * German language progress. Single source of truth for the CURRENT level is User.germanLevel
 * ('none' | A1 … C2, read by matching, vacancies, VIDEX and the case AI). It changes:
 *  - when the candidate confirms the self-test (journey routes),
 *  - when staff set it on the candidate's German panel,
 *  - automatically when staff ACCEPT a language certificate document (onLanguageCertAccepted, called
 *    from the document review) — never downwards, never from a family member's case.
 */

export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type Level = (typeof LEVELS)[number];
/** Stored values of User.germanLevel ('none' is shown as A0). */
export const PROFILE_LEVELS = ['none', ...LEVELS] as const;
export const MODULES = ['LESEN', 'HOEREN', 'SCHREIBEN', 'SPRECHEN'] as const;
export type ExamModule = (typeof MODULES)[number];
export const PROVIDERS: GermanExamProvider[] = ['GOETHE', 'TELC', 'OESD', 'TESTDAF', 'OTHER'];

/** Share of points a module needs (Goethe / ÖSD / telc: 60 %). TestDaF scores are TDN 3–5 (TDN 3 passes). */
export const PASS_SHARE = 0.6;

export const rank = (l: string | null | undefined) => LEVEL_RANK[l ?? 'none'] ?? 0;

export interface ModuleResult {
  score: number | null;
  max: number | null;
  passed: boolean | null;
}
export type ExamResults = Partial<Record<ExamModule, ModuleResult>>;

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export const parseResults = (v: Prisma.JsonValue | null | undefined): ExamResults => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const o = v as Record<string, unknown>;
  const out: ExamResults = {};
  for (const m of MODULES) {
    const r = o[m];
    if (!r || typeof r !== 'object') continue;
    const x = r as Record<string, unknown>;
    out[m] = { score: num(x.score), max: num(x.max), passed: typeof x.passed === 'boolean' ? x.passed : null };
  }
  return out;
};

/** A module passes when staff / the candidate said so, else by points (TestDaF: TDN ≥ 3). */
export const modulePassed = (provider: GermanExamProvider, r: ModuleResult): boolean | null => {
  if (r.passed !== null) return r.passed;
  if (r.score === null) return null;
  if (provider === 'TESTDAF') return r.score >= 3;
  if (r.max === null || r.max <= 0) return null;
  return r.score / r.max >= PASS_SHARE;
};

/** Normalised results (each module with its pass flag) and the overall result (null = not known yet). */
export const evaluateResults = (provider: GermanExamProvider, results: ExamResults, explicit?: boolean | null) => {
  const modules: ExamResults = {};
  for (const m of MODULES) {
    const r = results[m];
    if (!r || (r.score === null && r.passed === null)) continue;
    modules[m] = { ...r, passed: modulePassed(provider, r) };
  }
  const flags = Object.values(modules).map((r) => r!.passed);
  let passed: boolean | null = explicit ?? null;
  if (passed === null && flags.length) {
    if (flags.some((f) => f === false)) passed = false;
    else if (flags.length === MODULES.length && flags.every((f) => f === true)) passed = true;
  }
  return { modules, passed };
};

/** "Goethe-Zertifikat B1", "telc Deutsch A2" → B1 / A2 (first CEFR level in the text). */
export const levelFromText = (...texts: (string | null | undefined)[]): Level | null => {
  for (const t of texts) {
    const m = t?.toUpperCase().match(/(?:^|[^A-Z0-9])([ABC][12])(?![0-9])/);
    if (m) return m[1] as Level;
  }
  return null;
};

const aiFieldTexts = (checks: Prisma.JsonValue | null): string[] => {
  if (!checks || typeof checks !== 'object' || Array.isArray(checks)) return [];
  const ai = (checks as Record<string, unknown>).ai as Record<string, unknown> | undefined;
  if (!ai || typeof ai !== 'object') return [];
  const fields = (ai.fields ?? {}) as Record<string, unknown>;
  return [ai.documentType, ai.summary, ...Object.values(fields)].filter((v): v is string => typeof v === 'string');
};

// ─── Certificate accepted → profile level ─────────────────────────────

const TEXTS: Record<Locale, { title: string; body: (l: string) => string }> = {
  az: { title: 'Alman dili səviyyəniz yeniləndi', body: (l) => `Dil sertifikatınız qəbul edildi. Profilinizdəki səviyyə: ${l}.` },
  de: { title: 'Ihr Deutschniveau wurde aktualisiert', body: (l) => `Ihr Sprachzertifikat wurde akzeptiert. Niveau in Ihrem Profil: ${l}.` },
  en: { title: 'Your German level was updated', body: (l) => `Your language certificate was accepted. Level in your profile: ${l}.` },
  ru: { title: 'Ваш уровень немецкого обновлён', body: (l) => `Ваш языковой сертификат принят. Уровень в профиле: ${l}.` },
};

export interface CertResult {
  level: Level | null;
  updated: boolean;
  examId: string | null;
}

/**
 * Called after staff accepted a document. When it is a language certificate of a MAIN case, the level
 * comes from the linked exam (GermanExam.certificateDocumentId), else from the file name / the AI
 * recognition of the document. The profile level only goes up. Never throws.
 */
export const onLanguageCertAccepted = async (documentId: string, actorId: string | null): Promise<CertResult> => {
  const none: CertResult = { level: null, updated: false, examId: null };
  try {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true, status: true, originalName: true, checks: true, caseId: true, requirement: { select: { key: true, title: true } }, case: { select: { parentCaseId: true, clientId: true } } },
    });
    if (!doc || doc.status !== 'ACCEPTED' || doc.case.parentCaseId) return none;
    const exam = await prisma.germanExam.findFirst({ where: { certificateDocumentId: doc.id, userId: doc.case.clientId }, orderBy: { updatedAt: 'desc' } });
    const isCert = (doc.requirement?.key && LANGUAGE_CERT_KEYS.includes(doc.requirement.key)) || !!exam;
    if (!isCert) return none;
    if (exam && exam.passed === false) return { ...none, examId: exam.id };
    const examLevel = exam && (LEVELS as readonly string[]).includes(exam.level) ? (exam.level as Level) : null;
    const level = examLevel ?? levelFromText(doc.originalName, ...aiFieldTexts(doc.checks));
    if (exam && exam.passed === null) {
      // The accepted certificate proves the exam was passed.
      await prisma.germanExam.update({ where: { id: exam.id }, data: { passed: true, status: 'PASSED' } });
    }
    if (!level) return { ...none, examId: exam?.id ?? null };
    const user = await prisma.user.findUnique({ where: { id: doc.case.clientId }, select: { id: true, germanLevel: true, locale: true } });
    if (!user || rank(user.germanLevel) >= rank(level)) return { level, updated: false, examId: exam?.id ?? null };
    await prisma.user.update({ where: { id: user.id }, data: { germanLevel: level } });
    await prisma.caseEvent.create({
      data: { caseId: doc.caseId, type: 'GERMAN_LEVEL_UPDATED', note: `${user.germanLevel ?? 'none'} → ${level} (${doc.originalName})`.slice(0, 500), actorId, visibleToClient: false },
    });
    const t = TEXTS[user.locale] ?? TEXTS.az;
    await notifyUser(user.id, { type: 'GERMAN_LEVEL_UPDATED', title: t.title, body: t.body(level), link: '/account/german', caseId: doc.caseId, email: false });
    return { level, updated: true, examId: exam?.id ?? null };
  } catch (err) {
    console.error('[german] certificate hook failed', err);
    return none;
  }
};
