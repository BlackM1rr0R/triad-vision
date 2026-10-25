import { Svg, type IllustrationProps } from './Svg';

/** A calendar page with one day marked. Appointments, bookings, interviews. */
export const CalendarDay = (p: IllustrationProps) => (
  <Svg viewBox="0 0 200 160" {...p}>
    <circle className="f-peach" cx="100" cy="84" r="70" opacity=".8" />
    <rect className="f-paper" x="44" y="30" width="112" height="104" rx="12" />
    <path className="f-ink" d="M44 42a12 12 0 0 1 12-12h88a12 12 0 0 1 12 12v12H44Z" />
    <path className="s-ink" d="M72 22v16M128 22v16" strokeWidth="6" />
    <g className="f-line">
      <rect x="58" y="66" width="16" height="12" rx="3" />
      <rect x="82" y="66" width="16" height="12" rx="3" />
      <rect x="130" y="66" width="16" height="12" rx="3" />
      <rect x="58" y="88" width="16" height="12" rx="3" />
      <rect x="82" y="88" width="16" height="12" rx="3" />
      <rect x="106" y="88" width="16" height="12" rx="3" />
      <rect x="130" y="88" width="16" height="12" rx="3" />
      <rect x="58" y="110" width="16" height="12" rx="3" />
      <rect x="82" y="110" width="16" height="12" rx="3" />
    </g>
    <rect className="f-amber" x="104" y="62" width="20" height="20" rx="5" />
    <g className="ill-float">
      <circle className="f-sage" cx="154" cy="122" r="16" />
      <path className="s-ink" d="m146 122 6 6 10-11" strokeWidth="4" />
    </g>
  </Svg>
);
