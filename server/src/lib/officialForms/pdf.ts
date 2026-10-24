import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import fontkit from '@pdf-lib/fontkit';
import {
  PDFButton,
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFName,
  PDFOptionList,
  PDFRadioGroup,
  PDFSignature,
  PDFTextField,
  StandardFonts,
  rgb,
  type PDFField,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib';
import { badRequest } from '../http.js';
import { normName, type PdfFieldInfo, type PdfFieldType } from './catalog.js';

/**
 * PDF side of the official form engine (pdf-lib): read the AcroForm fields of an official fillable PDF, fill them
 * (the form stays editable unless it is flattened) and the fallback "data sheet" when a form is not fillable.
 *
 * Check boxes with several widgets that carry different "on" names (e.g. "pro Stunde" / "pro Monat" in the
 * Erklärung zum Beschäftigungsverhältnis) behave like radio buttons: they are listed as radio with the on names as
 * options and filled by setting the field value to the chosen name.
 */

const require = createRequire(import.meta.url);
let fontBytes: Promise<[Buffer, Buffer]> | null = null;
const dejaVu = () =>
  (fontBytes ??= Promise.all([fs.readFile(require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf')), fs.readFile(require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf'))])).catch((err) => {
    fontBytes = null;
    throw err;
  });

export const loadFormPdf = async (buf: Buffer) => {
  if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') throw badRequest('INVALID_PDF');
  try {
    return await PDFDocument.load(buf, { updateMetadata: false });
  } catch (err) {
    if (/encrypt/i.test(String((err as Error)?.message))) throw badRequest('PDF_ENCRYPTED');
    throw badRequest('INVALID_PDF');
  }
};

/** On names of the widgets of a check box ("Yes", "pro Monat" …). */
const onValues = (f: PDFCheckBox) => {
  const out: string[] = [];
  for (const w of f.acroField.getWidgets()) {
    const on = w.getOnValue();
    if (on) {
      const name = on.decodeText();
      if (!out.includes(name)) out.push(name);
    }
  }
  return out;
};

const typeOf = (f: PDFField): PdfFieldType => {
  if (f instanceof PDFTextField) return 'text';
  if (f instanceof PDFCheckBox) return onValues(f).length > 1 ? 'radio' : 'checkbox';
  if (f instanceof PDFRadioGroup) return 'radio';
  if (f instanceof PDFDropdown) return 'dropdown';
  if (f instanceof PDFOptionList) return 'optionlist';
  if (f instanceof PDFSignature) return 'signature';
  if (f instanceof PDFButton) return 'button';
  return 'unknown';
};

const optionsOf = (f: PDFField): string[] => {
  if (f instanceof PDFRadioGroup || f instanceof PDFDropdown || f instanceof PDFOptionList) return f.getOptions();
  if (f instanceof PDFCheckBox) {
    const on = onValues(f);
    return on.length > 1 ? on : [];
  }
  return [];
};

/** Every form field of the PDF, in document order, with type, options and the (0-based) page of its first widget. */
export const listPdfFields = async (buf: Buffer): Promise<{ fields: PdfFieldInfo[]; pages: number }> => {
  const pdf = await loadFormPdf(buf);
  const pages = pdf.getPages();
  const pageOf = new Map(pages.map((p, i) => [p.ref.toString(), i]));
  let fields: PDFField[] = [];
  try {
    fields = pdf.getForm().getFields();
  } catch {
    fields = [];
  }
  return {
    pages: pages.length,
    fields: fields.map((f) => {
      const w = f.acroField.getWidgets()[0];
      const p = w?.P();
      return {
        name: f.getName(),
        type: typeOf(f),
        options: optionsOf(f),
        page: p ? (pageOf.get(p.toString()) ?? null) : null,
        maxLength: f instanceof PDFTextField ? (f.getMaxLength() ?? null) : null,
        readOnly: f.isReadOnly(),
      };
    }),
  };
};

/** A value for one PDF field: text / option name, or true / false for a check box. */
export type PdfValue = string | boolean;

const pick = (options: string[], wanted: string) => options.find((o) => o === wanted) ?? options.find((o) => normName(o) === normName(wanted)) ?? null;

const encodable = (font: PDFFont, s: string) => {
  try {
    font.encodeText(s);
    return true;
  } catch {
    return false;
  }
};

export interface FillOutcome {
  pdf: Buffer;
  /** Fields that could not take their value (unknown option, field missing in the PDF). */
  errors: { field: string; code: 'NO_SUCH_FIELD' | 'BAD_OPTION' | 'READ_ONLY' }[];
}

/**
 * Fills the given fields. Text that Helvetica cannot draw (ə, ş, Cyrillic) gets a DejaVu appearance; the form
 * stays editable (staff / the embassy can still correct it) unless `flatten` is set.
 */
export const fillPdf = async (buf: Buffer, values: Record<string, PdfValue>, opts: { flatten?: boolean } = {}): Promise<FillOutcome> => {
  const pdf = await loadFormPdf(buf);
  pdf.registerFontkit(fontkit);
  const form = pdf.getForm();
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  let unicode: PDFFont | null = null;
  const errors: FillOutcome['errors'] = [];
  const byName = new Map(form.getFields().map((f) => [f.getName(), f]));
  for (const [name, v] of Object.entries(values)) {
    const f = byName.get(name);
    if (!f) {
      errors.push({ field: name, code: 'NO_SUCH_FIELD' });
      continue;
    }
    if (f.isReadOnly()) {
      errors.push({ field: name, code: 'READ_ONLY' });
      continue;
    }
    if (f instanceof PDFTextField) {
      const text = typeof v === 'boolean' ? (v ? 'X' : '') : v;
      const max = f.getMaxLength();
      if (max !== undefined && text.length > max && f.isCombed()) f.setText(text.slice(0, max));
      else {
        if (max !== undefined && text.length > max) f.setMaxLength(undefined);
        f.setText(text);
      }
      if (text && !encodable(helv, text)) {
        unicode ??= await pdf.embedFont((await dejaVu())[0], { subset: true });
        f.updateAppearances(unicode);
      } else f.updateAppearances(helv);
    } else if (f instanceof PDFCheckBox) {
      const on = onValues(f);
      if (on.length > 1) {
        const opt = typeof v === 'string' ? pick(on, v) : null;
        if (typeof v === 'string' && v && !opt) {
          errors.push({ field: name, code: 'BAD_OPTION' });
          continue;
        }
        // pdf-lib's check box only knows one "on" name: set V and each widget's appearance state by hand.
        const value = opt ? PDFName.of(opt) : PDFName.of('Off');
        f.acroField.dict.set(PDFName.of('V'), value);
        for (const w of f.acroField.getWidgets()) w.setAppearanceState(w.getOnValue() === value ? value : PDFName.of('Off'));
      } else if (v === true || (typeof v === 'string' && v !== '' && v.toLowerCase() !== 'false' && v.toLowerCase() !== 'off')) f.check();
      else f.uncheck();
    } else if (f instanceof PDFRadioGroup) {
      if (typeof v !== 'string' || !v) {
        f.clear();
        continue;
      }
      const opt = pick(f.getOptions(), v);
      if (!opt) errors.push({ field: name, code: 'BAD_OPTION' });
      else f.select(opt);
    } else if (f instanceof PDFDropdown || f instanceof PDFOptionList) {
      if (typeof v !== 'string' || !v) {
        f.clear();
        continue;
      }
      const opt = pick(f.getOptions(), v);
      if (opt) f.select(opt);
      else if (f instanceof PDFDropdown && f.isEditable()) f.select(v);
      else errors.push({ field: name, code: 'BAD_OPTION' });
    }
  }
  if (opts.flatten) form.flatten({ updateFieldAppearances: false });
  return { pdf: Buffer.from(await pdf.save({ updateFieldAppearances: false })), errors };
};

/** The current values of a filled PDF (tests, "what is in the file"). */
export const readPdfValues = async (buf: Buffer) => {
  const pdf = await loadFormPdf(buf);
  const out: Record<string, PdfValue | null> = {};
  for (const f of pdf.getForm().getFields()) {
    const name = f.getName();
    if (f instanceof PDFTextField) out[name] = f.getText() ?? null;
    else if (f instanceof PDFCheckBox) {
      const on = onValues(f);
      if (on.length > 1) {
        const v = f.acroField.getValue();
        out[name] = v && v.decodeText() !== 'Off' ? v.decodeText() : null;
      } else out[name] = f.isChecked();
    } else if (f instanceof PDFRadioGroup) out[name] = f.getSelected() ?? null;
    else if (f instanceof PDFDropdown || f instanceof PDFOptionList) out[name] = f.getSelected()[0] ?? null;
  }
  return out;
};

// ─── Data sheet (fallback) ─────────────────────────────────────────────

export interface SheetSection {
  title: string;
  rows: { label: string; value: string; missing?: boolean }[];
}

const A4: [number, number] = [595.28, 841.89];
const NAVY = rgb(0.043, 0.122, 0.267);
const GREY = rgb(0.36, 0.42, 0.53);
const LINE = rgb(0.85, 0.87, 0.9);
const HIGHLIGHT = rgb(1, 0.93, 0.6);
const MARGIN = 44;

/**
 * "Datenblatt": the resolved values grouped like the official form, for staff to copy into a form that cannot be
 * filled electronically (scanned PDF, XFA, online portal). Missing values are highlighted.
 */
export const dataSheetPdf = async (input: { title: string; subtitle: string; note: string; sections: SheetSection[] }) => {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(input.title);
  pdf.setAuthor('Triad Vision');
  const [regular, boldBytes] = await dejaVu();
  const font = await pdf.embedFont(regular, { subset: true });
  const bold = await pdf.embedFont(boldBytes, { subset: true });
  let page: PDFPage = pdf.addPage(A4);
  let y = 0;
  const fit = (fnt: PDFFont, text: string, size: number, width: number) => {
    let s = text.replace(/\s+/g, ' ');
    if (fnt.widthOfTextAtSize(s, size) <= width) return s;
    while (s.length > 1 && fnt.widthOfTextAtSize(`${s}…`, size) > width) s = s.slice(0, -1);
    return `${s}…`;
  };
  const header = () => {
    page.drawRectangle({ x: 0, y: A4[1] - 40, width: A4[0], height: 40, color: NAVY });
    page.drawText('TRIAD VISION', { x: MARGIN, y: A4[1] - 26, size: 14, font: bold, color: rgb(1, 1, 1) });
    page.drawText(fit(bold, input.title, 15, A4[0] - 2 * MARGIN), { x: MARGIN, y: A4[1] - 70, size: 15, font: bold, color: NAVY });
    page.drawText(fit(font, input.subtitle, 9, A4[0] - 2 * MARGIN), { x: MARGIN, y: A4[1] - 86, size: 9, font, color: GREY });
    y = A4[1] - 110;
  };
  const ensure = (need: number) => {
    if (y - need < 50) {
      page = pdf.addPage(A4);
      header();
    }
  };
  header();
  page.drawText(fit(font, input.note, 8.5, A4[0] - 2 * MARGIN), { x: MARGIN, y, size: 8.5, font, color: GREY });
  y -= 18;
  for (const s of input.sections) {
    if (!s.rows.length) continue;
    ensure(40);
    page.drawText(fit(bold, s.title, 11, A4[0] - 2 * MARGIN), { x: MARGIN, y, size: 11, font: bold, color: NAVY });
    y -= 16;
    for (const r of s.rows) {
      ensure(20);
      page.drawText(fit(bold, r.label, 8.5, 200), { x: MARGIN, y, size: 8.5, font: bold, color: GREY });
      if (r.value) page.drawText(fit(font, r.value, 10, A4[0] - MARGIN - 255), { x: 255, y, size: 10, font, color: NAVY });
      else if (r.missing) {
        page.drawRectangle({ x: 253, y: y - 4, width: 130, height: 14, color: HIGHLIGHT });
        page.drawText('____________ *', { x: 255, y, size: 10, font, color: NAVY });
      }
      page.drawLine({ start: { x: MARGIN, y: y - 6 }, end: { x: A4[0] - MARGIN, y: y - 6 }, thickness: 0.3, color: LINE });
      y -= 19;
    }
    y -= 8;
  }
  const total = pdf.getPageCount();
  for (let i = 0; i < total; i++) {
    const label = `${i + 1} / ${total}`;
    pdf.getPage(i).drawText(label, { x: A4[0] / 2 - font.widthOfTextAtSize(label, 8) / 2, y: 18, size: 8, font, color: GREY });
  }
  return Buffer.from(await pdf.save());
};
