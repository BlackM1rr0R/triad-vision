import type { CvData } from '../cv/schema.js';
import { EDUCATION_LABEL, byNewest } from '../cv/texts.js';
import { experienceYearsOf, yearsText } from '../cv/letters.js';
import { cleanPosition, detectJobType, germanLongDate, startText, type CoverJobType, type CoverValues } from './fill.js';

/**
 * Placeholder values of an Anschreiben (pure): the applicant (account profile, or the name / contact typed in
 * the apply form), the CV and the listing. Free text (profession, job titles …) is used as the client wrote it.
 */

export interface CoverPerson {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  profession?: string | null;
  experienceYears?: number | null;
  germanLevel?: string | null;
  education?: string | null;
  drivingLicence?: string | null;
}

export interface CoverListing {
  title?: string | null;
  company?: string | null;
  location?: string | null;
  jobType?: string | null;
  /** What the applicant typed in the apply form (wins over the profile). */
  profession?: string | null;
  experienceYears?: number | null;
  germanLevel?: string | null;
}

const LEVEL_DE: Record<string, string> = { native: 'Muttersprache' };

/** "Aysel Məmmədova" → first / last name (the apply form has one name field). */
export const splitName = (full: string) => {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] ?? '', lastName: '' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
};

const germanLevelOf = (cv: CvData, person: CoverPerson, listing: CoverListing) => {
  const typed = listing.germanLevel && listing.germanLevel !== 'none' ? listing.germanLevel : null;
  const fromCv = cv.languages.find((l) => /^(deutsch|german|alman|немец)/i.test(l.language))?.level ?? null;
  const fromProfile = person.germanLevel && person.germanLevel !== 'none' ? person.germanLevel : null;
  const level = typed ?? fromCv ?? fromProfile;
  return level === 'native' ? 'Muttersprache' : (level ?? '');
};

export const buildCoverValues = (input: { person: CoverPerson; cv: CvData; listing: CoverListing; now?: Date }): CoverValues => {
  const { person, cv, listing } = input;
  const now = input.now ?? new Date();
  const typedYears = listing.experienceYears ?? null;
  const years = typedYears ?? experienceYearsOf({ person: { ...person, experienceYears: person.experienceYears ?? null }, cv }, now);
  const job = byNewest(cv.experience)[0] ?? null;
  const edu = byNewest(cv.education, false)[0] ?? null;
  const degree = edu?.degree || (person.education ? (EDUCATION_LABEL.de[person.education] ?? '') : '');
  const address = [person.address?.replace(/\s*\n\s*/g, ', ').trim(), person.address && person.city && !person.address.includes(person.city) ? person.city : !person.address ? person.city : '']
    .filter(Boolean)
    .join(', ');
  const licences = cv.drivingLicences.length ? cv.drivingLicences.join(', ') : (person.drivingLicence ?? '');
  const profession = listing.profession?.trim() || person.profession?.trim() || cv.headline.trim() || job?.title || '';
  return {
    firma: listing.company?.trim() || '',
    position: cleanPosition(listing.title) || profession,
    ort: listing.location?.trim() || '',
    datum: germanLongDate(now),
    name: `${person.firstName} ${person.lastName}`.trim(),
    vorname: person.firstName.trim(),
    nachname: person.lastName.trim(),
    anschrift: address,
    telefon: person.phone ?? '',
    email: person.email ?? '',
    beruf: profession,
    berufserfahrung: years > 0 ? yearsText(years, 'de') : '',
    jahre: years > 0 ? String(years) : '',
    deutschniveau: germanLevelOf(cv, person, listing),
    eintritt: startText(cv.availableFrom, now),
    fuehrerschein: licences,
    letzte_taetigkeit: job ? `${job.title}${job.employer ? ` bei ${job.employer}` : ''}` : '',
    ausbildung: degree ? `${degree}${edu?.field ? ` (${edu.field})` : ''}` : '',
    kenntnisse: cv.skills.slice(0, 6).join(', '),
    sprachen: cv.languages.map((l) => `${l.language} (${LEVEL_DE[l.level] ?? l.level})`).join(', '),
  };
};

export const jobTypeOf = (listing: CoverListing): CoverJobType => detectJobType({ jobType: listing.jobType, title: listing.title, profession: listing.profession });
