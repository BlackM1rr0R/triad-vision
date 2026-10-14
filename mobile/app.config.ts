import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * EAS project id — needed for real remote push notifications (Expo push tokens) and EAS builds.
 * After running `eas init` once, paste the printed id below (committed, so EAS cloud builds see it)
 * or provide it as the EAS_PROJECT_ID environment variable. Without it the app runs normally and
 * simply skips push registration.
 */
const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID || '';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Triad Vision',
  slug: 'triad-vision',
  owner: process.env.EXPO_OWNER || undefined,
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'triadvision',
  userInterfaceStyle: 'light',
  backgroundColor: '#050f24',
  ios: {
    bundleIdentifier: 'de.triadvision.app',
    supportsTablet: false,
    infoPlist: {
      NSCameraUsageDescription: 'Triad Vision uses the camera so you can photograph documents for your visa application.',
      NSPhotoLibraryUsageDescription: 'Triad Vision needs access to your photos so you can upload document images for your visa application.',
      NSCalendarsUsageDescription: 'Triad Vision adds your embassy appointment to your calendar.',
      NSCalendarsWriteOnlyAccessUsageDescription: 'Triad Vision adds your embassy appointment to your calendar.',
      // The API runs over plain HTTP on the local network during development.
      NSAppTransportSecurity: { NSAllowsArbitraryLoads: true },
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'de.triadvision.app',
    adaptiveIcon: {
      backgroundColor: '#0b1f44',
      foregroundImage: './assets/images/adaptive-icon.png',
      monochromeImage: './assets/images/adaptive-icon-monochrome.png',
    },
    // Allow http:// to the dev API on the LAN (production builds should use https).
    usesCleartextTraffic: true,
    predictiveBackGestureEnabled: false,
    permissions: ['CAMERA', 'READ_CALENDAR', 'WRITE_CALENDAR', 'POST_NOTIFICATIONS'],
  } as ExpoConfig['android'],
  web: { favicon: './assets/images/favicon.png' },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#050f24',
        image: './assets/images/splash-icon.png',
        imageWidth: 120,
      },
    ],
    'expo-secure-store',
    'expo-localization',
    'expo-sharing',
    'expo-web-browser',
    [
      'expo-notifications',
      {
        icon: './assets/images/notification-icon.png',
        color: '#1565e8',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'Triad Vision needs access to your photos so you can upload document images for your visa application.',
        cameraPermission: 'Triad Vision uses the camera so you can photograph documents for your visa application.',
        microphonePermission: false,
      },
    ],
    [
      'expo-calendar',
      {
        calendarPermission: 'Triad Vision adds your embassy appointment to your calendar.',
      },
    ],
    '@react-native-community/datetimepicker',
  ],
  experiments: {
    reactCompiler: true,
  },
  extra: {
    ...(config.extra ?? {}),
    ...(EAS_PROJECT_ID ? { eas: { projectId: EAS_PROJECT_ID } } : {}),
    webUrl: 'https://triad-vision.de',
  },
});
