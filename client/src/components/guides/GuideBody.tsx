import { lazy, Suspense, type MouseEvent } from 'react';
import clsx from 'clsx';
import { GUIDE_CALCULATOR_TYPES, type GuideCalculatorType } from './calculators/types';

// The live calculators are their own chunk, fetched only by guides that embed one.
const GuideCalculator = lazy(() => import('./calculators/GuideCalculator'));

type Segment = { kind: 'html'; html: string } | { kind: 'calc'; type: GuideCalculatorType; html: string };

// Placeholder written by server/src/lib/guides/markdown.ts for a `::calculator{type="…"}` line. Its content is
// plain <p>/<strong>/<a> (no nested <div>), so the first </div> closes it.
const PLACEHOLDER = /<div class="guide-calculator" data-calculator="([a-z-]+)">([\s\S]*?)<\/div>/g;

/** Splits server-rendered guide HTML into prose chunks and calculator placeholders (whitelisted types only). */
export const splitGuideHtml = (html: string): Segment[] => {
  const out: Segment[] = [];
  let last = 0;
  for (const m of html.matchAll(PLACEHOLDER)) {
    const type = m[1] as GuideCalculatorType;
    if (!(GUIDE_CALCULATOR_TYPES as readonly string[]).includes(type)) continue;
    const before = html.slice(last, m.index).trim();
    if (before) out.push({ kind: 'html', html: before });
    out.push({ kind: 'calc', type, html: m[2] });
    last = m.index! + m[0].length;
  }
  const rest = html.slice(last).trim();
  if (rest) out.push({ kind: 'html', html: rest });
  return out;
};

/**
 * Body of a guide (public page and admin preview). The HTML comes from the server's markdown renderer, where
 * all source text is escaped. Calculator placeholders become live calculators; until their chunk has loaded
 * (and for readers without JavaScript, via the server-rendered page) the static teaser with the tool link shows.
 */
export const GuideBody = ({ html, onClick, className }: { html: string; onClick?: (e: MouseEvent<HTMLElement>) => void; className?: string }) => {
  const segments = splitGuideHtml(html);
  if (!segments.some((s) => s.kind === 'calc')) return <div className={clsx('prose-guide', className)} onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />;
  return (
    <div className={className} onClick={onClick}>
      {segments.map((s, i) =>
        s.kind === 'html' ? (
          <div key={i} className={clsx('prose-guide', i > 0 && 'mt-4')} dangerouslySetInnerHTML={{ __html: s.html }} />
        ) : (
          <Suspense key={i} fallback={<div className="prose-guide card card-pad my-10 min-h-80 rounded-3xl bg-sunken" dangerouslySetInnerHTML={{ __html: s.html }} />}>
            <GuideCalculator type={s.type} />
          </Suspense>
        ),
      )}
    </div>
  );
};
