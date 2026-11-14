import { useTranslation } from 'react-i18next';
import { usePageTitle } from '@/lib/usePageTitle';
import { NotificationCenterPage } from '@/components/notifications/center/NotificationCenter';

/** Staff notification history + settings (/admin/notifications, linked from the header bell). */
export default function AdminNotifications() {
  const { t } = useTranslation();
  usePageTitle(t('ncenter.title'));
  return (
    <div className="mx-auto max-w-4xl">
      <NotificationCenterPage prefs="inline" />
    </div>
  );
}
