import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

/**
 * Image decoding for the quality check and the AI downscale, in a separate Node process.
 *
 * @napi-rs/canvas (Skia) decodes fast, but a malformed upload (a PNG signature without IHDR, a JPEG header
 * followed by garbage) makes it SEGFAULT — in-process that would take the whole API down. So the decoder runs
 * in one long-lived child process: a crash only kills the child, the pending request gets an error (the quality
 * check then falls back to the header checks) and the next upload starts a fresh child. Idle children exit after
 * IDLE_MS. Without @napi-rs/canvas installed everything resolves to null.
 */

export type DecodeResult =
  | { ok: true; width: number; height: number; gray?: { data: Uint8Array; width: number; height: number }; jpeg?: Buffer }
  | { ok: false; error: string };

const IDLE_MS = 5 * 60_000;
const JOB_TIMEOUT_MS = 4000;

/** The child: decodes with Skia, returns size + grayscale copy (long side ≤ edge) or a downscaled JPEG. */
const WORKER_SOURCE = String.raw`
const lib = await import(process.argv[1]);
process.on('disconnect', () => process.exit(0)); // the API went away (restart, shutdown)
process.on('message', async (m) => {
  try {
    const img = await lib.loadImage(Buffer.from(m.data));
    const width = img.width, height = img.height;
    if (!width || !height) return process.send({ id: m.id, ok: false, error: 'EMPTY' });
    const scale = Math.min(1, m.edge / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
    const canvas = lib.createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    if (m.op === 'jpeg') {
      const jpeg = await canvas.encode('jpeg', m.quality);
      return process.send({ id: m.id, ok: true, width, height, jpeg });
    }
    const rgba = ctx.getImageData(0, 0, w, h).data;
    const gray = new Uint8Array(w * h);
    for (let i = 0, j = 0; j < gray.length; i += 4, j++) gray[j] = (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000;
    process.send({ id: m.id, ok: true, width, height, gray: { data: gray, width: w, height: h } });
  } catch (err) {
    process.send({ id: m.id, ok: false, error: String((err && err.message) || err).slice(0, 120) });
  }
});
process.send({ ready: true });
`;

let canvasPath: string | null | undefined;
const resolveCanvas = () => {
  if (canvasPath !== undefined) return canvasPath;
  try {
    canvasPath = pathToFileURL(createRequire(import.meta.url).resolve('@napi-rs/canvas')).href;
  } catch {
    console.warn('[uploadAi] @napi-rs/canvas is not installed: image quality is limited to header checks');
    canvasPath = null;
  }
  return canvasPath;
};

type Pending = { resolve: (r: DecodeResult) => void; timer: NodeJS.Timeout };
let child: ChildProcess | null = null;
let ready: Promise<boolean> | null = null;
let idleTimer: NodeJS.Timeout | null = null;
let seq = 0;
const pending = new Map<number, Pending>();

const failAll = (error: string) => {
  for (const [id, p] of pending) {
    clearTimeout(p.timer);
    p.resolve({ ok: false, error });
    pending.delete(id);
  }
};

const stop = () => {
  const c = child;
  child = null;
  ready = null;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  if (c && c.exitCode === null) c.kill();
};

const touch = () => {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (!pending.size) stop();
  }, IDLE_MS);
  idleTimer.unref();
};

const start = (modulePath: string) => {
  const c = spawn(process.execPath, ['--max-old-space-size=384', '--input-type=module', '-e', WORKER_SOURCE, modulePath], {
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    serialization: 'advanced',
    windowsHide: true,
  });
  child = c;
  c.stderr?.on('data', () => undefined);
  ready = new Promise<boolean>((resolve) => {
    const t = setTimeout(() => resolve(false), 10_000);
    t.unref();
    c.once('message', () => {
      clearTimeout(t);
      resolve(true);
    });
    c.once('exit', () => resolve(false));
    c.once('error', () => resolve(false));
  });
  c.on('message', (m: { id?: number } & DecodeResult) => {
    if (typeof m?.id !== 'number') return;
    const p = pending.get(m.id);
    if (!p) return;
    clearTimeout(p.timer);
    pending.delete(m.id);
    const r = m as DecodeResult & { id: number; gray?: { data: Uint8Array | Buffer; width: number; height: number }; jpeg?: Uint8Array };
    if (r.ok) {
      p.resolve({
        ok: true,
        width: r.width,
        height: r.height,
        ...(r.gray ? { gray: { data: new Uint8Array(r.gray.data), width: r.gray.width, height: r.gray.height } } : {}),
        ...(r.jpeg ? { jpeg: Buffer.from(r.jpeg) } : {}),
      });
    } else p.resolve({ ok: false, error: r.error });
  });
  c.on('exit', (code, signal) => {
    if (child === c) {
      child = null;
      ready = null;
    }
    if (pending.size) console.warn(`[uploadAi] image decoder exited (${signal ?? code}) — a malformed image?`);
    failAll('DECODER_CRASHED');
  });
  c.on('error', () => failAll('DECODER_UNAVAILABLE'));
  // The child never keeps the API (or a test run) alive on its own.
  c.unref();
  (c as unknown as { channel?: { unref?: () => void } }).channel?.unref?.();
};

/**
 * Decodes in the child (started on demand). Never throws. A crash while this job was pending may have been
 * caused by another job (e.g. a background downscale of a corrupt upload), so it is retried once in a fresh
 * child; a second crash means this file is the broken one.
 */
export const decodeInChild = async (data: Buffer, op: 'gray' | 'jpeg', opts: { edge: number; quality?: number }): Promise<DecodeResult | null> => {
  const first = await decodeOnce(data, op, opts);
  if (first && !first.ok && first.error === 'DECODER_CRASHED') return decodeOnce(data, op, opts);
  return first;
};

const decodeOnce = async (data: Buffer, op: 'gray' | 'jpeg', opts: { edge: number; quality?: number }): Promise<DecodeResult | null> => {
  const modulePath = resolveCanvas();
  if (!modulePath) return null;
  if (!child) start(modulePath);
  const c = child!;
  if (!(await ready)) {
    if (child === c) stop();
    return { ok: false, error: 'DECODER_UNAVAILABLE' };
  }
  const id = ++seq;
  touch();
  return new Promise<DecodeResult>((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve({ ok: false, error: 'DECODE_TIMEOUT' });
      // A stuck decode blocks the child for every later upload: start over.
      if (child === c) stop();
    }, JOB_TIMEOUT_MS);
    pending.set(id, { resolve, timer });
    try {
      c.send({ id, op, data, edge: opts.edge, quality: opts.quality ?? 80 });
    } catch {
      clearTimeout(timer);
      pending.delete(id);
      resolve({ ok: false, error: 'DECODER_UNAVAILABLE' });
    }
  });
};

/** Stops the decoder child (tests, graceful shutdown). */
export const stopDecoder = () => stop();
