import { memo, useLayoutEffect, useRef, type ClipboardEvent, type KeyboardEvent, type MutableRefObject } from 'react';
import clsx from 'clsx';
import type { Run, TextBlock } from './api';
import { domToRuns, runsLength, runsToHtml, setOffsets } from './richText';

export interface PendingSelection {
  id: string;
  start: number;
  end: number;
}

const STYLE: Record<TextBlock['type'], string> = {
  p: 'text-[15px] leading-relaxed',
  h1: 'text-2xl font-bold leading-snug text-brand-800 dark:text-brand-300',
  h2: 'text-xl font-bold leading-snug text-brand-800 dark:text-brand-300',
  h3: 'text-base font-bold leading-snug',
  ul: 'text-[15px] leading-relaxed',
  ol: 'text-[15px] leading-relaxed',
};

const ALIGN = { left: 'text-left', center: 'text-center', right: 'text-right' } as const;

/**
 * One text block of the document editor: a contentEditable element rendered from runs (only when
 * `renderKey` changes — while typing the browser edits the DOM and the runs are read back on input).
 */
export const RichBlock = memo(function RichBlock({
  block,
  renderKey,
  listNumber,
  placeholder,
  pending,
  register,
  onRuns,
  onKeyDown,
  onPaste,
  onFocus,
}: {
  block: TextBlock;
  renderKey: number;
  listNumber: number;
  placeholder: string;
  pending: MutableRefObject<PendingSelection | null>;
  register: (id: string, el: HTMLDivElement | null) => void;
  onRuns: (id: string, runs: Run[]) => void;
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>, id: string, el: HTMLDivElement) => void;
  onPaste: (e: ClipboardEvent<HTMLDivElement>, id: string, el: HTMLDivElement) => void;
  onFocus: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = runsToHtml(block.runs);
    const p = pending.current;
    if (p && p.id === block.id) {
      pending.current = null;
      el.focus();
      setOffsets(el, p.start, p.end);
    }
    // Only an explicit renderKey change re-renders the DOM (typing must not reset the caret).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderKey]);

  const empty = runsLength(block.runs) === 0;
  const isList = block.type === 'ul' || block.type === 'ol';

  return (
    <div className={clsx('relative', isList && 'pl-7')}>
      {isList && (
        <span className="absolute top-0 left-1 w-5 text-right text-[15px] leading-relaxed text-ink/80 select-none" aria-hidden>
          {block.type === 'ul' ? '•' : `${listNumber}.`}
        </span>
      )}
      {empty && <span className={clsx('pointer-events-none absolute inset-x-0 top-0 text-muted/70 select-none', STYLE[block.type], isList && 'left-7', ALIGN[block.align ?? 'left'])}>{placeholder}</span>}
      <div
        ref={(el) => {
          ref.current = el;
          register(block.id, el);
        }}
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder}
        contentEditable
        suppressContentEditableWarning
        spellCheck
        className={clsx('min-h-[1.5em] break-words whitespace-pre-wrap text-ink outline-none', STYLE[block.type], !isList && ALIGN[block.align ?? 'left'])}
        onInput={(e) => onRuns(block.id, domToRuns(e.currentTarget))}
        onKeyDown={(e) => onKeyDown(e, block.id, e.currentTarget)}
        onPaste={(e) => onPaste(e, block.id, e.currentTarget)}
        onFocus={() => onFocus(block.id)}
      />
    </div>
  );
});
