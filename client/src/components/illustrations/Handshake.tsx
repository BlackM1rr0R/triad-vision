import { Svg, type IllustrationProps } from './Svg';

/** Two hands meeting. Cooperation with employers and partners, signed contracts. */
export const Handshake = (p: IllustrationProps) => (
  <Svg viewBox="0 0 200 160" {...p}>
    <circle className="f-sage" cx="100" cy="82" r="70" />
    <path className="f-ink" d="M10 70h40l18 14-10 26H10Z" />
    <path className="f-amber" d="M190 70h-40l-18 14 10 26h48Z" />
    <path className="f-skin" d="m60 84 26-14q10-4 18 2l26 18q6 6 0 12t-12 0l-6-5 4 5q4 7-2 11t-12-2l-4-4 2 4q2 7-4 9t-10-3l-24-22Z" />
    <path className="f-skin" d="m140 84-20-12q-8-4-16 0l-16 10q-6 4-2 9t10 1l14-7 30 26Z" opacity=".9" />
    <g className="ill-float">
      <circle className="f-paper" cx="100" cy="30" r="12" />
      <path className="f-amber" d="M100 25q4-6 8-1 3 5-8 12-11-7-8-12 4-5 8 1Z" />
    </g>
  </Svg>
);
