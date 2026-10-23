import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ErrorState, SkeletonList, StaleHint, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCase } from '@/lib/queries';
import { qk } from '@/lib/queryClient';
import { str, useRealtime, useRealtimeStatus } from '@/lib/realtime';
import { space } from '@/theme';
import type { CaseDetail, CaseMessage } from '@/types';
import { ChatView } from './ChatView';

/** The server accepts one typing ping per 2 s per user (429 when faster); stay comfortably above that. */
const TYPING_SEND_EVERY_MS = 2500;
/** How long "… is typing" stays visible after the last event. */
const TYPING_SHOW_MS = 4000;
/** Polling interval used only while the realtime stream is not connected. */
const POLL_MS = 15_000;

/**
 * Client ↔ manager chat for one case. Live through the realtime stream (new messages, read receipts,
 * typing); polls every 15 s only as a fallback while the stream is down. Opening the thread marks
 * the team's messages as read.
 */
export const ClientChat = ({ caseId, bottomInset = true }: { caseId: string; bottomInset?: boolean }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: c, isLoading, error, refetch } = useCase(caseId);
  const live = useRealtimeStatus() === 'open';

  useFocusEffect(
    useCallback(() => {
      void refetch();
      if (live) return undefined;
      const timer = setInterval(() => void refetch(), POLL_MS);
      return () => clearInterval(timer);
    }, [refetch, live]),
  );

  // ─── Read receipts: tell the server once the team's unread messages are on screen ───
  const meId = user?.id;
  const unreadIds = useMemo(() => (c?.messages ?? []).filter((m) => m.author.id !== meId && !m.readAt).map((m) => m.id), [c?.messages, meId]);
  const marked = useRef(new Set<string>());
  useFocusEffect(
    useCallback(() => {
      const pending = unreadIds.filter((id) => !marked.current.has(id));
      if (pending.length === 0) return;
      pending.forEach((id) => marked.current.add(id));
      api
        .post<{ messageIds: string[]; readAt: string | null }>(`/cases/${caseId}/messages/read`)
        .then(({ data }) => {
          if (!data.readAt || data.messageIds.length === 0) return;
          const readAt = data.readAt;
          qc.setQueryData<CaseDetail>(qk.case(caseId), (old) =>
            old ? { ...old, messages: old.messages.map((m) => (data.messageIds.includes(m.id) && !m.readAt ? { ...m, readAt } : m)) } : old,
          );
        })
        .catch(() => pending.forEach((id) => marked.current.delete(id)));
    }, [unreadIds, caseId, qc]),
  );

  // ─── Typing indicator (incoming) ───
  const [typing, setTyping] = useState<string | boolean>(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useRealtime('typing', (p) => {
    if (str(p.caseId) !== caseId || str(p.userId) === meId) return;
    setTyping(str(p.name) ?? true);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => setTyping(false), TYPING_SHOW_MS);
  });
  useEffect(
    () => () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
    },
    [],
  );

  // ─── Typing indicator (outgoing), throttled ───
  const lastTypingSent = useRef(0);
  const onTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSent.current < TYPING_SEND_EVERY_MS) return;
    lastTypingSent.current = now;
    // A 429 only means we were faster than the server's limiter — nothing to tell the user.
    api.post(`/cases/${caseId}/typing`).catch(() => undefined);
  }, [caseId]);

  const send = async (body: string) => {
    const { data } = await api.post<{ message: Omit<CaseMessage, 'author'> }>(`/cases/${caseId}/messages`, { body });
    setTyping(false);
    // Show it immediately, then refetch so a poll that was already in flight cannot overwrite it.
    qc.setQueryData<CaseDetail>(qk.case(caseId), (old) =>
      old && !old.messages.some((m) => m.id === data.message.id)
        ? {
            ...old,
            messages: [
              ...old.messages,
              {
                ...data.message,
                author: { id: user!.id, firstName: user!.firstName, lastName: user!.lastName, role: user!.role },
              },
            ],
          }
        : old,
    );
    void qc.invalidateQueries({ queryKey: qk.case(caseId) });
  };

  if (isLoading)
    return (
      <View style={{ padding: space.lg }}>
        <SkeletonList count={3} lines={1} />
      </View>
    );
  // A failed background poll keeps the loaded thread on screen (TanStack keeps `data` on error).
  if (!c) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <ChatView
      caseId={caseId}
      messages={c.messages}
      meId={user?.id ?? ''}
      onSend={send}
      onTyping={onTyping}
      typing={typing}
      bottomInset={bottomInset}
      header={
        <View style={{ gap: space.sm }}>
          <Text variant="caption" center>
            {c.number} · {t('m.chat.subtitle')}
          </Text>
          {error ? <StaleHint error={error} onRetry={() => void refetch()} /> : null}
        </View>
      }
    />
  );
};
