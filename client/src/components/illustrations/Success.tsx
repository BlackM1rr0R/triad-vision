import { Svg, type IllustrationProps } from './Svg';

/** Approved visa: a passport page with a big check and confetti. Success screens and "done" moments. */
export const Success = (p: IllustrationProps) => (
  <Svg viewBox="0 0 240 200" {...p}>
    <circle className="f-soft" cx="120" cy="104" r="88" />
    <g transform="rotate(-5 120 108)">
      <rect className="f-paper" x="66" y="40" width="108" height="136" rx="12" />
      <path className="s-line" d="M84 136h72M84 152h48" strokeWidth="5" />
      <circle className="f-sage" cx="120" cy="90" r="32" />
      <path className="s-ink" d="m104 90 11 11 21-22" strokeWidth="7" />
    </g>
    <g className="ill-float">
      <rect className="f-amber" x="40" y="54" width="10" height="10" rx="2" transform="rotate(20 45 59)" />
      <circle className="f-ink" cx="196" cy="70" r="5" />
      <path className="s-amber" d="M190 140l10 6M196 128l12-2" strokeWidth="4" />
    </g>
    <g className="ill-float-2">
      <circle className="f-peach" cx="48" cy="140" r="7" />
      <rect className="f-sky" x="186" y="36" width="12" height="12" rx="3" transform="rotate(-15 192 42)" />
      <path className="s-ink" d="M36 98l-8-4M42 88l-4-8" strokeWidth="3.5" opacity=".6" />
    </g>
  </Svg>
);
