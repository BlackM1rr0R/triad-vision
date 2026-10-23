import { toast } from 'sonner';
import i18n, { registerCopy } from '@/i18n';
import { COMPRESS, targetSize } from './imageSize';

// The only two texts of this helper live here, so upload pages do not need the whole site copy (pagesSite).
registerCopy({
  az: { site: { compress: { busy: 'Optimallaşdırılır…', progress: 'Optimallaşdırılır… {{done}}/{{total}}' } } },
  de: { site: { compress: { busy: 'Wird optimiert…', progress: 'Wird optimiert… {{done}}/{{total}}' } } },
  en: { site: { compress: { busy: 'Optimising…', progress: 'Optimising… {{done}}/{{total}}' } } },
  ru: { site: { compress: { busy: 'Оптимизация…', progress: 'Оптимизация… {{done}}/{{total}}' } } },
});

/**
 * Shared image compression before upload, used by every image upload path of the web client (case documents,
 * scans, drive, vault, tasks, chat, mail, translations, partner portal, share links, CMS images, passport scan,
 * letter explainer).
 *
 * Rules: only JPEG / PNG / WebP photos of at least 1 MB are touched (PDFs, Office files, GIF, SVG and HEIC —
 * which most browsers cannot decode — go up unchanged). The long side is brought down to 2200 px, but the
 * short side never below 1200 px, so the server scan-quality check (server/src/lib/uploadAi/quality.ts,
 * documents: WARN below 1000 px short side) never flags a photo because of this step. Never upscales.
 * JPEG quality 0.82; EXIF orientation is applied (createImageBitmap imageOrientation 'from-image') and the
 * metadata (GPS…) dropped. When the result is not smaller, the original is kept. The file name keeps its base
 * and gets ".jpg" when the type changed.
 */

export { COMPRESS, targetSize } from './imageSize';

export const shouldCompress = (file: Blob & { name?: string }, opts: { minBytes?: number } = {}) =>
  (COMPRESS.types as readonly string[]).includes(file.type) && file.size >= (opts.minBytes ?? COMPRESS.minBytes);

const decode = async (file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> => {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      // fall through to <img> (older Safari)
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => undefined };
  } finally {
    URL.revokeObjectURL(url);
  }
};

const jpgName = (name: string) => `${name.replace(/\.[a-z0-9]{1,5}$/i, '') || 'image'}.jpg`;

export interface CompressOptions {
  maxLongEdge?: number;
  minShortEdge?: number;
  quality?: number;
  /** Below this size the file is left alone (default 1 MB). */
  minBytes?: number;
  /** Re-encode even when the size would stay the same (passport scan: always a clean JPEG). */
  force?: boolean;
}

/** Compresses one file by the rules above; any other file (or any failure) returns the original. */
export const compressImage = async (file: File, opts: CompressOptions = {}): Promise<File> => {
  if (!opts.force && !shouldCompress(file, opts)) return file;
  // force: any image the browser can decode (Safari decodes HEIC) becomes a JPEG.
  if (opts.force && !file.type.startsWith('image/')) return file;
  let decoded;
  try {
    decoded = await decode(file);
  } catch {
    return file;
  }
  try {
    const size = targetSize(decoded.width, decoded.height, opts) ?? { width: decoded.width, height: decoded.height };
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    // Transparent PNG areas would turn black in a JPEG.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(decoded.source, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', opts.quality ?? COMPRESS.quality));
    if (!blob || (!opts.force && blob.size >= file.size)) return file;
    return new File([blob], file.type === 'image/jpeg' ? file.name || 'image.jpg' : jpgName(file.name || 'image'), {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  } finally {
    decoded.close();
  }
};

/**
 * Compresses a list of files, showing an "Optimallaşdırılır…" toast while it works (only when at least one
 * file qualifies). Order is kept; non-images pass through untouched.
 */
export const optimizeImages = async (files: File[], opts: CompressOptions = {}): Promise<File[]> => {
  const work = files.filter((f) => (opts.force ? (COMPRESS.types as readonly string[]).includes(f.type) : shouldCompress(f, opts)));
  if (!work.length) return files;
  const id = toast.loading(String(i18n.t('site.compress.busy', { defaultValue: 'Optimallaşdırılır…' })), { duration: Infinity });
  try {
    const out: File[] = [];
    let done = 0;
    for (const f of files) {
      const isWork = work.includes(f);
      out.push(isWork ? await compressImage(f, opts) : f);
      if (isWork && work.length > 1) {
        done++;
        toast.loading(String(i18n.t('site.compress.progress', { done, total: work.length, defaultValue: 'Optimallaşdırılır… {{done}}/{{total}}' })), { id });
      }
    }
    return out;
  } finally {
    toast.dismiss(id);
  }
};

/** One file version of optimizeImages. */
export const optimizeImage = async (file: File, opts: CompressOptions = {}) => (await optimizeImages([file], opts))[0];
