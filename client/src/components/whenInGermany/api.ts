import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** Types and hook of the "When could I be in Germany?" estimator (GET /api/when-in-germany/estimate; shapes of server/src/lib/whenInGermany). */

export const WHEN_PROFESSIONS = ['driver', 'care', 'construction', 'technical', 'hospitality', 'it', 'logistics', 'other', 'none'] as const;
export const WHEN_EDUCATIONS = ['school', 'vocational', 'university'] as const;
export const WHEN_GERMAN = ['none', 'A1', 'A2', 'B1', 'B2'] as const;
export const WHEN_DOCS = ['none', 'some', 'complete'] as const;
export const WHEN_RECOGNITION = ['unsure', 'yes', 'no'] as const;
export const WHEN_ROUTES = ['auto', 'skilled_18b', 'drivers_19c', 'ausbildung_16a', 'chancenkarte', 'study_16b', 'recognition_16d'] as const;
export const WHEN_STAGES = ['documents', 'language', 'recognition', 'contract', 'embassy', 'decision', 'travel'] as const;

export type WhenProfession = (typeof WHEN_PROFESSIONS)[number];
export type WhenRoute = (typeof WHEN_ROUTES)[number];
export type WhenStage = (typeof WHEN_STAGES)[number];

export interface WhenForm {
  profession: WhenProfession;
  education: (typeof WHEN_EDUCATIONS)[number];
  german: (typeof WHEN_GERMAN)[number];
  documents: (typeof WHEN_DOCS)[number];
  recognition: (typeof WHEN_RECOGNITION)[number];
  route: WhenRoute;
}

export const DEFAULT_WHEN: WhenForm = { profession: 'driver', education: 'vocational', german: 'none', documents: 'none', recognition: 'unsure', route: 'auto' };
export const WHEN_KEYS = Object.keys(DEFAULT_WHEN) as (keyof WhenForm)[];
const OPTIONS: { [K in keyof WhenForm]: readonly WhenForm[K][] } = {
  profession: WHEN_PROFESSIONS,
  education: WHEN_EDUCATIONS,
  german: WHEN_GERMAN,
  documents: WHEN_DOCS,
  recognition: WHEN_RECOGNITION,
  route: WHEN_ROUTES,
};

/** Form from the URL (share links, the path finder link); unknown values → defaults. */
export const whenFromParams = (p: URLSearchParams): WhenForm => {
  const f = { ...DEFAULT_WHEN } as Record<keyof WhenForm, string>;
  for (const k of WHEN_KEYS) {
    const v = p.get(k);
    if (v && (OPTIONS[k] as readonly string[]).includes(v)) f[k] = v;
  }
  return f as WhenForm;
};

/** Only the values that differ from the defaults (short share URLs; the bare URL is the default example). */
export const whenToQuery = (f: WhenForm) => {
  const p = new URLSearchParams();
  for (const k of WHEN_KEYS) if (f[k] !== DEFAULT_WHEN[k]) p.set(k, f[k]);
  return p.toString();
};

export interface Triple {
  min: number;
  typical: number;
  max: number;
}

export interface WhenStageResult {
  key: WhenStage;
  days: Triple;
  start: Triple;
  end: Triple;
  basis: 'history' | 'cefr' | 'estimate' | 'skipped';
  level: 'route_profession' | 'route' | 'all' | null;
  sample: number | null;
}

export interface WhenEstimate {
  input: WhenForm;
  route: Exclude<WhenRoute, 'auto'>;
  routeAuto: boolean;
  visaType: string;
  targetLevel: string;
  recognition: { needed: boolean; inferred: boolean };
  stages: WhenStageResult[];
  totalDays: Triple;
  arrival: { min: string; typical: string; max: string };
  today: string;
  visa: { slug: string; label: string } | null;
  minSample: number;
  computedAt: string;
}

export const useWhenEstimate = (query: string) =>
  useQuery({
    queryKey: ['when-estimate', query],
    queryFn: async () => (await api.get<WhenEstimate>(`/when-in-germany/estimate${query ? `?${query}` : ''}`)).data,
    placeholderData: (prev) => prev,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

/** Days → whole weeks below 13 weeks, months (30.44 days) from there; null for "under a week". */
export const durationUnit = (days: number): { unit: 'week' | 'month'; count: number } | null => {
  if (days < 4) return null;
  const weeks = Math.round(days / 7);
  if (weeks < 13) return { unit: 'week', count: Math.max(1, weeks) };
  return { unit: 'month', count: Math.round(days / 30.44) };
};
