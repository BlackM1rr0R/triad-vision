import fsp from 'node:fs/promises';
import crypto from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { rgb } from 'pdf-lib';
import { prisma } from '../../db.js';
import { config } from '../../config.js';
import { A4, BAND, BRAND, Flow, INK, LINE, MM, MUTED, createDoc, wrap, type Fonts } from '../cv/pdfKit.js';
import { getPublishedGuides, guidesFor, parseFaq, type GuideRow } from '../guides/service.js';
import { SEO_LOCALES, type SeoLocale } from '../seoCatalogue.js';
import { filePath, filesOf, removeFile } from './service.js';

/**
 * The starter e-book "Germany relocation guide 2026": one PDF per site language, built from the published
 * topic guides of that language (English versions fill missing keys), with cover, contents, every guide with
 * its FAQ and a closing page. DejaVu Sans (lib/cv/pdfKit.ts) covers Azerbaijani, Turkish and Cyrillic letters.
 *
 * Idempotent (admin button): the lead magnet `germany-relocation-guide-2026` is created once; running it
 * again rebuilds the generated PDFs (files named "starter-…") and keeps PDFs an admin uploaded by hand, the
 * texts, the cover and the published flag as they are.
 */

export const STARTER_SLUG = 'germany-relocation-guide-2026';

const T: Record<SeoLocale, { title: string; subtitle: string; description: string; contents: string; faq: string; closingTitle: string; closing: string; page: string; disclaimer: string }> = {
  az: {
    title: 'Almaniyaya köç bələdçisi 2026',
    subtitle: 'İmkan Kartı, Mavi Kart, Ausbildung, diplomun tanınması, tibb bacılığı və ailə birləşməsi — bir PDF-də',
    description: 'Almaniyaya iş və təhsil üçün köçmək istəyənlər üçün pulsuz PDF bələdçi: vizalar, tələblər, sənədlər, müddətlər və ailə.',
    contents: 'Mündəricat',
    faq: 'Tez-tez verilən suallar',
    closingTitle: 'Növbəti addım',
    closing: 'Hansı yolun sizə uyğun olduğunu bilmək istəyirsiniz? Pulsuz konsultasiya təyin edin və ya onlayn viza testindən keçin:',
    page: 'Səhifə',
    disclaimer: 'Bu bələdçi ümumi məlumat xarakteri daşıyır və hüquqi məsləhət deyil. Qaydalar və məbləğlər dəyişə bilər.',
  },
  de: {
    title: 'Ratgeber Umzug nach Deutschland 2026',
    subtitle: 'Chancenkarte, Blaue Karte, Ausbildung, Anerkennung, Pflege und Familiennachzug — in einem PDF',
    description: 'Kostenloser PDF-Ratgeber für alle, die zum Arbeiten oder für eine Ausbildung nach Deutschland ziehen: Visa, Voraussetzungen, Unterlagen, Dauer und Familie.',
    contents: 'Inhalt',
    faq: 'Häufige Fragen',
    closingTitle: 'Der nächste Schritt',
    closing: 'Sie möchten wissen, welcher Weg zu Ihnen passt? Buchen Sie eine kostenlose Beratung oder machen Sie den Online-Visum-Check:',
    page: 'Seite',
    disclaimer: 'Dieser Ratgeber dient der allgemeinen Information und ist keine Rechtsberatung. Regeln und Beträge können sich ändern.',
  },
  en: {
    title: 'Germany relocation guide 2026',
    subtitle: 'Opportunity Card, Blue Card, Ausbildung, recognition, nursing and family reunification — in one PDF',
    description: 'Free PDF guide for everyone moving to Germany for work or vocational training: visas, requirements, documents, timelines and family.',
    contents: 'Contents',
    faq: 'Frequently asked questions',
    closingTitle: 'Your next step',
    closing: 'Want to know which route fits you? Book a free consultation or take the online visa check:',
    page: 'Page',
    disclaimer: 'This guide is general information, not legal advice. Rules and amounts may change.',
  },
  ru: {
    title: 'Гид по переезду в Германию 2026',
    subtitle: 'Карта возможностей, Голубая карта, Ausbildung, признание диплома, уход за больными и воссоединение семьи — в одном PDF',
    description: 'Бесплатный PDF-гид для тех, кто переезжает в Германию на работу или учёбу: визы, требования, документы, сроки и семья.',
    contents: 'Содержание',
    faq: 'Частые вопросы',
    closingTitle: 'Следующий шаг',
    closing: 'Хотите узнать, какой путь подходит вам? Запишитесь на бесплатную консультацию или пройдите онлайн-подбор визы:',
    page: 'Страница',
    disclaimer: 'Гид носит общий информационный характер и не является юридической консультацией. Правила и суммы могут меняться.',
  },
  tr: {
    title: 'Almanya\'ya taşınma rehberi 2026',
    subtitle: 'Fırsat Kartı, Mavi Kart, Ausbildung, denklik, hemşirelik ve aile birleşimi — tek bir PDF\'te',
    description: 'Çalışmak veya mesleki eğitim için Almanya\'ya taşınacaklar için ücretsiz PDF rehber: vizeler, şartlar, belgeler, süreler ve aile.',
    contents: 'İçindekiler',
    faq: 'Sıkça sorulan sorular',
    closingTitle: 'Sonraki adım',
    closing: 'Size hangi yolun uygun olduğunu öğrenmek ister misiniz? Ücretsiz danışmanlık alın veya online vize testini yapın:',
    page: 'Sayfa',
    disclaimer: 'Bu rehber genel bilgi amaçlıdır, hukuki danışmanlık değildir. Kurallar ve tutarlar değişebilir.',
  },
  uk: {
    title: 'Посібник із переїзду до Німеччини 2026',
    subtitle: 'Карта можливостей, Блакитна карта, Ausbildung, визнання диплома, догляд і возз’єднання сім’ї — в одному PDF',
    description: 'Безкоштовний PDF-посібник для тих, хто переїжджає до Німеччини на роботу чи навчання: візи, вимоги, документи, терміни та сім’я.',
    contents: 'Зміст',
    faq: 'Часті запитання',
    closingTitle: 'Наступний крок',
    closing: 'Хочете дізнатися, який шлях вам підходить? Запишіться на безкоштовну консультацію або пройдіть онлайн-підбір візи:',
    page: 'Сторінка',
    disclaimer: 'Посібник має загальний інформаційний характер і не є юридичною консультацією. Правила та суми можуть змінюватися.',
  },
};

/** Inline markdown → plain text (links keep their text, emphasis markers dropped). */
const inline = (s: string) =>
  s
    .replace(/\[([^\]]+)\]\(([^)]*)\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();

type Block =
  | { kind: 'h2' | 'h3' | 'p' | 'note'; text: string }
  | { kind: 'ul' | 'ol'; items: string[] }
  | { kind: 'table'; rows: string[][] };

/** Block structure of the guide markdown subset (lib/guides/markdown.ts). */
export const parseBlocks = (md: string): Block[] => {
  const out: Block[] = [];
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ kind: 'p', text: inline(para.join(' ')) });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      flush();
      continue;
    }
    let m: RegExpExecArray | null;
    if ((m = /^(#{2,3})\s+(.*)$/.exec(line))) {
      flush();
      out.push({ kind: m[1].length === 2 ? 'h2' : 'h3', text: inline(m[2]) });
    } else if (line.startsWith('>')) {
      flush();
      out.push({ kind: 'note', text: inline(line.replace(/^>\s?/, '')) });
    } else if (/^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      flush();
      const ordered = /^\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && (ordered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/).test(lines[i])) {
        items.push(inline(lines[i].trim().replace(/^([-*]|\d+\.)\s+/, '')));
        i++;
      }
      i--;
      out.push({ kind: ordered ? 'ol' : 'ul', items });
    } else if (line.startsWith('|')) {
      flush();
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const row = lines[i].trim();
        if (!/^\|?\s*:?-{3,}/.test(row)) rows.push(row.replace(/^\||\|$/g, '').split('|').map((c) => inline(c)));
        i++;
      }
      i--;
      if (rows.length) out.push({ kind: 'table', rows });
    } else para.push(line);
  }
  flush();
  return out;
};

const drawTable = (flow: Flow, fonts: Fonts, rows: string[][], x: number, width: number) => {
  const cols = Math.max(...rows.map((r) => r.length));
  const colW = width / cols;
  const size = 8.5;
  const leading = size * 1.35;
  rows.forEach((row, ri) => {
    const font = ri === 0 ? fonts.bold : fonts.regular;
    const cells = Array.from({ length: cols }, (_, c) => wrap(row[c] ?? '', font, size, colW - 8));
    const h = Math.max(...cells.map((l) => l.length)) * leading + 6;
    flow.need(h + 2);
    const top = flow.y + size;
    if (ri === 0) flow.page.drawRectangle({ x, y: top - h, width, height: h, color: BAND });
    cells.forEach((lines, c) => {
      lines.forEach((l, li) => {
        if (l) flow.page.drawText(l, { x: x + c * colW + 4, y: flow.y - 2 - li * leading, size, font, color: INK });
      });
    });
    flow.page.drawLine({ start: { x, y: top - h }, end: { x: x + width, y: top - h }, thickness: 0.5, color: LINE });
    flow.y -= h;
  });
  flow.gap(10);
};

/** One language's PDF. */
export const renderStarterEbook = async (lng: SeoLocale, guides: GuideRow[], now = new Date()): Promise<Buffer> => {
  const t = T[lng];
  const { pdf, fonts } = await createDoc({ title: t.title, author: 'Triad Vision', subject: t.description, lang: lng });
  pdf.setCreator('Triad Vision');
  const [W, H] = A4;
  const left = 20 * MM;
  const width = W - 40 * MM;
  const site = new URL(config.clientUrl).origin.includes('localhost') ? 'https://triad-vision.de' : new URL(config.clientUrl).origin;
  const prefix = lng === 'az' ? '' : `/${lng}`;

  // Cover
  const cover = pdf.addPage(A4);
  cover.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(0.043, 0.122, 0.267) });
  cover.drawRectangle({ x: 0, y: H * 0.38, width: W, height: 4, color: rgb(0.082, 0.396, 0.91) });
  cover.drawText('TRIAD VISION', { x: left, y: H - 30 * MM, size: 16, font: fonts.bold, color: rgb(1, 1, 1) });
  cover.drawText('PEOPLE · WORK · OPPORTUNITIES', { x: left, y: H - 36 * MM, size: 7, font: fonts.regular, color: rgb(0.75, 0.8, 0.9) });
  let cy = H * 0.62;
  for (const line of wrap(t.title, fonts.bold, 30, width)) {
    cover.drawText(line, { x: left, y: cy, size: 30, font: fonts.bold, color: rgb(1, 1, 1) });
    cy -= 38;
  }
  cy -= 6;
  for (const line of wrap(t.subtitle, fonts.regular, 13, width)) {
    cover.drawText(line, { x: left, y: cy, size: 13, font: fonts.regular, color: rgb(0.82, 0.86, 0.94) });
    cy -= 19;
  }
  cover.drawText(`${site.replace(/^https?:\/\//, '')} · ${now.getFullYear()}`, { x: left, y: 22 * MM, size: 10, font: fonts.regular, color: rgb(0.75, 0.8, 0.9) });

  const flow = new Flow(pdf, fonts, {
    top: H - 22 * MM,
    bottom: 22 * MM,
    onNewPage: (p) => {
      p.drawText(t.title, { x: left, y: H - 12 * MM, size: 7.5, font: fonts.regular, color: MUTED });
      p.drawLine({ start: { x: left, y: H - 14 * MM }, end: { x: W - left, y: H - 14 * MM }, thickness: 0.4, color: LINE });
    },
  });

  // Contents
  flow.para(t.contents, left, width, { size: 18, bold: true, color: BRAND });
  flow.gap(8);
  guides.forEach((g, i) => {
    flow.para(`${i + 1}. ${g.title}`, left, width, { size: 11.5, bold: true });
    flow.para(g.description, left + 14, width - 14, { size: 9.5, color: MUTED });
    flow.gap(6);
  });

  // Guides
  guides.forEach((g, i) => {
    flow.newPage();
    flow.para(`${i + 1}. ${g.title}`, left, width, { size: 18, bold: true, color: BRAND, leading: 23 });
    flow.gap(2);
    flow.para(g.description, left, width, { size: 10.5, color: MUTED });
    flow.gap(10);
    for (const b of parseBlocks(g.body)) {
      switch (b.kind) {
        case 'h2':
          flow.gap(8);
          flow.need(40);
          flow.para(b.text, left, width, { size: 13.5, bold: true, color: BRAND, leading: 18 });
          flow.gap(3);
          break;
        case 'h3':
          flow.gap(4);
          flow.need(30);
          flow.para(b.text, left, width, { size: 11, bold: true, leading: 15 });
          break;
        case 'p':
          flow.para(b.text, left, width, { size: 10, leading: 14 });
          flow.gap(5);
          break;
        case 'note': {
          flow.need(24);
          const top = flow.y + 12;
          const lines = flow.para(b.text, left + 10, width - 14, { size: 9.5, color: MUTED, leading: 13 });
          flow.page.drawLine({ start: { x: left + 2, y: top }, end: { x: left + 2, y: Math.max(flow.y + 8, top - lines * 13) }, thickness: 2, color: BRAND });
          flow.gap(6);
          break;
        }
        case 'ul':
          for (const it of b.items) flow.bullet(it, left + 4, width - 4, { size: 10 });
          flow.gap(5);
          break;
        case 'ol':
          b.items.forEach((it, n) => {
            const lines = wrap(it, fonts.regular, 10, width - 20);
            lines.forEach((l, li) => {
              flow.need(14);
              if (li === 0) flow.draw(`${n + 1}.`, left + 4, { size: 10, bold: true });
              flow.draw(l, left + 20, { size: 10 });
              flow.y -= 14;
            });
          });
          flow.gap(5);
          break;
        case 'table':
          drawTable(flow, fonts, b.rows, left, width);
          break;
      }
    }
    const faq = parseFaq(g.faq);
    if (faq.length) {
      flow.gap(8);
      flow.need(40);
      flow.para(t.faq, left, width, { size: 13.5, bold: true, color: BRAND, leading: 18 });
      flow.gap(3);
      for (const f of faq) {
        flow.need(30);
        flow.para(f.q, left, width, { size: 10.5, bold: true, leading: 14 });
        flow.para(f.a, left, width, { size: 10, leading: 14 });
        flow.gap(5);
      }
    }
  });

  // Closing page
  flow.newPage();
  flow.para(t.closingTitle, left, width, { size: 18, bold: true, color: BRAND });
  flow.gap(6);
  flow.para(t.closing, left, width, { size: 11, leading: 16 });
  flow.gap(6);
  for (const p of ['/booking', '/eligibility', '/compare-visas', '/guides']) flow.bullet(`${site}${prefix}${p}`, left + 4, width - 4, { size: 11, color: BRAND });
  flow.gap(18);
  flow.para(t.disclaimer, left, width, { size: 8.5, color: MUTED });
  flow.para(`© ${now.getFullYear()} Triad Vision`, left, width, { size: 8.5, color: MUTED });

  // Page numbers (the cover has none).
  const pages = pdf.getPages();
  pages.slice(1).forEach((p, i) => {
    const label = `${t.page} ${i + 2} / ${pages.length}`;
    p.drawText(label, { x: W - left - fonts.regular.widthOfTextAtSize(label, 8), y: 12 * MM, size: 8, font: fonts.regular, color: MUTED });
  });
  return Buffer.from(await pdf.save());
};

/**
 * Creates or refreshes the starter lead magnet (see the module comment). Returns the magnet and the
 * languages whose PDF was (re)generated.
 */
export const generateStarterEbook = async (now = new Date()) => {
  const all = await getPublishedGuides();
  const existing = await prisma.leadMagnet.findUnique({ where: { slug: STARTER_SLUG } });
  const files = filesOf(existing?.files);
  const generated: SeoLocale[] = [];
  const stale: string[] = [];
  for (const lng of SEO_LOCALES) {
    const current = files[lng];
    if (current && !current.startsWith('starter-')) continue; // uploaded by an admin: keep
    const guides = guidesFor(all, lng);
    if (!guides.length) continue;
    const bytes = await renderStarterEbook(lng, guides, now);
    const key = `starter-${lng}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.pdf`;
    await fsp.writeFile(filePath(key), bytes);
    if (current) stale.push(current);
    files[lng] = key;
    generated.push(lng);
  }
  const l10n = (k: 'title' | 'description') => Object.fromEntries(SEO_LOCALES.map((l) => [l, T[l][k]]));
  const magnet = existing
    ? await prisma.leadMagnet.update({ where: { id: existing.id }, data: { files: files as Prisma.InputJsonValue } })
    : await prisma.leadMagnet.create({
        data: { slug: STARTER_SLUG, title: l10n('title'), description: l10n('description'), files: files as Prisma.InputJsonValue, published: true },
      });
  for (const key of stale) await removeFile(key);
  return { magnet, generated };
};
