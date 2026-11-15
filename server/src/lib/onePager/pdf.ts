import QRCode from 'qrcode';
import { rgb, type PDFFont } from 'pdf-lib';
import { config } from '../../config.js';
import { A4, BAND, BRAND, INK, LINE, MUTED, clean, createDoc, fit, wrap } from '../cv/pdfKit.js';
import type { PoolCard } from '../pool/anonymous.js';
import type { PanelRow } from '../employerWorkers/panel.js';
import { PANEL_TEXTS, type Loc } from '../employerWorkers/texts.js';
import { STAGE_TEXT } from '../requests/workers.js';
import { ONE_PAGER_TEXTS, REGION_NAMES } from './texts.js';

/**
 * Candidate one-pager for employers (company portal → candidate pool profile, "My workers" drawer, pipeline):
 * one designed A4 page.
 *
 *   - Pool candidate: ONLY the anonymous fields the pool already exposes — pseudonymous code, profession(s),
 *     experience, German level, driving licences, recognition status, regions, earliest start — plus a QR code
 *     to the profile in the portal. Built from PoolCard (lib/pool/anonymous whitelist); not even the free-text
 *     summary or skills are printed.
 *   - The company's own worker: only what the workers panel (lib/employerWorkers/panel) already shows them
 *     (anonymised name "Ali M.", position, profession, visa, phase, stage and the panel's dates).
 *
 * "Prepared for <company>" header is optional. No AI; DejaVu Sans via the CV toolkit.
 */

const AMBER = rgb(0.91, 0.64, 0.09);
const [W, H] = A4;

export interface OnePagerInput {
  locale: Loc;
  kind: 'pool' | 'worker';
  title: string;
  subtitle: string | null;
  rows: { label: string; value: string }[];
  qrUrl: string | null;
  preparedFor: string | null;
  now?: Date;
}

const fmtDate = (d: Date | string | null | undefined, locale: Loc) => {
  if (!d) return null;
  const date = typeof d === 'string' ? new Date(`${d.slice(0, 10)}T12:00:00Z`) : d;
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat({ az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' }[locale], { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' }).format(date);
};

export const onePagerPdf = async (input: OnePagerInput) => {
  const T = ONE_PAGER_TEXTS[input.locale];
  const kicker = input.kind === 'pool' ? T.poolKicker : T.workerKicker;
  const { pdf, fonts } = await createDoc({ title: `${kicker} · ${input.title}`, author: 'Triad Vision', subject: kicker, lang: input.locale });
  pdf.setCreator('Triad Vision');
  const page = pdf.addPage([W, H]);
  const text = (s: string, x: number, y: number, size: number, font: PDFFont, color = INK) => page.drawText(clean(s), { x, y, size, font, color });

  // Header band.
  page.drawRectangle({ x: 0, y: H - 118, width: W, height: 118, color: BRAND });
  page.drawRectangle({ x: 0, y: H - 122, width: W, height: 4, color: AMBER });
  const bars = [rgb(0, 0.71, 0.89), rgb(0.94, 0.2, 0.25), rgb(0.31, 0.62, 0.18), rgb(1, 0.81, 0)];
  bars.forEach((c, i) => page.drawRectangle({ x: 48 + i * 6.5, y: H - 58, width: 5, height: 16, color: c }));
  text('TRIAD VISION', 80, H - 55, 13, fonts.bold, rgb(1, 1, 1));
  text(kicker.toLocaleUpperCase(input.locale), 48, H - 88, 9, fonts.bold, AMBER);
  if (input.preparedFor) {
    const p = fit(clean(T.preparedFor(input.preparedFor)), fonts.regular, 10, 260);
    page.drawText(p, { x: W - 48 - fonts.regular.widthOfTextAtSize(p, 10), y: H - 55, size: 10, font: fonts.regular, color: rgb(0.85, 0.89, 0.95) });
  }
  const gen = clean(T.generated(fmtDate(input.now ?? new Date(), input.locale) ?? ''));
  page.drawText(gen, { x: W - 48 - fonts.regular.widthOfTextAtSize(gen, 9), y: H - 88, size: 9, font: fonts.regular, color: rgb(0.75, 0.8, 0.88) });

  // Title.
  let y = H - 172;
  let titleSize = 28;
  while (titleSize > 16 && fonts.bold.widthOfTextAtSize(clean(input.title), titleSize) > W - 96) titleSize -= 2;
  text(input.title, 48, y, titleSize, fonts.bold, INK);
  y -= 24;
  if (input.subtitle) {
    for (const line of wrap(clean(input.subtitle), fonts.regular, 14, W - 96).slice(0, 2)) {
      text(line, 48, y, 14, fonts.regular, BRAND);
      y -= 19;
    }
  }
  y -= 14;

  // Facts table.
  const labelW = 190;
  const valueW = W - 96 - labelW - 24;
  input.rows.forEach((r, i) => {
    const lines = wrap(clean(r.value), fonts.bold, 11, valueW).slice(0, 3);
    const h = Math.max(30, 14 + lines.length * 15);
    if (i % 2 === 0) page.drawRectangle({ x: 40, y: y - h + 10, width: W - 80, height: h, color: BAND });
    text(r.label, 52, y - 8, 9.5, fonts.regular, MUTED);
    lines.forEach((l, j) => text(l, 52 + labelW, y - 8 - j * 15, 11, fonts.bold, INK));
    y -= h;
  });
  page.drawLine({ start: { x: 40, y: y + 8 }, end: { x: W - 40, y: y + 8 }, thickness: 0.6, color: LINE });

  // QR + note.
  const noteY = 70;
  if (input.qrUrl) {
    const qs = 92;
    const qr = await pdf.embedPng(await QRCode.toBuffer(input.qrUrl, { type: 'png', errorCorrectionLevel: 'M', margin: 1, width: 360 }));
    page.drawImage(qr, { x: W - 48 - qs, y: noteY + 30, width: qs, height: qs });
    const label = clean(input.kind === 'pool' ? T.qrPool : T.qrWorker);
    const lines = wrap(label, fonts.bold, 9, 200);
    lines.forEach((l, i) => page.drawText(l, { x: W - 48 - qs - 14 - fonts.bold.widthOfTextAtSize(l, 9), y: noteY + 106 - i * 12, size: 9, font: fonts.bold, color: MUTED }));
    const link = fit(input.qrUrl.replace(/^https?:\/\//, ''), fonts.regular, 7.5, 220);
    page.drawText(link, { x: W - 48 - qs - 14 - fonts.regular.widthOfTextAtSize(link, 7.5), y: noteY + 106 - lines.length * 12 - 2, size: 7.5, font: fonts.regular, color: BRAND });
  }
  const note = wrap(clean(input.kind === 'pool' ? T.notePool : T.noteWorker), fonts.regular, 8.5, W - 96);
  note.forEach((l, i) => text(l, 48, noteY - i * 11, 8.5, fonts.regular, MUTED));
  page.drawRectangle({ x: 0, y: 0, width: W, height: 10, color: BRAND });
  return Buffer.from(await pdf.save());
};

// ─── Builders ───────────────────────────────────────────────────────────

/** Pool candidate: only the anonymous card fields listed in the brief (no summary, skills, languages). */
export const poolOnePagerInput = (card: PoolCard, locale: Loc, preparedFor: string | null): OnePagerInput => {
  const T = ONE_PAGER_TEXTS[locale];
  const rows: OnePagerInput['rows'] = [
    { label: T.label.code, value: card.code },
    { label: T.label.professions, value: card.professions.join(', ') || T.none },
    { label: T.label.experience, value: card.experienceYears !== null ? T.years(card.experienceYears) : T.none },
    { label: T.label.germanLevel, value: card.germanLevel ? (card.germanLevel === 'none' ? T.germanNone : card.germanLevel) : T.none },
    { label: T.label.licences, value: card.drivingLicences.join(', ') || T.none },
    { label: T.label.recognition, value: T.recognition[card.recognitionStatus] ?? card.recognitionStatus },
    { label: T.label.regions, value: card.regions.length ? card.regions.map((r) => (r === 'ANY' ? T.anyRegion : (REGION_NAMES[r] ?? r))).join(', ') : T.anyRegion },
    { label: T.label.earliestStart, value: fmtDate(card.earliestStart, locale) ?? (card.availability === 'IMMEDIATE' ? T.immediately : T.none) },
  ];
  return {
    locale,
    kind: 'pool',
    title: card.code,
    subtitle: card.professions[0] ?? null,
    rows,
    qrUrl: `${config.clientUrl.replace(/\/+$/, '')}/company/candidates/pool/${encodeURIComponent(card.code)}`,
    preparedFor,
  };
};

const l10n = (v: unknown, lang: Loc) => {
  if (!v || typeof v !== 'object') return typeof v === 'string' ? v : '';
  const o = v as Record<string, string>;
  return o[lang] || o.de || o.en || o.az || '';
};

/** The company's own worker: the fields of the workers panel row (already anonymised there). */
export const workerOnePagerInput = (row: PanelRow, locale: Loc, preparedFor: string | null): OnePagerInput => {
  const T = ONE_PAGER_TEXTS[locale];
  const P = PANEL_TEXTS[locale];
  const visa = row.visa ? [row.visa.visaLabel, l10n(row.visa.title, locale)].filter(Boolean).join(' · ') : '';
  const arrival = row.arrivedAt ?? row.arrival?.arrivalTime ?? row.arrival?.flightDate ?? null;
  const nextDate = row.next ? (row.next.at ? fmtDate(row.next.at, locale) : row.next.from && row.next.to ? `${fmtDate(row.next.from, locale)} – ${fmtDate(row.next.to, locale)}` : null) : null;
  const rows: OnePagerInput['rows'] = [];
  const add = (label: string, value: string | null | undefined) => {
    if (value && value.trim()) rows.push({ label, value });
  };
  add(T.label.name, row.name);
  add(T.label.position, row.position);
  add(T.label.profession, row.profession);
  add(T.label.visa, visa);
  add(T.label.phase, P.phase[row.phase]);
  add(T.label.stage, STAGE_TEXT[locale][row.stage]);
  add(T.label.started, fmtDate(row.startedAt, locale));
  add(T.label.arrival, fmtDate(arrival, locale));
  add(T.label.contractStart, fmtDate(row.contractStart, locale));
  add(T.label.probationEnd, fmtDate(row.probation?.endsAt, locale));
  add(T.label.titleValid, row.title ? `${fmtDate(row.title.validUntil, locale)} (${P.title[row.title.kind]})` : null);
  add(T.label.next, row.next ? [P.milestone[row.next.code], nextDate].filter(Boolean).join(' · ') : null);
  add(T.label.manager, row.manager?.name ?? null);
  return {
    locale,
    kind: 'worker',
    title: row.name,
    subtitle: row.position && row.position !== row.profession ? `${row.position} · ${row.profession}` : row.profession,
    rows,
    qrUrl: `${config.clientUrl.replace(/\/+$/, '')}/company/workers?worker=${encodeURIComponent(row.id)}`,
    preparedFor,
  };
};
