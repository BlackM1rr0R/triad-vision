/**
 * Self-drawn professional kitchen (front view): walk-in cold room, hand-wash basin, cooking line (gas range,
 * induction, fryer, combi steamer), fire safety, the pass with order tickets, prep table with HACCP-coloured
 * boards and the dishwasher. Decorative (aria-hidden): the hotspots on top are real buttons. viewBox 1000 × 640,
 * coordinates of the markers: lib/workScenes/scenes/restaurantKitchen.ts. Fixed colours on its own light "paper".
 */

const INK = '#1e293b';
const STEEL = '#cbd5e1';
const STEEL_D = '#94a3b8';

export function RestaurantKitchenArt() {
  return (
    <svg viewBox="0 0 1000 640" className="block h-auto w-full select-none" aria-hidden>
      <defs>
        <pattern id="wk-tiles" width="40" height="30" patternUnits="userSpaceOnUse">
          <rect width="40" height="30" fill="#f1f5f9" />
          <path d="M0 0H40M0 15H40M20 0V15M0 15V30M40 15V30" stroke="#dbe3ec" strokeWidth="1.5" />
        </pattern>
        <pattern id="wk-floor" width="36" height="36" patternUnits="userSpaceOnUse">
          <rect width="36" height="36" fill="#e2e8f0" />
          <path d="M0 0H36V36" fill="none" stroke="#cbd5e1" strokeWidth="2" />
        </pattern>
        <linearGradient id="wk-steel" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#e2e8f0" />
          <stop offset="1" stopColor="#a8b5c6" />
        </linearGradient>
        <radialGradient id="wk-lamp" cx="0.5" cy="0" r="1">
          <stop offset="0" stopColor="#fdba74" stopOpacity="0.9" />
          <stop offset="1" stopColor="#fdba74" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Wall and floor */}
      <rect width="1000" height="430" fill="url(#wk-tiles)" />
      <rect y="430" width="1000" height="210" fill="url(#wk-floor)" />
      <rect y="424" width="1000" height="8" fill="#94a3b8" />

      {/* Walk-in cold room */}
      <rect x="20" y="40" width="150" height="390" rx="6" fill="url(#wk-steel)" stroke={STEEL_D} strokeWidth="3" />
      <rect x="34" y="56" width="122" height="360" rx="4" fill="none" stroke="#e2e8f0" strokeWidth="2" />
      <rect x="140" y="210" width="16" height="70" rx="6" fill="#475569" />
      <rect x="58" y="90" width="74" height="34" rx="4" fill="#0f172a" />
      <text x="95" y="114" fontSize="20" fill="#38bdf8" textAnchor="middle" fontFamily="monospace">
        3°C
      </text>
      <path d="M78 160l17 10 17-10M95 150v40M80 182l15-8 15 8" stroke="#0ea5e9" strokeWidth="4" fill="none" strokeLinecap="round" />

      {/* Temperature log on the wall */}
      <rect x="180" y="100" width="44" height="60" rx="4" fill="#ffffff" stroke={INK} strokeWidth="2" />
      <rect x="194" y="94" width="16" height="10" rx="2" fill="#64748b" />
      {[116, 128, 140, 152].map((y) => (
        <path key={y} d={`M186 ${y}h22`} stroke="#94a3b8" strokeWidth="2" />
      ))}
      {[116, 128, 140].map((y) => (
        <path key={y} d={`M211 ${y - 2}l3 3 5-6`} stroke="#16a34a" strokeWidth="2" fill="none" />
      ))}

      {/* First-aid box */}
      <rect x="252" y="80" width="64" height="54" rx="6" fill="#ffffff" stroke="#16a34a" strokeWidth="3" />
      <path d="M284 92v30M269 107h30" stroke="#16a34a" strokeWidth="8" />

      {/* Hand-wash basin with soap and towels */}
      <rect x="244" y="226" width="34" height="46" rx="4" fill="#e0f2fe" stroke={INK} strokeWidth="2" />
      <rect x="290" y="222" width="30" height="40" rx="3" fill="#ffffff" stroke={INK} strokeWidth="2" />
      <path d="M296 262h18" stroke="#94a3b8" strokeWidth="3" />
      <path d="M278 286v-14h12" stroke="#64748b" strokeWidth="4" fill="none" />
      <path d="M240 296h92l-10 34h-72z" fill={STEEL} stroke={STEEL_D} strokeWidth="2" />
      <rect x="282" y="330" width="8" height="94" fill={STEEL_D} />

      {/* Extraction hood */}
      <path d="M350 40h420l-30 60H380z" fill="url(#wk-steel)" stroke={STEEL_D} strokeWidth="2" />
      <path d="M392 88h336" stroke="#64748b" strokeWidth="3" strokeDasharray="10 6" />

      {/* Fire blanket on the wall */}
      <rect x="430" y="130" width="54" height="50" rx="4" fill="#dc2626" />
      <rect x="440" y="170" width="34" height="14" rx="3" fill="#7f1d1d" />
      <path d="M445 146h24M445 156h24" stroke="#fecaca" strokeWidth="3" />

      {/* Cooking line: counter */}
      <rect x="350" y="350" width="420" height="74" fill="url(#wk-steel)" stroke={STEEL_D} strokeWidth="2" />
      {[380, 470, 560, 650].map((x) => (
        <rect key={x} x={x} y="366" width="70" height="44" rx="3" fill="none" stroke={STEEL_D} strokeWidth="2" />
      ))}
      {/* Gas range: burners with flames */}
      <rect x="360" y="330" width="100" height="22" rx="3" fill="#334155" />
      {[385, 435].map((x) => (
        <g key={x}>
          <circle cx={x} cy="330" r="14" fill="none" stroke="#0f172a" strokeWidth="4" />
          <path d={`M${x - 8} 326q4-14 8-2q4-12 8 2`} fill="#3b82f6" />
        </g>
      ))}
      <rect x="382" y="290" width="44" height="26" rx="4" fill="#475569" />
      <path d="M380 290h48" stroke="#1e293b" strokeWidth="4" />
      {/* Induction range */}
      <rect x="470" y="330" width="90" height="22" rx="3" fill="#0f172a" />
      <circle cx="497" cy="341" r="9" fill="none" stroke="#f97316" strokeWidth="2" />
      <circle cx="534" cy="341" r="9" fill="none" stroke="#f97316" strokeWidth="2" opacity="0.5" />
      <path d="M492 316h50l-4 14h-42z" fill="#64748b" />
      {/* Fryer */}
      <rect x="570" y="300" width="72" height="52" rx="3" fill="#475569" />
      <rect x="578" y="306" width="56" height="20" rx="2" fill="#f59e0b" />
      <path d="M582 316q6-6 12 0t12 0 12 0 12 0" stroke="#b45309" strokeWidth="2" fill="none" />
      <rect x="588" y="282" width="22" height="18" fill="none" stroke="#1e293b" strokeWidth="2" />
      <path d="M599 282v-14h22" stroke="#1e293b" strokeWidth="3" fill="none" />
      {/* Fire extinguisher class F */}
      <rect x="600" y="150" width="30" height="62" rx="10" fill="#dc2626" />
      <rect x="607" y="138" width="16" height="14" rx="3" fill="#1e293b" />
      <path d="M623 142h14v22" stroke="#1e293b" strokeWidth="3" fill="none" />
      <text x="615" y="190" fontSize="18" fontWeight="800" fill="#ffffff" textAnchor="middle" fontFamily="system-ui, sans-serif">
        F
      </text>

      {/* Combi steamer on a stand */}
      <rect x="660" y="170" width="110" height="160" rx="8" fill="url(#wk-steel)" stroke={STEEL_D} strokeWidth="3" />
      <rect x="672" y="186" width="66" height="128" rx="6" fill="#1e293b" />
      <rect x="680" y="196" width="50" height="108" rx="4" fill="#334155" />
      {[220, 250, 280].map((y) => (
        <path key={y} d={`M684 ${y}h42`} stroke="#94a3b8" strokeWidth="3" />
      ))}
      <rect x="744" y="186" width="18" height="40" rx="3" fill="#0f172a" />
      <circle cx="753" cy="246" r="7" fill="#e2e8f0" stroke="#475569" strokeWidth="2" />
      <path d="M700 168q6-12 0-24M720 168q6-12 0-24" stroke="#cbd5e1" strokeWidth="3" fill="none" strokeLinecap="round" />

      {/* Pass with heat lamps, order rail, plates */}
      <rect x="800" y="130" width="180" height="10" rx="3" fill="#475569" />
      {[830, 950].map((x) => (
        <g key={x}>
          <path d={`M${x} 140v14`} stroke="#475569" strokeWidth="3" />
          <path d={`M${x - 16} 154h32l-6 10h-20z`} fill="#f97316" />
        </g>
      ))}
      <rect x="806" y="166" width="168" height="120" fill="url(#wk-lamp)" opacity="0.5" />
      {/* order tickets (Bons) */}
      <rect x="820" y="150" width="140" height="6" rx="2" fill="#64748b" />
      {[832, 862, 892, 922].map((x, i) => (
        <g key={x}>
          <rect x={x} y="156" width="24" height="34" rx="2" fill="#ffffff" stroke={INK} strokeWidth="1.5" transform={`rotate(${i % 2 ? 3 : -3} ${x + 12} 156)`} />
          <path d={`M${x + 4} 166h16M${x + 4} 172h12M${x + 4} 178h14`} stroke="#94a3b8" strokeWidth="1.5" />
        </g>
      ))}
      <rect x="800" y="286" width="190" height="14" rx="3" fill={STEEL} stroke={STEEL_D} strokeWidth="2" />
      {[835, 885, 935].map((x) => (
        <g key={x}>
          <ellipse cx={x} cy="282" rx="22" ry="6" fill="#ffffff" stroke={STEEL_D} strokeWidth="1.5" />
          <ellipse cx={x} cy="278" rx="9" ry="4" fill={x === 885 ? '#16a34a' : '#ea580c'} />
        </g>
      ))}
      <rect x="806" y="300" width="178" height="124" fill={STEEL} stroke={STEEL_D} strokeWidth="2" />

      {/* Allergen poster */}
      <rect x="820" y="20" width="160" height="98" rx="6" fill="#ffffff" stroke={INK} strokeWidth="2" />
      <rect x="820" y="20" width="160" height="22" rx="6" fill="#f59e0b" />
      <text x="900" y="36" fontSize="13" fontWeight="800" fill="#1e293b" textAnchor="middle" fontFamily="system-ui, sans-serif">
        ALLERGENE 1–14
      </text>
      {Array.from({ length: 14 }, (_, i) => (
        <g key={i}>
          <circle cx={838 + (i % 7) * 21} cy={62 + Math.floor(i / 7) * 30} r="9" fill={['#fde68a', '#bfdbfe', '#fecaca', '#bbf7d0', '#e9d5ff', '#fed7aa', '#a5f3fc'][i % 7]} stroke="#475569" strokeWidth="1.5" />
          <text x={838 + (i % 7) * 21} y={66 + Math.floor(i / 7) * 30} fontSize="10" fontWeight="700" fill="#1e293b" textAnchor="middle" fontFamily="system-ui, sans-serif">
            {i + 1}
          </text>
        </g>
      ))}

      {/* Prep table in the foreground */}
      <rect x="40" y="470" width="680" height="24" rx="4" fill="url(#wk-steel)" stroke={STEEL_D} strokeWidth="2" />
      <rect x="60" y="494" width="12" height="130" fill={STEEL_D} />
      <rect x="690" y="494" width="12" height="130" fill={STEEL_D} />
      <rect x="72" y="590" width="618" height="8" fill={STEEL_D} />
      {/* HACCP cutting boards in a rack */}
      {['#dc2626', '#eab308', '#2563eb', '#16a34a', '#f8fafc', '#92400e'].map((c, i) => (
        <rect key={c} x={110 + i * 34} y="404" width="26" height="70" rx="4" fill={c} stroke="#475569" strokeWidth="2" />
      ))}
      <rect x="104" y="462" width="210" height="10" rx="2" fill="#64748b" />
      {/* Knives on a magnetic strip */}
      <rect x="350" y="446" width="130" height="8" rx="2" fill="#334155" />
      {[
        [362, 30],
        [392, 42],
        [424, 36],
        [454, 26],
      ].map(([x, l]) => (
        <g key={x}>
          <rect x={x - 3} y="452" width="8" height="16" rx="2" fill="#1e293b" />
          <path d={`M${x - 3} 452v-${l}l8 ${l - 6}v6z`} fill="#e2e8f0" stroke="#64748b" strokeWidth="1.5" />
        </g>
      ))}
      {/* Mise en place: GN containers */}
      {[
        ['#16a34a', 520],
        ['#f97316', 566],
        ['#facc15', 612],
        ['#dc2626', 658],
      ].map(([c, x]) => (
        <g key={x as number}>
          <rect x={(x as number) - 20} y="448" width="40" height="22" rx="3" fill="#e2e8f0" stroke={STEEL_D} strokeWidth="2" />
          {[0, 1, 2].map((k) => (
            <circle key={k} cx={(x as number) - 10 + k * 10} cy="452" r="6" fill={c as string} />
          ))}
        </g>
      ))}

      {/* Hood-type dishwasher */}
      <rect x="760" y="440" width="220" height="30" rx="4" fill={STEEL} stroke={STEEL_D} strokeWidth="2" />
      <rect x="800" y="470" width="130" height="150" rx="6" fill="url(#wk-steel)" stroke={STEEL_D} strokeWidth="3" />
      <rect x="812" y="484" width="106" height="52" rx="4" fill="#cbd5e1" stroke="#64748b" strokeWidth="2" />
      <rect x="820" y="490" width="90" height="40" rx="3" fill="#bae6fd" opacity="0.7" />
      <rect x="896" y="548" width="26" height="14" rx="2" fill="#0f172a" />
      <text x="909" y="559" fontSize="9" fill="#4ade80" textAnchor="middle" fontFamily="monospace">
        85°
      </text>
      <rect x="770" y="580" width="22" height="38" rx="3" fill="#2563eb" />
      <rect x="770" y="574" width="22" height="8" rx="2" fill="#1e3a8a" />
      <rect x="940" y="580" width="22" height="38" rx="3" fill="#f59e0b" />
      <rect x="940" y="574" width="22" height="8" rx="2" fill="#92400e" />
    </svg>
  );
}
