import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import { prisma } from '../../db.js';
import { notFound } from '../http.js';
import { safeText } from '../pdfSign.js';
import { mrzOf } from './ocr.js';
import type { MrzResult } from './mrz.js';

/**
 * Pre-filled PDF forms built from the profile and the case. Every field the data cannot supply is drawn as
 * a highlighted "________" placeholder; the profile fields that are missing are returned so the UI (and the
 * X-Missing-Fields header) can point the client to them.
 */

export const FORM_KINDS = ['videx-summary', 'employer-letter', 'contract-cover'] as const;
export type FormKind = (typeof FORM_KINDS)[number];

export interface FormData {
  caseNumber: string;
  visaType: string;
  profession: string;
  client: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    birthDate: Date | null;
    nationality: string | null;
    city: string | null;
    address: string | null;
    passportNumber: string | null;
    passportExpiry: Date | null;
    germanLevel: string | null;
    education: string | null;
    drivingLicence: string | null;
    experienceYears: number | null;
  };
  company: { name: string; legalForm: string | null; address: string | null; city: string | null; contactName: string | null; phone: string | null; email: string | null; vatId: string | null } | null;
  vacancy: { salaryMin: number | null; salaryMax: number | null; employmentType: string; city: string | null } | null;
  contract: { version: number; sentAt: Date; signedAt: Date | null; signerName: string | null } | null;
  mrz: MrzResult | null;
  date: Date;
}

const A4: [number, number] = [595.28, 841.89];
const NAVY = rgb(0.043, 0.122, 0.267);
const GREY = rgb(0.36, 0.42, 0.53);
const WHITE = rgb(1, 1, 1);
const HIGHLIGHT = rgb(1, 0.93, 0.6);
const MARGIN = 48;
export const PLACEHOLDER = '____________';

const fmtDate = (d: Date | null) => (d ? `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}` : '');

/** Loads everything the forms need for a case. */
export const loadFormData = async (caseId: string, now = new Date()): Promise<FormData> => {
  const c = await prisma.case.findUnique({
    where: { id: caseId },
    include: {
      client: true,
      company: true,
      vacancy: { select: { salaryMin: true, salaryMax: true, employmentType: true, city: true } },
      visaCategory: { select: { title: true, visaLabel: true } },
      contract: true,
      documents: { where: { ocrAt: { not: null }, requirement: { is: { key: 'PASSPORT' } } }, orderBy: { createdAt: 'desc' }, select: { ocr: true, status: true } },
    },
  });
  if (!c) throw notFound('CASE_NOT_FOUND');
  const passportDoc = c.documents.find((d) => d.status === 'ACCEPTED' && mrzOf(d.ocr)?.valid) ?? c.documents.find((d) => mrzOf(d.ocr)?.valid);
  const visaTitle = (c.visaCategory?.title as { de?: string; en?: string } | null) ?? null;
  return {
    caseNumber: c.number,
    visaType: c.visaCategory ? `${c.visaCategory.visaLabel} – ${visaTitle?.de ?? visaTitle?.en ?? ''}`.trim() : '',
    profession: c.profession,
    client: {
      firstName: c.client.firstName,
      lastName: c.client.lastName,
      email: c.client.email,
      phone: c.client.phone,
      birthDate: c.client.birthDate,
      nationality: c.client.nationality,
      city: c.client.city,
      address: c.client.address,
      passportNumber: c.client.passportNumber,
      passportExpiry: c.client.passportExpiry,
      germanLevel: c.client.germanLevel,
      education: c.client.education,
      drivingLicence: c.client.drivingLicence,
      experienceYears: c.client.experienceYears,
    },
    company: c.company ? { name: c.company.name, legalForm: c.company.legalForm, address: c.company.address, city: c.company.city, contactName: c.company.contactName, phone: c.company.phone, email: c.company.email, vatId: c.company.vatId } : null,
    vacancy: c.vacancy,
    contract: c.contract ? { version: c.contract.version, sentAt: c.contract.sentAt, signedAt: c.contract.signedAt, signerName: c.contract.signerName } : null,
    mrz: passportDoc ? mrzOf(passportDoc.ocr) : null,
    date: now,
  };
};

// ─── Field model ───────────────────────────────────────────────────────

interface Field {
  label: string;
  value: string;
  /** Profile field name when the value comes from the profile (reported as missing when empty). */
  source?: string;
}

const names = (d: FormData) => ({
  surname: d.mrz?.surname || d.client.lastName.toUpperCase(),
  givenNames: d.mrz?.givenNames || d.client.firstName.toUpperCase(),
});

const companyLine = (c: FormData['company']) => (c ? [c.name + (c.legalForm ? ` ${c.legalForm}` : ''), [c.address, c.city].filter(Boolean).join(', ')].filter(Boolean).join(' · ') : '');

/** Which profile fields a form needs and cannot find. */
const ORDER = ['phone', 'birthDate', 'nationality', 'address', 'passportNumber', 'passportExpiry', 'profession', 'education', 'germanLevel', 'company'];
const canonical = (fields: string[]) => [...new Set(fields)].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));

export const missingFields = (kind: FormKind, d: FormData): string[] => canonical(fieldsFor(kind, d).filter((f) => f.source && !f.value).map((f) => f.source!));

const fieldsFor = (kind: FormKind, d: FormData): Field[] => {
  const n = names(d);
  const c = d.client;
  const person: Field[] = [
    { label: 'Familienname / Surname', value: n.surname },
    { label: 'Vorname(n) / Given names', value: n.givenNames },
    { label: 'Geburtsdatum / Date of birth', value: fmtDate(c.birthDate), source: 'birthDate' },
    { label: 'Staatsangehörigkeit / Nationality', value: c.nationality ?? '', source: 'nationality' },
    { label: 'Passnummer / Passport no.', value: c.passportNumber ?? '', source: 'passportNumber' },
    { label: 'Pass gültig bis / Passport valid until', value: fmtDate(c.passportExpiry), source: 'passportExpiry' },
  ];
  const contact: Field[] = [
    { label: 'Anschrift / Address', value: [c.address, c.city].filter(Boolean).join(', '), source: 'address' },
    { label: 'Telefon / Phone', value: c.phone ?? '', source: 'phone' },
    { label: 'E-Mail', value: c.email },
  ];
  const employer: Field[] = [
    { label: 'Arbeitgeber / Employer', value: companyLine(d.company), source: 'company' },
    { label: 'Ansprechpartner / Contact', value: d.company?.contactName ?? '' },
    { label: 'Telefon (Arbeitgeber)', value: d.company?.phone ?? '' },
  ];
  switch (kind) {
    case 'videx-summary':
      return [
        ...person,
        { label: 'Geschlecht / Sex', value: d.mrz?.sex ?? '' },
        { label: 'Geburtsort / Place of birth', value: '' },
        { label: 'Familienstand / Marital status', value: '' },
        { label: 'Passart / Type of passport', value: 'Reisepass / Ordinary passport' },
        { label: 'Ausstellungsdatum / Date of issue', value: '' },
        { label: 'Ausstellende Behörde / Issuing authority', value: '' },
        ...contact,
        { label: 'Beruf / Profession', value: d.profession, source: 'profession' },
        { label: 'Ausbildung / Education', value: c.education ?? '', source: 'education' },
        { label: 'Deutschkenntnisse / German level', value: c.germanLevel ?? '', source: 'germanLevel' },
        ...employer,
        { label: 'Zweck des Aufenthalts / Purpose of stay', value: `Erwerbstätigkeit – ${d.profession}${d.visaType ? ` (${d.visaType})` : ''}` },
        { label: 'Beabsichtigte Aufenthaltsdauer / Intended stay', value: 'Langfristig (> 90 Tage) / Long-term' },
        { label: 'Geplantes Einreisedatum / Planned entry date', value: '' },
      ];
    case 'employer-letter':
      return [...person.slice(0, 5), { label: 'Beruf / Position', value: d.profession, source: 'profession' }, ...employer];
    case 'contract-cover':
      return [...person, ...contact, { label: 'Position', value: d.profession, source: 'profession' }, ...employer];
  }
};

// ─── Drawing ───────────────────────────────────────────────────────────

interface Ctx {
  pdf: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
  y: number;
  missing: string[];
}

const newPage = (ctx: Ctx, title: string, subtitle: string) => {
  ctx.page = ctx.pdf.addPage(A4);
  ctx.page.drawRectangle({ x: 0, y: A4[1] - 42, width: A4[0], height: 42, color: NAVY });
  ctx.page.drawText('TRIAD VISION', { x: MARGIN, y: A4[1] - 27, size: 16, font: ctx.bold, color: WHITE });
  ctx.page.drawText(safeText(ctx.bold, title), { x: MARGIN, y: 760, size: 16, font: ctx.bold, color: NAVY });
  ctx.page.drawText(safeText(ctx.font, subtitle), { x: MARGIN, y: 744, size: 9, font: ctx.font, color: GREY });
  ctx.page.drawLine({ start: { x: MARGIN, y: 734 }, end: { x: A4[0] - MARGIN, y: 734 }, thickness: 1, color: NAVY });
  ctx.y = 710;
};

const ensure = (ctx: Ctx, need: number, title: string, subtitle: string) => {
  if (ctx.y - need < 60) newPage(ctx, title, subtitle);
};

/** Label + value row; empty values become a highlighted placeholder. */
const drawField = (ctx: Ctx, f: Field, title: string, subtitle: string) => {
  ensure(ctx, 24, title, subtitle);
  ctx.page.drawText(safeText(ctx.bold, f.label), { x: MARGIN, y: ctx.y, size: 8.5, font: ctx.bold, color: GREY });
  if (f.value) {
    ctx.page.drawText(safeText(ctx.font, f.value).slice(0, 80), { x: 250, y: ctx.y, size: 10.5, font: ctx.font, color: NAVY });
  } else {
    ctx.page.drawRectangle({ x: 248, y: ctx.y - 4, width: 120, height: 15, color: HIGHLIGHT });
    ctx.page.drawText(PLACEHOLDER, { x: 250, y: ctx.y, size: 10.5, font: ctx.font, color: NAVY });
    if (f.source && !ctx.missing.includes(f.source)) ctx.missing.push(f.source);
  }
  ctx.page.drawLine({ start: { x: MARGIN, y: ctx.y - 7 }, end: { x: A4[0] - MARGIN, y: ctx.y - 7 }, thickness: 0.3, color: rgb(0.85, 0.87, 0.9) });
  ctx.y -= 22;
};

const paragraph = (ctx: Ctx, s: string, size = 10.5, title = '', subtitle = '') => {
  const words = safeText(ctx.font, s).split(' ');
  let line = '';
  const maxW = A4[0] - 2 * MARGIN;
  const flush = () => {
    ensure(ctx, 16, title, subtitle);
    ctx.page.drawText(line, { x: MARGIN, y: ctx.y, size, font: ctx.font, color: NAVY });
    ctx.y -= size * 1.5;
    line = '';
  };
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (ctx.font.widthOfTextAtSize(candidate, size) <= maxW) line = candidate;
    else {
      flush();
      line = w;
    }
  }
  if (line) flush();
};

const value = (ctx: Ctx, v: string, source?: string) => {
  if (v) return v;
  if (source && !ctx.missing.includes(source)) ctx.missing.push(source);
  return PLACEHOLDER;
};

const signatureBlock = (ctx: Ctx, left: string, right: string) => {
  ensure(ctx, 80, '', '');
  ctx.y -= 40;
  for (const [x, label] of [
    [MARGIN, left],
    [A4[0] / 2 + 10, right],
  ] as const) {
    ctx.page.drawLine({ start: { x, y: ctx.y }, end: { x: x + 220, y: ctx.y }, thickness: 0.6, color: NAVY });
    ctx.page.drawText(safeText(ctx.font, label), { x, y: ctx.y - 12, size: 8.5, font: ctx.font, color: GREY });
  }
  ctx.y -= 40;
};

export const FORM_TITLES: Record<FormKind, { title: string; file: string }> = {
  'videx-summary': { title: 'VIDEX – Datenblatt / Data sheet', file: 'videx-datenblatt' },
  'employer-letter': { title: 'Bestätigung des Arbeitgebers', file: 'arbeitgeber-bestaetigung' },
  'contract-cover': { title: 'Deckblatt Arbeitsvertrag', file: 'arbeitsvertrag-deckblatt' },
};

export const formFileName = (kind: FormKind, caseNumber: string) => `${caseNumber}-${FORM_TITLES[kind].file}.pdf`;

/** Builds the PDF for a form. Returns the bytes and the missing profile fields. */
export const buildForm = async (kind: FormKind, d: FormData) => {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${d.caseNumber} – ${FORM_TITLES[kind].title}`);
  pdf.setAuthor('Triad Vision');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ctx: Ctx = { pdf, page: undefined as unknown as PDFPage, font, bold, y: 0, missing: [] };
  const title = FORM_TITLES[kind].title;
  const subtitle = `${d.caseNumber} · ${fmtDate(d.date)}${d.visaType ? ` · ${d.visaType}` : ''}`;
  newPage(ctx, title, subtitle);
  const n = names(d);
  const fields = fieldsFor(kind, d);

  if (kind === 'videx-summary') {
    paragraph(ctx, 'Diese Übersicht enthält alle Angaben für den Online-Visumantrag (VIDEX). Gelb markierte Felder fehlen im Profil und sind von Hand zu ergänzen. / Bu vərəq VIDEX onlayn ərizəsi üçün bütün məlumatları ehtiva edir. Sarı sahələr profildə yoxdur – əl ilə doldurun.', 9, title, subtitle);
    ctx.y -= 6;
    for (const f of fields) drawField(ctx, f, title, subtitle);
  } else if (kind === 'employer-letter') {
    const co = d.company;
    const coName = value(ctx, co?.name ?? '', 'company');
    const coAddr = co ? [co.address, co.city].filter(Boolean).join(', ') : '';
    ctx.page.drawText(safeText(bold, coName), { x: MARGIN, y: ctx.y, size: 11, font: bold, color: NAVY });
    ctx.y -= 14;
    ctx.page.drawText(safeText(font, coAddr || PLACEHOLDER), { x: MARGIN, y: ctx.y, size: 9.5, font, color: GREY });
    ctx.y -= 14;
    ctx.page.drawText(safeText(font, [co?.phone, co?.email].filter(Boolean).join(' · ') || PLACEHOLDER), { x: MARGIN, y: ctx.y, size: 9.5, font, color: GREY });
    ctx.y -= 30;
    const right = `${co?.city ?? PLACEHOLDER}, ${fmtDate(d.date)}`;
    ctx.page.drawText(safeText(font, right), { x: A4[0] - MARGIN - font.widthOfTextAtSize(safeText(font, right), 10), y: ctx.y, size: 10, font, color: NAVY });
    ctx.y -= 30;
    ctx.page.drawText('Bestätigung zur Vorlage bei der Deutschen Botschaft', { x: MARGIN, y: ctx.y, size: 12, font: bold, color: NAVY });
    ctx.y -= 28;
    const salary = d.vacancy?.salaryMin ? `${d.vacancy.salaryMin}${d.vacancy.salaryMax ? `–${d.vacancy.salaryMax}` : ''} EUR brutto monatlich` : PLACEHOLDER;
    const employment = d.vacancy?.employmentType === 'PART_TIME' ? 'in Teilzeit' : d.vacancy?.employmentType === 'SEASONAL' ? 'als Saisonarbeitskraft' : d.vacancy?.employmentType === 'AUSBILDUNG' ? 'als Auszubildende/r' : 'in Vollzeit';
    paragraph(ctx, `Hiermit bestätigen wir, ${coName}, dass wir ${n.givenNames} ${n.surname}, geboren am ${value(ctx, fmtDate(d.client.birthDate), 'birthDate')}, Staatsangehörigkeit ${value(ctx, d.client.nationality ?? '', 'nationality')}, Reisepass Nr. ${value(ctx, d.client.passportNumber ?? '', 'passportNumber')}, nach Erteilung des Visums ${employment} als ${value(ctx, d.profession, 'profession')} beschäftigen werden.`, 10.5, title, subtitle);
    ctx.y -= 6;
    paragraph(ctx, `Arbeitsort: ${d.vacancy?.city ?? co?.city ?? PLACEHOLDER}. Vergütung: ${salary}. Der Arbeitsvertrag${d.contract ? ` (Version ${d.contract.version} vom ${fmtDate(d.contract.sentAt)})` : ''} liegt dieser Bestätigung bei. Die Beschäftigung erfolgt zu den in Deutschland üblichen Bedingungen; Arbeitszeit, Urlaub und Sozialversicherung richten sich nach den gesetzlichen und tariflichen Vorschriften.`, 10.5, title, subtitle);
    ctx.y -= 6;
    paragraph(ctx, 'Wir sind mit der Einreise und Beschäftigung der genannten Person einverstanden und stehen für Rückfragen der Botschaft und der Bundesagentur für Arbeit zur Verfügung.', 10.5, title, subtitle);
    ctx.y -= 10;
    for (const f of fields) drawField(ctx, f, title, subtitle);
    signatureBlock(ctx, 'Ort, Datum', `Unterschrift, Stempel – ${co?.contactName ?? 'Geschäftsführung'}`);
  } else {
    paragraph(ctx, `Dieses Deckblatt gehört zum Arbeitsvertrag zwischen den folgenden Parteien${d.contract ? ` (Vertragsversion ${d.contract.version}, versandt am ${fmtDate(d.contract.sentAt)}${d.contract.signedAt ? `, elektronisch unterzeichnet am ${fmtDate(d.contract.signedAt)} durch ${d.contract.signerName ?? ''}` : ''})` : ''}.`, 10, title, subtitle);
    ctx.y -= 8;
    ctx.page.drawText('Arbeitgeber / Employer', { x: MARGIN, y: ctx.y, size: 11, font: bold, color: NAVY });
    ctx.y -= 20;
    const co = d.company;
    drawField(ctx, { label: 'Firma / Company', value: co ? co.name + (co.legalForm ? ` ${co.legalForm}` : '') : '', source: 'company' }, title, subtitle);
    drawField(ctx, { label: 'Anschrift / Address', value: co ? [co.address, co.city].filter(Boolean).join(', ') : '' }, title, subtitle);
    drawField(ctx, { label: 'USt-IdNr. / VAT ID', value: co?.vatId ?? '' }, title, subtitle);
    drawField(ctx, { label: 'Vertreten durch / Represented by', value: co?.contactName ?? '' }, title, subtitle);
    drawField(ctx, { label: 'Kontakt / Contact', value: [co?.phone, co?.email].filter(Boolean).join(' · ') }, title, subtitle);
    ctx.y -= 10;
    ctx.page.drawText('Arbeitnehmer / Employee', { x: MARGIN, y: ctx.y, size: 11, font: bold, color: NAVY });
    ctx.y -= 20;
    for (const f of fields.filter((x) => !['Arbeitgeber / Employer', 'Ansprechpartner / Contact', 'Telefon (Arbeitgeber)'].includes(x.label))) drawField(ctx, f, title, subtitle);
    ctx.y -= 10;
    drawField(ctx, { label: 'Visum / Visa', value: d.visaType }, title, subtitle);
    drawField(ctx, { label: 'Akte / Case', value: d.caseNumber }, title, subtitle);
    signatureBlock(ctx, 'Arbeitgeber – Ort, Datum, Unterschrift', 'Arbeitnehmer – Ort, Datum, Unterschrift');
  }

  // Footer on every page
  const total = pdf.getPageCount();
  for (let i = 0; i < total; i++) {
    const page = pdf.getPage(i);
    const label = `${i + 1} / ${total}`;
    page.drawText(label, { x: A4[0] / 2 - font.widthOfTextAtSize(label, 9) / 2, y: 18, size: 9, font, color: GREY });
    page.drawText(safeText(font, `Triad Vision · ${d.caseNumber} · ${title}`), { x: MARGIN, y: 18, size: 8, font, color: GREY });
  }
  return { pdf: Buffer.from(await pdf.save()), missing: canonical(ctx.missing), pages: total };
};
