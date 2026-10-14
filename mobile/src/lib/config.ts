import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { resolveApiUrl } from './apiUrl';

export const API_URL = resolveApiUrl({
  envUrl: process.env.EXPO_PUBLIC_API_URL,
  hostUri: Constants.expoConfig?.hostUri,
  platform: Platform.OS,
});

export const WEB_URL: string = (Constants.expoConfig?.extra?.webUrl as string | undefined) ?? 'https://triad-vision.de';

/** Running inside the Expo Go app (not a development/production build). */
export const IS_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export const EAS_PROJECT_ID: string | undefined =
  (Constants.expoConfig?.extra?.eas?.projectId as string | undefined) ?? Constants.easConfig?.projectId ?? undefined;

export const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
