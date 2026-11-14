/**
 * FAQPage structured data for an FAQ that is visible on the page (Google: mark up only what the visitor can
 * read). Rendered inside the page markup, so it is part of the server-rendered HTML (SSR) and hydrates
 * unchanged (same string on server and client). The head (server/src/lib/seo.ts) adds no FAQPage for these
 * pages, so there is exactly one per page.
 *
 * Answers are plain text: the inline syntax of lib/seoContent (**bold**, [label](/path)) is reduced to its text.
 */

export const plainFaqText = (s: string) =>
  s
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\((\/[^)\s]*)\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

/** JSON for a script element: characters that could close it or open a comment are \u-escaped. */
export const faqJsonLd = (items: { q: string; a: string }[], lng: string) =>
  JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: lng,
    mainEntity: items.map((f) => ({
      '@type': 'Question',
      name: plainFaqText(f.q),
      acceptedAnswer: { '@type': 'Answer', text: plainFaqText(f.a) },
    })),
  }).replace(/[<>&\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

export const FaqJsonLd = ({ items, lng }: { items: { q: string; a: string }[]; lng: string }) => {
  const list = (Array.isArray(items) ? items : []).filter((f) => typeof f?.q === 'string' && typeof f?.a === 'string' && f.q.trim() && f.a.trim());
  if (!list.length) return null;
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqJsonLd(list, lng) }} />;
};
