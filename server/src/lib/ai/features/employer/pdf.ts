import { rgb } from 'pdf-lib';
import { A4, BRAND, Flow, INK, LINE, MUTED, createDoc, fit, numberPages } from '../../../cv/pdfKit.js';
import type { ProfileContent, ProfileLang } from './profile.js';

/**
 * PDF of the candidate profile for employers: Triad Vision header, anonymised name, German (or English)
 * labels. DejaVu Sans is embedded (as for the CVs), so Azerbaijani, German and Cyrillic letters render as they
 * are; anything the font cannot draw is transliterated / replaced by the shared `clean` of the PDF toolkit.
 */

interface Labels {
  doc: string;
  for: string;
  summary: string;
  experience: string;
  years: (n: number) => string;
  languages: string;
  licences: string;
  education: string;
  availability: string;
  whyFit: string;
  openPoints: string;
  note: string;
  page: string;
  of: string;
}

const LABELS: Record<ProfileLang, Labels> = {
  de: {
    doc: 'Kandidatenprofil',
    for: 'Für die Stelle',
    summary: 'Kurzprofil',
    experience: 'Berufserfahrung',
    years: (n: number) => `${String(n).replace('.', ',')} ${n === 1 ? 'Jahr' : 'Jahre'}`,
    languages: 'Sprachen',
    licences: 'Führerscheinklassen',
    education: 'Ausbildung',
    availability: 'Verfügbarkeit',
    whyFit: 'Warum der Kandidat passt',
    openPoints: 'Offene Punkte',
    note: 'Anonymisiertes Profil – Kontaktdaten und Unterlagen erhalten Sie über Triad Vision.',
    page: 'Seite',
    of: 'von',
  },
  en: {
    doc: 'Candidate profile',
    for: 'For the position',
    summary: 'Summary',
    experience: 'Work experience',
    years: (n: number) => `${n} ${n === 1 ? 'year' : 'years'}`,
    languages: 'Languages',
    licences: 'Driving licences',
    education: 'Education',
    availability: 'Availability',
    whyFit: 'Why the candidate fits',
    openPoints: 'Open points',
    note: 'Anonymised profile – contact details and documents are available through Triad Vision.',
    page: 'Page',
    of: 'of',
  },
};

export const profilePdf = async (p: { content: ProfileContent; lang: ProfileLang; name: string; position?: string | null; date?: Date }) => {
  const L = LABELS[p.lang];
  const c = p.content;
  const { pdf, fonts } = await createDoc({ title: `${L.doc} – ${p.name}`, author: 'Triad Vision', subject: L.doc, lang: p.lang === 'de' ? 'de-DE' : 'en-GB' });
  const [W, H] = A4;
  const X = 56;
  const R = W - 56;
  const width = R - X;

  const header = (page: ReturnType<typeof pdf.addPage>) => {
    page.drawRectangle({ x: 0, y: H - 64, width: W, height: 64, color: BRAND });
    page.drawText('TRIAD VISION', { x: X, y: H - 38, size: 15, font: fonts.bold, color: rgb(1, 1, 1) });
    const right = L.doc;
    page.drawText(right, { x: R - fonts.regular.widthOfTextAtSize(right, 10), y: H - 37, size: 10, font: fonts.regular, color: rgb(0.85, 0.9, 1) });
  };
  const flow = new Flow(pdf, fonts, { top: H - 100, bottom: 56, onNewPage: (page) => header(page) });

  flow.draw(fit(p.name, fonts.bold, 20, width), X, { size: 20, bold: true, color: INK });
  flow.gap(22);
  if (c.headline) flow.para(c.headline, X, width, { size: 12, bold: true, color: BRAND });
  if (p.position) flow.para(`${L.for}: ${p.position}`, X, width, { size: 9.5, color: MUTED });
  flow.gap(6);

  const heading = (text: string) => {
    flow.need(40);
    flow.gap(8);
    flow.draw(text.toUpperCase(), X, { size: 9, bold: true, color: BRAND });
    flow.gap(5);
    flow.rule(X, R, LINE);
    flow.gap(13);
  };

  if (c.summary) {
    heading(L.summary);
    flow.para(c.summary, X, width);
  }
  if (c.whyFit.length) {
    heading(L.whyFit);
    for (const b of c.whyFit) flow.bullet(b, X, width);
  }
  if (c.experience.length) {
    heading(L.experience);
    for (const e of c.experience) {
      flow.need(30);
      const years = e.years != null ? L.years(e.years) : '';
      flow.draw(fit(e.role, fonts.bold, 10.5, width - 90), X, { size: 10.5, bold: true });
      if (years) flow.draw(years, R - fonts.regular.widthOfTextAtSize(years, 9.5), { size: 9.5, color: MUTED });
      flow.gap(14);
      for (const t of e.tasks) flow.bullet(t, X + 8, width - 8, { size: 9.5 });
      flow.gap(4);
    }
  }
  if (c.languages.length) {
    heading(L.languages);
    flow.para(c.languages.map((l) => (l.level ? `${l.language}: ${l.level}` : l.language)).join(' · '), X, width);
  }
  if (c.licences.length) {
    heading(L.licences);
    flow.para(c.licences.join(', '), X, width);
  }
  if (c.education) {
    heading(L.education);
    flow.para(c.education, X, width);
  }
  if (c.availability) {
    heading(L.availability);
    flow.para(c.availability, X, width);
  }
  if (c.openPoints.length) {
    heading(L.openPoints);
    for (const b of c.openPoints) flow.bullet(b, X, width);
  }
  flow.gap(18);
  flow.para(L.note, X, width, { size: 8.5, color: MUTED });
  const date = (p.date ?? new Date()).toISOString().slice(0, 10).split('-').reverse().join('.');
  flow.para(date, X, width, { size: 8.5, color: MUTED });

  numberPages(flow.pages, fonts, L.page, R, L.of);
  return Buffer.from(await pdf.save());
};
