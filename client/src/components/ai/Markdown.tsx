import { Fragment, memo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

/*
 * Small, safe Markdown renderer for assistant answers. It builds React elements only (never
 * innerHTML), so any HTML in the text is shown as text. Supported: paragraphs, headings, bold,
 * italic, inline code, fenced code, links (http/https/mailto/tel and site-relative paths only),
 * bare URLs, bullet and numbered lists (one nesting level), block quotes, rules and tables.
 * It tolerates half-written input while an answer streams in.
 */

const safeHref = (raw: string): string | null => {
  const href = raw.trim();
  if (/^(https?:|mailto:|tel:)/i.test(href)) return href;
  if (href.startsWith('/') && !href.startsWith('//')) return href;
  if (href.startsWith('#')) return href;
  return null;
};

const LinkOut = ({ href, children }: { href: string; children: ReactNode }) =>
  href.startsWith('/') ? (
    <Link to={href} className="font-semibold text-brand-600 underline decoration-brand-600/30 underline-offset-2 hover:decoration-brand-600">
      {children}
    </Link>
  ) : (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="font-semibold text-brand-600 underline decoration-brand-600/30 underline-offset-2 hover:decoration-brand-600">
      {children}
    </a>
  );

const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*|__[^_\n]+__)|(\[[^\]\n]+\]\([^)\s]+\))|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])|(\*[^*\s][^*\n]*\*)/;

const renderInline = (text: string, key = 'i'): ReactNode[] => {
  const out: ReactNode[] = [];
  let rest = text;
  let n = 0;
  while (rest) {
    const m = INLINE.exec(rest);
    if (!m) {
      out.push(rest);
      break;
    }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    const tok = m[0];
    const k = `${key}-${n++}`;
    if (m[1]) out.push(<code key={k} className="rounded bg-surface px-1 py-0.5 font-mono text-[0.85em] text-ink">{tok.slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={k} className="font-semibold text-ink">{renderInline(tok.slice(2, -2), k)}</strong>);
    else if (m[3]) {
      const mm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok)!;
      const href = safeHref(mm[2]);
      out.push(href ? <LinkOut key={k} href={href}>{renderInline(mm[1], k)}</LinkOut> : <Fragment key={k}>{mm[1]}</Fragment>);
    } else if (m[4]) out.push(<LinkOut key={k} href={tok}>{tok.replace(/^https?:\/\//, '')}</LinkOut>);
    else if (m[5]) out.push(<em key={k}>{renderInline(tok.slice(1, -1), k)}</em>);
    rest = rest.slice(m.index + tok.length);
  }
  return out;
};

const LIST_ITEM = /^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$/;
const isTableSep = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
const splitRow = (l: string) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

type ListNode = { ordered: boolean; items: { text: string; children: ListNode | null }[] };

const renderList = (list: ListNode, key: string): ReactNode => {
  const Tag = list.ordered ? 'ol' : 'ul';
  return (
    <Tag key={key} className={list.ordered ? 'my-2 list-decimal space-y-1 pl-5' : 'my-2 list-disc space-y-1 pl-5'}>
      {list.items.map((it, i) => (
        <li key={i} className="pl-0.5">
          {renderInline(it.text, `${key}-${i}`)}
          {it.children && renderList(it.children, `${key}-${i}-c`)}
        </li>
      ))}
    </Tag>
  );
};

export const Markdown = memo(function Markdown({ text, className }: { text: string; className?: string }) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let para: string[] = [];
  const flushPara = () => {
    if (!para.length) return;
    const k = `p${blocks.length}`;
    blocks.push(
      <p key={k} className="my-2 first:mt-0 last:mb-0">
        {para.map((l, j) => (
          <Fragment key={j}>
            {j > 0 && <br />}
            {renderInline(l, `${k}-${j}`)}
          </Fragment>
        ))}
      </p>,
    );
    para = [];
  };

  while (i < lines.length) {
    const line = lines[i];
    const k = `b${blocks.length}`;
    // Fenced code (may be unterminated while streaming)
    if (/^\s*```/.test(line)) {
      flushPara();
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i++]);
      i++;
      blocks.push(
        <pre key={k} className="my-2 overflow-x-auto rounded-lg border border-line bg-surface p-3 font-mono text-xs leading-relaxed text-ink">
          <code>{body.join('\n')}</code>
        </pre>,
      );
      continue;
    }
    if (!line.trim()) {
      flushPara();
      i++;
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flushPara();
      blocks.push(
        <p key={k} className={h[1].length <= 2 ? 'mt-3 mb-1 text-base font-bold text-ink' : 'mt-3 mb-1 text-sm font-bold text-ink'}>
          {renderInline(h[2], k)}
        </p>,
      );
      i++;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flushPara();
      blocks.push(<hr key={k} className="my-3 border-line" />);
      i++;
      continue;
    }
    // Table: header row + separator row
    if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      flushPara();
      const head = splitRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(splitRow(lines[i++]));
      blocks.push(
        <div key={k} className="my-2 overflow-x-auto rounded-lg border border-line">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-surface">
              <tr>
                {head.map((c, j) => (
                  <th key={j} className="border-b border-line px-2.5 py-1.5 font-semibold whitespace-nowrap text-ink">
                    {renderInline(c, `${k}-h${j}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="border-b border-line last:border-0">
                  {head.map((_, j) => (
                    <td key={j} className="px-2.5 py-1.5 align-top">
                      {renderInline(r[j] ?? '', `${k}-${ri}-${j}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^\s*>/.test(line)) {
      flushPara();
      const quote: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ''));
      blocks.push(
        <blockquote key={k} className="my-2 border-l-2 border-brand-400 pl-3 text-muted">
          {quote.map((q, j) => (
            <Fragment key={j}>
              {j > 0 && <br />}
              {renderInline(q, `${k}-${j}`)}
            </Fragment>
          ))}
        </blockquote>,
      );
      continue;
    }
    const li = LIST_ITEM.exec(line);
    if (li) {
      flushPara();
      const root: ListNode = { ordered: /\d/.test(li[2]), items: [] };
      const baseIndent = li[1].length;
      while (i < lines.length) {
        const m = LIST_ITEM.exec(lines[i]);
        if (!m) {
          // Continuation line of the previous item
          if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && root.items.length) {
            const last = root.items[root.items.length - 1];
            const target = last.children?.items.at(-1) ?? last;
            target.text += ` ${lines[i].trim()}`;
            i++;
            continue;
          }
          break;
        }
        if (m[1].length > baseIndent + 1 && root.items.length) {
          const last = root.items[root.items.length - 1];
          last.children ??= { ordered: /\d/.test(m[2]), items: [] };
          last.children.items.push({ text: m[3], children: null });
        } else root.items.push({ text: m[3], children: null });
        i++;
      }
      blocks.push(renderList(root, k));
      continue;
    }
    para.push(line);
    i++;
  }
  flushPara();
  return <div className={className}>{blocks}</div>;
});

export default Markdown;
