import { useTranslation } from 'react-i18next';
import { usePageTitle } from '@/lib/usePageTitle';
import { useOverview } from '@/components/portal/useOverview';
import { ManagerCard } from '@/components/portal/Dashboard';
import { PortalCallbackCard } from '@/components/calls/CallbackForm';
import { NotificationCenterPage } from '@/components/notifications/center/NotificationCenter';

/**
 * Messages › Notifications: the notification center (day groups, type filters, infinite scroll, read / unread,
 * realtime) with the contact card and "call me back" beside it. The settings live in the profile.
 */
export default function Notifications() {
  const { t } = useTranslation();
  usePageTitle(t('portal.notifications'));
  const { data: overview } = useOverview();
  return (
    <NotificationCenterPage
      prefs={{ to: '/account/profile' }}
      aside={
        <>
          <ManagerCard c={overview?.activeCase ?? null} />
          <PortalCallbackCard />
        </>
      }
    />
  );
}
