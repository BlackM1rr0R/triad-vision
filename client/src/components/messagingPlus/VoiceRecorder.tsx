import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Mic, Square, X } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesMessagingPlus } from '@/i18n/pagesMessagingPlus';
import { Spinner } from '@/components/ui/Spinner';

registerCopy(pagesMessagingPlus);

export const VOICE_MAX_MS = 3 * 60 * 1000;
const MIN_MS = 600;
/** A press held longer than this is "hold to record": releasing sends. A short tap starts tap-to-record. */
const HOLD_MS = 450;

/** Containers the server accepts; MP4/Ogg first (best supported by transcription models), WebM/Opus as fallback. */
const CANDIDATES = ['audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/webm'];
const EXT: Record<string, string> = { 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/webm': 'webm', 'audio/mpeg': 'mp3' };

const pickMime = () => {
  if (typeof MediaRecorder === 'undefined') return null;
  return CANDIDATES.find((m) => MediaRecorder.isTypeSupported?.(m)) ?? '';
};

export const recordingSupported = () => typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

/** Uploads a recording as multipart "file" + durationMs to a messaging-plus voice endpoint. */
export const uploadVoice = async <T,>(url: string, blob: Blob, durationMs: number) => {
  const base = (blob.type || 'audio/webm').split(';')[0];
  const fd = new FormData();
  fd.append('durationMs', String(Math.round(durationMs)));
  fd.append('file', blob, `voice.${EXT[base] ?? 'webm'}`);
  return (await api.post<T>(url, fd)).data;
};

const fmt = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Microphone button for the message composers: tap to start (tap the stop button to send), or hold and
 * release to send. Max 3 minutes (stops and sends automatically). Records with MediaRecorder.
 */
export const VoiceRecorder = ({ uploadUrl, onSent, disabled, className }: { uploadUrl: string; onSent?: (data: unknown) => void; disabled?: boolean; className?: string }) => {
  const { t } = useTranslation();
  const [state, setState] = useState<'idle' | 'recording' | 'sending'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const pressAt = useRef(0);
  const cancelled = useRef(false);
  const timer = useRef(0);

  const cleanup = () => {
    window.clearInterval(timer.current);
    stream.current?.getTracks().forEach((tr) => tr.stop());
    stream.current = null;
    rec.current = null;
  };
  useEffect(() => () => {
    cancelled.current = true;
    if (rec.current?.state === 'recording') rec.current.stop();
    cleanup();
  }, []);

  const send = async (blob: Blob, ms: number) => {
    if (ms < MIN_MS || !blob.size) {
      toast.error(t('msgPlus.voice.tooShort'));
      setState('idle');
      return;
    }
    setState('sending');
    try {
      const data = await uploadVoice(uploadUrl, blob, Math.min(ms, VOICE_MAX_MS));
      onSent?.(data);
    } catch (err) {
      const code = errorCode(err);
      toast.error(code === 'THREAD_CLOSED' ? t('msgPlus.party.closed') : t('msgPlus.voice.failed'));
    } finally {
      setState('idle');
    }
  };

  const stop = (discard = false) => {
    const r = rec.current;
    if (!r || r.state !== 'recording') return;
    cancelled.current = discard;
    r.stop();
  };

  const start = async () => {
    if (state !== 'idle' || disabled) return;
    if (!recordingSupported()) {
      toast.error(t('msgPlus.voice.unsupported'));
      return;
    }
    let s: MediaStream;
    try {
      s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      toast.error(t('msgPlus.voice.micDenied'));
      return;
    }
    const mime = pickMime();
    let r: MediaRecorder;
    try {
      r = mime ? new MediaRecorder(s, { mimeType: mime, audioBitsPerSecond: 32_000 }) : new MediaRecorder(s);
    } catch {
      s.getTracks().forEach((tr) => tr.stop());
      toast.error(t('msgPlus.voice.unsupported'));
      return;
    }
    stream.current = s;
    rec.current = r;
    chunks.current = [];
    cancelled.current = false;
    r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    r.onstop = () => {
      const ms = Date.now() - startedAt.current;
      const blob = new Blob(chunks.current, { type: (r.mimeType || mime || 'audio/webm').split(';')[0] });
      const discard = cancelled.current;
      cleanup();
      if (discard) setState('idle');
      else void send(blob, ms);
    };
    startedAt.current = Date.now();
    r.start(1000);
    setElapsed(0);
    setState('recording');
    timer.current = window.setInterval(() => {
      const ms = Date.now() - startedAt.current;
      setElapsed(ms);
      if (ms >= VOICE_MAX_MS) stop();
    }, 250);
  };

  if (state === 'recording') {
    return (
      <div className={clsx('flex items-center gap-2 rounded-full border border-red-200 bg-red-50 py-1 pr-1 pl-3 text-xs font-semibold text-red-700', className)} role="status" aria-live="polite">
        <span className="size-2 animate-pulse rounded-full bg-red-600" aria-hidden />
        <span className="tabular-nums">{t('msgPlus.voice.recording', { time: fmt(elapsed) })}</span>
        <button type="button" className="grid size-9 place-items-center rounded-full text-red-700 hover:bg-red-100" onClick={() => stop(true)} aria-label={t('msgPlus.voice.cancel')}>
          <X className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          className="grid size-9 place-items-center rounded-full bg-red-600 text-white hover:bg-red-700"
          onClick={() => stop()}
          aria-label={t('msgPlus.voice.stop')}
        >
          <Square className="size-3.5" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={clsx('btn-white size-11 shrink-0 border border-line p-0', className)}
      disabled={disabled || state === 'sending'}
      aria-label={state === 'sending' ? t('msgPlus.voice.sending') : t('msgPlus.voice.record')}
      title={t('msgPlus.voice.record')}
      onPointerDown={() => {
        pressAt.current = Date.now();
        // Hold to record: releasing anywhere after a long press stops and sends; a short tap keeps recording.
        window.addEventListener(
          'pointerup',
          () => {
            if (pressAt.current && Date.now() - pressAt.current > HOLD_MS) window.setTimeout(() => stop(), 50);
            pressAt.current = 0;
          },
          { once: true },
        );
        void start();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          pressAt.current = 0;
          void start();
        }
      }}
    >
      {state === 'sending' ? <Spinner className="size-4" /> : <Mic className="size-4.5" aria-hidden />}
    </button>
  );
};
