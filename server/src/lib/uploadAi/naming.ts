import { EXPIRING_TYPES, FILE_LABEL, type DocType, type InsightFields } from './types.js';

/**
 * Standard file names: `<Surname>_<Firstname>_<DocType>_<YYYY-MM-DD | YYYY>.<ext>`, ASCII only so they
 * survive e-mail, ZIP exports and embassy portals. Azerbaijani letters follow the passport (MRZ) spelling
 * (Məmmədov → Mammadov, Şükürov → Shukurov), Cyrillic the usual Latin transliteration.
 */

const MAP: Record<string, string> = {
  ə: 'a', Ə: 'A', ş: 'sh', Ş: 'Sh', ç: 'ch', Ç: 'Ch', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I', ö: 'o', Ö: 'O', ü: 'u', Ü: 'U',
  ä: 'ae', Ä: 'Ae', ß: 'ss',
  а: 'a', б: 'b', в: 'v', г: 'g', ғ: 'gh', д: 'd', е: 'e', ё: 'yo', ә: 'a', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', қ: 'q', л: 'l', м: 'm',
  н: 'n', о: 'o', ө: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ү: 'u', ф: 'f', х: 'kh', һ: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya', ј: 'j',
};

/** Latin ASCII of a name part: transliteration, other accents dropped, anything else removed. */
export const transliterate = (s: string) =>
  s
    .normalize('NFC')
    .split('')
    .map((ch) => {
      const m = MAP[ch] ?? MAP[ch.toLowerCase()];
      if (m === undefined) return ch;
      return ch !== ch.toLowerCase() && m ? m.charAt(0).toUpperCase() + m.slice(1) : m;
    })
    .join('')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 -]/g, '');

/** "ƏLİYEV" / "aliyev" / "Anna-Maria" → "Aliyev" / "Anna-Maria"; several words joined with "-". */
export const namePart = (s: string | null | undefined) =>
  transliterate(s ?? '')
    .trim()
    .split(/[\s]+/)
    .filter(Boolean)
    .map((w) => w.split('-').map((p) => (p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : p)).join('-'))
    .join('-')
    .slice(0, 40);

/** The date that goes into the name: validity end for documents that expire, else issue date, else a year. */
export const nameDate = (type: DocType, f: InsightFields) => {
  if (EXPIRING_TYPES.has(type) && f.expiryDate) return f.expiryDate;
  if (f.issueDate) return f.issueDate;
  if (f.expiryDate) return f.expiryDate;
  return null;
};

const extOf = (name: string) => {
  const m = /\.([A-Za-z0-9]{1,6})$/.exec(name);
  return m ? `.${m[1].toLowerCase()}` : '';
};

/**
 * The proposed name, or null when there is no name to put in front (no holder on the document and no case
 * client). The extension of the current file is kept (the drive refuses extension changes).
 */
export const proposedFileName = (input: {
  type: DocType;
  fields: InsightFields;
  currentName: string;
  person?: { firstName: string; lastName: string } | null;
}) => {
  const last = namePart(input.fields.lastName) || namePart(input.person?.lastName);
  const first = namePart(input.fields.firstName) || namePart(input.person?.firstName);
  if (!last && !first) return null;
  const parts = [last, first, FILE_LABEL[input.type]].filter(Boolean);
  const date = nameDate(input.type, input.fields);
  if (date) parts.push(date);
  return `${parts.join('_')}${extOf(input.currentName)}`.slice(0, 200);
};
