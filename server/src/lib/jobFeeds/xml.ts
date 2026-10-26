/**
 * Small XML writing helpers for the job feeds. Everything that comes from the database goes through
 * `cdata()` or `esc()`, after `clean()` removed characters XML 1.0 does not allow (control characters,
 * lone surrogates, U+FFFE/U+FFFF), so a feed is always well-formed whatever staff typed.
 */

// XML 1.0 Char: #x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] | [#x10000-#x10FFFF]
const INVALID_XML = /[^\u0009\u000A\u000D -퟿-�\u{10000}-\u{10FFFF}]/gu;

export const clean = (s: string | null | undefined) => (s ?? '').replace(INVALID_XML, '');

/** Escaped text content / attribute value. */
export const esc = (s: string | number | null | undefined) =>
  clean(String(s ?? '')).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);

/** CDATA section; a "]]>" inside the text is split across two sections so it can never end the block early. */
export const cdata = (s: string | number | null | undefined) => `<![CDATA[${clean(String(s ?? '')).replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;

/** <tag><![CDATA[value]]></tag> */
export const el = (tag: string, value: string | number | null | undefined) => `<${tag}>${cdata(value)}</${tag}>`;

/** <tag>escaped</tag> — for codes, numbers and dates. */
export const elText = (tag: string, value: string | number | null | undefined) => `<${tag}>${esc(value)}</${tag}>`;

export const XML_DECL = '<?xml version="1.0" encoding="UTF-8"?>';
