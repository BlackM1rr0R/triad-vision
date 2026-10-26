import type { BadgeTone } from '@/components/ui/status';

/** Shapes of /api/admin/job-feeds (server routes/admin/jobFeeds.ts). */

export const CHANNELS = ['indeed', 'stepstone', 'generic', 'ba'] as const;
export type Channel = (typeof CHANNELS)[number];
export type ChannelStatus = 'PENDING' | 'PUBLISHED' | 'ERROR' | 'EXPIRED';
export const FEED_LANGUAGES = ['de', 'en', 'az', 'ru'] as const;

export const STATUS_TONE: Record<ChannelStatus, BadgeTone> = { PENDING: 'warning', PUBLISHED: 'success', ERROR: 'danger', EXPIRED: 'neutral' };

export interface Distribution {
  channels: Channel[];
  language: string;
  hideEmployer: boolean;
  employerLabel: string | null;
  applyUrl: string | null;
  occupationCode: string | null;
  baTitleCode: string | null;
  postalCode: string | null;
  weeklyHours: number | null;
  limited: boolean;
  limitedUntil: string | null;
  startDate: string | null;
}

export interface Occupation {
  code: string;
  de: string;
  az: string;
  en: string;
  verify?: boolean;
}

export interface VacancyDistributionView {
  vacancy: { id: string; slug: string; status: string; live: boolean; showCompany: boolean; companyName: string | null; city: string | null };
  distribution: Distribution;
  saved: boolean;
  suggestion: Occupation | null;
  states: { channel: Channel; status: ChannelStatus; lastExportAt: string | null; error: string | null; updatedAt: string }[];
  check: Record<Channel, string[]>;
  applyUrls: Record<Channel, string>;
}

export interface BaView {
  supplierId: string | null;
  partnerId: string | null;
  uploadUrl: string | null;
  hasCertificate: boolean;
  hasPassphrase: boolean;
  uploadEnabled: boolean;
  ready: boolean;
  missing: string[];
  lastUploadAt: string | null;
  lastError: string | null;
  uncertainFields: string[];
}

export interface FeedsOverview {
  feeds: Record<'indeed' | 'stepstone' | 'generic', string> | null;
  tokenRotatedAt: string;
  tokenBroken: boolean;
  channels: Record<Channel, { enabled: number; counts: Partial<Record<ChannelStatus, number>>; lastBuild: { at: string; items: number } | null }>;
  errors: { channel: Channel; error: string | null; updatedAt: string; vacancy: { id: string; slug: string; title: Record<string, string>; status: string } }[];
  ba: BaView;
}
