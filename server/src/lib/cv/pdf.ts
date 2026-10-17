import type { PDFImage } from 'pdf-lib';
import type { CvData, CvLang, CvTemplate } from './schema.js';
import { BAND, BRAND, Flow, INK, LINE, MUTED, createDoc, drawPhoto, embedImage, fit, numberPages, wrap, type Fonts } from './pdfKit.js';
import { CV_LABELS, ageOn, byNewest, fmtDate, fmtRange, languageName, levelLabel, nationalityLabel, type CvLabels } from './texts.js';

/**
 * CV PDFs: the classic German tabular "Lebenslauf" and a Europass-style two-column layout. Both can be
 * rendered anonymised for employers (first name + initial, no contact data, birth year only, no photo).
 */

export interface CvPerson {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  birthDate: Date | null;
  nationality: string | null;
}

export interface RenderCvInput {
  person: CvPerson;
  cv: CvData;
  template: CvTemplate;
  lang: CvLang;
  photo?: Buffer | null;
  anonymised?: boolean;
  now?: Date;
}

interface PersonView {
  name: string;
  rows: [string, string][];
  place: string;
}

const anonName = (p: CvPerson) => `${p.firstName.trim()}${p.lastName.trim() ? ` ${p.lastName.trim()[0].toUpperCase()}.` : ''}`;

const personView = (p: CvPerson, lang: CvLang, anonymised: boolean, now: Date): PersonView => {
  const L = CV_LABELS[lang];
  const rows: [string, string][] = [];
  const nationality = nationalityLabel(p.nationality, lang);
  if (anonymised) {
    const name = anonName(p);
    rows.push([L.name, name]);
    if (p.city) rows.push([L.residence, p.city]);
    if (p.birthDate) rows.push([L.birthYear, `${p.birthDate.getUTCFullYear()} (${L.age} ${ageOn(p.birthDate, now)})`]);
    if (nationality) rows.push([L.nationality, nationality]);
    return { name, rows, place: '' };
  }
  const name = `${p.firstName} ${p.lastName}`.trim();
  rows.push([L.name, name]);
  const address = [p.address?.trim(), p.address && p.city && !p.address.includes(p.city) ? p.city : !p.address ? p.city : ''].filter(Boolean).join(', ');
  if (address) rows.push([L.address, address]);
  if (p.phone) rows.push([L.phone, p.phone]);
  if (p.email) rows.push([L.email, p.email]);
  if (p.birthDate) rows.push([L.birthDate, fmtDate(p.birthDate, lang)]);
  if (nationality) rows.push([L.nationality, nationality]);
  return { name, rows, place: p.city?.trim() || 'Baku' };
};

/** For employers: the surname, e-mail and phone must not leak through free text either. */
const scrub = (cv: CvData, p: CvPerson): CvData => {
  const needles = [p.lastName, p.email, p.phone, p.address].map((s) => s?.trim()).filter((s): s is string => !!s && s.length >= 3);
  if (!needles.length) return cv;
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(needles.map(esc).join('|'), 'gi');
  const initial = p.lastName.trim() ? `${p.lastName.trim()[0].toUpperCase()}.` : '';
  const fix = (s: string) => s.replace(re, (m) => (m.toLowerCase() === p.lastName.trim().toLowerCase() ? initial : '…'));
  return JSON.parse(JSON.stringify(cv), (_k, v) => (typeof v === 'string' ? fix(v) : v)) as CvData;
};

const experienceLine = (e: { employer: string; city: string; country: string }) => [e.employer, [e.city, e.country].filter(Boolean).join(', ')].filter(Boolean).join(' · ');

// ─── Lebenslauf (classic German tabular CV) ─────────────────────────────

const renderLebenslauf = (flow: Flow, fonts: Fonts, v: PersonView, cv: CvData, lang: CvLang, photo: PDFImage | null, anonymised: boolean, now: Date) => {
  const L = CV_LABELS[lang];
  const left = 62;
  const right = 595.28 - 56;
  const labelW = 128;
  const vx = left + labelW + 12;
  const vw = right - vx;

  // Title + photo
  flow.draw(L.lebenslauf, left, { size: 22, bold: true, color: BRAND });
  if (photo) drawPhoto(flow.page, photo, right - 96, flow.y - 118, 96, 124);
  flow.gap(26);
  if (cv.headline) {
    flow.para(cv.headline, left, (photo ? right - 110 : right) - left, { size: 11.5, color: MUTED });
  }
  if (anonymised) flow.para(L.anonymised, left, vw + labelW, { size: 8.5, color: MUTED });
  flow.gap(8);

  const heading = (t: string) => {
    flow.need(44);
    flow.gap(8);
    flow.draw(t, left, { size: 12.5, bold: true, color: BRAND });
    flow.gap(6);
    flow.rule(left, right, LINE, 0.8);
    flow.gap(15);
  };
  const row = (label: string, body: () => void, keep = 28) => {
    flow.need(keep);
    const labelLines = wrap(label, fonts.regular, 9.5, labelW);
    const startY = flow.y;
    const startPage = flow.page;
    body();
    labelLines.forEach((l, i) => startPage.drawText(l, { x: left, y: startY - i * 13, size: 9.5, font: fonts.regular, color: MUTED }));
    if (flow.page === startPage) flow.y = Math.min(flow.y, startY - labelLines.length * 13);
    flow.gap(5);
  };

  heading(L.personal);
  const personalW = photo ? right - 110 - vx : vw;
  for (const [label, value] of v.rows) row(label, () => flow.para(value, vx, personalW, { bold: label === L.name }), 14);
  if (photo && flow.y > 800 - 175) flow.y = 800 - 175;

  if (cv.summary) {
    heading(L.profile);
    flow.para(cv.summary, left, right - left);
  }

  if (cv.experience.length) {
    heading(L.experience);
    for (const e of byNewest(cv.experience)) {
      row(fmtRange(e.from, e.to, lang, true), () => {
        flow.para(e.title, vx, vw, { bold: true });
        const sub = experienceLine(e);
        if (sub) flow.para(sub, vx, vw, { color: MUTED, size: 9.5 });
        for (const t of e.tasks) flow.bullet(t, vx, vw, { size: 9.5 });
      }, 30);
      flow.gap(3);
    }
  }

  if (cv.education.length) {
    heading(L.education);
    for (const e of byNewest(cv.education, false)) {
      row(fmtRange(e.from, e.to, lang), () => {
        flow.para(e.degree, vx, vw, { bold: true });
        if (e.field) flow.para(`${L.field}: ${e.field}`, vx, vw, { size: 9.5 });
        const sub = experienceLine({ employer: e.institution, city: e.city, country: e.country });
        if (sub) flow.para(sub, vx, vw, { color: MUTED, size: 9.5 });
      }, 30);
      flow.gap(3);
    }
  }

  if (cv.certificates.length) {
    heading(L.certificates);
    for (const c of [...cv.certificates].sort((a, b) => (b.year ?? 0) - (a.year ?? 0))) {
      row(c.year ? String(c.year) : '', () => flow.para([c.name, c.issuer].filter(Boolean).join(' – '), vx, vw), 16);
    }
  }

  if (cv.languages.length) {
    heading(L.languages);
    for (const l of cv.languages) row(languageName(l.language, lang), () => flow.para(levelLabel(l.level, lang), vx, vw), 16);
  }

  if (cv.skills.length) {
    heading(L.skills);
    for (const s of cv.skills) flow.bullet(s, left + 4, right - left - 4);
  }

  if (cv.drivingLicences.length) {
    heading(L.driving);
    flow.para(`${L.drivingClasses} ${cv.drivingLicences.join(', ')}`, left, right - left);
  }

  if (cv.interests.length) {
    heading(L.interests);
    flow.para(cv.interests.join(', '), left, right - left);
  }

  if (!anonymised) {
    flow.need(90);
    flow.gap(36);
    flow.draw(`${v.place}, ${fmtDate(now, lang)}`, left);
    flow.gap(36);
    flow.rule(left, left + 190, INK, 0.6);
    flow.gap(12);
    flow.draw(v.name, left, { size: 8.5, color: MUTED });
  }
};

// ─── Europass-style ─────────────────────────────────────────────────────

const BAND_W = 188;

const renderEuropass = (flow: Flow, fonts: Fonts, v: PersonView, cv: CvData, lang: CvLang, photo: PDFImage | null, anonymised: boolean, now: Date) => {
  const L = CV_LABELS[lang];
  const first = flow.pages[0];

  // Left column (first page only)
  const lx = 22;
  const lw = BAND_W - 2 * lx;
  let ly = 800;
  if (photo) {
    drawPhoto(first, photo, lx + (lw - 104) / 2, ly - 134, 104, 134);
    ly -= 152;
  }
  for (const line of wrap(v.name, fonts.bold, 15, lw)) {
    first.drawText(line, { x: lx, y: ly, size: 15, font: fonts.bold, color: BRAND });
    ly -= 19;
  }
  if (cv.headline) {
    for (const line of wrap(cv.headline, fonts.regular, 9.5, lw)) {
      first.drawText(line, { x: lx, y: ly, size: 9.5, font: fonts.regular, color: INK });
      ly -= 13;
    }
  }
  ly -= 12;
  const leftItem = (label: string, value: string) => {
    if (ly < 80) return;
    first.drawText(label.toUpperCase(), { x: lx, y: ly, size: 7, font: fonts.bold, color: MUTED });
    ly -= 12;
    for (const line of wrap(value, fonts.regular, 9, lw)) {
      if (ly < 60) return;
      first.drawText(line, { x: lx, y: ly, size: 9, font: fonts.regular, color: INK });
      ly -= 12;
    }
    ly -= 8;
  };
  for (const [label, value] of v.rows.slice(1)) leftItem(label, value);
  if (cv.drivingLicences.length) leftItem(L.driving, `${L.drivingClasses} ${cv.drivingLicences.join(', ')}`);
  if (cv.interests.length) leftItem(L.interests, cv.interests.join(', '));
  if (anonymised) leftItem('', L.anonymised);

  // Right column
  const rx = BAND_W + 22;
  const right = 595.28 - 40;
  const rw = right - rx;
  flow.draw(L.europass.toUpperCase(), rx, { size: 9, bold: true, color: MUTED });
  flow.gap(22);

  const heading = (t: string) => {
    flow.need(44);
    flow.gap(6);
    flow.draw(t, rx, { size: 12, bold: true, color: BRAND });
    flow.gap(6);
    flow.rule(rx, right, BRAND, 0.8);
    flow.gap(15);
  };
  const entry = (dates: string, title: string, sub: string, extra: () => void) => {
    flow.need(42);
    if (dates) {
      flow.draw(dates, rx, { size: 8.5, color: MUTED });
      flow.gap(12);
    }
    flow.para(title, rx, rw, { bold: true, size: 10.5 });
    if (sub) flow.para(sub, rx, rw, { size: 9.5, color: MUTED });
    extra();
    flow.gap(7);
  };

  if (cv.summary) {
    heading(L.profile);
    flow.para(cv.summary, rx, rw, { size: 9.5 });
  }
  if (cv.experience.length) {
    heading(L.experience);
    for (const e of byNewest(cv.experience)) entry(fmtRange(e.from, e.to, lang, true), e.title, experienceLine(e), () => e.tasks.forEach((t) => flow.bullet(t, rx, rw, { size: 9.5 })));
  }
  if (cv.education.length) {
    heading(L.education);
    for (const e of byNewest(cv.education, false)) {
      entry(fmtRange(e.from, e.to, lang), e.degree, experienceLine({ employer: e.institution, city: e.city, country: e.country }), () => {
        if (e.field) flow.para(`${L.field}: ${e.field}`, rx, rw, { size: 9.5 });
      });
    }
  }
  if (cv.languages.length) {
    heading(L.languages);
    const natives = cv.languages.filter((l) => l.level === 'native');
    const others = cv.languages.filter((l) => l.level !== 'native');
    if (natives.length) {
      flow.need(16);
      flow.draw(`${L.motherTongue}:`, rx, { size: 9.5, color: MUTED });
      flow.draw(natives.map((l) => languageName(l.language, lang)).join(', '), rx + 110, { size: 9.5, bold: true });
      flow.gap(18);
    }
    if (others.length) cefrGrid(flow, fonts, L, others.map((l) => ({ name: languageName(l.language, lang), level: l.level })), rx, rw);
  }
  if (cv.skills.length) {
    heading(L.skills);
    for (const s of cv.skills) flow.bullet(s, rx, rw, { size: 9.5 });
  }
  if (cv.certificates.length) {
    heading(L.certificates);
    for (const c of [...cv.certificates].sort((a, b) => (b.year ?? 0) - (a.year ?? 0))) entry(c.year ? String(c.year) : '', c.name, c.issuer, () => undefined);
  }
  if (!anonymised) {
    flow.need(30);
    flow.gap(14);
    flow.draw(`${v.place}, ${fmtDate(now, lang)}`, rx, { size: 9, color: MUTED });
  }
};

/** CEFR self-assessment grid: the single level is used for every skill. */
const cefrGrid = (flow: Flow, fonts: Fonts, L: CvLabels, rows: { name: string; level: string }[], x: number, w: number) => {
  const nameW = 86;
  const colW = (w - nameW) / 5;
  const groups: [string, number][] = [
    [L.understanding, 2],
    [L.speaking, 2],
    [L.writing, 1],
  ];
  const subs = [L.listening, L.reading, L.gridProduction, L.gridInteraction, L.writing];
  const subLines = subs.map((s) => wrap(s, fonts.regular, 6.5, colW - 4));
  const subH = Math.max(...subLines.map((l) => l.length)) * 8 + 6;
  const groupH = 14;
  const rowH = 16;
  flow.need(groupH + subH + rowH * Math.min(rows.length, 3) + 20);
  const page = flow.page;
  let y = flow.y + 4;
  const cell = (cx: number, cy: number, cw: number, ch: number, fill?: boolean) =>
    page.drawRectangle({ x: cx, y: cy - ch, width: cw, height: ch, borderColor: LINE, borderWidth: 0.5, ...(fill ? { color: BAND } : {}) });

  // group header
  let cx = x + nameW;
  for (const [label, span] of groups) {
    cell(cx, y, colW * span, groupH, true);
    const t = fit(label.toUpperCase(), fonts.bold, 7, colW * span - 4);
    page.drawText(t, { x: cx + (colW * span - fonts.bold.widthOfTextAtSize(t, 7)) / 2, y: y - 10, size: 7, font: fonts.bold, color: BRAND });
    cx += colW * span;
  }
  y -= groupH;
  cx = x + nameW;
  subLines.forEach((lines) => {
    cell(cx, y, colW, subH, true);
    lines.forEach((l, i) => page.drawText(l, { x: cx + (colW - fonts.regular.widthOfTextAtSize(l, 6.5)) / 2, y: y - 9 - i * 8, size: 6.5, font: fonts.regular, color: MUTED }));
    cx += colW;
  });
  y -= subH;
  flow.y = y;
  for (const r of rows) {
    flow.need(rowH + 4);
    const p = flow.page;
    const ry = flow.y;
    p.drawRectangle({ x, y: ry - rowH, width: nameW, height: rowH, borderColor: LINE, borderWidth: 0.5 });
    p.drawText(fit(r.name, fonts.bold, 9, nameW - 6), { x: x + 4, y: ry - 11.5, size: 9, font: fonts.bold, color: INK });
    for (let i = 0; i < 5; i++) {
      const c = x + nameW + i * colW;
      p.drawRectangle({ x: c, y: ry - rowH, width: colW, height: rowH, borderColor: LINE, borderWidth: 0.5 });
      p.drawText(r.level, { x: c + (colW - fonts.regular.widthOfTextAtSize(r.level, 9)) / 2, y: ry - 11.5, size: 9, font: fonts.regular, color: INK });
    }
    flow.y = ry - rowH;
  }
  flow.gap(12);
  flow.para(L.cefrNote, x, w, { size: 7, color: MUTED });
};

export const renderCvPdf = async (input: RenderCvInput): Promise<Buffer> => {
  const now = input.now ?? new Date();
  const anonymised = !!input.anonymised;
  const lang = input.lang;
  const L = CV_LABELS[lang];
  const v = personView(input.person, lang, anonymised, now);
  const cv = anonymised ? scrub(input.cv, input.person) : input.cv;
  const { pdf, fonts } = await createDoc({ title: `${L.lebenslauf} – ${v.name}`, author: anonymised ? 'Triad Vision' : v.name, subject: L.lebenslauf, lang: lang === 'de' ? 'de-DE' : 'en-GB' });
  const photo = anonymised ? null : await embedImage(pdf, input.photo);
  const europass = input.template === 'europass';
  const flow = new Flow(pdf, fonts, {
    top: 800,
    bottom: 50,
    onNewPage: europass ? (p) => p.drawRectangle({ x: 0, y: 0, width: BAND_W, height: p.getHeight(), color: BAND }) : undefined,
  });
  if (europass) renderEuropass(flow, fonts, v, cv, lang, photo, anonymised, now);
  else renderLebenslauf(flow, fonts, v, cv, lang, photo, anonymised, now);
  numberPages(flow.pages, fonts, L.page, 595.28 - 40, lang === 'de' ? 'von' : 'of');
  return Buffer.from(await pdf.save());
};

/** ASCII file name: Lebenslauf_<Nachname>_<Vorname>.pdf (umlauts transliterated). */
export const cvFileName = (person: Pick<CvPerson, 'firstName' | 'lastName'>, lang: CvLang, anonymised = false) => {
  const part = (s: string) =>
    asciiName(s)
      .replace(/[^A-Za-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'CV';
  const prefix = lang === 'en' ? 'CV' : 'Lebenslauf';
  return anonymised
    ? `${prefix}_${part(person.firstName)}_${part(person.lastName.slice(0, 1))}.pdf`
    : `${prefix}_${part(person.lastName)}_${part(person.firstName)}.pdf`;
};

const TRANSLIT: Record<string, string> = {
  ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ə: 'a', Ə: 'A', ı: 'i', İ: 'I', ş: 's', Ş: 'S', ğ: 'g', Ğ: 'G', ç: 'c', Ç: 'C',
};
const CYR = 'а:a б:b в:v г:g д:d е:e ё:e ж:zh з:z и:i й:y к:k л:l м:m н:n о:o п:p р:r с:s т:t у:u ф:f х:kh ц:ts ч:ch ш:sh щ:shch ъ: ы:y ь: э:e ю:yu я:ya'
  .split(' ')
  .map((p) => p.split(':') as [string, string]);
for (const [c, l] of CYR) {
  TRANSLIT[c] = l;
  TRANSLIT[c.toUpperCase()] = l ? l[0].toUpperCase() + l.slice(1) : '';
}
export const asciiName = (s: string) =>
  [...s]
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join('')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');

/** Content-Disposition with an ASCII fallback and the UTF-8 name. */
export const attachmentHeader = (filename: string, inline = false) =>
  `${inline ? 'inline' : 'attachment'}; filename="${filename.replace(/[^\x20-\x7e]|"/g, '_')}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
