import { Svg, type IllustrationProps } from './Svg';

/** An open book with a speech bubble. German lessons, guides, the waiting room. */
export const Learning = (p: IllustrationProps) => (
  <Svg viewBox="0 0 200 160" {...p}>
    <circle className="f-sky" cx="100" cy="86" r="70" />
    <path className="f-paper" d="M30 62q34-12 68 4v74q-34-14-68-2Z" />
    <path className="f-paper" d="M170 62q-34-12-68 4v74q34-14 68-2Z" />
    <path className="s-line" d="M44 80q20-6 42 2M44 96q20-6 42 2M44 112q20-6 30 0M114 82q20-8 42-2M114 98q20-8 42-2" strokeWidth="3.5" />
    <rect className="f-ink" x="96" y="64" width="8" height="78" rx="4" />
    <g className="ill-float">
      <path className="f-amber" d="M120 14h52a10 10 0 0 1 10 10v20a10 10 0 0 1-10 10h-30l-12 10v-10h-10a10 10 0 0 1-10-10V24a10 10 0 0 1 10-10Z" />
      <circle className="f-ink" cx="134" cy="34" r="3.5" />
      <circle className="f-ink" cx="146" cy="34" r="3.5" />
      <circle className="f-ink" cx="158" cy="34" r="3.5" />
    </g>
  </Svg>
);
