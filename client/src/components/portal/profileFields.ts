import type { User } from '@/lib/types';

/** Must match server/src/routes/account.ts PROFILE_FIELDS (used for the completeness percent). */
export const PROFILE_FIELDS = [
  'phone',
  'birthDate',
  'nationality',
  'city',
  'address',
  'profession',
  'experienceYears',
  'germanLevel',
  'education',
  'about',
] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];

export type ProfileTab = 'personal' | 'professional' | 'notifications' | 'security' | 'privacy';
export const PROFILE_TABS: ProfileTab[] = ['personal', 'professional', 'notifications', 'security', 'privacy'];

/** Which profile tab holds each completeness field. */
export const FIELD_TAB: Record<ProfileField, ProfileTab> = {
  phone: 'personal',
  birthDate: 'personal',
  nationality: 'personal',
  city: 'personal',
  address: 'personal',
  profession: 'professional',
  experienceYears: 'professional',
  germanLevel: 'professional',
  education: 'professional',
  about: 'professional',
};

export const GERMAN_LEVELS = ['none', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export const EDUCATION_LEVELS = ['school', 'vocational', 'university'] as const;
export const LICENCE_CLASSES = ['B', 'BE', 'C1', 'C', 'CE', 'D'] as const;

/** Same limits as the server (PATCH /api/auth/me). */
export const LIMITS = {
  name: 80,
  phone: 40,
  nationality: 80,
  city: 80,
  address: 300,
  profession: 120,
  drivingLicence: 60,
  about: 2000,
  experienceMax: 50,
  minAge: 16,
  maxAge: 70,
} as const;

export const profileCompleteness = (u: User | null | undefined) => {
  if (!u) return { percent: 0, missing: [...PROFILE_FIELDS] };
  const missing = PROFILE_FIELDS.filter((f) => {
    const v = u[f];
    return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
  });
  return { percent: Math.round(((PROFILE_FIELDS.length - missing.length) / PROFILE_FIELDS.length) * 100), missing };
};

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** Whole years between two UTC calendar dates. */
export const ageOn = (birth: Date, now = new Date()) => {
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const m = now.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birth.getUTCDate())) age--;
  return age;
};

/** min/max attributes for the date input (age 16–70). */
export const birthDateBounds = () => {
  const now = new Date();
  const max = new Date(Date.UTC(now.getUTCFullYear() - LIMITS.minAge, now.getUTCMonth(), now.getUTCDate()));
  const min = new Date(Date.UTC(now.getUTCFullYear() - LIMITS.maxAge - 1, now.getUTCMonth(), now.getUTCDate() + 1));
  return { min: ymd(min), max: ymd(max) };
};

/** i18n key under accountPage.profile.errors, or null when valid / empty. */
export const birthDateError = (v: string): 'birthFuture' | 'birthAge' | null => {
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'birthAge';
  const d = new Date(`${v}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return 'birthAge';
  if (d.getTime() >= Date.now()) return 'birthFuture';
  const age = ageOn(d);
  return age < LIMITS.minAge || age > LIMITS.maxAge ? 'birthAge' : null;
};

export const experienceError = (v: string) => {
  if (v.trim() === '') return false;
  const n = Number(v);
  return !Number.isInteger(n) || n < 0 || n > LIMITS.experienceMax;
};
