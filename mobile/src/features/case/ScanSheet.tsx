import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Camera, ChevronLeft, ChevronRight, FileText, Plus, RotateCw, Trash2, X } from '@/components/icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Button, Text, useToast } from '@/components/ui';
import { haptic } from '@/lib/haptics';
import { useErrorMessage } from '@/lib/queries';
import { colors, fonts, radius, space } from '@/theme';
import { capturePage, type ScanPage } from './scanner';
import { SCAN_MAX_PAGES, addPage, canMove, movePage, removePage, replacePage, type PageList } from './scanPages';

/**
 * Multi-page document scanner: capture pages with the system camera + crop editor, rotate, retake,
 * reorder and delete them, then upload everything as ONE PDF (the server builds it). The camera opens
 * from the parent for the first page; this sheet owns everything after that.
 */
export const ScanSheet = ({
  visible,
  title,
  initialPages,
  progress,
  error,
  onClose,
  onUpload,
}: {
  visible: boolean;
  title: string;
  initialPages: ScanPage[];
  /** 0…1 while the PDF is being prepared / uploaded; null otherwise. */
  progress: number | null;
  /** Message of the last failed upload (the pages stay here for a retry). */
  error?: string | null;
  onClose: () => void;
  onUpload: (pages: ScanPage[]) => Promise<void>;
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const message = useErrorMessage();
  const { width: screenW } = useWindowDimensions();
  // The parent keys this component by scan session, so a new scan always mounts with its first page.
  const [list, setList] = useState<PageList<ScanPage>>({ pages: initialPages, current: 0 });
  const [busy, setBusy] = useState(false);
  const { pages, current } = list;

  const page = pages[Math.min(current, pages.length - 1)];
  const uploading = progress !== null;
  const full = pages.length >= SCAN_MAX_PAGES;

  // Preview box: the rotated image must fit inside it whichever way it is turned.
  const box = useMemo(() => {
    const w = screenW - space.lg * 2;
    return { width: w, height: Math.round(w * 1.15) };
  }, [screenW]);
  const previewStyle = useMemo(() => {
    if (!page) return null;
    const quarter = (Math.round(page.rotation / 90) % 4 + 4) % 4;
    const sideways = quarter % 2 === 1;
    const natural = { width: page.width, height: page.height };
    const shown = sideways ? { width: natural.height, height: natural.width } : natural;
    const scale = Math.min(box.width / shown.width, box.height / shown.height);
    // The element keeps the natural aspect ratio and is rotated as a whole.
    return { width: natural.width * scale, height: natural.height * scale, transform: [{ rotate: `${page.rotation}deg` }] };
  }, [page, box]);

  const rotate = () => {
    haptic.select();
    setList((l) => replacePage(l, l.current, { ...l.pages[l.current], rotation: (l.pages[l.current].rotation + 90) % 360 }));
  };

  const capture = async (mode: 'add' | 'replace') => {
    if (busy || uploading) return;
    if (mode === 'add' && full) {
      toast(t('m.scan.maxPages', { max: SCAN_MAX_PAGES }), 'error');
      return;
    }
    setBusy(true);
    try {
      const shot = await capturePage();
      if (!shot) return;
      haptic.tap();
      setList((l) => (mode === 'replace' ? replacePage(l, l.current, shot) : addPage(l, shot)));
    } catch (err) {
      toast(message(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const move = (delta: number) => {
    haptic.select();
    setList((l) => movePage(l, l.current, delta));
  };

  const remove = () => {
    if (pages.length <= 1) {
      onClose();
      return;
    }
    haptic.warning();
    setList((l) => removePage(l, l.current));
  };

  const upload = async () => {
    if (busy || uploading || pages.length === 0) return;
    await onUpload(pages);
  };

  if (!page) return null;
  const percent = Math.round((progress ?? 0) * 100);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={uploading ? undefined : onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={[styles.root, { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.md }]}>
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>{t('m.scan.title')}</Text>
            <Text variant="h3" color={colors.white} numberOfLines={1}>
              {title}
            </Text>
          </View>
          <Pressable onPress={onClose} disabled={uploading} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('m.common.close')} style={styles.closeBtn}>
            <X size={20} color={colors.white} />
          </Pressable>
        </View>

        <View style={[styles.preview, box]}>
          <Image source={{ uri: page.uri }} style={previewStyle} contentFit="contain" transition={120} accessibilityLabel={t('m.scan.pageOf', { page: current + 1, total: pages.length })} />
        </View>

        <View style={styles.tools}>
          <Tool icon={ChevronLeft} label={t('m.scan.moveEarlier')} onPress={() => move(-1)} disabled={uploading || !canMove(pages.length, current, -1)} />
          <Tool icon={RotateCw} label={t('m.scan.rotate')} onPress={rotate} disabled={uploading} />
          <Tool icon={Camera} label={t('m.scan.retake')} onPress={() => void capture('replace')} disabled={uploading || busy} />
          <Tool icon={Trash2} label={t('m.scan.remove')} onPress={remove} disabled={uploading} danger />
          <Tool icon={ChevronRight} label={t('m.scan.moveLater')} onPress={() => move(1)} disabled={uploading || !canMove(pages.length, current, 1)} />
        </View>

        {pages.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip} style={{ flexGrow: 0 }}>
            {pages.map((p, i) => (
              <Pressable
                key={p.id}
                onPress={() => setList((l) => ({ ...l, current: i }))}
                accessibilityRole="tab"
                accessibilityState={{ selected: i === current }}
                accessibilityLabel={t('m.scan.pageOf', { page: i + 1, total: pages.length })}
                style={[styles.thumb, i === current && styles.thumbActive]}
              >
                <Image source={{ uri: p.uri }} style={{ width: 52, height: 68, transform: [{ rotate: `${p.rotation}deg` }] }} contentFit="cover" />
                <View style={styles.thumbNo}>
                  <Text style={{ color: colors.white, fontFamily: fonts.bold, fontSize: 10 }}>{i + 1}</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        <View style={styles.footer}>
          {uploading ? (
            <View style={{ gap: 8 }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: percent }}>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.max(4, percent)}%` }]} />
              </View>
              <Text style={{ color: 'rgba(255,255,255,0.8)', fontFamily: fonts.medium, fontSize: 13 }} center>
                {(progress ?? 0) < 0.3 ? t('m.scan.preparing', { total: pages.length }) : t('m.scan.uploadingPdf', { percent })}
              </Text>
            </View>
          ) : (
            <>
              {error ? (
                <Text style={{ color: '#ff8a93', fontFamily: fonts.medium, fontSize: 13 }} center accessibilityLiveRegion="polite">
                  {t('m.scan.failed')}: {error}
                </Text>
              ) : (
                <Text variant="caption" center style={{ color: 'rgba(255,255,255,0.6)' }}>
                  {t('m.scan.pageOf', { page: current + 1, total: pages.length })} · {full ? t('m.scan.maxPages', { max: SCAN_MAX_PAGES }) : t('m.scan.pdfHint')}
                </Text>
              )}
              <View style={{ flexDirection: 'row', gap: space.md }}>
                <Button title={t('m.scan.addPage')} icon={Plus} variant="light" onPress={() => void capture('add')} loading={busy} disabled={full} style={{ flex: 1 }} />
                <Button
                  title={error ? t('m.scan.retry') : t('m.scan.uploadPdf', { count: pages.length })}
                  icon={error ? RotateCw : FileText}
                  onPress={() => void upload()}
                  disabled={busy}
                  style={{ flex: 1 }}
                />
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
};

const Tool = ({
  icon: Icon,
  label,
  onPress,
  disabled,
  danger,
}: {
  icon: typeof RotateCw;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ disabled: !!disabled }}
    style={({ pressed }) => [styles.tool, (pressed || disabled) && { opacity: 0.45 }]}
  >
    <Icon size={22} color={danger ? '#ff8a93' : colors.white} strokeWidth={2} />
    <Text style={{ color: danger ? '#ff8a93' : colors.white, fontFamily: fonts.medium, fontSize: 11 }} numberOfLines={1}>
      {label}
    </Text>
  </Pressable>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.navyDeep, paddingHorizontal: space.lg, gap: space.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  eyebrow: { color: '#8fb6ff', fontFamily: fonts.semibold, fontSize: 11.5, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 },
  closeBtn: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  preview: { alignSelf: 'center', alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg, backgroundColor: '#0b1a3a', overflow: 'hidden' },
  tools: { flexDirection: 'row', justifyContent: 'space-between' },
  tool: { alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 4, flex: 1 },
  strip: { gap: 10, paddingVertical: 4 },
  thumb: { borderRadius: 10, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
  thumbActive: { borderColor: colors.blueBright },
  thumbNo: { position: 'absolute', left: 4, bottom: 4, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, backgroundColor: 'rgba(5,15,36,0.8)', alignItems: 'center', justifyContent: 'center' },
  footer: { marginTop: 'auto', gap: space.md },
  track: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.blueBright },
});
