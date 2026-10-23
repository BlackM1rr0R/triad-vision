import { registerCopy } from '@/i18n';
import { smoothScrollTo } from '@/lib/smoothScroll';
import { caseLayoutCopy } from './copy';

registerCopy(caseLayoutCopy);

/** Same string as CASE_SECTION_EVENT in components/caseNext/api (not imported: that module pulls in its copy bundle). */
export const CASE_SECTION_EVENT = 'tv:case-section';

/** Tabs of the admin case page (`?tab=`); `overview` is the default and has no param. */
export const CASE_TABS = ['overview', 'documents', 'communication', 'finance', 'history'] as const;
export type CaseTab = (typeof CASE_TABS)[number];

/**
 * Which tab holds a section anchor. Used by deep links (`/admin/cases/:id#case-data`, notifications),
 * the "Next step" card's scroll actions (server lib/caseNext: case-actions / -messages / -tasks / -onboarding / -data)
 * and buttons inside the page. Anchors not listed here are looked up in the DOM as they are.
 */
export const SECTION_TAB: Record<string, CaseTab | null> = {
  // Always visible (sticky header / next-step strip): no tab switch.
  'case-next-step': null,
  'case-ball': null,
  'case-ball-details': 'overview',
  // Ümumi
  'case-actions': 'overview',
  'case-workflow': 'overview',
  'case-stats': 'overview',
  'case-onboarding': 'overview',
  'case-data': 'overview',
  'case-forms': 'overview', // forms are part of the client-data panel
  'case-family': 'overview',
  'case-german': 'overview',
  'case-ai': 'overview',
  'case-ai-summary': 'overview',
  // Sənədlər
  'case-documents': 'documents',
  'case-docs-initial': 'documents',
  'case-docs-embassy': 'documents',
  'docs-initial': 'documents',
  'docs-embassy': 'documents',
  'case-contract': 'documents',
  'case-signatures': 'documents',
  'case-embassy-package': 'documents',
  'case-files': 'documents',
  'case-originals': 'documents',
  // Ünsiyyət
  'case-messages': 'communication',
  messages: 'communication',
  'case-calls': 'communication',
  'client-tasks': 'communication',
  'case-client-tasks': 'communication',
  'case-tasks': 'communication',
  'case-notes': 'communication',
  // Maliyyə
  'case-profit': 'finance',
  'case-time': 'finance',
  'case-finance-links': 'finance',
  // Tarixçə
  'case-timeline': 'history',
  'case-history': 'history',
  'case-access': 'history',
};

/** Anchors that are aliases of another element id. */
const SECTION_ALIAS: Record<string, string> = { 'case-forms': 'case-data', messages: 'case-messages', 'case-client-tasks': 'client-tasks', 'docs-initial': 'case-docs-initial', 'docs-embassy': 'case-docs-embassy' };

export const sectionElementId = (section: string) => SECTION_ALIAS[section] ?? section;

/** Asks the case page to open a section (switches tab, then scrolls). Returns false when no case page handled it. */
export const goToCaseSection = (section: string) => !window.dispatchEvent(new CustomEvent(CASE_SECTION_EVENT, { detail: section, cancelable: true }));

const visible = (el: HTMLElement) => el.getClientRects().length > 0;

/** Height of everything sticky above the content (admin top bar, case header, tab bar on desktop), read from the elements. */
const stickyOffset = () => {
  for (const id of ['case-tabbar', 'case-topbar']) {
    const el = document.getElementById(id);
    if (!el) continue;
    const css = getComputedStyle(el);
    if (css.position !== 'sticky') continue;
    return (parseFloat(css.top) || 0) + el.offsetHeight + 12;
  }
  return 80;
};

const highlight = (el: HTMLElement) => {
  el.classList.add('ring-2', 'ring-brand-600/40', 'rounded-xl');
  window.setTimeout(() => el.classList.remove('ring-2', 'ring-brand-600/40', 'rounded-xl'), 1600);
};

/**
 * Scrolls to a section once it exists and is visible (its tab chunk may still be loading). A second pass
 * corrects the position when panels above it finished loading in the meantime.
 */
export const scrollWhenReady = (section: string, opts: { focus?: string; timeoutMs?: number } = {}) => {
  const id = sectionElementId(section);
  const deadline = performance.now() + (opts.timeoutMs ?? 6000);
  let cancelled = false;
  const tick = () => {
    if (cancelled) return;
    const el = document.getElementById(id);
    if (!el || !visible(el)) {
      if (performance.now() < deadline) requestAnimationFrame(tick);
      return;
    }
    smoothScrollTo(el, { offset: -stickyOffset() });
    highlight(el);
    if (opts.focus) window.setTimeout(() => document.getElementById(opts.focus!)?.focus({ preventScroll: true }), 350);
    window.setTimeout(() => {
      if (cancelled) return;
      const drift = el.getBoundingClientRect().top - stickyOffset();
      if (Math.abs(drift) > 48) smoothScrollTo(el, { offset: -stickyOffset() });
    }, 900);
  };
  requestAnimationFrame(tick);
  return () => {
    cancelled = true;
  };
};
