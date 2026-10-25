import { Fragment, type ReactNode } from 'react';
import clsx from 'clsx';
import type { Person } from './types';
import { fullName } from './utils';

/**
 * Markdown-lite for chat bodies, rendered as React elements (never innerHTML): **bold**, _italic_,
 * `code`, ```fenced blocks```, > quotes, - lists, 1. lists, http(s) links (bare or [text](url)) and
 * @mentions highlighted when they name a known person (or everyone).
 */

const SAFE_HREF = /^(https?:\/\/|mailto:)/i;
const ALL = ['all', 'channel', 'here', 'hamı', 'alle', 'все'];

interface Ctx {
  people: Person[];
  meId?: string;
}

const mentionNames = (people: Person[]) =>
  people
    .map((p) => ({ id: p.id, name: fullName(p) }))
    .filter((x) => x.name)
    .sort((a, b) => b.name.length - a.name.length);

/** Inline run: handles code spans first (they protect their content), then the rest. */
const renderInline = (text: string, ctx: Ctx, keyPrefix: string): ReactNode[] => {
  const out: ReactNode[] = [];
  const parts = text.split(/(`[^`\n]+`)/g);
  parts.forEach((part, i) => {
    if (!part) return;
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      out.push(
        <code key={`${keyPrefix}c${i}`} className="rounded bg-sunken px-1 py-0.5 font-mono text-[0.85em] text-ink ring-1 ring-line">
          {part.slice(1, -1)}
        </code>,
      );
    } else out.push(...renderEmphasis(part, ctx, `${keyPrefix}e${i}`));
  });
  return out;
};

const renderEmphasis = (text: string, ctx: Ctx, keyPrefix: string): ReactNode[] => {
  const out: ReactNode[] = [];
  // **bold**, _italic_ / *italic*, ~~strike~~
  const re = /(\*\*[^*\n]+\*\*|~~[^~\n]+~~|(?<![\p{L}\p{N}])_[^_\n]+_(?![\p{L}\p{N}])|(?<![\p{L}\p{N}*])\*[^*\n]+\*(?![\p{L}\p{N}*]))/u;
  let rest = text;
  let n = 0;
  while (rest) {
    const m = re.exec(rest);
    if (!m || m.index === undefined) {
      out.push(...renderLinks(rest, ctx, `${keyPrefix}l${n++}`));
      break;
    }
    if (m.index > 0) out.push(...renderLinks(rest.slice(0, m.index), ctx, `${keyPrefix}l${n++}`));
    const tok = m[0];
    const inner = tok.startsWith('**') || tok.startsWith('~~') ? tok.slice(2, -2) : tok.slice(1, -1);
    const key = `${keyPrefix}m${n++}`;
    if (tok.startsWith('**')) out.push(<strong key={key}>{renderLinks(inner, ctx, key)}</strong>);
    else if (tok.startsWith('~~')) out.push(<s key={key}>{renderLinks(inner, ctx, key)}</s>);
    else out.push(<em key={key}>{renderLinks(inner, ctx, key)}</em>);
    rest = rest.slice(m.index + tok.length);
  }
  return out;
};

const renderLinks = (text: string, ctx: Ctx, keyPrefix: string): ReactNode[] => {
  const out: ReactNode[] = [];
  const re = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(...renderMentions(text.slice(last, idx), ctx, `${keyPrefix}t${n++}`));
    const href = m[2] ?? m[3];
    const label = m[1] ?? m[3];
    if (SAFE_HREF.test(href)) {
      out.push(
        <a key={`${keyPrefix}a${n++}`} href={href} target="_blank" rel="noopener noreferrer" className="break-all text-link underline decoration-link/40 underline-offset-2 hover:decoration-link">
          {label}
        </a>,
      );
    } else out.push(<Fragment key={`${keyPrefix}a${n++}`}>{m[0]}</Fragment>);
    last = idx + m[0].length;
  }
  if (last < text.length) out.push(...renderMentions(text.slice(last), ctx, `${keyPrefix}t${n++}`));
  return out;
};

const renderMentions = (text: string, ctx: Ctx, keyPrefix: string): ReactNode[] => {
  if (!text.includes('@')) return [<Fragment key={keyPrefix}>{text}</Fragment>];
  const names = mentionNames(ctx.people);
  const out: ReactNode[] = [];
  let i = 0;
  let n = 0;
  let buf = '';
  const flush = () => {
    if (buf) out.push(<Fragment key={`${keyPrefix}f${n++}`}>{buf}</Fragment>);
    buf = '';
  };
  while (i < text.length) {
    const ch = text[i];
    const prev = i > 0 ? text[i - 1] : ' ';
    if (ch === '@' && !/[\p{L}\p{N}_]/u.test(prev)) {
      const rest = text.slice(i + 1);
      const lower = rest.toLowerCase();
      let hit: { len: number; id: string | null; label: string } | null = null;
      for (const p of names) {
        const cand = p.name.toLowerCase();
        if (lower.startsWith(cand) && !/[\p{L}\p{N}_]/u.test(rest[cand.length] ?? ' ')) {
          hit = { len: cand.length, id: p.id, label: rest.slice(0, cand.length) };
          break;
        }
      }
      if (!hit) {
        for (const a of ALL) {
          if (lower.startsWith(a) && !/[\p{L}\p{N}_]/u.test(rest[a.length] ?? ' ')) {
            hit = { len: a.length, id: null, label: rest.slice(0, a.length) };
            break;
          }
        }
      }
      if (hit) {
        flush();
        const me = hit.id === null || hit.id === ctx.meId;
        out.push(
          <span key={`${keyPrefix}m${n++}`} className={clsx('rounded px-1 py-0.5 font-semibold', me ? 'bg-warning-bg text-warning-fg' : 'bg-primary/[0.06] text-link')}>
            @{hit.label}
          </span>,
        );
        i += 1 + hit.len;
        continue;
      }
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
};

type Block = { kind: 'p'; lines: string[] } | { kind: 'ul'; items: string[] } | { kind: 'ol'; items: string[] } | { kind: 'quote'; lines: string[] } | { kind: 'code'; text: string };

const parseBlocks = (src: string): Block[] => {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++]);
      i++;
      out.push({ kind: 'code', text: body.join('\n') });
      continue;
    }
    if (/^\s*[-*•]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*•]\s+/, ''));
      out.push({ kind: 'ul', items });
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ''));
      out.push({ kind: 'ol', items });
      continue;
    }
    if (/^>\s?/.test(line)) {
      const q: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, ''));
      out.push({ kind: 'quote', lines: q });
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const p: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^```|^\s*[-*•]\s+|^\s*\d+[.)]\s+|^>\s?/.test(lines[i])) p.push(lines[i++]);
    out.push({ kind: 'p', lines: p });
  }
  return out;
};

const Lines = ({ lines, ctx, k }: { lines: string[]; ctx: Ctx; k: string }) => (
  <>
    {lines.map((l, i) => (
      <Fragment key={i}>
        {i > 0 && <br />}
        {renderInline(l, ctx, `${k}-${i}`)}
      </Fragment>
    ))}
  </>
);

export const ChatMarkdown = ({ source, people, meId, className }: { source: string; people: Person[]; meId?: string; className?: string }) => {
  const ctx: Ctx = { people, meId };
  const blocks = parseBlocks(source);
  return (
    <div className={clsx('space-y-1.5 break-words [overflow-wrap:anywhere]', className)}>
      {blocks.map((b, i) => {
        const k = `b${i}`;
        switch (b.kind) {
          case 'code':
            return (
              <pre key={k} className="overflow-x-auto rounded-lg bg-sunken p-2.5 font-mono text-xs leading-relaxed text-ink ring-1 ring-line">
                {b.text}
              </pre>
            );
          case 'ul':
            return (
              <ul key={k} className="list-disc space-y-0.5 pl-5">
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it, ctx, `${k}-${j}`)}</li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={k} className="list-decimal space-y-0.5 pl-5">
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it, ctx, `${k}-${j}`)}</li>
                ))}
              </ol>
            );
          case 'quote':
            return (
              <blockquote key={k} className="border-l-2 border-line-strong pl-3 text-muted">
                <Lines lines={b.lines} ctx={ctx} k={k} />
              </blockquote>
            );
          default:
            return (
              <p key={k}>
                <Lines lines={b.lines} ctx={ctx} k={k} />
              </p>
            );
        }
      })}
    </div>
  );
};
