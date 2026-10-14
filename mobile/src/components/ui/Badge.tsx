import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { STATUS_TONE } from '@/lib/caseStatus';
import { colors, fonts, radius } from '@/theme';
import type { CaseStatus, DocStatus } from '@/types';
import { Text } from './Text';

export const Pill = ({
  label,
  fg,
  bg,
  dot = true,
  style,
}: {
  label: string;
  fg: string;
  bg: string;
  dot?: boolean;
  style?: StyleProp<ViewStyle>;
}) => (
  <View style={[styles.pill, { backgroundColor: bg }, style]}>
    {dot ? <View style={[styles.dot, { backgroundColor: fg }]} /> : null}
    <Text numberOfLines={1} style={{ color: fg, fontFamily: fonts.semibold, fontSize: 12 }}>
      {label}
    </Text>
  </View>
);

/** Client wording ("Upload documents") or staff wording ("Waiting for documents"). */
export const StatusBadge = ({ status, staff, style }: { status: CaseStatus; staff?: boolean; style?: StyleProp<ViewStyle> }) => {
  const { t } = useTranslation();
  const tone = STATUS_TONE[status];
  return <Pill label={t(staff ? `m.staff.status.${status}` : `portal.status.${status}`)} fg={tone.fg} bg={tone.bg} style={style} />;
};

const DOC_TONE: Record<DocStatus, { fg: string; bg: string }> = {
  PENDING: { fg: colors.warning, bg: colors.warningSoft },
  ACCEPTED: { fg: colors.success, bg: colors.successSoft },
  REJECTED: { fg: colors.danger, bg: colors.dangerSoft },
};

export const DocStatusBadge = ({ status }: { status: DocStatus }) => {
  const { t } = useTranslation();
  return <Pill label={t(`portal.docs.status.${status}`)} fg={DOC_TONE[status].fg} bg={DOC_TONE[status].bg} />;
};

export const CountBadge = ({ count }: { count: number }) =>
  count > 0 ? (
    <View style={styles.count}>
      <Text style={{ color: colors.white, fontFamily: fonts.bold, fontSize: 11 }}>{count > 99 ? '99+' : count}</Text>
    </View>
  ) : null;

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    maxWidth: '100%',
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  count: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
