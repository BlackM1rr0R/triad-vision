import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CaseStatus, L10n } from '@/lib/types';

/**
 * Staff power-user features (server routes/admin/staffUi.ts, bulk.ts, review.ts): saved views, table settings,
 * "what's new", bulk actions and the fast document review queue.
 */

export const VIEW_PAGES = ['cases', 'inquiries', 'candidates', 'vacancies', 'companies', 'clientInvoices'] as const;
export type ViewPage = (typeof VIEW_PAGES)[number];

/** Sidebar nav item and route of each list page (nav ids from components/command/navRegistry.ts). */
export const PAGE_ROUTE: Record<ViewPage, { navId: string; to: string }> = {
  cases: { navId: 'cases', to: '/admin/cases' },
  inquiries: { navId: 'inquiries', to: '/admin/inquiries' },
  candidates: { navId: 'candidates', to: '/admin/candidates' },
  vacancies: { navId: 'vacancies', to: '/admin/vacancies' },
  companies: { navId: 'companies', to: '/admin/companies' },
  clientInvoices: { navId: 'clientInvoices', to: '/admin/client-invoices' },
};

export interface TablePrefs {
  order?: string[];
  hidden?: string[];
  widths?: Record<string, number>;
  mode?: 'table' | 'list';
}

export interface SavedView {
  id: string;
  page: ViewPage;
  name: string;
  params: Record<string, string>;
  columns: TablePrefs | null;
  ownerId: string;
  ownerName?: string;
  shared: boolean;
  mine: boolean;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Saved views ────────────────────────────────────────────────────────

export const viewKeys = { all: ['staff-saved-views'] as const };

/** Every view the user can see (all pages; small, cached; the sidebar and each page filter it). */
export const useSavedViews = () =>
  useQuery({
    queryKey: viewKeys.all,
    queryFn: async () => (await api.get<{ views: SavedView[] }>('/admin/me/saved-views')).data.views,
    staleTime: 60_000,
  });

export const useSavedViewMutations = () => {
  const qc = useQueryClient();
  const done = () => void qc.invalidateQueries({ queryKey: viewKeys.all });
  return {
    create: useMutation({
      mutationFn: async (body: { page: ViewPage; name: string; params: Record<string, string>; columns?: TablePrefs | null; shared: boolean; pinned: boolean }) =>
        (await api.post<{ view: SavedView }>('/admin/me/saved-views', body)).data.view,
      onSuccess: done,
    }),
    update: useMutation({
      mutationFn: async ({ id, ...body }: { id: string; name?: string; params?: Record<string, string>; columns?: TablePrefs | null; shared?: boolean; pinned?: boolean }) =>
        (await api.patch<{ view: SavedView }>(`/admin/me/saved-views/${encodeURIComponent(id)}`, body)).data.view,
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => (await api.delete(`/admin/me/saved-views/${encodeURIComponent(id)}`)).data,
      onSuccess: done,
    }),
  };
};

// ─── What's new ─────────────────────────────────────────────────────────

export interface WhatsNewItem {
  id: string;
  date: string;
  tour?: string;
  custom: null | { title: L10n; body: L10n };
}
export interface WhatsNewFeed {
  items: WhatsNewItem[];
  unread: number;
  latest: string | null;
  seen: string | null;
}
export const whatsNewKey = ['staff-whats-new'] as const;

// ─── Bulk ───────────────────────────────────────────────────────────────

export const BULK_MAX = 500;
export interface BulkItemResult {
  id: string;
  ok: boolean;
  error?: string;
}
export interface BulkResponse {
  results: BulkItemResult[];
  ok: number;
  failed: number;
  previous?: { id: string; staffId?: string | null; status?: string }[];
}
export type CaseBulkAction = 'REQUEST_CHANGES' | 'CONFIRM_CONTRACT' | 'MARK_LODGED' | 'CANCEL' | 'REOPEN';

/** A selection sent to the server: explicit ids, or every row matching the list filters. */
export type BulkSelection = { ids: string[] } | { all: Record<string, string | undefined> };

export interface CaseResolve {
  ids: string[];
  total: number;
  capped: boolean;
  max: number;
  statuses: Partial<Record<CaseStatus, number>>;
  actions: CaseBulkAction[];
}

/** POST that downloads a CSV answer as a file. */
export const downloadCsv = async (url: string, body: unknown, fallbackName: string) => {
  const res = await api.post(url, body, { responseType: 'blob' });
  const disposition = String(res.headers['content-disposition'] ?? '');
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackName;
  const href = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
};

// ─── Review queue ───────────────────────────────────────────────────────

export type ChecklistState = 'MISSING' | 'PENDING' | 'ACCEPTED' | 'REJECTED';
export interface ReviewInsight {
  id: string;
  docType: string;
  confidence: number;
  fields: Record<string, string | undefined>;
  flags: string[];
  expiryDate: string | null;
  quality: { level: 'OK' | 'WARN' | 'BAD'; reasons: { code: string; level: 'WARN' | 'BAD'; params?: Record<string, string | number> }[] } | null;
  qualityLevel: 'OK' | 'WARN' | 'BAD' | null;
  status: string;
  proposals: { holder?: { found: string; expected: string }; requirement?: { id: string; title: Record<string, string> | null } };
}
export interface ReviewItem {
  id: string;
  caseId: string;
  stage: 'INITIAL' | 'EMBASSY';
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  expiresAt: string | null;
  checks: unknown;
  requirementId: string | null;
  requirement: { id: string; title: L10n; description: L10n | null; required: boolean } | null;
  case: {
    id: string;
    number: string;
    status: CaseStatus;
    visaType: string;
    profession: string;
    assignedStaffId: string | null;
    client: { id: string; firstName: string; lastName: string; email: string };
    visaCategory: { title: L10n; visaLabel: string } | null;
    partner: { id: string; name: string } | null;
    assignedStaff: { firstName: string; lastName: string } | null;
  };
  insight: ReviewInsight | null;
  checklist: { id: string; stage: string; title: L10n; required: boolean; state: ChecklistState }[];
}
export interface ReviewQueue {
  items: ReviewItem[];
  total: number;
  capped: boolean;
  counts: { all: number; mine: number };
  filters: { visaTypes: string[]; partners: { id: string; name: string }[] };
}
export interface ReviewFilters {
  scope: 'all' | 'mine';
  visaType?: string;
  partnerId?: string;
  caseId?: string;
}
export const reviewKey = (f: ReviewFilters) => ['staff-review-queue', f] as const;

export const useReviewQueue = (f: ReviewFilters) =>
  useQuery({
    queryKey: reviewKey(f),
    queryFn: async () =>
      (await api.get<ReviewQueue>('/admin/review/queue', { params: { scope: f.scope, visaType: f.visaType || undefined, partnerId: f.partnerId || undefined, caseId: f.caseId || undefined } }))
        .data,
    staleTime: 30_000,
  });
