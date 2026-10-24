import type { EnhanceMode, Quad } from './geometry';
import { runJob, type ScanRequest, type ScanResult } from './jobs';

/**
 * Main-thread side of the document scanner: camera helpers, image decoding and the worker bridge. Heavy pixel
 * work runs in lib/scanner/scanner.worker.ts; if the worker cannot start (old browser, CSP), the same code
 * runs on the main thread.
 */

let worker: Worker | null | undefined;
let seq = 0;
const pending = new Map<number, { resolve: (r: ScanResult) => void; reject: (e: Error) => void }>();

const getWorker = (): Worker | null => {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('./scanner.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; result?: ScanResult; error?: string }>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.ok && e.data.result) p.resolve(e.data.result);
      else p.reject(new Error(e.data.error ?? 'SCAN_FAILED'));
    };
    worker.onerror = () => {
      // Broken worker: fail the waiting jobs and fall back to the main thread from now on.
      for (const p of pending.values()) p.reject(new Error('SCAN_WORKER_FAILED'));
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  } catch {
    worker = null;
  }
  return worker;
};

/**
 * Runs a job in the worker (pixels are transferred, not copied). `make` builds the request; it is called
 * again for the main-thread fallback because a transferred buffer is gone from this side.
 */
const run = (make: () => ScanRequest): Promise<ScanResult> => {
  const w = getWorker();
  if (!w) return Promise.resolve().then(() => runJob(make()));
  const req = make();
  const id = ++seq;
  return new Promise<ScanResult>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, req }, [req.data.buffer]);
  }).catch(() => runJob(make()));
};

/** Pixels of an image source drawn at most `maxSide` px on the long side. */
export const pixelsOf = (source: CanvasImageSource, width: number, height: number, maxSide = Infinity) => {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, w, h);
  return { data: ctx.getImageData(0, 0, w, h).data, width: w, height: h, scale };
};

/** Document corners in the coordinates of a width×height image (detection runs on a 400 px copy). */
export const detectCorners = async (source: CanvasImageSource, width: number, height: number): Promise<{ quad: Quad; found: boolean }> => {
  let px = pixelsOf(source, width, height, 400);
  const scale = px.scale;
  const res = await run(() => {
    if (!px.data.byteLength) px = pixelsOf(source, width, height, 400);
    return { type: 'detect', data: px.data, width: px.width, height: px.height };
  });
  if (res.type !== 'detect') throw new Error('SCAN_FAILED');
  const k = 1 / scale;
  return { found: res.found, quad: res.quad.map((p) => ({ x: Math.min(width - 1, p.x * k), y: Math.min(height - 1, p.y * k) })) as Quad };
};

/** Warp + enhance + rotate one page and encode it as JPEG (under `maxBytes`, lowering the quality if needed). */
export const renderPage = async (
  source: CanvasImageSource,
  width: number,
  height: number,
  opts: { quad: Quad; mode: EnhanceMode; turns: number; maxLong?: number; maxBytes?: number },
): Promise<{ blob: Blob; width: number; height: number }> => {
  const res = await run(() => {
    const px = pixelsOf(source, width, height);
    return { type: 'process', data: px.data, width: px.width, height: px.height, quad: opts.quad, mode: opts.mode, turns: opts.turns, maxLong: opts.maxLong };
  });
  if (res.type !== 'process') throw new Error('SCAN_FAILED');
  const canvas = document.createElement('canvas');
  canvas.width = res.width;
  canvas.height = res.height;
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(res.data), res.width, res.height), 0, 0);
  const maxBytes = opts.maxBytes ?? 4.5 * 1024 * 1024;
  let quality = opts.mode === 'bw' ? 0.8 : 0.85;
  let blob: Blob | null = null;
  for (let i = 0; i < 5; i++) {
    blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality));
    if (blob && blob.size <= maxBytes) break;
    quality -= 0.12;
  }
  if (!blob) throw new Error('SCAN_ENCODE_FAILED');
  return { blob, width: res.width, height: res.height };
};

/** Decodes a photo (EXIF orientation applied) into something drawable. */
export const decodeImage = async (blob: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> => {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      // fall through to <img>
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => undefined };
  } finally {
    URL.revokeObjectURL(url);
  }
};

/** getUserMedia is available (secure context, supporting browser). */
export const cameraApiAvailable = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && window.isSecureContext;

/** Touch-first device (phones, tablets): the capture input works even without the camera API. */
export const isTouchDevice = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

/** True when the device has a camera (labels are hidden before permission, the kind is not). */
export const hasCamera = async (): Promise<boolean> => {
  if (!cameraApiAvailable()) return false;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.some((d) => d.kind === 'videoinput');
  } catch {
    return false;
  }
};

/** Rear camera at the highest practical resolution. */
export const openCamera = () =>
  navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } },
  });
