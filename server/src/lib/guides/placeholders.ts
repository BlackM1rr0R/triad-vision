/**
 * Review placeholders in guide texts: a fact the owner must confirm before the page goes live is written as
 * "[YOXLA: …]" (az), "[ПРОВЕРИТЬ: …]" (ru), "[PRÜFEN: …]" (de) or "[CHECK: …]" (en/tr/uk). The seeded drafts
 * (prisma/seed/guideDrafts) use them; the admin API refuses to publish a guide that still contains one.
 */
export const PLACEHOLDER_RE = /\[(?:YOXLA|PRÜFEN|ПРОВЕРИТЬ|CHECK):[^\]]*\]/g;

/** Every placeholder in the given texts (in order, duplicates kept). */
export const findPlaceholders = (...texts: (string | null | undefined)[]) =>
  texts.flatMap((t) => (t ? [...t.matchAll(PLACEHOLDER_RE)].map((m) => m[0]) : []));

/** Placeholders anywhere in a guide (title, description, body, FAQ). */
export const guidePlaceholders = (g: { title?: string | null; description?: string | null; body?: string | null; faq?: unknown }) => {
  const faq = Array.isArray(g.faq)
    ? g.faq.flatMap((f) => (f && typeof f === 'object' ? [String((f as { q?: unknown }).q ?? ''), String((f as { a?: unknown }).a ?? '')] : []))
    : [];
  return findPlaceholders(g.title, g.description, g.body, ...faq);
};
