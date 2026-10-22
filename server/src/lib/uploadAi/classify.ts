import { isoDate } from '../aiDocs/input.js';
import { DOC_TYPES, type DocType, type InsightFields } from './types.js';

/**
 * Deterministic recognition: keywords (Azerbaijani, German, English, Russian) in the file name and in the
 * text layer of a PDF / Word file, dates near "valid until" / "issued", and the free-text document type the
 * existing AI document check (checks.ai.documentType) already produced. No AI and no I/O here.
 */

type Rule = { re: RegExp; w: number };

/** Strong (w 3), normal (w 2) and weak (w 1) signals per type. Patterns run on lower-cased text. */
const RULES: Partial<Record<DocType, Rule[]>> = {
  PASSPORT: [
    { re: /p<[a-z<]{3}[a-z]/, w: 3 },
    { re: /\b(reisepass|passport|pasport|паспорт|passeport)\b/, w: 2 },
    { re: /\b(xarici\s+pasport|загранпаспорт|travel document)\b/, w: 2 },
  ],
  ID_CARD: [
    { re: /\bid[a-z<]{3}[a-z0-9<]{20,}/, w: 3 },
    { re: /\b(personalausweis|identity card|id[\s-]?card|şəxsiyyət vəsiqəsi|sexsiyyet|удостоверение личности|id[\s-]?kart)\b/, w: 2 },
  ],
  BIRTH_CERT: [{ re: /\b(geburtsurkunde|birth certificate|doğum haqqında|dogum|свидетельство о рождении|birth[\s_-]?cert)\b/, w: 3 }],
  DIPLOMA: [
    { re: /\b(diplom|diploma|диплом|bachelor|master|magistr|bakalavr|бакалавр|магистр|hochschulabschluss)\b/, w: 2 },
    { re: /\b(university|universität|universitet|университет|академия|akademiya)\b/, w: 1 },
  ],
  TRANSCRIPT: [
    { re: /\b(transcript|notenspiegel|notenauszug|fächer und noten|diploma supplement|diplom əlavəsi|приложение к диплому|qiymət cədvəli|transkript)\b/, w: 3 },
    { re: /\b(credits|ects|kredit)\b/, w: 1 },
  ],
  VOCATIONAL_CERT: [
    { re: /\b(berufsabschluss|gesellenbrief|facharbeiterbrief|vocational|peşə təhsili|peşə|колледж|kollec|профессионал)\b/, w: 2 },
    { re: /\b(ausbildung|college)\b/, w: 1 },
  ],
  DRIVING_LICENCE: [{ re: /\b(führerschein|fuhrerschein|fuehrerschein|driving licen[cs]e|driver'?s licen[cs]e|sürücülük vəsiqəsi|surucuuluk|surucu|водительское удостоверение|prava)\b/, w: 3 }],
  CV: [
    { re: /\b(lebenslauf|curriculum vitae|résumé|resume|rezume|резюме|tərcümeyi[\s-]?hal|cv)\b/, w: 3 },
    { re: /\b(berufserfahrung|work experience|iş təcrübəsi|опыт работы)\b/, w: 1 },
  ],
  PHOTO: [{ re: /\b(passfoto|biometri[ck]|photo|foto|şəkil|фото|selfie)\b/, w: 2 }],
  EMPLOYMENT_CONTRACT: [
    { re: /\b(arbeitsvertrag|employment contract|əmək müqaviləsi|трудовой договор)\b/, w: 3 },
    { re: /\b(vertrag|contract|müqavilə|договор)\b/, w: 1 },
  ],
  JOB_OFFER: [{ re: /\b(arbeitsangebot|stellenangebot|job offer|offer letter|einstellungszusage|arbeitsplatzzusage|iş təklifi|предложение о работе)\b/, w: 3 }],
  EMPLOYMENT_REFERENCE: [{ re: /\b(arbeitszeugnis|arbeitsbescheinigung|employment reference|reference letter|work certificate|iş yerindən arayış|arayış|справка с места работы|трудовая книжка|əmək kitabçası)\b/, w: 3 }],
  LANGUAGE_CERT: [
    { re: /\b(goethe[\s-]?(institut|zertifikat)|telc|testdaf|ösd|osd|dsh|ielts|toefl|sprachzertifikat|language certificate|dil sertifikatı|языковой сертификат)\b/, w: 3 },
    { re: /\b(start deutsch|zertifikat deutsch|deutsch[\s-]?test)\b/, w: 3 },
    { re: /\b[abc][12]\b/, w: 1 },
  ],
  RECOGNITION_DECISION: [
    { re: /\b(anerkennung|anerkennungsbescheid|gleichwertigkeit|zeugnisbewertung|zab|kultusministerkonferenz|feststellungsbescheid|defizitbescheid|recognition)\b/, w: 3 },
  ],
  INSURANCE: [{ re: /\b(versicherung|krankenversicherung|insurance|sığorta|sigorta|страховка|страхование|polis[\s_]?sigorta)\b/, w: 3 }],
  BANK_STATEMENT: [
    { re: /\b(kontoauszug|sperrkonto|bank statement|account statement|bank çıxarışı|выписка|kontoauszüge|fintiba|expatrio)\b/, w: 3 },
    { re: /\b(iban|bic|swift)\b/, w: 1 },
  ],
  POLICE_CERT: [{ re: /\b(führungszeugnis|fuhrungszeugnis|police (clearance|certificate)|məhkumluq|mehkumluq|справка о несудимости|несудимост|criminal record)\b/, w: 3 }],
  MARRIAGE_CERT: [{ re: /\b(heiratsurkunde|eheurkunde|marriage certificate|nikah|свидетельство о браке|о заключении брака)\b/, w: 3 }],
  VISA: [
    { re: /\bv<[a-z<]{3}/, w: 3 },
    { re: /\b(visum|visa|viza|виза)\b/, w: 2 },
  ],
  RESIDENCE_PERMIT: [{ re: /\b(aufenthaltstitel|aufenthaltserlaubnis|niederlassungserlaubnis|blaue karte|blue card|residence permit|yaşayış icazəsi|вид на жительство|внж)\b/, w: 3 }],
};

const norm = (s: string) => s.normalize('NFC').toLowerCase().replace(/[_+]+/g, ' ');

/** `\b` only knows ASCII letters; this boundary also works next to "ş", "ə" or Cyrillic letters. */
const UB = String.raw`(?:(?<![\p{L}\p{N}])(?=[\p{L}\p{N}])|(?<=[\p{L}\p{N}])(?![\p{L}\p{N}]))`;
const compiled = new Map<RegExp, RegExp>();
const unicodeGlobal = (re: RegExp) => {
  let c = compiled.get(re);
  if (!c) {
    c = new RegExp(re.source.replace(/\\b/g, UB), 'gu');
    compiled.set(re, c);
  }
  c.lastIndex = 0;
  return c;
};

export interface Guess {
  type: DocType;
  confidence: number;
  score: number;
}

/** Scores every type on a piece of text; best first (empty when nothing matched). */
export const scoreText = (text: string): { type: DocType; score: number; hits: number }[] => {
  const t = norm(text);
  const out: { type: DocType; score: number; hits: number }[] = [];
  for (const type of DOC_TYPES) {
    const rules = RULES[type];
    if (!rules) continue;
    let score = 0;
    let hits = 0;
    for (const r of rules) {
      const m = t.match(unicodeGlobal(r.re));
      if (!m) continue;
      hits++;
      score += r.w * Math.min(3, m.length);
    }
    if (score) out.push({ type, score, hits });
  }
  // Specific beats generic: a transcript mentions "diploma"; a CV mentions "university".
  return out.sort((a, b) => b.score - a.score);
};

/** File name hint: "pasport_ali.jpg" → PASSPORT. Generic names (IMG_1234, scan, document) give nothing. */
export const guessFromFilename = (name: string): Guess | null => {
  const base = name.replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[-.]+/g, ' ');
  const [best, second] = scoreText(base);
  if (!best || (second && second.score === best.score)) return null;
  return { type: best.type, confidence: best.score >= 3 ? 0.6 : 0.5, score: best.score };
};

/** Text layer (PDF / Word / drive index) → type. Two distinct strong signals give a confident result. */
export const guessFromText = (text: string): Guess | null => {
  if (text.replace(/\s/g, '').length < 20) return null;
  const [best, second] = scoreText(text.slice(0, 20_000));
  if (!best) return null;
  const margin = best.score - (second?.score ?? 0);
  if (margin <= 0) return null;
  const confidence = best.score >= 6 && margin >= 3 ? 0.88 : best.score >= 3 ? 0.72 : 0.55;
  return { type: best.type, confidence, score: best.score };
};

/** Combines the file name and text guesses: agreement raises the confidence, disagreement trusts the text. */
export const combineGuesses = (file: Guess | null, text: Guess | null): Guess | null => {
  if (file && text && file.type === text.type) return { type: text.type, confidence: Math.min(0.93, Math.max(text.confidence, file.confidence) + 0.12), score: text.score + file.score };
  return text ?? file;
};

// ─── Dates in text ──────────────────────────────────────────────────────

const DATE_RE = /\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b|\b(\d{4})-(\d{2})-(\d{2})\b/g;
const EXPIRY_WORDS = /(gültig bis|gueltig bis|valid until|valid thru|valid to|date of expiry|expiry date|expires|ablaufdatum|etibarlıdır|qüvvədədir|действителен до|срок действия|дата окончания|bis zum)/;
const ISSUE_WORDS = /(ausgestellt am|ausstellungsdatum|date of issue|issued on|issue date|verilmə tarixi|verilib|дата выдачи|выдан|datum)/;

const toIso = (m: RegExpExecArray) => {
  if (m[4]) return isoDate(`${m[4]}-${m[5]}-${m[6]}`);
  const d = m[1].padStart(2, '0');
  const mo = m[2].padStart(2, '0');
  return Number(mo) <= 12 ? isoDate(`${m[3]}-${mo}-${d}`) : null;
};

/** Expiry / issue date found right after the matching words (within 60 characters). */
export const datesFromText = (text: string): Pick<InsightFields, 'expiryDate' | 'issueDate'> => {
  const t = norm(text.slice(0, 20_000));
  const out: Pick<InsightFields, 'expiryDate' | 'issueDate'> = {};
  const near = (words: RegExp) => {
    const w = new RegExp(words.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = w.exec(t))) {
      const window = t.slice(m.index, m.index + m[0].length + 60);
      const d = new RegExp(DATE_RE.source, 'g').exec(window);
      if (d) {
        const iso = toIso(d);
        if (iso) return iso;
      }
    }
    return undefined;
  };
  const expiry = near(EXPIRY_WORDS);
  const issue = near(ISSUE_WORDS);
  if (expiry) out.expiryDate = expiry;
  if (issue && issue !== expiry) out.issueDate = issue;
  return out;
};

// ─── The AI document check's free text ─────────────────────────────────

/** "Bachelor diploma", "Reisepass", "Language certificate (Goethe B1)" → enum type, or null. */
export const typeFromFreeText = (label: string | null | undefined): DocType | null => {
  if (!label) return null;
  const direct = label.trim().toUpperCase().replace(/[\s-]+/g, '_');
  if ((DOC_TYPES as readonly string[]).includes(direct)) return direct as DocType;
  const [best, second] = scoreText(label);
  if (!best || (second && second.score === best.score)) {
    if (/\bid\b/i.test(label)) return 'ID_CARD';
    return null;
  }
  return best.type;
};
