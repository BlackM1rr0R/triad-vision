import { z } from 'zod';

/**
 * The document model of the drive's document editor ("Yeni sənəd"): a list of blocks. Text blocks carry
 * runs of text with bold / italic / underline; consecutive list blocks of one kind form one list. The same
 * JSON is embedded in the generated PDF, so the editor can open the PDF again (lib/docCreate/pdf.ts).
 */

export const LIMITS = {
  blocks: 3000,
  runsPerBlock: 400,
  runChars: 20_000,
  tableRows: 2000,
  tableCols: 20,
  cellChars: 4000,
  /** Plain text pasted into "text → PDF / Excel". */
  textChars: 2_000_000,
} as const;

const run = z.object({
  t: z.string().max(LIMITS.runChars),
  b: z.boolean().optional(),
  i: z.boolean().optional(),
  u: z.boolean().optional(),
});
export type Run = z.infer<typeof run>;

const align = z.enum(['left', 'center', 'right']).optional();

const textBlock = z.object({
  id: z.string().max(40).optional(),
  type: z.enum(['p', 'h1', 'h2', 'h3', 'ul', 'ol']),
  align,
  runs: z.array(run).max(LIMITS.runsPerBlock),
});

const tableBlock = z.object({
  id: z.string().max(40).optional(),
  type: z.literal('table'),
  header: z.boolean().optional(),
  rows: z
    .array(z.array(z.string().max(LIMITS.cellChars)).max(LIMITS.tableCols))
    .min(1)
    .max(LIMITS.tableRows),
});

const ruleBlock = z.object({ id: z.string().max(40).optional(), type: z.enum(['hr', 'pagebreak']) });

export const blockSchema = z.union([textBlock, tableBlock, ruleBlock]);
export type Block = z.infer<typeof blockSchema>;
export type TextBlock = z.infer<typeof textBlock>;
export type TableBlock = z.infer<typeof tableBlock>;

export const docSchema = z.object({
  title: z.string().trim().max(300).default(''),
  /** Company letterhead (name and address from the legal / contact settings) at the top of page 1. */
  letterhead: z.boolean().default(false),
  /** Date line under the letterhead (free text, e.g. "18.10.2026"); empty = none. */
  date: z.string().trim().max(60).nullable().optional(),
  blocks: z.array(blockSchema).max(LIMITS.blocks),
});
export type DocModel = z.infer<typeof docSchema>;

/** A plain paragraph. */
export const para = (text: string, type: TextBlock['type'] = 'p'): TextBlock => ({ type, runs: [{ t: text }] });

/**
 * Plain text → blocks: blank lines separate paragraphs, "# " / "## " / "### " are headings, "- " / "• " /
 * "* " bullets and "1. " numbered items; single line breaks inside a paragraph are kept.
 */
export const textToBlocks = (text: string): Block[] => {
  const out: Block[] = [];
  let buf: string[] = [];
  const flush = () => {
    if (buf.length) out.push(para(buf.join('\n')));
    buf = [];
  };
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) {
      flush();
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      out.push(para(h[2], (`h${h[1].length}` as 'h1' | 'h2' | 'h3')));
      continue;
    }
    const bullet = /^\s*[-•*]\s+(.*)$/.exec(line);
    if (bullet) {
      flush();
      out.push(para(bullet[1], 'ul'));
      continue;
    }
    const num = /^\s*\d{1,3}[.)]\s+(.*)$/.exec(line);
    if (num) {
      flush();
      out.push(para(num[1], 'ol'));
      continue;
    }
    buf.push(line);
  }
  flush();
  return out.slice(0, LIMITS.blocks);
};
