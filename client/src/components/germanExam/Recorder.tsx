import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mic, Square, Trash2 } from 'lucide-react';
import { buttonClass } from '@/components/ui/Button';
import { mmss } from '@/lib/games/common';

/**
 * Records the learner's spoken answer with MediaRecorder for self-listening. The audio stays in this tab as a blob
 * URL (never uploaded, never stored); the parent keeps the URL so it survives switching between parts and revokes
 * it on unmount.
 */
export const Recorder = ({ url, onChange }: { url: string | null; onChange: (url: string | null) => void }) => {
  const { t } = useTranslation();
  const [supported, setSupported] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState(false);
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    setSupported(typeof window !== 'undefined' && 'MediaRecorder' in window && !!navigator.mediaDevices?.getUserMedia);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
      if (rec.current?.state === 'recording') rec.current.stop();
      stream.current?.getTracks().forEach((tr) => tr.stop());
    };
  }, []);

  const start = async () => {
    setError(false);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = s;
      const r = new MediaRecorder(s);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      r.onstop = () => {
        s.getTracks().forEach((tr) => tr.stop());
        if (timer.current) window.clearInterval(timer.current);
        setRecording(false);
        if (chunks.length) {
          if (url) URL.revokeObjectURL(url);
          onChange(URL.createObjectURL(new Blob(chunks, { type: r.mimeType || 'audio/webm' })));
        }
      };
      rec.current = r;
      r.start();
      setSeconds(0);
      setRecording(true);
      timer.current = window.setInterval(() => setSeconds((x) => x + 1), 1000);
    } catch {
      setError(true);
      setRecording(false);
    }
  };

  const stop = () => {
    if (rec.current?.state === 'recording') rec.current.stop();
  };

  const remove = () => {
    if (url) URL.revokeObjectURL(url);
    onChange(null);
  };

  if (!supported) return <p className="text-sm text-muted">{t('mockExam.speaking.noRecorder')}</p>;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {recording ? (
          <button type="button" className={buttonClass({ variant: 'danger' })} onClick={stop} aria-pressed>
            <Square className="size-4" aria-hidden /> {t('mockExam.speaking.stop')}
          </button>
        ) : (
          <button type="button" className={buttonClass({ variant: 'outline' })} onClick={() => void start()}>
            <Mic className="size-4" aria-hidden /> {t('mockExam.speaking.record')}
          </button>
        )}
        {recording && (
          <span className="flex items-center gap-2 text-sm font-semibold text-ink tabular-nums" role="status">
            <span className="size-2.5 rounded-full bg-danger-fg motion-safe:animate-pulse" aria-hidden /> {t('mockExam.speaking.recording')} {mmss(seconds)}
          </span>
        )}
      </div>
      {error && (
        <p className="text-sm text-danger-fg" role="alert">
          {t('mockExam.speaking.micError')}
        </p>
      )}
      {url && !recording && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-ink">{t('mockExam.speaking.yourRecording')}</span>
          <audio controls src={url} className="h-10 max-w-full" />
          <button type="button" className={buttonClass({ variant: 'ghost', size: 'sm' })} onClick={remove}>
            <Trash2 className="size-4" aria-hidden /> {t('mockExam.speaking.delete')}
          </button>
        </div>
      )}
      <p className="text-xs text-muted">{t('mockExam.speaking.privacy')}</p>
    </div>
  );
};
