import { memo, useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInUp, FadeOut } from 'react-native-reanimated';
import { Check, CheckCheck, MessageCircle, SendHorizontal } from '@/components/icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { EmptyState, Text, useToast } from '@/components/ui';
import { useFormat } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useErrorMessage } from '@/lib/queries';
import { colors, fonts, radius, space } from '@/theme';
import type { CaseMessage } from '@/types';

const Bubble = memo(({ m, mine, staffView, showName }: { m: CaseMessage; mine: boolean; staffView?: boolean; showName: boolean }) => {
  const { t } = useTranslation();
  const f = useFormat();
  const author = mine
    ? t('m.common.you')
    : m.author.role === 'CLIENT' || staffView
      ? `${m.author.firstName} ${m.author.lastName}`
      : `${m.author.firstName} · ${t('m.chat.team')}`;
  const read = mine && !!m.readAt;
  const metaColor = mine ? 'rgba(255,255,255,0.7)' : colors.muted;
  return (
    <Animated.View entering={FadeInUp.duration(220)} style={[styles.bubbleRow, mine ? { justifyContent: 'flex-end' } : null]}>
      <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
        {showName && !mine ? <Text style={styles.author}>{author}</Text> : null}
        <Text style={{ color: mine ? colors.white : colors.ink, fontFamily: fonts.body, fontSize: 15, lineHeight: 21 }} selectable>
          {m.body}
        </Text>
        <View style={styles.meta}>
          <Text style={{ color: metaColor, fontSize: 10.5, fontFamily: fonts.medium }}>
            {f.smart(m.createdAt)}
            {m.channel === 'whatsapp' ? ' · WhatsApp' : m.channel === 'sms' ? ' · SMS' : ''}
          </Text>
          {mine ? (
            <View style={styles.ticks} accessibilityLabel={read ? t('m.chat.read') : undefined}>
              {read ? <CheckCheck size={13} color={colors.white} strokeWidth={2.4} /> : <Check size={13} color={metaColor} strokeWidth={2.4} />}
              {read ? <Text style={{ color: colors.white, fontSize: 10.5, fontFamily: fonts.semibold }}>{t('m.chat.read')}</Text> : null}
            </View>
          ) : null}
        </View>
      </View>
    </Animated.View>
  );
});
Bubble.displayName = 'Bubble';

/** "… is typing" line above the composer. */
const TypingLine = ({ name }: { name: string | null }) => {
  const { t } = useTranslation();
  return (
    <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)} style={styles.typing} accessibilityLiveRegion="polite">
      <View style={styles.typingDots}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.dot, { opacity: 0.35 + i * 0.3 }]} />
        ))}
      </View>
      <Text variant="caption">{name ? t('m.chat.typingName', { name }) : t('m.chat.typing')}</Text>
    </Animated.View>
  );
};

/** Chat thread between a client and the Triad Vision team (used by both apps). */
export const ChatView = ({
  messages,
  meId,
  onSend,
  onTyping,
  typing,
  staffView,
  placeholder,
  emptyText,
  header,
  bottomInset = true,
}: {
  messages: CaseMessage[];
  meId: string;
  onSend: (body: string) => Promise<unknown>;
  /** Called on every keystroke with text present; the caller throttles the network call. */
  onTyping?: () => void;
  /** Name of the person typing on the other side (or true when unknown); hidden when falsy. */
  typing?: string | boolean | null;
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

  const change = (v: string) => {
    setText(v);
    if (v.trim() && onTyping) onTyping();
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
      {typing ? <TypingLine name={typeof typing === 'string' ? typing : null} /> : null}
      <View style={[styles.composer, { paddingBottom: (bottomInset ? insets.bottom : 0) + 10 }]}>
        <TextInput
          value={text}
          onChangeText={change}
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
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginTop: 4 },
  ticks: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  typing: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: space.lg, paddingVertical: 6 },
  typingDots: { flexDirection: 'row', gap: 3 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.blue },
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
