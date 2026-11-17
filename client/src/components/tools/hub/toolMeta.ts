import { useQuery } from '@tanstack/react-query';
import { GraduationCap, MessageSquareQuote, type LucideIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { TOOLS, type ToolItem } from '@/components/audience/tools';
import { normalize } from '@/components/search/searchUtils';

/**
 * Tools hub metadata: tags (filter chips on /tools), the featured "most useful" row (admin-ordered, GET
 * /api/tools/featured; server lib/featuredTools.ts) and the instant filter. The tool list itself is
 * components/audience/tools.ts; titles and texts come from toolsPage.items.<key> (pagesAudience, pagesToolsHub).
 */

export const TOOL_TAGS = ['calculator', 'check', 'planner', 'practice', 'explainer'] as const;
export type ToolTag = (typeof TOOL_TAGS)[number];

/** Tags per tool key. A tool not listed here has no tag (it still shows in its group and the filter). */
const TAGS: Record<string, ToolTag[]> = {
  pathFinder: ['check'],
  quiz: ['check'],
  visaCheck: ['check'],
  compare: ['explainer'],
  blueCard: ['calculator', 'check'],
  chancenkarte: ['calculator', 'check'],
  anerkennung: ['explainer', 'planner'],
  familyCheck: ['check'],
  countryCompare: ['explainer'],
  visaChecklist: ['planner', 'check'],
  visaRefusal: ['explainer'],
  gradeConverter: ['calculator'],
  salary: ['calculator'],
  cost: ['calculator'],
  budget: ['calculator', 'planner'],
  life: ['calculator'],
  payslip: ['explainer'],
  taxRefund: ['calculator'],
  shiftPay: ['calculator'],
  taxClass: ['calculator', 'check'],
  employerCost: ['calculator'],
  rentCheck: ['check', 'calculator'],
  realSalaries: ['explainer'],
  healthInsurance: ['calculator', 'explainer'],
  whenInGermany: ['planner', 'calculator'],
  permanentResidence: ['check', 'planner'],
  whichCity: ['check', 'planner'],
  drivingLicence: ['check', 'explainer'],
  germanApartment: ['practice', 'explainer'],
  residenceCard: ['explainer'],
  startDate: ['calculator', 'planner'],
  cities: ['explainer'],
  holidayPlanner: ['planner'],
  weekendTrips: ['planner'],
  drivingTime: ['calculator', 'check'],
  workSchedule: ['check'],
  emergencyWallpaper: ['planner'],
  events: ['planner'],
  status: ['check'],
  map: ['explainer'],
  azInGermany: ['explainer'],
  guides: ['explainer'],
  glossary: ['explainer'],
  shortageBarometer: ['explainer'],
  jobs: ['explainer'],
  visas: ['explainer'],
  mockExam: ['practice'],
  levelSelf: ['check', 'practice'],
  simulator: ['practice'],
  pronunciation: ['practice'],
  priceGame: ['practice'],
  trafficSigns: ['practice'],
  wasteSorting: ['practice'],
  workScenes: ['practice'],
  employerGuide: ['explainer'],
  candidateCatalogue: ['explainer'],
};

export const tagsOf = (key: string): ToolTag[] => TAGS[key] ?? [];

/** A tool card's data: hub tools plus a few tool pages that are not cards of their own (exam levels …). */
export interface HubTool {
  key: string;
  to: string;
  icon: LucideIcon;
  /** i18n keys of the title and the one-line text. */
  titleKey: string;
  textKey: string;
}

const EXTRA: HubTool[] = [
  { key: 'mockExamA1', to: '/german-mock-exam/a1', icon: GraduationCap, titleKey: 'toolsHub.extra.mockExamA1.title', textKey: 'toolsHub.extra.mockExamA1.text' },
  { key: 'mockExamB1', to: '/german-mock-exam/b1', icon: GraduationCap, titleKey: 'toolsHub.extra.mockExamB1.title', textKey: 'toolsHub.extra.mockExamB1.text' },
  { key: 'phraseOfDay', to: '/phrase-of-the-day', icon: MessageSquareQuote, titleKey: 'toolsHub.extra.phraseOfDay.title', textKey: 'toolsHub.extra.phraseOfDay.text' },
];

export const hubTool = (t: ToolItem): HubTool => ({ key: t.key, to: t.to, icon: t.icon, titleKey: `toolsPage.items.${t.key}.title`, textKey: `toolsPage.items.${t.key}.text` });

/** The card of a tool path, or null for a path the client does not know (skipped). */
export const toolByPath = (path: string): HubTool | null => {
  const item = TOOLS.find((x) => x.to === path);
  return item ? hubTool(item) : (EXTRA.find((x) => x.to === path) ?? null);
};

/** Mirrors server lib/featuredTools.ts DEFAULT_FEATURED_TOOLS (shown until the request answers or when it fails). */
export const DEFAULT_FEATURED = ['/salary-calculator', '/when-in-germany', '/blue-card-check', '/visa-document-checklist', '/health-insurance-comparison', '/german-mock-exam/a1'];

export interface FeaturedResponse {
  paths: string[];
  custom: boolean;
}

export const FEATURED_QUERY_KEY = ['tools-featured'] as const;

export const fetchFeatured = async () => (await api.get<FeaturedResponse>('/tools/featured')).data;

/** The featured tools as cards (admin order; unknown paths skipped). Rendered on the server too (SSR_QUERY_KEYS). */
export const useFeaturedTools = (enabled = true): HubTool[] => {
  const { data } = useQuery({ queryKey: FEATURED_QUERY_KEY, queryFn: fetchFeatured, enabled, staleTime: 5 * 60_000 });
  return (data?.paths ?? DEFAULT_FEATURED).map(toolByPath).filter((x): x is HubTool => !!x);
};

// ─── Instant filter ─────────────────────────────────────────────────────

/** Searchable text of a tool: its title, text, tag and group labels (already translated) plus its path words. */
export const toolHaystack = (parts: string[], path: string) => normalize(`${parts.join(' ')} ${path.replace(/[/-]/g, ' ')}`);

/**
 * Whether a tool's haystack matches a filter query: every query word must start a word of the haystack, or
 * (from 4 letters) appear inside one ("rechner" finds "Gehaltsrechner"). Diacritics are folded (ə, ş, ü, ß …).
 */
export const matchesFilter = (haystack: string, query: string) => {
  const words = normalize(query).split(' ').filter(Boolean);
  if (!words.length) return true;
  const hayWords = haystack.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return words.every((w) => hayWords.some((h) => h.startsWith(w) || (w.length >= 4 && h.includes(w))));
};
