import { useId } from 'react';

/**
 * Semicircle gauge for an NPS value (−100 … 100). The arc is split into the three NPS zones
 * (critical below 0, neutral 0–30, good above 30); the needle marks the value. Null shows an empty gauge.
 */
export const NpsGauge = ({ value, label }: { value: number | null; label: string }) => {
  const titleId = useId();
  const cx = 60;
  const cy = 58;
  const r = 46;
  const point = (v: number) => {
    const a = Math.PI * (1 - (v + 100) / 200); // −100 → left, 100 → right
    return { x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) };
  };
  const arc = (from: number, to: number) => {
    const a = point(from);
    const b = point(to);
    return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
  };
  const needle = value === null ? null : point(Math.max(-100, Math.min(100, value)));
  return (
    <svg viewBox="0 0 120 68" className="h-auto w-full max-w-[11rem]" role="img" aria-labelledby={titleId}>
      <title id={titleId}>{label}</title>
      <path d={arc(-100, 0)} stroke="#e34948" strokeWidth="10" fill="none" opacity={value === null ? 0.25 : 0.85} />
      <path d={arc(0, 30)} stroke="#eda100" strokeWidth="10" fill="none" opacity={value === null ? 0.25 : 0.85} />
      <path d={arc(30, 100)} stroke="#1baf7a" strokeWidth="10" fill="none" opacity={value === null ? 0.25 : 0.85} />
      {needle && (
        <>
          <line x1={cx} y1={cy} x2={needle.x} y2={needle.y} stroke="var(--color-ink)" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx={cx} cy={cy} r="4" fill="var(--color-ink)" />
        </>
      )}
    </svg>
  );
};
