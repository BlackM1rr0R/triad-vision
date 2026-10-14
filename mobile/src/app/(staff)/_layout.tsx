import Tabs from 'expo-router/js-tabs';
import { Bell, FolderKanban, LayoutDashboard, UserRound } from '@/components/icons';
import { useTranslation } from 'react-i18next';
import { tabIcon, tabListeners, tabScreenOptions } from '@/features/common/tabOptions';
import { useNotifications } from '@/lib/queries';

export default function StaffTabs() {
  const { t } = useTranslation();
  const { data } = useNotifications();
  const unread = data?.unread ?? 0;
  return (
    <Tabs screenOptions={tabScreenOptions} screenListeners={tabListeners}>
      <Tabs.Screen name="dashboard" options={{ title: t('m.tabs.dashboard'), tabBarIcon: tabIcon(LayoutDashboard) }} />
      <Tabs.Screen name="queue" options={{ title: t('m.tabs.cases'), tabBarIcon: tabIcon(FolderKanban) }} />
      <Tabs.Screen
        name="inbox"
        options={{ title: t('m.tabs.notifications'), tabBarIcon: tabIcon(Bell), tabBarBadge: unread > 0 ? (unread > 99 ? '99+' : unread) : undefined }}
      />
      <Tabs.Screen name="account" options={{ title: t('m.tabs.profile'), tabBarIcon: tabIcon(UserRound) }} />
    </Tabs>
  );
}
