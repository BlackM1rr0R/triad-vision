import { Svg, type IllustrationProps } from './Svg';

/** Office buildings of a German employer. "Who are you?" choice card (employer), employer pages. */
export const Employer = (p: IllustrationProps) => (
  <Svg viewBox="0 0 140 140" {...p}>
    <circle className="f-sky" cx="70" cy="70" r="66" />
    <rect className="f-ink" x="34" y="38" width="46" height="84" rx="6" />
    <rect className="f-amber" x="80" y="62" width="30" height="60" rx="6" />
    <g className="f-paper">
      <rect x="42" y="48" width="10" height="10" rx="2" />
      <rect x="62" y="48" width="10" height="10" rx="2" />
      <rect x="42" y="66" width="10" height="10" rx="2" />
      <rect x="62" y="66" width="10" height="10" rx="2" />
      <rect x="42" y="84" width="10" height="10" rx="2" />
      <rect x="62" y="84" width="10" height="10" rx="2" />
      <rect x="52" y="104" width="10" height="18" rx="2" />
    </g>
    <g className="f-ink" opacity=".55">
      <rect x="88" y="72" width="6" height="8" rx="1.5" />
      <rect x="98" y="72" width="6" height="8" rx="1.5" />
      <rect x="88" y="88" width="6" height="8" rx="1.5" />
      <rect x="98" y="88" width="6" height="8" rx="1.5" />
    </g>
    <rect className="f-hair" x="22" y="120" width="96" height="4" rx="2" opacity=".25" />
  </Svg>
);
