import { A4, BAND, BRAND, Flow, INK, LINE, MM, MUTED, createDoc, embedImage, fit, numberPages, wrap } from '../cv/pdfKit.js';
import { loadLetterhead } from '../docCreate/letterhead.js';
import { ACTION_LABEL, KIND_LABEL, type OriginalAction } from './constants.js';

/**
 * Hand-over act (Qəbul-təhvil aktı / Übergabeprotokoll) as a bilingual PDF (Azerbaijani + German):
 * the two parties, date, the list of originals, condition notes and signature lines — with the PNG
 * signatures from the signature pad embedded when they were given.
 */

export interface ActItem {
  kind: string;
  title: string;
  note?: string | null;
}

export interface ActInput {
  number: string;
  action: OriginalAction;
  at: Date;
  caseNumber: string;
  client: { name: string; passportNumber?: string | null; phone?: string | null; email?: string | null };
  /** Who receives the originals when they are given out (translator, authority, colleague). */
  holder?: string | null;
  staffName: string;
  items: ActItem[];
  condition?: string | null;
  signatures?: { client?: Buffer | null; staff?: Buffer | null };
}

const MARGIN = 18 * MM;
const W = A4[0] - 2 * MARGIN;

const fmtDate = (d: Date) =>
  new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Baku' }).format(d) + ' (Bakı / GMT+4)';

const SUBTITLE: Partial<Record<OriginalAction, { az: string; de: string }>> = {
  RECEIVED: { az: 'Orijinal sənədlərin müştəridən qəbulu', de: 'Entgegennahme von Originaldokumenten vom Kunden' },
  GIVEN_OUT: { az: 'Orijinal sənədlərin təhvil verilməsi', de: 'Aushändigung von Originaldokumenten' },
  RETURNED_TO_CLIENT: { az: 'Orijinal sənədlərin müştəriyə qaytarılması', de: 'Rückgabe von Originaldokumenten an den Kunden' },
};

export const buildActPdf = async (input: ActInput): Promise<Buffer> => {
  const head = await loadLetterhead();
  const { pdf, fonts } = await createDoc({ title: `Übergabeprotokoll ${input.number}`, author: head.name, subject: 'Qəbul-təhvil aktı / Übergabeprotokoll', lang: 'de-DE' });
  const flow = new Flow(pdf, fonts, { top: A4[1] - MARGIN, bottom: MARGIN + 10 });

  // Letterhead
  flow.draw(head.name, MARGIN, { size: 13, bold: true, color: BRAND });
  const right = [...head.lines, ...head.contact];
  right.forEach((line, i) => {
    const t = fit(line, fonts.regular, 8, W / 2);
    flow.page.drawText(t, { x: A4[0] - MARGIN - fonts.regular.widthOfTextAtSize(t, 8), y: flow.y - i * 10, size: 8, font: fonts.regular, color: MUTED });
  });
  flow.gap(Math.max(26, right.length * 10 + 8));
  flow.rule(MARGIN, A4[0] - MARGIN, BRAND, 1);
  flow.gap(26);

  // Title
  flow.draw('QƏBUL-TƏHVİL AKTI', MARGIN, { size: 16, bold: true, color: INK });
  flow.gap(18);
  flow.draw('ÜBERGABEPROTOKOLL', MARGIN, { size: 12, bold: true, color: MUTED });
  flow.gap(16);
  const sub = SUBTITLE[input.action] ?? ACTION_LABEL[input.action];
  flow.para(`${sub.az} / ${sub.de}`, MARGIN, W, { size: 10, color: INK });
  flow.gap(4);
  flow.para(`№ ${input.number}  ·  Müraciət / Antrag: ${input.caseNumber}`, MARGIN, W, { size: 9, color: MUTED });
  flow.para(`Tarix / Datum: ${fmtDate(input.at)}`, MARGIN, W, { size: 9, color: MUTED });
  flow.gap(10);

  // Parties
  const office = { title: head.name, lines: [...head.lines, ...head.contact].slice(0, 4) };
  const clientLines = [
    input.client.passportNumber ? `Pasport / Reisepass: ${input.client.passportNumber}` : '',
    input.client.phone ?? '',
    input.client.email ?? '',
  ].filter(Boolean);
  const officeParty = { title: office.title, lines: [`Əməkdaş / Mitarbeiter(in): ${input.staffName}`, ...office.lines] };
  const clientParty = { title: input.client.name, lines: clientLines };
  const holderParty = { title: input.holder || '—', lines: ['Qəbul edən şəxs / Empfänger(in)'] };
  const [giver, taker] =
    input.action === 'RECEIVED' ? [clientParty, officeParty] : input.action === 'GIVEN_OUT' ? [officeParty, holderParty] : [officeParty, clientParty];

  const colW = (W - 12) / 2;
  const partyBox = (x: number, label: string, party: { title: string; lines: string[] }) => {
    let y = flow.y;
    flow.page.drawText(label, { x, y, size: 8, font: fonts.bold, color: MUTED });
    y -= 14;
    for (const l of wrap(party.title, fonts.bold, 10.5, colW)) {
      flow.page.drawText(l, { x, y, size: 10.5, font: fonts.bold, color: INK });
      y -= 13;
    }
    for (const line of party.lines) {
      for (const l of wrap(line, fonts.regular, 8.5, colW)) {
        flow.page.drawText(l, { x, y, size: 8.5, font: fonts.regular, color: INK });
        y -= 11;
      }
    }
    return flow.y - y;
  };
  flow.need(90);
  const h1 = partyBox(MARGIN, 'TƏHVİL VERƏN / ÜBERGEBENDE(R)', giver);
  const h2 = partyBox(MARGIN + colW + 12, 'QƏBUL EDƏN / EMPFÄNGER(IN)', taker);
  flow.gap(Math.max(h1, h2) + 10);

  // Items table
  const cols = [
    { label: '№', w: 22 },
    { label: 'Növ / Art', w: 120 },
    { label: 'Ad / Bezeichnung', w: 190 },
    { label: 'Qeyd / Vermerk', w: W - 22 - 120 - 190 },
  ];
  const drawHeader = () => {
    flow.need(40);
    flow.page.drawRectangle({ x: MARGIN, y: flow.y - 5, width: W, height: 18, color: BAND });
    let x = MARGIN + 4;
    for (const c of cols) {
      flow.page.drawText(c.label, { x, y: flow.y, size: 8, font: fonts.bold, color: BRAND });
      x += c.w;
    }
    flow.gap(18);
  };
  drawHeader();
  input.items.forEach((it, i) => {
    const kind = KIND_LABEL[it.kind] ?? KIND_LABEL.OTHER;
    const cells = [String(i + 1), `${kind.az} / ${kind.de}`, it.title, it.note ?? ''];
    const wrapped = cells.map((c, k) => wrap(c, fonts.regular, 9, cols[k].w - 8));
    const lines = Math.max(1, ...wrapped.map((w) => w.length));
    const h = lines * 11 + 6;
    if (flow.y - h < flow.opts.bottom) {
      flow.newPage();
      drawHeader();
    }
    let x = MARGIN + 4;
    wrapped.forEach((ls, k) => {
      ls.forEach((l, j) => flow.page.drawText(l, { x, y: flow.y - j * 11, size: 9, font: fonts.regular, color: INK }));
      x += cols[k].w;
    });
    flow.gap(h - 6);
    flow.rule(MARGIN, A4[0] - MARGIN, LINE, 0.5);
    flow.gap(12);
  });
  flow.para(`Cəmi / Gesamt: ${input.items.length}`, MARGIN, W, { size: 9, bold: true });
  flow.gap(6);

  // Condition
  flow.need(40);
  flow.draw('Vəziyyət barədə qeydlər / Zustand und Vermerke', MARGIN, { size: 9, bold: true, color: BRAND });
  flow.gap(13);
  flow.para(input.condition?.trim() || 'Sənədlər zahiri baxışda zədəsizdir. / Die Dokumente sind äußerlich unbeschädigt.', MARGIN, W, { size: 9 });
  flow.gap(6);
  flow.para(
    'Tərəflər yuxarıda göstərilən orijinal sənədlərin təhvil verildiyini və qəbul edildiyini təsdiq edirlər. / Die Parteien bestätigen die Übergabe und den Empfang der oben aufgeführten Originaldokumente.',
    MARGIN,
    W,
    { size: 8.5, color: MUTED },
  );
  flow.gap(18);

  // Signatures
  flow.need(110);
  const sigW = (W - 30) / 2;
  const sigTop = flow.y;
  const sigBlock = async (x: number, label: string, name: string, png?: Buffer | null) => {
    const img = await embedImage(pdf, png ?? null);
    const lineY = sigTop - 60;
    if (img) {
      const s = Math.min(sigW / img.width, 52 / img.height);
      flow.page.drawImage(img, { x, y: lineY + 3, width: img.width * s, height: img.height * s });
    }
    flow.page.drawLine({ start: { x, y: lineY }, end: { x: x + sigW, y: lineY }, thickness: 0.7, color: INK });
    flow.page.drawText(label, { x, y: lineY - 12, size: 8, font: fonts.bold, color: MUTED });
    flow.page.drawText(fit(name, fonts.regular, 9, sigW), { x, y: lineY - 24, size: 9, font: fonts.regular, color: INK });
  };
  await sigBlock(MARGIN, 'Təhvil verən / Übergebende(r)', giver.title, input.action === 'RECEIVED' ? input.signatures?.client : input.signatures?.staff);
  await sigBlock(MARGIN + sigW + 30, 'Qəbul edən / Empfänger(in)', taker.title, input.action === 'RECEIVED' ? input.signatures?.staff : input.action === 'RETURNED_TO_CLIENT' ? input.signatures?.client : null);
  flow.y = sigTop - 96;
  numberPages(flow.pages, fonts, 'Səhifə / Seite', A4[0] - MARGIN, '/');
  return Buffer.from(await pdf.save());
};
