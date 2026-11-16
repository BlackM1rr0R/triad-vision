import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Gauge } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { registerCopy } from '@/i18n';
import { pagesReadiness } from '@/i18n/pagesReadiness';

registerCopy(pagesReadiness);

/** GET /api/account/readiness (server/src/lib/readiness). */
export type PartKey = 'language' | 'documents' | 'skills' | 'housing' | 'money';
export interface ReadinessPart {
  key: PartKey;
  score: number;
  weight: number;
  points: number;
  detail: Record<string, string | number | boolean | null>;
  next: { key: string; to: string; gain: number } | null;
}
export interface ReadinessData {
  score: number;
  parts: ReadinessPart[];
  history: { day: string; score: number }[];
  money: Record<string, string>;
  caseId: string | null;
  weights: Record<PartKey, number>;
}

export const READINESS_KEY = ['account-readiness'] as const;
export const useReadiness = () =>
  useQuery({ queryKey: READINESS_KEY, queryFn: async () => (await api.get<ReadinessData>('/account/readiness')).data, staleTime: 60_000 });

export const levelOf = (score: number) => (score >= 100 ? 'done' : score >= 75 ? 'high' : score >= 40 ? 'mid' : 'low');

/** Animated progress ring (SVG). The number counts up; reduced motion shows the value at once. */
export const ReadinessRing = ({ score, size = 140, stroke = 12 }: { score: number; size?: number; stroke?: number }) => {
  const { t } = useTranslation();
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return setShown(score);
    let raf = 0;
    const start = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 900);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(from + (score - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [score]);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const tone = score >= 75 ? 'text-success' : score >= 40 ? 'text-primary' : 'text-warning';
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={t('readiness.ringLabel', { score })}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-sunken" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - shown / 100)}
          className={tone}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center" aria-hidden>
        <div>
          <p className="font-display text-4xl leading-none font-bold text-ink tabular-nums" style={{ fontSize: size * 0.28 }}>
            {shown}
          </p>
          <p className="mt-0.5 text-[11px] text-muted">{t('readiness.card.of')}</p>
        </div>
      </div>
    </div>
  );
};

/** Small trend line of the daily snapshots (single series: no legend; each point has a tooltip; table for screen readers). */
export const TrendLine = ({ history, height = 72 }: { history: { day: string; score: number }[]; height?: number }) => {
  const { t } = useTranslation();
  const { date } = useL10n();
  const [hover, setHover] = useState<number | null>(null);
  if (history.length < 2) return <p className="text-sm text-muted">{t('readiness.history.empty')}</p>;
  const w = 320;
  const pad = 6;
  const x = (i: number) => pad + (i * (w - 2 * pad)) / (history.length - 1);
  const y = (s: number) => pad + ((100 - s) * (height - 2 * pad)) / 100;
  const d = history.map((h, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(h.score).toFixed(1)}`).join(' ');
  const h = hover != null ? history[hover] : null;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${w} ${height}`} className="h-auto w-full text-primary" preserveAspectRatio="none" aria-hidden onMouseLeave={() => setHover(null)}>
        <line x1={pad} x2={w - pad} y1={y(50)} y2={y(50)} stroke="currentColor" strokeWidth={1} className="text-line" strokeDasharray="3 4" />
        <path d={d} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {history.map((p, i) => (
          <g key={p.day}>
            <rect x={x(i) - (w / history.length) / 2} y={0} width={w / history.length} height={height} fill="transparent" onMouseEnter={() => setHover(i)} />
            {(i === history.length - 1 || hover === i) && <circle cx={x(i)} cy={y(p.score)} r={4} fill="currentColor" stroke="var(--tv-surface, #fff)" strokeWidth={2} />}
          </g>
        ))}
      </svg>
      {h && (
        <p className="pointer-events-none absolute -top-2 right-0 rounded-lg border border-line bg-card px-2 py-0.5 text-xs text-ink shadow-sm tabular-nums">
          {t('readiness.history.point', { date: date(h.day), score: h.score })}
        </p>
      )}
      <table className="sr-only">
        <caption>{t('readiness.history.table')}</caption>
        <tbody>
          {history.map((p) => (
            <tr key={p.day}>
              <td>{date(p.day)}</td>
              <td>{p.score}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/** Next-step text of a part. */
export const useNextText = () => {
  const { t } = useTranslation();
  return (p: ReadinessPart) => (p.next ? t(`readiness.next.${p.next.key}`, { level: p.detail.nextLevel ?? '' }) : '');
};

/** Portal dashboard card: ring, level, the step with the biggest gain, link to the detail page. */
export const ReadinessCard = () => {
  const { t } = useTranslation();
  const q = useReadiness();
  const nextText = useNextText();
  if (!q.data) return null;
  const best = q.data.parts.filter((p) => p.next).sort((a, b) => (b.next!.gain ?? 0) - (a.next!.gain ?? 0))[0];
  return (
    <section className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6" aria-labelledby="readiness-card-h">
      <ReadinessRing score={q.data.score} size={112} stroke={10} />
      <div className="min-w-0 flex-1">
        <h2 id="readiness-card-h" className="type-section-title flex items-center gap-2 text-ink">
          <Gauge className="size-5 text-primary" aria-hidden /> {t('readiness.card.title')}
        </h2>
        <p className="mt-0.5 text-sm font-semibold text-muted">{t(`readiness.level.${levelOf(q.data.score)}`)}</p>
        {best?.next && (
          <Link to={best.next.to} className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-line px-3 py-2 hover:bg-sunken">
            <span className="min-w-0">
              <span className="block text-[11px] text-muted">
                {t('readiness.card.next')} · {t(`readiness.parts.${best.key}`)}
              </span>
              <span className="block text-sm font-semibold text-ink">{nextText(best)}</span>
            </span>
            <span className="shrink-0 rounded-full bg-success-bg px-2 py-0.5 text-xs font-semibold text-success-fg">{t('readiness.gain', { gain: best.next.gain })}</span>
          </Link>
        )}
        <Link to="/account/readiness" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-link hover:underline">
          {t('readiness.card.open')} <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </section>
  );
};
