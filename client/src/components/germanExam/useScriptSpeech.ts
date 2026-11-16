import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioLine } from '@/lib/germanExam/types';
import { VOICE_PROFILES, pickVoice } from '@/lib/germanExam/voices';

/**
 * Plays a listening script line by line with the browser's speech synthesis (de-DE), one voice profile per speaker
 * (voice / pitch / rate, lib/germanExam/voices.ts) and a short pause between lines. `available` is only known after
 * mount (server render = false). Nothing leaves the browser.
 */
export const useScriptSpeech = () => {
  const [available, setAvailable] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const token = useRef(0);

  useEffect(() => {
    const ok = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
    setAvailable(ok);
    if (!ok) return;
    window.speechSynthesis.getVoices(); // Chrome loads the voices asynchronously
    return () => window.speechSynthesis.cancel();
  }, []);

  const stop = useCallback(() => {
    token.current += 1;
    if (available) window.speechSynthesis.cancel();
    setPlaying(null);
  }, [available]);

  /** Plays `lines`; `onDone` runs when the whole script has been read (not when stopped). */
  const play = useCallback(
    (id: string, lines: AudioLine[], rateFactor = 1, onDone?: () => void) => {
      if (!available || !lines.length) return;
      const synth = window.speechSynthesis;
      synth.cancel();
      const my = ++token.current;
      const voices = synth.getVoices();
      setPlaying(id);
      const speakLine = (i: number) => {
        if (token.current !== my) return;
        if (i >= lines.length) {
          setPlaying((cur) => (cur === id ? null : cur));
          onDone?.();
          return;
        }
        const line = lines[i];
        const profile = VOICE_PROFILES[line.voice];
        const u = new SpeechSynthesisUtterance(line.text);
        u.lang = 'de-DE';
        const v = pickVoice(voices, profile);
        if (v) u.voice = v;
        u.pitch = profile.pitch;
        u.rate = Math.max(0.5, Math.min(1.5, profile.rate * rateFactor));
        const next = () => window.setTimeout(() => speakLine(i + 1), 450);
        u.onend = next;
        u.onerror = (e) => {
          // "interrupted" / "canceled" come from stop(); anything else: skip to the next line.
          if (e.error === 'interrupted' || e.error === 'canceled') return;
          next();
        };
        synth.speak(u);
      };
      speakLine(0);
    },
    [available],
  );

  return { available, playing, play, stop };
};
