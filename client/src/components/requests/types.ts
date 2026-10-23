import type { L10n } from '@/lib/types';
import { STATUS_TONES, toneClasses } from '@/components/ui/status';
import type { AnonProfile, ApplicationStatus, GermanLevel, MatchGap } from '@/components/jobs/types';

export type RequestStatus = 'OPEN' | 'IN_PROGRESS' | 'FILLED' | 'CANCELLED';
export const REQUEST_STATUSES: RequestStatus[] = ['OPEN', 'IN_PROGRESS', 'FILLED', 'CANCELLED'];

export const REQUEST_STATUS_TONE: Record<RequestStatus, string> = toneClasses(STATUS_TONES.request);

export interface RequestProgress {
  proposed: number;
  interviewing: number;
  accepted: number;
  rejected: number;
  quantity: number;
}

/** Fields shared by the employer and staff views of a request. */
export interface RequestBase {
  id: string;
  title: string;
  profession: string;
  quantity: number;
  visaCategoryId: string | null;
  germanLevel: GermanLevel | null;
  drivingLicence: string | null;
  minExperience: number | null;
  city: string | null;
  startDate: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  notes: string | null;
  status: RequestStatus;
  vacancyId: string | null;
  createdAt: string;
  updatedAt: string;
  progress: RequestProgress | null | undefined;
}

export interface EmployerRequest extends RequestBase {
  visaCategory: { title: L10n; visaLabel: string } | null;
}

export interface EmployerRequestCandidate {
  id: string;
  status: ApplicationStatus;
  matchScore: number | null;
  companyNote: string | null;
  updatedAt: string;
  candidate: AnonProfile;
}

export type ReasonCode = 'PROFESSION_EXACT' | 'PROFESSION_RELATED' | 'GERMAN_OK' | 'LICENCE_OK' | 'EXPERIENCE_OK' | 'CITY' | 'VERIFIED' | 'ACTIVE_CASE';

export interface Suggestion {
  user: {
    id: string;
    firstName: string;
    lastName: string;
    city: string | null;
    profession: string | null;
    experienceYears: number | null;
    germanLevel: string | null;
    education: string | null;
    drivingLicence: string | null;
    emailVerifiedAt: string | null;
  };
  score: number;
  rank: number;
  reasons: ReasonCode[];
  gaps: MatchGap[];
  activeCase: { id: string; number: string; status: string } | null;
  application: { id: string; status: ApplicationStatus } | null;
}

/** Form values (strings for inputs; converted on submit). */
export interface RequestFormValues {
  title: string;
  profession: string;
  quantity: string;
  visaCategoryId: string;
  germanLevel: string;
  drivingLicence: string;
  minExperience: string;
  city: string;
  startDate: string;
  salaryMin: string;
  salaryMax: string;
  notes: string;
}

export const emptyForm = (): RequestFormValues => ({
  title: '',
  profession: '',
  quantity: '1',
  visaCategoryId: '',
  germanLevel: '',
  drivingLicence: '',
  minExperience: '',
  city: '',
  startDate: '',
  salaryMin: '',
  salaryMax: '',
  notes: '',
});

export const formFromRequest = (r: RequestBase): RequestFormValues => ({
  title: r.title,
  profession: r.profession,
  quantity: String(r.quantity),
  visaCategoryId: r.visaCategoryId ?? '',
  germanLevel: r.germanLevel ?? '',
  drivingLicence: r.drivingLicence ?? '',
  minExperience: r.minExperience == null ? '' : String(r.minExperience),
  city: r.city ?? '',
  startDate: r.startDate ? r.startDate.slice(0, 10) : '',
  salaryMin: r.salaryMin == null ? '' : String(r.salaryMin),
  salaryMax: r.salaryMax == null ? '' : String(r.salaryMax),
  notes: r.notes ?? '',
});

const num = (v: string) => (v.trim() === '' ? null : Number(v));

export const payloadFromForm = (f: RequestFormValues) => ({
  title: f.title.trim(),
  profession: f.profession.trim(),
  quantity: Number(f.quantity),
  visaCategoryId: f.visaCategoryId || null,
  germanLevel: f.germanLevel || null,
  drivingLicence: f.drivingLicence.trim() || null,
  minExperience: num(f.minExperience),
  city: f.city.trim() || null,
  startDate: f.startDate || null,
  salaryMin: num(f.salaryMin),
  salaryMax: num(f.salaryMax),
  notes: f.notes.trim() || null,
});
