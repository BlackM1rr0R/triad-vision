import { rgb } from 'pdf-lib';
import { A4, BRAND, Flow, INK, LINE, MUTED, createDoc, fit, numberPages, wrap } from '../cv/pdfKit.js';
import { SECTION_LABELS, type Section, type VidexField } from '../ai/features/caseAi/videx.js';
import { SHEET_TEXT, hintLang, type SheetLang } from './texts.js';
import { HINTS_TR, HINTS_UK, SECTION_TR, SECTION_UK } from './hintsExtra.js';

/**
 * "VIDEX hazırlıq vərəqi": every field of the embassy's online VIDEX form with the client's prefilled answer
 * (German label as in VIDEX + a hint in the client's language). Missing answers are highlighted so the client
 * can complete them before copying everything into the official online form. It is NOT the form itself and
 * nothing is submitted: the client applies, the embassy decides.
 */

export interface SheetRow {
  key: string;
  section: Section;
  labelDe: string;
  hint: string;
  value: string;
  required: boolean;
  /** No value yet (the client fills it in). */
  missing: boolean;
  /** Employer data the client may not see yet (lib/caseContracts/employerVisibility). */
  employerHidden: boolean;
}

/** Pure: VIDEX fields → sheet rows for one language (employer section blanked while the employer is not revealed). */
/** Hint of one field in the sheet language: own tr / uk wording, else the field's az / de / en / ru label. */
const hintOf = (f: VidexField, lang: SheetLang): string => (lang === 'tr' ? HINTS_TR[f.key] : lang === 'uk' ? HINTS_UK[f.key] : undefined) ?? f.label[hintLang(lang)];

/** Section heading in the sheet language. */
const sectionHint = (s: Section, lang: SheetLang): string => (lang === 'tr' ? SECTION_TR[s] : lang === 'uk' ? SECTION_UK[s] : SECTION_LABELS[s][hintLang(lang)]);

export const videxSheetRows = (fields: VidexField[], opts: { lang: SheetLang; employerRevealed: boolean }): SheetRow[] => {
  return fields.map((f) => {
    const employerHidden = f.section === 'employer' && !opts.employerRevealed;
    const value = employerHidden ? '' : f.value.trim();
    return {
      key: f.key,
      section: f.section,
      labelDe: f.label.de,
      hint: hintOf(f, opts.lang),
      value,
      required: f.required,
      missing: !value && !employerHidden,
      employerHidden,
    };
  });
};

/** Required answers still missing (the count the cabinet card shows). */
export const missingRequired = (rows: SheetRow[]) => rows.filter((r) => r.missing && r.required).map((r) => r.key);

const HIGHLIGHT = rgb(1, 0.93, 0.6);
const SECTION_ORDER = Object.keys(SECTION_LABELS) as Section[];

export const renderVidexSheet = async (rows: SheetRow[], info: { lang: SheetLang; caseNumber: string; clientName: string; date: Date }): Promise<Buffer> => {
  const tx = SHEET_TEXT[info.lang];
  const { pdf, fonts } = await createDoc({ title: `${tx.title} – ${info.caseNumber}`, author: 'Triad Vision', subject: 'VIDEX', lang: info.lang });
  const left = 40;
  const right = A4[0] - 40;
  const labelW = 230;
  const valueX = left + labelW + 12;
  const valueW = right - valueX;
  const flow = new Flow(pdf, fonts, {
    top: A4[1] - 64,
    bottom: 48,
    onNewPage: (p) => {
      p.drawRectangle({ x: 0, y: A4[1] - 34, width: A4[0], height: 34, color: BRAND });
      p.drawText('TRIAD VISION', { x: left, y: A4[1] - 22, size: 11, font: fonts.bold, color: rgb(1, 1, 1) });
      const t = fit(tx.title, fonts.regular, 9, 260);
      p.drawText(t, { x: right - fonts.regular.widthOfTextAtSize(t, 9), y: A4[1] - 22, size: 9, font: fonts.regular, color: rgb(1, 1, 1) });
    },
  });

  flow.draw(tx.title, left, { size: 17, bold: true, color: BRAND });
  flow.gap(16);
  const day = `${String(info.date.getUTCDate()).padStart(2, '0')}.${String(info.date.getUTCMonth() + 1).padStart(2, '0')}.${info.date.getUTCFullYear()}`;
  flow.draw(`${info.caseNumber} · ${info.clientName} · ${tx.generated}: ${day}`, left, { size: 9, color: MUTED });
  flow.gap(16);
  flow.para(tx.intro, left, right - left, { size: 9.5 });
  flow.gap(2);
  // legend with a yellow sample box
  flow.need(16);
  flow.page.drawRectangle({ x: left, y: flow.y - 3, width: 18, height: 11, color: HIGHLIGHT });
  flow.para(tx.legend, left + 26, right - left - 26, { size: 9, color: MUTED });
  flow.gap(8);

  for (const section of SECTION_ORDER) {
    const list = rows.filter((r) => r.section === section);
    if (!list.length) continue;
    flow.need(40);
    flow.gap(4);
    const head = SECTION_LABELS[section];
    flow.draw(head.de, left, { size: 11.5, bold: true, color: BRAND });
    if (info.lang !== 'de') flow.draw(sectionHint(section, info.lang), left + fonts.bold.widthOfTextAtSize(head.de, 11.5) + 8, { size: 9, color: MUTED });
    flow.gap(6);
    flow.rule(left, right, BRAND, 0.8);
    flow.gap(13);
    if (section === 'employer' && list.some((r) => r.employerHidden)) {
      flow.para(tx.employerLater, left, right - left, { size: 9, color: MUTED });
      flow.gap(2);
    }
    for (const r of list) {
      const labelLines = wrap(`${r.labelDe}${r.required ? ' *' : ''}`, fonts.bold, 9, labelW);
      const hintLines = info.lang === 'de' ? [] : wrap(r.hint, fonts.regular, 8, labelW);
      const valueLines = r.value ? wrap(r.value, fonts.regular, 10, valueW) : [];
      const height = Math.max(labelLines.length * 12 + hintLines.length * 10, Math.max(valueLines.length, 1) * 13) + 8;
      flow.need(height);
      const top = flow.y;
      let y = top;
      for (const l of labelLines) {
        flow.draw(l, left, { size: 9, bold: true, color: INK, y });
        y -= 12;
      }
      for (const l of hintLines) {
        flow.draw(l, left, { size: 8, color: MUTED, y });
        y -= 10;
      }
      if (r.value) {
        let vy = top;
        for (const l of valueLines) {
          flow.draw(l, valueX, { size: 10, color: INK, y: vy });
          vy -= 13;
        }
      } else if (r.missing) {
        flow.page.drawRectangle({ x: valueX - 3, y: top - 4, width: Math.min(valueW, 190), height: 14, color: HIGHLIGHT });
        flow.draw(`— ${tx.missing}${r.required ? ' *' : ''}`, valueX, { size: 9, color: INK, y: top });
      } else {
        flow.draw('—', valueX, { size: 10, color: MUTED, y: top });
      }
      flow.y = top - height + 8;
      flow.page.drawLine({ start: { x: left, y: flow.y + 2 }, end: { x: right, y: flow.y + 2 }, thickness: 0.3, color: LINE });
      flow.gap(10);
    }
  }

  flow.gap(10);
  flow.need(60);
  flow.para(tx.disclaimer, left, right - left, { size: 9, bold: true, color: BRAND });
  numberPages(flow.pages, fonts, tx.page, right, tx.of);
  return Buffer.from(await pdf.save());
};

export const videxSheetFileName = (caseNumber: string, lang: SheetLang) => `VIDEX-hazirliq-${caseNumber.replace(/[^A-Za-z0-9-]+/g, '-')}-${lang}.pdf`;
