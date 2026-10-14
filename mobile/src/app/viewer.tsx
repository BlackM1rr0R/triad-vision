import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Share2, X } from '@/components/icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Text, useToast } from '@/components/ui';
import { authHeaders, fileUrl } from '@/lib/api';
import { downloadDocument, shareFile } from '@/lib/native';
import { useErrorMessage } from '@/lib/queries';
import { colors, fonts } from '@/theme';

/** Full-screen viewer for private case images (the Bearer token is sent as an image request header). */
export default function Viewer() {
  const { id, name, mime } = useLocalSearchParams<{ id: string; name: string; mime: string }>();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const toast = useToast();
  const message = useErrorMessage();
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);

  const share = async () => {
    setSharing(true);
    try {
      const file = await downloadDocument({ id, originalName: name ?? 'image' });
      await shareFile(file.uri, mime ?? 'image/jpeg', name);
    } catch (err) {
      toast(message(err), 'error');
    } finally {
      setSharing(false);
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView
        style={StyleSheet.absoluteFill}
        contentContainerStyle={{ flex: 1 }}
        maximumZoomScale={4}
        minimumZoomScale={1}
        centerContent
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      >
        <Image
          source={{ uri: fileUrl(id), headers: authHeaders(), cacheKey: `doc-${id}` }}
          style={{ flex: 1 }}
          contentFit="contain"
          transition={200}
          cachePolicy="memory"
          onLoadEnd={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            toast(t('m.errors.DOWNLOAD_FAILED'), 'error');
          }}
          accessibilityLabel={name}
        />
      </ScrollView>
      {loading ? <ActivityIndicator style={StyleSheet.absoluteFill} color={colors.white} size="large" /> : null}
      <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('m.common.close')} style={styles.btn}>
          <X size={22} color={colors.white} />
        </Pressable>
        <Text numberOfLines={1} style={styles.title}>
          {name}
        </Text>
        <Pressable onPress={share} disabled={sharing} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('m.common.share')} style={styles.btn}>
          {sharing ? <ActivityIndicator color={colors.white} /> : <Share2 size={20} color={colors.white} />}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  bar: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingBottom: 10, backgroundColor: 'rgba(0,0,0,0.45)' },
  btn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  title: { flex: 1, color: colors.white, fontFamily: fonts.semibold, fontSize: 14 },
});
