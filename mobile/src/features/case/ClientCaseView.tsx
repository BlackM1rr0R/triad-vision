import { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { WEB_URL } from '@/lib/config';
import { currentLanguage } from '@/i18n';
import {
  BadgeCheck,
  CalendarPlus,
  Camera,
  FileSignature,
  FileText,
  FolderOpen,
  History,
  Images,
  Landmark,
  MapPin,
  MessageCircle,
  Route,
  ScanLine,
  Send,
  ShieldX,
  Ban,
  UserRound,
} from '@/components/icons';
import { useTranslation } from 'react-i18next';
import { ActionSheet, Button, Card, Section, SkeletonList, StaleHint, StatusBadge, Stepper, Text, ErrorState, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { CLIENT_UPLOAD_STAGE, STATUS_STEP, STEP_KEYS, missingRequirements } from '@/lib/caseStatus';
import { useFormat } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { addToCalendar } from '@/lib/native';
import { useCase, useErrorMessage } from '@/lib/queries';
import { qk } from '@/lib/queryClient';
import { colors, fonts, space } from '@/theme';
import type { CaseDetail, CaseDocument, DocStage, Requirement } from '@/types';
import { OcrCard } from './OcrCard';
import { FileItem, Note, RequirementCard, Timeline } from './parts';
import { ScanSheet } from './ScanSheet';
import { capturePage, type ScanPage } from './scanner';
import { uploadScanPdf } from './scanUpload';
import { useOcr } from './useOcr';
import { useOpenDocument, useUploader, type PickSource } from './useDocuments';

const NO_PAGES: ScanPage[] = [];

const DecisionCard = ({ c }: { c: CaseDetail }) => {
  const { t } = useTranslation();
  const f = useFormat();
  if (c.status === 'APPROVED') {
    return (
      <Card style={{ backgroundColor: colors.successSoft, borderColor: '#bfe8cf' }} index={1}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <BadgeCheck size={34} color={colors.success} />
          <View style={{ flex: 1 }}>
            <Text variant="h3" color={colors.success}>
              {t('portal.decision.approved')}
            </Text>
            {c.visaValidFrom && c.visaValidTo ? (
              <Text variant="small">{t('m.case.validity', { from: f.date(c.visaValidFrom), to: f.date(c.visaValidTo) })}</Text>
            ) : null}
          </View>
        </View>
        {c.decisionReason ? <Text style={{ marginTop: 10 }}>{c.decisionReason}</Text> : null}
      </Card>
    );
  }
  if (c.status === 'REJECTED') {
    return (
      <Card style={{ backgroundColor: colors.dangerSoft, borderColor: '#f5c2c7' }} index={1}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <ShieldX size={32} color={colors.danger} />
          <Text variant="h3" color={colors.danger} style={{ flex: 1 }}>
            {t('portal.decision.rejected')}
          </Text>
        </View>
        {c.decisionReason ? (
          <View style={{ marginTop: 10 }}>
            <Text variant="label">{t('portal.decision.reason')}</Text>
            <Text selectable>{c.decisionReason}</Text>
          </View>
        ) : null}
      </Card>
    );
  }
  if (c.status === 'CANCELLED') {
    return (
      <Card index={1}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <Ban size={28} color={colors.muted} />
          <Text variant="h3" style={{ flex: 1 }}>
            {t('m.case.cancelledTitle')}
          </Text>
        </View>
        {c.cancelReason ? <Text style={{ marginTop: 8 }}>{c.cancelReason}</Text> : null}
      </Card>
    );
  }
  return null;
};

export const AppointmentCard = ({ c, index }: { c: CaseDetail; index?: number }) => {
  const { t } = useTranslation();
  const f = useFormat();
  const toast = useToast();
  const message = useErrorMessage();
  const [busy, setBusy] = useState(false);
  if (!c.appointmentAt) return null;
  const upcoming = c.status === 'APPOINTMENT_SCHEDULED';
  const add = async () => {
    setBusy(true);
    try {
      const result = await addToCalendar({
        uid: `${c.id}-${new Date(c.appointmentAt!).getTime()}`,
        title: t('m.case.calendarEventTitle'),
        start: new Date(c.appointmentAt!),
        location: c.appointmentPlace ?? undefined,
        notes: `${c.number}${c.staffNote ? `\n${c.staffNote}` : ''}`,
      });
      if (result === 'added') toast(t('m.case.calendarAdded'));
      else if (result === 'denied') toast(t('m.case.calendarDenied'), 'error');
    } catch (err) {
      toast(message(err), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title={t('m.case.appointmentTitle')} icon={Landmark} index={index}>
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <CalendarPlus size={18} color={colors.violet} />
          <Text style={{ fontFamily: fonts.semibold, fontSize: 15, flex: 1 }}>{f.longDateTime(c.appointmentAt)}</Text>
        </View>
        {c.appointmentPlace ? (
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <MapPin size={18} color={colors.violet} />
            <Text style={{ flex: 1 }} selectable>
              {c.appointmentPlace}
            </Text>
          </View>
        ) : null}
        {upcoming ? <Button title={t('m.case.addToCalendar')} icon={CalendarPlus} variant="secondary" loading={busy} onPress={add} /> : null}
      </View>
    </Section>
  );
};

const ContractCard = ({ c, onOpen, openingId }: { c: CaseDetail; onOpen: (d: CaseDocument) => void; openingId: string | null }) => {
  const { t } = useTranslation();
  const f = useFormat();
  const step = STATUS_STEP[c.status];
  if (!c.contract && step !== 1) return null;
  return (
    <Section title={t('m.case.contractTitle')} icon={FileSignature}>
      {!c.contract ? (
        <Text variant="small">{t('m.case.waitingContract')}</Text>
      ) : (
        <View style={{ gap: 10 }}>
          <Text variant="caption">
            {t('portal.contract.version')} {c.contract.version} · {t('portal.contract.sentAt')} {f.date(c.contract.sentAt)}
          </Text>
          {c.contract.file ? <FileItem doc={c.contract.file} onOpen={onOpen} opening={openingId === c.contract.file.id} /> : null}
          {c.contract.signedAt && c.contract.signerName ? (
            <Note tone="success" text={t('m.case.signedOn', { date: f.dateTime(c.contract.signedAt), name: c.contract.signerName })} />
          ) : null}
          {c.contract.signedFile ? <FileItem doc={c.contract.signedFile} onOpen={onOpen} opening={openingId === c.contract.signedFile.id} /> : null}
          {c.status === 'CONTRACT_SENT' && c.contract.signatureRequestId ? (
            // Multi-party contracts are signed on the website (same login), with every party's audit trail.
            <Button
              title={t('m.case.signInBrowser')}
              icon={FileSignature}
              onPress={() => void WebBrowser.openBrowserAsync(`${WEB_URL}/account/signatures?lng=${currentLanguage()}`)}
              size="lg"
            />
          ) : c.status === 'CONTRACT_SENT' ? (
            <Button title={t('m.case.signNow')} icon={FileSignature} onPress={() => router.push(`/sign/${c.id}`)} size="lg" />
          ) : null}
        </View>
      )}
    </Section>
  );
};

const DocumentsSection = ({
  c,
  stage,
  title,
  index,
}: {
  c: CaseDetail;
  stage: DocStage;
  title: string;
  index?: number;
}) => {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const toast = useToast();
  const message = useErrorMessage();
  const { open, openingId } = useOpenDocument();
  const invalidate = useCallback(() => qc.invalidateQueries({ queryKey: qk.case(c.id) }), [qc, c.id]);
  const { progress, upload } = useUploader(invalidate);
  const { ocr, applying, start: startOcr, apply: applyOcr, dismiss: dismissOcr } = useOcr();
  const [target, setTarget] = useState<Requirement | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [scan, setScan] = useState<{ req: Requirement; pages: ScanPage[] } | null>(null);
  const [scanProgress, setScanProgress] = useState<number | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [pickScanReq, setPickScanReq] = useState(false);

  const reqs = c.requirements.filter((r) => r.stage === stage);
  if (reqs.length === 0) return null;
  const editable = CLIENT_UPLOAD_STAGE[c.status] === stage;
  const required = reqs.filter((r) => r.required);
  const missing = missingRequirements(c.requirements, stage, 'uploaded');
  const done = required.length - missing.length;
  const uploadPath = `/cases/${c.id}/documents`;

  /** A passport image just landed: read its machine readable zone (quietly skipped where OCR is off). */
  const afterUpload = (req: Requirement, docs: (CaseDocument | null)[]) => {
    const image = docs.find((d): d is CaseDocument => !!d && d.mimeType.startsWith('image/'));
    if (req.key === 'PASSPORT' && image) void startOcr(image.id, req.id);
  };

  const pick = (source: PickSource) => {
    if (!target) return;
    const req = target;
    void upload(req.id, uploadPath, source, { requirementId: req.id }, { onUploaded: (doc) => afterUpload(req, [doc]) });
  };

  /** Opens the camera for the first page of a multi-page scan (uploaded as one PDF). */
  const startScan = async (req: Requirement | null) => {
    if (!req) return;
    try {
      const page = await capturePage();
      if (page) {
        setScanError(null);
        setScan({ req, pages: [page] });
      }
    } catch (err) {
      toast(message(err), 'error');
    }
  };

  const uploadScan = async (pages: ScanPage[]) => {
    if (!scan) return;
    const req = scan.req;
    setScanError(null);
    setScanProgress(0);
    try {
      const res = await uploadScanPdf({ caseId: c.id, requirementId: req.id, title: f.tr(req.title), pages, onProgress: setScanProgress });
      haptic.success();
      setScan(null);
      toast(t('m.scan.donePdf', { count: res.pages }));
      await invalidate();
    } catch (err) {
      // The pages stay in the sheet; the button turns into "retry".
      setScanError(message(err));
    } finally {
      setScanProgress(null);
    }
  };

  const remove = (doc: CaseDocument) => {
    haptic.warning();
    Alert.alert(t('m.case.deleteTitle'), doc.originalName, [
      { text: t('m.common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/cases/${c.id}/documents/${doc.id}`);
            await invalidate();
            toast(t('m.case.deleted'));
          } catch (err) {
            toast(message(err), 'error');
          }
        },
      },
    ]);
  };

  const submit = () => {
    Alert.alert(t('m.case.submitTitle'), t('portal.docs.submitConfirm'), [
      { text: t('m.common.cancel'), style: 'cancel' },
      {
        text: t('portal.docs.submit'),
        onPress: async () => {
          setSubmitting(true);
          try {
            await api.post(`/cases/${c.id}/submit`);
            await Promise.all([invalidate(), qc.invalidateQueries({ queryKey: qk.myCases })]);
            toast(t('m.case.submitted'));
          } catch (err) {
            toast(message(err), 'error');
          } finally {
            setSubmitting(false);
          }
        },
      },
    ]);
  };

  return (
    <Section
      title={title}
      icon={FolderOpen}
      index={index}
      right={<Text variant="caption">{t('m.case.progress', { done, total: required.length })}</Text>}
    >
      {editable ? <Text variant="caption">{t('portal.docs.formats')}</Text> : <Text variant="caption">{t('portal.docs.locked')}</Text>}
      {reqs.map((r) => (
        <View key={r.id}>
          <RequirementCard
            req={r}
            progress={progress[r.id]}
            onUpload={editable ? setTarget : undefined}
            onScan={editable ? (req) => void startScan(req) : undefined}
            onOpen={open}
            openingId={openingId}
            canDelete={(d) => editable && d.status !== 'ACCEPTED' && d.uploadedById === c.client.id}
            onDelete={remove}
          />
          {ocr && ocr.requirementId === r.id ? <OcrCard ocr={ocr} applying={applying} onApply={() => void applyOcr()} onDismiss={dismissOcr} /> : null}
        </View>
      ))}
      {editable ? (
        <View style={{ gap: 8, marginTop: space.sm }}>
          <Button title={t('m.scan.general')} icon={ScanLine} variant="secondary" onPress={() => setPickScanReq(true)} />
          {missing.length > 0 ? <Text variant="caption">{t('portal.docs.missing')}</Text> : null}
          <Button title={t('portal.docs.submit')} icon={Send} size="lg" disabled={missing.length > 0} loading={submitting} onPress={submit} />
        </View>
      ) : null}
      <ActionSheet
        visible={!!target}
        onClose={() => setTarget(null)}
        title={target ? t('m.case.uploadTitle') : undefined}
        options={[
          { label: t('m.case.fromCamera'), icon: Camera, onPress: () => pick('camera') },
          { label: t('m.scan.pdfAction'), icon: ScanLine, onPress: () => void startScan(target) },
          { label: t('m.case.fromGallery'), icon: Images, onPress: () => pick('gallery') },
          { label: t('m.case.fromFiles'), icon: FileText, onPress: () => pick('files') },
        ]}
      />
      <ActionSheet
        visible={pickScanReq}
        onClose={() => setPickScanReq(false)}
        title={t('m.scan.chooseRequirement')}
        options={reqs.map((r) => ({ label: f.tr(r.title), icon: ScanLine, onPress: () => void startScan(r) }))}
      />
      <ScanSheet
        key={scan?.pages[0]?.id ?? 'none'}
        visible={!!scan}
        title={scan ? f.tr(scan.req.title) : ''}
        initialPages={scan?.pages ?? NO_PAGES}
        progress={scanProgress}
        error={scanError}
        onClose={() => {
          setScan(null);
          setScanError(null);
        }}
        onUpload={uploadScan}
      />
    </Section>
  );
};

export const CaseHeaderCard = ({ c }: { c: CaseDetail }) => {
  const { t } = useTranslation();
  const f = useFormat();
  const step = STATUS_STEP[c.status];
  return (
    <Card index={0}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <Text variant="caption">
          {t('portal.caseNo')} {c.number}
        </Text>
        {step >= 0 && step < 5 ? <Text variant="caption">{t('m.home.stepOf', { current: step + 1, total: STEP_KEYS.length })}</Text> : null}
      </View>
      <Text variant="h2" style={{ marginTop: 6 }}>
        {c.profession}
      </Text>
      {c.visaCategory ? (
        <Text variant="small">
          {f.tr(c.visaCategory.title)} · {c.visaCategory.visaLabel}
        </Text>
      ) : null}
      <StatusBadge status={c.status} style={{ marginTop: 10 }} />
      <Text style={{ marginTop: 10, color: colors.ink }}>{t(`portal.statusHelp.${c.status}`)}</Text>
      {c.staffNote ? (
        <View style={{ marginTop: 10 }}>
          <Note tone="warning" title={t('portal.staffNote')} text={c.staffNote} />
        </View>
      ) : null}
      {c.assignedStaff ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
          <UserRound size={16} color={colors.muted} />
          <Text variant="small">
            {t('m.case.manager')}: {c.assignedStaff.firstName} {c.assignedStaff.lastName}
          </Text>
        </View>
      ) : null}
    </Card>
  );
};

/** Full client view of one case: status, steps, decision, appointment, contract, documents, history. */
export const ClientCaseView = ({ id }: { id: string }) => {
  const { t } = useTranslation();
  const { data: c, isLoading, error, refetch } = useCase(id);
  const { open, openingId } = useOpenDocument();

  if (isLoading) return <SkeletonList count={4} lines={3} />;
  // Keep the loaded case on screen when a background refetch fails (TanStack keeps `data` on error).
  if (!c) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const embassyFirst = c.status === 'EMBASSY_DOCUMENTS' || c.status === 'EMBASSY_REVIEW';
  const initial = <DocumentsSection key="initial" c={c} stage="INITIAL" title={t('portal.docs.initialTitle')} />;
  const embassy = <DocumentsSection key="embassy" c={c} stage="EMBASSY" title={t('portal.docs.embassyTitle')} />;

  return (
    <View style={{ gap: space.lg }}>
      {error ? <StaleHint error={error} onRetry={() => void refetch()} /> : null}
      <CaseHeaderCard c={c} />
      <DecisionCard c={c} />
      <AppointmentCard c={c} />
      {c.status === 'CONTRACT_SENT' ? <ContractCard c={c} onOpen={open} openingId={openingId} /> : null}
      {embassyFirst ? [embassy, initial] : [initial]}
      {c.status !== 'CONTRACT_SENT' ? <ContractCard c={c} onOpen={open} openingId={openingId} /> : null}
      {!embassyFirst ? embassy : null}
      {c.otherDocuments.length > 0 ? (
        <Section title={t('m.case.filesForYou')} icon={FolderOpen}>
          <View style={{ gap: 8 }}>
            {c.otherDocuments.map((d) => (
              <FileItem key={d.id} doc={d} onOpen={open} opening={openingId === d.id} />
            ))}
          </View>
        </Section>
      ) : null}
      <Section title={t('portal.currentStep')} icon={Route}>
        <Stepper status={c.status} />
      </Section>
      <Button title={t('m.home.chat')} icon={MessageCircle} variant="secondary" onPress={() => router.push(`/chat/${c.id}`)} />
      {c.events.length > 0 ? (
        <Section title={t('m.case.timeline')} icon={History}>
          <Timeline events={c.events} />
        </Section>
      ) : null}
    </View>
  );
};
