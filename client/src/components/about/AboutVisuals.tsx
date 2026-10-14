import { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useInView } from 'framer-motion';
import { MapPin, Plane } from 'lucide-react';
import { Counter } from '@/components/motion';
import { Flag } from '@/components/ui/Flag';
import { useL10n } from '@/lib/l10n';
import type { Office, Stat } from '@/lib/types';
import { AZERBAIJAN, GERMANY, NAKHCHIVAN, makeProjection, type LngLat } from './geo';
import { ChartCard } from './shared';

const EASE = 'cubic-bezier(0.22,1,0.36,1)';

const findStat = (stats: Stat[] | undefined, icon: string, fallback: number) => {
  const s = stats?.find((x) => x.icon === icon);
  return { value: s?.value ?? fallback, prefix: s?.prefix ?? '', suffix: s?.suffix ?? '', label: s?.label };
};

/** Key figures drawn as unit charts / gauges. All values come from the CMS stats (with the real figures as fallback). */
export const NumbersCharts = ({ stats }: { stats: Stat[] | undefined }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const ref = useRef<HTMLDivElement>(null);
  const on = useInView(ref, { once: true, margin: '-80px' });

  const workers = findStat(stats, 'Users', 500);
  const visa = findStat(stats, 'ShieldCheck', 98);
  const partners = findStat(stats, 'Building2', 25);
  const industries = findStat(stats, 'HardHat', 10);
  const processing = findStat(stats, 'Clock', 8);
  const procMin = 3;
  const procMax = Math.max(processing.value, procMin + 1);

  const dots = Math.min(100, Math.round(workers.value / 10));
  const squares = Math.min(60, partners.value);
  const segs = Math.max(1, Math.min(24, industries.value));
  const pct = Math.min(100, visa.value);

  const labelOf = (s: { label?: Stat['label'] }, fb: string) => (s.label ? tr(s.label) : fb);
  const rows: [string, string][] = [
    [labelOf(workers, 'workers'), `${workers.prefix}${workers.value}${workers.suffix}`],
    [labelOf(visa, 'visa'), `${visa.value}%`],
    [labelOf(partners, 'partners'), `${partners.value}${partners.suffix}`],
    [labelOf(industries, 'industries'), `${industries.value}${industries.suffix}`],
    [t('aboutPage.numbers.rangeLabel'), `${procMin}–${procMax}`],
  ];

  // ring geometry
  const R = 52;
  const C = 2 * Math.PI * R;

  return (
    <div ref={ref}>
      <div className="sr-only">
      <table>
        <caption>{t('aboutPage.numbers.tableCaption')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('aboutPage.numbers.metric')}</th>
            <th scope="col">{t('aboutPage.numbers.value')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <th scope="row">{k}</th>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      <div aria-hidden className="grid gap-4 sm:gap-5 md:grid-cols-6 lg:gap-6">
        {/* workers: unit chart */}
        <ChartCard className="md:col-span-3" title={labelOf(workers, '')} note={t('aboutPage.numbers.perDot')}>
          <div className="flex items-end justify-between gap-4">
            <Counter to={workers.value} prefix={workers.prefix} suffix={workers.suffix} className="font-display text-4xl font-extrabold text-navy-900 sm:text-5xl" />
          </div>
          <svg viewBox="0 0 200 104" className="mt-4 w-full">
            {Array.from({ length: dots }).map((_, i) => {
              const col = i % 10;
              const row = Math.floor(i / 10);
              return (
                <circle
                  key={i}
                  cx={10 + col * 20}
                  cy={10 + row * 21}
                  r={7}
                  fill="var(--color-brand-600)"
                  style={{ opacity: on ? 1 : 0.08, transition: `opacity .5s ${EASE} ${0.15 + i * 0.018}s` }}
                />
              );
            })}
          </svg>
        </ChartCard>

        {/* visa outcome ring */}
        <ChartCard className="md:col-span-3" title={labelOf(visa, '')} note={t('aboutPage.numbers.ofApplications')}>
          <div className="flex items-center gap-6">
            <svg viewBox="0 0 128 128" className="w-32 shrink-0 -rotate-90 sm:w-36">
              <circle cx="64" cy="64" r={R} fill="none" stroke="var(--color-brand-100)" strokeWidth="12" />
              <circle
                cx="64"
                cy="64"
                r={R}
                fill="none"
                stroke="var(--color-brand-600)"
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={on ? C * (1 - pct / 100) : C}
                style={{ transition: `stroke-dashoffset 1.6s ${EASE} .2s` }}
              />
            </svg>
            <div>
              <Counter to={visa.value} suffix="%" className="font-display text-4xl font-extrabold text-navy-900 sm:text-5xl" />
              <div className="mt-3 flex items-center gap-2 text-xs text-muted">
                <span className="h-2 w-6 rounded-full bg-brand-600" /> {visa.value}%
                <span className="ml-2 h-2 w-6 rounded-full bg-brand-100" /> {100 - visa.value}%
              </div>
            </div>
          </div>
        </ChartCard>

        {/* partners: squares */}
        <ChartCard className="md:col-span-2" title={labelOf(partners, '')} note={t('aboutPage.numbers.perSquare')}>
          <Counter to={partners.value} suffix={partners.suffix} className="font-display text-4xl font-extrabold text-navy-900" />
          <svg viewBox="0 0 120 120" className="mx-auto mt-4 w-full max-w-[180px]">
            {Array.from({ length: squares }).map((_, i) => (
              <rect
                key={i}
                x={(i % 5) * 24 + 2}
                y={Math.floor(i / 5) * 24 + 2}
                width="20"
                height="20"
                rx="4"
                fill="var(--color-navy-800)"
                style={{ opacity: on ? 1 : 0.08, transition: `opacity .45s ${EASE} ${0.2 + i * 0.03}s` }}
              />
            ))}
          </svg>
        </ChartCard>

        {/* industries: segmented ring */}
        <ChartCard className="md:col-span-2" title={labelOf(industries, '')} note={t('aboutPage.numbers.perSegment')}>
          <div className="relative mx-auto mt-1 w-full max-w-[180px]">
            <svg viewBox="0 0 128 128" className="w-full -rotate-90">
              {Array.from({ length: segs }).map((_, i) => {
                const seg = C / segs;
                return (
                  <circle
                    key={i}
                    cx="64"
                    cy="64"
                    r={R}
                    fill="none"
                    stroke="var(--color-brand-500)"
                    strokeWidth="14"
                    strokeDasharray={`${seg - 4} ${C - seg + 4}`}
                    strokeDashoffset={-i * seg}
                    style={{ opacity: on ? 1 : 0.1, transition: `opacity .45s ${EASE} ${0.2 + i * 0.08}s` }}
                  />
                );
              })}
            </svg>
            <div className="absolute inset-0 grid place-items-center">
              <Counter to={industries.value} suffix={industries.suffix} className="font-display text-3xl font-extrabold text-navy-900" />
            </div>
          </div>
        </ChartCard>

        {/* processing range */}
        <ChartCard className="md:col-span-2" title={t('aboutPage.numbers.rangeLabel')} note={t('aboutPage.numbers.rangeNote')}>
          <p className="font-display text-4xl font-extrabold text-navy-900">
            {procMin}–{procMax}
          </p>
          <svg viewBox="0 0 240 64" className="mt-6 w-full">
            <line x1="8" x2="232" y1="26" y2="26" stroke="var(--color-line)" strokeWidth="2" />
            {[0, 2, 4, 6, 8, 10, 12].map((w) => {
              const x = 8 + (w / 12) * 224;
              return (
                <g key={w}>
                  <line x1={x} x2={x} y1="20" y2="32" stroke="var(--color-line)" strokeWidth="2" />
                  <text x={x} y="52" textAnchor="middle" className="fill-muted text-[10px]">
                    {w}
                  </text>
                </g>
              );
            })}
            <rect
              x={8 + (procMin / 12) * 224}
              y="18"
              height="16"
              rx="8"
              fill="var(--color-brand-600)"
              width={on ? ((procMax - procMin) / 12) * 224 : 0}
              style={{ transition: `width 1.2s ${EASE} .3s` }}
            />
          </svg>
        </ChartCard>
      </div>
    </div>
  );
};

const haversineKm = (a: LngLat, b: LngLat) => {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

const regionName = (locale: string, code: string) => {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
};

/** Azerbaijan ↔ Germany map with office pins and an animated flight arc (draws once on view). */
export const PresenceMap = ({ offices }: { offices: Office[] }) => {
  const { t } = useTranslation();
  const { tr, locale } = useL10n();
  const ref = useRef<HTMLDivElement>(null);
  const on = useInView(ref, { once: true, margin: '-80px' });
  const proj = useMemo(() => makeProjection({ w: 3, e: 53, s: 36.5, n: 57 }, 800, 10), []);

  const baku: LngLat = offices[0] ? [offices[0].lng, offices[0].lat] : [49.87, 40.38];
  const de: LngLat = offices[1] ? [offices[1].lng, offices[1].lat] : [13.39, 52.52];
  const [bx, by] = proj.project(baku);
  const [gx, gy] = proj.project(de);
  const cx = (bx + gx) / 2;
  const cy = Math.min(by, gy) - 120;
  const arc = `M${gx} ${gy} Q${cx} ${cy} ${bx} ${by}`;
  // midpoint of the quadratic curve (t = .5) for the plane
  const mx = 0.25 * gx + 0.5 * cx + 0.25 * bx;
  const my = 0.25 * gy + 0.5 * cy + 0.25 * by;
  const km = Math.round(haversineKm(baku, de) / 10) * 10;

  const [dLx, dLy] = proj.project([10.4, 51.0]);
  const [aLx, aLy] = proj.project([47.7, 39.0]);

  return (
    <div ref={ref} className="relative">
      <svg viewBox={`0 0 ${proj.width} ${proj.height}`} className="w-full" role="img" aria-label={t('aboutPage.presence.mapLabel')}>
        <defs>
          <pattern id="tv-dots" width="16" height="16" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.3" fill="rgba(255,255,255,0.09)" />
          </pattern>
          <linearGradient id="tv-arc" x1="0" x2="1">
            <stop offset="0" stopColor="#ffce00" />
            <stop offset="1" stopColor="#5c9bff" />
          </linearGradient>
        </defs>
        <rect width={proj.width} height={proj.height} fill="url(#tv-dots)" />
        {/* graticule */}
        {[40, 45, 50, 55].map((lat) => {
          const y = proj.project([0, lat])[1];
          return <line key={lat} x1="0" x2={proj.width} y1={y} y2={y} stroke="rgba(255,255,255,0.06)" strokeDasharray="2 6" />;
        })}
        {[10, 20, 30, 40, 50].map((lng) => {
          const x = proj.project([lng, 0])[0];
          return <line key={lng} y1="0" y2={proj.height} x1={x} x2={x} stroke="rgba(255,255,255,0.06)" strokeDasharray="2 6" />;
        })}
        <path d={proj.path(GERMANY)} fill="rgba(92,155,255,0.22)" stroke="#5c9bff" strokeWidth="1.5" strokeLinejoin="round" />
        <path d={proj.path(AZERBAIJAN)} fill="rgba(92,155,255,0.22)" stroke="#5c9bff" strokeWidth="1.5" strokeLinejoin="round" />
        <path d={proj.path(NAKHCHIVAN)} fill="rgba(92,155,255,0.22)" stroke="#5c9bff" strokeWidth="1.5" strokeLinejoin="round" />
        <text x={dLx} y={dLy + 4} textAnchor="middle" className="fill-white/50 text-[13px] font-semibold tracking-widest uppercase">
          {regionName(locale, 'DE')}
        </text>
        <text x={aLx - 30} y={aLy + 62} textAnchor="middle" className="fill-white/50 text-[13px] font-semibold tracking-widest uppercase">
          {regionName(locale, 'AZ')}
        </text>

        <path d={arc} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2" />
        <path
          d={arc}
          fill="none"
          stroke="url(#tv-arc)"
          strokeWidth="2.5"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray="1"
          strokeDashoffset={on ? 0 : 1}
          style={{ transition: `stroke-dashoffset 2s ${EASE} .3s` }}
        />
        <g transform={`translate(${mx} ${my})`} style={{ opacity: on ? 1 : 0, transition: 'opacity .6s ease 1.6s' }}>
          <circle r="16" fill="#1565e8" />
          <g transform="translate(-9 -9) rotate(45 9 9)">
            <Plane width={18} height={18} color="#fff" />
          </g>
        </g>

        {[
          { x: gx, y: gy, label: offices[1] ? tr(offices[1].city) : 'Berlin', anchor: 'end' as const, dx: -16 },
          { x: bx, y: by, label: offices[0] ? tr(offices[0].city) : 'Baku', anchor: 'middle' as const, dx: 0 },
        ].map((p) => (
          <g key={p.label}>
            <circle cx={p.x} cy={p.y} r="16" fill="rgba(255,206,0,0.18)" />
            <circle cx={p.x} cy={p.y} r="7" fill="#ffce00" stroke="#050f24" strokeWidth="2.5" />
            <text x={p.x + p.dx} y={p.anchor === 'end' ? p.y + 5 : p.y + 36} textAnchor={p.anchor} className="fill-white text-[17px] font-bold">
              {p.label}
            </text>
          </g>
        ))}
      </svg>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
          <p className="text-xs font-semibold tracking-wider text-white/55 uppercase">{t('aboutPage.presence.distance')}</p>
          <p className="mt-1 font-display text-2xl font-extrabold text-white">
            ≈ {km.toLocaleString(locale)} {t('aboutPage.presence.km')}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
          <p className="text-xs font-semibold tracking-wider text-white/55 uppercase">{t('aboutPage.presence.timeDiff')}</p>
          <p className="mt-1 font-display text-2xl font-extrabold text-white">{t('aboutPage.presence.timeValue')}</p>
          <p className="text-xs text-white/50">{t('aboutPage.presence.timeNote')}</p>
        </div>
      </div>
    </div>
  );
};

/** Office card next to the map. */
export const OfficeCard = ({ office, index, role }: { office: Office; index: number; role: string }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <Flag code={index === 0 ? 'az' : 'de'} className="w-8" />
        <span className="text-xs font-bold tracking-widest text-brand-400 uppercase">{t('aboutPage.presence.office')}</span>
      </div>
      <p className="mt-3 font-display text-2xl font-extrabold text-white">{tr(office.city)}</p>
      <p className="mt-1 flex items-start gap-1.5 text-sm text-white/65">
        <MapPin className="mt-0.5 size-4 shrink-0 text-brand-400" /> {office.address}
      </p>
      <p className="mt-4 border-t border-white/10 pt-4 text-sm text-white/80">{role}</p>
    </div>
  );
};
