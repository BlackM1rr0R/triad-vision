import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CaseStatus } from '@/lib/types';

/** Shapes of the dashboard endpoints of /api/admin/analytics (server lib/bizAnalytics, lib/growth/placementsMap). */

export const HEAT_BUCKETS = ['d7', 'd14', 'd30', 'd60', 'd60plus'] as const;
export type HeatBucket = (typeof HEAT_BUCKETS)[number];
export type HeatStage = Exclude<CaseStatus, 'APPROVED' | 'REJECTED' | 'CANCELLED'>;

export interface StageHeatmap {
  buckets: { key: HeatBucket; from: number; to: number | null; stuck: boolean }[];
  rows: { stage: HeatStage; total: number; stuck: number; counts: Record<HeatBucket, number> }[];
  max: number;
  totalOpen: number;
  totalStuck: number;
  generatedAt: string;
}

export interface HeatCases {
  total: number;
  items: { id: string; number: string; client: string | null; status: CaseStatus; since: string; waitingDays: number }[];
}

export interface PlacementCity {
  cityKey: string;
  city: string;
  workers: number;
  professions: string[];
  lat: number | null;
  lng: number | null;
  source: 'computed' | 'manual' | 'mixed';
  computed: number;
  past: number;
}

export interface PlacementsResponse {
  cities: PlacementCity[];
  total: number;
  minPerCity: number;
}

export const useStageHeatmap = (visaCategoryId: string) =>
  useQuery({
    queryKey: ['admin-analytics', 'stage-heatmap', visaCategoryId],
    queryFn: async () => (await api.get<StageHeatmap>('/admin/analytics/stage-heatmap', { params: visaCategoryId ? { visaCategoryId } : {} })).data,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

export const useHeatCases = (sel: { stage: HeatStage; bucket: HeatBucket } | null, visaCategoryId: string) =>
  useQuery({
    queryKey: ['admin-analytics', 'stage-heatmap-cases', sel?.stage, sel?.bucket, visaCategoryId],
    queryFn: async () => (await api.get<HeatCases>('/admin/analytics/stage-heatmap/cases', { params: { ...sel, ...(visaCategoryId ? { visaCategoryId } : {}) } })).data,
    enabled: !!sel,
  });

export const usePlacements = () =>
  useQuery({ queryKey: ['admin-analytics', 'placements'], queryFn: async () => (await api.get<PlacementsResponse>('/admin/analytics/placements')).data, staleTime: 5 * 60_000, retry: false });
