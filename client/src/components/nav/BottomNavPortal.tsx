import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SECTIONS, sectionOfLocation, subPath, type SectionKey } from '@/lib/portalStage';
import { usePortalNav } from '@/components/portal/usePortalNav';
import { SECTION_ICON, sectionLabel } from '@/components/portal/portalNavMeta';
import { registerCopy } from '@/i18n';
import { pagesPortalNav } from '@/i18n/pagesPortalNav';
import { BottomNav, type BottomNavItem } from './BottomNav';

registerCopy(pagesPortalNav);

// Pages with their own fixed action bar at the bottom (form submit, signing): no tab bar there.
const OWN_BAR = [/^\/account\/cases\/[^/]+\/(forms|confirm)/, /^\/account\/signatures\/[^/]+/];

/** Keys keep the old tour targets (bnav-docs, bnav-messages, bnav-profile). */
const KEY: Record<SectionKey, string> = { home: 'home', documents: 'docs', messages: 'messages', learn: 'learn', profile: 'profile' };

/** Client portal tab bar (phones): exactly the five sections — Home · Documents · Messages · Learn · Profile. */
export function BottomNavPortal() {
  const { t } = useTranslation();
  const { pathname, search } = useLocation();
  const nav = usePortalNav();
  const current = sectionOfLocation(pathname, search) ?? 'home';

  const items: BottomNavItem[] = SECTIONS.map((s) => ({
    key: KEY[s],
    label: sectionLabel(t, s),
    icon: SECTION_ICON[s],
    to: subPath(nav.subs[s][0] ?? 'overview', nav.caseId, nav.caseCount),
    active: s === current,
    badge: nav.sectionBadges[s] || undefined,
  }));

  return <BottomNav items={items} hidden={OWN_BAR.some((re) => re.test(pathname))} />;
}
