import type { ComponentType, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { CloudOff, Inbox, type LucideProps } from '@/components/icons';
import { useTranslation } from 'react-i18next';
import { errorCode } from '@/lib/errors';
import { useErrorMessage } from '@/lib/queries';
import { colors, space } from '@/theme';
import { Button } from './Button';
import { Text } from './Text';

export const EmptyState = ({
  icon: Icon = Inbox,
  title,
  text,
  action,
}: {
  icon?: ComponentType<LucideProps>;
  title: string;
  text?: string;
  action?: ReactNode;
}) => (
  <Animated.View entering={FadeIn.duration(300)} style={styles.wrap}>
    <View style={styles.iconWrap}>
      <Icon size={28} color={colors.blue} strokeWidth={1.8} />
    </View>
    <Text variant="h3" center>
      {title}
    </Text>
    {text ? (
      <Text variant="small" center style={{ maxWidth: 300 }}>
        {text}
      </Text>
    ) : null}
    {action ? <View style={{ marginTop: space.sm }}>{action}</View> : null}
  </Animated.View>
);

export const ErrorState = ({ error, onRetry }: { error: unknown; onRetry?: () => void }) => {
  const { t } = useTranslation();
  const message = useErrorMessage();
  const offline = ['NETWORK', 'TIMEOUT'].includes(errorCode(error));
  return (
    <Animated.View entering={FadeIn.duration(300)} style={styles.wrap}>
      <View style={[styles.iconWrap, { backgroundColor: colors.dangerSoft }]}>
        <CloudOff size={28} color={colors.danger} strokeWidth={1.8} />
      </View>
      <Text variant="h3" center>
        {t('m.common.loadError')}
      </Text>
      <Text variant="small" center style={{ maxWidth: 300 }}>
        {message(error)}
      </Text>
      {onRetry ? <Button title={t('m.common.retry')} variant={offline ? 'primary' : 'secondary'} size="sm" onPress={onRetry} /> : null}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingVertical: space.xxxl, paddingHorizontal: space.xl },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
});
