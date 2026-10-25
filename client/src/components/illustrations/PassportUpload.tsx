import { Svg, type IllustrationProps } from './Svg';

/** Passport with an upload badge. The portal's "next step" card when a document is asked for. */
export const PassportUpload = (p: IllustrationProps) => (
  <Svg viewBox="0 0 300 240" {...p}>
    <ellipse className="f-paper" cx="150" cy="216" rx="110" ry="12" opacity=".6" />
    <g transform="rotate(-8 150 120)">
      <rect className="f-ink" x="88" y="30" width="124" height="170" rx="14" />
      <rect className="f-hair" x="88" y="30" width="16" height="170" rx="8" opacity=".22" />
      <circle className="s-amber" cx="150" cy="96" r="28" strokeWidth="4" />
      <path className="s-amber" d="M150 72v48M126 96h48" strokeWidth="3" />
      <rect className="f-amber" x="118" y="146" width="64" height="6" rx="3" opacity=".75" />
      <rect className="f-amber" x="126" y="162" width="48" height="5" rx="2.5" opacity=".45" />
    </g>
    <g className="ill-float">
      <circle className="f-amber" cx="234" cy="60" r="30" />
      <path className="s-ink" d="M234 74V46m-11 10 11-11 11 11" strokeWidth="4.5" />
    </g>
    <circle className="f-paper" cx="70" cy="72" r="8" />
    <circle className="f-paper" cx="56" cy="160" r="5" />
  </Svg>
);
