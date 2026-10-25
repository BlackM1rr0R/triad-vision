import { Svg, type IllustrationProps } from './Svg';

/** Brandenburg Gate under a warm sun. Germany / arrival / "life in Germany" content. */
export const Germany = (p: IllustrationProps) => (
  <Svg viewBox="0 0 240 200" {...p}>
    <circle className="f-sky" cx="120" cy="104" r="90" />
    <circle className="f-amber ill-float-2" cx="172" cy="58" r="20" opacity=".85" />
    <path className="f-sand" d="M24 170h192v10a8 8 0 0 1-8 8H32a8 8 0 0 1-8-8Z" />
    <g className="f-ink">
      <rect x="50" y="70" width="140" height="16" rx="3" />
      <rect x="84" y="50" width="72" height="20" rx="3" />
      <path d="M112 50l8-14 8 14Z" />
      <rect x="58" y="86" width="14" height="84" />
      <rect x="88" y="86" width="14" height="84" />
      <rect x="138" y="86" width="14" height="84" />
      <rect x="168" y="86" width="14" height="84" />
    </g>
    <g className="f-paper" opacity=".5">
      <rect x="58" y="92" width="124" height="4" />
    </g>
    <rect className="f-amber" x="114" y="40" width="12" height="4" rx="2" />
  </Svg>
);
