import { useCallback } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/**
 * Admin cases list (pages/admin/CasesList.tsx): URL filters, their server params, the header counts and the
 * quick-view drawer param. Every filter lives in the URL, so saved filter tabs (saved views) and links keep it.
 */

/** Filter params of the cases list URL (sort / view are view options, `page` / `open` are transient). */
export const CASE_FILTER_KEYS = [
  'search',
  'status',
  'scope',
  'mine',
  'assignee',
  'overdue',
  'partner',
  'processing',
  'processingAssignee',
  'visaType',
  'dateBy',
  'from',
  'to',
  'appointment',
  'recognition',
  'pendingDocs',
] as const;
export type CaseFilterKey = (typeof CASE_FILTER_KEYS)[number];

/** Filters behind the "Daha çox" popover (their count shows on the button). */
export const MORE_FILTER_KEYS: CaseFilterKey[] = ['visaType', 'partner', 'processing', 'processingAssignee', 'appointment', 'recognition', 'overdue', 'pendingDocs'];

export const VISA_TYPES = ['WORK', 'AUSBILDUNG', 'WEITERBILDUNG', 'JOB_SEEKER', 'STUDY', 'FAMILY', 'TOURIST'] as const;

/** GET /admin/cases params of the current URL (the URL says `partner`, the server `partnerId`). */
export const serverParams = (params: URLSearchParams) => {
  const out: Record<string, string> = {};
  for (const k of CASE_FILTER_KEYS) {
    const v = params.get(k);
    if (!v) continue;
    if (k === 'partner') out.partnerId = v;
    else out[k] = v;
  }
  return out;
};

export const hasAnyFilter = (params: URLSearchParams) => CASE_FILTER_KEYS.some((k) => !!params.get(k));

// ─── Header counts ─────────────────────────────────────────────────────

export const SUMMARY_TILES = ['open', 'mine', 'unassigned', 'stuck', 'embassyWeek', 'recognitionOverdue'] as const;
export type SummaryTile = (typeof SUMMARY_TILES)[number];
export interface CasesSummary {
  tiles: Record<SummaryTile, { count: number; params: Record<string, string> }>;
}

export const summaryKey = ['admin-cases', 'summary'] as const;
/** GET /admin/cases/summary — under the ['admin-cases'] prefix, so every case change refreshes it too. */
export const useCasesSummary = () =>
  useQuery({
    queryKey: summaryKey,
    queryFn: async () => (await api.get<CasesSummary>('/admin/cases/summary')).data,
    staleTime: 60_000,
  });

// ─── Dates ─────────────────────────────────────────────────────────────

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export type DatePreset = 'today' | 'week' | 'd30' | 'month';
export const DATE_PRESETS: DatePreset[] = ['today', 'week', 'd30', 'month'];
/** from / to (YYYY-MM-DD, inclusive) of a quick date range. */
export const presetRange = (p: DatePreset, now = new Date()): { from: string; to: string } => {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (p === 'today') return { from: ymd(today), to: ymd(today) };
  if (p === 'week') {
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { from: ymd(monday), to: ymd(sunday) };
  }
  if (p === 'd30') {
    const start = new Date(today);
    start.setDate(today.getDate() - 29);
    return { from: ymd(start), to: ymd(today) };
  }
  return { from: ymd(new Date(today.getFullYear(), today.getMonth(), 1)), to: ymd(new Date(today.getFullYear(), today.getMonth() + 1, 0)) };
};

// ─── Quick-view drawer (?open=<id>) ────────────────────────────────────

/**
 * Row id shown in the side drawer, kept in the URL (?open=<id>): opening pushes a history entry, so the
 * browser back button closes the drawer; moving to another row inside the drawer replaces it.
 */
export const useDrawerParam = (param = 'open') => {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const id = params.get(param);
  const pushed = !!(location.state as { drawer?: boolean } | null)?.drawer;

  const open = useCallback(
    (next: string) =>
      setParams(
        (prev) => {
          const n = new URLSearchParams(prev);
          n.set(param, next);
          return n;
        },
        // Replacing keeps whether this entry was pushed by us (a deep link to ?open= was not: closing must not leave the page).
        { replace: !!id, state: { drawer: id ? pushed : true } },
      ),
    [id, param, pushed, setParams],
  );
  const close = useCallback(() => {
    if (pushed) {
      navigate(-1);
      return;
    }
    setParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.delete(param);
        return n;
      },
      { replace: true },
    );
  }, [navigate, param, pushed, setParams]);
  return { id, open, close };
};
