import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Circle, RefreshCw, Square, SwitchCamera, VideoOff } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { fmtDuration } from './api';

/** Container the browser can record: MP4 (Safari / iOS) first, then WebM (Chrome, Firefox, Android). */
const pickMime = () => {
  const options = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  if (typeof MediaRecorder === 'undefined') return null;
  return options.find((m) => MediaRecorder.isTypeSupported?.(m)) ?? '';
};

export interface Recording {
  blob: Blob;
  fileName: string;
  durationSec: number;
}

type Phase = 'starting' | 'ready' | 'countdown' | 'recording' | 'done' | 'error';

/**
 * Phone camera recorder (MediaRecorder): 3-2-1 countdown, hard stop at `maxSeconds`, preview, retake.
 * The back camera is used first (the candidate films their hands / tools); a button switches cameras.
 */
export const Recorder = ({ maxSeconds, onRecorded }: { maxSeconds: number; onRecorded: (r: Recording | null) => void }) => {
  const { t } = useTranslation();
  const live = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [phase, setPhase] = useState<Phase>('starting');
  const [error, setError] = useState<'noCamera' | 'unsupported' | null>(null);
  const [count, setCount] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const mime = useRef(pickMime());

  const stopStream = () => {
    stream.current?.getTracks().forEach((tr) => tr.stop());
    stream.current = null;
  };

  const openCamera = useCallback(async (mode: 'environment' | 'user') => {
    stopStream();
    if (mime.current === null || !navigator.mediaDevices?.getUserMedia) {
      setError('unsupported');
      setPhase('error');
      return;
    }
    setPhase('starting');
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: mode }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } },
        audio: true,
      });
      stream.current = s;
      if (live.current) {
        live.current.srcObject = s;
        await live.current.play().catch(() => undefined);
      }
      setPhase('ready');
    } catch {
      setError('noCamera');
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    void openCamera(facing);
    return () => {
      if (recorder.current?.state === 'recording') recorder.current.stop();
      stopStream();
    };
  }, [facing, openCamera]);

  // The live <video> may mount after the stream arrived (retake): attach it whenever both exist.
  useEffect(() => {
    const el = live.current;
    if (el && stream.current && el.srcObject !== stream.current) {
      el.srcObject = stream.current;
      void el.play().catch(() => undefined);
    }
  }, [phase, preview]);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const begin = () => {
    if (!stream.current) return;
    chunks.current = [];
    // ~2.5 Mbit/s keeps 90 s around 30 MB: fine on mobile data and far below the upload limit.
    const r = new MediaRecorder(stream.current, { ...(mime.current ? { mimeType: mime.current } : {}), videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 96_000 });
    r.ondataavailable = (e) => {
      if (e.data.size) chunks.current.push(e.data);
    };
    r.onstop = () => {
      const duration = Math.min(maxSeconds, (performance.now() - startedAt.current) / 1000);
      const type = (r.mimeType || mime.current || 'video/webm').split(';')[0];
      const blob = new Blob(chunks.current, { type });
      const ext = type === 'video/mp4' ? 'mp4' : 'webm';
      setPreview(URL.createObjectURL(blob));
      setPhase('done');
      stopStream();
      onRecorded({ blob, fileName: `skill-video-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ext}`, durationSec: Math.round(duration * 10) / 10 });
    };
    recorder.current = r;
    startedAt.current = performance.now();
    setElapsed(0);
    r.start(1000);
    setPhase('recording');
  };

  const start = () => {
    setPhase('countdown');
    setCount(3);
  };

  // Countdown 3-2-1, then record.
  useEffect(() => {
    if (phase !== 'countdown') return;
    if (count === 0) {
      begin();
      return;
    }
    const id = window.setTimeout(() => setCount((c) => c - 1), 1000);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, count]);

  // Elapsed timer and the hard stop at the limit.
  useEffect(() => {
    if (phase !== 'recording') return;
    const id = window.setInterval(() => {
      const s = (performance.now() - startedAt.current) / 1000;
      setElapsed(s);
      if (s >= maxSeconds) recorder.current?.stop();
    }, 250);
    return () => window.clearInterval(id);
  }, [phase, maxSeconds]);

  const stop = () => {
    if (recorder.current?.state === 'recording') recorder.current.stop();
  };

  const retake = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    onRecorded(null);
    void openCamera(facing);
  };

  if (phase === 'error') {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-warning-border bg-warning-bg p-3 text-sm text-warning-fg" role="alert">
        <VideoOff className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>{t(`skillVideos.recorder.${error ?? 'noCamera'}`)}</p>
      </div>
    );
  }

  const remaining = Math.max(0, Math.ceil(maxSeconds - elapsed));
  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-xl bg-navy-900">
        {preview ? (
          <video src={preview} controls playsInline className="aspect-video w-full" />
        ) : (
          <video ref={live} muted playsInline autoPlay className="aspect-video w-full object-cover" aria-label={t('skillVideos.recorder.title')} />
        )}
        {phase === 'countdown' && (
          <div className="absolute inset-0 grid place-items-center bg-scrim text-white" role="status" aria-live="assertive">
            <p className="text-center">
              <span className="block text-6xl font-bold tabular-nums">{count || ''}</span>
              <span className="text-sm">{t('skillVideos.recorder.countdown')}</span>
            </p>
          </div>
        )}
        {phase === 'recording' && (
          <p className="absolute top-2 left-2 inline-flex items-center gap-1.5 rounded-full bg-danger px-2.5 py-1 text-xs font-semibold text-white" role="timer" aria-live="off">
            <Circle className="size-2.5 fill-current" aria-hidden /> {fmtDuration(elapsed)} · {t('skillVideos.recorder.remaining', { s: remaining })}
          </p>
        )}
      </div>
      {phase === 'recording' && (
        <span className="block h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
          <span className="block h-full rounded-full bg-danger transition-[width]" style={{ width: `${Math.min(100, (elapsed / maxSeconds) * 100)}%` }} />
        </span>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {(phase === 'ready' || phase === 'starting') && (
          <>
            <Button size="sm" icon={Circle} onClick={start} disabled={phase !== 'ready'} loading={phase === 'starting'}>
              {t('skillVideos.recorder.start')}
            </Button>
            <Button size="sm" variant="secondary" icon={SwitchCamera} onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))} disabled={phase !== 'ready'}>
              {t('skillVideos.recorder.switchCamera')}
            </Button>
          </>
        )}
        {phase === 'recording' && (
          <Button size="sm" variant="danger" icon={Square} onClick={stop}>
            {t('skillVideos.recorder.stop')}
          </Button>
        )}
        {phase === 'done' && (
          <Button size="sm" variant="secondary" icon={RefreshCw} onClick={retake}>
            {t('skillVideos.recorder.retake')}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted">{t('skillVideos.recorder.tips')}</p>
    </div>
  );
};
