import { registerTour } from './tour';

/**
 * Built-in first-login tours. Targets are data-tour attributes in the layouts / pages (desktop target first,
 * mobile fallback next) or raw selectors. Copy: i18n/pagesPortalUx.ts + i18n/pagesTours.ts (pux.tour.*).
 *
 *   client  portal home (AccountLayout / AccountHome)
 *   staff   team workspace (WorkspaceLayout)
 *   admin   staff area, across pages (AdminLayout): my day, Ctrl+K, cases + quick drawer, review mode, Drive, help
 */

export const CLIENT_TOUR = 'client';
export const STAFF_TOUR = 'staff';
export const ADMIN_TOUR = 'admin';

registerTour({
  id: CLIENT_TOUR,
  route: '/account',
  steps: [
    { id: 'next', target: 'portal-next', titleKey: 'pux.tour.client.next.title', textKey: 'pux.tour.client.next.text', placement: 'bottom' },
    { id: 'progress', target: 'portal-progress', titleKey: 'pux.tour.client.progress.title', textKey: 'pux.tour.client.progress.text', placement: 'bottom' },
    // components/portal/JourneyCard.tsx (the journey map on the portal home)
    { id: 'journey', target: ['portal-journey', 'section[aria-labelledby="journey-map-title"]'], titleKey: 'pux.tour.client.journey.title', textKey: 'pux.tour.client.journey.text', placement: 'top' },
    { id: 'docs', target: ['bnav-docs', 'portal-tab-docs'], titleKey: 'pux.tour.client.docs.title', textKey: 'pux.tour.client.docs.text', placement: 'bottom' },
    { id: 'messages', target: ['bnav-messages', 'portal-messages', 'portal-tab-messages'], titleKey: 'pux.tour.client.messages.title', textKey: 'pux.tour.client.messages.text', placement: 'top' },
    { id: 'profile', target: ['portal-profile', 'bnav-profile'], titleKey: 'pux.tour.client.profile.title', textKey: 'pux.tour.client.profile.text', placement: 'bottom' },
  ],
});

registerTour({
  id: STAFF_TOUR,
  route: '/workspace/home',
  steps: [
    { id: 'rail', target: ['ws-rail', 'bnav-more', 'ws-menu'], titleKey: 'pux.tour.staff.rail.title', textKey: 'pux.tour.staff.rail.text', placement: 'right' },
    { id: 'drive', target: ['ws-nav-drive', 'bnav-docs'], titleKey: 'pux.tour.staff.drive.title', textKey: 'pux.tour.staff.drive.text', placement: 'right' },
    { id: 'tasks', target: ['ws-nav-tasks', 'bnav-tasks'], titleKey: 'pux.tour.staff.tasks.title', textKey: 'pux.tour.staff.tasks.text', placement: 'right' },
    { id: 'mail', target: ['ws-nav-mail', 'bnav-mail'], titleKey: 'pux.tour.staff.mail.title', textKey: 'pux.tour.staff.mail.text', placement: 'right' },
    { id: 'help', target: ['ws-help', 'ws-help-mobile'], titleKey: 'pux.tour.staff.help.title', textKey: 'pux.tour.staff.help.text', placement: 'right' },
  ],
});

const admin = (id: string, route: string, target: string | string[], placement: 'auto' | 'top' | 'bottom' | 'left' | 'right' = 'auto') => ({
  id,
  route,
  target,
  titleKey: `pux.tour.admin.${id}.title`,
  textKey: `pux.tour.admin.${id}.text`,
  placement,
});

// Sidebar links carry data-tour="nav-<item id>" (AdminLayout SideLink); phones fall back to the page heading or
// the menu button. A step whose page the role cannot open is skipped.
registerTour({
  id: ADMIN_TOUR,
  route: '/admin/my-day',
  steps: [
    admin('myday', '/admin/my-day', ['nav-myDay', '#admin-main h1'], 'right'),
    admin('cmdk', '/admin/my-day', 'cmdk', 'right'),
    admin('cases', '/admin/cases', ['#admin-main tbody tr', '#admin-main [data-row-id]', '#admin-main h1'], 'bottom'),
    admin('review', '/admin/review', ['sp-review-viewer', 'sp-review-filters'], 'right'),
    // sidebar / header: on whatever page the tour got to
    admin('drive', '*', ['nav-ws.drive', 'admin-menu'], 'right'),
    admin('help', '*', 'admin-help', 'bottom'),
  ],
});
