import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { FamilyGroup, Forecast, GermanStatus, LanguageCourse, OnboardingResponse } from './types';

export const forecastKey = (caseId: string) => ['journey-forecast', caseId] as const;
export const familyKey = (caseId: string) => ['journey-family', caseId] as const;
export const ONBOARDING_KEY = ['journey-onboarding'] as const;
export const GERMAN_STATUS_KEY = ['journey-german-status'] as const;
export const GERMAN_COURSES_KEY = ['journey-german-courses'] as const;

export const useForecast = (caseId: string, enabled = true) =>
  useQuery({
    queryKey: forecastKey(caseId),
    queryFn: async () => (await api.get<{ forecast: Forecast }>(`/journey/cases/${caseId}/forecast`)).data.forecast,
    enabled: !!caseId && enabled,
    staleTime: 60_000,
  });

export const useFamilyGroup = (caseId: string, enabled = true) =>
  useQuery({
    queryKey: familyKey(caseId),
    queryFn: async () => (await api.get<FamilyGroup>(`/journey/cases/${caseId}/family`)).data,
    enabled: !!caseId && enabled,
    staleTime: 30_000,
  });

export const useOnboarding = (enabled = true) =>
  useQuery({
    queryKey: ONBOARDING_KEY,
    queryFn: async () => (await api.get<OnboardingResponse>('/journey/onboarding')).data,
    enabled,
    staleTime: 30_000,
  });

export const useGermanStatus = (enabled = true) =>
  useQuery({
    queryKey: GERMAN_STATUS_KEY,
    queryFn: async () => (await api.get<GermanStatus>('/journey/german/status')).data,
    enabled,
    staleTime: 30_000,
  });

export const useGermanCourses = (enabled = true) =>
  useQuery({
    queryKey: GERMAN_COURSES_KEY,
    queryFn: async () => (await api.get<{ items: LanguageCourse[] }>('/journey/german/courses')).data.items,
    enabled,
    staleTime: 5 * 60_000,
  });

/** Days from today to `iso` (negative when in the past), ignoring the time of day. */
export const daysUntil = (iso: string) => {
  const DAY = 24 * 60 * 60 * 1000;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / DAY);
};
