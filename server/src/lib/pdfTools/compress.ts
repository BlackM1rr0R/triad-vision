import zlib from 'node:zlib';
import sharp from 'sharp';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFObject, PDFRawStream, PDFRef, type PDFPage } from 'pdf-lib';
import { collectGarbage, loadPdf, pageGeometry } from './core.js';

/**
 * Making PDFs smaller: embedded raster images are decoded, downscaled to the resolution they are shown at
 * (~150 dpi by default) and re-encoded as JPEG with sharp; quality steps down (70 → 45) and then the
 * resolution (120 / 100 dpi) until the file fits the target. Scanned PDFs (every page = one full-page
 * image, no text) are rebuilt page by page from the recompressed images. Metadata (XMP, info entries except
 * the title) and unreachable objects are dropped, uncompressed streams are deflated, object streams are used.
 * Images the decoder does not understand (CMYK, JPX, JBIG2, CCITT, indexed, 1-bit, masks…) stay as they are.
 */

export const TARGETS = {
  /** Fits common e-mail attachment limits comfortably. */
  email: 5 * 1024 * 1024,
  /** Upload portals that take at most 2 MB. */
  portal2mb: 2_000_000,
} as const;

/** (dpi, JPEG quality) passes; the first one that fits wins, otherwise the smallest result. */
const PASSES: [number, number][] = [
  [150, 70],
  [150, 62],
  [150, 55],
  [150, 50],
  [150, 45],
  [120, 45],
  [100, 45],
];

const n = (k: string) => PDFName.of(k);
const K = {
  Subtype: n('Subtype'),
  Image: n('Image'),
  Width: n('Width'),
  Height: n('Height'),
  Filter: n('Filter'),
  DecodeParms: n('DecodeParms'),
  BitsPerComponent: n('BitsPerComponent'),
  ColorSpace: n('ColorSpace'),
  SMask: n('SMask'),
  Mask: n('Mask'),
  ImageMask: n('ImageMask'),
  Decode: n('Decode'),
  XObject: n('XObject'),
  Resources: n('Resources'),
  Font: n('Font'),
  Metadata: n('Metadata'),
  Length: n('Length'),
};

const num = (o: PDFObject | undefined) => (o instanceof PDFNumber ? o.asNumber() : 0);

const filters = (d: PDFDict) => {
  const f = d.lookup(K.Filter);
  if (f instanceof PDFName) return [f.asString()];
  if (f instanceof PDFArray) return f.asArray().map((x) => (x instanceof PDFName ? x.asString() : '?'));
  return [];
};

/** Number of colour components of a colour space we can re-encode (1 or 3), else 0. */
const components = (doc: PDFDocument, cs: PDFObject | undefined): number => {
  const o = cs instanceof PDFRef ? doc.context.lookup(cs) : cs;
  if (o instanceof PDFName) return o.asString() === '/DeviceGray' ? 1 : o.asString() === '/DeviceRGB' ? 3 : 0;
  if (o instanceof PDFArray && o.size() === 2 && o.lookup(0) instanceof PDFName && (o.lookup(0) as PDFName).asString() === '/ICCBased') {
    const stream = o.lookup(1);
    const nComp = stream instanceof PDFRawStream ? num(stream.dict.lookup(n('N'))) : 0;
    return nComp === 1 || nComp === 3 ? nComp : 0;
  }
  return 0;
};

/** PNG predictor (DecodeParms /Predictor ≥ 10) undone for 8-bit samples. */
const unpredict = (data: Buffer, width: number, colors: number) => {
  const bpp = colors;
  const row = width * colors;
  const rows = Math.floor(data.length / (row + 1));
  const out = Buffer.alloc(rows * row);
  for (let y = 0; y < rows; y++) {
    const type = data[y * (row + 1)];
    const inOff = y * (row + 1) + 1;
    const outOff = y * row;
    for (let x = 0; x < row; x++) {
      const raw = data[inOff + x];
      const a = x >= bpp ? out[outOff + x - bpp] : 0;
      const b = y > 0 ? out[outOff - row + x] : 0;
      const c = x >= bpp && y > 0 ? out[outOff - row + x - bpp] : 0;
      let v: number;
      if (type === 0) v = raw;
      else if (type === 1) v = raw + a;
      else if (type === 2) v = raw + b;
      else if (type === 3) v = raw + ((a + b) >> 1);
      else if (type === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v = raw + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      } else throw new Error('bad predictor');
      out[outOff + x] = v & 255;
    }
  }
  return out;
};

interface Candidate {
  ref: PDFRef;
  stream: PDFRawStream;
  width: number;
  height: number;
  channels: 1 | 3;
  /** Input for sharp. */
  input: () => sharp.Sharp;
  /** Longest side (points) of the largest page showing the image. */
  pageLong: number;
}

/** sharp input for an image XObject, or null when we cannot decode it safely. */
const decoder = (doc: PDFDocument, s: PDFRawStream): Omit<Candidate, 'ref' | 'stream' | 'pageLong'> | null => {
  const d = s.dict;
  if (d.get(K.Subtype) !== K.Image) return null;
  if (d.lookup(K.ImageMask)?.toString() === 'true' || d.get(K.Decode) || d.get(K.Mask) instanceof PDFArray) return null;
  const width = num(d.lookup(K.Width));
  const height = num(d.lookup(K.Height));
  if (width < 64 || height < 64 || s.contents.length < 20_000) return null;
  const f = filters(d);
  const comps = components(doc, d.lookup(K.ColorSpace) ?? undefined);
  if (comps === 0) return null;
  const channels = comps as 1 | 3;
  if (f.length === 1 && f[0] === '/DCTDecode') {
    const bytes = Buffer.from(s.contents);
    return { width, height, channels, input: () => sharp(bytes, { failOn: 'none' }) };
  }
  if (f.length === 1 && f[0] === '/FlateDecode' && num(d.lookup(K.BitsPerComponent)) === 8) {
    const parms = d.lookup(K.DecodeParms);
    const pd = parms instanceof PDFDict ? parms : null;
    const predictor = pd ? num(pd.lookup(n('Predictor'))) : 0;
    if (predictor > 1 && predictor < 10) return null;
    let raw: Buffer | null = null;
    const get = () => {
      if (raw) return raw;
      let data = zlib.inflateSync(Buffer.from(s.contents));
      if (predictor >= 10) data = unpredict(data, width, channels);
      if (data.length < width * height * channels) throw new Error('short image data');
      raw = data.subarray(0, width * height * channels);
      return raw;
    };
    return { width, height, channels, input: () => sharp(get(), { raw: { width, height, channels } }) };
  }
  return null;
};

/** Image refs used by each page (directly or through form XObjects) → largest page side showing them. */
const pageSizes = (doc: PDFDocument) => {
  const out = new Map<string, number>();
  const visit = (res: PDFDict | undefined, long: number, depth: number) => {
    const xo = res?.lookupMaybe(K.XObject, PDFDict);
    if (!xo || depth > 4) return;
    for (const [, v] of xo.entries()) {
      if (!(v instanceof PDFRef)) continue;
      const obj = doc.context.lookup(v);
      if (!(obj instanceof PDFRawStream)) continue;
      if (obj.dict.get(K.Subtype) === K.Image) out.set(v.tag, Math.max(out.get(v.tag) ?? 0, long));
      else visit(obj.dict.lookupMaybe(K.Resources, PDFDict), long, depth + 1);
    }
  };
  for (const p of doc.getPages()) {
    const { box } = pageGeometry(p);
    visit(p.node.Resources(), Math.max(box.width, box.height), 0);
  }
  return out;
};

const encode = async (c: Candidate, dpi: number, quality: number) => {
  const long = Math.max(c.width, c.height);
  const want = Math.round(((c.pageLong || 842) / 72) * dpi);
  const scale = Math.min(1, want / long);
  let img = c.input();
  if (scale < 0.98) img = img.resize({ width: Math.max(1, Math.round(c.width * scale)), height: Math.max(1, Math.round(c.height * scale)), fit: 'fill' });
  if (c.channels === 1) img = img.grayscale();
  else img = img.removeAlpha().toColourspace('srgb');
  const { data, info } = await img.jpeg({ quality, mozjpeg: true, chromaSubsampling: '4:2:0' }).toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: c.channels };
};

/** Every page = exactly one image (aspect ≈ the page's), no fonts: a scan. */
const scannedPages = (doc: PDFDocument): (PDFRef | null)[] | null => {
  const out: (PDFRef | null)[] = [];
  for (const p of doc.getPages()) {
    const res = p.node.Resources();
    if (res?.lookupMaybe(K.Font, PDFDict)?.keys().length) return null;
    const xo = res?.lookupMaybe(K.XObject, PDFDict);
    const entries = xo ? xo.entries().filter(([, v]) => v instanceof PDFRef) : [];
    if (entries.length !== 1) return null;
    const ref = entries[0][1] as PDFRef;
    const obj = doc.context.lookup(ref);
    if (!(obj instanceof PDFRawStream) || obj.dict.get(K.Subtype) !== K.Image) return null;
    const box = p.getMediaBox();
    const ia = num(obj.dict.lookup(K.Width)) / Math.max(1, num(obj.dict.lookup(K.Height)));
    const pa = box.width / Math.max(1, box.height);
    if (Math.abs(ia - pa) / pa > 0.03) return null;
    out.push(ref);
  }
  return out;
};

const stripMetadata = (doc: PDFDocument) => {
  doc.catalog.delete(K.Metadata);
  const info = doc.context.lookup(doc.context.trailerInfo.Info);
  if (info instanceof PDFDict) for (const k of info.keys()) if (k.asString() !== '/Title') info.delete(k);
  doc.setProducer('Triad Vision');
};

/** Deflates big streams that are stored without any filter (content streams of some generators, fonts). */
const deflateRawStreams = (doc: PDFDocument) => {
  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream) || obj.contents.length < 1024 || obj.dict.get(K.Filter) || obj.dict.get(K.DecodeParms)) continue;
    const z = zlib.deflateSync(Buffer.from(obj.contents), { level: 9 });
    if (z.length >= obj.contents.length * 0.9) continue;
    const dict = obj.dict.clone(doc.context);
    dict.set(K.Filter, n('FlateDecode'));
    dict.delete(K.Length);
    doc.context.assign(ref, PDFRawStream.of(dict, z));
  }
};

export interface PdfCompressResult {
  bytes: Buffer;
  reached: boolean;
  /** The pass that produced the result (null: no image could be recompressed). */
  dpi: number | null;
  quality: number | null;
  images: number;
  scanned: boolean;
}

/**
 * Builds the smallest PDF the passes allow; stops at the first pass under `maxBytes` (null = one pass at
 * 150 dpi / q70, i.e. "make it reasonably small").
 */
export const compressPdf = async (src: Buffer, maxBytes: number | null): Promise<PdfCompressResult> => {
  const probe = await loadPdf(src);
  const scanned = scannedPages(probe);
  const sizes = pageSizes(probe);
  const candidatesOf = (doc: PDFDocument) => {
    const list: Candidate[] = [];
    for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
      if (!(obj instanceof PDFRawStream)) continue;
      const dec = decoder(doc, obj);
      if (dec) list.push({ ref, stream: obj, ...dec, pageLong: sizes.get(ref.tag) ?? 0 });
    }
    // Soft masks belong to their image; leave them alone (they may have their own resolution).
    const masks = new Set<string>();
    for (const [, obj] of doc.context.enumerateIndirectObjects()) {
      if (obj instanceof PDFRawStream && obj.dict.get(K.Subtype) === K.Image) {
        const sm = obj.dict.get(K.SMask);
        if (sm instanceof PDFRef) masks.add(sm.tag);
      }
    }
    return list.filter((c) => !masks.has(c.ref.tag));
  };
  const imageCount = candidatesOf(probe).length;

  const build = async (dpi: number, quality: number): Promise<Buffer> => {
    const doc = await loadPdf(src);
    const cands = candidatesOf(doc);
    if (scanned) {
      const byRef = new Map(cands.map((c) => [c.ref.tag, c]));
      const out = await PDFDocument.create();
      const title = doc.getTitle();
      if (title) out.setTitle(title);
      const pages = doc.getPages();
      for (let i = 0; i < pages.length; i++) {
        const c = byRef.get(scanned[i]!.tag);
        if (!c) {
          const [copied] = await out.copyPages(doc, [i]);
          out.addPage(copied);
          continue;
        }
        const e = await encode(c, dpi, quality);
        const img = await out.embedJpg(e.data);
        const src: PDFPage = pages[i];
        const box = src.getMediaBox();
        const page = out.addPage([box.width, box.height]);
        page.setRotation(src.getRotation());
        page.drawImage(img, { x: 0, y: 0, width: box.width, height: box.height });
      }
      out.setProducer('Triad Vision');
      return Buffer.from(await out.save({ useObjectStreams: true }));
    }
    for (const c of cands) {
      let e: Awaited<ReturnType<typeof encode>>;
      try {
        e = await encode(c, dpi, quality);
      } catch {
        continue;
      }
      if (e.data.length >= c.stream.contents.length) continue;
      const dict = doc.context.obj({
        Type: 'XObject',
        Subtype: 'Image',
        Width: e.width,
        Height: e.height,
        ColorSpace: e.channels === 1 ? 'DeviceGray' : 'DeviceRGB',
        BitsPerComponent: 8,
        Filter: 'DCTDecode',
      });
      const smask = c.stream.dict.get(K.SMask);
      if (smask) dict.set(K.SMask, smask);
      const interp = c.stream.dict.get(n('Interpolate'));
      if (interp) dict.set(n('Interpolate'), interp);
      doc.context.assign(c.ref, PDFRawStream.of(dict, e.data));
    }
    stripMetadata(doc);
    deflateRawStreams(doc);
    await doc.flush();
    collectGarbage(doc);
    return Buffer.from(await doc.save({ useObjectStreams: true }));
  };

  if (!imageCount && !scanned) {
    // Nothing to resample: just the structural clean-up.
    const bytes = await build(150, 70);
    return { bytes, reached: !maxBytes || bytes.length <= maxBytes, dpi: null, quality: null, images: 0, scanned: false };
  }
  let best: { bytes: Buffer; dpi: number; quality: number } | null = null;
  for (const [dpi, quality] of maxBytes ? PASSES : PASSES.slice(0, 1)) {
    const bytes = await build(dpi, quality);
    if (!best || bytes.length < best.bytes.length) best = { bytes, dpi, quality };
    if (!maxBytes || bytes.length <= maxBytes) break;
  }
  return { bytes: best!.bytes, reached: !maxBytes || best!.bytes.length <= maxBytes, dpi: best!.dpi, quality: best!.quality, images: imageCount, scanned: !!scanned };
};
