import { rgb } from 'pdf-lib';
import { A4, BAND, BRAND, Flow, LINE, MUTED, createDoc, fit, numberPages } from '../cv/pdfKit.js';
import { delta, KPI_KEYS, type KpiKey, type Kpis } from './kpis.js';
import { L, type L10n, type Lang } from '../reports/types.js';

/** Weekly management report as an A4 PDF: KPI boxes with week-over-week deltas and a two-bar comparison per KPI. */
const M = 50;
const RIGHT = A4[0] - M;
const GREY = rgb(0.72, 0.75, 0.8);
const GREEN = rgb(0.02, 0.47, 0.34);
const RED = rgb(0.72, 0.11, 0.11);

export const WEEKLY_TEXT = {
  title: L('Həftəlik hesabat', 'Wochenbericht', 'Weekly report', 'Недельный отчёт'),
  week: L('Səhifə', 'Seite', 'Page', 'Стр.'),
  vsPrev: L('əvvəlki həftə ilə müqayisə', 'im Vergleich zur Vorwoche', 'compared with the previous week', 'по сравнению с прошлой неделей'),
  thisWeek: L('Bu həftə', 'Diese Woche', 'This week', 'Эта неделя'),
  prevWeek: L('Əvvəlki həftə', 'Vorwoche', 'Previous week', 'Прошлая неделя'),
  note: L(
    'Rəqəmlər bazadakı hadisələrdən hesablanır (Berlin vaxtı, bazar ertəsi - bazar).',
    'Die Zahlen stammen aus den Ereignissen in der Datenbank (Europe/Berlin, Montag bis Sonntag).',
    'Figures come from events in the database (Europe/Berlin, Monday to Sunday).',
    'Цифры рассчитаны по событиям в базе (Europe/Berlin, с понедельника по воскресенье).',
  ),
  kpi: {
    registrations: L('Yeni qeydiyyatlar', 'Neue Registrierungen', 'New registrations', 'Новые регистрации'),
    cases: L('Yeni müraciətlər', 'Neue Anträge', 'New cases', 'Новые заявки'),
    documents: L('Yoxlanılan sənədlər', 'Geprüfte Dokumente', 'Documents reviewed', 'Проверено документов'),
    contracts: L('İmzalanan müqavilələr', 'Unterzeichnete Verträge', 'Contracts signed', 'Подписано договоров'),
    visas: L('Təsdiqlənən vizalar', 'Erteilte Visa', 'Visas approved', 'Одобрено виз'),
    revenueCents: L('Gəlir (ödənmiş qaimələr, EUR)', 'Umsatz (bezahlte Rechnungen, EUR)', 'Revenue (paid invoices, EUR)', 'Выручка (оплаченные счета, EUR)'),
  } as Record<KpiKey, L10n>,
  subject: L('Həftəlik hesabat', 'Wochenbericht', 'Weekly report', 'Недельный отчёт'),
  body: L(
    'Əlavədə keçən həftənin əsas göstəriciləri var (PDF).',
    'Im Anhang finden Sie die wichtigsten Kennzahlen der letzten Woche (PDF).',
    'Attached are last week key figures (PDF).',
    'Во вложении основные показатели прошлой недели (PDF).',
  ),
};

const fmt = (key: KpiKey, n: number) => (key === 'revenueCents' ? (n / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(n));

export const fmtDelta = (cur: number, prev: number) => {
  const d = delta(cur, prev);
  const sign = d.diff > 0 ? '+' : '';
  return `${sign}${d.diff}${d.percent !== null ? ` (${sign}${String(d.percent).replace('.', ',')} %)` : ''}`;
};

export const buildWeeklyReportPdf = async (input: { weekKey: string; start: Date; end: Date; current: Kpis; previous: Kpis; lang: Lang; brandName: string }) => {
  const T = WEEKLY_TEXT;
  const { lang } = input;
  const title = `${T.title[lang]} · ${input.weekKey}`;
  const { pdf, fonts } = await createDoc({ title, author: input.brandName, lang });
  const flow = new Flow(pdf, fonts, {
    top: A4[1] - 70,
    bottom: 60,
    onNewPage: (page) => page.drawRectangle({ x: 0, y: A4[1] - 10, width: A4[0], height: 10, color: BRAND }),
  });
  const day = (d: Date) => new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  flow.draw(input.brandName, M, { size: 13, bold: true, color: BRAND });
  flow.gap(40);
  flow.para(title, M, RIGHT - M, { size: 22, bold: true, leading: 28 });
  flow.gap(2);
  flow.draw(`${day(input.start)} - ${day(new Date(input.end.getTime() - 60 * 60 * 1000))}  ·  ${T.vsPrev[lang]}`, M, { size: 10, color: MUTED });
  flow.gap(28);

  const boxW = (RIGHT - M - 2 * 12) / 3;
  const boxH = 70;
  const top = flow.y + 8;
  KPI_KEYS.forEach((k, i) => {
    const row = Math.floor(i / 3);
    const x = M + (i % 3) * (boxW + 12);
    const y = top - row * (boxH + 12);
    const d = delta(input.current[k], input.previous[k]);
    flow.page.drawRectangle({ x, y: y - boxH, width: boxW, height: boxH, color: BAND });
    flow.page.drawText(fit(fmt(k, input.current[k]), fonts.bold, 22, boxW - 20), { x: x + 10, y: y - 30, size: 22, font: fonts.bold });
    flow.page.drawText(fit(T.kpi[k][lang], fonts.regular, 8, boxW - 20), { x: x + 10, y: y - 46, size: 8, font: fonts.regular, color: MUTED });
    flow.page.drawText(fit(fmtDelta(input.current[k], input.previous[k]), fonts.bold, 9, boxW - 20), { x: x + 10, y: y - 60, size: 9, font: fonts.bold, color: d.diff >= 0 ? GREEN : RED });
  });
  flow.y = top - 2 * (boxH + 12) - 14;

  flow.draw(`${T.thisWeek[lang]} / ${T.prevWeek[lang]}`, M, { size: 12, bold: true, color: BRAND });
  flow.gap(8);
  flow.rule(M, RIGHT, LINE, 0.6);
  flow.gap(18);
  const labelW = 190;
  const barW = RIGHT - M - labelW - 60;
  for (const k of KPI_KEYS) {
    const max = Math.max(1, input.current[k], input.previous[k]);
    flow.need(44);
    flow.draw(fit(T.kpi[k][lang], fonts.regular, 9, labelW - 8), M, { size: 9 });
    const bars: [number, typeof BRAND][] = [
      [input.current[k], BRAND],
      [input.previous[k], GREY],
    ];
    for (const [n, color] of bars) {
      const w = Math.max(2, (n / max) * barW);
      flow.page.drawRectangle({ x: M + labelW, y: flow.y - 2, width: w, height: 9, color });
      flow.draw(fmt(k, n), M + labelW + w + 5, { size: 8, bold: color === BRAND });
      flow.gap(12);
    }
    flow.gap(8);
  }
  flow.gap(6);
  flow.para(T.note[lang], M, RIGHT - M, { size: 8.5, color: MUTED });
  for (const p of flow.pages) p.drawText(fit(input.brandName, fonts.regular, 8, 360), { x: M, y: 24, size: 8, font: fonts.regular, color: MUTED });
  numberPages(flow.pages, fonts, T.week[lang], RIGHT, '/');
  return Buffer.from(await pdf.save());
};
