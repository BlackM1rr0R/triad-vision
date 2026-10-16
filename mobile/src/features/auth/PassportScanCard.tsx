import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File, UploadType } from 'expo-file-system';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Camera, CheckCircle2, Images, RotateCcw, ScanLine, ShieldCheck } from '@/components/icons';
import { Button, Text } from '@/components/ui';
import { API_URL } from '@/lib/config';
import { ApiError, codeFromStatus } from '@/lib/errors';
import { haptic } from '@/lib/haptics';
import { useErrorMessage } from '@/lib/queries';
import { fitLongEdge } from '@/lib/scan';
import { colors, fonts, radius, space } from '@/theme';

/** Fields POST /api/auth/passport-scan reads from the passport's MRZ. */
export interface PassportScanFields {
  firstName: string;
  lastName: string;
  birthDate: string | null;
  passportNumber: string;
  nationality: string | null;
  sex: 'M' | 'F' | 'X';
  expiryDate: string | null;
}
type Warning = 'EXPIRED' | 'EXPIRES_SOON' | 'CHECK_DIGIT';
interface ScanResponse {
  ok: true;
  fields: PassportScanFields;
  warnings: Warning[];
}

/** Long edge sent to the server: enough for the MRZ, small enough for a quick upload. */
const MAX_EDGE = 2000;
const WARNING_KEY: Record<Warning, string> = { EXPIRED: 'warnExpired', EXPIRES_SOON: 'warnExpiresSoon', CHECK_DIGIT: 'warnCheckDigit' };

const remove = (uri: string | null) => {
  if (!uri) return;
  try {
    new File(uri).delete();
  } catch {
    /* already gone */
  }
};

/** Shrinks the photo to MAX_EDGE and re-encodes it as JPEG 0.9 in the cache directory. */
const prepare = async (asset: ImagePicker.ImagePickerAsset) => {
  const ctx = ImageManipulator.manipulate(asset.uri);
  const resize = fitLongEdge({ width: asset.width, height: asset.height }, MAX_EDGE);
  if (resize) ctx.resize(resize);
  const image = await ctx.renderAsync();
  try {
    const out = await image.saveAsync({ compress: 0.9, format: SaveFormat.JPEG });
    return out.uri;
  } finally {
    try {
      image.release();
    } catch {
      /* already released */
    }
    try {
      ctx.release();
    } catch {
      /* already released */
    }
  }
};

/** Public endpoint, no session: multipart field `image`. */
const upload = async (uri: string): Promise<ScanResponse> => {
  const res = await new File(uri).upload(`${API_URL}/auth/passport-scan`, {
    httpMethod: 'POST',
    uploadType: UploadType.MULTIPART,
    fieldName: 'image',
    mimeType: 'image/jpeg',
    headers: { 'x-client': 'mobile', Accept: 'application/json' },
  });
  if (res.status >= 400) throw new ApiError(res.status, codeFromStatus(res.status, res.body));
  return JSON.parse(res.body) as ScanResponse;
};

/** "2027-03-01" → "01.03.2027" */
const dmy = (iso: string | null) => (iso ? iso.split('-').reverse().join('.') : '');

/**
 * Registration helper: photograph the passport photo page, the MRZ is read on the server and the
 * form is filled through `onFilled`. The resized photo only lives in the app cache until it is
 * replaced or the screen closes; the server does not keep it.
 */
export const PassportScanCard = ({ onFilled }: { onFilled: (fields: PassportScanFields) => void }) => {
  const { t } = useTranslation();
  const message = useErrorMessage();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previewRef = useRef<string | null>(null);

  // The resized copy is deleted when the screen goes away.
  useEffect(() => () => remove(previewRef.current), []);

  const scan = async (source: 'camera' | 'gallery') => {
    setError(null);
    try {
      let res: ImagePicker.ImagePickerResult;
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) throw new ApiError(0, 'CAMERA_DENIED');
        res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 1, exif: false });
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted && perm.accessPrivileges !== 'limited') throw new ApiError(0, 'PHOTOS_DENIED');
        res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 1, exif: false });
      }
      const asset = res.canceled ? null : res.assets[0];
      if (!asset) return;
      setBusy(true);
      setResult(null);
      const uri = await prepare(asset);
      remove(previewRef.current);
      previewRef.current = uri;
      setPreview(uri);
      const data = await upload(uri);
      setResult(data);
      haptic.success();
      onFilled(data.fields);
    } catch (err) {
      haptic.warning();
      const status = err instanceof ApiError ? err.status : -1;
      if (status === 422 || status === 504) setError(`${t('m.register.scan.notFound')} ${t('m.register.scan.tips')}`);
      else if (status === 503) setError(t('m.register.scan.unavailable'));
      else if (status === 429) setError(t('m.register.scan.tooMany'));
      else if (status === 0) setError(message(err));
      else setError(t('m.register.scan.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card} accessibilityLabel={t('m.register.scan.title')}>
      <View style={styles.head}>
        <View style={styles.badge}>
          <ScanLine size={20} color={colors.white} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="h3">{t('m.register.scan.title')}</Text>
          <Text variant="small" style={{ marginTop: 2 }}>
            {t('m.register.scan.text')}
          </Text>
        </View>
      </View>

      {preview ? (
        <Image
          source={{ uri: preview }}
          style={[styles.preview, busy && { opacity: 0.6 }]}
          contentFit="contain"
          transition={120}
          accessibilityIgnoresInvertColors
        />
      ) : null}

      <View style={styles.row}>
        <Button
          title={result || error ? t('m.register.scan.retake') : t('m.register.scan.takePhoto')}
          icon={result || error ? RotateCcw : Camera}
          onPress={() => scan('camera')}
          loading={busy}
          disabled={busy}
          size="sm"
          style={{ flex: 1 }}
        />
        <Button title={t('m.register.scan.chooseFile')} icon={Images} variant="secondary" onPress={() => scan('gallery')} disabled={busy} size="sm" style={{ flex: 1 }} />
      </View>

      <View accessibilityLiveRegion="polite" style={{ gap: space.sm }}>
        {busy ? <Text variant="small">{t('m.register.scan.reading')}</Text> : null}
        {result ? (
          <View style={styles.line}>
            <CheckCircle2 size={16} color={colors.success} />
            <Text variant="small" color={colors.success} style={{ flex: 1 }}>
              {t('m.register.scan.done')}
            </Text>
          </View>
        ) : null}
        {result?.warnings.map((w) => (
          <View key={w} style={[styles.notice, w === 'EXPIRED' ? styles.danger : styles.warning]}>
            <AlertCircle size={16} color={w === 'EXPIRED' ? colors.danger : colors.warning} />
            <Text variant="small" color={colors.ink} style={{ flex: 1 }}>
              {t(`m.register.scan.${WARNING_KEY[w]}`, { date: dmy(result.fields.expiryDate) })}
            </Text>
          </View>
        ))}
        {error ? (
          <View style={[styles.notice, styles.warning]}>
            <AlertCircle size={16} color={colors.warning} />
            <Text variant="small" color={colors.ink} style={{ flex: 1 }}>
              {error}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.line}>
        <ShieldCheck size={14} color={colors.muted} />
        <Text variant="caption" style={{ flex: 1 }}>
          {t('m.register.scan.privacy')}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.blueSoft,
    borderColor: '#c7dafc',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
  },
  head: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  badge: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  preview: { width: '100%', height: 180, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  row: { flexDirection: 'row', gap: space.sm },
  line: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  notice: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start', borderRadius: radius.sm, padding: space.sm, borderWidth: 1 },
  warning: { backgroundColor: colors.warningSoft, borderColor: '#f1dcb1' },
  danger: { backgroundColor: colors.dangerSoft, borderColor: '#f6c5ca' },
});

/** Small "filled from passport" badge shown under an auto-filled field. */
export const FilledTag = ({ label }: { label: string }) => (
  <View style={tagStyles.tag}>
    <ScanLine size={12} color={colors.blue} />
    <Text style={tagStyles.text}>{label}</Text>
  </View>
);

const tagStyles = StyleSheet.create({
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: colors.blueSoft,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
  text: { fontFamily: fonts.semibold, fontSize: 11.5, color: colors.blue },
});
