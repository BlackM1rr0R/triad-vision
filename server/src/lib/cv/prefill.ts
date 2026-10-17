import type { CvData } from './schema.js';
import { EDUCATION_LABEL, nativeLanguageFor } from './texts.js';
import { LANGUAGE_LEVELS } from './schema.js';

export interface PrefillProfile {
  profession: string | null;
  experienceYears: number | null;
  education: string | null;
  germanLevel: string | null;
  drivingLicence: string | null;
  about: string | null;
  nationality: string | null;
  city?: string | null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Fills only the sections that are still empty from the portal profile; nothing the client wrote is
 * overwritten. Returns the new data and the list of sections that were filled.
 */
export const prefillCv = (cv: CvData, p: PrefillProfile, now = new Date()): { data: CvData; filled: string[] } => {
  const data: CvData = structuredClone(cv);
  const filled: string[] = [];
  const profession = p.profession?.trim() ?? '';

  if (!data.headline && profession) {
    data.headline = profession.slice(0, 160);
    filled.push('headline');
  }
  if (!data.summary) {
    const about = p.about?.trim();
    const years = p.experienceYears ?? 0;
    const summary = about || (profession && years > 0 ? `${profession} mit ${years} Jahr${years === 1 ? '' : 'en'} Berufserfahrung.` : '');
    if (summary) {
      data.summary = summary.slice(0, 1500);
      filled.push('summary');
    }
  }
  if (!data.experience.length && profession && (p.experienceYears ?? 0) > 0) {
    const years = Math.min(p.experienceYears!, 60);
    data.experience.push({
      title: profession.slice(0, 120),
      employer: '',
      city: p.city?.trim().slice(0, 80) ?? '',
      country: '',
      from: `${now.getUTCFullYear() - years}-${pad(now.getUTCMonth() + 1)}`,
      to: null,
      tasks: [],
    });
    filled.push('experience');
  }
  if (!data.education.length && p.education && EDUCATION_LABEL.de[p.education]) {
    data.education.push({ degree: EDUCATION_LABEL.de[p.education], institution: '', city: '', country: '', from: null, to: null, field: profession.slice(0, 160) });
    filled.push('education');
  }
  if (!data.languages.length) {
    const native = nativeLanguageFor(p.nationality);
    if (native) data.languages.push({ language: native, level: 'native' });
    const level = (LANGUAGE_LEVELS as readonly string[]).includes(p.germanLevel ?? '') ? (p.germanLevel as CvData['languages'][number]['level']) : null;
    if (level) data.languages.push({ language: 'Deutsch', level });
    if (data.languages.length) filled.push('languages');
  } else if (!data.languages.some((l) => /^(deutsch|german|alman|немецкий)/i.test(l.language))) {
    const level = (LANGUAGE_LEVELS as readonly string[]).includes(p.germanLevel ?? '') ? (p.germanLevel as CvData['languages'][number]['level']) : null;
    if (level && data.languages.length < 12) {
      data.languages.push({ language: 'Deutsch', level });
      filled.push('languages');
    }
  }
  if (!data.drivingLicences.length && p.drivingLicence?.trim()) {
    const classes = [...new Set(p.drivingLicence.split(/[,;\s/]+/).map((c) => c.trim().toUpperCase()).filter((c) => c && c.length <= 10))].slice(0, 16);
    if (classes.length) {
      data.drivingLicences = classes;
      filled.push('drivingLicences');
    }
  }
  return { data, filled };
};
