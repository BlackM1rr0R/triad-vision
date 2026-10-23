import { useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Building2, CalendarDays, CheckCircle2, Circle, Clock, ExternalLink, FileText, Landmark, MapPin, Plus, Undo2, Users } from '@/components/icons';
import { Button, Card, Field, Section, Text, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useErrorMessage } from '@/lib/queries';
import { qk } from '@/lib/queryClient';
import { colors, radius } from '@/theme';
import type { CaseDetail } from '@/types';
import '@/i18n/clientProcess';
import { useOpenDocument } from './useDocuments';

/**
 * Client-process blocks of the case screen: "who acts next" (ball in court, from the case payload),
 * the client's tasks (mark done / undo) and office visits (book / cancel). Server: /api/client-process.
 */

type Side = 'CLIENT' | 'TEAM' | 'EMBASSY' | 'NONE';
interface BallItem {
  side: Exclude<Side, 'NONE'>;
  reason: string;
  count: number;
  dueAt: string | null;
  overdue: boolean;
}
export interface BallInCourt {
  side: Side;
  reason: string;
  count: number;
  dueAt: string | null;
  overdue: boolean;
  since: string;
  days: number;
  eta: { minHours: number; maxHours: number; expectedBy: string; late: boolean } | null;
  items: BallItem[];
  totals: Record<'CLIENT' | 'TEAM' | 'EMBASSY', number>;
}

const SIDE_STYLE: Record<Side, { bg: string; fg: string; icon: typeof Users }> = {
  CLIENT: { bg: colors.warningSoft, fg: colors.warning, icon: Users },
  TEAM: { bg: colors.skySoft, fg: colors.sky, icon: Building2 },
  EMBASSY: { bg: colors.violetSoft, fg: colors.violet, icon: Landmark },
  NONE: { bg: colors.surface, fg: colors.muted, icon: CheckCircle2 },
};

/** ETA text: hours below 72 h, days below 21 days, weeks otherwise. */
export const useEtaText = () => {
  const { t } = useTranslation();
  return (minHours: number, maxHours: number) => {
    const unit = maxHours < 72 ? 'hours' : maxHours < 21 * 24 ? 'days' : 'weeks';
    const div = unit === 'hours' ? 1 : unit === 'days' ? 24 : 24 * 7;
    const min = Math.max(1, Math.round(minHours / div));
    const max = Math.max(1, Math.round(maxHours / div));
    return min === max ? t(`m.cp.eta.${unit}One`, { max }) : t(`m.cp.eta.${unit}`, { min, max });
  };
};

export const BallCard = ({ c }: { c: CaseDetail }) => {
  const { t } = useTranslation();
  const f = useFormat();
  const eta = useEtaText();
  const ball = (c as CaseDetail & { ballInCourt?: BallInCourt | null }).ballInCourt;
  if (!ball) return null;
  const s = SIDE_STYLE[ball.side];
  const Icon = s.icon;
  const reason = t(`m.cp.reason.${ball.reason}`, { count: ball.count });
  const detail = [
    ball.side === 'CLIENT' && ball.dueAt ? t('m.cp.due', { date: f.date(ball.dueAt) }) : null,
    (ball.side === 'TEAM' || ball.side === 'EMBASSY') && ball.eta ? eta(ball.eta.minHours, ball.eta.maxHours) : null,
    ball.side !== 'NONE' && ball.days > 0 ? t('m.cp.since', { days: ball.days }) : null,
  ].filter(Boolean);
  const also = ball.side !== 'CLIENT' ? ball.items.filter((i) => i.side === 'CLIENT') : [];
  return (
    <Card style={[{ backgroundColor: s.bg, borderColor: ball.overdue ? colors.danger : s.bg }, ball.overdue && { borderWidth: 1.5 }]}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <View style={[styles.iconBox, { backgroundColor: colors.white }]}>
          <Icon size={22} color={s.fg} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="caption" color={s.fg} weight="semibold">
            {t(`m.cp.side.${ball.side}`)}
          </Text>
          <Text variant="h3">{reason}</Text>
          {detail.length ? <Text variant="small">{detail.join(' · ')}</Text> : null}
          {ball.overdue ? (
            <Text variant="small" color={colors.danger} weight="semibold">
              {t('m.cp.overdue')}
            </Text>
          ) : null}
        </View>
      </View>
      {also.length ? (
        <Text variant="small" style={{ marginTop: 10 }} color={also.some((i) => i.overdue) ? colors.danger : colors.ink}>
          {t('m.cp.also', { list: also.map((i) => t(`m.cp.reason.${i.reason}`, { count: i.count })).join(', ') })}
        </Text>
      ) : null}
    </Card>
  );
};

// ─── Tasks ────────────────────────────────────────────────────────────

interface ClientTask {
  id: string;
  title: string;
  description: string | null;
  dueAt: string | null;
  status: 'OPEN' | 'DONE' | 'CANCELLED';
  state: 'open' | 'due_soon' | 'overdue' | 'done';
  requirement: { id: string; title: string } | null;
  linkUrl: string | null;
  attachmentId: string | null;
  clientNote: string | null;
  completedVia: string | null;
}

const tasksKey = (caseId: string) => ['client-process', 'tasks', caseId] as const;

const STATE_COLOR: Record<ClientTask['state'], string> = { open: colors.muted, due_soon: colors.warning, overdue: colors.danger, done: colors.success };

export const ClientTasksSection = ({ c }: { c: CaseDetail }) => {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const toast = useToast();
  const message = useErrorMessage();
  const { open, openingId } = useOpenDocument();
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const { data } = useQuery({
    queryKey: tasksKey(c.id),
    queryFn: async () => (await api.get<{ tasks: ClientTask[] }>('/client-process/tasks', { params: { caseId: c.id } })).data.tasks,
  });
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: tasksKey(c.id) }), qc.invalidateQueries({ queryKey: qk.case(c.id) })]);
  const act = useMutation({
    mutationFn: async ({ id, kind, note: n }: { id: string; kind: 'done' | 'reopen'; note?: string }) =>
      api.post(`/client-process/tasks/${id}/${kind}`, kind === 'done' ? { note: n || undefined } : {}),
    onSuccess: async (_r, v) => {
      haptic.success();
      if (v.kind === 'done') toast(t('m.cp.tasks.marked'));
      setNoteFor(null);
      setNote('');
      await refresh();
    },
    onError: (err) => toast(message(err), 'error'),
  });
  const tasks = data ?? [];
  if (!tasks.length) return null;

  return (
    <Section title={t('m.cp.tasks.title')} icon={CheckCircle2}>
      <View style={{ gap: 10 }}>
        {tasks.map((task) => {
          const doneState = task.status === 'DONE';
          const attachment = task.attachmentId ? c.otherDocuments.find((d) => d.id === task.attachmentId) : undefined;
          return (
            <View key={task.id} style={[styles.task, task.state === 'overdue' && { borderColor: colors.danger, backgroundColor: colors.dangerSoft }]}>
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                {doneState ? <CheckCircle2 size={20} color={colors.success} /> : <Circle size={20} color={STATE_COLOR[task.state]} />}
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="title" style={doneState ? { textDecorationLine: 'line-through', color: colors.muted } : undefined}>
                    {task.title}
                  </Text>
                  <Text variant="caption" color={STATE_COLOR[task.state]}>
                    {t(`m.cp.tasks.state.${task.state}`)}
                    {task.dueAt ? ` · ${t('m.cp.due', { date: f.date(task.dueAt) })}` : ''}
                  </Text>
                  {task.description && !doneState ? <Text variant="small">{task.description}</Text> : null}
                  {task.requirement && !doneState ? <Text variant="small">{t('m.cp.tasks.upload', { doc: task.requirement.title })}</Text> : null}
                  {doneState && task.completedVia === 'UPLOAD' ? <Text variant="caption">{t('m.cp.tasks.autoDone')}</Text> : null}
                  {task.clientNote ? <Text variant="caption">“{task.clientNote}”</Text> : null}
                </View>
              </View>
              {!doneState && (task.linkUrl || attachment) ? (
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                  {task.linkUrl ? <Button size="sm" variant="secondary" icon={ExternalLink} title={t('m.cp.tasks.openLink')} onPress={() => void Linking.openURL(task.linkUrl!)} /> : null}
                  {attachment ? <Button size="sm" variant="secondary" icon={FileText} title={t('m.cp.tasks.attachment')} loading={openingId === attachment.id} onPress={() => void open(attachment)} /> : null}
                </View>
              ) : null}
              {!doneState && noteFor === task.id ? (
                <View style={{ gap: 8, marginTop: 8 }}>
                  <Field placeholder={t('m.cp.tasks.notePlaceholder')} value={note} onChangeText={setNote} maxLength={2000} multiline />
                  <Button title={t('m.cp.tasks.done')} icon={CheckCircle2} variant="success" loading={act.isPending} onPress={() => act.mutate({ id: task.id, kind: 'done', note })} />
                </View>
              ) : !doneState ? (
                <Button
                  style={{ marginTop: 8 }}
                  size="sm"
                  variant="secondary"
                  icon={CheckCircle2}
                  title={t('m.cp.tasks.done')}
                  onPress={() => {
                    setNote('');
                    setNoteFor(task.id);
                  }}
                />
              ) : task.completedVia === 'CLIENT' ? (
                <Button style={{ marginTop: 8 }} size="sm" variant="ghost" icon={Undo2} title={t('m.cp.tasks.undo')} loading={act.isPending} onPress={() => act.mutate({ id: task.id, kind: 'reopen' })} />
              ) : null}
            </View>
          );
        })}
      </View>
    </Section>
  );
};

// ─── Office visits ────────────────────────────────────────────────────

interface Visit {
  id: string;
  status: 'BOOKED' | 'CANCELLED' | 'DONE' | 'NO_SHOW';
  reason: Reason;
  startsAt: string;
  endsAt: string;
  location: string | null;
  canCancel: boolean;
}
interface Slot {
  id: string;
  startsAt: string;
  endsAt: string;
  location: string | null;
  free: number;
}
const REASONS = ['originals', 'passport', 'sign', 'other'] as const;
type Reason = (typeof REASONS)[number];
const visitsKey = (caseId: string) => ['client-process', 'visits', caseId] as const;

const Chip = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => (
  <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
    <Text variant="label" color={active ? colors.white : colors.navy}>
      {label}
    </Text>
  </Pressable>
);

export const OfficeVisitsSection = ({ c }: { c: CaseDetail }) => {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const toast = useToast();
  const message = useErrorMessage();
  const [booking, setBooking] = useState(false);
  const [reason, setReason] = useState<Reason>('originals');
  const [slotId, setSlotId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const closed = c.status === 'APPROVED' || c.status === 'REJECTED' || c.status === 'CANCELLED';

  const visits = useQuery({
    queryKey: visitsKey(c.id),
    queryFn: async () => (await api.get<{ visits: Visit[] }>('/client-process/office/visits', { params: { caseId: c.id } })).data.visits,
  });
  const slots = useQuery({
    queryKey: ['client-process', 'office-slots'],
    queryFn: async () => (await api.get<{ slots: Slot[] }>('/client-process/office/slots')).data.slots,
    enabled: booking,
  });
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: visitsKey(c.id) }), qc.invalidateQueries({ queryKey: ['client-process', 'office-slots'] })]);

  const book = useMutation({
    mutationFn: async () => api.post('/client-process/office/visits', { caseId: c.id, slotId, reason, message: note.trim() || undefined }),
    onSuccess: async () => {
      haptic.success();
      toast(t('m.cp.office.booked'));
      setBooking(false);
      setSlotId(null);
      setNote('');
      await refresh();
    },
    onError: (err) => toast(message(err), 'error'),
  });
  const cancel = (v: Visit) =>
    Alert.alert(t('m.cp.office.cancelConfirm'), f.longDateTime(v.startsAt), [
      { text: t('m.common.cancel'), style: 'cancel' },
      {
        text: t('m.cp.office.cancel'),
        style: 'destructive',
        onPress: async () => {
          try {
            await api.post(`/client-process/office/visits/${v.id}/cancel`);
            toast(t('m.cp.office.cancelled'));
            await refresh();
          } catch (err) {
            toast(message(err), 'error');
          }
        },
      },
    ]);

  const list = (visits.data ?? []).filter((v) => v.status !== 'CANCELLED' || new Date(v.startsAt) > new Date());
  if (closed && !list.length) return null;
  const needsNote = reason === 'other' && !note.trim();

  return (
    <Section title={t('m.cp.office.title')} icon={Building2}>
      <View style={{ gap: 10 }}>
        {list.length === 0 && !booking ? <Text variant="small">{t('m.cp.office.empty')}</Text> : null}
        {list.map((v) => (
          <View key={v.id} style={styles.task}>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <CalendarDays size={18} color={colors.violet} />
              <Text variant="title" style={{ flex: 1 }}>
                {f.longDateTime(v.startsAt)}
              </Text>
            </View>
            <Text variant="small">
              {t(`m.cp.office.reason.${v.reason}`)} · {t(`m.cp.office.status.${v.status}`)}
            </Text>
            {v.location ? (
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 4 }}>
                <MapPin size={14} color={colors.muted} />
                <Text variant="caption" style={{ flex: 1 }} selectable>
                  {v.location}
                </Text>
              </View>
            ) : null}
            {v.canCancel ? <Button style={{ marginTop: 8 }} size="sm" variant="ghost" title={t('m.cp.office.cancel')} onPress={() => cancel(v)} /> : null}
          </View>
        ))}
        {!closed && !booking ? <Button title={t('m.cp.office.book')} icon={Plus} variant="secondary" onPress={() => setBooking(true)} /> : null}
        {booking ? (
          <View style={{ gap: 10 }}>
            <Text variant="label">{t('m.cp.office.chooseReason')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {REASONS.map((r) => (
                <Chip key={r} label={t(`m.cp.office.reason.${r}`)} active={reason === r} onPress={() => setReason(r)} />
              ))}
            </View>
            <Text variant="label">{t('m.cp.office.chooseSlot')}</Text>
            {slots.data && slots.data.length === 0 ? <Text variant="small">{t('m.cp.office.noSlots')}</Text> : null}
            {(slots.data ?? []).slice(0, 30).map((s) => (
              <Pressable key={s.id} accessibilityRole="button" onPress={() => setSlotId(s.id)} style={[styles.slot, slotId === s.id && styles.slotActive]}>
                <Clock size={16} color={slotId === s.id ? colors.blue : colors.muted} />
                <View style={{ flex: 1 }}>
                  <Text variant="title">{f.longDateTime(s.startsAt)}</Text>
                  {s.location ? <Text variant="caption">{s.location}</Text> : null}
                </View>
                <Text variant="caption">{t('m.cp.office.free', { count: s.free })}</Text>
              </Pressable>
            ))}
            <Field label={t('m.cp.office.message')} value={note} onChangeText={setNote} maxLength={1000} multiline hint={reason === 'other' ? t('m.cp.office.messageRequired') : undefined} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button style={{ flex: 1 }} variant="secondary" title={t('m.common.cancel')} onPress={() => setBooking(false)} />
              <Button style={{ flex: 1 }} title={t('m.cp.office.confirm')} disabled={!slotId || needsNote} loading={book.isPending} onPress={() => book.mutate()} />
            </View>
          </View>
        ) : null}
      </View>
    </Section>
  );
};

const styles = StyleSheet.create({
  iconBox: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  task: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 12, backgroundColor: colors.card },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, minHeight: 36, justifyContent: 'center' },
  chipActive: { backgroundColor: colors.blue, borderColor: colors.blue },
  slot: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, minHeight: 48 },
  slotActive: { borderColor: colors.blue, backgroundColor: colors.blueSoft },
});

