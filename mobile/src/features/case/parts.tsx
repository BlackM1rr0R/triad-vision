import { memo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import {
  Check,
  CircleAlert,
  Clock3,
  FileImage,
  FileText,
  Plus,
  ScanLine,
  RotateCcw,
  Trash2,
  X,
} from '@/components/icons';
import { useTranslation } from 'react-i18next';
import { Button, DocStatusBadge, Pill, Text } from '@/components/ui';
import { formatBytes, useFormat } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { colors, fonts, radius, space } from '@/theme';
import type { CaseDocument, CaseEvent, Requirement } from '@/types';

export const InfoRow = ({ label, value, children }: { label: string; value?: string | null; children?: ReactNode }) => (
  <View style={styles.infoRow}>
    <Text variant="small" style={{ width: 110 }}>
      {label}
    </Text>
    {children ?? (
      <Text style={{ flex: 1, fontFamily: fonts.medium, fontSize: 14 }} selectable>
        {value || '—'}
      </Text>
    )}
  </View>
);

export const Note = ({ tone = 'warning', title, text }: { tone?: 'warning' | 'danger' | 'info' | 'success'; title?: string; text: string }) => {
  const palette = {
    warning: { bg: colors.warningSoft, fg: colors.warning },
    danger: { bg: colors.dangerSoft, fg: colors.danger },
    info: { bg: colors.blueSoft, fg: colors.blue },
    success: { bg: colors.successSoft, fg: colors.success },
  }[tone];
  return (
    <View style={[styles.note, { backgroundColor: palette.bg }]} accessibilityRole="alert">
      <CircleAlert size={16} color={palette.fg} style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        {title ? <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: palette.fg }}>{title}</Text> : null}
        <Text style={{ fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: colors.ink }} selectable>
          {text}
        </Text>
      </View>
    </View>
  );
};

/** One uploaded file with status and optional actions. */
export const FileItem = memo(
  ({
    doc,
    onOpen,
    opening,
    onDelete,
    staff,
  }: {
    doc: CaseDocument;
    onOpen: (d: CaseDocument) => void;
    opening?: boolean;
    onDelete?: (d: CaseDocument) => void;
    staff?: { onAccept: (d: CaseDocument) => void; onReject: (d: CaseDocument) => void; onReset: (d: CaseDocument) => void; busy?: boolean };
  }) => {
    const { t } = useTranslation();
    const f = useFormat();
    const Icon = doc.mimeType.startsWith('image/') ? FileImage : FileText;
    return (
      <Animated.View entering={FadeIn.duration(250)} layout={LinearTransition} style={styles.file}>
        <Pressable
          onPress={() => {
            haptic.tap();
            onOpen(doc);
          }}
          accessibilityRole="button"
          accessibilityLabel={`${t('m.case.open')}: ${doc.originalName}`}
          style={({ pressed }) => [styles.fileMain, pressed && { opacity: 0.7 }]}
        >
          <View style={styles.fileIcon}>{opening ? <ActivityIndicator size="small" color={colors.blue} /> : <Icon size={18} color={colors.blue} />}</View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text numberOfLines={1} style={{ fontFamily: fonts.medium, fontSize: 13.5 }}>
              {doc.originalName}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <DocStatusBadge status={doc.status} />
              <Text variant="caption">
                {formatBytes(doc.size)} · {f.date(doc.createdAt)}
              </Text>
            </View>
          </View>
          {onDelete ? (
            <Pressable
              hitSlop={10}
              onPress={() => onDelete(doc)}
              accessibilityRole="button"
              accessibilityLabel={t('common.delete')}
              style={styles.iconBtn}
            >
              <Trash2 size={17} color={colors.danger} />
            </Pressable>
          ) : null}
        </Pressable>
        {doc.status === 'REJECTED' && doc.reviewNote ? <Note tone="danger" title={t('m.case.reviewNote')} text={doc.reviewNote} /> : null}
        {staff ? (
          <View style={styles.reviewRow}>
            {doc.status !== 'ACCEPTED' ? (
              <Button title={t('m.staff.detail.accept')} icon={Check} size="sm" variant="success" onPress={() => staff.onAccept(doc)} disabled={staff.busy} style={{ flex: 1 }} />
            ) : null}
            {doc.status !== 'REJECTED' ? (
              <Button title={t('m.staff.detail.reject')} icon={X} size="sm" variant="secondary" onPress={() => staff.onReject(doc)} disabled={staff.busy} style={{ flex: 1 }} />
            ) : null}
            {doc.status !== 'PENDING' ? (
              <Button title={t('m.staff.detail.resetReview')} icon={RotateCcw} size="sm" variant="ghost" onPress={() => staff.onReset(doc)} disabled={staff.busy} />
            ) : null}
          </View>
        ) : null}
      </Animated.View>
    );
  },
);
FileItem.displayName = 'FileItem';

/** A document requirement ("Passport (all pages)") with its uploads. */
export const RequirementCard = memo(
  ({
    req,
    progress,
    onUpload,
    onScan,
    onOpen,
    openingId,
    canDelete,
    onDelete,
    staff,
  }: {
    req: Requirement;
    progress?: number;
    onUpload?: (r: Requirement) => void;
    /** Multi-page scan uploaded as one PDF (shown next to the upload button). */
    onScan?: (r: Requirement) => void;
    onOpen: (d: CaseDocument) => void;
    openingId?: string | null;
    canDelete?: (d: CaseDocument) => boolean;
    onDelete?: (d: CaseDocument) => void;
    staff?: { onAccept: (d: CaseDocument) => void; onReject: (d: CaseDocument) => void; onReset: (d: CaseDocument) => void; busy?: boolean };
  }) => {
    const { t } = useTranslation();
    const f = useFormat();
    const latest = req.documents[0];
    const ok = req.documents.some((d) => d.status === 'ACCEPTED');
    const uploading = progress !== undefined;
    return (
      <View style={styles.req}>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
          <View style={[styles.reqDot, { backgroundColor: ok ? colors.success : latest ? (latest.status === 'REJECTED' ? colors.danger : colors.warning) : colors.line }]}>
            {ok ? <Check size={12} color={colors.white} strokeWidth={3} /> : latest ? <Clock3 size={12} color={colors.white} /> : null}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 14.5 }}>{f.tr(req.title)}</Text>
            {req.description ? <Text variant="small">{f.tr(req.description)}</Text> : null}
            <Pill
              label={req.required ? t('m.common.required') : t('m.common.optional')}
              fg={req.required ? colors.navy : colors.muted}
              bg={req.required ? colors.blueSoft : colors.surface}
              dot={false}
              style={{ marginTop: 4 }}
            />
          </View>
        </View>
        {req.documents.length === 0 && !onUpload ? (
          <Text variant="caption" style={{ marginLeft: 30 }}>
            {staff ? t('m.staff.detail.notUploaded') : t('portal.docs.notUploaded')}
          </Text>
        ) : null}
        {req.documents.length > 0 ? (
          <View style={{ gap: 8, marginLeft: 30 }}>
            {req.documents.map((d) => (
              <FileItem
                key={d.id}
                doc={d}
                onOpen={onOpen}
                opening={openingId === d.id}
                onDelete={onDelete && canDelete?.(d) ? onDelete : undefined}
                staff={staff}
              />
            ))}
          </View>
        ) : null}
        {onUpload ? (
          <View style={{ marginLeft: 30 }}>
            {uploading ? (
              <View style={styles.progressWrap} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${Math.max(4, progress * 100)}%` }]} />
                </View>
                <Text variant="caption">{t('m.case.uploading', { percent: Math.round(progress * 100) })}</Text>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Button
                  title={latest && latest.status !== 'REJECTED' ? t('portal.docs.replace') : t('m.case.addFile')}
                  icon={Plus}
                  size="sm"
                  variant={latest && latest.status !== 'REJECTED' ? 'secondary' : 'primary'}
                  onPress={() => onUpload(req)}
                  style={{ alignSelf: 'flex-start' }}
                />
                {onScan ? <Button title={t('m.scan.pdfAction')} icon={ScanLine} size="sm" variant="secondary" onPress={() => onScan(req)} style={{ alignSelf: 'flex-start' }} /> : null}
              </View>
            )}
          </View>
        ) : null}
      </View>
    );
  },
);
RequirementCard.displayName = 'RequirementCard';

const eventLabel = (t: (k: string) => string, exists: (k: string) => boolean, type: string) => {
  if (exists(`portal.events.${type}`)) return t(`portal.events.${type}`);
  if (exists(`m.events.${type}`)) return t(`m.events.${type}`);
  return type.replace(/_/g, ' ').toLowerCase();
};

export const Timeline = ({ events, limit = 6, staff }: { events: CaseEvent[]; limit?: number; staff?: boolean }) => {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const [all, setAll] = useState(false);
  const shown = all ? events : events.slice(0, limit);
  return (
    <View>
      {shown.map((e, i) => (
        <View key={e.id} style={styles.event}>
          <View style={styles.eventRail}>
            <View style={[styles.eventDot, i === 0 && { backgroundColor: colors.blue }]} />
            {i < shown.length - 1 ? <View style={styles.eventLine} /> : null}
          </View>
          <View style={{ flex: 1, paddingBottom: 14 }}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 13.5 }}>
              {eventLabel(t, (k) => i18n.exists(k), e.type)}
              {e.toStatus && e.type === 'STATUS_CHANGED' ? ` → ${t(staff ? `m.staff.status.${e.toStatus}` : `portal.status.${e.toStatus}`)}` : ''}
            </Text>
            {e.note ? (
              <Text variant="small" selectable>
                {e.note}
              </Text>
            ) : null}
            <Text variant="caption">
              {f.smart(e.createdAt)}
              {staff && e.actor ? ` · ${e.actor.firstName} ${e.actor.lastName}` : ''}
            </Text>
          </View>
        </View>
      ))}
      {events.length > limit ? (
        <Button title={all ? t('m.common.close') : t('m.case.showAll')} variant="ghost" size="sm" onPress={() => setAll((v) => !v)} style={{ alignSelf: 'flex-start' }} />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 6 },
  note: { flexDirection: 'row', gap: 8, padding: 10, borderRadius: radius.md },
  file: { gap: 8, padding: 10, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  fileMain: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fileIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' },
  iconBtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.dangerSoft },
  reviewRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  req: { gap: 10, paddingVertical: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  reqDot: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  progressWrap: { gap: 6 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: colors.blueSoft, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: colors.blue },
  event: { flexDirection: 'row', gap: 10 },
  eventRail: { alignItems: 'center', width: 12 },
  eventDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#b8c5da', marginTop: 4 },
  eventLine: { width: 2, flex: 1, backgroundColor: colors.line, marginTop: 2 },
});
