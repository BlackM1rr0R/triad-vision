import { rgb } from 'pdf-lib';
import { A4, BAND, BRAND, Flow, INK, LINE, MUTED, createDoc, fit, numberPages, wrap } from '../cv/pdfKit.js';
import { ATTACHMENT_DE, DSK_SOURCE, stageIncludes, type Disclosure } from './schema.js';

/**
 * Mieterselbstauskunft as a clean German A4 PDF (DejaVu via the CV toolkit). Follows the structure of the DSK model
 * questionnaire (stages A / B / C, see ./schema.ts) and prints only the stages up to the chosen one; empty fields
 * get a line to fill in by hand. No logo of a landlord, no consent clause (the DSK guidance rejects consent as the
 * basis), nothing stored.
 */

const M = 50;
const W = A4[0] - 2 * M;
const LABEL_W = 190;
const BOX_ON = '☒';
const BOX_OFF = '☐';

const nf = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
const eur = (n: number) => `${nf.format(n)} €`;

export const disclosureFilename = (d: Pick<Disclosure, 'name'>) => {
  const slug = d.name
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40);
  return `Mieterselbstauskunft${slug ? `-${slug}` : ''}.pdf`;
};

export const renderDisclosurePdf = async (d: Disclosure): Promise<Uint8Array> => {
  const { pdf, fonts } = await createDoc({ title: 'Mieterselbstauskunft', subject: DSK_SOURCE, lang: 'de-DE' });
  const flow = new Flow(pdf, fonts, { top: A4[1] - 60, bottom: 56 });
  const { regular, bold } = fonts;

  const header = (page = flow.page) => {
    page.drawRectangle({ x: 0, y: A4[1] - 30, width: A4[0], height: 30, color: BAND });
    page.drawText('Mieterselbstauskunft', { x: M, y: A4[1] - 19, size: 10, font: bold, color: BRAND });
    const right = 'nach DSK-Musterfragebogen (Stand Januar 2026)';
    page.drawText(right, { x: A4[0] - M - regular.widthOfTextAtSize(right, 8), y: A4[1] - 19, size: 8, font: regular, color: MUTED });
  };
  header();
  flow.opts.onNewPage = (p) => header(p);

  flow.para('Mieterselbstauskunft', M, W, { size: 20, bold: true, color: BRAND, leading: 26 });
  flow.para(
    'Die Angaben folgen der Orientierungshilfe der Datenschutzkonferenz (DSK) zur Einholung von Selbstauskünften bei Mietinteressent:innen, Version 2.0 (Januar 2026). Angaben aus Abschnitt B werden erst bei Anmietungsinteresse, Angaben und Nachweise aus Abschnitt C erst nach der Entscheidung für mich als künftige:n Mieter:in gemacht.',
    M,
    W,
    { size: 8.5, color: MUTED },
  );
  flow.gap(6);

  const row = (label: string, value: string) => {
    const size = 10;
    const leading = 14;
    const lines = value ? wrap(value, regular, size, W - LABEL_W) : [''];
    const labelLines = wrap(label, bold, 9, LABEL_W - 10);
    const n = Math.max(lines.length, labelLines.length);
    flow.need(n * leading + 4);
    const top = flow.y;
    labelLines.forEach((l, i) => flow.page.drawText(l, { x: M, y: top - i * leading, size: 9, font: bold, color: INK }));
    if (value) lines.forEach((l, i) => flow.page.drawText(l, { x: M + LABEL_W, y: top - i * leading, size, font: regular, color: INK }));
    else flow.page.drawLine({ start: { x: M + LABEL_W, y: top - 3 }, end: { x: M + W, y: top - 3 }, thickness: 0.5, color: LINE });
    flow.y = top - n * leading - 4;
  };
  const yn = (v: '' | 'yes' | 'no') => `${v === 'yes' ? BOX_ON : BOX_OFF} Ja    ${v === 'no' ? BOX_ON : BOX_OFF} Nein`;
  const section = (title: string, note?: string) => {
    flow.need(56);
    flow.gap(10);
    flow.page.drawRectangle({ x: M - 6, y: flow.y - 6, width: W + 12, height: 22, color: BAND });
    flow.page.drawText(title, { x: M, y: flow.y + 1, size: 11.5, font: bold, color: BRAND });
    flow.y -= 26;
    if (note) {
      flow.para(note, M, W, { size: 8.5, color: MUTED });
      flow.gap(4);
    }
  };

  if (d.landlordName || d.landlordAddress) {
    section('Vermieter:in / Hausverwaltung');
    row('Name', d.landlordName);
    row('Anschrift', d.landlordAddress);
  }
  section('Wohnung');
  row('Adresse der Wohnung', d.flatAddress);
  if (d.flatUnit) row('Bezeichnung (Lage / Nr.)', d.flatUnit);
  row('Gewünschter Einzugstermin', d.moveIn);

  section('A) Besichtigungstermin', 'Kontaktdaten: Anschrift und / oder Telefon und / oder E-Mail.');
  row('Name, Vorname', d.name);
  row('Aktuelle Anschrift', d.address);
  row('Telefon', d.phone);
  row('E-Mail', d.email);
  if (d.socialHousing) row('Wohnberechtigungsschein vorhanden', yn(d.wbs));

  if (stageIncludes(d.stage, 'B')) {
    section('B) Anmietungsinteresse', 'Ich möchte die oben genannte Wohnung anmieten.');
    row('Einziehende Personen', `${d.adults} Erwachsene${d.children ? `, ${d.children} ${d.children === 1 ? 'Kind' : 'Kinder'}` : ', keine Kinder'}`);
    row('Derzeitige:r Arbeitgeber:in', d.employer);
    row('Derzeit ausgeübter Beruf', d.occupation);
    if (d.publicPayer) row('Mietzahlung', 'Die Miete wird vollständig von einer öffentlichen Stelle übernommen.');
    else if (d.incomeMode === 'threshold' && d.threshold) row(`Zur Mietzahlung stehen monatlich mindestens ${eur(d.threshold)} zur Verfügung`, yn(d.thresholdOk));
    else row('Monatliches Nettoeinkommen', d.net ? eur(d.net) : '');
    if (d.petsAsked) row('Haustiere (außer Kleintieren in Behältnissen)', d.pets || 'keine');
    row('Laufendes, nicht abgeschlossenes Insolvenzverfahren', yn(d.insolvency));
    row('Räumungstitel in den letzten 5 Jahren', yn(d.eviction));
  }

  if (stageIncludes(d.stage, 'C')) {
    section('C) Vor Abschluss des Mietvertrags', 'Erst nachdem sich die / der Vermieter:in für mich entschieden hat.');
    row('Mietrückstand im bestehenden Mietverhältnis für zwei aufeinanderfolgende Monate (mehr als eine Monatsmiete)', yn(d.arrearsTwoMonths));
    row('Mietrückstand über mehr als zwei Monate in Höhe von mindestens zwei Monatsmieten', yn(d.arrearsTwoRents));
    row('Kündigung des letzten Mietverhältnisses wegen erheblicher Vertragsverletzung', yn(d.terminated));
    if (d.terminated === 'yes') {
      row('Welche Pflichtverletzung', d.terminatedWhat);
      row('Warum sie nicht erneut zu erwarten ist', d.reasons);
    }
    if (d.attachments.length) {
      flow.gap(4);
      flow.para('Anlagen', M, W, { size: 10, bold: true });
      for (const a of d.attachments) flow.bullet(ATTACHMENT_DE[a], M, W, { size: 9.5 });
    }
  }

  // Signature
  flow.need(90);
  flow.gap(28);
  const y = flow.y;
  const half = (W - 30) / 2;
  flow.page.drawLine({ start: { x: M, y }, end: { x: M + half, y }, thickness: 0.6, color: INK });
  flow.page.drawLine({ start: { x: M + half + 30, y }, end: { x: M + W, y }, thickness: 0.6, color: INK });
  const placeDate = [d.place, d.date].filter(Boolean).join(', ');
  if (placeDate) flow.page.drawText(fit(placeDate, regular, 10, half), { x: M, y: y + 5, size: 10, font: regular, color: INK });
  flow.page.drawText('Ort, Datum', { x: M, y: y - 12, size: 8, font: regular, color: MUTED });
  flow.page.drawText('Unterschrift', { x: M + half + 30, y: y - 12, size: 8, font: regular, color: MUTED });
  flow.y = y - 34;

  flow.para(
    'Hinweis: Fragen nach Staatsangehörigkeit, Religion, ethnischer Herkunft, Familienstand, Schwangerschaft oder Kinderwunsch, Vorstrafen, Partei- oder Mietervereinsmitgliedschaft, Dauer der Beschäftigung und Kontaktdaten früherer Vermieter:innen sind nach der DSK-Orientierungshilfe unzulässig; eine Ausweiskopie ist nicht erforderlich. Daten nicht berücksichtigter Mietinteressent:innen sind zu löschen (Art. 17 DS-GVO).',
    M,
    W,
    { size: 7.5, color: rgb(0.45, 0.48, 0.53) },
  );
  numberPages(flow.pages, fonts, 'Seite', A4[0] - M);
  return pdf.save();
};
