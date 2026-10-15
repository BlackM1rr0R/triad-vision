import Tabs from 'expo-router/js-tabs';
import { Bell, FileText, House, MessageCircle, UserRound } from '@/components/icons';
import { useTranslation } from 'react-i18next';
import { tabIcon, tabListeners, tabScreenOptions } from '@/features/common/tabOptions';
import { useNotifications } from '@/lib/queries';

export default function ClientTabs() {
  const { t } = useTranslation();
  const { data } = useNotifications();
  const unread = data?.unread ?? 0;
  return (
    <Tabs screenOptions={tabScreenOptions} screenListeners={tabListeners}>
      <Tabs.Screen name="home" options={{ title: t('m.tabs.home'), tabBarIcon: tabIcon(House) }} />
      <Tabs.Screen name="my-case" options={{ title: t('m.tabs.case'), tabBarIcon: tabIcon(FileText) }} />
      <Tabs.Screen name="messages" options={{ title: t('m.tabs.messages'), tabBarIcon: tabIcon(MessageCircle) }} />
      <Tabs.Screen
        name="notifications"
        options={{ title: t('m.tabs.notifications'), tabBarIcon: tabIcon(Bell), tabBarBadge: unread > 0 ? (unread > 99 ? '99+' : unread) : undefined }}
      />
      <Tabs.Screen name="profile" options={{ title: t('m.tabs.profile'), tabBarIcon: tabIcon(UserRound) }} />
      {/* Interviews live inside the tab navigator (tab bar stays visible) but have no tab of their own: reached from home and the profile. */}
      <Tabs.Screen name="interviews" options={{ href: null, title: t('m.interviews.title') }} />
    </Tabs>
  );
}
