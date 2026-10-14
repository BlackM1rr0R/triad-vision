import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { api } from './api';
import { EAS_PROJECT_ID, IS_EXPO_GO } from './config';
import { colors } from '@/theme';

const PUSH_KEY = 'tv_push_token';

// Show notifications as banners even while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export type PushState = 'registered' | 'denied' | 'unsupported-expo-go' | 'simulator' | 'no-project-id' | 'error';

/**
 * Asks for permission, gets the Expo push token and registers it with the API (POST /api/devices).
 * Never throws — push is a convenience; the in-app notification list always works.
 */
export const registerForPush = async (): Promise<PushState> => {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Triad Vision',
        importance: Notifications.AndroidImportance.HIGH,
        lightColor: colors.blue,
        vibrationPattern: [0, 200, 120, 200],
      });
    }
    // Expo Go on Android (SDK 53+) cannot receive remote push at all.
    if (IS_EXPO_GO && Platform.OS === 'android') return 'unsupported-expo-go';
    if (!Device.isDevice) return 'simulator';

    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return 'denied';

    if (!EAS_PROJECT_ID) return 'no-project-id';
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID });
    await api.post('/devices', { token, platform: Platform.OS === 'ios' ? 'ios' : 'android' });
    await SecureStore.setItemAsync(PUSH_KEY, token);
    return 'registered';
  } catch (err) {
    if (__DEV__) console.warn('[push] registration failed', err);
    return 'error';
  }
};

/** Called on logout (while the session token is still valid) so this phone stops getting the user's pushes. */
export const unregisterPush = async () => {
  try {
    const token = await SecureStore.getItemAsync(PUSH_KEY);
    if (!token) return;
    await api.delete('/devices', { data: { token } });
    await SecureStore.deleteItemAsync(PUSH_KEY);
  } catch {
    /* best effort */
  }
};

export const pushPermissionGranted = async () => {
  try {
    return (await Notifications.getPermissionsAsync()).status === 'granted';
  } catch {
    return false;
  }
};

export type PushData = { caseId?: string; link?: string; type?: string };

export const dataOf = (response: Notifications.NotificationResponse | null | undefined): PushData | null => {
  const data = response?.notification.request.content.data as Record<string, unknown> | undefined;
  if (!data) return null;
  const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
  return { caseId: str(data.caseId), link: str(data.link), type: str(data.type) };
};
