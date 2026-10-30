import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CalendarClock, Check } from '@/components/icons';
import { Button, Card, Text, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { useErrorMessage } from '@/lib/queries';
import { qk } from '@/lib/queryClient';
import { registerInterviewCalendarCopy } from '@/i18n/interviewCalendar';
import { colors, radius, space } from '@/theme';

registerInterviewCalendarCopy();

/** "Pick a time" invitation (server: routes/interviewCalendar.ts). */
export interface InterviewInvite {
  id: string;
  status: 'OPEN' | 'BOOKED' | 'CANCELLED';
  minutes: number;
  company: { id: string; name: string };
  interview: { id: string; startsAt: string } | null;
  canMove: boolean;
  reschedulesLeft: number;
}

interface Slot {
  startsAt: string;
  berlin: { day: string; time: string };
  baku: { day: string; time: string; until: string };
}

export const invitesKey = ['interviews', 'invites'] as const;

export const useMyInvites = () =>
  useQuery({ queryKey: invitesKey, queryFn: async () => (await api.get<{ items: InterviewInvite[] }>('/interview-calendar/invites')).data.items });

const dayLabel = (day: string, lang: string) =>
  new Intl.DateTimeFormat(lang, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));

/**
 * One open invitation (or a booked one the candidate may still move): expands into the free slots,
 * grouped by Baku day, with the German time under each one; tap a slot, then book.
 */
export const InviteCard = ({ invite, index }: { invite: InterviewInvite; index?: number }) => {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const message = useErrorMessage();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const moving = !!invite.interview;

  const slots = useQuery({
    queryKey: ['interviews', 'invite-slots', invite.id],
    queryFn: async () => (await api.get<{ slots: Slot[] }>(`/interview-calendar/invites/${invite.id}/slots`)).data.slots,
    enabled: open,
  });
  const book = useMutation({
    mutationFn: (startsAt: string) => api.post(`/interview-calendar/invites/${invite.id}/book`, { startsAt }),
    onSuccess: () => {
      haptic.success();
      toast(t(moving ? 'm.ivcal.moved' : 'm.ivcal.booked'));
      setOpen(false);
      setChosen(null);
      void qc.invalidateQueries({ queryKey: qk.interviews });
    },
    onError: (err) => {
      toast(message(err), 'error');
      void slots.refetch();
    },
  });

  const days = new Map<string, Slot[]>();
  for (const s of slots.data ?? []) days.set(s.baku.day, [...(days.get(s.baku.day) ?? []), s]);

  return (
    <Card index={index}>
      <Text variant="title">{moving ? t('m.ivcal.changeTitle') : t('m.ivcal.from', { company: invite.company.name })}</Text>
      <Text variant="small">
        {t('m.ivcal.minutes', { count: invite.minutes })}
        {moving ? ` · ${t('m.ivcal.movesLeft', { count: invite.reschedulesLeft })}` : ''}
      </Text>
      {!open ? (
        <Button title={moving ? t('m.ivcal.change') : t('m.ivcal.pick')} icon={CalendarClock} size="sm" style={{ marginTop: space.md, alignSelf: 'flex-start' }} onPress={() => setOpen(true)} />
      ) : (
        <View style={{ marginTop: space.md, gap: space.md }}>
          <Text variant="caption">{t('m.ivcal.hint')}</Text>
          {slots.isLoading ? null : days.size === 0 ? (
            <Text variant="small">{t('m.ivcal.noSlots')}</Text>
          ) : (
            [...days.entries()].map(([day, list]) => (
              <View key={day} style={{ gap: space.xs }}>
                <Text variant="label">{dayLabel(day, i18n.language)}</Text>
                <View style={styles.grid}>
                  {list.map((s) => {
                    const selected = chosen === s.startsAt;
                    const current = s.startsAt === invite.interview?.startsAt;
                    return (
                      <Pressable
                        key={s.startsAt}
                        disabled={current}
                        accessibilityRole="button"
                        accessibilityState={{ selected, disabled: current }}
                        onPress={() => setChosen(s.startsAt)}
                        style={[styles.slot, selected && styles.slotSelected, current && { opacity: 0.5 }]}
                      >
                        <Text variant="label">{s.baku.time}–{s.baku.until}</Text>
                        <Text variant="caption">{s.berlin.time} {t('m.ivcal.germany')}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))
          )}
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button title={t('m.ivcal.book')} icon={Check} size="sm" disabled={!chosen} loading={book.isPending} onPress={() => chosen && book.mutate(chosen)} />
            <Button title={t('m.ivcal.close')} variant="ghost" size="sm" onPress={() => setOpen(false)} />
          </View>
        </View>
      )}
    </Card>
  );
};

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  slot: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm, minWidth: 104 },
  slotSelected: { borderColor: colors.blue, backgroundColor: colors.blueSoft },
});
