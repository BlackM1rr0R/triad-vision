import { Prisma } from '@prisma/client';
import { z } from 'zod';

/**
 * Staff marks on a rejected scan (Document.reviewMarks): rectangles in page-relative coordinates (0–1, origin top
 * left) with a short note each, drawn in the admin review UI (client components/review/MarkEditor.tsx) and shown to
 * the client as red numbered boxes over the scan. `page` is 1-based (images always use page 1).
 */

export const MAX_MARKS = 20;
export const MAX_MARK_NOTE = 300;
const EPS = 0.0005;

const unit = z.number().finite().min(0).max(1);

export const reviewMarkSchema = z
  .object({
    page: z.number().int().min(1).max(500).default(1),
    x: unit,
    y: unit,
    w: z.number().finite().min(0.005).max(1),
    h: z.number().finite().min(0.005).max(1),
    note: z.string().trim().max(MAX_MARK_NOTE).default(''),
  })
  .strict()
  .refine((m) => m.x + m.w <= 1 + EPS && m.y + m.h <= 1 + EPS, 'MARK_OUT_OF_PAGE');

export const reviewMarksSchema = z.array(reviewMarkSchema).max(MAX_MARKS);

export type ReviewMark = z.infer<typeof reviewMarkSchema>;

const round = (n: number) => Math.round(n * 10_000) / 10_000;

/** Validated marks, coordinates rounded to 4 decimals and clamped into the page. */
export const normaliseMarks = (marks: ReviewMark[]): ReviewMark[] =>
  marks.map((m) => {
    const x = round(Math.min(m.x, 1));
    const y = round(Math.min(m.y, 1));
    return { page: m.page, x, y, w: round(Math.min(m.w, 1 - x)), h: round(Math.min(m.h, 1 - y)), note: m.note };
  });

/** Database value: marks only on a rejected document; any other status (or no marks) clears them. */
export const marksForStatus = (status: string, marks: ReviewMark[] | undefined): Prisma.InputJsonValue | typeof Prisma.DbNull =>
  status === 'REJECTED' && marks?.length ? (normaliseMarks(marks) as unknown as Prisma.InputJsonValue) : Prisma.DbNull;

/** Marks read back from the database (tolerates malformed values: returns []). */
export const readMarks = (raw: unknown): ReviewMark[] => {
  const parsed = reviewMarksSchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
};
