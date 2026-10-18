import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import fontkit from '@pdf-lib/fontkit';
import { PDFCheckBox, PDFDocument, PDFDropdown, PDFOptionList, PDFRadioGroup, PDFTextField, type PDFField } from 'pdf-lib';
import { prisma } from '../../db.js';
import { badRequest } from '../http.js';
import { PLACEHOLDERS, PLACEHOLDER_KEYS } from '../contracts/render.js';
import { contractValues, fmtContractDate, loadContractCase, type ContractLang } from '../contracts/values.js';
import { mrzOf } from '../docsIntel/ocr.js';
import { docxParts, loadDocx } from './extract.js';
import { foldQuery } from './normalize.js';
import { fillXml, placeholdersInXml, type Hit } from './placeholders.js';

/**
 * Filling templates of the drive with client data:
 *   DOCX      {{key}}, [[key]] or «Label» placeholders (split runs handled, see ./placeholders.ts) → DOCX
 *   PDF form  AcroForm fields named like the keys (or a known label) → filled and flattened PDF
 *   PDF without fields → TEMPLATE_NO_FIELDS (the client shows a hint)
 *
 * Values: the contract template set (client.*, case.*, company.*, vacancy.*, triad.*, staff.fullName,
 * today), passport.* from the case's OCR'd passport, client.passportExpiry, and whatever the user types for
 * the remaining (unknown or empty) fields.
 */

export type TemplateFormat = 'docx' | 'pdf';

/** Keys on top of the contract set. */
export const EXTRA_KEYS = [
  'client.passportExpiry',
  'passport.number',
  'passport.surname',
  'passport.givenNames',
  'passport.nationality',
  'passport.birthDate',
  'passport.expiryDate',
  'passport.sex',
] as const;

const INPUT_ONLY = new Set(PLACEHOLDERS.filter((p) => p.input).map((p) => p.key));
export const KNOWN_KEYS = new Set<string>([...PLACEHOLDER_KEYS, ...EXTRA_KEYS]);

/** Labels people write instead of keys («Ad Soyad», a PDF field "Vorname" …), folded. */
const ALIAS_LIST: [string, string[]][] = [
  ['client.fullName', ['ad soyad', 'adi soyadi', 'soyad ad', 'name', 'full name', 'fullname', 'vollstandiger name', 'name vorname', 'фио', 'имя фамилия', 'полное имя', 'musteri', 'mushteri']],
  ['client.firstName', ['ad', 'adi', 'first name', 'firstname', 'given name', 'vorname', 'имя']],
  ['client.lastName', ['soyad', 'soyadi', 'last name', 'lastname', 'surname', 'family name', 'nachname', 'familienname', 'фамилия']],
  ['client.birthDate', ['dogum tarixi', 'date of birth', 'birth date', 'birthdate', 'dob', 'geburtsdatum', 'дата рождения']],
  ['client.passportNumber', ['pasport', 'pasport nomresi', 'pasport no', 'passport', 'passport number', 'passport no', 'passnummer', 'reisepassnummer', 'pass nr', 'номер паспорта', 'паспорт']],
  ['client.passportExpiry', ['pasport etibarlilik', 'pasportun etibarliliq muddeti', 'passport expiry', 'gultig bis', 'срок действия паспорта']],
  ['client.nationality', ['vetendasliq', 'nationality', 'staatsangehorigkeit', 'гражданство']],
  ['client.address', ['unvan', 'address', 'adresse', 'anschrift', 'адрес']],
  ['client.phone', ['telefon', 'phone', 'telefonnummer', 'телефон']],
  ['client.email', ['e-poct', 'epoct', 'email', 'e-mail', 'электронная почта']],
  ['case.number', ['muraciet nomresi', 'case number', 'aktenzeichen', 'vorgangsnummer', 'номер дела']],
  ['case.profession', ['pese', 'profession', 'beruf', 'профессия']],
  ['company.name', ['sirket', 'company', 'firma', 'arbeitgeber', 'employer', 'компания', 'работодатель']],
  ['company.address', ['sirketin unvani', 'company address', 'firmenadresse', 'адрес компании']],
  ['triad.name', ['triad vision']],
  ['staff.fullName', ['emekdas', 'mitarbeiter', 'staff', 'сотрудник']],
  ['today', ['tarix', 'bugun', 'date', 'datum', 'heute', 'дата']],
];
const ALIASES = new Map<string, string>();
for (const [key, labels] of ALIAS_LIST) for (const l of labels) ALIASES.set(foldQuery(l), key);
for (const k of KNOWN_KEYS) ALIASES.set(foldQuery(k), k);

/** Key for a placeholder / field name: a known key (exact, `_` for `.`, or a label), else the raw text. */
export const keyFor = (raw: string): { key: string; known: boolean } => {
  const t = raw.trim();
  if (KNOWN_KEYS.has(t)) return { key: t, known: true };
  const dotted = t.replace(/_/g, '.');
  if (KNOWN_KEYS.has(dotted)) return { key: dotted, known: true };
  const alias = ALIASES.get(foldQuery(t)) ?? ALIASES.get(foldQuery(t.replace(/[_.:]+/g, ' ')));
  if (alias) return { key: alias, known: true };
  return { key: t, known: false };
};

export interface TemplateField {
  /** key the value is looked up / typed under */
  key: string;
  /** as written in the template (first occurrence) */
  label: string;
  known: boolean;
  /** typed at fill time (startDate, salary, … and unknown fields) */
  input: boolean;
  /** «…» text not matching a known label: maybe just a quotation — optional */
  optional: boolean;
  style: Hit['style'] | 'field';
  count: number;
}

export interface TemplateInfo {
  format: TemplateFormat | null;
  supported: boolean;
  /** why it cannot be filled (NOT_A_TEMPLATE, TEMPLATE_NO_FIELDS, …) */
  reason?: string;
  fields: TemplateField[];
}

const addField = (map: Map<string, TemplateField>, raw: string, style: TemplateField['style']) => {
  const { key, known } = keyFor(raw);
  const cur = map.get(key);
  if (cur) {
    cur.count++;
    return;
  }
  map.set(key, { key, label: raw, known, input: !known || INPUT_ONLY.has(key), optional: !known && style === 'guillemets', style, count: 1 });
};

export const templateFormat = (name: string, mime: string | null): TemplateFormat | null => {
  const ext = name.toLowerCase().split('.').pop();
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || ext === 'docx') return 'docx';
  return null;
};

const loadPdf = async (buf: Buffer) => {
  try {
    return await PDFDocument.load(buf, { updateMetadata: false });
  } catch (err) {
    if (/encrypt/i.test(String((err as Error)?.message))) throw badRequest('PDF_ENCRYPTED');
    throw badRequest('INVALID_PDF');
  }
};

const fillable = (f: PDFField) => f instanceof PDFTextField || f instanceof PDFDropdown || f instanceof PDFCheckBox || f instanceof PDFRadioGroup || f instanceof PDFOptionList;

/** Placeholders / form fields of a template file. */
export const inspectTemplate = async (buf: Buffer, format: TemplateFormat | null): Promise<TemplateInfo> => {
  if (!format) return { format, supported: false, reason: 'NOT_A_TEMPLATE', fields: [] };
  const map = new Map<string, TemplateField>();
  if (format === 'docx') {
    let zip;
    try {
      zip = await loadDocx(buf);
    } catch {
      throw badRequest('INVALID_DOCX');
    }
    for (const part of docxParts(zip)) for (const h of placeholdersInXml(await zip.file(part)!.async('string'))) addField(map, h.raw, h.style);
  } else {
    const pdf = await loadPdf(buf);
    const fields = pdf.getForm().getFields().filter(fillable);
    if (!fields.length) return { format, supported: false, reason: 'TEMPLATE_NO_FIELDS', fields: [] };
    for (const f of fields) addField(map, f.getName(), 'field');
  }
  const fields = [...map.values()];
  return { format, supported: fields.length > 0, reason: fields.length ? undefined : 'TEMPLATE_NO_PLACEHOLDERS', fields };
};

// ─── Values ──────────────────────────────────────────────────────────

/** Every value known for a case (contract set + passport + extras). */
export const caseValues = async (caseId: string, staff: { firstName: string; lastName: string } | null, lang: ContractLang = 'de') => {
  const c = await loadContractCase(caseId);
  const values = await contractValues(c, {}, lang, staff);
  values['client.passportExpiry'] = fmtContractDate(c.client.passportExpiry, lang);
  const docs = await prisma.document.findMany({
    where: { caseId, ocrAt: { not: null } },
    orderBy: { ocrAt: 'desc' },
    select: { ocr: true },
    take: 20,
  });
  const mrz = docs.map((d) => mrzOf(d.ocr)).find((m) => m?.valid) ?? null;
  if (mrz) {
    values['passport.number'] = mrz.documentNumber;
    values['passport.surname'] = mrz.surname;
    values['passport.givenNames'] = mrz.givenNames;
    values['passport.nationality'] = mrz.nationality;
    values['passport.birthDate'] = fmtContractDate(`${mrz.birthDate}T00:00:00Z`, lang);
    values['passport.expiryDate'] = fmtContractDate(`${mrz.expiryDate}T00:00:00Z`, lang);
    values['passport.sex'] = mrz.sex;
  }
  for (const k of EXTRA_KEYS) values[k] ??= '';
  return { c, values, clientName: `${c.client.firstName} ${c.client.lastName}`.trim() };
};

/** The value for a key: a typed input wins, else the case value; '' = missing. */
export const valueFor = (key: string, values: Record<string, string>, inputs: Record<string, string>) => {
  const typed = inputs[key]?.trim();
  if (typed) return key === 'startDate' && /^\d{4}-\d{2}-\d{2}$/.test(typed) ? fmtContractDate(`${typed}T00:00:00Z`, 'de') : typed;
  return values[key]?.trim() ?? '';
};

export interface FillResult {
  buf: Buffer;
  filled: string[];
  missing: string[];
}

/** Fills a DOCX: replaced placeholders get the value; missing required ones stay visible as they were. */
export const fillDocx = async (buf: Buffer, values: Record<string, string>, inputs: Record<string, string>): Promise<FillResult> => {
  const zip = await loadDocx(buf).catch(() => {
    throw badRequest('INVALID_DOCX');
  });
  const filled = new Set<string>();
  const missing = new Set<string>();
  for (const part of docxParts(zip)) {
    const xml = await zip.file(part)!.async('string');
    const res = fillXml(xml, (h) => {
      const { key, known } = keyFor(h.raw);
      const v = valueFor(key, values, inputs);
      if (v) {
        filled.add(key);
        return v;
      }
      // a «quotation» that is no field stays untouched and is not "missing"
      if (!(h.style === 'guillemets' && !known)) missing.add(key);
      return null;
    });
    if (res.replaced.length) zip.file(part, res.xml);
  }
  const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  return { buf: out, filled: [...filled], missing: [...missing].filter((k) => !filled.has(k)) };
};

const require = createRequire(import.meta.url);
let fontBytes: Promise<Buffer> | null = null;
const dejaVu = () =>
  (fontBytes ??= fs.readFile(require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf'))).catch((err) => {
    fontBytes = null;
    throw err;
  });

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'ja', 'he', 'bəli', 'x', 'да', 'on']);

/** Fills the AcroForm fields of a PDF and flattens the form (DejaVu appearance: az / de / ru text). */
export const fillPdfForm = async (buf: Buffer, values: Record<string, string>, inputs: Record<string, string>): Promise<FillResult> => {
  const pdf = await loadPdf(buf);
  pdf.registerFontkit(fontkit);
  const form = pdf.getForm();
  const fields = form.getFields().filter(fillable);
  if (!fields.length) throw badRequest('TEMPLATE_NO_FIELDS');
  const font = await pdf.embedFont(await dejaVu(), { subset: false });
  const filled = new Set<string>();
  const missing = new Set<string>();
  for (const f of fields) {
    const { key } = keyFor(f.getName());
    const v = valueFor(key, values, inputs);
    if (!v) {
      missing.add(key);
      continue;
    }
    try {
      if (f instanceof PDFTextField) {
        const max = f.getMaxLength();
        f.setText(max ? v.slice(0, max) : v);
        f.updateAppearances(font);
      } else if (f instanceof PDFCheckBox) {
        if (TRUE_VALUES.has(v.toLowerCase())) f.check();
        else f.uncheck();
      } else if (f instanceof PDFDropdown || f instanceof PDFOptionList) {
        const opt = f.getOptions().find((o) => o.toLowerCase() === v.toLowerCase());
        if (opt) f.select(opt);
        else if (f instanceof PDFDropdown && f.isEditable()) f.select(v);
        else {
          missing.add(key);
          continue;
        }
      } else if (f instanceof PDFRadioGroup) {
        const opt = f.getOptions().find((o) => o.toLowerCase() === v.toLowerCase());
        if (!opt) {
          missing.add(key);
          continue;
        }
        f.select(opt);
      }
      filled.add(key);
    } catch {
      missing.add(key);
    }
  }
  form.updateFieldAppearances(font);
  form.flatten();
  const out = Buffer.from(await pdf.save());
  return { buf: out, filled: [...filled], missing: [...missing].filter((k) => !filled.has(k)) };
};
