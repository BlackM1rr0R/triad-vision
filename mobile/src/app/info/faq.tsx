import { memo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, LinearTransition, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { ChevronDown } from '@/components/icons';
import { useTranslation } from 'react-i18next';
import { Chips, ErrorState, ScrollScreen, SkeletonList, Text } from '@/components/ui';
import { useFormat } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useContent } from '@/lib/queries';
import { colors, fonts, radius, space } from '@/theme';
import type { Faq } from '@/types';

const Item = memo(({ q, a }: { q: string; a: string }) => {
  const [open, setOpen] = useState(false);
  const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: withTiming(open ? '180deg' : '0deg', { duration: 200 }) }] }));
  return (
    <Animated.View layout={LinearTransition.duration(220)} style={styles.item}>
      <Pressable
        onPress={() => {
          haptic.select();
          setOpen((o) => !o);
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.q}
      >
        <Text style={{ flex: 1, fontFamily: fonts.semibold, fontSize: 15 }}>{q}</Text>
        <Animated.View style={chevron}>
          <ChevronDown size={20} color={colors.blue} />
        </Animated.View>
      </Pressable>
      {open ? (
        <Animated.View entering={FadeIn.duration(220)} style={{ paddingHorizontal: space.lg, paddingBottom: space.lg }}>
          <Text selectable>{a}</Text>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
});
Item.displayName = 'FaqItem';

type Filter = 'all' | 'candidate' | 'company';

export default function FaqScreen() {
  const { t } = useTranslation();
  const f = useFormat();
  const { data, isLoading, error, refetch } = useContent();
  const [filter, setFilter] = useState<Filter>('candidate');

  const list = (data?.faqs ?? []).filter((x: Faq) => filter === 'all' || x.audience === 'all' || x.audience === filter);

  return (
    <ScrollScreen onRefresh={refetch}>
      <View style={{ gap: 4 }}>
        <Text variant="h2">{t('faq.title')}</Text>
        <Text variant="small">{t('faq.subtitle')}</Text>
      </View>
      <Chips<Filter>
        value={filter}
        onChange={setFilter}
        items={[
          { key: 'candidate', label: t('faq.candidate') },
          { key: 'company', label: t('faq.company') },
          { key: 'all', label: t('faq.all') },
        ]}
      />
      {isLoading ? (
        <SkeletonList count={5} lines={1} />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <View style={{ gap: space.sm }}>
          {list.map((x) => (
            <Item key={x.id} q={f.tr(x.question)} a={f.tr(x.answer)} />
          ))}
        </View>
      )}
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  item: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, overflow: 'hidden' },
  q: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: space.lg, minHeight: 56 },
});
