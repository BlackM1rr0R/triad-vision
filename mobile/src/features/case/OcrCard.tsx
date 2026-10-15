import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { CheckCircle2, ScanLine, X } from '@/components/icons';
import { useTranslation } from 'react-i18next';
import { Button, Text } from '@/components/ui';
import { useFormat } from '@/lib/format';
import { expiryState, mrzName, mrzOf } from '@/lib/ocr';
import { colors, fonts, radius, space } from '@/theme';
import { Note } from './parts';
import type { OcrState } from './useOcr';

const Row = ({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) => (
  <View style={styles.row}>
    <Text variant="small" style={{ flex: 1 }}>
      {label}
    </Text>
    <Text style={{ fontFamily: mono ? fonts.semibold : fonts.medium, fontSize: 14, color: colors.ink, letterSpacing: mono ? 0.6 : 0 }} selectable>
      {value || '—'}
    </Text>
  </View>
);

/** Shows what the passport scan found (name, number, expiry) with "apply to profile". Rendered under the passport requirement. */
export const OcrCard = ({ ocr, applying, onApply, onDismiss }: { ocr: OcrState; applying: boolean; onApply: () => void; onDismiss: () => void }) => {
  const { t } = useTranslation();
  const f = useFormat();
  const mrz = mrzOf(ocr.result?.ocr);
  const date = (iso: string) => {
    const d = new Date(`${iso}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? iso : f.date(d);
  };
  const expiry = expiryState(mrz?.expiryDate);

  return (
    <Animated.View entering={FadeIn.duration(250)} layout={LinearTransition} style={styles.card}>
      <View style={styles.head}>
        <View style={styles.icon}>{ocr.phase === 'running' ? <ActivityIndicator size="small" color={colors.blue} /> : <ScanLine size={18} color={colors.blue} />}</View>
        <Text style={{ fontFamily: fonts.semibold, fontSize: 14, flex: 1 }}>{ocr.phase === 'running' ? t('m.ocr.running') : t('m.ocr.title')}</Text>
        {ocr.phase !== 'running' ? (
          <Pressable onPress={onDismiss} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('m.common.close')} style={styles.close}>
            <X size={16} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      {ocr.phase === 'running' ? (
        <Text variant="small">{t('m.ocr.runningHint')}</Text>
      ) : ocr.phase === 'failed' || !mrz ? (
        <Note tone="warning" text={t('m.ocr.notFound')} />
      ) : (
        <View style={{ gap: 2 }}>
          <Row label={t('m.ocr.name')} value={mrzName(mrz)} />
          <Row label={t('m.ocr.number')} value={mrz.documentNumber} />
          <Row label={t('m.ocr.expiry')} value={date(mrz.expiryDate)} mono={false} />
          <Row label={t('m.ocr.birthDate')} value={date(mrz.birthDate)} mono={false} />
          <Row label={t('m.ocr.nationality')} value={mrz.nationality} />
          {!mrz.valid ? (
            <View style={{ marginTop: 8 }}>
              <Note tone="warning" text={t('m.ocr.invalid')} />
            </View>
          ) : null}
          {expiry === 'expired' ? (
            <View style={{ marginTop: 8 }}>
              <Note tone="danger" text={t('m.ocr.expired')} />
            </View>
          ) : expiry === 'soon' ? (
            <View style={{ marginTop: 8 }}>
              <Note tone="warning" text={t('m.ocr.expiresSoon')} />
            </View>
          ) : null}
          {ocr.phase === 'applied' ? (
            <View style={styles.applied}>
              <CheckCircle2 size={16} color={colors.success} />
              <Text variant="small" color={colors.success} style={{ fontFamily: fonts.semibold }}>
                {t('m.ocr.applied')}
              </Text>
            </View>
          ) : (
            <View style={{ marginTop: space.sm, gap: 6 }}>
              <Text variant="caption">{t('m.ocr.checkHint')}</Text>
              <Button title={t('m.ocr.apply')} icon={CheckCircle2} size="sm" loading={applying} onPress={onApply} style={{ alignSelf: 'flex-start' }} />
            </View>
          )}
        </View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  card: { marginLeft: 30, gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: colors.blueSoft, borderWidth: StyleSheet.hairlineWidth, borderColor: '#bcd3fb' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  close: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  applied: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.sm },
});
