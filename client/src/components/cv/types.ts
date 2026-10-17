// Shapes of /api/cv (mirrors server/src/lib/cv/schema.ts).

export const CV_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'native'] as const;
export type CvLevel = (typeof CV_LEVELS)[number];
export type CvTemplate = 'lebenslauf' | 'europass';
export type CvLang = 'de' | 'en';

export interface CvExperience {
  title: string;
  employer: string;
  city: string;
  country: string;
  from: string;
  to: string | null;
  tasks: string[];
}
export interface CvEducation {
  degree: string;
  institution: string;
  city: string;
  country: string;
  from: string | null;
  to: string | null;
  field: string;
}
export interface CvLanguage {
  language: string;
  level: CvLevel;
}
export interface CvCertificate {
  name: string;
  issuer: string;
  year: number | null;
}
export interface CvData {
  headline: string;
  summary: string;
  experience: CvExperience[];
  education: CvEducation[];
  languages: CvLanguage[];
  skills: string[];
  certificates: CvCertificate[];
  drivingLicences: string[];
  interests: string[];
}
export interface CvState {
  data: CvData;
  template: CvTemplate;
  shareWithEmployers: boolean;
  updatedAt: string;
}
export interface CvProfile {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  birthDate: string | null;
  nationality: string | null;
  city: string | null;
  address: string | null;
  profession: string | null;
  experienceYears: number | null;
  germanLevel: string | null;
  education: string | null;
  drivingLicence: string | null;
  about: string | null;
}

/** Limits of the server schema (kept in one place for maxLength / list caps). */
export const CV_MAX = {
  headline: 160,
  summary: 1500,
  title: 120,
  org: 160,
  place: 80,
  task: 300,
  tasks: 12,
  experience: 20,
  education: 12,
  languages: 12,
  language: 60,
  skills: 40,
  skill: 80,
  certificates: 20,
  licences: 16,
  licence: 10,
  interests: 20,
} as const;

export const MONTH_RE = /^(19[5-9]\d|20\d\d)-(0[1-9]|1[0-2])$/;

export const emptyExperience = (): CvExperience => ({ title: '', employer: '', city: '', country: '', from: '', to: null, tasks: [] });
export const emptyEducation = (): CvEducation => ({ degree: '', institution: '', city: '', country: '', from: null, to: null, field: '' });

export const experienceComplete = (e: CvExperience) => !!e.title.trim() && MONTH_RE.test(e.from) && (!e.to || (MONTH_RE.test(e.to) && e.to >= e.from));
export const educationComplete = (e: CvEducation) => !!e.degree.trim() && (!e.from || !e.to || e.to >= e.from);

/** What the server accepts: incomplete entries stay in the editor but are not sent. */
export const toPayload = (d: CvData): CvData => ({
  headline: d.headline.trim(),
  summary: d.summary.trim(),
  experience: d.experience.filter(experienceComplete).map((e) => ({ ...e, tasks: e.tasks.map((t) => t.trim()).filter(Boolean) })),
  education: d.education.filter(educationComplete),
  languages: d.languages.filter((l) => l.language.trim()),
  skills: d.skills.map((s) => s.trim()).filter(Boolean),
  certificates: d.certificates.filter((c) => c.name.trim()),
  drivingLicences: d.drivingLicences.map((s) => s.trim()).filter(Boolean),
  interests: d.interests.map((s) => s.trim()).filter(Boolean),
});

/** Same score as the server (cvCompleteness). */
export const completeness = (cv: CvData, p: Pick<CvProfile, 'birthDate' | 'address' | 'phone' | 'nationality'> | undefined) => {
  const checks = [
    !!cv.headline.trim(),
    cv.summary.trim().length >= 60,
    cv.experience.some(experienceComplete),
    cv.experience.some((e) => experienceComplete(e) && e.tasks.some((x) => x.trim())),
    cv.education.some(educationComplete),
    cv.languages.some((l) => l.language.trim()),
    cv.skills.filter((s) => s.trim()).length >= 3,
    !!p?.birthDate,
    !!p?.address,
    !!p?.phone,
    !!p?.nationality,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
};

/** Triggers a browser download of an authenticated API file; throws the axios error on failure. */
export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** File name from Content-Disposition (filename* preferred). */
export const filenameFrom = (header: string | undefined, fallback: string) => {
  if (!header) return fallback;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      /* fall through */
    }
  }
  return /filename="([^"]+)"/i.exec(header)?.[1] ?? fallback;
};
