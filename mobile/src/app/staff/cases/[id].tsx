import { useCallback, useState } from 'react';
import { Linking, ScrollView, RefreshControl, StyleSheet, View } from 'react-native';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Ban, FileSignature, FolderOpen, Gavel, History, Landmark, Mail, NotebookPen, Phone, Route, UserCheck, UserRound } from '@/components/icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Card,
  Chips,
  ErrorState,
  Field,
  PromptSheet,
  Section,
  SkeletonList,
  StaleHint,
  StatusBadge,
  Stepper,
  Text,
  useToast,
} from '@/components/ui';
import { FileItem, InfoRow, Note, RequirementCard, Timeline } from '@/features/case/parts';
import { useOpenDocument } from '@/features/case/useDocuments';
import { ACTION_ICON } from '@/features/staff/actionIcons';
import { ChatView } from '@/features/chat/ChatView';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { STAFF_ACTIONS, missingRequirements, type StaffActionKey } from '@/lib/caseStatus';
import { useFormat } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useAdminCase, useErrorMessage } from '@/lib/queries';
import { qk } from '@/lib/queryClient';
import { colors, fonts, space } from '@/theme';
import type { CaseDetail, CaseDocument, CaseMessage, DocStage } from '@/types';

type Tab = 'overview' | 'documents' | 'messages' | 'notes' | 'timeline';


const useInvalidate = (id: string) => {
  const qc = useQueryClient();
  return useCallback(
    () => Promise.all([qc.invalidateQueries({ queryKey: qk.adminCase(id) }), qc.invalidateQueries({ queryKey: ['admin', 'cases'] }), qc.invalidateQueries({ queryKey: qk.dashboard })]),
    [qc, id],
  );
};

const Overview = ({ c }: { c: CaseDetail }) => {
  const { t } = useTranslation();
  const f = useFormat();
  const { user } = useAuth();
  const toast = useToast();
  const message = useErrorMessage();
  const invalidate = useInvalidate(c.id);
  const [assigning, setAssigning] = useState(false);
  const actions = STAFF_ACTIONS[c.status];
  const primary = actions.filter((a) => a !== 'CANCEL');

  const assignToMe = async () => {
    setAssigning(true);
    try {
      await api.patch(`/admin/cases/${c.id}`, { assignedStaffId: user!.id });
      await invalidate();
      toast(t('m.staff.detail.assignedToMe'));
    } catch (err) {
      toast(message(err), 'error');
    } finally {
      setAssigning(false);
    }
  };

  const go = (a: StaffActionKey) => router.push({ pathname: '/staff/action', params: { id: c.id, type: a } });

  return (
    <View style={{ gap: space.lg }}>
      <Card index={0}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text variant="caption">{c.number}</Text>
          <Text variant="caption">
            {t('m.staff.detail.created')} {f.date(c.createdAt)}
          </Text>
        </View>
        <StatusBadge status={c.status} staff style={{ marginTop: 8 }} />
        <Text style={{ marginTop: 10 }}>{t(`m.staff.situation.${c.status}`)}</Text>
        {c.staffNote ? (
          <View style={{ marginTop: 10 }}>
            <Note tone="info" title={t('m.staff.detail.staffNote')} text={c.staffNote} />
          </View>
        ) : null}
      </Card>

      <Section title={t('m.staff.detail.actions')} icon={Route} index={1}>
        {primary.length === 0 ? (
          <Text variant="small">{t('m.staff.detail.noActions')}</Text>
        ) : (
          <View style={{ gap: 10 }}>
            {primary.map((a, i) => (
              <Button
                key={a}
                title={t(`m.staff.actions.${a === 'SCHEDULE' && c.status === 'APPOINTMENT_SCHEDULED' ? 'RESCHEDULE' : a}`)}
                icon={ACTION_ICON[a]}
                variant={i === 0 ? 'primary' : a === 'REJECT_SIGNATURE' || a === 'REQUEST_CHANGES' ? 'secondary' : 'secondary'}
                onPress={() => go(a)}
              />
            ))}
          </View>
        )}
        {actions.includes('CANCEL') ? (
          <Button title={t('m.staff.actions.CANCEL')} icon={Ban} variant="ghost" size="sm" onPress={() => go('CANCEL')} style={{ marginTop: 8, alignSelf: 'flex-start' }} />
        ) : null}
      </Section>

      <Section title={t('m.staff.detail.client')} icon={UserRound} index={2}>
        <Text style={{ fontFamily: fonts.semibold, fontSize: 16 }} selectable>
          {c.client.firstName} {c.client.lastName}
        </Text>
        <InfoRow label={t('auth.email')} value={c.client.email} />
        <InfoRow label={t('auth.phone')} value={c.client.phone} />
        <InfoRow label={t('m.staff.detail.profession')} value={c.profession} />
        <InfoRow label={t('m.staff.detail.visa')} value={c.visaCategory ? `${f.tr(c.visaCategory.title)} · ${c.visaCategory.visaLabel}` : null} />
        <InfoRow label={t('m.staff.detail.assigned')} value={c.assignedStaff ? `${c.assignedStaff.firstName} ${c.assignedStaff.lastName}` : t('m.staff.detail.unassigned')} />
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          {c.client.phone ? (
            <Button title={t('m.common.call')} icon={Phone} size="sm" variant="secondary" onPress={() => void Linking.openURL(`tel:${c.client.phone!.replace(/\s/g, '')}`)} />
          ) : null}
          <Button title={t('m.common.email')} icon={Mail} size="sm" variant="secondary" onPress={() => void Linking.openURL(`mailto:${c.client.email}`)} />
          {c.assignedStaff?.id !== user?.id ? (
            <Button title={t('m.staff.detail.assignToMe')} icon={UserCheck} size="sm" variant="secondary" loading={assigning} onPress={assignToMe} />
          ) : null}
        </View>
      </Section>

      {c.appointmentAt ? (
        <Section title={t('m.staff.detail.appointment')} icon={Landmark}>
          <Text style={{ fontFamily: fonts.semibold }}>{f.longDateTime(c.appointmentAt)}</Text>
          {c.appointmentPlace ? <Text variant="small">{c.appointmentPlace}</Text> : null}
        </Section>
      ) : null}

      {c.status === 'APPROVED' || c.status === 'REJECTED' ? (
        <Section title={t('m.staff.detail.decision')} icon={Gavel}>
          <StatusBadge status={c.status} staff />
          {c.decisionAt ? <Text variant="caption" style={{ marginTop: 6 }}>{f.dateTime(c.decisionAt)}</Text> : null}
          {c.decisionReason ? <Text style={{ marginTop: 6 }}>{c.decisionReason}</Text> : null}
          {c.visaValidFrom && c.visaValidTo ? (
            <Text variant="small" style={{ marginTop: 6 }}>
              {t('m.case.validity', { from: f.date(c.visaValidFrom), to: f.date(c.visaValidTo) })}
            </Text>
          ) : null}
        </Section>
      ) : null}
      {c.status === 'CANCELLED' && c.cancelReason ? <Note tone="warning" title={t('m.staff.status.CANCELLED')} text={c.cancelReason} /> : null}

      <Section title={t('m.staff.detail.workflow')} icon={Route}>
        <Stepper status={c.status} />
      </Section>
    </View>
  );
};

const Documents = ({ c }: { c: CaseDetail }) => {
  const { t } = useTranslation();
  const f = useFormat();
  const toast = useToast();
  const message = useErrorMessage();
  const invalidate = useInvalidate(c.id);
  const { open, openingId } = useOpenDocument();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState<CaseDocument | null>(null);

  const review = async (doc: CaseDocument, status: 'ACCEPTED' | 'REJECTED' | 'PENDING', note?: string) => {
    setBusy(true);
    try {
      await api.post(`/admin/cases/${c.id}/documents/${doc.id}/review`, { status, note });
      await invalidate();
      if (status === 'ACCEPTED') toast(t('m.staff.detail.accepted'));
      else if (status === 'REJECTED') toast(t('m.staff.detail.rejected'), 'info');
      setRejecting(null);
    } catch (err) {
      toast(message(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const staffActions = {
    onAccept: (d: CaseDocument) => void review(d, 'ACCEPTED'),
    onReject: (d: CaseDocument) => setRejecting(d),
    onReset: (d: CaseDocument) => void review(d, 'PENDING'),
    busy,
  };

  const stageBlock = (stage: DocStage, title: string) => {
    const reqs = c.requirements.filter((r) => r.stage === stage);
    if (!reqs.length) return null;
    const missing = missingRequirements(c.requirements, stage, 'accepted');
    return (
      <Section title={title} icon={FolderOpen} key={stage}>
        {missing.length ? <Note tone="warning" text={t('m.staff.detail.missingAccepted', { count: missing.length })} /> : null}
        {reqs.map((r) => (
          <RequirementCard key={r.id} req={r} onOpen={open} openingId={openingId} staff={staffActions} />
        ))}
      </Section>
    );
  };

  const embassyFirst = c.status === 'EMBASSY_DOCUMENTS' || c.status === 'EMBASSY_REVIEW';

  return (
    <View style={{ gap: space.lg }}>
      {embassyFirst ? stageBlock('EMBASSY', t('m.staff.detail.embassyDocs')) : null}
      {stageBlock('INITIAL', t('m.staff.detail.initialDocs'))}
      {c.contract ? (
        <Section title={t('m.staff.detail.contract')} icon={FileSignature}>
          <Text variant="caption">{t('m.staff.detail.contractVersion', { version: c.contract.version, date: f.date(c.contract.sentAt) })}</Text>
          <View style={{ gap: 8, marginTop: 8 }}>
            {c.contract.file ? <FileItem doc={c.contract.file} onOpen={open} opening={openingId === c.contract.file.id} /> : null}
            {c.contract.signedAt && c.contract.signerName ? (
              <Note tone="success" text={`${t('m.staff.detail.signedBy', { name: c.contract.signerName, date: f.dateTime(c.contract.signedAt) })}${c.contract.signerIp ? `\n${t('m.staff.detail.signerIp', { ip: c.contract.signerIp })}` : ''}`} />
            ) : (
              <Text variant="small">{t('m.staff.detail.notSigned')}</Text>
            )}
            {c.contract.signedFile ? <FileItem doc={c.contract.signedFile} onOpen={open} opening={openingId === c.contract.signedFile.id} /> : null}
          </View>
        </Section>
      ) : null}
      {!embassyFirst ? stageBlock('EMBASSY', t('m.staff.detail.embassyDocs')) : null}
      {c.otherDocuments.length ? (
        <Section title={t('m.staff.detail.otherFiles')} icon={FolderOpen}>
          <View style={{ gap: 8 }}>
            {c.otherDocuments.map((d) => (
              <FileItem key={d.id} doc={d} onOpen={open} opening={openingId === d.id} />
            ))}
          </View>
        </Section>
      ) : null}
      <PromptSheet
        visible={!!rejecting}
        onClose={() => setRejecting(null)}
        title={t('m.staff.detail.rejectTitle')}
        message={rejecting?.originalName}
        placeholder={t('m.staff.detail.rejectNotePh')}
        confirmLabel={t('m.staff.detail.reject')}
        destructive
        loading={busy}
        onSubmit={(note) => rejecting && void review(rejecting, 'REJECTED', note)}
      />
    </View>
  );
};

const Notes = ({ c }: { c: CaseDetail }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const message = useErrorMessage();
  const invalidate = useInvalidate(c.id);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const notes = c.events.filter((e) => e.type === 'INTERNAL_NOTE');

  const add = async () => {
    if (!note.trim()) return;
    setBusy(true);
    try {
      await api.post(`/admin/cases/${c.id}/notes`, { note: note.trim() });
      setNote('');
      await invalidate();
      toast(t('m.staff.detail.noteAdded'));
    } catch (err) {
      toast(message(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: space.lg }}>
      <Card>
        <Field value={note} onChangeText={setNote} placeholder={t('m.staff.detail.notePh')} multiline maxLength={4000} />
        <Button title={t('common.save')} icon={NotebookPen} onPress={add} loading={busy} disabled={!note.trim()} style={{ marginTop: space.md }} />
      </Card>
      {notes.length === 0 ? (
        <Text variant="small" center>
          {t('m.staff.detail.notesEmpty')}
        </Text>
      ) : (
        <Card>
          <Timeline events={notes} limit={20} staff />
        </Card>
      )}
    </View>
  );
};

export default function StaffCase() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: c, isLoading, error, refetch } = useAdminCase(id);
  const [tab, setTab] = useState<Tab>('overview');
  const [refreshing, setRefreshing] = useState(false);

  // The chat has no push-to-screen channel: poll every 15 s while the messages tab is on screen
  // (same cadence as the client chat).
  const chatOpen = tab === 'messages';
  useFocusEffect(
    useCallback(() => {
      if (!chatOpen) return undefined;
      void refetch();
      const timer = setInterval(() => void refetch(), 15_000);
      return () => clearInterval(timer);
    }, [chatOpen, refetch]),
  );

  const refresh = async () => {
    haptic.select();
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const sendMessage = async (body: string) => {
    const { data } = await api.post<{ message: Omit<CaseMessage, 'author'> }>(`/admin/cases/${id}/messages`, { body });
    // Show it immediately, then refetch so a poll that was already in flight cannot overwrite it.
    qc.setQueryData<CaseDetail>(qk.adminCase(id), (old) =>
      old ? { ...old, messages: [...old.messages, { ...data.message, author: { id: user!.id, firstName: user!.firstName, lastName: user!.lastName, role: user!.role } }] } : old,
    );
    void qc.invalidateQueries({ queryKey: qk.adminCase(id) });
  };

  const title = c ? `${c.client.firstName} ${c.client.lastName}` : '';

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <Stack.Screen options={{ title }} />
      {isLoading ? (
        <View style={{ padding: space.lg }}>
          <SkeletonList count={4} lines={3} />
        </View>
      ) : !c ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <>
          {error ? (
            <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm }}>
              <StaleHint error={error} onRetry={() => void refetch()} />
            </View>
          ) : null}
          <View style={styles.tabs}>
            <Chips<Tab>
              value={tab}
              onChange={setTab}
              items={[
                { key: 'overview', label: t('m.staff.detail.overview') },
                { key: 'documents', label: t('m.staff.detail.documents') },
                { key: 'messages', label: t('m.staff.detail.messages'), count: c.messages.length },
                { key: 'notes', label: t('m.staff.detail.notes') },
                { key: 'timeline', label: t('m.staff.detail.timeline') },
              ]}
            />
          </View>
          {tab === 'messages' ? (
            <ChatView
              messages={c.messages}
              meId={user?.id ?? ''}
              staffView
              onSend={sendMessage}
              placeholder={t('m.staff.detail.messagePh')}
              emptyText={t('m.staff.detail.messagesEmpty')}
            />
          ) : (
            <ScrollView
              contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: insets.bottom + space.xxxl }}
              keyboardShouldPersistTaps="handled"
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.blue} colors={[colors.blue]} />}
            >
              {tab === 'overview' ? <Overview c={c} /> : null}
              {tab === 'documents' ? <Documents c={c} /> : null}
              {tab === 'notes' ? <Notes c={c} /> : null}
              {tab === 'timeline' ? (
                <Section title={t('m.staff.detail.timeline')} icon={History}>
                  <Timeline events={c.events} limit={15} staff />
                </Section>
              ) : null}
            </ScrollView>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { paddingHorizontal: space.lg, paddingVertical: space.md, backgroundColor: colors.white, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
});

