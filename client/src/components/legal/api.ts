import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { L10n } from '@/lib/types';

/** Versioned legal texts (server: routes/legal.ts, routes/admin/legal.ts). */
export const LEGAL_KINDS = ['TERMS', 'PRIVACY', 'COOKIES'] as const;
export type LegalKind = (typeof LEGAL_KINDS)[number];
export type LegalStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface LegalDoc {
  id: string | null;
  kind: LegalKind;
  version: string;
  title: L10n;
  body: L10n;
  changeSummary: L10n | null;
  requiresReacceptance: boolean;
  status: LegalStatus;
  publishedAt: string | null;
  effectiveAt: string | null;
}

export interface LegalVersionRow {
  id: string;
  version: string;
  title: L10n;
  status: LegalStatus;
  publishedAt: string | null;
  effectiveAt: string | null;
  changeSummary: L10n | null;
}

/** Public URL of a kind: /agb, /privacy, /cookies; archived versions under /legal/<kind>/<version>. */
export const LEGAL_PATH: Record<LegalKind, string> = { TERMS: '/agb', PRIVACY: '/privacy', COOKIES: '/cookies' };
export const versionPath = (kind: LegalKind, version: string) => `/legal/${kind.toLowerCase()}/${encodeURIComponent(version)}`;

/** Current text of a kind (`fallback`: nothing published yet, the built-in text is returned). */
export const useLegalDocument = (kind: LegalKind, enabled = true) =>
  useQuery({
    queryKey: ['legal', kind],
    queryFn: async () => (await api.get<{ document: LegalDoc; fallback: boolean }>(`/legal/${kind.toLowerCase()}`)).data,
    staleTime: 5 * 60_000,
    enabled,
  });

export const useLegalVersions = (kind: LegalKind) =>
  useQuery({
    queryKey: ['legal', kind, 'versions'],
    queryFn: async () => (await api.get<{ items: LegalVersionRow[] }>(`/legal/${kind.toLowerCase()}/versions`)).data.items,
    staleTime: 5 * 60_000,
  });

export const useLegalVersion = (kind: LegalKind, version: string | undefined) =>
  useQuery({
    queryKey: ['legal', kind, 'version', version],
    queryFn: async () => (await api.get<{ document: LegalDoc }>(`/legal/${kind.toLowerCase()}/versions/${encodeURIComponent(version!)}`)).data.document,
    enabled: !!version,
    retry: false,
  });

export interface PendingAcceptance {
  kind: LegalKind;
  id: string;
  version: string;
  title: L10n;
  changeSummary: L10n | null;
  effectiveAt: string | null;
  publishedAt: string | null;
}

export const PENDING_KEY = ['legal', 'pending'] as const;
