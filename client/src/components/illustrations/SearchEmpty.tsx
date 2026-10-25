import { Svg, type IllustrationProps } from './Svg';

/** A magnifying glass over an empty page. "Nothing found" for searches and filters. */
export const SearchEmpty = (p: IllustrationProps) => (
  <Svg viewBox="0 0 200 160" {...p}>
    <circle className="f-sky" cx="100" cy="82" r="70" />
    <rect className="f-paper" x="48" y="26" width="80" height="104" rx="10" />
    <path className="s-line" d="M64 50h48M64 66h36M64 82h44" strokeWidth="5" strokeDasharray="1 9" />
    <g className="ill-float">
      <circle className="f-paper" cx="128" cy="92" r="24" />
      <circle className="s-ink" cx="128" cy="92" r="24" strokeWidth="7" />
      <path className="s-ink" d="m146 110 18 18" strokeWidth="11" />
      <path className="s-amber" d="M118 84a12 12 0 0 1 12-6" strokeWidth="4" />
    </g>
  </Svg>
);
