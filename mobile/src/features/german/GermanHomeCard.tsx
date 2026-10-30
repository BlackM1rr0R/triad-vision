import '@/i18n/german';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Flame } from '@/components/icons';
import { Card, Text } from '@/components/ui';
import { colors } from '@/theme';
import { useVocabSummary } from './GermanScreen';

/** Home: today's vocabulary practice (streak, due words) → German screen. */
export const GermanHomeCard = ({ index }: { index?: number }) => {
  const { t } = useTranslation();
  const { data: s } = useVocabSummary();
  if (!s || s.total === 0) return null;
  return (
    <Card index={index} onPress={() => router.push('/german')}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Flame size={20} color={s.streak.practisedToday ? colors.warning : colors.muted} />
        <View style={{ flex: 1 }}>
          <Text variant="title">{t('m.german.homeTitle')}</Text>
          <Text variant="small">{t('m.german.homeText', { streak: s.streak.current, due: s.due })}</Text>
        </View>
        <ArrowRight size={18} color={colors.blue} />
      </View>
    </Card>
  );
};
