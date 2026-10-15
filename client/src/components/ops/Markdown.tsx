import { Fragment, type ReactNode } from 'react';
import clsx from 'clsx';

/**
 * Tiny Markdown → React renderer for knowledge-base articles. Everything is emitted as React
 * elements (never innerHTML), so article text can't inject markup. Supported: # headings,
 * paragraphs, unordered / ordered lists, > quotes, fenced and inline code, **bold**, _italic_,
 * [links](https://…) (http/https/mailto only), horizontal rules and simple | tables |.
 */

type Block =
  | { kind: 'h'; level: number; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'quote'; text: string }
  | { kind: 'code'; lang: string; text: string }
  | { kind: 'hr' }
  | { kind: 'table'; header: string[]; rows: string[][] };

const SAFE_HREF = /^(https?:\/\/|mailto:)/i;

export const parseBlocks = (src: string): Block[] => {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const out: Block[] = [];
  let i = 0;
  const flushPara = (buf: string[]) => {
    if (buf.length) out.push({ kind: 'p', text: buf.join(' ') });
    buf.length = 0;
  };
  const para: string[] = [];
  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(/^```\s*(\w+)?\s*$/);
    if (fence) {
      flushPara(para);
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) body.push(lines[i++]);
      i++;
      out.push({ kind: 'code', lang: fence[1] ?? '', text: body.join('\n') });
      continue;
    }
    if (!line.trim()) {
      flushPara(para);
      i++;
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.+?)\s*#*\s*$/);
    if (h) {
      flushPara(para);
      out.push({ kind: 'h', level: h[1].length, text: h[2] });
      i++;
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushPara(para);
      out.push({ kind: 'hr' });
      i++;
      continue;
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      flushPara(para);
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*+]\s+/, ''));
      out.push({ kind: 'ul', items });
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      flushPara(para);
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ''));
      out.push({ kind: 'ol', items });
      continue;
    }
    if (/^>\s?/.test(line)) {
      flushPara(para);
      const q: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, ''));
      out.push({ kind: 'quote', text: q.join(' ') });
      continue;
    }
    if (/^\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\|?\s*:?-{2,}/.test(lines[i + 1])) {
      flushPara(para);
      const cells = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const header = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
      out.push({ kind: 'table', header, rows });
      continue;
    }
    para.push(line.trim());
    i++;
  }
  flushPara(para);
  return out;
};

/** Inline: code, bold, italic, links. Order matters: code spans are opaque. */
const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*\s][^*]*\*)|(_[^_\s][^_]*_)|(\[[^\]]+\]\([^)\s]+\))/g;

export const renderInline = (text: string, key = 'i'): ReactNode => {
  const nodes: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) nodes.push(text.slice(last, at));
    const tok = m[0];
    const k = `${key}-${n++}`;
    if (m[1]) nodes.push(<code key={k} className="rounded bg-surface px-1 py-0.5 font-mono text-[0.85em] text-navy-900">{tok.slice(1, -1)}</code>);
    else if (m[2] || m[3]) nodes.push(<strong key={k}>{renderInline(tok.slice(2, -2), k)}</strong>);
    else if (m[4] || m[5]) nodes.push(<em key={k}>{renderInline(tok.slice(1, -1), k)}</em>);
    else if (m[6]) {
      const lm = tok.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)!;
      const href = lm[2];
      nodes.push(
        SAFE_HREF.test(href) ? (
          <a key={k} href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-600 underline decoration-brand-300 underline-offset-2 hover:text-brand-700">
            {renderInline(lm[1], k)}
          </a>
        ) : (
          <span key={k}>{lm[1]}</span>
        ),
      );
    }
    last = at + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes.length === 1 ? nodes[0] : <Fragment>{nodes}</Fragment>;
};

export const Markdown = ({ source, className }: { source: string; className?: string }) => {
  const blocks = parseBlocks(source);
  return (
    <div className={clsx('space-y-3 text-sm leading-relaxed text-ink/90 [overflow-wrap:anywhere]', className)}>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'h': {
            const cls = b.level === 1 ? 'text-xl font-bold text-navy-900 mt-2' : b.level === 2 ? 'text-lg font-bold text-navy-900 mt-4' : 'text-base font-semibold text-navy-900 mt-3';
            return b.level === 1 ? <h2 key={i} className={cls}>{renderInline(b.text)}</h2> : b.level === 2 ? <h3 key={i} className={cls}>{renderInline(b.text)}</h3> : <h4 key={i} className={cls}>{renderInline(b.text)}</h4>;
          }
          case 'p':
            return <p key={i}>{renderInline(b.text)}</p>;
          case 'ul':
            return (
              <ul key={i} className="list-disc space-y-1 pl-5">
                {b.items.map((it, j) => <li key={j}>{renderInline(it)}</li>)}
              </ul>
            );
          case 'ol':
            return (
              <ol key={i} className="list-decimal space-y-1 pl-5">
                {b.items.map((it, j) => <li key={j}>{renderInline(it)}</li>)}
              </ol>
            );
          case 'quote':
            return <blockquote key={i} className="border-l-4 border-brand-200 pl-3 text-ink/75 italic">{renderInline(b.text)}</blockquote>;
          case 'code':
            return (
              <pre key={i} className="overflow-x-auto rounded-lg bg-navy-950 p-3 font-mono text-xs leading-relaxed text-white/90" data-lang={b.lang || undefined}>
                <code>{b.text}</code>
              </pre>
            );
          case 'hr':
            return <hr key={i} className="border-line" />;
          case 'table':
            return (
              <div key={i} className="overflow-x-auto">
                <table className="min-w-full text-left text-xs">
                  <thead>
                    <tr>{b.header.map((h, j) => <th key={j} className="border-b border-line px-2 py-1.5 font-semibold text-navy-900">{renderInline(h)}</th>)}</tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j} className="border-b border-line/60">{b.header.map((_, c) => <td key={c} className="px-2 py-1.5 align-top">{renderInline(r[c] ?? '')}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </div>
  );
};

/** Markdown → plain text (for "copy answer": the reply goes into a chat box, not a renderer). */
export const markdownToText = (src: string) =>
  src
    .replace(/\r\n?/g, '\n')
    .replace(/```[^\n]*\n([\s\S]*?)```/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1 ($2)')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(\*|_)([^*_\s][^*_]*)\1/g, '$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^(-{3,}|\*{3,})\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
