/**
 * Placeholders in Word templates (pure, unit tested).
 *
 *   {{client.fullName}}   [[client.fullName]]   «Ad Soyad»
 *
 * Word often splits what the user typed as one placeholder over several runs (<w:r><w:t>{{cli</w:t></w:r>
 * <w:r><w:t>ent.fullName}}</w:t></w:r>, e.g. after spell checking or a format change). Matching is therefore
 * done on the concatenated text of all <w:t> elements of ONE paragraph; a hit that spans several elements
 * is written into the first one and cut out of the others, so the formatting of the first run wins.
 */

/** Any placeholder in plain text; group 1/2 = key of {{ }} / [[ ]], group 3 = label of « ». */
const TOKEN = /\{\{\s*([^{}\n]{1,80}?)\s*\}\}|\[\[\s*([^[\]\n]{1,80}?)\s*\]\]|«\s*([^«»\n]{1,80}?)\s*»/g;

export interface Hit {
  start: number;
  end: number;
  /** key as written ({{ }} / [[ ]]) or the « » label */
  raw: string;
  style: 'braces' | 'brackets' | 'guillemets';
}

export const findPlaceholders = (text: string): Hit[] =>
  [...text.matchAll(TOKEN)].map((m) => ({
    start: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
    raw: (m[1] ?? m[2] ?? m[3] ?? '').trim(),
    style: m[1] !== undefined ? 'braces' : m[2] !== undefined ? 'brackets' : 'guillemets',
  }));

const XML_ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
export const escapeXml = (s: string) => s.replace(/[&<>"]/g, (c) => XML_ESC[c]);
export const decodeXml = (s: string) =>
  s.replace(/&(lt|gt|amp|quot|apos|#(\d+)|#x([0-9a-fA-F]+));/g, (m, name: string, dec?: string, hex?: string) => {
    if (dec) return String.fromCodePoint(Number(dec));
    if (hex) return String.fromCodePoint(parseInt(hex, 16));
    return ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" } as Record<string, string>)[name] ?? m;
  });

const PARAGRAPH = /<w:p[ >][\s\S]*?<\/w:p>/g;
const TEXT_EL = /<w:t(\s[^>]*)?>([^<]*)<\/w:t>/g;

/** Every placeholder (raw key / label) used in a WordprocessingML part, in order. */
export const placeholdersInXml = (xml: string): Hit[] => {
  const out: Hit[] = [];
  for (const p of xml.match(PARAGRAPH) ?? []) {
    const text = [...p.matchAll(TEXT_EL)].map((m) => decodeXml(m[2])).join('');
    out.push(...findPlaceholders(text));
  }
  return out;
};

/**
 * Replaces the placeholders of a WordprocessingML part. `resolve` returns the value for a hit, or null to
 * leave the placeholder as it is. Returns the new XML and the raw keys that were replaced / left.
 */
export const fillXml = (xml: string, resolve: (h: Hit) => string | null) => {
  const replaced = new Set<string>();
  const left = new Set<string>();
  const out = xml.replace(PARAGRAPH, (p) => {
    const els = [...p.matchAll(TEXT_EL)];
    if (!els.length) return p;
    const texts = els.map((m) => decodeXml(m[2]));
    const joined = texts.join('');
    const hits = findPlaceholders(joined);
    if (!hits.length) return p;
    // element index + offset of every character position
    const starts: number[] = [];
    let pos = 0;
    for (const t of texts) {
      starts.push(pos);
      pos += t.length;
    }
    const locate = (at: number) => {
      let i = starts.length - 1;
      while (i > 0 && starts[i] > at) i--;
      // an end position exactly at an element start belongs to the previous element
      return { i, off: at - starts[i] };
    };
    let changed = false;
    // right to left: earlier offsets stay valid
    for (const h of [...hits].reverse()) {
      const value = resolve(h);
      if (value === null) {
        left.add(h.raw);
        continue;
      }
      replaced.add(h.raw);
      changed = true;
      const a = locate(h.start);
      let b = locate(h.end);
      if (b.i > a.i && b.off === 0) b = { i: b.i - 1, off: texts[b.i - 1].length };
      const clean = value.replace(/\r?\n/g, ' ');
      if (a.i === b.i) {
        texts[a.i] = texts[a.i].slice(0, a.off) + clean + texts[a.i].slice(b.off);
      } else {
        texts[a.i] = texts[a.i].slice(0, a.off) + clean;
        for (let k = a.i + 1; k < b.i; k++) texts[k] = '';
        texts[b.i] = texts[b.i].slice(b.off);
      }
    }
    if (!changed) return p;
    let k = 0;
    return p.replace(TEXT_EL, () => {
      const t = texts[k++] ?? '';
      return `<w:t xml:space="preserve">${escapeXml(t)}</w:t>`;
    });
  });
  return { xml: out, replaced: [...replaced], left: [...left] };
};
