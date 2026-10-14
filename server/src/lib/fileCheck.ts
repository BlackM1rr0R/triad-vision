import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Content sniffing for uploads. The browser-supplied MIME type is trivially spoofable, so every
 * stored file must also start with the bytes its claimed type starts with. Types that could be
 * rendered as HTML/script by a browser are never accepted.
 */

type Matcher = (head: Buffer) => boolean;

const startsWith = (sig: number[], offset = 0): Matcher => (b) =>
  b.length >= offset + sig.length && sig.every((v, i) => b[offset + i] === v);

const ascii = (s: string, offset = 0) => startsWith([...Buffer.from(s, 'latin1')], offset);

const isZip = startsWith([0x50, 0x4b, 0x03, 0x04]);
const isOle = startsWith([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]); // legacy Office
const isText: Matcher = (b) => {
  const probe = b.subarray(0, 512);
  for (const byte of probe) {
    // Allow tab, LF, CR and printable/UTF-8 bytes; reject NUL and other control bytes.
    if (byte === 0 || (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d)) return false;
  }
  const text = probe.toString('utf8').toLowerCase();
  return !text.includes('<script') && !text.includes('<html') && !text.includes('<?php');
};

/** MIME type → matcher + allowed extensions. */
const KINDS: Record<string, { match: Matcher; ext: string[] }> = {
  'application/pdf': { match: ascii('%PDF-'), ext: ['.pdf'] },
  'image/jpeg': { match: startsWith([0xff, 0xd8, 0xff]), ext: ['.jpg', '.jpeg'] },
  'image/png': { match: startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ext: ['.png'] },
  'image/webp': { match: (b) => ascii('RIFF')(b) && ascii('WEBP', 8)(b), ext: ['.webp'] },
  'image/gif': { match: (b) => ascii('GIF87a')(b) || ascii('GIF89a')(b), ext: ['.gif'] },
  'image/avif': { match: ascii('ftypavif', 4), ext: ['.avif'] },
  'image/svg+xml': {
    match: (b) => {
      const t = b.subarray(0, 2048).toString('utf8').toLowerCase();
      return (t.trimStart().startsWith('<?xml') || t.trimStart().startsWith('<svg')) && !t.includes('<script') && !/\son[a-z]+\s*=/.test(t);
    },
    ext: ['.svg'],
  },
  'application/msword': { match: isOle, ext: ['.doc'] },
  'application/vnd.ms-excel': { match: isOle, ext: ['.xls'] },
  'application/vnd.ms-powerpoint': { match: isOle, ext: ['.ppt'] },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { match: isZip, ext: ['.docx'] },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { match: isZip, ext: ['.xlsx'] },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { match: isZip, ext: ['.pptx'] },
  'application/vnd.oasis.opendocument.text': { match: isZip, ext: ['.odt'] },
  'application/vnd.oasis.opendocument.spreadsheet': { match: isZip, ext: ['.ods'] },
  'application/zip': { match: isZip, ext: ['.zip'] },
  'application/x-zip-compressed': { match: isZip, ext: ['.zip'] },
  'text/plain': { match: isText, ext: ['.txt', '.md', '.log'] },
  'text/csv': { match: isText, ext: ['.csv'] },
  'application/rtf': { match: ascii('{\\rtf'), ext: ['.rtf'] },
  'text/rtf': { match: ascii('{\\rtf'), ext: ['.rtf'] },
};

/** Extension → canonical MIME type, used when the client sends a generic type (e.g. octet-stream). */
const BY_EXT = new Map<string, string>();
for (const [mime, k] of Object.entries(KINDS)) for (const e of k.ext) if (!BY_EXT.has(e)) BY_EXT.set(e, mime);

export const KNOWN_MIME = new Set(Object.keys(KINDS));

/** Case documents (visa workflow): PDF, images and Word. */
export const CASE_DOC_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

/** Public CMS images. */
export const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/avif']);

/** Staff workspace: everything above except SVG (served inline to other staff). */
export const WORKSPACE_MIME = new Set([...KNOWN_MIME].filter((m) => m !== 'image/svg+xml'));

/** Types browsers can show inline safely (with nosniff + a sandboxed CSP). */
export const INLINE_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'text/plain', 'text/csv']);

/** Picks the MIME type to store: the client's if it is known and fits the extension, else by extension. */
export const resolveMime = (claimed: string, originalName: string): string | null => {
  const ext = path.extname(originalName).toLowerCase();
  const kind = KINDS[claimed];
  if (kind && kind.ext.includes(ext)) return claimed;
  return BY_EXT.get(ext) ?? null;
};

export class FileCheckError extends Error {
  constructor(public code: 'UNSUPPORTED_FILE_TYPE' | 'FILE_CONTENT_MISMATCH') {
    super(code);
  }
}

/** Reads the head of a stored file and verifies it matches `mime`. Throws FileCheckError. */
export const verifyStoredFile = async (filePath: string, mime: string) => {
  const kind = KINDS[mime];
  if (!kind) throw new FileCheckError('UNSUPPORTED_FILE_TYPE');
  const fh = await fs.open(filePath, 'r');
  try {
    const head = Buffer.alloc(4096);
    const { bytesRead } = await fh.read(head, 0, head.length, 0);
    if (bytesRead === 0 || !kind.match(head.subarray(0, bytesRead))) throw new FileCheckError('FILE_CONTENT_MISMATCH');
  } finally {
    await fh.close();
  }
};

/** Same check on an in-memory buffer. */
export const bufferMatches = (buf: Buffer, mime: string) => {
  const kind = KINDS[mime];
  return !!kind && buf.length > 0 && kind.match(buf.subarray(0, 4096));
};
