import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { L10n } from '@/lib/types';

/** Client waiting room (server: routes/waitingRoom.ts, routes/admin/waitingRoom.ts). */
export const WR_KINDS = ['LESSON', 'VIDEO', 'EXERCISE', 'CHECKLIST'] as const;
export type WrKind = (typeof WR_KINDS)[number];
export const WR_TOPICS = ['life', 'work', 'language', 'bureaucracy', 'culture'] as const;
export type WrTopic = (typeof WR_TOPICS)[number];
export const WR_VISA_TYPES = ['WORK', 'AUSBILDUNG', 'WEITERBILDUNG', 'JOB_SEEKER', 'STUDY', 'FAMILY', 'TOURIST'] as const;
export type WrVisaType = (typeof WR_VISA_TYPES)[number];
export const WR_STAGES = [
  'DOCUMENTS_PENDING',
  'DOCUMENTS_REVIEW',
  'CONTRACT_SENT',
  'CONTRACT_SIGNED',
  'EMBASSY_DOCUMENTS',
  'EMBASSY_REVIEW',
  'APPOINTMENT_SCHEDULED',
  'DECISION_PENDING',
  'APPROVED',
] as const;
export type WrStage = (typeof WR_STAGES)[number];

export interface WrProgress {
  completedAt: string | null;
  score: number | null;
}
export interface WrStats {
  completed: number;
  total: number;
  points: number;
  streak: number;
  percent: number;
}
export interface WrItem {
  id: string;
  kind: WrKind;
  topic: WrTopic;
  title: L10n;
  body: L10n | null;
  videoUrl: string | null;
  minutes: number | null;
  exercise: { q: L10n; options: L10n[] }[] | null;
  progress: WrProgress | null;
}
export interface WrResponse {
  case: { id: string; visaType: string; status: string } | null;
  items: WrItem[];
  nextId: string | null;
  stats: WrStats;
}
export interface WrGraded {
  results: { correct: boolean; answer: number; chosen: number | null }[];
  right: number;
  total: number;
  score: number;
  best: number;
  progress: WrProgress;
  stats: WrStats;
}

export interface AdminWrItem {
  id: string;
  kind: WrKind;
  topic: WrTopic;
  title: L10n;
  body: L10n | null;
  videoUrl: string | null;
  exercise: { q: L10n; options: L10n[]; answer: number }[] | null;
  minutes: number | null;
  visaTypes: WrVisaType[] | null;
  stages: WrStage[] | null;
  sortOrder: number;
  published: boolean;
  completedCount: number;
}

export const WR_KEY = ['waiting-room'] as const;

export const useWaitingRoom = (enabled = true) =>
  useQuery({
    queryKey: WR_KEY,
    queryFn: async () => (await api.get<WrResponse>('/waiting-room')).data,
    staleTime: 60_000,
    enabled,
  });

/**
 * Embed URL for a YouTube (privacy-enhanced youtube-nocookie.com) or Vimeo (do-not-track) link; null for
 * anything else. Pure: kept free of React so it can be reused by the admin preview.
 */
export const videoEmbed = (url: string | null | undefined): { src: string; host: 'YouTube' | 'Vimeo' } | null => {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0] || null;
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = u.searchParams.get('v') ?? u.pathname.match(/^\/(?:embed|shorts|live)\/([^/?#]+)/)?.[1] ?? null;
  }
  if (id && /^[A-Za-z0-9_-]{6,20}$/.test(id)) return { src: `https://www.youtube-nocookie.com/embed/${id}?rel=0`, host: 'YouTube' };
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const vid = u.pathname.match(/(\d{6,12})/)?.[1];
    if (vid) return { src: `https://player.vimeo.com/video/${vid}?dnt=1`, host: 'Vimeo' };
  }
  return null;
};

/** "- [ ] item" lines of a checklist body (other lines are shown as text above the list). */
export const checklistOf = (md: string) => {
  const items: string[] = [];
  const rest: string[] = [];
  for (const line of md.replace(/\r\n?/g, '\n').split('\n')) {
    const m = line.match(/^\s*[-*]\s+\[[ xX]?\]\s+(.*)$/);
    if (m) items.push(m[1]);
    else rest.push(line);
  }
  return { items, intro: rest.join('\n').trim() };
};
