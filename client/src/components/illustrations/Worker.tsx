import { Svg, type IllustrationProps } from './Svg';

/** A worker / candidate with a small suitcase. "Who are you?" choice card (worker). */
export const Worker = (p: IllustrationProps) => (
  <Svg viewBox="0 0 140 140" {...p}>
    <circle className="f-soft" cx="70" cy="70" r="66" />
    <path className="f-ink" d="M34 128q4-40 36-40t36 40Z" />
    <path className="f-amber" d="M64 88h12l-6 14Z" />
    <circle className="f-skin" cx="70" cy="56" r="20" />
    <path className="f-hair" d="M50 56q0-26 22-26 22 2 18 26-6-12-20-13-14 1-20 13Z" />
    <g className="ill-float">
      <rect className="f-amber" x="90" y="96" width="28" height="22" rx="5" />
      <path className="s-ink" d="M98 96v-4a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v4" strokeWidth="3" />
    </g>
  </Svg>
);
