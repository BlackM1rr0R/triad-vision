import { Svg, type IllustrationProps } from './Svg';

/** Passport on top of a document with lines. Document checklists, "upload your papers" cards. */
export const Documents = (p: IllustrationProps) => (
  <Svg viewBox="0 0 240 200" {...p}>
    <circle className="f-sage" cx="120" cy="104" r="88" />
    <g transform="rotate(6 150 100)">
      <rect className="f-paper" x="104" y="34" width="96" height="124" rx="10" />
      <path className="s-line" d="M120 62h62M120 78h62M120 94h46M120 110h56M120 126h38" strokeWidth="5" />
    </g>
    <g className="ill-float" transform="rotate(-8 92 110)">
      <rect className="f-ink" x="46" y="46" width="88" height="120" rx="11" />
      <rect className="f-hair" x="46" y="46" width="12" height="120" rx="6" opacity=".2" />
      <circle className="s-amber" cx="92" cy="94" r="19" strokeWidth="3.5" />
      <path className="s-amber" d="M92 77v34M75 94h34" strokeWidth="2.5" />
      <rect className="f-amber" x="72" y="132" width="40" height="5" rx="2.5" opacity=".7" />
      <rect className="f-amber" x="78" y="143" width="28" height="4" rx="2" opacity=".45" />
    </g>
  </Svg>
);
