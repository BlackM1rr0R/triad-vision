import { aiComplete, CHEAP_MODEL, STRONG_MODEL, type AiCompleteFailure } from '../ai/complete.js';
import { LIMITS, type Block } from '../docCreate/doc.js';
import { renderDocPdf } from '../docCreate/pdf.js';
import { filePart, str } from './input.js';

/**
 * "AI layihə tərcüməsi": a German working translation of an (Azerbaijani / Russian …) document for staff.
 * The model reads the image or the first pages of the PDF and returns structured blocks (headings, field
 * tables, paragraphs, lists) with stamps / seals in [brackets] and signatures as "[Unterschrift]"; the PDF is
 * rendered with the drive's document builder (DejaVu fonts) under the header
 * "ENTWURF – keine beglaubigte Übersetzung / AI-Arbeitsübersetzung". ADMIN scope, cost on the staff member;
 * STRONG_MODEL only when "yüksək keyfiyyət" is ticked.
 */

export const DRAFT_PURPOSE = 'translate-draft';
export const DRAFT_HEADER = 'ENTWURF – keine beglaubigte Übersetzung / AI-Arbeitsübersetzung';
export const TRANSLATIONS_FOLDER = 'Übersetzungen';

const SYSTEM = `You are a translator preparing a German WORKING translation of an official document (usually Azerbaijani or Russian) for a German visa / recognition process. A sworn translator will check it later.
Keep the structure of the original: headings, field/value pairs as tables, paragraphs, lists. Describe stamps and seals in square brackets, e.g. "[Rundstempel: Ministerium für Bildung der Republik Aserbaidschan]", signatures as "[Unterschrift]", photos as "[Lichtbild]", unreadable parts as "[unleserlich]".
Names: use the Latin passport spelling when visible, otherwise transliterate. Dates as DD.MM.YYYY. Translate everything, do not summarise, do not add comments.
Reply with ONE JSON object only, no prose, no code fence:
{"title":"German title of the document","sourceLanguage":"language of the original","blocks":[{"type":"h2","text":"…"},{"type":"p","text":"…"},{"type":"table","rows":[["Feld","Wert"]]},{"type":"list","items":["…"]},{"type":"note","text":"[Rundstempel: …]"}]}`;

type RawBlock = { type?: unknown; text?: unknown; rows?: unknown; items?: unknown };

const cell = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, LIMITS.cellChars) : '');

/** Model blocks → document blocks (unknown types become paragraphs; empty ones are dropped). */
export const toDocBlocks = (raw: unknown): Block[] => {
  const out: Block[] = [];
  for (const b of (Array.isArray(raw) ? raw : []).slice(0, 400) as RawBlock[]) {
    if (!b || typeof b !== 'object') continue;
    const type = typeof b.type === 'string' ? b.type : 'p';
    if (type === 'table' || type === 'fields') {
      const rows = (Array.isArray(b.rows) ? b.rows : [])
        .filter(Array.isArray)
        .map((r) => (r as unknown[]).slice(0, LIMITS.tableCols).map(cell))
        .filter((r) => r.some(Boolean))
        .slice(0, 300);
      if (rows.length) {
        const width = Math.max(...rows.map((r) => r.length));
        out.push({ type: 'table', header: false, rows: rows.map((r) => [...r, ...Array(width - r.length).fill('')]) });
      }
      continue;
    }
    if (type === 'list') {
      for (const item of (Array.isArray(b.items) ? b.items : []).slice(0, 100)) {
        const t = str(item, 2000);
        if (t) out.push({ type: 'ul', runs: [{ t }] });
      }
      continue;
    }
    const text = typeof b.text === 'string' ? b.text.trim().slice(0, 6000) : '';
    if (!text) continue;
    if (type === 'h1' || type === 'h2' || type === 'h3') out.push({ type: type === 'h1' ? 'h2' : type, runs: [{ t: text }] });
    else if (type === 'note') out.push({ type: 'p', runs: [{ t: text, i: true }] });
    else out.push({ type: 'p', runs: [{ t: text }] });
  }
  return out;
};

const deDate = (d: Date) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;

/** "<name without extension> – Arbeitsübersetzung DE (Entwurf).pdf" (safe for the drive). */
export const draftFileName = (source: string) => {
  const base = source.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150) || 'Dokument';
  return `${base} – Arbeitsübersetzung DE (Entwurf).pdf`;
};

export type DraftResult =
  | { ok: true; pdf: Buffer; name: string; model: string; costUsd: number; pages: number }
  | { ok: false; reason: AiCompleteFailure | 'UNSUPPORTED_TYPE' | 'TOO_LARGE' | 'UNREADABLE' };

export const buildTranslationDraft = async (opts: {
  userId: string;
  buf: Buffer;
  mimeType: string;
  filename: string;
  quality?: 'standard' | 'high';
  now?: Date;
}): Promise<DraftResult> => {
  const part = await filePart(opts.buf, opts.mimeType, opts.filename);
  if (!part.ok) return { ok: false, reason: part.reason };
  const high = opts.quality === 'high';
  const res = await aiComplete({
    userId: opts.userId,
    scope: 'ADMIN',
    purpose: DRAFT_PURPOSE,
    model: high ? STRONG_MODEL : CHEAP_MODEL,
    system: SYSTEM,
    input: [{ type: 'text', text: `File: ${opts.filename}. Translate it into German.` }, ...part.parts],
    maxTokens: high ? 4000 : 3000,
    temperature: 0,
    json: true,
    timeoutMs: 90_000,
  });
  if (!res.ok) return { ok: false, reason: res.reason };
  const blocks = toDocBlocks(res.json?.blocks);
  if (!blocks.length) return { ok: false, reason: 'BAD_OUTPUT' };
  const now = opts.now ?? new Date();
  const docTitle = str(res.json?.title, 200);
  const source = str(res.json?.sourceLanguage, 40);
  const pdf = await renderDocPdf(
    {
      title: DRAFT_HEADER,
      letterhead: false,
      date: deDate(now),
      blocks: [
        {
          type: 'p',
          runs: [
            {
              t: `Quelle: ${opts.filename}${source ? ` (${source})` : ''} · ${opts.mimeType === 'application/pdf' ? `Seiten 1–${part.pages}` : 'Bild'} · Modell: ${res.model}. Maschinelle Arbeitsübersetzung zur internen Vorbereitung – ersetzt keine beglaubigte Übersetzung.`,
              i: true,
            },
          ],
        },
        { type: 'hr' },
        ...(docTitle ? [{ type: 'h2' as const, runs: [{ t: docTitle }] }] : []),
        ...blocks,
      ],
    },
    { embedSource: true },
  );
  return { ok: true, pdf, name: draftFileName(opts.filename), model: res.model, costUsd: res.costUsd, pages: part.pages };
};
