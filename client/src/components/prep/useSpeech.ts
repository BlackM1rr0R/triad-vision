import { useCallback, useEffect, useState } from 'react';

const supported = () => typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

const germanVoice = () => {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => v.lang === 'de-DE') ?? voices.find((v) => v.lang.toLowerCase().startsWith('de')) ?? null;
};

/** Reads German text aloud with the browser's speech synthesis, preferring a de-DE voice. */
export const useGermanSpeech = () => {
  const [speaking, setSpeaking] = useState<string | null>(null);
  const available = supported();

  useEffect(() => {
    if (!available) return;
    // Chrome loads voices asynchronously; touching the list starts that.
    window.speechSynthesis.getVoices();
    return () => window.speechSynthesis.cancel();
  }, [available]);

  const stop = useCallback(() => {
    if (!available) return;
    window.speechSynthesis.cancel();
    setSpeaking(null);
  }, [available]);

  const speak = useCallback(
    (id: string, text: string) => {
      if (!available) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.replace(/[[\]]/g, ''));
      u.lang = 'de-DE';
      const voice = germanVoice();
      if (voice) u.voice = voice;
      u.rate = 0.9;
      u.onend = () => setSpeaking((cur) => (cur === id ? null : cur));
      u.onerror = () => setSpeaking((cur) => (cur === id ? null : cur));
      setSpeaking(id);
      window.speechSynthesis.speak(u);
    },
    [available],
  );

  return { available, speaking, speak, stop };
};
