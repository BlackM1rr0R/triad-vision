import { Alert } from 'react-native';
import type { TFunction } from 'i18next';

/**
 * Scan quality feedback after an upload: the server measures blur, darkness, glare and cut-off edges while
 * storing the file and returns `quality` in the upload response. A problem shows one alert with the reasons,
 * the photo tips and a "Retake" button (the file itself is kept and marked for the case manager).
 */

export interface UploadQuality {
  level: 'OK' | 'WARN' | 'BAD';
  reasons: { code: string; level: 'WARN' | 'BAD' }[];
}

/** The quality block of an upload response, or null. */
export const qualityOfResponse = (res: unknown): UploadQuality | null => {
  const q = (res as { quality?: UploadQuality | null } | null)?.quality;
  return q && (q.level === 'WARN' || q.level === 'BAD') && Array.isArray(q.reasons) && q.reasons.length ? q : null;
};

/** Shows the alert when the upload has a quality problem; returns whether it did. */
export const showQualityFeedback = (t: TFunction, res: unknown, onRetake?: () => void) => {
  const q = qualityOfResponse(res);
  if (!q) return false;
  const reasons = [...new Set(q.reasons.map((r) => r.code))].map((c) => `• ${t(`m.uploadQuality.reasons.${c}`, { defaultValue: c })}`);
  const body = [...reasons, '', t('m.uploadQuality.tips'), ...(q.level === 'BAD' ? ['', t('m.uploadQuality.kept')] : [])].join('\n');
  Alert.alert(t(q.level === 'BAD' ? 'm.uploadQuality.titleBAD' : 'm.uploadQuality.titleWARN'), body, [
    { text: t('m.uploadQuality.keep'), style: 'cancel' },
    ...(onRetake ? [{ text: t('m.uploadQuality.retake'), onPress: onRetake }] : []),
  ]);
  return true;
};
