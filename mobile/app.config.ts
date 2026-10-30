import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * EAS project id — needed for real remote push notifications (Expo push tokens) and EAS builds.
 *
 * Resolution order: the EAS_PROJECT_ID environment variable (every eas.json profile sets it, and
 * `.env` can set it for local dev builds), then the committed constant below. Replace the placeholder
 * with the id printed by `npx eas-cli@latest init` (see README § "How push works"). The placeholder
 * is NOT a valid id: with it (or nothing) the app runs normally and simply skips push registration.
 */
const EAS_PROJECT_ID_PLACEHOLDER = '00000000-0000-0000-0000-000000000000';
const COMMITTED_EAS_PROJECT_ID = EAS_PROJECT_ID_PLACEHOLDER; // ← paste the real id here after `eas init`

const pickProjectId = (...candidates: (string | undefined)[]) =>
  candidates.map((c) => c?.trim()).find((c) => c && c !== EAS_PROJECT_ID_PLACEHOLDER) || '';

const EAS_PROJECT_ID = pickProjectId(process.env.EAS_PROJECT_ID, COMMITTED_EAS_PROJECT_ID);

/**
 * Plain-HTTP API access is only allowed in development builds (APP_VARIANT=development: set by the
 * eas.json `development` profile and by `npx expo run:*` / Expo Go via .env). Preview and production
 * builds talk HTTPS only, so App Transport Security / Android cleartext stay at their secure defaults.
 */
const IS_DEV_VARIANT = process.env.APP_VARIANT === 'development';

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
      NSFaceIDUsageDescription: 'Triad Vision uses Face ID to unlock the app without typing your password.',
      // The API runs over plain HTTP on the local network during development only.
      ...(IS_DEV_VARIANT ? { NSAppTransportSecurity: { NSAllowsArbitraryLoads: true } } : {}),
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
    // Allow http:// to the dev API on the LAN in development builds only (preview/production are https).
    ...(IS_DEV_VARIANT ? { usesCleartextTraffic: true } : {}),
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
    ['expo-contacts', { contactsPermission: 'Triad Vision opens your contacts only so you can pick friends to invite. Nothing from your contacts is uploaded.' }],
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
    [
      'expo-local-authentication',
      {
        faceIDPermission: 'Triad Vision uses Face ID to unlock the app without typing your password.',
      },
    ],
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
