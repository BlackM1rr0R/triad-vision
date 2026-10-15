import sanitizeHtml from 'sanitize-html';

/**
 * HTML policy for stored e-mail bodies (pure). Scripts, styles, forms, frames and event handlers
 * are removed; images stay, but a remote `src` is moved to `data-src` so the reading pane can block
 * remote content until the user allows it, and `cid:` references are rewritten to our inline route.
 */
const BLOCK_TAGS = ['script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'form', 'input', 'button', 'select', 'textarea', 'meta', 'link', 'base', 'svg', 'math', 'noscript', 'template'];

const ALLOWED_TAGS = [
  ...sanitizeHtml.defaults.allowedTags.filter((t) => !BLOCK_TAGS.includes(t)),
  'img', 'h1', 'h2', 'span', 'u', 's', 'font', 'center', 'small', 'big', 'del', 'ins', 'mark',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'col', 'html', 'body',
];

const COMMON_ATTRS = ['style', 'class', 'dir', 'align', 'valign', 'width', 'height', 'bgcolor', 'border', 'cellpadding', 'cellspacing', 'color', 'face', 'size', 'lang', 'title'];

/** Drops style declarations that could fetch remote content or run anything. */
const cleanStyle = (style: string) => {
  const s = style.replace(/\/\*[\s\S]*?\*\//g, '');
  if (/expression\s*\(|javascript:|@import|behaviou?r\s*:|-moz-binding/i.test(s)) return '';
  return s
    .split(';')
    .map((d) => d.trim())
    .filter((d) => d && !/url\s*\(/i.test(d) && !/^position\s*:\s*(fixed|absolute)/i.test(d))
    .join('; ');
};

const TRANSPARENT = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

export interface SanitizeOptions {
  /** content-id (without angle brackets) → URL serving the inline part */
  inlineUrls?: Map<string, string>;
  /** keep remote image src as-is (outgoing messages we compose ourselves) */
  keepRemoteImages?: boolean;
}

export const sanitizeMailHtml = (html: string, opts: SanitizeOptions = {}) => {
  const inline = opts.inlineUrls ?? new Map<string, string>();
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      '*': COMMON_ATTRS,
      a: ['href', 'name', 'target', 'rel', 'title'],
      img: ['src', 'data-src', 'alt', 'width', 'height', 'title', 'style', 'class', 'align', 'border'],
      td: [...COMMON_ATTRS, 'colspan', 'rowspan', 'nowrap'],
      th: [...COMMON_ATTRS, 'colspan', 'rowspan', 'nowrap'],
      col: [...COMMON_ATTRS, 'span'],
      colgroup: [...COMMON_ATTRS, 'span'],
      table: [...COMMON_ATTRS, 'summary'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['http', 'https', 'data', 'cid'] },
    allowedSchemesAppliedToAttributes: ['href', 'src', 'data-src'],
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'template', 'title', 'head'],
    parseStyleAttributes: false,
    transformTags: {
      '*': (tagName, attribs) => {
        const out = { ...attribs };
        if (out.style !== undefined) {
          const cleaned = cleanStyle(out.style);
          if (cleaned) out.style = cleaned;
          else delete out.style;
        }
        return { tagName, attribs: out };
      },
      a: (tagName, attribs) => {
        const out = { ...attribs };
        if (out.style !== undefined) {
          const cleaned = cleanStyle(out.style);
          if (cleaned) out.style = cleaned;
          else delete out.style;
        }
        if (out.href) {
          out.target = '_blank';
          out.rel = 'noopener noreferrer nofollow';
        }
        return { tagName, attribs: out };
      },
      img: (tagName, attribs) => {
        const out = { ...attribs };
        if (out.style !== undefined) {
          const cleaned = cleanStyle(out.style);
          if (cleaned) out.style = cleaned;
          else delete out.style;
        }
        const src = (out.src ?? '').trim();
        delete out['data-src'];
        if (/^cid:/i.test(src)) {
          const cid = src.slice(4).replace(/^<|>$/g, '').trim();
          const url = inline.get(cid) ?? inline.get(cid.toLowerCase());
          if (url) out.src = url;
          else {
            delete out.src;
            out.alt = out.alt ?? '';
          }
        } else if (/^data:image\//i.test(src)) {
          out.src = src;
        } else if (/^https?:\/\//i.test(src)) {
          if (opts.keepRemoteImages) out.src = src;
          else {
            out['data-src'] = src;
            out.src = TRANSPARENT;
          }
        } else {
          delete out.src;
        }
        return { tagName, attribs: out };
      },
    },
  });
};

/** Plain-text preview for list rows: tags, entities and whitespace collapsed. */
export const snippetOf = (text: string | null | undefined, html: string | null | undefined, max = 200) => {
  let s = (text ?? '').trim();
  if (!s && html) {
    s = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {}, nonTextTags: ['script', 'style', 'head', 'title', 'template', 'noscript'] });
    s = s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  }
  // Drop quoted replies from the preview.
  s = s.replace(/^>.*$/gm, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

/** Text version of an HTML body (for the fulltext index and the plain-text alternative when sending). */
export const htmlToText = (html: string) => {
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote|pre)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ');
  const text = sanitizeHtml(withBreaks, { allowedTags: [], allowedAttributes: {}, nonTextTags: ['script', 'style', 'head', 'title', 'template', 'noscript'] });
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Plain text → simple HTML paragraphs (text-only messages are shown through the same iframe). */
export const textToHtml = (text: string) =>
  `<div style="white-space:pre-wrap;font-family:ui-sans-serif,system-ui,sans-serif;font-size:14px;line-height:1.5">${escapeHtml(text).replace(
    /(https?:\/\/[^\s<]+)/g,
    (u) => `<a href="${u}" target="_blank" rel="noopener noreferrer nofollow">${u}</a>`,
  )}</div>`;
