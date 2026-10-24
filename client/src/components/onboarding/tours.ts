import { registerTour } from './tour';

/**
 * Built-in tours. Targets are data-tour attributes in the layouts / pages (desktop target first,
 * mobile bottom-bar fallback second). Copy: i18n/pagesPortalUx.ts (pux.tour.*).
 *
 * An admin tour is added the same way: registerTour({ id: 'admin', route: '/admin', steps: [...] })
 * and <TourHost autoStart="admin" /> in AdminLayout.
 */

export const CLIENT_TOUR = 'client';
export const STAFF_TOUR = 'staff';

registerTour({
  id: CLIENT_TOUR,
  route: '/account',
  steps: [
    { id: 'next', target: 'portal-next', titleKey: 'pux.tour.client.next.title', textKey: 'pux.tour.client.next.text', placement: 'bottom' },
    { id: 'progress', target: 'portal-progress', titleKey: 'pux.tour.client.progress.title', textKey: 'pux.tour.client.progress.text', placement: 'bottom' },
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
