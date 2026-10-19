import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import type { Worker } from 'tesseract.js';
import { ocrDataDir } from '../docsIntel/ocr.js';

/**
 * General-purpose OCR for the drive indexer (not the MRZ worker of docsIntel, which whitelists MRZ
 * characters). Uses the language data of docsIntel (TESSERACT_LANG_PATH, default server/ocr): every one of
 * aze, deu, eng, rus that is present, eng at least. Never downloads anything; without eng no OCR at all.
 */

const WANTED = ['aze', 'deu', 'eng', 'rus'] as const;

/** Languages present in the data dir (all plain or all gzipped, following eng). */
export const ocrLanguages = () => {
  const gz = fs.existsSync(path.join(ocrDataDir, 'eng.traineddata.gz'));
  const plain = fs.existsSync(path.join(ocrDataDir, 'eng.traineddata'));
  if (!gz && !plain) return null;
  const ext = plain ? '.traineddata' : '.traineddata.gz';
  const langs = WANTED.filter((l) => fs.existsSync(path.join(ocrDataDir, `${l}${ext}`)));
  return { langs: langs.length ? langs : ['eng'], gzip: !plain };
};

/**
 * Two passes instead of one worker with all four languages (mixing scripts makes tesseract misread plain
 * Latin text, e.g. "hello" → "hellü"): Latin scripts first (eng primary + deu + aze), and only when that
 * result is weak, Cyrillic (rus + eng); the more confident text wins.
 */
type Pass = 'latin' | 'cyrillic';
const PASS_LANGS: Record<Pass, string[]> = { latin: ['eng', 'deu', 'aze'], cyrillic: ['rus', 'eng'] };
const WEAK_CONFIDENCE = 60;

const workers: Partial<Record<Pass, Promise<Worker>>> = {};

const createTextWorker = async (pass: Pass) => {
  const avail = ocrLanguages();
  if (!avail) throw new Error('OCR_UNAVAILABLE');
  const langs = PASS_LANGS[pass].filter((l) => (avail.langs as readonly string[]).includes(l));
  if (!langs.length) throw new Error('OCR_UNAVAILABLE');
  const { createWorker, OEM } = await import('tesseract.js');
  return createWorker(langs.join('+'), OEM.LSTM_ONLY, {
    langPath: ocrDataDir,
    cachePath: ocrDataDir,
    cacheMethod: 'none',
    gzip: avail.gzip,
    logger: () => undefined,
    errorHandler: (err: unknown) => console.error('[drive-index] ocr worker error', err),
  });
};

const getWorker = (pass: Pass) => {
  if (!workers[pass]) {
    workers[pass] = createTextWorker(pass).catch((err) => {
      delete workers[pass];
      throw err;
    });
  }
  return workers[pass]!;
};

/** Frees the workers (the indexer calls it after each batch: OCR is rare, memory is not free). */
export const releaseOcr = async () => {
  const all = Object.values(workers);
  for (const k of Object.keys(workers) as Pass[]) delete workers[k];
  await Promise.all(all.map((w) => w!.then((x) => x.terminate()).catch(() => undefined)));
};

const withTimeout = <T>(p: Promise<T>, ms: number) =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`OCR timed out after ${ms} ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });

const recognise = async (pass: Pass, image: Buffer, timeoutMs: number) => {
  const w = await withTimeout(getWorker(pass), timeoutMs);
  const { data } = await withTimeout(w.recognize(image), timeoutMs);
  return { text: data.text ?? '', confidence: data.confidence ?? 0 };
};

/** Text of one image (JPEG / PNG bytes); '' when OCR is unavailable. */
export const ocrImage = async (image: Buffer, timeoutMs = 60_000) => {
  const avail = ocrLanguages();
  if (!avail) return '';
  try {
    const latin = await recognise('latin', image, timeoutMs);
    if (latin.confidence >= WEAK_CONFIDENCE || !avail.langs.includes('rus')) return latin.text;
    const cyr = await recognise('cyrillic', image, timeoutMs);
    return cyr.confidence > latin.confidence ? cyr.text : latin.text;
  } catch (err) {
    await releaseOcr();
    throw err;
  }
};

// ─── PNG encoder (raw pixels from PDF image XObjects → PNG tesseract can read) ──

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

/** Encodes 8-bit grey (channels 1) or RGB (channels 3) pixels as a PNG. */
export const encodePng = (pixels: Buffer, width: number, height: number, channels: 1 | 3) => {
  const stride = width * channels;
  if (pixels.length < stride * height) throw new Error('short pixel data');
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = channels === 3 ? 2 : 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};
