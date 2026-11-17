import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Square, Volume2 } from 'lucide-react';
import clsx from 'clsx';
import { registerCopy } from '@/i18n';
import { worldCopy } from '@/i18n/world';

registerCopy(worldCopy);

/*
 * Own module (re-exported by PhraseOfDay.tsx): pages that only need the "listen" button (glossary terms) do not
 * pull in the phrase list (phrases.ts, ~40 KB) that the phrase-of-the-day card needs.
 */

/** The browser's German voice (speechSynthesis), or null — then the "listen" button stays hidden. */
const useGermanVoice = () => {
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  useEffect(() => {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return;
    const pick = () => {
      const voices = synth.getVoices();
      setVoice(voices.find((v) => v.lang?.toLowerCase().replace('_', '-') === 'de-de') ?? voices.find((v) => v.lang?.toLowerCase().startsWith('de')) ?? null);
    };
    pick();
    synth.addEventListener?.('voiceschanged', pick);
    return () => {
      synth.removeEventListener?.('voiceschanged', pick);
      synth.cancel();
    };
  }, []);
  return voice;
};

/** "Listen": reads the German phrase with a German voice. Keeps its space when there is none (no layout shift). */
export const ListenButton = ({ text, className }: { text: string; className?: string }) => {
  const { t } = useTranslation();
  const voice = useGermanVoice();
  const [speaking, setSpeaking] = useState(false);
  const toggle = useCallback(() => {
    const synth = window.speechSynthesis;
    if (!voice || !synth) return;
    synth.cancel();
    if (speaking) {
      setSpeaking(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(text.replace(/…/g, ''));
    u.voice = voice;
    u.lang = voice.lang || 'de-DE';
    u.rate = 0.85;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    setSpeaking(true);
    synth.speak(u);
  }, [speaking, text, voice]);

  return (
    <button
      type="button"
      onClick={toggle}
      className={clsx(
        'inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line bg-card px-3.5 text-sm font-semibold text-ink transition-colors hover:bg-sunken',
        !voice && 'invisible',
        className,
      )}
      aria-pressed={speaking}
    >
      {speaking ? <Square className="size-3.5" aria-hidden /> : <Volume2 className="size-4" aria-hidden />}
      {t(speaking ? 'world.phrase.stop' : 'world.phrase.listen')}
    </button>
  );
};
