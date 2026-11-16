import { useCallback, useEffect, useState } from 'react';

const germanVoice = () => {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => v.lang === 'de-DE') ?? voices.find((v) => v.lang.toLowerCase().startsWith('de')) ?? null;
};

/**
 * Reads German aloud with the browser's speech synthesis (de-DE voice when there is one), like prep/useSpeech
 * but with a speed per call (slow practice) and `available` only known after mount (server render = false).
 */
export const useSpeak = () => {
  const [available, setAvailable] = useState(false);
  const [speaking, setSpeaking] = useState<string | null>(null);

  useEffect(() => {
    const ok = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
    setAvailable(ok);
    if (!ok) return;
    window.speechSynthesis.getVoices(); // Chrome loads the voices asynchronously
    return () => window.speechSynthesis.cancel();
  }, []);

  const stop = useCallback(() => {
    if (!available) return;
    window.speechSynthesis.cancel();
    setSpeaking(null);
  }, [available]);

  const speak = useCallback(
    (id: string, text: string, rate = 0.95) => {
      if (!available) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'de-DE';
      const voice = germanVoice();
      if (voice) u.voice = voice;
      u.rate = rate;
      u.onend = () => setSpeaking((cur) => (cur === id ? null : cur));
      u.onerror = () => setSpeaking((cur) => (cur === id ? null : cur));
      setSpeaking(id);
      window.speechSynthesis.speak(u);
    },
    [available],
  );

  return { available, speaking, speak, stop };
};
