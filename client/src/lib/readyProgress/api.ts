import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { READY_QUERY_KEY } from './sync';
import type { ReadyGroup } from './activities';

/** Shapes of /api/account/ready (server lib/readyProgress). */

export type ReadyLevel = 'BRONZE' | 'SILVER' | 'GOLD';

export interface ReadyActivityProgress {
  id: string;
  group: ReadyGroup;
  path: string;
  source: 'client' | 'server';
  points: number;
  earned: number;
  progress: number;
  done: boolean;
  best: number | null;
  itemsPassed: number | null;
  itemsRequired: number | null;
  attempts: number;
  lastAt: string | null;
}

export interface ReadyChallenge {
  key: string;
  activityIds: string[];
  item: string | null;
  week: string;
  endsAt: string;
  value: number;
  goal: number;
  done: boolean;
  completedTotal: number;
}

export interface ReadyCertificate {
  number: string;
  level: ReadyLevel;
  points: number;
  activities: number;
  issuedAt: string;
  levelAt: string;
  revoked: boolean;
  verifyUrl: string | null;
}

export interface ReadyOverview {
  activities: ReadyActivityProgress[];
  points: number;
  maxPoints: number;
  done: number;
  level: ReadyLevel | null;
  next: { level: ReadyLevel; points: number; done: number } | null;
  suggestions: string[];
  readinessScore: number;
  wordsLearned: number;
  professionScene: string | null;
  challenge: ReadyChallenge;
  certificate: ReadyCertificate | null;
}

export type ReadySummary = Pick<ReadyOverview, 'points' | 'maxPoints' | 'done' | 'level' | 'next' | 'challenge' | 'certificate'>;

export const useReadyOverview = () =>
  useQuery({ queryKey: [READY_QUERY_KEY, 'overview'], queryFn: async () => (await api.get<ReadyOverview>('/account/ready')).data, staleTime: 30_000 });

export const useReadySummary = () =>
  useQuery({ queryKey: [READY_QUERY_KEY, 'summary'], queryFn: async () => (await api.get<ReadySummary>('/account/ready/summary')).data, staleTime: 60_000 });

/** Where to go for a challenge: the first activity's page (scene / module deep link where the game supports it). */
export const challengeHref = (c: Pick<ReadyChallenge, 'activityIds' | 'item'>, paths: Record<string, string>) => {
  const id = c.activityIds[0];
  const base = paths[id] ?? '/tools';
  if (id === 'german-simulator' && c.item) return `${base}?scene=${encodeURIComponent(c.item)}`;
  return base;
};
