import { useMemo } from 'react';
import { Flag } from '../ui/Flag';

/*
 * Decorative globe for the hero, drawn with HTML + SVG and animated only with CSS transform/opacity
 * (compositor-friendly, no WebGL, no per-frame JavaScript). It replaced a three.js scene that cost
 * ~900 KB and kept the main thread busy on integrated GPUs.
 *
 * Geometry: orthographic projection of a sphere of radius 1, slightly tilted, centred on the
 * Azerbaijan–Germany corridor. Meridians project to ellipses, parallels to horizontal chords.
 */

const R = 190; // px in a 400×400 viewBox
const CX = 200;
const CY = 200;
const LON0 = 32; // central longitude (between Baku 49.9° and Berlin 13.4°)
const TILT = 18; // degrees the north pole leans towards the viewer

const rad = (d: number) => (d * Math.PI) / 180;

/** Projects lat/lon to 2D (x right, y down) for a sphere tilted by TILT towards the viewer. */
const project = (lat: number, lon: number) => {
  const φ = rad(lat);
  const λ = rad(lon - LON0);
  const τ = rad(TILT);
  // 3D on unit sphere, z towards the viewer
  const x = Math.cos(φ) * Math.sin(λ);
  const y0 = Math.sin(φ);
  const z0 = Math.cos(φ) * Math.cos(λ);
  // tilt around the x axis
  const y = y0 * Math.cos(τ) + z0 * Math.sin(τ);
  const z = -y0 * Math.sin(τ) + z0 * Math.cos(τ);
  return { x: CX + x * R, y: CY - y * R, front: z > 0 };
};

/** Polyline of a meridian or parallel, keeping only the visible (front) half. */
const arcPath = (points: { x: number; y: number; front: boolean }[]) => {
  let d = '';
  let pen = false;
  for (const p of points) {
    if (!p.front) {
      pen = false;
      continue;
    }
    d += `${pen ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    pen = true;
  }
  return d;
};

const BAKU = { lat: 40.4, lon: 49.9 };
const BERLIN = { lat: 52.5, lon: 13.4 };

/** Deterministic "stars" around the globe (same on every render). */
const STARS = Array.from({ length: 26 }, (_, i) => {
  const a = (i * 137.508) % 360; // golden angle spread
  const r = 0.62 + ((i * 7919) % 100) / 100 * 0.42;
  return {
    left: 50 + Math.cos(rad(a)) * r * 50,
    top: 50 + Math.sin(rad(a)) * r * 50,
    size: 2 + (i % 3),
    delay: (i % 7) * 0.6,
  };
});

export const HeroGlobeLite = () => {
  const grid = useMemo(() => {
    const meridians: string[] = [];
    for (let lon = LON0 - 180; lon < LON0 + 180; lon += 20) {
      const pts = [];
      for (let lat = -90; lat <= 90; lat += 3) pts.push(project(lat, lon));
      meridians.push(arcPath(pts));
    }
    const parallels: string[] = [];
    for (let lat = -75; lat <= 75; lat += 15) {
      const pts = [];
      for (let lon = LON0 - 180; lon <= LON0 + 180; lon += 3) pts.push(project(lat, lon));
      parallels.push(arcPath(pts));
    }
    return { meridians, parallels };
  }, []);

  const baku = project(BAKU.lat, BAKU.lon);
  const berlin = project(BERLIN.lat, BERLIN.lon);
  // Flight arc: a quadratic curve bowing away from the sphere centre.
  const mid = { x: (baku.x + berlin.x) / 2, y: (baku.y + berlin.y) / 2 };
  const away = { x: mid.x - CX, y: mid.y - CY };
  const len = Math.hypot(away.x, away.y) || 1;
  const ctrl = { x: mid.x + (away.x / len) * 70, y: mid.y + (away.y / len) * 70 };
  const flight = `M${baku.x.toFixed(1)} ${baku.y.toFixed(1)} Q${ctrl.x.toFixed(1)} ${ctrl.y.toFixed(1)} ${berlin.x.toFixed(1)} ${berlin.y.toFixed(1)}`;

  const pct = (p: { x: number; y: number }) => ({ left: `${(p.x / 400) * 100}%`, top: `${(p.y / 400) * 100}%` });

  return (
    <div className="relative size-full select-none" aria-hidden>
      {/* stars */}
      {STARS.map((s, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-brand-400/80 motion-safe:animate-twinkle"
          style={{ left: `${s.left}%`, top: `${s.top}%`, width: s.size, height: s.size, animationDelay: `${s.delay}s` }}
        />
      ))}

      {/* atmosphere glow (static, painted once) */}
      <div className="absolute inset-[6%] rounded-full shadow-[0_0_90px_30px_rgba(47,123,255,0.28),inset_0_0_60px_rgba(92,155,255,0.25)]" />

      {/* sphere */}
      <div className="absolute inset-[6%] overflow-hidden rounded-full bg-[radial-gradient(circle_at_34%_30%,#2a63c9_0%,#163b85_38%,#0d2458_65%,#071637_100%)]">
        <svg viewBox="0 0 400 400" className="absolute inset-0 size-full">
          <g fill="none" stroke="#9cc2ff" strokeWidth="0.8" strokeOpacity="0.22">
            {grid.meridians.map((d, i) => (
              <path key={`m${i}`} d={d} />
            ))}
            {grid.parallels.map((d, i) => (
              <path key={`p${i}`} d={d} />
            ))}
          </g>
          {/* flight route: faint full line + travelling dashes + the plane dot */}
          <path d={flight} fill="none" stroke="#5c9bff" strokeWidth="1.6" strokeOpacity="0.45" />
          <path d={flight} fill="none" stroke="#ffce00" strokeWidth="2" strokeLinecap="round" strokeDasharray="6 9" className="motion-safe:animate-dash" />
          <circle r="5" fill="#fff" className="motion-safe:animate-fly" style={{ offsetPath: `path('${flight}')` }} />
          <circle r="9" fill="#5c9bff" fillOpacity="0.35" className="motion-safe:animate-fly" style={{ offsetPath: `path('${flight}')`, animationDelay: '-0.12s' }} />
        </svg>
        {/* limb shading so the edge reads as a sphere */}
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_38%_32%,transparent_55%,rgba(3,10,30,0.55)_100%)]" />
        {/* a soft day-side highlight that drifts, so the globe never looks frozen (transform only) */}
        <div className="absolute inset-[-20%] rounded-full bg-[radial-gradient(circle_at_30%_30%,rgba(140,185,255,0.22),transparent_45%)] motion-safe:animate-drift" />
      </div>

      {/* city markers */}
      {[
        { p: baku, color: '#00b5e2', code: 'az' as const, label: 'Bakı', delay: '0s' },
        { p: berlin, color: '#ffce00', code: 'de' as const, label: 'Berlin', delay: '1s' },
      ].map((c) => (
        <div key={c.label} className="absolute -translate-x-1/2 -translate-y-1/2" style={pct({ x: c.p.x * 0.88 + CX * 0.12, y: c.p.y * 0.88 + CY * 0.12 })}>
          <span className="absolute inset-0 -m-3 rounded-full motion-safe:animate-pulse-ring" style={{ backgroundColor: c.color, animationDelay: c.delay }} />
          <span className="relative block size-3 rounded-full shadow-[0_0_12px_2px_rgba(255,255,255,0.35)]" style={{ backgroundColor: c.color }} />
          <div className="absolute bottom-full left-1/2 mb-2 hidden -translate-x-1/2 items-center gap-1.5 rounded-full border border-white/20 bg-navy-950/80 px-2.5 py-1 text-[11px] font-bold whitespace-nowrap text-white shadow-lg lg:flex">
            <Flag code={c.code} className="w-4" />
            {c.label}
          </div>
        </div>
      ))}
    </div>
  );
};
