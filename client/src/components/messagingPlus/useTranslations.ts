import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';

export type Lang = 'az' | 'de' | 'en' | 'ru';
export const LANGS: Lang[] = ['az', 'de', 'en', 'ru'];

export interface VoiceInfo {
  id: string;
  mimeType: string;
  durationMs: number;
  transcriptStatus: 'PENDING' | 'DONE' | 'EMPTY' | 'FAILED' | 'NOT_CONFIGURED' | string;
  transcript: string | null;
  transcriptLang?: Lang | null;
  url?: string;
}

export type TranslationMap = Record<string, { text: string; lang: Lang }>;

/** What a message offers for translation: its text (or voice transcript) and detected language. */
export interface Translatable {
  id: string;
  text: string;
  lang: Lang | null | undefined;
}

export const voiceUrl = (v: Pick<VoiceInfo, 'id'>) => `/api/messaging-plus/voice/${v.id}`;

/** Text a message can be translated by: the body, else a finished voice transcript. */
export const translatableText = (m: { body?: string | null; voice?: VoiceInfo | null }) =>
  (m.body ?? '').trim() || (m.voice?.transcriptStatus === 'DONE' ? m.voice.transcript ?? '' : '');

const PREFS_KEY = ['msgplus-prefs'] as const;

/** The reader's "show originals" setting (GET/PATCH /messaging-plus/preferences). */
export const useShowOriginals = () => {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: PREFS_KEY,
    queryFn: async () => (await api.get<{ preferences: { showOriginals: boolean } }>('/messaging-plus/preferences')).data.preferences,
    staleTime: 5 * 60_000,
  });
  const m = useMutation({
    mutationFn: async (showOriginals: boolean) => (await api.patch<{ preferences: { showOriginals: boolean } }>('/messaging-plus/preferences', { showOriginals })).data.preferences,
    onSuccess: (p) => qc.setQueryData(PREFS_KEY, p),
  });
  return { showOriginals: !!q.data?.showOriginals, loaded: q.isSuccess, set: (v: boolean) => m.mutate(v), saving: m.isPending };
};

/**
 * Translations of one thread's messages into the UI language. Missing ones are requested in one batch
 * (the server makes one cheap-model call per thread load and caches per message + language). With
 * "show originals" on nothing is requested automatically; `request(id)` translates one message on demand.
 * When the AI is unavailable, `unavailable` is set and the UI shows the originals with a note.
 */
export const useMessageTranslations = (opts: { scope: 'case' | 'party'; id: string; items: Translatable[]; initial?: TranslationMap; enabled?: boolean }) => {
  const { scope, id, items } = opts;
  const { locale } = useL10n();
  const { showOriginals, loaded } = useShowOriginals();
  const [map, setMap] = useState<TranslationMap>({});
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const tried = useRef(new Set<string>());

  // Reset when the language or the thread changes.
  useEffect(() => {
    setMap({});
    setUnavailable(null);
    tried.current = new Set();
  }, [locale, scope, id]);

  const merged = useMemo(() => ({ ...(opts.initial ?? {}), ...map }), [opts.initial, map]);

  const needs = useCallback((m: Translatable) => !!m.text.trim() && !!m.lang && m.lang !== locale, [locale]);

  const run = useCallback(
    async (ids: string[]) => {
      if (!ids.length) return;
      ids.forEach((x) => tried.current.add(`${x}:${locale}`));
      try {
        const res = await api.post<{ translations: TranslationMap; unavailable?: string }>('/messaging-plus/translate', { scope, id, messageIds: ids, lang: locale });
        setMap((old) => ({ ...old, ...res.data.translations }));
        setUnavailable(res.data.unavailable ?? null);
      } catch {
        setUnavailable('ERROR');
      }
    },
    [scope, id, locale],
  );

  // Automatic batch for everything visible that still lacks a translation.
  const missingKey = useMemo(
    () =>
      items
        .filter((m) => needs(m) && !merged[m.id] && !tried.current.has(`${m.id}:${locale}`))
        .map((m) => m.id)
        .join(','),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, merged, needs, locale],
  );
  useEffect(() => {
    if (opts.enabled === false || !loaded || showOriginals || !missingKey) return;
    const t = window.setTimeout(() => void run(missingKey.split(',')), 250);
    return () => window.clearTimeout(t);
  }, [missingKey, loaded, showOriginals, run, opts.enabled]);

  return {
    locale: locale as Lang,
    translations: merged,
    unavailable,
    showOriginals,
    needs,
    request: (messageId: string) => void run([messageId]),
  };
};

export type MessageTranslations = ReturnType<typeof useMessageTranslations>;
