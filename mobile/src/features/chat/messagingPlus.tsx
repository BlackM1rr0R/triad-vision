import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import Globe from 'lucide-react-native/icons/globe';
import Play from 'lucide-react-native/icons/play';
import { Text, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { API_URL } from '@/lib/config';
import { pickLanguage } from '@/i18n/merge';
import '@/i18n/messagingPlus';
import { colors, fonts } from '@/theme';
import type { CaseMessage, VoiceInfo } from '@/types';

/**
 * Messaging plus in the mobile chat: messages shown in the reader's language (translated on demand by
 * the server, one batch per thread, cached), and voice messages (playback through a short-lived signed
 * link opened in the system browser / player; recording happens in the web portal — the app ships no
 * audio-recording module).
 */

type TranslationMap = Record<string, { text: string; lang: string }>;

export const textOf = (m: Pick<CaseMessage, 'body' | 'voice'>) => (m.body ?? '').trim() || (m.voice?.transcriptStatus === 'DONE' ? m.voice.transcript ?? '' : '');

/** Translations of a case thread into the app language (POST /messaging-plus/translate). */
export const useCaseTranslations = (caseId: string | undefined, messages: CaseMessage[]) => {
  const { i18n } = useTranslation();
  const lang = pickLanguage([i18n.language]);
  const [map, setMap] = useState<TranslationMap>({});
  const [unavailable, setUnavailable] = useState(false);
  const tried = useRef(new Set<string>());
  useEffect(() => {
    setMap({});
    tried.current = new Set();
  }, [lang, caseId]);
  const missing = useMemo(
    () =>
      messages
        .filter((m) => textOf(m) && (m.lang ?? m.voice?.transcriptLang) && (m.lang ?? m.voice?.transcriptLang) !== lang && !map[m.id] && !tried.current.has(`${m.id}:${lang}`))
        .map((m) => m.id),
    [messages, map, lang],
  );
  const key = missing.join(',');
  useEffect(() => {
    if (!caseId || !key) return;
    const ids = key.split(',');
    ids.forEach((id) => tried.current.add(`${id}:${lang}`));
    const timer = setTimeout(() => {
      api
        .post<{ translations: TranslationMap; unavailable?: string }>('/messaging-plus/translate', { scope: 'case', id: caseId, messageIds: ids, lang })
        .then(({ data }) => {
          setMap((old) => ({ ...old, ...data.translations }));
          setUnavailable(!!data.unavailable);
        })
        .catch(() => setUnavailable(true));
    }, 300);
    return () => clearTimeout(timer);
  }, [caseId, key, lang]);
  return { translations: map, unavailable };
};

/** Message text with the "Translated · Show original" toggle. */
export const TranslatedText = ({ text, translation, mine }: { text: string; translation?: { text: string } | null; mine: boolean }) => {
  const { t } = useTranslation();
  const [original, setOriginal] = useState(false);
  const differs = !!translation && translation.text.trim() !== text.trim();
  const color = mine ? colors.white : colors.ink;
  const meta = mine ? 'rgba(255,255,255,0.75)' : colors.muted;
  return (
    <View>
      <Text style={{ color, fontFamily: fonts.body, fontSize: 15, lineHeight: 21 }} selectable>
        {differs && !original ? translation!.text : text}
      </Text>
      {differs ? (
        <Pressable onPress={() => setOriginal((v) => !v)} accessibilityRole="button" hitSlop={8} style={styles.toggle}>
          <Globe size={11} color={meta} />
          <Text style={{ color: meta, fontSize: 11, fontFamily: fonts.medium }}>
            {t('m.msgPlus.translated')} · {original ? t('m.msgPlus.showTranslation') : t('m.msgPlus.showOriginal')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
};

const fmt = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Voice message: play button (signed link → system player), bars, duration, transcript. */
export const VoiceBubble = ({ voice, mine, translation }: { voice: VoiceInfo; mine: boolean; translation?: { text: string } | null }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const fg = mine ? colors.white : colors.blue;
  const meta = mine ? 'rgba(255,255,255,0.75)' : colors.muted;
  const play = async () => {
    setBusy(true);
    try {
      const { data } = await api.get<{ url: string }>(`/messaging-plus/voice/${voice.id}/link`);
      await WebBrowser.openBrowserAsync(`${API_URL.replace(/\/api\/?$/, '')}${data.url}`);
    } catch {
      toast(t('m.msgPlus.playFailed'), 'error');
    } finally {
      setBusy(false);
    }
  };
  const status = voice.transcriptStatus;
  return (
    <View style={{ gap: 6 }}>
      <Pressable onPress={() => void play()} disabled={busy} accessibilityRole="button" accessibilityLabel={`${t('m.msgPlus.play')} · ${t('m.msgPlus.voice')}`} style={styles.voiceRow}>
        <View style={[styles.playBtn, { backgroundColor: mine ? 'rgba(255,255,255,0.22)' : colors.blue }]}>
          <Play size={15} color={colors.white} />
        </View>
        <View style={styles.bars}>
          {Array.from({ length: 18 }, (_, i) => (
            <View key={i} style={{ width: 3, borderRadius: 2, height: 6 + ((i * 7 + voice.id.charCodeAt(i % voice.id.length)) % 16), backgroundColor: fg, opacity: 0.6 }} />
          ))}
        </View>
        <Text style={{ color: meta, fontSize: 11, fontFamily: fonts.medium }}>{fmt(voice.durationMs)}</Text>
      </Pressable>
      {status === 'DONE' && voice.transcript ? (
        <TranslatedText text={voice.transcript} translation={translation} mine={mine} />
      ) : (
        <Text style={{ color: meta, fontSize: 11 }}>
          {status === 'PENDING'
            ? t('m.msgPlus.transcriptPending')
            : status === 'NOT_CONFIGURED'
              ? t('m.msgPlus.transcriptOff')
              : status === 'EMPTY'
                ? t('m.msgPlus.transcriptEmpty')
                : t('m.msgPlus.transcriptFailed')}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 180 },
  playBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  bars: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2, height: 24 },
});
