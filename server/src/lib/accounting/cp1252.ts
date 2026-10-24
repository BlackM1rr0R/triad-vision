/**
 * Windows-1252 encoder (DATEV imports ANSI / CP1252 text). Latin-1 characters map 1:1, the CP1252 extras
 * (€, „, “, ”, ‚, ‘, ’, –, —, …, Š, Ž, Œ, ‰, ™, •, ˆ, ˜, ‹, ›, †, ‡, ƒ, š, ž, œ, Ÿ) to 0x80–0x9F; Azerbaijani,
 * Turkish and Cyrillic letters outside the code page are transliterated (ə → e, ş → s, ğ → g, ı → i, Cyrillic →
 * Latin) and anything else becomes "?".
 */

const EXTRA: Record<string, number> = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e,
  '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
};

const TRANSLIT: Record<string, string> = {
  ə: 'e', Ə: 'E', ı: 'i', İ: 'I', ş: 's', Ş: 'S', ğ: 'g', Ğ: 'G', '₼': 'AZN', '₺': 'TRY',
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  і: 'i', ї: 'yi', є: 'ye', ґ: 'g',
};

const translit = (ch: string) => {
  if (TRANSLIT[ch] !== undefined) return TRANSLIT[ch];
  const lower = ch.toLowerCase();
  if (lower !== ch && TRANSLIT[lower] !== undefined) {
    const t = TRANSLIT[lower];
    return t ? t[0].toUpperCase() + t.slice(1) : t;
  }
  return null;
};

/** Text as it will look after CP1252 encoding (useful for length limits and tests). */
export const toCp1252Text = (s: string) =>
  [...s]
    .map((ch) => {
      const code = ch.codePointAt(0)!;
      if (code < 0x80 || (code >= 0xa0 && code <= 0xff) || EXTRA[ch] !== undefined) return ch;
      return translit(ch) ?? '?';
    })
    .join('');

export const encodeCp1252 = (s: string): Buffer => {
  const text = toCp1252Text(s);
  const out = Buffer.alloc(text.length);
  let n = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    out[n++] = EXTRA[ch] ?? (code <= 0xff ? code : 0x3f);
  }
  return out.subarray(0, n);
};

/** Decoder for tests / previews. */
export const decodeCp1252 = (b: Buffer) => {
  const rev = new Map(Object.entries(EXTRA).map(([k, v]) => [v, k]));
  return [...b].map((c) => rev.get(c) ?? String.fromCharCode(c)).join('');
};
