import { StyleSheet, View } from 'react-native';
import { Check, X } from '@/components/icons';
import { useTranslation } from 'react-i18next';
import { STEP_KEYS, stepStates } from '@/lib/caseStatus';
import { colors, fonts } from '@/theme';
import type { CaseStatus } from '@/types';
import { Text } from './Text';

/** Vertical 6-step progress list (documents → result). */
export const Stepper = ({ status, labelPrefix = 'portal.steps' }: { status: CaseStatus; labelPrefix?: string }) => {
  const { t } = useTranslation();
  const states = stepStates(status);
  return (
    <View accessibilityRole="list">
      {STEP_KEYS.map((key, i) => {
        const s = states[i];
        const last = i === STEP_KEYS.length - 1;
        const dotBg = s === 'done' ? colors.success : s === 'current' ? colors.blue : s === 'failed' ? colors.danger : colors.white;
        const lineColor = s === 'done' ? colors.success : colors.line;
        return (
          <View key={key} style={styles.row} accessible accessibilityLabel={`${i + 1}. ${t(`${labelPrefix}.${key}`)}`}>
            <View style={styles.rail}>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: dotBg, borderColor: s === 'upcoming' ? colors.line : dotBg },
                  s === 'current' && styles.currentRing,
                ]}
              >
                {s === 'done' ? (
                  <Check size={13} color={colors.white} strokeWidth={3} />
                ) : s === 'failed' ? (
                  <X size={13} color={colors.white} strokeWidth={3} />
                ) : (
                  <Text style={{ fontFamily: fonts.bold, fontSize: 11, color: s === 'current' ? colors.white : colors.muted }}>{i + 1}</Text>
                )}
              </View>
              {!last ? <View style={[styles.line, { backgroundColor: lineColor }]} /> : null}
            </View>
            <Text
              style={[
                styles.label,
                s === 'current' && { fontFamily: fonts.bold, color: colors.navy },
                s === 'upcoming' && { color: colors.muted },
                s === 'failed' && { color: colors.danger, fontFamily: fonts.semibold },
              ]}
            >
              {t(`${labelPrefix}.${key}`)}
            </Text>
          </View>
        );
      })}
    </View>
  );
};

/** Compact horizontal progress: 6 segments. */
export const StepBar = ({ status }: { status: CaseStatus }) => {
  const states = stepStates(status);
  return (
    <View style={styles.bar}>
      {states.map((s, i) => (
        <View
          key={i}
          style={[
            styles.seg,
            {
              backgroundColor:
                s === 'done' ? colors.success : s === 'current' ? colors.blueBright : s === 'failed' ? colors.danger : 'rgba(150,170,200,0.3)',
            },
          ]}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, minHeight: 40 },
  rail: { alignItems: 'center', width: 26 },
  dot: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  currentRing: { shadowColor: colors.blue, shadowOpacity: 0.4, shadowRadius: 6, elevation: 3 },
  line: { width: 2, flex: 1, marginVertical: 2, borderRadius: 1 },
  label: { flex: 1, fontFamily: fonts.medium, fontSize: 14, color: colors.ink, paddingTop: 3, paddingBottom: 12 },
  bar: { flexDirection: 'row', gap: 4 },
  seg: { flex: 1, height: 5, borderRadius: 3 },
});
