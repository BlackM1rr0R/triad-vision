import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { House } from 'lucide-react';
import { toolOfLocation, toolPath, type PortalToolKey } from '@/lib/portalTools';
import { usePortalNav } from '@/components/portal/usePortalNav';
import { ALL_TOOLS_ICON, TOOL_ICON, toolLabel } from '@/components/portal/portalToolMeta';
import { registerCopy } from '@/i18n';
import { pagesPortalStage } from '@/i18n/pagesPortalStage';
import { BottomNav, type BottomNavItem } from './BottomNav';

registerCopy(pagesPortalStage);

// Pages with their own fixed action bar at the bottom (form submit, signing): no tab bar there.
const OWN_BAR = [/^\/account\/cases\/[^/]+\/(forms|confirm)/, /^\/account\/signatures\/[^/]+/];

/** Tour targets kept from the old tab bar (bnav-docs, bnav-messages). */
const TOUR: Partial<Record<PortalToolKey, string>> = { documents: 'bnav-docs', messages: 'bnav-messages' };

/** Slots between Home and "All tools" on phones. */
const SLOTS = 3;

/**
 * Client portal tab bar (phones), stage-based: Home · the first featured tools of the stage (messages kept
 * when featured) · All tools. The whole stage menu is on the portal home ("For this stage") and /account/all.
 */
export function BottomNavPortal() {
  const { t } = useTranslation();
  const { pathname, search } = useLocation();
  const nav = usePortalNav();
  const here = toolOfLocation(pathname, search);
  const ctx = { caseId: nav.caseId, caseCount: nav.caseCount, approvedCaseId: nav.approvedCaseId };

  const available = nav.featured.filter((k) => toolPath(k, ctx));
  let slots = available.slice(0, SLOTS);
  if (available.includes('messages') && !slots.includes('messages')) slots = [...slots.slice(0, SLOTS - 1), 'messages'];

  const items: BottomNavItem[] = [
    { key: 'home', label: t('pstage.nav.home'), icon: House, to: '/account', active: here === 'home', badge: nav.badges.actions || undefined },
    ...slots.map((k) => ({
      key: k,
      label: toolLabel(t, k),
      icon: TOOL_ICON[k],
      to: toolPath(k, ctx) ?? '/account/all',
      active: here === k,
      badge: nav.toolBadges(k) || undefined,
      tour: TOUR[k],
    })),
    {
      key: 'all',
      label: t('pstage.nav.all'),
      icon: ALL_TOOLS_ICON,
      to: '/account/all',
      // Any page not in the bar belongs to "All tools".
      active: here === 'all' || (!!here && here !== 'home' && !slots.includes(here)),
      // What waits behind it: tools outside the stage menu + stage tools that did not fit in the bar.
      badge: nav.allBadge + available.filter((k) => !slots.includes(k)).reduce((n, k) => n + nav.toolBadges(k), 0) || undefined,
    },
  ];

  return <BottomNav items={items} hidden={OWN_BAR.some((re) => re.test(pathname))} />;
}
