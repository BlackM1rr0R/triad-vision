import type { ContractKind } from '@prisma/client';
import { A4, BRAND, Flow, INK, LINE, MM, MUTED, createDoc, fit, numberPages } from '../cv/pdfKit.js';
import type { ContractLang } from './values.js';

/**
 * Contract PDF: title, the rendered template text and signature lines (DejaVu Sans, so Azerbaijani,
 * German and Cyrillic letters render). Text conventions: "# " title line, "## " section heading,
 * "- " bullet, blank line = new paragraph.
 */

const SIGN_LABELS: Record<ContractLang, Record<ContractKind, [string, string]> & { place: string; page: [string, string] }> = {
  de: { WORK: ['Arbeitgeber', 'Arbeitnehmer/in'], AUSBILDUNG: ['Ausbildende/r', 'Auszubildende/r'], SERVICE: ['Triad Vision', 'Auftraggeber/in'], place: 'Ort, Datum', page: ['Seite', 'von'] },
  en: { WORK: ['Employer', 'Employee'], AUSBILDUNG: ['Training company', 'Trainee'], SERVICE: ['Triad Vision', 'Client'], place: 'Place, date', page: ['Page', 'of'] },
  az: { WORK: ['İşəgötürən', 'İşçi'], AUSBILDUNG: ['Təhsil verən', 'Təhsil alan'], SERVICE: ['Triad Vision', 'Sifarişçi'], place: 'Yer, tarix', page: ['Səhifə', '/'] },
  ru: { WORK: ['Работодатель', 'Работник'], AUSBILDUNG: ['Обучающая сторона', 'Обучающийся'], SERVICE: ['Triad Vision', 'Заказчик'], place: 'Место, дата', page: ['Стр.', 'из'] },
};

export interface ContractPdfInput {
  title: string;
  text: string;
  kind: ContractKind;
  language: ContractLang;
  /** names printed under the two signature lines (left: employer / Triad Vision, right: worker / client) */
  parties?: [string, string];
}

export const renderContractPdf = async (input: ContractPdfInput): Promise<Buffer> => {
  const { pdf, fonts } = await createDoc({ title: input.title, author: 'Triad Vision', subject: input.title, lang: input.language });
  const left = 22 * MM;
  const right = A4[0] - 22 * MM;
  const width = right - left;
  const flow = new Flow(pdf, fonts, { top: A4[1] - 22 * MM, bottom: 22 * MM });

  const lines = input.text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').split('\n');
  // The first "# " line (if any) is the document title; otherwise the template name.
  const titleIdx = lines.findIndex((l) => l.trim().length > 0);
  const hasTitle = titleIdx >= 0 && lines[titleIdx].startsWith('# ');
  const title = hasTitle ? lines[titleIdx].slice(2).trim() : input.title;
  flow.para(title, left, width, { bold: true, size: 15, color: BRAND, leading: 20 });
  flow.gap(4);
  flow.rule(left, right, LINE, 0.8);
  flow.gap(16);

  let paragraph: string[] = [];
  const flush = () => {
    if (!paragraph.length) return;
    flow.para(paragraph.join('\n'), left, width, { size: 10, leading: 14 });
    flow.gap(6);
    paragraph = [];
  };
  lines.forEach((raw, i) => {
    if (hasTitle && i === titleIdx) return;
    const line = raw.trimEnd();
    if (!line.trim()) return flush();
    if (line.startsWith('## ') || line.startsWith('# ')) {
      flush();
      flow.need(40);
      flow.gap(4);
      flow.para(line.replace(/^#+\s*/, ''), left, width, { bold: true, size: 11, leading: 15 });
      flow.gap(2);
      return;
    }
    if (/^\s*[-•]\s+/.test(line)) {
      flush();
      flow.bullet(line.replace(/^\s*[-•]\s+/, ''), left + 6, width - 6, { size: 10 });
      return;
    }
    paragraph.push(line);
  });
  flush();

  // Signature block: place/date and a line for each party, kept together on one page.
  const labels = SIGN_LABELS[input.language];
  const [l1, l2] = labels[input.kind];
  const colW = (width - 30) / 2;
  flow.need(120);
  flow.gap(28);
  for (const [i, label] of [l1, l2].entries()) {
    const x = left + i * (colW + 30);
    const y = flow.y;
    flow.page.drawLine({ start: { x, y }, end: { x: x + colW, y }, thickness: 0.6, color: INK });
    flow.page.drawText(labels.place, { x, y: y - 11, size: 8, font: fonts.regular, color: MUTED });
    const y2 = y - 52;
    flow.page.drawLine({ start: { x, y: y2 }, end: { x: x + colW, y: y2 }, thickness: 0.6, color: INK });
    flow.page.drawText(fit(label, fonts.bold, 9, colW), { x, y: y2 - 12, size: 9, font: fonts.bold, color: INK });
    const name = input.parties?.[i]?.trim();
    if (name) flow.page.drawText(fit(name, fonts.regular, 8.5, colW), { x, y: y2 - 24, size: 8.5, font: fonts.regular, color: MUTED });
  }
  flow.gap(80);

  numberPages(flow.pages, fonts, labels.page[0], right, labels.page[1]);
  return Buffer.from(await pdf.save());
};
