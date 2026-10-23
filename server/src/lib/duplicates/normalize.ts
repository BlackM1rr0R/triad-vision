/**
 * Normalisation for duplicate detection. Everything here is pure (unit-testable) and deliberately
 * forgiving: two spellings of the same person should end up with the same key.
 */

/** Passport number: upper case, letters and digits only ("c 0123-4567" → "C01234567"). */
export const normPassport = (v: string | null | undefined) => {
  const n = (v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return n.length >= 5 ? n : null;
};

/**
 * Phone number as digits with the country code. Sign-up stores "+<digits>"; staff typed numbers may be
 * "00994 50 …", "050 123 45 67" (Azerbaijani trunk prefix) or "50 123 45 67" — all become "994501234567".
 */
export const normPhone = (v: string | null | undefined) => {
  let d = (v ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.length === 10 && d.startsWith('0')) d = `994${d.slice(1)}`; // 050 123 45 67
  else if (d.length === 9 && !(v ?? '').trim().startsWith('+')) d = `994${d}`; // 50 123 45 67
  return d.length >= 8 && d.length <= 15 ? d : null;
};

const GMAIL = new Set(['gmail.com', 'googlemail.com']);

/**
 * E-mail without the variations that reach the same inbox: case, "+tags" (every provider), and dots in
 * Gmail addresses ("Ali.Mammadov+visa@googlemail.com" → "alimammadov@gmail.com"). Merged accounts'
 * placeholder addresses never match.
 */
export const normEmail = (v: string | null | undefined) => {
  const e = (v ?? '').trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at <= 0) return null;
  let local = e.slice(0, at);
  let domain = e.slice(at + 1);
  if (domain === 'invalid' || domain.endsWith('.invalid')) return null;
  local = local.split('+')[0];
  if (GMAIL.has(domain)) {
    domain = 'gmail.com';
    local = local.replace(/\./g, '');
  }
  return local ? `${local}@${domain}` : null;
};

// Russian / Azerbaijani Cyrillic → Latin (the Azerbaijani-specific letters first).
const CYR: Record<string, string> = {
  ә: 'e', ғ: 'gh', ҹ: 'c', һ: 'h', ҝ: 'g', ө: 'o', ү: 'u', ј: 'y', ı: 'i',
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh',
  ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya',
};
// Azerbaijani / Turkish / German Latin letters → plain Latin (as written in passports or by hand).
const LAT: Record<string, string> = { ə: 'e', ä: 'e', ç: 'ch', ş: 'sh', ğ: 'gh', ı: 'i', ö: 'o', ü: 'u', ß: 'ss' };

/**
 * A spelling-independent "skeleton" of one name: "Məmmədov", "Mammadov", "Mamedov", "Мамедов" and
 * "MEMMEDOV" all become "mamadov"; "Xəlil" / "Khalil" / "Халил" → "xalil"; "Elçin" / "Elchin" / "Эльчин" → "alcin".
 * Steps: lower case, Cyrillic → Latin, Azerbaijani letters → Latin digraphs, digraphs folded
 * (kh→x, dzh/dj/j/zh→c, ch→c, sh→s, gh→g, iy→i), e→a (ə is written a or e), doubled letters collapsed.
 */
export const foldName = (raw: string | null | undefined) => {
  let s = (raw ?? '').normalize('NFC').replace(/İ/g, 'i').toLowerCase();
  s = [...s].map((ch) => CYR[ch] ?? LAT[ch] ?? ch).join('');
  s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  s = s.replace(/[^a-z\s-]/g, ' ').replace(/-/g, ' ');
  s = s
    .replace(/kh/g, 'x')
    .replace(/dzh|dj/g, 'c')
    .replace(/ch/g, 'c')
    .replace(/sh/g, 's')
    .replace(/gh/g, 'g')
    .replace(/zh/g, 'j')
    .replace(/j/g, 'c') // Cəfər = Jafar = Джафар
    .replace(/iy/g, 'i') // Aliyev = Алиев
    .replace(/e/g, 'a')
    .replace(/([a-z])\1+/g, '$1');
  return s.replace(/\s+/g, ' ').trim();
};

/** Full-name key independent of the order of the parts ("Ali Mammadov" = "Mammadov Ali"). */
export const nameKey = (first: string | null | undefined, last: string | null | undefined) => {
  const parts = `${foldName(first)} ${foldName(last)}`.split(' ').filter(Boolean).sort();
  return parts.length ? parts.join(' ') : null;
};

/** Folded "first last" in the given order (for similarity). */
export const nameText = (first: string | null | undefined, last: string | null | undefined) => `${foldName(first)} ${foldName(last)}`.replace(/\s+/g, ' ').trim();

export const cityKey = (v: string | null | undefined) => {
  const c = foldName(v);
  return c.length >= 2 ? c : null;
};

/** Birth date as YYYY-MM-DD (dates are stored at midnight UTC). */
export const dayKey = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

/** Jaro–Winkler similarity (0…1). */
export const jaroWinkler = (a: string, b: string) => {
  if (a === b) return a.length ? 1 : 0;
  if (!a.length || !b.length) return 0;
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const am = new Array<boolean>(a.length).fill(false);
  const bm = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const lo = Math.max(0, i - range);
    const hi = Math.min(i + range + 1, b.length);
    for (let j = lo; j < hi; j++) {
      if (bm[j] || a[i] !== b[j]) continue;
      am[i] = bm[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;
  let t = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!am[i]) continue;
    while (!bm[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  const jaro = (matches / a.length + matches / b.length + (matches - t / 2) / matches) / 3;
  let prefix = 0;
  while (prefix < Math.min(4, a.length, b.length) && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
};

/** Best similarity of two folded names, also with first / last name swapped. */
export const nameSimilarity = (a: { first: string; last: string }, b: { first: string; last: string }) => {
  const x = nameText(a.first, a.last);
  if (!x) return 0;
  return Math.max(jaroWinkler(x, nameText(b.first, b.last)), jaroWinkler(x, nameText(b.last, b.first)));
};
