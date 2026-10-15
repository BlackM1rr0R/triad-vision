import type { L10n, L10nList } from '@/lib/types';

export const SECTORS = ['logistics', 'courier', 'industry', 'construction', 'hospitality', 'healthcare', 'agriculture', 'other'] as const;
export type Sector = (typeof SECTORS)[number];
export const EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'SEASONAL', 'AUSBILDUNG'] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export const GERMAN_LEVELS = ['none', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type GermanLevel = (typeof GERMAN_LEVELS)[number];
export const EDUCATION_LEVELS = ['school', 'vocational', 'university'] as const;

export type VacancyStatus = 'DRAFT' | 'PENDING' | 'OPEN' | 'CLOSED';
export type CompanyStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED';
export type ApplicationStatus = 'NEW' | 'SHORTLISTED' | 'PROPOSED' | 'INTERVIEW' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN';
export const APPLICATION_STATUSES: ApplicationStatus[] = ['NEW', 'SHORTLISTED', 'PROPOSED', 'INTERVIEW', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'];

/** Public vacancy (GET /api/vacancies, /api/vacancies/:slug). */
export interface PublicVacancy {
  id: string;
  slug: string;
  title: L10n;
  description: L10n;
  requirements: L10nList | null;
  benefits: L10nList | null;
  sector: Sector | null;
  city: string | null;
  profession: string | null;
  germanLevel: GermanLevel | null;
  minExperience: number | null;
  drivingLicence: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  positions: number;
  employmentType: EmploymentType;
  datePosted: string | null;
  validThrough: string | null;
  companyName: string | null;
  visaCategory: { slug: string; title: L10n; visaLabel: string } | null;
}

export interface VacancyList {
  items: PublicVacancy[];
  total: number;
  page: number;
  pageSize: number;
  facets: { sectors: { value: Sector; count: number }[]; cities: { value: string; count: number }[] };
}

export type GapCode = 'PROFESSION' | 'GERMAN' | 'EXPERIENCE' | 'LICENCE' | 'VISA_GERMAN' | 'VISA_EDUCATION';
export interface MatchGap {
  code: GapCode;
  required: string | number;
  actual: string | number | null;
}
export interface Match {
  score: number;
  gaps: MatchGap[];
}

/** Full vacancy row (company portal / admin). */
export interface VacancyRow extends Omit<PublicVacancy, 'datePosted' | 'validThrough' | 'companyName' | 'visaCategory'> {
  companyId: string | null;
  visaCategoryId: string | null;
  showCompany: boolean;
  status: VacancyStatus;
  publishedAt: string | null;
  closesAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Anonymised candidate profile as shown to employers. */
export interface AnonProfile {
  name: string;
  profession: string | null;
  experienceYears: number | null;
  germanLevel: string | null;
  education: string | null;
  drivingLicence: string | null;
  city: string | null;
}

export interface Company {
  id: string;
  name: string;
  legalForm: string | null;
  sector: Sector | null;
  city: string | null;
  address: string | null;
  vatId: string | null;
  website: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  status: CompanyStatus;
  note?: string | null;
  createdAt: string;
}

export const VACANCY_STATUS_TONE: Record<VacancyStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  PENDING: 'bg-amber-100 text-amber-800',
  OPEN: 'bg-emerald-100 text-emerald-800',
  CLOSED: 'bg-slate-200 text-slate-600',
};
export const COMPANY_STATUS_TONE: Record<CompanyStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  ACTIVE: 'bg-emerald-100 text-emerald-800',
  SUSPENDED: 'bg-red-100 text-red-700',
};
export const APPLICATION_STATUS_TONE: Record<ApplicationStatus, string> = {
  NEW: 'bg-brand-100 text-brand-700',
  SHORTLISTED: 'bg-sky-100 text-sky-800',
  PROPOSED: 'bg-violet-100 text-violet-800',
  INTERVIEW: 'bg-amber-100 text-amber-800',
  ACCEPTED: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-red-100 text-red-700',
  WITHDRAWN: 'bg-slate-200 text-slate-600',
};
