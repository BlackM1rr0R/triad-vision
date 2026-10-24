import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import {
  ArrowDown,
  ArrowUp,
  Camera,
  Check,
  Crop,
  ImagePlus,
  Maximize,
  Plus,
  RefreshCw,
  RotateCw,
  ScanLine,
  Send,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button, IconButton } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Spinner } from '@/components/ui/Spinner';
import { registerCopy } from '@/i18n';
import { pagesScanner } from '@/i18n/pagesScanner';
import { fullFrame, type EnhanceMode, type Pt, type Quad } from '@/lib/scanner/geometry';
import { cameraApiAvailable, decodeImage, detectCorners, openCamera, renderPage } from '@/lib/scanner/client';

registerCopy(pagesScanner);

/** Server limit of POST /cases/:id/documents/scan (lib/scan/pdf.ts SCAN_MAX_PAGES). */
export const SCAN_MAX_PAGES = 20;
const MODES: EnhanceMode[] = ['auto', 'gray', 'bw', 'original'];
const CORNERS = ['tl', 'tr', 'br', 'bl'] as const;
/** Captured photos are kept as JPEG (long side ≤ 4000 px) so 20 pages do not exhaust a phone's memory. */
const SOURCE_MAX = 4000;

interface Shot {
  source: Blob;
  url: string;
  width: number;
  height: number;
  quad: Quad;
  found: boolean;
}
interface Page extends Shot {
  id: string;
  mode: EnhanceMode;
  turns: number;
  preview: string | null;
  file: Blob | null;
  busy: boolean;
}

const uid = () => Math.random().toString(36).slice(2, 10);

/** Draws a drawable into a JPEG blob (long side ≤ SOURCE_MAX). */
const toSourceJpeg = async (src: CanvasImageSource, width: number, height: number) => {
  const scale = Math.min(1, SOURCE_MAX / Math.max(width, height));
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(src, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
  if (!blob) throw new Error('SCAN_ENCODE_FAILED');
  return { blob, width: w, height: h, canvas };
};

const quadPoints = (q: Quad, w: number, h: number) => q.map((p) => `${(p.x / w) * 100},${(p.y / h) * 100}`).join(' ');

// ─── Corner adjustment ─────────────────────────────────────────────────

const CornerEditor = ({ shot, quad, onChange }: { shot: Shot; quad: Quad; onChange: (q: Quad) => void }) => {
  const { t } = useTranslation();
  const box = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);

  const toImage = (clientX: number, clientY: number): Pt => {
    const r = box.current!.getBoundingClientRect();
    return {
      x: Math.min(shot.width - 1, Math.max(0, ((clientX - r.left) / r.width) * shot.width)),
      y: Math.min(shot.height - 1, Math.max(0, ((clientY - r.top) / r.height) * shot.height)),
    };
  };
  const move = (i: number, p: Pt) => onChange(quad.map((q, k) => (k === i ? p : q)) as Quad);
  const onPointerMove = (e: PointerEvent) => {
    if (drag === null) return;
    e.preventDefault();
    move(drag, toImage(e.clientX, e.clientY));
  };
  const onKey = (i: number) => (e: KeyboardEvent) => {
    const step = (e.shiftKey ? 0.05 : 0.01) * Math.max(shot.width, shot.height);
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    e.preventDefault();
    const p = quad[i];
    move(i, { x: Math.min(shot.width - 1, Math.max(0, p.x + d[0])), y: Math.min(shot.height - 1, Math.max(0, p.y + d[1])) });
  };

  return (
    <div className="flex justify-center bg-navy-950 p-3 sm:p-4">
      {/* The box has the photo's aspect ratio, so percent coordinates map 1:1 onto image pixels. */}
      <div
        ref={box}
        className="relative touch-none select-none"
        style={{ aspectRatio: `${shot.width} / ${shot.height}`, width: `min(100%, calc(62dvh * ${shot.width / shot.height}))` }}
        onPointerMove={onPointerMove}
        onPointerUp={() => setDrag(null)}
        onPointerCancel={() => setDrag(null)}
      >
        <img src={shot.url} alt="" className="absolute inset-0 size-full rounded-md object-fill" draggable={false} />
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full" aria-hidden>
          <polygon points={quadPoints(quad, shot.width, shot.height)} className="fill-brand-500/20 stroke-brand-400" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
        </svg>
        {quad.map((p, i) => (
          <button
            key={CORNERS[i]}
            type="button"
            aria-label={t('scanner.adjust.corner', { name: t(`scanner.adjust.corners.${CORNERS[i]}`) })}
            className={clsx(
              'absolute grid size-11 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-white',
              drag === i && 'cursor-grabbing',
            )}
            style={{ left: `${(p.x / shot.width) * 100}%`, top: `${(p.y / shot.height) * 100}%` }}
            onPointerDown={(e) => {
              e.preventDefault();
              (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
              setDrag(i);
            }}
            onPointerMove={onPointerMove}
            onPointerUp={() => setDrag(null)}
            onKeyDown={onKey(i)}
          >
            <span className={clsx('block size-6 rounded-full border-[3px] border-white bg-brand-600/70 shadow-lg', drag === i && 'scale-125')} />
          </button>
        ))}
      </div>
    </div>
  );
};

// ─── Scanner ───────────────────────────────────────────────────────────

/**
 * Camera document scanner: live rear camera with edge detection, capture, corner adjustment, perspective
 * correction to ~A4, enhancement (auto / gray / black & white / original), rotate, page list with
 * reorder / delete / retake; `onDone` receives the pages as JPEG files (the caller uploads them as one PDF).
 * Without camera access it falls back to the phone's own camera (<input capture>) or the gallery.
 */
export default function DocumentScanner({
  open,
  onClose,
  onDone,
  maxPages = SCAN_MAX_PAGES,
  title,
  progress,
}: {
  open: boolean;
  onClose: () => void;
  onDone: (files: File[]) => Promise<boolean | void>;
  maxPages?: number;
  title?: string;
  /** Upload progress 0–1 shown on the send button (null = idle). */
  progress?: number | null;
}) {
  const { t } = useTranslation();
  const [view, setView] = useState<'camera' | 'adjust' | 'review'>('camera');
  const [pages, setPages] = useState<Page[]>([]);
  const [shot, setShot] = useState<Shot | null>(null);
  const [quad, setQuad] = useState<Quad | null>(null);
  /** Page being re-cropped or retaken (null = a new page). */
  const [target, setTarget] = useState<{ id: string; retake: boolean } | null>(null);
  const [camState, setCamState] = useState<'idle' | 'starting' | 'live' | 'denied' | 'unavailable'>('idle');
  const [liveQuad, setLiveQuad] = useState<{ quad: Quad; w: number; h: number } | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const systemRef = useRef<HTMLInputElement>(null);
  const pagesRef = useRef<Page[]>([]);
  pagesRef.current = pages;

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    setLiveQuad(null);
    setCamState((s) => (s === 'live' || s === 'starting' ? 'idle' : s));
  }, []);

  // Camera on while the camera view is shown.
  useEffect(() => {
    if (!open || view !== 'camera') return;
    if (!cameraApiAvailable()) {
      setCamState('unavailable');
      return;
    }
    let cancelled = false;
    setCamState('starting');
    openCamera()
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          void v.play().catch(() => undefined);
        }
        setCamState('live');
      })
      .catch((err: DOMException) => setCamState(err?.name === 'NotAllowedError' || err?.name === 'SecurityError' ? 'denied' : 'unavailable'));
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [open, view, stopCamera]);

  // Live edge preview (a 400 px frame every ~0.7 s, in the worker).
  useEffect(() => {
    if (camState !== 'live') return;
    let alive = true;
    let timer = 0;
    const tick = async () => {
      const v = videoRef.current;
      if (alive && v && v.videoWidth && !document.hidden) {
        try {
          const d = await detectCorners(v, v.videoWidth, v.videoHeight);
          if (alive) setLiveQuad(d.found ? { quad: d.quad, w: v.videoWidth, h: v.videoHeight } : null);
        } catch {
          // ignore: the preview is only a hint
        }
      }
      if (alive) timer = window.setTimeout(() => void tick(), 700);
    };
    timer = window.setTimeout(() => void tick(), 500);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [camState]);

  // Free object URLs when the scanner closes or unmounts.
  useEffect(
    () => () => {
      for (const p of pagesRef.current) {
        URL.revokeObjectURL(p.url);
        if (p.preview) URL.revokeObjectURL(p.preview);
      }
    },
    [],
  );

  const reset = () => {
    for (const p of pages) {
      URL.revokeObjectURL(p.url);
      if (p.preview) URL.revokeObjectURL(p.preview);
    }
    if (shot && !pages.some((p) => p.url === shot.url)) URL.revokeObjectURL(shot.url);
    setPages([]);
    setShot(null);
    setQuad(null);
    setTarget(null);
    setView('camera');
  };

  const close = () => {
    if (sending) return;
    if (pages.length) {
      setConfirmClose(true);
      return;
    }
    stopCamera();
    reset();
    onClose();
  };

  /** Turns a captured frame / chosen photo into a shot with detected corners, then opens the corner editor. */
  const takeShot = async (src: CanvasImageSource, width: number, height: number) => {
    const jpeg = await toSourceJpeg(src, width, height);
    const d = await detectCorners(jpeg.canvas, jpeg.width, jpeg.height).catch(() => ({ quad: fullFrame(jpeg.width, jpeg.height), found: false }));
    const next: Shot = { source: jpeg.blob, url: URL.createObjectURL(jpeg.blob), width: jpeg.width, height: jpeg.height, quad: d.quad, found: d.found };
    setShot(next);
    setQuad(d.quad);
    stopCamera();
    setView('adjust');
  };

  const capture = async () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    setCapturing(true);
    try {
      await takeShot(v, v.videoWidth, v.videoHeight);
    } catch {
      toast.error(t('scanner.failed'));
    } finally {
      setCapturing(false);
    }
  };

  const fromFile = async (file: File | undefined) => {
    if (galleryRef.current) galleryRef.current.value = '';
    if (systemRef.current) systemRef.current.value = '';
    if (!file) return;
    setCapturing(true);
    try {
      const img = await decodeImage(file);
      try {
        await takeShot(img.source, img.width, img.height);
      } finally {
        img.close();
      }
    } catch {
      toast.error(t('scanner.failed'));
    } finally {
      setCapturing(false);
    }
  };

  /** Re-renders one page (warp + enhancement + rotation) in the worker and stores the JPEG. */
  const render = useCallback(
    async (page: Page) => {
      setPages((ps) => ps.map((p) => (p.id === page.id ? { ...p, busy: true } : p)));
      try {
        const img = await decodeImage(page.source);
        try {
          const out = await renderPage(img.source, img.width, img.height, { quad: page.quad, mode: page.mode, turns: page.turns });
          const preview = URL.createObjectURL(out.blob);
          setPages((ps) =>
            ps.map((p) => {
              if (p.id !== page.id) return p;
              if (p.preview) URL.revokeObjectURL(p.preview);
              return { ...p, preview, file: out.blob, busy: false };
            }),
          );
        } finally {
          img.close();
        }
      } catch {
        toast.error(t('scanner.failed'));
        setPages((ps) => ps.map((p) => (p.id === page.id ? { ...p, busy: false } : p)));
      }
    },
    [t],
  );

  const confirmShot = () => {
    if (!shot || !quad) return;
    const existing = target ? pages.find((p) => p.id === target.id) : undefined;
    let page: Page;
    if (existing) {
      if (target?.retake && existing.url !== shot.url) URL.revokeObjectURL(existing.url);
      page = { ...existing, ...shot, quad, busy: true };
      setPages((ps) => ps.map((p) => (p.id === existing.id ? page : p)));
    } else {
      page = { ...shot, quad, id: uid(), mode: 'auto', turns: 0, preview: null, file: null, busy: true };
      setPages((ps) => [...ps, page]);
    }
    setShot(null);
    setQuad(null);
    setTarget(null);
    setView('review');
    void render(page);
  };

  const update = (id: string, patch: Partial<Pick<Page, 'mode' | 'turns'>>) => {
    const page = pages.find((p) => p.id === id);
    if (!page) return;
    const next = { ...page, ...patch };
    setPages((ps) => ps.map((p) => (p.id === id ? next : p)));
    void render(next);
  };

  const remove = (id: string) => {
    const page = pages.find((p) => p.id === id);
    if (page) {
      URL.revokeObjectURL(page.url);
      if (page.preview) URL.revokeObjectURL(page.preview);
    }
    const left = pages.filter((p) => p.id !== id);
    setPages(left);
    if (!left.length) setView('camera');
  };

  const moveBy = (id: string, dir: -1 | 1) => {
    const i = pages.findIndex((p) => p.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= pages.length) return;
    const next = [...pages];
    [next[i], next[j]] = [next[j], next[i]];
    setPages(next);
  };

  const recrop = (page: Page) => {
    setTarget({ id: page.id, retake: false });
    setShot({ source: page.source, url: page.url, width: page.width, height: page.height, quad: page.quad, found: page.found });
    setQuad(page.quad);
    setView('adjust');
  };

  const send = async () => {
    if (!pages.length || pages.some((p) => p.busy || !p.file)) return;
    setSending(true);
    try {
      const files = pages.map((p, i) => new File([p.file!], `scan-${String(i + 1).padStart(2, '0')}.jpg`, { type: 'image/jpeg' }));
      const ok = await onDone(files);
      if (ok !== false) {
        reset();
        onClose();
      }
    } finally {
      setSending(false);
    }
  };

  const full = pages.length >= maxPages && !target;
  const busyPages = pages.some((p) => p.busy);

  const fileInputs = (
    <>
      <input ref={galleryRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void fromFile(e.target.files?.[0])} />
      <input ref={systemRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void fromFile(e.target.files?.[0])} />
    </>
  );

  const footer =
    view === 'camera' ? (
      <>
        {pages.length > 0 && (
          <Button variant="secondary" onClick={() => setView('review')} disabled={capturing}>
            {t('scanner.review.title')} ({pages.length})
          </Button>
        )}
        <Button variant="secondary" icon={ImagePlus} onClick={() => galleryRef.current?.click()} disabled={capturing || full}>
          {t('scanner.camera.gallery')}
        </Button>
        {camState === 'live' && (
          <Button icon={Camera} onClick={() => void capture()} loading={capturing} disabled={full}>
            {t('scanner.camera.capture')}
          </Button>
        )}
      </>
    ) : view === 'adjust' ? (
      <>
        <Button
          variant="ghost"
          icon={RefreshCw}
          onClick={() => {
            if (shot && !pages.some((p) => p.url === shot.url)) URL.revokeObjectURL(shot.url);
            setShot(null);
            setQuad(null);
            if (target && !target.retake) {
              setTarget(null);
              setView('review');
            } else setView('camera');
          }}
        >
          {target && !target.retake ? t('scanner.close') : t('scanner.adjust.retake')}
        </Button>
        <Button icon={Check} onClick={confirmShot}>
          {t('scanner.adjust.confirm')}
        </Button>
      </>
    ) : (
      <>
        <Button
          variant="secondary"
          icon={Plus}
          onClick={() => {
            setTarget(null);
            setView('camera');
          }}
          disabled={full || sending}
        >
          {t('scanner.review.addPage')}
        </Button>
        <Button icon={Send} onClick={() => void send()} loading={sending} disabled={!pages.length || busyPages}>
          {sending && progress != null ? t('scanner.review.uploading', { percent: Math.round(progress * 100) }) : t('scanner.review.upload')}
        </Button>
      </>
    );

  return (
    <>
      <Modal
        open={open}
        onClose={close}
        busy={sending}
        size="2xl"
        mobile="full"
        align="top"
        padded={false}
        icon={<ScanLine className="size-5 text-brand-600" aria-hidden />}
        title={title ?? t('scanner.title')}
        description={pages.length ? t('scanner.pagesCount', { count: pages.length }) : undefined}
        footer={footer}
      >
        {fileInputs}
        {view === 'camera' && (
          <div className="flex flex-col">
            <div className="relative flex min-h-[50dvh] items-center justify-center bg-black sm:min-h-[60vh]">
              {(camState === 'live' || camState === 'starting') && (
                <video ref={videoRef} playsInline muted autoPlay className="max-h-[68dvh] w-full object-contain" aria-label={t('scanner.title')} />
              )}
              {camState === 'starting' && (
                <p className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-white/80" role="status">
                  <Spinner className="size-4" /> {t('scanner.camera.starting')}
                </p>
              )}
              {camState === 'live' && liveQuad && videoRef.current && (
                <LiveOverlay video={videoRef.current} quad={liveQuad.quad} w={liveQuad.w} h={liveQuad.h} />
              )}
              {camState === 'live' && (
                <p className={clsx('absolute top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-semibold', liveQuad ? 'bg-success text-white' : 'bg-black/60 text-white')} aria-live="polite">
                  {liveQuad ? t('scanner.camera.found') : t('scanner.camera.searching')}
                </p>
              )}
              {(camState === 'denied' || camState === 'unavailable') && (
                <div className="flex max-w-md flex-col items-center gap-4 p-6 text-center text-white">
                  <Camera className="size-10 text-white/60" aria-hidden />
                  <p className="text-sm text-white/85">{camState === 'denied' ? t('scanner.camera.denied') : t('scanner.camera.unavailable')}</p>
                  <Button icon={Camera} onClick={() => systemRef.current?.click()} loading={capturing} disabled={full}>
                    {t('scanner.camera.useSystem')}
                  </Button>
                </div>
              )}
              {camState === 'live' && (
                <button
                  type="button"
                  onClick={() => void capture()}
                  disabled={capturing || full}
                  aria-label={t('scanner.camera.capture')}
                  className="absolute bottom-4 left-1/2 grid size-16 -translate-x-1/2 place-items-center rounded-full border-4 border-white bg-white/25 shadow-xl transition active:scale-95 disabled:opacity-50 sm:hidden"
                >
                  {capturing ? <Spinner className="size-6 text-white" /> : <span className="block size-11 rounded-full bg-white" />}
                </button>
              )}
            </div>
            <p className="px-4 py-3 text-xs text-muted">{full ? t('scanner.review.max', { max: maxPages }) : t('scanner.camera.tip')}</p>
          </div>
        )}

        {view === 'adjust' && shot && quad && (
          <div>
            <CornerEditor shot={shot} quad={quad} onChange={setQuad} />
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <p className="text-xs text-muted">
                {shot.found ? t('scanner.adjust.found') : t('scanner.adjust.notFound')} {t('scanner.adjust.hint')}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" icon={Maximize} onClick={() => setQuad(fullFrame(shot.width, shot.height))}>
                  {t('scanner.adjust.reset')}
                </Button>
                <Button size="sm" variant="ghost" icon={Wand2} onClick={() => setQuad(shot.quad)}>
                  {t('scanner.adjust.auto')}
                </Button>
              </div>
            </div>
          </div>
        )}

        {view === 'review' && (
          <div className="p-4 sm:p-5">
            {!pages.length ? (
              <p className="text-sm text-muted">{t('scanner.review.empty')}</p>
            ) : (
              <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {pages.map((p, i) => (
                  <li key={p.id} className="flex flex-col overflow-hidden rounded-xl border border-line bg-card">
                    <div className="relative grid aspect-[3/4] place-items-center bg-surface">
                      {p.preview ? <img src={p.preview} alt={t('scanner.review.page', { n: i + 1 })} className="max-h-full max-w-full object-contain" /> : null}
                      {p.busy && (
                        <span className="absolute inset-0 grid place-items-center bg-card/60" role="status">
                          <Spinner className="size-6 text-brand-600" label={t('scanner.review.processing')} />
                        </span>
                      )}
                      <span className="absolute top-2 left-2 rounded-full bg-navy-900/80 px-2 py-0.5 text-[11px] font-bold text-white">{i + 1}</span>
                    </div>
                    <div className="space-y-2 p-3">
                      <div role="radiogroup" aria-label={t('scanner.review.mode')} className="grid grid-cols-4 gap-1 rounded-lg bg-surface p-0.5">
                        {MODES.map((m) => (
                          <button
                            key={m}
                            type="button"
                            role="radio"
                            aria-checked={p.mode === m}
                            onClick={() => p.mode !== m && update(p.id, { mode: m })}
                            disabled={p.busy}
                            className={clsx('min-h-9 rounded-md px-1 text-[11px] font-semibold transition', p.mode === m ? 'bg-card text-ink shadow-sm' : 'text-muted hover:text-ink')}
                          >
                            {m === 'auto' && <Sparkles className="mr-0.5 inline size-3" aria-hidden />}
                            {t(`scanner.review.modes.${m}`)}
                          </button>
                        ))}
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        <IconButton icon={RotateCw} label={t('scanner.review.rotate')} size="sm" onClick={() => update(p.id, { turns: (p.turns + 1) % 4 })} disabled={p.busy} />
                        <IconButton icon={Crop} label={t('scanner.review.crop')} size="sm" onClick={() => recrop(p)} disabled={p.busy} />
                        <IconButton
                          icon={Camera}
                          label={t('scanner.review.retake')}
                          size="sm"
                          onClick={() => {
                            setTarget({ id: p.id, retake: true });
                            setView('camera');
                          }}
                          disabled={p.busy}
                        />
                        <IconButton icon={ArrowUp} label={t('scanner.review.moveUp')} size="sm" onClick={() => moveBy(p.id, -1)} disabled={i === 0} />
                        <IconButton icon={ArrowDown} label={t('scanner.review.moveDown')} size="sm" onClick={() => moveBy(p.id, 1)} disabled={i === pages.length - 1} />
                        <span className="flex-1" />
                        <IconButton icon={Trash2} label={t('scanner.review.delete')} size="sm" variant="danger" onClick={() => remove(p.id)} />
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {full && <p className="mt-3 text-xs text-muted">{t('scanner.review.max', { max: maxPages })}</p>}
          </div>
        )}
      </Modal>
      <ConfirmDialog
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        onConfirm={() => {
          setConfirmClose(false);
          stopCamera();
          reset();
          onClose();
        }}
        title={t('scanner.discardTitle')}
        message={t('scanner.discardText')}
        confirmLabel={t('scanner.discard')}
      />
    </>
  );
}

/** Detected outline over the live video (object-fit: contain → letterbox offsets). */
const LiveOverlay = ({ video, quad, w, h }: { video: HTMLVideoElement; quad: Quad; w: number; h: number }) => {
  const box = video.getBoundingClientRect();
  const parent = video.parentElement?.getBoundingClientRect();
  if (!parent || !box.width) return null;
  const scale = Math.min(box.width / w, box.height / h);
  const dw = w * scale;
  const dh = h * scale;
  const left = box.left - parent.left + (box.width - dw) / 2;
  const top = box.top - parent.top + (box.height - dh) / 2;
  return (
    <svg className="pointer-events-none absolute" style={{ left, top, width: dw, height: dh }} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      <polygon points={quadPoints(quad, w, h)} className="fill-brand-400/15 stroke-brand-300" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
    </svg>
  );
};
