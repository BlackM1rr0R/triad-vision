import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { VIZ, VIZ_TRACK } from './format';
import './parts';

/**
 * Progress ring (a meter, not a pie): one value against a whole. The unfilled track is a lighter step of the
 * same hue; the arc animates in only when motion is allowed. The centre carries the number in text tokens.
 */
export const RingGauge = ({
  value,
  max = 100,
  size = 88,
  stroke = 8,
  color = VIZ[0],
  label,
  center,
  sub,
}: {
  value: number | null;
  max?: number;
  size?: number;
  stroke?: number;
  color?: string;
  /** Accessible name ("Approval rate"). */
  label: string;
  /** Text in the middle (defaults to the percent). */
  center?: ReactNode;
  sub?: ReactNode;
}) => {
  const { t } = useTranslation();
  const frac = value === null || max <= 0 ? 0 : Math.max(0, Math.min(1, value / max));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.round(frac * 1000) / 10;
  return (
    <div className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }} role="img" aria-label={t('viz.ringAria', { label, value: value === null ? '—' : `${pct}%` })}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={VIZ_TRACK} strokeWidth={stroke} />
        {frac > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${(c * frac).toFixed(2)} ${c.toFixed(2)}`}
            className="motion-safe:transition-[stroke-dasharray] motion-safe:duration-700"
          />
        )}
      </svg>
      <span className="pointer-events-none absolute inset-0 grid place-content-center text-center" aria-hidden>
        <span className="text-base leading-tight font-bold text-ink">{center ?? (value === null ? '—' : `${Math.round(pct)}%`)}</span>
        {sub && <span className="text-[10px] leading-tight text-muted">{sub}</span>}
      </span>
    </div>
  );
};
