import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HelpCircle } from 'lucide-react';
import { currentSiteLocale } from '@/i18n';
import { FaqJsonLd } from '@/components/seo/FaqJsonLd';
import { fill, type Block, type ContentLocale, type LocalizedContent, type PageContent } from '@/lib/seoContent/types';

/**
 * Explanatory article + always-visible FAQ under a public tool (lib/seoContent). Static markup without entrance
 * animations, so it is part of the server-rendered HTML and of the first paint. `vars` fills {{placeholders}},
 * `slots` renders the `{ slot }` blocks from live data.
 */

/** The content language of the page (all six site languages have their own text). */
export const useContentLocale = (): ContentLocale => {
  useTranslation(); // re-render on language change
  return currentSiteLocale();
};

/** **bold** and [label](/path) inside a string. */
export const Inline = ({ text }: { text: string }) => {
  const parts: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\((\/[^)\s]*)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1] !== undefined) parts.push(<strong key={m.index} className="font-semibold text-ink">{m[1]}</strong>);
    else
      parts.push(
        <Link key={m.index} to={m[3]} className="font-semibold text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary">
          {m[2]}
        </Link>,
      );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
};

const BlockView = ({ block, vars, slots }: { block: Block; vars: Record<string, string>; slots: Record<string, ReactNode> }) => {
  const f = (s: string) => <Inline text={fill(s, vars)} />;
  if (typeof block === 'string') return <p className="leading-relaxed text-muted">{f(block)}</p>;
  if ('h3' in block) return <h3 className="pt-2 font-display text-lg font-semibold text-ink">{fill(block.h3, vars)}</h3>;
  if ('ul' in block)
    return (
      <ul className="space-y-2">
        {block.ul.map((li) => (
          <li key={li} className="flex gap-3 leading-relaxed text-muted">
            <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
            <span>{f(li)}</span>
          </li>
        ))}
      </ul>
    );
  if ('ol' in block)
    return (
      <ol className="list-decimal space-y-2 pl-5 leading-relaxed text-muted marker:font-semibold marker:text-ink">
        {block.ol.map((li) => (
          <li key={li}>{f(li)}</li>
        ))}
      </ol>
    );
  if ('note' in block) return <p className="rounded-2xl border border-line bg-sunken p-4 text-sm leading-relaxed text-muted">{f(block.note)}</p>;
  if ('table' in block) return <ContentTable head={block.table.head.map((h) => fill(h, vars))} rows={block.table.rows.map((r) => r.map((c) => fill(c, vars)))} />;
  return <>{slots[block.slot] ?? null}</>;
};

/** Responsive table (scrolls inside its card on phones, never the page). */
export const ContentTable = ({ head, rows, caption }: { head: string[]; rows: (string | ReactNode)[][]; caption?: string }) => (
  <div className="overflow-x-auto rounded-2xl border border-line bg-card">
    <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
      {caption && <caption className="px-4 pt-3 text-left text-xs text-muted">{caption}</caption>}
      <thead>
        <tr className="border-b border-line bg-sunken">
          {head.map((h) => (
            <th key={h} scope="col" className="px-4 py-2.5 font-semibold text-ink">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) =>
              j === 0 ? (
                <th key={j} scope="row" className="px-4 py-2.5 font-medium text-ink">
                  {typeof c === 'string' ? <Inline text={c} /> : c}
                </th>
              ) : (
                <td key={j} className="px-4 py-2.5 text-muted tabular-nums">
                  {typeof c === 'string' ? <Inline text={c} /> : c}
                </td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const ContentArticle = ({
  content,
  vars = {},
  slots = {},
  className,
}: {
  content: LocalizedContent;
  vars?: Record<string, string>;
  slots?: Record<string, ReactNode>;
  className?: string;
}) => {
  const lng = useContentLocale();
  const c: PageContent = content[lng];
  return (
    <section className={className ?? 'section'} aria-labelledby={`${c.sections[0].id}-h`}>
      <div className="container-x">
        <div className="mx-auto max-w-3xl">
          <span className="eyebrow mb-3">{c.eyebrow}</span>
          {c.sections.map((s, i) => (
            <Fragment key={s.id}>
              <h2 id={`${s.id}-h`} className={`scroll-mt-28 font-display text-2xl font-semibold text-ink sm:text-[1.75rem] ${i ? 'mt-12' : 'mt-1'}`}>
                {fill(s.h2, vars)}
              </h2>
              <div id={s.id} className="mt-4 space-y-4">
                {s.blocks.map((b, j) => (
                  <BlockView key={j} block={b} vars={vars} slots={slots} />
                ))}
              </div>
            </Fragment>
          ))}

          <h2 id={`${c.sections[0].id}-faq`} className="mt-14 flex items-center gap-2 font-display text-2xl font-semibold text-ink sm:text-[1.75rem]">
            <HelpCircle className="size-6 text-primary" aria-hidden /> {c.faqTitle}
          </h2>
          <div className="mt-5 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card shadow-[var(--tv-shadow-card)]">
            {c.faq.map((q) => (
              <div key={q.q} className="px-5 py-4">
                <h3 className="font-semibold text-ink">{fill(q.q, vars)}</h3>
                <p className="mt-1.5 leading-relaxed text-muted">
                  <Inline text={fill(q.a, vars)} />
                </p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-xs leading-relaxed text-muted">
            <Inline text={fill(c.sources, vars)} />
          </p>
          {/* FAQPage JSON-LD of the FAQ shown above (components/seo/FaqJsonLd.tsx). */}
          <FaqJsonLd items={c.faq.map((q) => ({ q: fill(q.q, vars), a: fill(q.a, vars) }))} lng={lng} />
        </div>
      </div>
    </section>
  );
};
