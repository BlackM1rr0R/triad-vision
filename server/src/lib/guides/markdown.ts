/**
 * Tiny, safe Markdown → HTML renderer for the topic guides (GuidePage.body), used for the guide page itself
 * (the API returns the rendered HTML) and for the crawler HTML (/__seo/body).
 *
 * Supported: ## / ### / #### headings (a single # is demoted to ##), paragraphs, "- " / "* " and "1. " lists,
 * "> " notes, pipe tables, **bold**, *italic*, `code`, [links](…). Everything is HTML-escaped first; raw HTML in
 * the source is shown as text. Links: http(s) (opened in a new tab, rel=noopener), site paths ("/booking" gets
 * the reader's language prefix), "#anchor", "mailto:" and "guide:<key>" (another guide in the same language).
 * Anything else is rendered as plain text.
 */

export interface TocEntry {
  id: string;
  text: string;
}

export interface RenderOptions {
  /** Adds the language prefix to a site path ("/booking" → "/de/booking"). */
  localize: (path: string) => string;
  /** Site path of another guide in the reader's language, or null if it does not exist. */
  guideHref: (key: string) => string | null;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const unescapeBasic = (s: string) =>
  s.replace(/&(amp|lt|gt|quot|#39);/g, (_, e: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[e]!);

/** Heading text → anchor id (ASCII-ish, stable). */
export const slugifyHeading = (text: string) => {
  const map: Record<string, string> = { ə: 'e', ı: 'i', ğ: 'g', ş: 's', ç: 'c', ö: 'o', ü: 'u', ä: 'a', ß: 'ss', і: 'i', ї: 'i', є: 'e', ґ: 'g' };
  const base = text
    .toLowerCase()
    .replace(/[əığşçöüäßіїєґ]/g, (c) => map[c] ?? c)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base || 'section';
};

const renderInline = (raw: string, opts: RenderOptions): string => {
  // Code spans first, so their content is not formatted.
  const codes: string[] = [];
  let s = escapeHtml(raw).replace(/`([^`]+)`/g, (_, c: string) => {
    codes.push(`<code>${c}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_whole, label: string, href: string) => {
    const url = unescapeBasic(href);
    let out: string | null = null;
    if (/^https?:\/\/[^\s"<>]+$/i.test(url)) out = `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${label}</a>`;
    else if (/^mailto:[^\s"<>]+$/i.test(url)) out = `<a href="${escapeHtml(url)}">${label}</a>`;
    else if (/^#[\w-]+$/.test(url)) out = `<a href="${escapeHtml(url)}">${label}</a>`;
    else if (/^\/(?!\/)[^\s"<>]*$/.test(url)) out = `<a href="${escapeHtml(opts.localize(url))}">${label}</a>`;
    else if (/^guide:[a-z0-9-]+$/.test(url)) {
      const target = opts.guideHref(url.slice(6));
      out = target ? `<a href="${escapeHtml(target)}">${label}</a>` : label;
    }
    if (out === null) return label;
    codes.push(out); // protected from the emphasis rules below (URLs may contain * or _)
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^\w*])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>');
  s = s.replace(/(^|[^\w])_([^_\s][^_]*?)_(?!\w)/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => codes[Number(i)]);
};

const isTableSep = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());

/** Renders the guide body; returns the HTML and the table of contents (## headings). */
export const renderGuideMarkdown = (md: string, opts: RenderOptions): { html: string; toc: TocEntry[] } => {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  const toc: TocEntry[] = [];
  const used = new Set<string>();
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) out.push(`<p>${renderInline(para.join(' '), opts)}</p>`);
    para = [];
  };
  const uniqueId = (text: string) => {
    const base = slugifyHeading(text);
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    return id;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      flushPara();
      continue;
    }
    const h = /^(#{1,4})\s+(.+?)\s*#*$/.exec(trimmed);
    if (h) {
      flushPara();
      const level = Math.max(2, h[1].length);
      const text = h[2];
      const id = uniqueId(text);
      if (level === 2) toc.push({ id, text: text.replace(/[*_`]/g, '') });
      out.push(`<h${level} id="${id}">${renderInline(text, opts)}</h${level}>`);
      continue;
    }
    if (trimmed.startsWith('>')) {
      flushPara();
      const quote: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quote.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      i--;
      const paras = quote
        .join('\n')
        .split(/\n\s*\n/)
        .map((p) => p.replace(/\n/g, ' ').trim())
        .filter(Boolean);
      out.push(`<blockquote>${paras.map((p) => `<p>${renderInline(p, opts)}</p>`).join('')}</blockquote>`);
      continue;
    }
    if (trimmed.startsWith('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      flushPara();
      const head = cells(trimmed);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(cells(lines[i]));
        i++;
      }
      i--;
      const th = head.map((c) => `<th>${renderInline(c, opts)}</th>`).join('');
      const tb = rows.map((r) => `<tr>${head.map((_, k) => `<td>${renderInline(r[k] ?? '', opts)}</td>`).join('')}</tr>`).join('');
      out.push(`<div class="table-wrap"><table><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table></div>`);
      continue;
    }
    const bullet = /^[-*]\s+(.*)$/.exec(trimmed);
    const ordered = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (bullet || ordered) {
      flushPara();
      const tag = bullet ? 'ul' : 'ol';
      const re = bullet ? /^[-*]\s+(.*)$/ : /^\d+[.)]\s+(.*)$/;
      const items: string[] = [];
      while (i < lines.length) {
        const t = lines[i].trim();
        const m = re.exec(t);
        if (m) items.push(m[1]);
        else if (t && /^\s{2,}/.test(lines[i]) && items.length) items[items.length - 1] += ` ${t}`;
        else break;
        i++;
      }
      i--;
      out.push(`<${tag}>${items.map((it) => `<li>${renderInline(it, opts)}</li>`).join('')}</${tag}>`);
      continue;
    }
    para.push(trimmed);
  }
  flushPara();
  return { html: out.join('\n'), toc };
};

/** Plain text of a markdown body (for word counts and descriptions). */
export const markdownToText = (md: string) =>
  md
    .replace(/^#+\s+/gm, '')
    .replace(/^\s*[-*>]\s+/gm, '')
    .replace(/\|/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
