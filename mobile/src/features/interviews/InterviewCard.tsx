import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Check, Clock3, Video, X } from '@/components/icons';
import { useTranslation } from 'react-i18next';
import { Button, Card, Pill, PromptSheet, Text, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { INTERVIEW_TONE, canConfirm, canDecline, canJoin, minutesBetween } from '@/lib/interviews';
import { addToCalendar } from '@/lib/native';
import { useErrorMessage } from '@/lib/queries';
import { qk } from '@/lib/queryClient';
import { colors, fonts, radius, space } from '@/theme';
import type { Interview, InterviewStatus } from '@/types';

export const InterviewStatusPill = ({ status }: { status: InterviewStatus }) => {
  const { t } = useTranslation();
  const tone = INTERVIEW_TONE[status];
  return <Pill label={t(`m.interviews.status.${status}`)} fg={tone.fg} bg={tone.bg} />;
};

/** Who the interview is with, from the candidate's point of view. */
export const interviewTitle = (i: Interview, t: (k: string, o?: Record<string, unknown>) => string) =>
  i.company ? t('m.interviews.with', { company: i.company.name }) : t('m.interviews.withTv');

/**
 * One interview: time, status, employer, vacancy, notes, and the candidate's actions (join, add to
 * calendar, confirm / decline). `compact` hides notes and actions (past list, home teaser).
 */
export const InterviewCard = ({ interview: i, compact, onPress, index }: { interview: Interview; compact?: boolean; onPress?: () => void; index?: number }) => {
  const { t } = useTranslation();
  const f = useFormat();
  const toast = useToast();
  const message = useErrorMessage();
  const qc = useQueryClient();
  const [declining, setDeclining] = useState(false);
  const [calendarBusy, setCalendarBusy] = useState(false);

  const invalidate = () => Promise.all([qc.invalidateQueries({ queryKey: qk.interviews }), qc.invalidateQueries({ queryKey: qk.interview(i.id) })]);
  const applyUpdate = (updated: Interview) => {
    qc.setQueryData<Interview>(qk.interview(i.id), updated);
    void invalidate();
  };

  const confirm = useMutation({
    mutationFn: async () => (await api.post<{ interview: Interview }>(`/interviews/${i.id}/confirm`)).data.interview,
    onSuccess: (updated) => {
      applyUpdate(updated);
      toast(t('m.interviews.confirmed'));
    },
    onError: (err) => toast(message(err), 'error'),
  });

  const decline = useMutation({
    mutationFn: async (reason: string) => (await api.post<{ interview: Interview }>(`/interviews/${i.id}/decline`, { reason: reason || undefined })).data.interview,
    onSuccess: (updated) => {
      setDeclining(false);
      applyUpdate(updated);
      toast(t('m.interviews.declined'), 'info');
    },
    onError: (err) => toast(message(err), 'error'),
  });

  const join = () => {
    if (!i.meetingUrl) return;
    haptic.tap();
    Linking.openURL(i.meetingUrl).catch(() => toast(t('m.errors.UNKNOWN'), 'error'));
  };

  const calendar = async () => {
    setCalendarBusy(true);
    try {
      const result = await addToCalendar({
        uid: `interview-${i.id}`,
        title: t('m.interviews.calendarTitle', { company: i.company?.name ?? 'Triad Vision' }),
        start: new Date(i.startsAt),
        durationMinutes: minutesBetween(i.startsAt, i.endsAt) || 45,
        location: i.meetingUrl ?? undefined,
        notes: [i.application ? f.tr(i.application.vacancy.title) : null, i.meetingUrl ? `${t('m.interviews.link')}: ${i.meetingUrl}` : null, i.notes].filter(Boolean).join('\n'),
      });
      if (result === 'added') toast(t('m.case.calendarAdded'));
      else if (result === 'denied') toast(t('m.case.calendarDenied'), 'error');
    } catch (err) {
      toast(message(err), 'error');
    } finally {
      setCalendarBusy(false);
    }
  };

  const joinable = canJoin(i);
  const cancelled = i.status === 'CANCELLED';
  const busy = confirm.isPending || decline.isPending;

  return (
    <Card onPress={onPress} index={index} style={cancelled ? { opacity: 0.75 } : undefined}>
      <View style={styles.head}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="h3" numberOfLines={2}>
            {interviewTitle(i, t)}
          </Text>
          {i.application ? (
            <Text variant="small" numberOfLines={2}>
              {t('m.interviews.vacancy')}: {f.tr(i.application.vacancy.title)}
            </Text>
          ) : null}
        </View>
        <InterviewStatusPill status={i.status} />
      </View>

      <View style={styles.when}>
        <Clock3 size={17} color={colors.violet} />
        <Text style={{ fontFamily: fonts.semibold, fontSize: 14.5, flex: 1 }}>
          {f.longDateTime(i.startsAt)} – {f.time(i.endsAt)}
        </Text>
      </View>
      <View style={styles.row}>
        <Video size={15} color={colors.muted} />
        <Text variant="caption">
          {t('m.interviews.minutes', { count: minutesBetween(i.startsAt, i.endsAt) })} · {t('m.interviews.online')}
        </Text>
      </View>

      {!compact && i.notes ? (
        <View style={styles.notes}>
          <Text variant="small" selectable>
            {i.notes}
          </Text>
        </View>
      ) : null}

      {!compact && i.status === 'PROPOSED' ? (
        <Text variant="small" color={colors.warning} style={{ fontFamily: fonts.semibold, marginTop: 4 }}>
          {t('m.interviews.awaiting')}
        </Text>
      ) : null}

      {!compact ? (
        <View style={styles.actions}>
          {i.meetingUrl && !cancelled ? (
            <Button title={t('m.interviews.join')} icon={Video} variant={joinable ? 'primary' : 'secondary'} size="sm" onPress={join} accessibilityHint={joinable ? undefined : t('m.interviews.joinHint')} />
          ) : null}
          {!cancelled ? <Button title={t('m.case.addToCalendar')} icon={CalendarPlus} variant="secondary" size="sm" loading={calendarBusy} onPress={() => void calendar()} /> : null}
          {canConfirm(i) ? <Button title={t('m.interviews.confirm')} icon={Check} variant="success" size="sm" loading={confirm.isPending} disabled={busy} onPress={() => confirm.mutate()} /> : null}
          {canDecline(i) ? (
            <Button title={t('m.interviews.decline')} icon={X} variant="ghost" size="sm" disabled={busy} onPress={() => setDeclining(true)} />
          ) : null}
        </View>
      ) : null}

      <PromptSheet
        visible={declining}
        onClose={() => setDeclining(false)}
        title={t('m.interviews.declineTitle')}
        message={t('m.interviews.declineText')}
        placeholder={t('m.interviews.declineReason')}
        confirmLabel={t('m.interviews.decline')}
        minLength={0}
        destructive
        loading={decline.isPending}
        onSubmit={(reason) => decline.mutate(reason)}
      />
    </Card>
  );
};

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  when: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  notes: { marginTop: 10, padding: 10, borderRadius: radius.md, backgroundColor: colors.surface },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
});
