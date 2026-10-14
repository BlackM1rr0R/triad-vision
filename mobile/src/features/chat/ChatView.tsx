import { memo, useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { SendHorizontal } from '@/components/icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { EmptyState, Text, useToast } from '@/components/ui';
import { useFormat } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useErrorMessage } from '@/lib/queries';
import { colors, fonts, radius, space } from '@/theme';
import type { CaseMessage } from '@/types';
import { MessageCircle } from '@/components/icons';

const Bubble = memo(({ m, mine, staffView, showName }: { m: CaseMessage; mine: boolean; staffView?: boolean; showName: boolean }) => {
  const { t } = useTranslation();
  const f = useFormat();
  const author = mine
    ? t('m.common.you')
    : m.author.role === 'CLIENT' || staffView
      ? `${m.author.firstName} ${m.author.lastName}`
      : `${m.author.firstName} · ${t('m.chat.team')}`;
  return (
    <Animated.View entering={FadeInUp.duration(220)} style={[styles.bubbleRow, mine ? { justifyContent: 'flex-end' } : null]}>
      <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
        {showName && !mine ? <Text style={styles.author}>{author}</Text> : null}
        <Text style={{ color: mine ? colors.white : colors.ink, fontFamily: fonts.body, fontSize: 15, lineHeight: 21 }} selectable>
          {m.body}
        </Text>
        <Text style={{ color: mine ? 'rgba(255,255,255,0.7)' : colors.muted, fontSize: 10.5, fontFamily: fonts.medium, alignSelf: 'flex-end', marginTop: 4 }}>
          {f.smart(m.createdAt)}
        </Text>
      </View>
    </Animated.View>
  );
});
Bubble.displayName = 'Bubble';

/** Chat thread between a client and the Triad Vision team (used by both apps). */
export const ChatView = ({
  messages,
  meId,
  onSend,
  staffView,
  placeholder,
  emptyText,
  header,
  bottomInset = true,
}: {
  messages: CaseMessage[];
  meId: string;
  onSend: (body: string) => Promise<unknown>;
  staffView?: boolean;
  placeholder?: string;
  emptyText?: string;
  header?: React.ReactNode;
  bottomInset?: boolean;
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const message = useErrorMessage();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  // Inverted list: newest at the bottom, keyboard-friendly.
  const data = useMemo(() => [...messages].reverse(), [messages]);

  const isMine = useCallback(
    (m: CaseMessage) => (staffView ? m.author.role !== 'CLIENT' && m.author.id === meId : m.author.id === meId),
    [meId, staffView],
  );

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    haptic.tap();
    setSending(true);
    try {
      await onSend(body);
      setText('');
    } catch (err) {
      toast(message(err), 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <FlatList
        data={data}
        inverted={data.length > 0}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: space.lg, gap: 8, flexGrow: 1 }}
        renderItem={({ item, index }) => {
          const older = data[index + 1];
          return <Bubble m={item} mine={isMine(item)} staffView={staffView} showName={!older || older.author.id !== item.author.id} />;
        }}
        ListEmptyComponent={<EmptyState icon={MessageCircle} title={t('m.chat.title')} text={emptyText ?? t('m.chat.empty')} />}
        ListFooterComponent={data.length > 0 && header ? <View style={{ marginBottom: space.md }}>{header}</View> : null}
        ListHeaderComponent={data.length === 0 && header ? <View style={{ marginBottom: space.md }}>{header}</View> : null}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        initialNumToRender={20}
        windowSize={11}
      />
      <View style={[styles.composer, { paddingBottom: (bottomInset ? insets.bottom : 0) + 10 }]}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={placeholder ?? t('m.chat.placeholder')}
          placeholderTextColor="#94a1b8"
          multiline
          maxLength={4000}
          style={styles.input}
          accessibilityLabel={placeholder ?? t('m.chat.placeholder')}
        />
        <Pressable
          onPress={send}
          disabled={!text.trim() || sending}
          accessibilityRole="button"
          accessibilityLabel={t('common.send')}
          style={({ pressed }) => [styles.send, (!text.trim() || sending) && { opacity: 0.45 }, pressed && { transform: [{ scale: 0.94 }] }]}
        >
          {sending ? <ActivityIndicator color={colors.white} size="small" /> : <SendHorizontal size={20} color={colors.white} />}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  bubbleRow: { flexDirection: 'row' },
  bubble: { maxWidth: '82%', paddingHorizontal: 13, paddingVertical: 9, borderRadius: 18 },
  mine: { backgroundColor: colors.blue, borderBottomRightRadius: 6 },
  theirs: { backgroundColor: colors.white, borderBottomLeftRadius: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  author: { fontFamily: fonts.semibold, fontSize: 11.5, color: colors.blue, marginBottom: 2 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: space.md,
    paddingTop: 10,
    backgroundColor: colors.white,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 130,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
  },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
});
