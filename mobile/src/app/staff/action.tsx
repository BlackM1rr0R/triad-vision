import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { FileUp } from '@/components/icons';
import { useTranslation } from 'react-i18next';
import { Button, Card, ErrorState, Field, ScrollScreen, SkeletonList, StaleHint, StatusBadge, Text, useToast } from '@/components/ui';
import { Note } from '@/features/case/parts';
import { useUploader } from '@/features/case/useDocuments';
import { ACTION_ICON } from '@/features/staff/actionIcons';
import { DateTimeField } from '@/features/staff/DateTimeField';
import { api } from '@/lib/api';
import { STAFF_ACTIONS, missingRequirements, type StaffActionKey } from '@/lib/caseStatus';
import { useFormat } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useAdminCase, useErrorMessage } from '@/lib/queries';
import { qk } from '@/lib/queryClient';
import { colors, fonts, radius, space } from '@/theme';
import type { CaseDetail, StaffAction } from '@/types';

const Toggle = <K extends string>({ value, onChange, items }: { value: K; onChange: (k: K) => void; items: { key: K; label: string; tone?: string }[] }) => (
  <View style={styles.toggle} accessibilityRole="radiogroup">
    {items.map((it) => {
      const active = it.key === value;
      return (
        <Pressable
          key={it.key}
          onPress={() => {
            haptic.select();
            onChange(it.key);
          }}
          accessibilityRole="radio"
          accessibilityState={{ selected: active }}
          style={[styles.toggleItem, active && { backgroundColor: it.tone ?? colors.blue }]}
        >
          <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: active ? colors.white : colors.ink }}>{it.label}</Text>
        </Pressable>
      );
    })}
  </View>
);

/** Combine a date-only and a time-only value into one Date. */
const combine = (date: Date | null, time: Date | null) => {
  if (!date) return null;
  const d = new Date(date);
  if (time) d.setHours(time.getHours(), time.getMinutes(), 0, 0);
  return d;
};

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function StaffActionScreen() {
  const { id, type } = useLocalSearchParams<{ id: string; type: StaffActionKey }>();
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const toast = useToast();
  const message = useErrorMessage();
  const { data: c, isLoading, error, refetch } = useAdminCase(id);

  const initialAt = c?.appointmentAt ? new Date(c.appointmentAt) : null;
  const [note, setNote] = useState('');
  const [date, setDate] = useState<Date | null>(initialAt);
  const [time, setTime] = useState<Date | null>(initialAt);
  const [place, setPlace] = useState(c?.appointmentPlace ?? '');
  const [decision, setDecision] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [validFrom, setValidFrom] = useState<Date | null>(null);
  const [validTo, setValidTo] = useState<Date | null>(null);
  const [reopenTo, setReopenTo] = useState<'DOCUMENTS_PENDING' | 'EMBASSY_DOCUMENTS'>('EMBASSY_DOCUMENTS');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const invalidateAll = () =>
    Promise.all([qc.invalidateQueries({ queryKey: qk.adminCase(id) }), qc.invalidateQueries({ queryKey: ['admin', 'cases'] }), qc.invalidateQueries({ queryKey: qk.dashboard })]);
  const { progress, upload } = useUploader(invalidateAll);

  // Prefill the appointment fields once the case is loaded (when opened without a cached case).
  const prefilled = useRef(false);
  useEffect(() => {
    if (!c || prefilled.current) return;
    prefilled.current = true;
    if (c.appointmentAt) {
      setDate((d) => d ?? new Date(c.appointmentAt!));
      setTime((d) => d ?? new Date(c.appointmentAt!));
    }
    if (c.appointmentPlace) setPlace((p) => p || c.appointmentPlace!);
  }, [c]);

  const valid = useMemo(() => (c ? STAFF_ACTIONS[c.status].includes(type) : false), [c, type]);

  if (isLoading)
    return (
      <View style={{ padding: space.lg }}>
        <SkeletonList count={2} lines={3} />
      </View>
    );
  // Keep the form usable with the last loaded case when a background refetch fails.
  if (!c) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const Icon = ACTION_ICON[type];
  const titleKey = type === 'SCHEDULE' && c.status === 'APPOINTMENT_SCHEDULED' ? 'RESCHEDULE' : type;

  const done = () => {
    toast(t('m.staff.done'));
    router.back();
  };

  const run = async (body: StaffAction) => {
    setBusy(true);
    setProblem(null);
    try {
      const { data } = await api.post<{ case: CaseDetail }>(`/admin/cases/${id}/actions`, body);
      qc.setQueryData(qk.adminCase(id), data.case);
      await invalidateAll();
      done();
    } catch (err) {
      haptic.error();
      setProblem(message(err));
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    const n = note.trim();
    switch (type) {
      case 'REQUEST_CHANGES':
      case 'REJECT_SIGNATURE':
        if (n.length < 3) return setProblem(t('m.errors.NOTE_REQUIRED'));
        return run({ action: type, note: n });
      case 'CONFIRM_CONTRACT':
      case 'MARK_LODGED':
        return run({ action: type });
      case 'SCHEDULE': {
        const at = combine(date, time);
        if (!at || place.trim().length < 3) return setProblem(t('m.errors.REQUIRED_FIELDS'));
        return run({ action: 'SCHEDULE_APPOINTMENT', at: at.toISOString(), place: place.trim(), note: n || undefined });
      }
      case 'DECIDE':
        if (decision === 'REJECTED' && !n) return setProblem(t('m.errors.REASON_REQUIRED'));
        return run({
          action: 'DECIDE',
          decision,
          reason: n || undefined,
          validFrom: decision === 'APPROVED' && validFrom ? ymd(validFrom) : undefined,
          validTo: decision === 'APPROVED' && validTo ? ymd(validTo) : undefined,
        });
      case 'CANCEL':
        if (n.length < 3) return setProblem(t('m.errors.REASON_REQUIRED'));
        return run({ action: 'CANCEL', reason: n });
      case 'REOPEN':
        return run({ action: 'REOPEN', to: reopenTo, note: n || undefined });
      default:
        return undefined;
    }
  };

  const sendContract = async () => {
    const ok = await upload('contract', `/admin/cases/${id}/documents`, 'files', { stage: 'CONTRACT' }, { pdfOnly: true, successMessage: t('m.staff.done') });
    if (ok) router.back();
  };

  const missingInitial = missingRequirements(c.requirements, 'INITIAL', 'accepted');
  const missingEmbassy = missingRequirements(c.requirements, 'EMBASSY', 'accepted');
  const destructive = type === 'CANCEL' || type === 'REJECT_SIGNATURE' || (type === 'DECIDE' && decision === 'REJECTED');

  return (
    <ScrollScreen keyboard>
      <Stack.Screen options={{ title: t(`m.staff.actions.${titleKey}`) }} />
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={styles.icon}>{Icon ? <Icon size={22} color={colors.blue} /> : null}</View>
          <View style={{ flex: 1 }}>
            <Text variant="h3">{t(`m.staff.actions.${titleKey}`)}</Text>
            <Text variant="caption">
              {c.number} · {c.client.firstName} {c.client.lastName}
            </Text>
          </View>
        </View>
        <StatusBadge status={c.status} staff style={{ marginTop: 10 }} />
        <Text variant="small" style={{ marginTop: 10 }}>
          {t(`m.staff.actionHelp.${type}`)}
        </Text>
      </Card>

      {!valid ? (
        <Note tone="danger" text={t('portal.errors.INVALID_TRANSITION')} />
      ) : (
        <>
          {type === 'SEND_CONTRACT' ? (
            <>
              {c.status === 'DOCUMENTS_REVIEW' && missingInitial.length ? (
                <Note tone="warning" text={`${t('m.staff.detail.missingAccepted', { count: missingInitial.length })}\n${missingInitial.map((r) => `• ${f.tr(r.title)}`).join('\n')}`} />
              ) : null}
              {progress.contract !== undefined ? (
                <Text variant="small" center>
                  {t('m.case.uploading', { percent: Math.round(progress.contract * 100) })}
                </Text>
              ) : null}
              <Button
                title={t('m.staff.fields.pickPdf')}
                icon={FileUp}
                size="lg"
                loading={progress.contract !== undefined}
                disabled={c.status === 'DOCUMENTS_REVIEW' && missingInitial.length > 0}
                onPress={sendContract}
              />
            </>
          ) : null}

          {type === 'SCHEDULE' ? (
            <>
              {c.status === 'EMBASSY_REVIEW' && missingEmbassy.length ? (
                <Note tone="warning" text={t('m.staff.detail.missingAccepted', { count: missingEmbassy.length })} />
              ) : null}
              <View style={{ flexDirection: 'row', gap: space.md }}>
                <DateTimeField label={t('m.staff.fields.date')} mode="date" value={date} onChange={setDate} minimumDate={new Date()} placeholder={t('m.staff.fields.setDate')} />
                <DateTimeField label={t('m.staff.fields.time')} mode="time" value={time} onChange={setTime} placeholder="--:--" />
              </View>
              <Text variant="caption">{t('m.staff.fields.timezoneHint')}</Text>
              <Field label={t('m.staff.fields.place')} value={place} onChangeText={setPlace} placeholder={t('m.staff.fields.placePh')} maxLength={300} />
            </>
          ) : null}

          {type === 'DECIDE' ? (
            <>
              <Text variant="label">{t('m.staff.fields.decision')}</Text>
              <Toggle
                value={decision}
                onChange={setDecision}
                items={[
                  { key: 'APPROVED', label: t('m.staff.fields.approved'), tone: colors.success },
                  { key: 'REJECTED', label: t('m.staff.fields.rejected'), tone: colors.danger },
                ]}
              />
              {decision === 'APPROVED' ? (
                <View style={{ flexDirection: 'row', gap: space.md }}>
                  <DateTimeField label={t('m.staff.fields.validFrom')} mode="date" value={validFrom} onChange={setValidFrom} placeholder={t('m.staff.fields.setDate')} />
                  <DateTimeField label={t('m.staff.fields.validTo')} mode="date" value={validTo} onChange={setValidTo} placeholder={t('m.staff.fields.setDate')} />
                </View>
              ) : null}
            </>
          ) : null}

          {type === 'REOPEN' ? (
            <>
              <Text variant="label">{t('m.staff.fields.reopenTo')}</Text>
              <Toggle
                value={reopenTo}
                onChange={setReopenTo}
                items={[
                  { key: 'DOCUMENTS_PENDING', label: t('m.staff.fields.reopenInitial') },
                  { key: 'EMBASSY_DOCUMENTS', label: t('m.staff.fields.reopenEmbassy') },
                ]}
              />
            </>
          ) : null}

          {type === 'CONFIRM_CONTRACT' && !c.contract?.signedFile ? <Note tone="warning" text={t('m.staff.detail.notSigned')} /> : null}

          {['REQUEST_CHANGES', 'REJECT_SIGNATURE', 'SCHEDULE', 'DECIDE', 'CANCEL', 'REOPEN'].includes(type) ? (
            <Field
              label={
                type === 'CANCEL' || type === 'REJECT_SIGNATURE' || (type === 'DECIDE' && decision === 'REJECTED')
                  ? t('m.staff.fields.reason')
                  : type === 'REQUEST_CHANGES'
                    ? t('m.staff.fields.note')
                    : t('m.staff.fields.optionalNote')
              }
              value={note}
              onChangeText={setNote}
              placeholder={type === 'REQUEST_CHANGES' ? t('m.staff.fields.notePh') : t('m.staff.fields.reasonPh')}
              multiline
              maxLength={2000}
            />
          ) : null}

          {problem ? (
            <Text variant="small" color={colors.danger} accessibilityRole="alert">
              {problem}
            </Text>
          ) : null}

          {type !== 'SEND_CONTRACT' ? (
            <Button title={t(`m.staff.actions.${titleKey}`)} icon={Icon} size="lg" variant={destructive ? 'danger' : 'primary'} loading={busy} onPress={submit} />
          ) : null}
        </>
      )}
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  icon: { width: 44, height: 44, borderRadius: 13, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' },
  toggle: { flexDirection: 'row', gap: 6, padding: 4, borderRadius: radius.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  toggleItem: { flex: 1, height: 42, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
});
