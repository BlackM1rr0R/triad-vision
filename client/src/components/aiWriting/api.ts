import { useCallback } from 'react';
import { AxiosError } from 'axios';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { errorCode } from '@/lib/api';
import type { CvData } from '@/components/cv/types';

/** Shapes and helpers of /api/ai-writing (mirrors server/src/routes/aiWriting.ts). */

export interface LetterDraft {
  title: string;
  body: string;
  explanation: string;
  words: number;
  vacancyId?: string | null;
  company?: string | null;
  position?: string;
  city?: string | null;
  variant?: 'shorter' | 'formal' | 'personal';
}

export interface MatchGap {
  code: 'PROFESSION' | 'GERMAN' | 'EXPERIENCE' | 'LICENCE' | 'VISA_GERMAN' | 'VISA_EDUCATION' | 'RECOGNITION';
  required: string | number;
  actual: string | number | null;
}

export interface Recommendation {
  vacancy: { id: string; slug: string; title: string; city: string | null; company: string | null; salaryMin: number | null; salaryMax: number | null; germanLevel: string | null; visaLabel: string | null };
  score: number;
  met: ('PROFESSION' | 'GERMAN' | 'EXPERIENCE' | 'LICENCE' | 'VISA')[];
  gaps: MatchGap[];
  why: string | null;
}

export interface Recommendations {
  items: Recommendation[];
  tip: string | null;
  ai: boolean;
  generatedAt: string;
}

export type CvDraftResponse = { draft: CvData };

/** Toast with the translated AI error (limit message from the server when it sent one). */
export const useAiWritingError = () => {
  const { t, i18n } = useTranslation();
  return useCallback(
    (err: unknown) => {
      const code = errorCode(err);
      const serverMsg = err instanceof AxiosError ? (err.response?.data as { message?: string } | undefined)?.message : undefined;
      if (code === 'AI_LIMIT' && serverMsg) return void toast.error(serverMsg);
      const key = `aiw.errors.${code}`;
      toast.error(i18n.exists(key) ? t(key) : t('aiw.errors.AI_UNAVAILABLE'));
    },
    [t, i18n],
  );
};

const norm = (s: string) => s.trim().toLowerCase();

/** Adds AI entries to an existing CV: new jobs / education appended, lists merged, empty texts filled. */
export const mergeCv = (current: CvData, ai: CvData): CvData => {
  const expKey = (e: CvData['experience'][number]) => `${norm(e.title)}|${norm(e.employer)}|${e.from}`;
  const eduKey = (e: CvData['education'][number]) => `${norm(e.degree)}|${norm(e.institution)}`;
  const uniq = (xs: string[]) => {
    const seen = new Set<string>();
    return xs.filter((x) => (seen.has(norm(x)) ? false : (seen.add(norm(x)), true)));
  };
  const haveExp = new Set(current.experience.map(expKey));
  const haveEdu = new Set(current.education.map(eduKey));
  const haveLang = new Set(current.languages.map((l) => norm(l.language)));
  return {
    headline: current.headline || ai.headline,
    summary: current.summary || ai.summary,
    experience: [...current.experience, ...ai.experience.filter((e) => !haveExp.has(expKey(e)))].slice(0, 20),
    education: [...current.education, ...ai.education.filter((e) => !haveEdu.has(eduKey(e)))].slice(0, 12),
    languages: [...current.languages, ...ai.languages.filter((l) => !haveLang.has(norm(l.language)))].slice(0, 12),
    skills: uniq([...current.skills, ...ai.skills]).slice(0, 40),
    certificates: [...current.certificates, ...ai.certificates.filter((c) => !current.certificates.some((x) => norm(x.name) === norm(c.name)))].slice(0, 20),
    drivingLicences: uniq([...current.drivingLicences, ...ai.drivingLicences]).slice(0, 16),
    interests: uniq([...current.interests, ...ai.interests]).slice(0, 20),
  };
};
