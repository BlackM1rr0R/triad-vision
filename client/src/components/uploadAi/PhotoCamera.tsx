import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Camera, CheckCircle2, Info, RefreshCw, SwitchCamera, Upload } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesPhotoCamera } from '@/i18n/pagesPhotoCamera';
import { cameraApiAvailable } from '@/lib/scanner/client';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { PhotoCheckNotice, photoCheckOf, type PhotoCheck } from './PhotoCheckNotice';
import { cropRect, faceHint, FRAME, outputSize, PHOTO_H_MM, PHOTO_W_MM, type FaceHint } from './photoFrame';

registerCopy(pagesPhotoCamera);

type Facing = 'user' | 'environment';
type Phase = 'starting' | 'live' | 'denied' | 'unavailable' | 'review';

/** Browser FaceDetector (Shape Detection API) — only where the browser has it; a hint, never required. */
interface DetectedFace {
  boundingBox: DOMRectReadOnly;
}
type FaceDetectorCtor = new (opts?: { fastMode?: boolean; maxDetectedFaces?: number }) => { detect: (src: CanvasImageSource) => Promise<DetectedFace[]> };
const faceDetectorCtor = (): FaceDetectorCtor | null => (typeof window !== 'undefined' && 'FaceDetector' in window ? ((window as unknown as { FaceDetector: FaceDetectorCtor }).FaceDetector ?? null) : null);

const TIPS = ['background', 'light', 'glasses', 'expression', 'head', 'helper'] as const;

/** The face-frame overlay in photo millimetres: oval, crown band, eye band, chin line, darkened outside. */
const FrameOverlay = ({ hint }: { hint: FaceHint | null }) => {
  const { t } = useTranslation();
  const o = FRAME.oval;
  const tone = hint === 'ok' ? '#22c55e' : '#ffffff';
  return (
    <svg viewBox={`0 0 ${PHOTO_W_MM} ${PHOTO_H_MM}`} className="pointer-events-none absolute inset-0 size-full" aria-hidden>
      <defs>
        <mask id="photo-oval-mask">
          <rect width={PHOTO_W_MM} height={PHOTO_H_MM} fill="white" />
          <ellipse cx={o.cx} cy={o.cy} rx={o.rx} ry={o.ry} fill="black" />
        </mask>
      </defs>
      <rect width={PHOTO_W_MM} height={PHOTO_H_MM} fill="black" opacity="0.35" mask="url(#photo-oval-mask)" />
      <ellipse cx={o.cx} cy={o.cy} rx={o.rx} ry={o.ry} fill="none" stroke={tone} strokeWidth="0.35" strokeDasharray="1 0.6" />
      {/* Crown band (head 32–36 mm), eye band, chin line. */}
      <rect x="4" y={FRAME.crownMinY} width={PHOTO_W_MM - 8} height={FRAME.crownMaxY - FRAME.crownMinY} fill="#38bdf8" opacity="0.18" />
      <line x1="4" x2={PHOTO_W_MM - 4} y1={FRAME.crownMinY} y2={FRAME.crownMinY} stroke="#38bdf8" strokeWidth="0.2" />
      <line x1="4" x2={PHOTO_W_MM - 4} y1={FRAME.crownMaxY} y2={FRAME.crownMaxY} stroke="#38bdf8" strokeWidth="0.2" />
      <rect x="6" y={FRAME.eyesMinY} width={PHOTO_W_MM - 12} height={FRAME.eyesMaxY - FRAME.eyesMinY} fill="#facc15" opacity="0.14" />
      <line x1="3" x2={PHOTO_W_MM - 3} y1={FRAME.chinY} y2={FRAME.chinY} stroke="#f97316" strokeWidth="0.3" />
      <line x1={PHOTO_W_MM / 2} x2={PHOTO_W_MM / 2} y1="1" y2={PHOTO_H_MM - 1} stroke="#ffffff" strokeWidth="0.12" opacity="0.6" strokeDasharray="0.8 0.8" />
      <g fontSize="1.6" fontFamily="system-ui, sans-serif" fill="#ffffff" stroke="#000000" strokeWidth="0.08" paintOrder="stroke">
        <text x="1" y={FRAME.crownMinY - 0.6}>{t('photoCamera.guides.crown')}</text>
        <text x="1" y={FRAME.eyesMinY - 0.6}>{t('photoCamera.guides.eyes')}</text>
        <text x="1" y={FRAME.chinY + 2.2}>{t('photoCamera.guides.chin')}</text>
      </g>
    </svg>
  );
};

/**
 * Live camera for the biometric passport photo: getUserMedia preview in a 35:45 box with a face oval and ICAO guide
 * lines (head 32–36 mm of 45), tips, capture → crop to 35:45 → the existing server check (POST /api/photo-check,
 * nothing stored) → results, then "Upload this photo" hands the JPEG to the caller's upload. No face recognition;
 * where the browser has FaceDetector, a distance / centring hint is shown on top (progressive enhancement).
 */
export const PhotoCamera = ({ open, onClose, onPhoto }: { open: boolean; onClose: () => void; onPhoto: (file: File) => void | Promise<void> }) => {
  const { t } = useTranslation();
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<Facing>('user');
  const [phase, setPhase] = useState<Phase>('starting');
  const [hint, setHint] = useState<FaceHint | null>(null);
  const [shot, setShot] = useState<{ file: File; url: string } | null>(null);
  const [check, setCheck] = useState<PhotoCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);
  const [sending, setSending] = useState(false);

  const stopStream = useCallback(() => {
    stream.current?.getTracks().forEach((tr) => tr.stop());
    stream.current = null;
  }, []);

  // Start / restart the camera while the dialog is open and no photo is being reviewed.
  useEffect(() => {
    if (!open || shot) return;
    let alive = true;
    setPhase('starting');
    (async () => {
      if (!cameraApiAvailable()) {
        setPhase('unavailable');
        return;
      }
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1440 } } });
        if (!alive) {
          s.getTracks().forEach((tr) => tr.stop());
          return;
        }
        stopStream();
        stream.current = s;
        if (video.current) {
          video.current.srcObject = s;
          await video.current.play().catch(() => undefined);
        }
        setPhase('live');
      } catch (err) {
        if (!alive) return;
        setPhase((err as { name?: string })?.name === 'NotAllowedError' ? 'denied' : 'unavailable');
      }
    })();
    return () => {
      alive = false;
      stopStream();
    };
  }, [open, facing, shot, stopStream]);

  // Optional face hint (FaceDetector exists in some Chromium builds only).
  useEffect(() => {
    const Ctor = faceDetectorCtor();
    if (!open || phase !== 'live' || !Ctor) return;
    let detector: InstanceType<FaceDetectorCtor> | null = null;
    try {
      detector = new Ctor({ fastMode: true, maxDetectedFaces: 1 });
    } catch {
      return;
    }
    let busy = false;
    const id = window.setInterval(async () => {
      const v = video.current;
      if (!v || busy || !v.videoWidth || !detector) return;
      busy = true;
      try {
        const faces = await detector.detect(v);
        const crop = cropRect(v.videoWidth, v.videoHeight);
        setHint(faces[0] ? faceHint(faces[0].boundingBox, crop) : null);
      } catch {
        setHint(null);
      } finally {
        busy = false;
      }
    }, 600);
    return () => window.clearInterval(id);
  }, [open, phase]);

  // Free the preview URL.
  useEffect(() => () => (shot ? URL.revokeObjectURL(shot.url) : undefined), [shot]);

  const runCheck = async (file: File) => {
    setChecking(true);
    setCheck(null);
    setCheckFailed(false);
    try {
      const form = new FormData();
      form.append('file', file);
      const { data } = await api.post<{ photoCheck: unknown }>('/photo-check', form);
      setCheck(photoCheckOf(data.photoCheck));
    } catch {
      setCheckFailed(true);
    } finally {
      setChecking(false);
    }
  };

  const capture = async () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const crop = cropRect(v.videoWidth, v.videoHeight);
    const size = outputSize(crop.sw, crop.sh);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // The preview of the front camera is mirrored for the user; the photo itself is not.
    ctx.drawImage(v, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) return;
    const file = new File([blob], `passfoto-${new Date().toISOString().slice(0, 10)}.jpg`, { type: 'image/jpeg' });
    stopStream();
    setShot({ file, url: URL.createObjectURL(file) });
    setPhase('review');
    void runCheck(file);
  };

  const retake = () => {
    setShot(null);
    setCheck(null);
    setCheckFailed(false);
    setHint(null);
  };

  const close = () => {
    stopStream();
    retake();
    onClose();
  };

  const use = async () => {
    if (!shot) return;
    setSending(true);
    try {
      await onPhoto(shot.file);
      close();
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      size="lg"
      title={t('photoCamera.title')}
      description={t('photoCamera.intro')}
      footer={
        phase === 'review' ? (
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={retake} disabled={sending}>
              <RefreshCw className="size-4" aria-hidden /> {t('photoCamera.retake')}
            </button>
            <button type="button" className="btn-primary btn-sm" onClick={() => void use()} disabled={sending || checking}>
              {sending ? <Spinner className="size-4" /> : <Upload className="size-4" aria-hidden />} {t('photoCamera.use')}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))} disabled={phase !== 'live'}>
              <SwitchCamera className="size-4" aria-hidden /> {t('photoCamera.switch')}
            </button>
            <button type="button" className="btn-primary btn-sm" onClick={() => void capture()} disabled={phase !== 'live'}>
              <Camera className="size-4" aria-hidden /> {t('photoCamera.capture')}
            </button>
          </>
        )
      }
    >
      <div className="grid gap-5 sm:grid-cols-[minmax(0,18rem)_1fr]">
        <div className="mx-auto w-full max-w-72">
          <div className="relative aspect-[35/45] overflow-hidden rounded-lg bg-neutral-900">
            {phase === 'review' && shot ? (
              <img src={shot.url} alt="" className="size-full object-cover" />
            ) : (
              <>
                <video ref={video} playsInline muted autoPlay className={clsx('size-full object-cover', facing === 'user' && '-scale-x-100')} />
                {phase === 'live' && <FrameOverlay hint={hint} />}
                {phase !== 'live' && (
                  <div className="absolute inset-0 grid place-items-center p-4 text-center text-sm text-white">
                    {phase === 'starting' ? (
                      <span className="flex items-center gap-2">
                        <Spinner className="size-4" /> {t('photoCamera.starting')}
                      </span>
                    ) : (
                      <span role="alert">{phase === 'denied' ? t('photoCamera.denied') : t('photoCamera.unavailable')}</span>
                    )}
                  </div>
                )}
              </>
            )}
            {phase === 'live' && hint && (
              <span className={clsx('absolute top-2 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap', hint === 'ok' ? 'bg-success text-white' : 'bg-black/70 text-white')} role="status">
                {hint === 'ok' && <CheckCircle2 className="mr-1 inline size-3.5" aria-hidden />}
                {t(`photoCamera.face.${hint}`)}
              </span>
            )}
          </div>
          <p className="mt-2 text-center text-[11px] text-muted">{t('photoCamera.rule')}</p>
        </div>

        <div className="min-w-0 space-y-3">
          {phase === 'review' ? (
            <>
              {checking && (
                <p className="flex items-center gap-2 text-sm text-muted" role="status">
                  <Spinner className="size-4" /> {t('photoCamera.checking')}
                </p>
              )}
              {checkFailed && <p className="text-sm text-warning-fg">{t('photoCamera.checkFailed')}</p>}
              <PhotoCheckNotice check={check} />
            </>
          ) : (
            <div>
              <h3 className="text-sm font-semibold text-ink">{t('photoCamera.tipsTitle')}</h3>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-ink">
                {TIPS.map((k) => (
                  <li key={k}>{t(`photoCamera.tips.${k}`)}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="flex gap-1.5 text-xs text-muted">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t('photoCamera.note')}
          </p>
        </div>
      </div>
    </Modal>
  );
};

/** "Take photo with camera" button: shown when the browser has the camera API (secure context). */
export const PhotoCameraButton = ({ onPhoto, disabled, className = 'btn-secondary btn-sm' }: { onPhoto: (file: File) => void | Promise<void>; disabled?: boolean; className?: string }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState(false);
  useEffect(() => setAvailable(cameraApiAvailable()), []);
  if (!available) return null;
  return (
    <>
      <button type="button" className={className} disabled={disabled} onClick={() => setOpen(true)}>
        <Camera className="size-4" aria-hidden /> {t('photoCamera.button')}
      </button>
      {open && <PhotoCamera open onClose={() => setOpen(false)} onPhoto={onPhoto} />}
    </>
  );
};

export default PhotoCamera;
