import type { ReactNode } from 'react';
import clsx from 'clsx';

export type IllustrationProps = {
  className?: string;
  /** Gives the drawing a text alternative (role="img"). Without it the SVG is decorative (aria-hidden). */
  title?: string;
  /** Gentle float on one or two shapes; CSS only, off for reduced motion and "Stop animations". */
  animated?: boolean;
};

/**
 * Shared frame of the illustration set: painted with the --ill-* tokens (index.css) through the .f-* / .s-*
 * classes, so every drawing works on the light and the dark theme without its own colours.
 */
export const Svg = ({ viewBox, className, title, animated, children }: IllustrationProps & { viewBox: string; children: ReactNode }) => (
  <svg
    viewBox={viewBox}
    xmlns="http://www.w3.org/2000/svg"
    className={clsx('tv-ill', animated && 'is-animated', className)}
    role={title ? 'img' : undefined}
    aria-hidden={title ? undefined : true}
    focusable="false"
  >
    {title && <title>{title}</title>}
    {children}
  </svg>
);
