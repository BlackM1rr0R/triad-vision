import { Svg, type IllustrationProps } from './Svg';

/** An open tray with a letter floating above it. Empty message lists, no notifications. */
export const EmptyInbox = (p: IllustrationProps) => (
  <Svg viewBox="0 0 200 160" {...p}>
    <circle className="f-sand" cx="100" cy="84" r="70" opacity=".7" />
    <g className="ill-float">
      <rect className="f-paper" x="66" y="22" width="68" height="46" rx="6" />
      <path className="s-line" d="m68 26 32 22 32-22" strokeWidth="3.5" />
      <circle className="f-amber" cx="130" cy="24" r="7" />
    </g>
    <path className="f-ink" d="M40 96h34l8 14h36l8-14h34v30a10 10 0 0 1-10 10H50a10 10 0 0 1-10-10Z" />
    <path className="f-ink" d="m40 96 16-26h88l16 26h-34l-8 14H82l-8-14Z" opacity=".55" />
  </Svg>
);
