import {
  BadgeEuro,
  Building,
  CalendarClock,
  CalendarDays,
  Calculator,
  ClipboardCheck,
  CreditCard,
  GraduationCap,
  Map as MapIcon,
  MapPinned,
  BookOpen,
  Briefcase,
  Scale,
  ScanSearch,
  Sparkles,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';

/**
 * Every public tool of the site, in the groups of the /tools page. Also used by the worker landing page and
 * the header menus. Titles and descriptions: pagesAudience copy (toolsPage.items.<key>).
 * Mirrors TOOLS_GROUPS in server/src/lib/seoBody.ts (crawlable /tools body).
 */
export type ToolGroup = 'eligibility' | 'costs' | 'plan' | 'explore';

export interface ToolItem {
  key: string;
  to: string;
  icon: LucideIcon;
  group: ToolGroup;
}

export const TOOL_GROUPS: ToolGroup[] = ['eligibility', 'costs', 'plan', 'explore'];

export const TOOLS: ToolItem[] = [
  { key: 'quiz', to: '/uygunluq-testi', icon: Sparkles, group: 'eligibility' },
  { key: 'visaCheck', to: '/eligibility', icon: ClipboardCheck, group: 'eligibility' },
  { key: 'compare', to: '/compare-visas', icon: Scale, group: 'eligibility' },
  { key: 'blueCard', to: '/blue-card-check', icon: CreditCard, group: 'eligibility' },
  { key: 'chancenkarte', to: '/chancenkarte-calculator', icon: Calculator, group: 'eligibility' },
  { key: 'anerkennung', to: '/anerkennung', icon: GraduationCap, group: 'eligibility' },
  { key: 'salary', to: '/salary-calculator', icon: BadgeEuro, group: 'costs' },
  { key: 'cost', to: '/cost-calculator', icon: WalletCards, group: 'costs' },
  { key: 'startDate', to: '/calculator', icon: CalendarClock, group: 'plan' },
  { key: 'cities', to: '/cities', icon: Building, group: 'plan' },
  { key: 'events', to: '/events', icon: CalendarDays, group: 'plan' },
  { key: 'status', to: '/status', icon: ScanSearch, group: 'plan' },
  { key: 'map', to: '/map', icon: MapPinned, group: 'explore' },
  { key: 'guides', to: '/guides', icon: BookOpen, group: 'explore' },
  { key: 'jobs', to: '/jobs', icon: Briefcase, group: 'explore' },
  { key: 'visas', to: '/visas', icon: MapIcon, group: 'explore' },
];
