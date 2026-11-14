import { NotificationBell, NotificationCenterPage, isAppLink } from './center/NotificationCenter';

/**
 * Notifications for the employer, agent and partner portals: the header bell and the full page, both from the
 * shared notification center (components/notifications/center — day groups, type filters, infinite scroll,
 * read / unread, realtime via SSE). The settings sit on the portal's notifications page (#prefs).
 */

export { isAppLink };

/** Header bell; "all" links to the portal's notifications page (/company/notifications, /agent/…, /partner/…). */
export const PortalNotificationBell = ({ allTo }: { allTo: string }) => <NotificationBell allTo={allTo} prefsTo={`${allTo}#prefs`} />;

/** Full notifications page of a portal, with the e-mail / push settings below the list. */
export const PortalNotificationsPage = () => <NotificationCenterPage prefs="inline" />;
