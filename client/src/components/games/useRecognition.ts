import { useCallback, useEffect, useRef, useState } from 'react';

/** Minimal typing of the Web Speech API recognition (not in lib.dom for every TS version; prefixed in Chrome). */
interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResultList {
  length: number;
  [i: number]: { length: number; isFinal: boolean; [j: number]: RecognitionAlternative };
}
interface RecognitionEvent {
  results: RecognitionResultList;
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => Recognition;

const ctor = (): RecognitionCtor | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export type RecognitionError = 'denied' | 'noSpeech' | 'network' | 'other';

/**
 * German speech recognition (lang de-DE) with the browser's Web Speech API. `supported` is false in browsers
 * without it (Firefox; Safari only partly), so the page offers listen-only practice there. We never send audio
 * anywhere ourselves; in Chrome the browser itself sends the audio to its vendor's speech service.
 */
export const useGermanRecognition = () => {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<RecognitionError | null>(null);
  const rec = useRef<Recognition | null>(null);

  // After mount only (the server render and the first browser render agree: "not supported").
  useEffect(() => {
    setSupported(!!ctor());
    return () => rec.current?.abort();
  }, []);

  const stop = useCallback(() => rec.current?.stop(), []);

  /** Starts listening; resolves with the final transcript ('' when nothing was understood). */
  const listen = useCallback(
    () =>
      new Promise<string>((resolve) => {
        const C = ctor();
        if (!C) return resolve('');
        rec.current?.abort();
        const r = new C();
        rec.current = r;
        r.lang = 'de-DE';
        r.interimResults = true;
        r.maxAlternatives = 1;
        r.continuous = false;
        let final = '';
        let latest = '';
        setError(null);
        setInterim('');
        r.onresult = (e) => {
          let text = '';
          for (let i = 0; i < e.results.length; i++) text += e.results[i][0]?.transcript ?? '';
          setInterim(text);
          latest = text;
          const lastResult = e.results[e.results.length - 1];
          if (lastResult?.isFinal) final = text;
        };
        r.onerror = (e) => {
          setError(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'denied' : e.error === 'no-speech' ? 'noSpeech' : e.error === 'network' ? 'network' : e.error === 'aborted' ? null : 'other');
        };
        r.onend = () => {
          setListening(false);
          resolve(final || latest);
        };
        try {
          r.start();
          setListening(true);
        } catch {
          setListening(false);
          setError('other');
          resolve('');
        }
      }),
    [],
  );

  return { supported, listening, interim, error, listen, stop };
};
