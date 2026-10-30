import '@/i18n/assistant';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { fetch } from 'expo/fetch';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Plus, SendHorizontal, ShieldCheck, Sparkles, X } from '@/components/icons';
import { Button, Card, EmptyState, Text } from '@/components/ui';
import { api, authHeaders } from '@/lib/api';
import { API_URL } from '@/lib/config';
import { haptic } from '@/lib/haptics';
import { SseParser, sseJson } from '@/lib/sse';
import { colors, fonts, radius, space } from '@/theme';

/**
 * AI assistant of the client app: the same CLIENT-scope chat as the web portal (/api/ai). Answers are
 * grounded on the server in the client's own case data; the only action is "ask my consultant", which the
 * client confirms on a card. Streams the Server-Sent Events of the answer through expo/fetch.
 */

type ActionStatus = 'PENDING' | 'DONE' | 'REJECTED' | 'FAILED' | 'EXPIRED';
interface AiAction {
  id: string;
  summary: string;
  status: ActionStatus;
}
interface Msg {
  key: string;
  role: 'user' | 'assistant' | 'notice' | 'error';
  content: string;
  actions: AiAction[];
  streaming?: boolean;
}

let seq = 0;
const nextKey = () => `m${++seq}`;

/** Markdown → readable plain text (the app has no markdown renderer): drop emphasis / heading markers, keep link text. */
export const plainMarkdown = (s: string) =>
  s
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '• ');

export const useAiStatus = () =>
  useQuery({
    queryKey: ['ai', 'status'],
    queryFn: async () => (await api.get<{ scopes: { CLIENT: boolean } }>('/ai/status')).data,
    staleTime: 5 * 60_000,
  });

export const AssistantScreen = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const status = useAiStatus();
  const [convId, setConvId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const patch = useCallback((key: string, fn: (m: Msg) => Msg) => setMsgs((list) => list.map((m) => (m.key === key ? fn(m) : m))), []);
  const upsertAction = useCallback((a: AiAction) => setMsgs((list) => list.map((m) => ({ ...m, actions: m.actions.map((x) => (x.id === a.id ? a : x)) }))), []);

  /** POSTs to an SSE endpoint and applies its events to the assistant message `key`. */
  const stream = useCallback(
    async (path: string, body: unknown, key: string) => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(`${API_URL}${path}`, {
          method: 'POST',
          headers: { ...authHeaders(), 'x-client': 'mobile', 'Content-Type': 'application/json', Accept: 'text/event-stream' },
          body: JSON.stringify(body ?? {}),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          // Limits (429) and "switched off" (403) answer JSON with a localized message.
          let message = t('m.assistant.error');
          try {
            const j = (await res.json()) as { message?: string };
            if (j.message) message = j.message;
          } catch {
            /* keep the generic text */
          }
          patch(key, (m) => ({ ...m, role: res.status === 429 || res.status === 403 ? 'notice' : 'error', content: message, streaming: false }));
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const parser = new SseParser();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const ev of parser.feed(decoder.decode(value, { stream: true }))) {
            const d = sseJson(ev);
            if (!d) continue;
            if (ev.type === 'delta') patch(key, (m) => ({ ...m, content: m.content + String(d.text ?? '') }));
            else if (ev.type === 'action') {
              const a = d.action as AiAction;
              setMsgs((list) => (list.some((m) => m.actions.some((x) => x.id === a.id)) ? list.map((m) => ({ ...m, actions: m.actions.map((x) => (x.id === a.id ? a : x)) })) : list.map((m) => (m.key === key ? { ...m, actions: [...m.actions, a] } : m))));
            } else if (ev.type === 'notice') setMsgs((list) => [...list, { key: nextKey(), role: 'notice', content: String(d.message ?? ''), actions: [] }]);
            else if (ev.type === 'error') patch(key, (m) => ({ ...m, role: m.content ? m.role : 'error', content: m.content || String(d.message ?? t('m.assistant.error')) }));
          }
        }
      } catch {
        if (!controller.signal.aborted) patch(key, (m) => ({ ...m, role: m.content ? m.role : 'error', content: m.content || t('m.assistant.error') }));
      } finally {
        abortRef.current = null;
        setMsgs((list) => list.map((m) => (m.key === key ? { ...m, streaming: false } : m)).filter((m) => !(m.key === key && m.role === 'assistant' && !m.content && !m.actions.length)));
      }
    },
    [patch, t],
  );

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    haptic.tap();
    setInput('');
    setBusy(true);
    const key = nextKey();
    setMsgs((list) => [...list, { key: nextKey(), role: 'user', content: text, actions: [] }, { key, role: 'assistant', content: '', actions: [], streaming: true }]);
    try {
      let id = convId;
      if (!id) {
        id = (await api.post<{ conversation: { id: string } }>('/ai/conversations', { scope: 'CLIENT', context: { page: 'mobile' } })).data.conversation.id;
        setConvId(id);
      }
      await stream(`/ai/conversations/${id}/messages`, { content: text }, key);
    } catch {
      patch(key, (m) => ({ ...m, role: 'error', content: t('m.assistant.error'), streaming: false }));
    } finally {
      setBusy(false);
    }
  };

  const decide = async (a: AiAction, decision: 'confirm' | 'reject') => {
    if (busy) return;
    haptic.tap();
    setBusy(true);
    upsertAction({ ...a, status: decision === 'confirm' ? 'DONE' : 'REJECTED' }); // optimistic; the stream sends the real outcome
    const key = nextKey();
    setMsgs((list) => [...list, { key, role: 'assistant', content: '', actions: [], streaming: true }]);
    try {
      await stream(`/ai/actions/${a.id}/${decision}`, {}, key);
    } finally {
      setBusy(false);
    }
  };

  const newChat = () => {
    abortRef.current?.abort();
    setConvId(null);
    setMsgs([]);
  };

  if (status.data && !status.data.scopes.CLIENT) return <EmptyState icon={Sparkles} title={t('m.assistant.title')} text={t('m.assistant.disabled')} />;

  const suggestions = t('m.assistant.suggestions', { returnObjects: true }) as unknown as string[];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ padding: space.lg, gap: space.md, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {msgs.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', gap: space.md }}>
            <EmptyState icon={Sparkles} title={t('m.assistant.emptyTitle')} text={t('m.assistant.emptyText')} />
            <View style={styles.chips}>
              {(Array.isArray(suggestions) ? suggestions : []).map((s) => (
                <Pressable key={s} onPress={() => void send(s)} accessibilityRole="button" style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}>
                  <Text variant="small" color={colors.ink}>
                    {s}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <>
            <View style={{ alignItems: 'flex-end' }}>
              <Button title={t('m.assistant.newChat')} icon={Plus} variant="ghost" size="sm" onPress={newChat} disabled={busy} />
            </View>
            {msgs.map((m) => (
              <MessageRow key={m.key} m={m} busy={busy} onDecide={decide} />
            ))}
          </>
        )}
      </ScrollView>
      <View style={[styles.composer, { paddingBottom: insets.bottom + 10 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={t('m.assistant.placeholder')}
            placeholderTextColor="#94a1b8"
            multiline
            maxLength={4000}
            style={styles.input}
            accessibilityLabel={t('m.assistant.placeholder')}
          />
          {busy && abortRef.current ? (
            <Pressable onPress={() => abortRef.current?.abort()} accessibilityRole="button" accessibilityLabel={t('m.assistant.stop')} style={[styles.send, { backgroundColor: colors.navy }]}>
              <X size={20} color={colors.white} />
            </Pressable>
          ) : (
            <Pressable
              onPress={() => void send(input)}
              disabled={!input.trim() || busy}
              accessibilityRole="button"
              accessibilityLabel={t('m.assistant.send')}
              style={({ pressed }) => [styles.send, (!input.trim() || busy) && { opacity: 0.45 }, pressed && { transform: [{ scale: 0.94 }] }]}
            >
              <SendHorizontal size={20} color={colors.white} />
            </Pressable>
          )}
        </View>
        <Text variant="caption" style={{ marginTop: 6 }}>
          {t('m.assistant.disclaimer')}
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
};

const MessageRow = ({ m, busy, onDecide }: { m: Msg; busy: boolean; onDecide: (a: AiAction, d: 'confirm' | 'reject') => void }) => {
  const { t } = useTranslation();
  if (m.role === 'user')
    return (
      <View style={{ alignItems: 'flex-end' }}>
        <View style={[styles.bubble, styles.mine]}>
          <Text color={colors.white} selectable>
            {m.content}
          </Text>
        </View>
      </View>
    );
  if (m.role === 'notice' || m.role === 'error')
    return (
      <View style={[styles.notice, m.role === 'error' && { backgroundColor: colors.dangerSoft, borderColor: colors.danger }]} accessibilityRole={m.role === 'error' ? 'alert' : undefined}>
        <Text variant="small" color={colors.ink}>
          {m.content}
        </Text>
      </View>
    );
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
      <View style={styles.avatar}>
        <Sparkles size={14} color={colors.blue} />
      </View>
      <View style={{ flex: 1, gap: 8 }}>
        {m.content ? (
          <View style={[styles.bubble, styles.theirs, { maxWidth: '100%' }]}>
            <Text selectable>{plainMarkdown(m.content)}</Text>
          </View>
        ) : m.streaming ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
            <ActivityIndicator size="small" color={colors.blue} />
            <Text variant="small">{t('m.assistant.thinking')}</Text>
          </View>
        ) : null}
        {m.actions.map((a) => (
          <View key={a.id} style={styles.action} accessibilityLabel={t('m.assistant.action.title')}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <ShieldCheck size={15} color={colors.blue} />
              <Text variant="label" style={{ flex: 1 }}>
                {t('m.assistant.action.title')}
              </Text>
              <Text variant="caption">{t(`m.assistant.action.${a.status}`)}</Text>
            </View>
            <Text variant="small" color={colors.ink}>
              {a.summary}
            </Text>
            {a.status === 'PENDING' ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button title={t('m.assistant.action.confirm')} size="sm" disabled={busy} onPress={() => onDecide(a, 'confirm')} />
                <Button title={t('m.assistant.action.reject')} size="sm" variant="secondary" disabled={busy} onPress={() => onDecide(a, 'reject')} />
              </View>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8 },
  bubble: { maxWidth: '82%', paddingHorizontal: 13, paddingVertical: 9, borderRadius: 18 },
  mine: { backgroundColor: colors.blue, borderBottomRightRadius: 6 },
  theirs: { backgroundColor: colors.white, borderBottomLeftRadius: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  notice: { borderWidth: 1, borderColor: colors.warning, backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: space.md },
  action: { gap: 8, borderWidth: 1, borderColor: colors.line, borderLeftWidth: 4, borderLeftColor: colors.blue, backgroundColor: colors.white, borderRadius: radius.md, padding: space.md },
  composer: { paddingHorizontal: space.md, paddingTop: 10, backgroundColor: colors.white, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
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

/** Home: entry to the assistant (only when it is switched on for clients). */
export const AssistantHomeCard = ({ index }: { index?: number }) => {
  const { t } = useTranslation();
  const { data } = useAiStatus();
  if (!data?.scopes.CLIENT) return null;
  return (
    <Card index={index} onPress={() => router.push('/assistant')}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Sparkles size={20} color={colors.blue} />
        <View style={{ flex: 1 }}>
          <Text variant="title">{t('m.assistant.homeTitle')}</Text>
          <Text variant="small">{t('m.assistant.homeText')}</Text>
        </View>
        <ArrowRight size={18} color={colors.blue} />
      </View>
    </Card>
  );
};
