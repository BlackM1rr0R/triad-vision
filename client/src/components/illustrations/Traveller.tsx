import { Svg, type IllustrationProps } from './Svg';

/** Person with a suitcase on the way to Germany (flight path, plane, Brandenburg Gate). Home hero. */
export const Traveller = (p: IllustrationProps) => (
  <Svg viewBox="0 0 400 380" {...p}>
    <circle className="f-soft" cx="210" cy="200" r="172" />
    <circle className="f-paper ill-float-2" cx="318" cy="92" r="30" />
    <path className="s-ink" d="M58 150Q200 40 336 118" strokeWidth="2.5" strokeDasharray="2 9" opacity=".45" />
    <g className="ill-float" transform="translate(320 110) rotate(22)">
      <path className="f-ink" d="M-16 0 14-5l6 5-6 5Z" />
      <path className="f-ink" d="M-2-1-9-14h6l9 13ZM-2 1-9 14h6l9-13Z" />
    </g>
    <path className="f-sand" d="M64 334h272v14a10 10 0 0 1-10 10H74a10 10 0 0 1-10-10Z" />
    <g className="f-sand" transform="translate(38 226)">
      <rect y="20" width="84" height="11" rx="3" />
      <rect x="20" y="6" width="44" height="14" rx="3" />
      <rect x="6" y="31" width="9" height="77" />
      <rect x="27" y="31" width="9" height="77" />
      <rect x="48" y="31" width="9" height="77" />
      <rect x="69" y="31" width="9" height="77" />
    </g>
    <rect className="f-ink" x="234" y="248" width="72" height="90" rx="12" />
    <rect className="f-amber" x="234" y="282" width="72" height="10" />
    <path className="s-ink" d="M254 248v-14a6 6 0 0 1 6-6h20a6 6 0 0 1 6 6v14" strokeWidth="6" />
    <circle className="f-hair" cx="246" cy="342" r="5" />
    <circle className="f-hair" cx="294" cy="342" r="5" />
    <path className="f-ink" d="m150 340 6-88h40l6 88h-18l-8-60-8 60Z" />
    <path className="f-paper" d="M140 196q36-22 72 0l8 70h-88Z" />
    <path className="f-amber" d="M168 186h16l-8 22Z" />
    <rect className="f-skin" x="166" y="166" width="20" height="24" rx="8" />
    <circle className="f-skin" cx="176" cy="146" r="26" />
    <path className="f-hair" d="M150 146q-2-34 28-34 30 2 24 34-6-16-26-18-18 2-26 18Z" />
    <path className="f-paper" d="M212 204q24 24 30 46l-12 4q-10-20-26-34Z" />
    <circle className="f-skin" cx="238" cy="252" r="7" />
    <path className="f-paper" d="M140 204q-14 30-10 56h12q0-24 8-44Z" />
  </Svg>
);
