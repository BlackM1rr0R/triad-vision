import { cloneElement, isValidElement, useId, useState, type ReactElement, type ReactNode } from 'react';
import clsx from 'clsx';

export type TooltipProps = {
  /** Tooltip text (short; supplementary — never the only accessible name of an icon button). */
  content: ReactNode;
  /** One focusable element (button, link). It gets aria-describedby. */
  children: ReactElement<Record<string, unknown>>;
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
};

const SIDE = {
  top: 'bottom-full left-1/2 mb-1.5 -translate-x-1/2',
  bottom: 'top-full left-1/2 mt-1.5 -translate-x-1/2',
  left: 'right-full top-1/2 mr-1.5 -translate-y-1/2',
  right: 'left-full top-1/2 ml-1.5 -translate-y-1/2',
} as const;

/**
 * CSS tooltip shown on hover and keyboard focus (no positioning library). Escape hides it until the
 * pointer / focus leaves. Use for short hints; it is clipped by `overflow-hidden` ancestors.
 *
 *   <Tooltip content="Download PDF"><IconButton icon={Download} label="Download PDF" tooltip={false} /></Tooltip>
 */
export const Tooltip = ({ content, children, side = 'top', className }: TooltipProps) => {
  const id = useId();
  const [hidden, setHidden] = useState(false);
  if (!isValidElement(children)) return children;
  const prev = (children.props as { 'aria-describedby'?: string })['aria-describedby'];
  return (
    <span
      className="group/tt relative inline-flex"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !hidden) {
          setHidden(true);
          e.stopPropagation();
        }
      }}
      onMouseLeave={() => setHidden(false)}
      onBlur={() => setHidden(false)}
    >
      {cloneElement(children, { 'aria-describedby': [prev, id].filter(Boolean).join(' ') })}
      <span
        role="tooltip"
        id={id}
        className={clsx(
          // inverse of the page: dark chip in light mode, light chip in dark mode
          'pointer-events-none absolute z-[130] w-max max-w-64 rounded-md bg-ink px-2 py-1 text-xs leading-snug font-medium text-canvas opacity-0 shadow-[var(--tv-shadow-raised)] transition-opacity duration-150',
          !hidden && 'group-focus-within/tt:opacity-100 group-hover/tt:opacity-100 group-hover/tt:delay-150',
          SIDE[side],
          className,
        )}
      >
        {content}
      </span>
    </span>
  );
};
