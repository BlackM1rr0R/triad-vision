import { Platform } from 'react-native';
import * as Calendar from 'expo-calendar';
import { File, Paths } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import { authHeaders, fileUrl } from './api';
import { IS_EXPO_GO } from './config';
import { ApiError } from './errors';
import { buildIcs } from './ics';

const safeName = (name: string) => name.replace(/[\\/:*?"<>|]+/g, '_').slice(-120) || 'file';

/** Downloads a private case document (Bearer auth) into the cache and returns the local file. */
export const downloadDocument = async (doc: { id: string; originalName: string }) => {
  const dest = new File(Paths.cache, `doc-${doc.id}-${safeName(doc.originalName)}`);
  if (dest.exists && dest.size > 0) return dest;
  try {
    return await File.downloadFileAsync(fileUrl(doc.id), dest, { headers: authHeaders(), idempotent: true });
  } catch (err) {
    const status = Number(/status(?: code)?:? (\d{3})/i.exec(String((err as Error)?.message))?.[1]);
    throw status ? new ApiError(status, status === 404 ? 'DOCUMENT_NOT_FOUND' : 'DOWNLOAD_FAILED') : err;
  }
};

const UTI: Record<string, string> = {
  'application/pdf': 'com.adobe.pdf',
  'image/jpeg': 'public.jpeg',
  'image/png': 'public.png',
  'application/msword': 'com.microsoft.word.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'org.openxmlformats.wordprocessingml.document',
};

/**
 * Opens a downloaded document in the phone's viewer.
 * Android: ACTION_VIEW intent (PDF viewer / Word / gallery). iOS: the share sheet, which offers Quick Look and "Open in…".
 */
export const openDocument = async (doc: { id: string; originalName: string; mimeType: string }) => {
  const file = await downloadDocument(doc);
  if (Platform.OS === 'android') {
    try {
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: file.contentUri,
        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
        type: doc.mimeType,
      });
      return;
    } catch {
      // no app can view this type — fall through to the share sheet
    }
  }
  await shareFile(file.uri, doc.mimeType, doc.originalName);
};

export const shareFile = async (uri: string, mimeType: string, title?: string) => {
  if (!(await Sharing.isAvailableAsync())) throw new ApiError(0, 'SHARING_UNAVAILABLE');
  await Sharing.shareAsync(uri, { mimeType, UTI: UTI[mimeType], dialogTitle: title });
};

export type CalendarResult = 'added' | 'shared' | 'denied';

/**
 * Adds an event to the phone calendar. Uses expo-calendar in a development/production build;
 * Expo Go does not ship that module, so there we share an .ics file the calendar app can import.
 */
export const addToCalendar = async (e: {
  uid: string;
  title: string;
  start: Date;
  durationMinutes?: number;
  location?: string;
  notes?: string;
}): Promise<CalendarResult> => {
  const end = new Date(e.start.getTime() + (e.durationMinutes ?? 60) * 60_000);
  if (!IS_EXPO_GO && Platform.OS !== 'web') {
    try {
      const perm = await Calendar.requestCalendarPermissions();
      if (perm.status !== 'granted') return 'denied';
      let target: Calendar.ExpoCalendar | undefined;
      if (Platform.OS === 'ios') {
        try {
          target = Calendar.getDefaultCalendarSync();
        } catch {
          target = undefined;
        }
      }
      if (!target) {
        const cals = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
        target = cals.find((c) => c.allowsModifications && c.isPrimary) ?? cals.find((c) => c.allowsModifications);
      }
      if (target) {
        await target.createEvent({
          title: e.title,
          startDate: e.start,
          endDate: end,
          location: e.location,
          notes: e.notes,
          alarms: [{ relativeOffset: -120 }],
        });
        return 'added';
      }
    } catch {
      // fall back to .ics below
    }
  }
  const ics = new File(Paths.cache, `appointment-${e.uid}.ics`);
  if (ics.exists) ics.delete();
  ics.create();
  ics.write(buildIcs({ uid: e.uid, title: e.title, start: e.start, end, location: e.location, notes: e.notes }));
  await shareFile(ics.uri, 'text/calendar', e.title);
  return 'shared';
};
