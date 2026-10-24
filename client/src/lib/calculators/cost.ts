import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CostCategory, CostEstimate } from '@/components/marketing/api';

/**
 * Cost calculator inputs → server estimate (GET /api/growth/cost-calculator/estimate). Shared by the full tool
 * (/cost-calculator) and the compact calculator embedded in guides. The amounts are computed on the server from
 * the admin-maintained fees; the client only builds the query.
 */

export interface CostChoices {
  adults: number;
  children: number;
  /** null = the category's default. */
  documents: number | null;
  apostilles: number | null;
  recognition: boolean | null;
  language: boolean | null;
}

export const DEFAULT_COST_CHOICES: CostChoices = { adults: 1, children: 0, documents: null, apostilles: null, recognition: null, language: null };

/** Effective values (category defaults filled in). */
export const resolveCostChoices = (category: CostCategory | null, c: CostChoices) => {
  const d = category?.defaults;
  return {
    documents: c.documents ?? d?.documents ?? 0,
    apostilles: c.apostilles ?? d?.apostilles ?? 0,
    recognition: c.recognition ?? d?.recognition ?? false,
    language: c.language ?? d?.language ?? false,
  };
};

/** The estimate request (also what "get an exact offer" submits), or null without a category. */
export const costInput = (category: CostCategory | null, c: CostChoices): Record<string, string | number> | null => {
  if (!category) return null;
  const r = resolveCostChoices(category, c);
  return { category: category.slug, adults: c.adults, children: c.children, documents: r.documents, apostilles: r.apostilles, recognition: r.recognition ? '1' : '0', language: r.language ? '1' : '0' };
};

/** Estimate for an input; keeps the previous result while the next one loads (no flicker while typing). */
export const useCostEstimate = (input: Record<string, string | number> | null) => {
  const query = input ? new URLSearchParams(Object.entries(input).map(([k, v]) => [k, String(v)])).toString() : null;
  return useQuery({
    queryKey: ['growth', 'cost-estimate', query],
    queryFn: async () => (await api.get<CostEstimate>(`/growth/cost-calculator/estimate?${query}`)).data,
    enabled: !!query,
    placeholderData: (prev) => prev,
    staleTime: 5 * 60 * 1000,
  });
};
