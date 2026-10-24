import { PDFDocument, StandardFonts } from 'pdf-lib';

/**
 * Small fillable PDFs (AcroForm) for the official form tests: text fields, check boxes, a radio group and a
 * dropdown with the names the official forms use, so the shipped default mappings can be applied to them.
 */

export interface FormSpec {
  text?: string[];
  checkbox?: string[];
  radio?: Record<string, string[]>;
  dropdown?: Record<string, string[]>;
}

export const makeFormPdf = async (spec: FormSpec) => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const form = pdf.getForm();
  let page = pdf.addPage([595, 842]);
  let y = 800;
  const next = (h = 24) => {
    y -= h;
    if (y < 40) {
      page = pdf.addPage([595, 842]);
      y = 800;
    }
    return y;
  };
  for (const name of spec.text ?? []) {
    const f = form.createTextField(name);
    f.addToPage(page, { x: 40, y: next(), width: 300, height: 18, font });
  }
  for (const name of spec.checkbox ?? []) {
    const f = form.createCheckBox(name);
    f.addToPage(page, { x: 40, y: next(), width: 12, height: 12 });
  }
  for (const [name, options] of Object.entries(spec.radio ?? {})) {
    const f = form.createRadioGroup(name);
    for (const o of options) f.addOptionToPage(o, page, { x: 40, y: next(), width: 12, height: 12 });
  }
  for (const [name, options] of Object.entries(spec.dropdown ?? {})) {
    const f = form.createDropdown(name);
    f.addOptions(options);
    f.addToPage(page, { x: 40, y: next(), width: 200, height: 18, font });
  }
  return Buffer.from(await pdf.save());
};

/** The field names of a default mapping, typed by how the mapping uses them. */
export const specFromMapping = (fieldMap: Record<string, { source: string; when?: string; map?: Record<string, string>; value?: string }>, radios: Record<string, string[]> = {}): FormSpec => {
  const spec: FormSpec = { text: [], checkbox: [], radio: {} };
  for (const [name, m] of Object.entries(fieldMap)) {
    if (radios[name]) spec.radio![name] = radios[name];
    else if (m.when) spec.checkbox!.push(name);
    else if (m.map) spec.radio![name] = [...new Set(Object.values(m.map))];
    else spec.text!.push(name);
  }
  return spec;
};
