import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import fontkit from '@pdf-lib/fontkit';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFPage, PDFRef, PDFStream, type PDFFont, type PDFObject } from 'pdf-lib';
import { badRequest } from '../http.js';

/**
 * pdf-lib building blocks of the PDF tools: loading, rebuilding the page list in place (so form fields,
 * annotations and links of the kept pages stay), dropping everything only removed pages referenced and
 * garbage-collecting unreachable objects — a deleted or redacted page must not survive inside the file.
 */

export const PDF_MIME = 'application/pdf';

/** Hard limits of the PDF tools. */
export const PDF_LIMITS = {
  maxPages: 2000,
  maxOps: 200,
  maxInserts: 20,
  maxMergeSources: 50,
  maxMergeBytes: 200 * 1024 * 1024,
  maxSplitOutputs: 200,
  maxBatch: 20,
  maxWatermarkBatch: 50,
  maxRedactPages: 50,
  maxRedactImageBytes: 10 * 1024 * 1024,
  maxRedactPixels: 6000,
  maxStampItems: 50,
  maxStampImageBytes: 5 * 1024 * 1024,
  maxStampLibraryBytes: 2 * 1024 * 1024,
} as const;

export const loadPdf = async (bytes: Uint8Array) => {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (err) {
    if (/encrypt/i.test(String((err as Error)?.message))) throw badRequest('PDF_ENCRYPTED');
    throw badRequest('INVALID_PDF');
  }
  if (doc.getPageCount() === 0) throw badRequest('INVALID_PDF');
  if (doc.getPageCount() > PDF_LIMITS.maxPages) throw badRequest('TOO_MANY_PAGES');
  return doc;
};

export const isPdfBytes = (b: Uint8Array) => b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;

// ─── page list rebuild ───────────────────────────────────────────────

const INHERITABLE = ['Resources', 'MediaBox', 'CropBox', 'Rotate'].map((k) => PDFName.of(k));

/** Copies inherited page attributes onto the page itself, so it can move anywhere in the page tree. */
const materialize = (p: PDFPage) => {
  for (const key of INHERITABLE) {
    if (p.node.get(key)) continue;
    const v = p.node.getInheritableAttribute(key);
    if (v) p.node.set(key, v);
  }
};

const N = {
  Annots: PDFName.of('Annots'),
  P: PDFName.of('P'),
  Dest: PDFName.of('Dest'),
  A: PDFName.of('A'),
  D: PDFName.of('D'),
  Kids: PDFName.of('Kids'),
  Parent: PDFName.of('Parent'),
  Fields: PDFName.of('Fields'),
  AcroForm: PDFName.of('AcroForm'),
  Subtype: PDFName.of('Subtype'),
  Widget: PDFName.of('Widget'),
  Names: PDFName.of('Names'),
  Dests: PDFName.of('Dests'),
};

const firstRef = (o: PDFObject | undefined) => (o instanceof PDFArray && o.size() > 0 && o.get(0) instanceof PDFRef ? (o.get(0) as PDFRef) : null);

/**
 * After pages were removed: drops document parts that may still point at them (outline, named
 * destinations, structure tree, threads, open action), fixes annotation back-links of kept pages and prunes
 * form fields whose widgets lived on removed pages. Without this the garbage collector would keep the
 * removed pages alive through those references.
 */
const pruneDangling = (doc: PDFDocument, kept: Set<string>) => {
  const cat = doc.catalog;
  for (const k of ['Outlines', 'Dests', 'StructTreeRoot', 'MarkInfo', 'Threads', 'PageLabels']) cat.delete(PDFName.of(k));
  const names = cat.lookupMaybe(N.Names, PDFDict);
  names?.delete(N.Dests);
  const open = cat.lookup(PDFName.of('OpenAction'));
  if (open instanceof PDFArray || open instanceof PDFDict) cat.delete(PDFName.of('OpenAction'));

  const widgets = new Set<string>();
  for (const page of doc.getPages()) {
    const annots = page.node.lookupMaybe(N.Annots, PDFArray);
    if (!annots) continue;
    for (let i = 0; i < annots.size(); i++) {
      const ref = annots.get(i);
      const a = doc.context.lookupMaybe(ref, PDFDict);
      if (!a) continue;
      if (ref instanceof PDFRef) widgets.add(ref.tag);
      const p = a.get(N.P);
      if (p instanceof PDFRef && !kept.has(p.tag)) a.set(N.P, page.ref);
      const dest = firstRef(a.lookup(N.Dest));
      if (dest && !kept.has(dest.tag)) a.delete(N.Dest);
      const action = a.lookupMaybe(N.A, PDFDict);
      const d = action ? firstRef(action.lookup(N.D)) : null;
      if (d && !kept.has(d.tag)) a.delete(N.A);
    }
  }

  const form = cat.lookupMaybe(N.AcroForm, PDFDict);
  const fields = form?.lookupMaybe(N.Fields, PDFArray);
  if (!form || !fields) return;
  // A field stays when it is (or has, somewhere below) a widget on a kept page.
  const keep = (ref: PDFObject, depth: number): boolean => {
    if (depth > 30) return false;
    const node = doc.context.lookupMaybe(ref, PDFDict);
    if (!node) return false;
    const kids = node.lookupMaybe(N.Kids, PDFArray);
    let any = node.get(N.Subtype) === N.Widget && ref instanceof PDFRef && widgets.has(ref.tag);
    if (kids) {
      const next = kids.asArray().filter((k) => keep(k, depth + 1));
      node.set(N.Kids, doc.context.obj(next));
      if (next.length) any = true;
    }
    return any;
  };
  form.set(N.Fields, doc.context.obj(fields.asArray().filter((f) => keep(f, 0))));
};

/** Deletes every indirect object no longer reachable from the trailer (removed pages, replaced images…). */
export const collectGarbage = (doc: PDFDocument) => {
  const ctx = doc.context;
  const seen = new Set<string>();
  const stack: PDFObject[] = [];
  const t = ctx.trailerInfo;
  for (const r of [t.Root, t.Info, t.Encrypt, t.ID]) if (r) stack.push(r);
  while (stack.length) {
    const o = stack.pop()!;
    if (o instanceof PDFRef) {
      if (seen.has(o.tag)) continue;
      seen.add(o.tag);
      const target = ctx.lookup(o);
      if (target) stack.push(target);
    } else if (o instanceof PDFDict) {
      for (const [, v] of o.entries()) stack.push(v);
    } else if (o instanceof PDFArray) {
      for (const v of o.asArray()) stack.push(v);
    } else if (o instanceof PDFStream) {
      stack.push(o.dict);
    }
  }
  let removed = 0;
  for (const [ref] of ctx.enumerateIndirectObjects()) {
    if (!seen.has(ref.tag)) {
      ctx.delete(ref);
      removed++;
    }
  }
  return removed;
};

/**
 * Makes `pages` (pages of `doc`, copied pages or freshly created ones) the page list of `doc`, in that order.
 * Pages that are no longer listed are gone for good (garbage-collected when the document is saved through
 * `savePdf`).
 */
export const setPages = (doc: PDFDocument, pages: PDFPage[]) => {
  const before = doc.getPages();
  for (const p of before) materialize(p);
  const kept = new Set(pages.map((p) => p.ref.tag));
  if (kept.size !== pages.length) throw badRequest('DUPLICATE_PAGE');
  const removed = before.some((p) => !kept.has(p.ref.tag));
  for (let i = doc.getPageCount() - 1; i >= 0; i--) doc.removePage(i);
  for (const p of pages) doc.addPage(p);
  if (removed) pruneDangling(doc, kept);
};

/** Serializes with object streams after dropping unreachable objects. */
export const savePdf = async (doc: PDFDocument) => {
  await doc.flush();
  collectGarbage(doc);
  doc.setProducer('Triad Vision');
  return Buffer.from(await doc.save({ useObjectStreams: true }));
};

// ─── pages ───────────────────────────────────────────────────────────

/** "1-3, 5, 8-" (1-based, human) → groups of 0-based page indices. Throws INVALID_RANGES. */
export const parseRanges = (raw: string, pageCount: number): number[][] => {
  const parts = raw.split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
  if (!parts.length || parts.length > PDF_LIMITS.maxSplitOutputs) throw badRequest('INVALID_RANGES');
  return parts.map((p) => {
    const m = /^(\d+)?\s*(?:[-–]\s*(\d+)?)?$/.exec(p);
    if (!m || (!m[1] && !m[2])) throw badRequest('INVALID_RANGES');
    const isRange = /[-–]/.test(p);
    const a = m[1] ? Number(m[1]) : 1;
    const b = isRange ? (m[2] ? Number(m[2]) : pageCount) : a;
    if (a < 1 || b < a || b > pageCount) throw badRequest('INVALID_RANGES');
    return Array.from({ length: b - a + 1 }, (_, i) => a - 1 + i);
  });
};

/** 0-based indices must exist and be unique. */
export const checkIndices = (idx: number[], count: number) => {
  const set = new Set(idx);
  if (set.size !== idx.length || idx.some((i) => !Number.isInteger(i) || i < 0 || i >= count)) throw badRequest('INVALID_PAGES');
  return set;
};

/** The visible box of a page and its rotation (0/90/180/270). */
export const pageGeometry = (p: PDFPage) => {
  const box = p.getCropBox();
  const rot = (((p.getRotation().angle % 360) + 360) % 360) as 0 | 90 | 180 | 270;
  const swap = rot === 90 || rot === 270;
  return { box, rot, vw: swap ? box.height : box.width, vh: swap ? box.width : box.height };
};

/**
 * A point in "visual" coordinates (what a viewer shows: origin bottom-left of the displayed, rotated page,
 * in points) → the page's user space. Drawing at user angle `visualAngle + rot` then looks upright.
 */
export const visualToUser = (p: PDFPage, vx: number, vy: number) => {
  const { box, rot } = pageGeometry(p);
  const { x: x0, y: y0, width: w, height: h } = box;
  switch (rot) {
    case 90:
      return { x: x0 + w - vy, y: y0 + vx, rot };
    case 180:
      return { x: x0 + w - vx, y: y0 + h - vy, rot };
    case 270:
      return { x: x0 + vy, y: y0 + h - vx, rot };
    default:
      return { x: x0 + vx, y: y0 + vy, rot };
  }
};

// ─── fonts ───────────────────────────────────────────────────────────

const require = createRequire(import.meta.url);
let fontCache: Promise<{ regular: Buffer; bold: Buffer }> | null = null;
const fontBytes = () =>
  (fontCache ??= Promise.all([
    fs.readFile(require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf')),
    fs.readFile(require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf')),
  ]).then(([regular, bold]) => ({ regular, bold }))).catch((err) => {
    fontCache = null;
    throw err;
  });

/** DejaVu Sans (ə, ş, ü, Cyrillic…) embedded as a subset. */
export const embedDejaVu = async (doc: PDFDocument, bold = false): Promise<PDFFont> => {
  doc.registerFontkit(fontkit);
  const f = await fontBytes();
  return doc.embedFont(bold ? f.bold : f.regular, { subset: true });
};
