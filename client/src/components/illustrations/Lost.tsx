import { Svg, type IllustrationProps } from './Svg';

/** A signpost with arrows pointing different ways and a dashed path. 404 and route errors. */
export const Lost = (p: IllustrationProps) => (
  <Svg viewBox="0 0 260 220" {...p}>
    <circle className="f-soft" cx="130" cy="112" r="96" />
    <path className="s-ink" d="M30 196c40-20 70 4 100-10s58-30 100-8" strokeWidth="3" strokeDasharray="2 10" opacity=".4" />
    <path className="f-sand" d="M60 190h140v8a6 6 0 0 1-6 6H66a6 6 0 0 1-6-6Z" />
    <rect className="f-ink" x="124" y="44" width="12" height="148" rx="4" />
    <g className="ill-float">
      <path className="f-amber" d="M136 58h62l14 14-14 14h-62Z" />
      <path className="s-ink" d="M150 72h36" strokeWidth="4" opacity=".6" />
    </g>
    <g className="ill-float-2">
      <path className="f-paper" d="M124 96H64l-14 14 14 14h60Z" />
      <path className="s-line" d="M74 110h36" strokeWidth="4" />
    </g>
    <circle className="f-ink" cx="130" cy="40" r="9" />
    <circle className="f-amber" cx="214" cy="160" r="6" />
    <path className="s-ink" d="M206 44a10 10 0 1 1 14 9c-3 2-4 4-4 7m0 8v1" strokeWidth="4" opacity=".7" />
  </Svg>
);
