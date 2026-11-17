import type { ReactNode } from 'react';
import { BUILDINGS, EXTRAS, GROUND_Y, STREET_H, STREET_W, type Building, type BuildingId } from '@/lib/games/street/buildings';

/**
 * Self-drawn German street panorama (day look) for /german-street: houses, shops, station, bins, traffic signs on
 * the pavement and a road in front. Decorative only (aria-hidden): the buildings are real buttons laid over it
 * (pages/games/GermanStreet). Fixed illustration colours on their own "sky", readable in light and dark mode
 * (slightly dimmed in dark mode by the page). No brands: the station, post and shop are generic.
 */

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const INK = '#1e293b';

const Windows = ({ x, y, cols, rows, w = 26, h = 34, gx = 18, gy = 22, fill = '#bfe3f7' }: { x: number; y: number; cols: number; rows: number; w?: number; h?: number; gx?: number; gy?: number; fill?: string }) => (
  <g>
    {Array.from({ length: rows }).flatMap((_, r) =>
      Array.from({ length: cols }).map((__, c) => (
        <g key={`${r}-${c}`}>
          <rect x={x + c * (w + gx)} y={y + r * (h + gy)} width={w} height={h} rx="3" fill={fill} stroke="#475569" strokeWidth="2" />
          <path d={`M${x + c * (w + gx) + w / 2} ${y + r * (h + gy)}v${h}`} stroke="#475569" strokeWidth="1.5" />
        </g>
      )),
    )}
  </g>
);

const Sign = ({ cx, y, text, bg = '#ffffff', fg = INK, size = 20, pad = 14 }: { cx: number; y: number; text: string; bg?: string; fg?: string; size?: number; pad?: number }) => {
  const w = text.length * size * 0.58 + pad * 2;
  return (
    <g>
      <rect x={cx - w / 2} y={y} width={w} height={size + 14} rx="6" fill={bg} stroke="#334155" strokeWidth="2" />
      <text x={cx} y={y + size + 2} textAnchor="middle" fontSize={size} fontWeight="700" fill={fg} fontFamily={FONT}>
        {text}
      </text>
    </g>
  );
};

const Door = ({ cx, w = 44, h = 70, fill = '#7c4a2a' }: { cx: number; w?: number; h?: number; fill?: string }) => (
  <g>
    <rect x={cx - w / 2} y={GROUND_Y - h} width={w} height={h} rx="4" fill={fill} stroke="#334155" strokeWidth="2" />
    <circle cx={cx + w / 2 - 9} cy={GROUND_Y - h / 2} r="3" fill="#facc15" />
  </g>
);

/** Body of a building between x and x + w, from `top` down to the pavement. */
const Body = ({ b, top, fill, roof }: { b: Building; top: number; fill: string; roof?: string }) => (
  <g>
    {roof && <path d={`M${b.x - 6} ${top}L${b.x + b.w / 2} ${top - 46}L${b.x + b.w + 6} ${top}Z`} fill={roof} stroke="#334155" strokeWidth="2" />}
    <rect x={b.x} y={top} width={b.w} height={GROUND_Y - top} fill={fill} stroke="#334155" strokeWidth="2" />
  </g>
);

const by = (id: BuildingId) => [...BUILDINGS, ...EXTRAS].find((b) => b.id === id)!;

const DRAW: Record<BuildingId, (b: Building) => ReactNode> = {
  wohnhaus: (b) => (
    <g>
      <Body b={b} top={110} fill="#f4d9b0" roof="#b45309" />
      <Windows x={b.x + 22} y={140} cols={3} rows={4} gx={30} gy={30} />
      {[1, 2].map((r) => (
        <rect key={r} x={b.x + 14} y={140 + r * 64 + 36} width={b.w - 28} height="8" fill="#94a3b8" />
      ))}
      <rect x={b.x + 50} y={GROUND_Y - 110} width={80} height="18" fill="#e2e8f0" stroke="#334155" />
      <Door cx={b.x + b.w / 2} />
      <Sign cx={b.x + b.w / 2} y={GROUND_Y - 108} text={b.sign} size={14} pad={8} />
    </g>
  ),
  muell: (b) => (
    <g>
      <rect x={b.x} y={GROUND_Y - 100} width={b.w} height="100" fill="#d6d3d1" opacity="0.6" />
      {['#facc15', '#2563eb', '#7c4a2a', '#374151'].map((c, i) => (
        <g key={c}>
          <rect x={b.x + 4 + i * 21} y={GROUND_Y - 66} width="18" height="62" rx="3" fill={c} stroke="#1f2937" strokeWidth="1.5" />
          <rect x={b.x + 2 + i * 21} y={GROUND_Y - 72} width="22" height="8" rx="2" fill={c} stroke="#1f2937" strokeWidth="1.5" />
        </g>
      ))}
      <Sign cx={b.x + b.w / 2} y={GROUND_Y - 112} text={b.sign} size={14} pad={8} />
    </g>
  ),
  baeckerei: (b) => (
    <g>
      <Body b={b} top={190} fill="#fde7c8" />
      <Windows x={b.x + 22} y={210} cols={3} rows={1} gx={16} />
      <path d={`M${b.x - 4} 290h${b.w + 8}l-12 34h-${b.w - 16}Z`} fill="#dc2626" />
      {Array.from({ length: 6 }).map((_, i) => (
        <path key={i} d={`M${b.x + 4 + i * 25} 290l6 34h12l-6 -34Z`} fill="#fff" opacity="0.85" />
      ))}
      <rect x={b.x + 14} y={GROUND_Y - 120} width={70} height={92} rx="4" fill="#bfe3f7" stroke="#334155" strokeWidth="2" />
      <ellipse cx={b.x + 35} cy={GROUND_Y - 60} rx="16" ry="9" fill="#b7791f" />
      <ellipse cx={b.x + 62} cy={GROUND_Y - 58} rx="14" ry="8" fill="#92400e" />
      <Door cx={b.x + b.w - 36} />
      <Sign cx={b.x + b.w / 2} y={248} text={b.sign} size={18} bg="#fff7ed" fg="#9a3412" />
    </g>
  ),
  apotheke: (b) => (
    <g>
      <Body b={b} top={170} fill="#f1f5f9" />
      <Windows x={b.x + 20} y={190} cols={3} rows={2} gx={13} gy={18} />
      <rect x={b.x + b.w - 44} y={300} width="34" height="34" rx="4" fill="#dc2626" />
      <text x={b.x + b.w - 27} y={327} textAnchor="middle" fontSize="28" fontWeight="800" fill="#fff" fontFamily={FONT}>
        A
      </text>
      <rect x={b.x + 12} y={GROUND_Y - 110} width="60" height="84" rx="4" fill="#bfe3f7" stroke="#334155" strokeWidth="2" />
      <Door cx={b.x + b.w - 34} />
      <Sign cx={b.x + b.w / 2 - 14} y={304} text={b.sign} size={16} fg="#b91c1c" />
    </g>
  ),
  sprachschule: (b) => (
    <g>
      <Body b={b} top={130} fill="#ddd6fe" roof="#6d28d9" />
      <Windows x={b.x + 20} y={160} cols={3} rows={3} gx={22} gy={24} />
      <g>
        <path d={`M${b.x + 30} 92h70a10 10 0 0 1 10 10v26a10 10 0 0 1 -10 10h-46l-14 14v-14h-10a10 10 0 0 1 -10 -10v-26a10 10 0 0 1 10 -10Z`} fill="#fff" stroke="#6d28d9" strokeWidth="2" transform={`translate(${b.w / 2 - 65} -40)`} />
        <text x={b.x + b.w / 2} y={82} textAnchor="middle" fontSize="18" fontWeight="800" fill="#6d28d9" fontFamily={FONT}>
          A B C
        </text>
      </g>
      <Door cx={b.x + b.w / 2} />
      <Sign cx={b.x + b.w / 2} y={GROUND_Y - 112} text={b.sign} size={15} pad={8} fg="#5b21b6" />
    </g>
  ),
  buergeramt: (b) => (
    <g>
      <Body b={b} top={120} fill="#e5e7eb" />
      <path d={`M${b.x - 8} 120L${b.x + b.w / 2} 76L${b.x + b.w + 8} 120Z`} fill="#cbd5e1" stroke="#334155" strokeWidth="2" />
      {[0, 1, 2].map((i) => (
        <rect key={i} x={b.x + b.w / 2 - 24} y={86 + i * 7} width="48" height="5" fill={['#111111', '#dd0000', '#ffce00'][i]} />
      ))}
      <Windows x={b.x + 18} y={150} cols={4} rows={2} gx={20} gy={26} />
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={b.x + 22 + i * 46} y={300} width="14" height={GROUND_Y - 300} fill="#f8fafc" stroke="#94a3b8" />
      ))}
      <Door cx={b.x + b.w / 2} w={50} h={80} fill="#475569" />
      <Sign cx={b.x + b.w / 2} y={262} text={b.sign} size={18} />
    </g>
  ),
  bank: (b) => (
    <g>
      <Body b={b} top={150} fill="#dbeafe" />
      <path d={`M${b.x - 6} 150h${b.w + 12}l-10 -20h-${b.w - 8}Z`} fill="#93c5fd" stroke="#334155" strokeWidth="2" />
      <Windows x={b.x + 18} y={172} cols={3} rows={2} gx={21} gy={22} />
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={b.x + 16 + i * 38} y={312} width="14" height={GROUND_Y - 312} fill="#eff6ff" stroke="#64748b" />
      ))}
      <rect x={b.x + b.w - 40} y={GROUND_Y - 92} width="30" height="46" rx="3" fill="#334155" />
      <rect x={b.x + b.w - 35} y={GROUND_Y - 86} width="20" height="14" fill="#38bdf8" />
      <Door cx={b.x + b.w / 2 - 6} w={40} fill="#1e3a8a" />
      <Sign cx={b.x + b.w / 2} y={276} text={b.sign} size={18} fg="#1e3a8a" />
    </g>
  ),
  schilder: (b) => {
    const cx = b.x + b.w / 2;
    return (
      <g>
        <rect x={cx - 3} y={300} width="6" height={GROUND_Y - 300} fill="#64748b" />
        {/* priority road (yellow diamond) */}
        <g transform={`translate(${cx} 300) rotate(45)`}>
          <rect x="-22" y="-22" width="44" height="44" fill="#fff" stroke="#111" strokeWidth="2" />
          <rect x="-14" y="-14" width="28" height="28" fill="#facc15" />
        </g>
        {/* no entry */}
        <circle cx={cx} cy={368} r="22" fill="#dc2626" stroke="#fff" strokeWidth="3" />
        <rect x={cx - 14} y={364} width="28" height="8" fill="#fff" />
        <rect x={cx + 30} y={330} width="5" height={GROUND_Y - 330} fill="#64748b" />
        {/* pedestrian crossing (blue square) */}
        <rect x={cx + 14} y={300} width="38" height="38" rx="3" fill="#2563eb" stroke="#fff" strokeWidth="2" />
        <path d={`M${cx + 20} 330l26 -24`} stroke="#fff" strokeWidth="3" />
        <circle cx={cx + 33} cy={312} r="4" fill="#fff" />
      </g>
    );
  },
  bahnhof: (b) => (
    <g>
      <Body b={b} top={140} fill="#fecaca" />
      <path d={`M${b.x - 8} 140h${b.w + 16}l-24 -40h-${b.w - 32}Z`} fill="#7f1d1d" stroke="#334155" strokeWidth="2" />
      <circle cx={b.x + b.w / 2} cy={190} r="30" fill="#fff" stroke="#334155" strokeWidth="3" />
      <path d={`M${b.x + b.w / 2} 190v-20M${b.x + b.w / 2} 190h14`} stroke={INK} strokeWidth="3" strokeLinecap="round" />
      <path d={`M${b.x + 40} ${GROUND_Y}v-120a${b.w / 2 - 40} 70 0 0 1 ${b.w - 80} 0v120Z`} fill="#bfe3f7" stroke="#334155" strokeWidth="2" />
      <path d={`M${b.x + b.w / 2} ${GROUND_Y}v-190`} stroke="#475569" strokeWidth="2" />
      {/* ticket machine (generic) */}
      <rect x={b.x + 8} y={GROUND_Y - 96} width="34" height="96" rx="4" fill="#475569" stroke="#1f2937" strokeWidth="2" />
      <rect x={b.x + 13} y={GROUND_Y - 88} width="24" height="20" fill="#a7f3d0" />
      <rect x={b.x + 15} y={GROUND_Y - 60} width="20" height="4" fill="#111" />
      <Sign cx={b.x + b.w / 2} y={232} text={b.sign} size={20} bg="#ffffff" />
    </g>
  ),
  supermarkt: (b) => (
    <g>
      <Body b={b} top={200} fill="#dcfce7" />
      <rect x={b.x} y={200} width={b.w} height="40" fill="#16a34a" />
      <text x={b.x + b.w / 2} y={228} textAnchor="middle" fontSize="22" fontWeight="800" fill="#fff" fontFamily={FONT}>
        {b.sign}
      </text>
      <rect x={b.x + 14} y={262} width={b.w - 28} height={GROUND_Y - 262} fill="#bfe3f7" stroke="#334155" strokeWidth="2" />
      {[1, 2, 3].map((i) => (
        <path key={i} d={`M${b.x + 14 + (i * (b.w - 28)) / 4} 262v${GROUND_Y - 262}`} stroke="#475569" strokeWidth="2" />
      ))}
      {/* shelves seen through the window */}
      {[300, 340, 380].map((y) => (
        <rect key={y} x={b.x + 24} y={y} width="70" height="6" fill="#64748b" />
      ))}
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={b.x + 26 + i * 14} y={286} width="10" height="14" fill={['#ef4444', '#facc15', '#3b82f6', '#22c55e', '#f97316'][i]} />
      ))}
      {/* shopping trolley */}
      <g transform={`translate(${b.x + b.w - 80} ${GROUND_Y - 44})`}>
        <path d="M0 0h8l8 26h34l6 -20h-44" fill="none" stroke="#334155" strokeWidth="3" />
        <circle cx="20" cy="36" r="5" fill="#334155" />
        <circle cx="46" cy="36" r="5" fill="#334155" />
      </g>
    </g>
  ),
  arztpraxis: (b) => (
    <g>
      <Body b={b} top={140} fill="#fef3c7" roof="#78716c" />
      <Windows x={b.x + 20} y={164} cols={3} rows={3} gx={17} gy={20} />
      <rect x={b.x + 20} y={GROUND_Y - 100} width="56" height="40" rx="3" fill="#e2e8f0" stroke="#334155" strokeWidth="2" />
      <text x={b.x + 48} y={GROUND_Y - 84} textAnchor="middle" fontSize="10" fontWeight="700" fill={INK} fontFamily={FONT}>
        Dr. med.
      </text>
      <text x={b.x + 48} y={GROUND_Y - 68} textAnchor="middle" fontSize="10" fill={INK} fontFamily={FONT}>
        Allgemeinmedizin
      </text>
      <Door cx={b.x + b.w - 44} />
      <Sign cx={b.x + b.w / 2} y={GROUND_Y - 150} text={b.sign} size={16} />
    </g>
  ),
  post: (b) => (
    <g>
      <Body b={b} top={210} fill="#e0e7ff" />
      <rect x={b.x + 18} y={232} width="44" height="30" rx="3" fill="#fff" stroke="#334155" strokeWidth="2" />
      <path d={`M${b.x + 18} 232l22 16l22 -16`} fill="none" stroke="#334155" strokeWidth="2" />
      {/* parcel lockers */}
      <rect x={b.x + 70} y={GROUND_Y - 150} width="52" height="150" fill="#94a3b8" stroke="#334155" strokeWidth="2" />
      {Array.from({ length: 5 }).map((_, r) =>
        [0, 1].map((c) => <rect key={`${r}-${c}`} x={b.x + 74 + c * 24} y={GROUND_Y - 146 + r * 29} width="20" height="25" fill="#cbd5e1" stroke="#475569" />),
      )}
      <Door cx={b.x + 38} w={40} fill="#3730a3" />
      <Sign cx={b.x + 40} y={290} text={b.sign} size={16} fg="#3730a3" pad={8} />
    </g>
  ),
  restaurant: (b) => (
    <g>
      <Body b={b} top={170} fill="#fee2e2" roof="#991b1b" />
      <Windows x={b.x + 18} y={190} cols={3} rows={1} gx={20} />
      <path d={`M${b.x - 4} 300h${b.w + 8}l-10 30h-${b.w - 12}Z`} fill="#15803d" />
      <rect x={b.x + 14} y={GROUND_Y - 120} width="64" height="90" rx="4" fill="#fde68a" stroke="#334155" strokeWidth="2" />
      <circle cx={b.x + 46} cy={GROUND_Y - 30} r="14" fill="#fff" stroke="#334155" />
      <Door cx={b.x + b.w - 34} />
      <Sign cx={b.x + b.w / 2} y={256} text={b.sign} size={16} fg="#991b1b" />
    </g>
  ),
  baustelle: (b) => (
    <g>
      {/* crane */}
      <rect x={b.x + 18} y={70} width="10" height={GROUND_Y - 70} fill="#f59e0b" stroke="#92400e" />
      <path d={`M${b.x + 10} 76h${b.w + 20}`} stroke="#f59e0b" strokeWidth="8" />
      <path d={`M${b.x + b.w - 10} 80v80`} stroke="#334155" strokeWidth="2" />
      <rect x={b.x + b.w - 22} y={160} width="24" height="16" fill="#64748b" />
      {/* half-built house with scaffolding */}
      <rect x={b.x + 40} y={250} width={b.w - 50} height={GROUND_Y - 250} fill="#e7e5e4" stroke="#334155" strokeWidth="2" />
      {[250, 300, 350, 400].map((y) => (
        <path key={y} d={`M${b.x + 34} ${y}h${b.w - 38}`} stroke="#a16207" strokeWidth="4" />
      ))}
      {[0, 1, 2].map((i) => (
        <path key={i} d={`M${b.x + 36 + i * 52} 240v${GROUND_Y - 240}`} stroke="#a16207" strokeWidth="4" />
      ))}
      {/* fence */}
      {Array.from({ length: 8 }).map((_, i) => (
        <rect key={i} x={b.x + i * 20} y={GROUND_Y - 34} width="18" height="12" fill={i % 2 ? '#dc2626' : '#fff'} stroke="#334155" />
      ))}
      <Sign cx={b.x + b.w / 2 + 14} y={196} text={b.sign} size={15} bg="#fef08a" pad={8} />
    </g>
  ),
  krankenhaus: (b) => (
    <g>
      <Body b={b} top={90} fill="#f8fafc" />
      <Windows x={b.x + 18} y={110} cols={4} rows={5} w={28} h={28} gx={22} gy={20} />
      {/* hospital sign: white H on blue (no red cross: protected emblem) */}
      <rect x={b.x + b.w - 58} y={GROUND_Y - 140} width="44" height="44" rx="4" fill="#2563eb" stroke="#fff" strokeWidth="2" />
      <text x={b.x + b.w - 36} y={GROUND_Y - 106} textAnchor="middle" fontSize="30" fontWeight="800" fill="#fff" fontFamily={FONT}>
        H
      </text>
      <rect x={b.x + 30} y={GROUND_Y - 80} width="100" height="80" fill="#bfe3f7" stroke="#334155" strokeWidth="2" />
      <path d={`M${b.x + 80} ${GROUND_Y - 80}v80`} stroke="#475569" strokeWidth="2" />
      <Sign cx={b.x + 80} y={GROUND_Y - 122} text={b.sign} size={16} />
    </g>
  ),
};

const Tree = ({ x }: { x: number }) => (
  <g>
    <rect x={x - 5} y={GROUND_Y - 70} width="10" height="70" fill="#7c4a2a" />
    <circle cx={x} cy={GROUND_Y - 92} r="30" fill="#4ade80" />
    <circle cx={x - 16} cy={GROUND_Y - 78} r="20" fill="#22c55e" />
    <circle cx={x + 16} cy={GROUND_Y - 80} r="20" fill="#16a34a" />
  </g>
);

const Lamp = ({ x }: { x: number }) => (
  <g>
    <rect x={x - 3} y={GROUND_Y - 150} width="6" height="150" fill="#334155" />
    <path d={`M${x} ${GROUND_Y - 150}h22`} stroke="#334155" strokeWidth="5" />
    <rect x={x + 16} y={GROUND_Y - 150} width="16" height="8" rx="3" fill="#fde68a" />
  </g>
);

export function StreetScene() {
  return (
    <svg viewBox={`0 0 ${STREET_W} ${STREET_H}`} className="block h-auto w-full select-none" aria-hidden focusable="false">
      <defs>
        <linearGradient id="street-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7dd3fc" />
          <stop offset="1" stopColor="#e0f2fe" />
        </linearGradient>
      </defs>
      <rect width={STREET_W} height={GROUND_Y} fill="url(#street-sky)" />
      <circle cx="2560" cy="70" r="40" fill="#fde047" />
      {[
        [180, 60],
        [900, 40],
        [1500, 70],
        [2150, 45],
      ].map(([x, y]) => (
        <g key={x} fill="#fff" opacity="0.9">
          <ellipse cx={x} cy={y} rx="60" ry="20" />
          <ellipse cx={x + 40} cy={y - 12} rx="40" ry="18" />
          <ellipse cx={x - 40} cy={y - 6} rx="34" ry="14" />
        </g>
      ))}
      <path d={`M0 ${GROUND_Y - 60}Q300 ${GROUND_Y - 160} 600 ${GROUND_Y - 80}T1200 ${GROUND_Y - 90}T1800 ${GROUND_Y - 70}T2700 ${GROUND_Y - 100}V${GROUND_Y}H0Z`} fill="#bbf7d0" opacity="0.7" />

      {[...BUILDINGS, ...EXTRAS].map((b) => (
        <g key={b.id}>{DRAW[b.id](by(b.id))}</g>
      ))}

      {[465, 1555, 1795, 2115].map((x) => (
        <Tree key={x} x={x} />
      ))}
      {[305, 1005, 1975, 2445].map((x) => (
        <Lamp key={x} x={x} />
      ))}

      {/* pavement, kerb and road */}
      <rect x="0" y={GROUND_Y} width={STREET_W} height="50" fill="#d6d3d1" />
      {Array.from({ length: Math.ceil(STREET_W / 60) }).map((_, i) => (
        <path key={i} d={`M${i * 60} ${GROUND_Y}v50`} stroke="#a8a29e" strokeWidth="1.5" />
      ))}
      <rect x="0" y={GROUND_Y + 50} width={STREET_W} height="8" fill="#78716c" />
      <rect x="0" y={GROUND_Y + 58} width={STREET_W} height={STREET_H - GROUND_Y - 58} fill="#475569" />
      {Array.from({ length: Math.ceil(STREET_W / 120) }).map((_, i) => (
        <rect key={i} x={i * 120 + 20} y={STREET_H - 52} width="60" height="6" fill="#f8fafc" />
      ))}
      {/* zebra crossing in front of the traffic signs */}
      {Array.from({ length: 6 }).map((_, i) => (
        <rect key={i} x={1190 + i * 14} y={GROUND_Y + 60} width="8" height={STREET_H - GROUND_Y - 62} fill="#f8fafc" />
      ))}
      {/* a car and a bus */}
      <g transform={`translate(420 ${STREET_H - 96})`}>
        <rect x="0" y="16" width="120" height="34" rx="10" fill="#ef4444" />
        <path d="M22 16l14 -16h44l16 16Z" fill="#fca5a5" />
        <circle cx="28" cy="52" r="12" fill="#111827" />
        <circle cx="94" cy="52" r="12" fill="#111827" />
      </g>
      <g transform={`translate(1700 ${STREET_H - 116})`}>
        <rect x="0" y="0" width="230" height="70" rx="10" fill="#facc15" />
        {[0, 1, 2, 3, 4].map((i) => (
          <rect key={i} x={14 + i * 42} y="10" width="32" height="26" rx="3" fill="#bfe3f7" />
        ))}
        <circle cx="40" cy="72" r="13" fill="#111827" />
        <circle cx="190" cy="72" r="13" fill="#111827" />
      </g>
    </svg>
  );
}
