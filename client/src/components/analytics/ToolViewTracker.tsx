import { useLocation } from 'react-router-dom';
import { TOOLS } from '@/components/audience/tools';
import { toolSlugFromPath, useToolView } from '@/lib/toolAnalytics';

/**
 * Counts a page view for every public tool page (tool analytics, lib/toolAnalytics.ts) — mounted once in the site
 * layout, so tool pages need no code for views. Interactions are counted by the pages (trackToolUse) and by the
 * "e-mail me my result" block (components/tools/EmailResult.tsx).
 */
const EXTRA = ['german-mock-exam/a1', 'german-mock-exam/b1', 'work-scenes/restaurant-kitchen', 'work-scenes/truck-cab', 'work-scenes/hospital-ward', 'work-scenes/construction-site', 'work-scenes/electrical-panel'];
const NOT_TOOLS = new Set(['events', 'status', 'guides', 'glossary', 'jobs', 'visas']);

export const TOOL_SLUGS = new Set([...TOOLS.map((t) => t.to.replace(/^\//, '')), ...EXTRA].filter((s) => !NOT_TOOLS.has(s)));

export const isToolPath = (path: string) => TOOL_SLUGS.has(toolSlugFromPath(path));

export const ToolViewTracker = () => {
  const { pathname } = useLocation();
  const slug = toolSlugFromPath(pathname);
  useToolView(TOOL_SLUGS.has(slug) ? slug : '');
  return null;
};
