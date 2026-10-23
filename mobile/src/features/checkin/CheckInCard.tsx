import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button, Card, Field, Text, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { colors, fonts } from '@/theme';

/** Post-arrival check-ins (GET/POST /api/check-ins): one-tap answer on the client home screen. */

const TOPICS = ['HOUSING', 'SALARY', 'WORKPLACE', 'HEALTH', 'DOCUMENTS', 'OTHER'] as const;
type Topic = (typeof TOPICS)[number];

interface CheckIn {
  id: string;
  audience: 'WORKER' | 'EMPLOYER';
  offsetDays: number;
  firstName: string | null;
}

const KEY = ['check-ins', 'mine'] as const;

const One = ({ c }: { c: CheckIn }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const [issue, setIssue] = useState(false);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [comment, setComment] = useState('');
  const send = useMutation({
    mutationFn: async (body: { answer: 'OK' | 'ISSUE'; topics?: Topic[]; comment?: string | null }) => (await api.post(`/check-ins/${c.id}`, body)).data,
    onSuccess: (_d, body) => {
      haptic.tap();
      toast(body.answer === 'OK' ? t('m.checkin.thanksOk') : t('m.checkin.thanksIssue'), 'success');
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: () => toast(t('m.checkin.error'), 'error'),
  });

  return (
    <Card index={1} style={{ borderColor: colors.blue }}>
      <Text variant="h3">{t('m.checkin.title')}</Text>
      <Text style={{ marginTop: 6 }}>{t('m.checkin.intro', { name: c.firstName ?? '', days: c.offsetDays })}</Text>
      {!issue ? (
        <View style={{ gap: 10, marginTop: 14 }}>
          <Button title={t('m.checkin.ok')} variant="success" size="lg" loading={send.isPending} onPress={() => send.mutate({ answer: 'OK' })} />
          <Button title={t('m.checkin.issue')} variant="secondary" size="lg" onPress={() => setIssue(true)} />
        </View>
      ) : (
        <View style={{ gap: 10, marginTop: 14 }}>
          <Text variant="label">{t('m.checkin.topicsTitle')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {TOPICS.map((k) => {
              const on = topics.includes(k);
              return (
                <Pressable
                  key={k}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => setTopics((s) => (on ? s.filter((x) => x !== k) : [...s, k]))}
                  style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, borderColor: on ? colors.warning : colors.line, backgroundColor: on ? colors.warningSoft : colors.card }}
                >
                  <Text style={{ fontFamily: fonts.semibold, color: on ? colors.warning : colors.ink }}>{t(`m.checkin.topics.${k}`)}</Text>
                </Pressable>
              );
            })}
          </View>
          <Field label={t('m.checkin.comment')} multiline maxLength={2000} value={comment} onChangeText={setComment} />
          <Button title={t('m.checkin.send')} loading={send.isPending} onPress={() => send.mutate({ answer: 'ISSUE', topics, comment: comment.trim() || null })} />
          <Button title={t('m.checkin.back')} variant="ghost" onPress={() => setIssue(false)} />
        </View>
      )}
    </Card>
  );
};

/** Open check-ins of the signed-in worker (nothing when there are none). */
export const CheckInCard = () => {
  const { data } = useQuery({ queryKey: KEY, queryFn: async () => (await api.get<{ items: CheckIn[] }>('/check-ins/mine')).data.items, staleTime: 60_000 });
  const c = data?.find((x) => x.audience === 'WORKER');
  return c ? <One c={c} /> : null;
};
