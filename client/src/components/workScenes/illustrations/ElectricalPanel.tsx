/**
 * Self-drawn electrician's workplace (front view): an open German meter cabinet with distribution board
 * (Zählerschrank + Unterverteilung) — electricity meter, circuit list, main switch locked out with a padlock and a
 * "Nicht schalten" tag, RCDs with test button, rows of MCBs (B16 …), insulating cover, coloured wires to the L, N and
 * PE terminals — and next to it an earthing and short-circuiting set, an IP44 outdoor socket and an IP67 box, a tool
 * board with VDE-insulated tools and a bench with a two-pole voltage tester, a phase-tester screwdriver and a drill
 * with a protection-class II rating plate. Decorative (aria-hidden): the hotspots on top are real buttons.
 * viewBox 1000 × 640, coordinates of the markers: lib/workScenes/scenes/electricalPanel.ts. Fixed colours on its own
 * light "paper".
 */

const INK = '#1e293b';
const DEV = '#f8fafc';
const DEV_S = '#94a3b8';
const FONT = 'system-ui, sans-serif';

const BROWN = '#92400e';
const BLACK = '#111827';
const GREY = '#6b7280';
const BLUE = '#2563eb';
const GREEN = '#16a34a';
const YELLOW = '#facc15';

/** A green-yellow protective conductor: green stroke with yellow dashes on top. */
function PeWire({ d, w = 5 }: { d: string; w?: number }) {
  return (
    <g fill="none" strokeLinecap="round">
      <path d={d} stroke={GREEN} strokeWidth={w} />
      <path d={d} stroke={YELLOW} strokeWidth={w} strokeDasharray="7 7" />
    </g>
  );
}

/** One miniature circuit breaker (1 module) with lever and rating label. */
function Mcb({ x, y, label, on = true }: { x: number; y: number; label: string; on?: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width="26" height="70" rx="3" fill={DEV} stroke={DEV_S} strokeWidth="1.5" />
      <rect x={x + 7} y={on ? y + 22 : y + 32} width="12" height="16" rx="2" fill={on ? '#1e293b' : '#64748b'} />
      <text x={x + 13} y={y + 14} fontSize="8" fontWeight="700" fill={INK} textAnchor="middle" fontFamily={FONT}>
        {label}
      </text>
      <rect x={x + 5} y={y + 52} width="16" height="10" rx="1.5" fill={on ? '#ef4444' : '#22c55e'} opacity="0.85" />
    </g>
  );
}

/** A 4-module residual current device with test button "T". */
function Rcd({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x} y={y} width="74" height="70" rx="3" fill={DEV} stroke={DEV_S} strokeWidth="1.5" />
      <rect x={x + 8} y={y + 22} width="28" height="16" rx="2" fill="#1e40af" />
      <circle cx={x + 56} cy={y + 30} r="9" fill="#fde047" stroke="#a16207" strokeWidth="1.5" />
      <text x={x + 56} y={y + 34} fontSize="11" fontWeight="800" fill={INK} textAnchor="middle" fontFamily={FONT}>
        T
      </text>
      <text x={x + 37} y={y + 14} fontSize="8" fontWeight="700" fill={INK} textAnchor="middle" fontFamily={FONT}>
        FI 40A 30mA
      </text>
      <text x={x + 37} y={y + 60} fontSize="8" fill="#475569" textAnchor="middle" fontFamily={FONT}>
        IΔn 0,03 A
      </text>
    </g>
  );
}

export function ElectricalPanelArt() {
  const row1 = ['B16', 'B16', 'B10', 'B16', 'C16', 'B16', 'B10', 'B16', 'B6'];
  const row2 = ['B16', 'B16', 'B16', 'B10', 'B16', 'B16', 'B16', 'B10'];
  return (
    <svg viewBox="0 0 1000 640" className="block h-auto w-full select-none" aria-hidden>
      <defs>
        <pattern id="ep-wall" width="48" height="48" patternUnits="userSpaceOnUse">
          <rect width="48" height="48" fill="#f5f1ea" />
          <circle cx="12" cy="12" r="1.2" fill="#e4ddd1" />
          <circle cx="36" cy="36" r="1.2" fill="#e4ddd1" />
        </pattern>
        <pattern id="ep-floor" width="60" height="30" patternUnits="userSpaceOnUse">
          <rect width="60" height="30" fill="#d6d3d1" />
          <path d="M0 0H60M30 0V30" stroke="#c4bfbb" strokeWidth="2" />
        </pattern>
        <pattern id="ep-perf" width="16" height="16" patternUnits="userSpaceOnUse">
          <rect width="16" height="16" fill="#d9c4a3" />
          <circle cx="8" cy="8" r="2" fill="#a8916c" />
        </pattern>
        <linearGradient id="ep-cab" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#f1f5f9" />
          <stop offset="1" stopColor="#dbe2ea" />
        </linearGradient>
        <linearGradient id="ep-copper" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#d97706" />
          <stop offset="1" stopColor="#b45309" />
        </linearGradient>
      </defs>

      {/* Wall and floor */}
      <rect width="1000" height="560" fill="url(#ep-wall)" />
      <rect y="560" width="1000" height="80" fill="url(#ep-floor)" />
      <rect y="554" width="1000" height="8" fill="#a8a29e" />

      {/* Opened cabinet door (left) with warning triangle */}
      <path d="M60 30L14 56V506L60 534z" fill="#e2e8f0" stroke={DEV_S} strokeWidth="2" />
      <path d="M37 200l16 28h-32z" fill="#facc15" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <path d="M39 207l-5 10h5l-3 8" stroke={INK} strokeWidth="2" fill="none" />

      {/* Cabinet body */}
      <rect x="60" y="30" width="500" height="504" rx="6" fill="url(#ep-cab)" stroke="#64748b" strokeWidth="4" />
      <rect x="74" y="44" width="472" height="166" rx="3" fill="#e5e7eb" stroke={DEV_S} strokeWidth="1.5" />
      <path d="M74 215h472" stroke="#64748b" strokeWidth="3" />

      {/* Meter field: electricity meter with LCD and seals */}
      <rect x="190" y="60" width="150" height="140" rx="6" fill="#334155" stroke={INK} strokeWidth="2" />
      <rect x="204" y="74" width="122" height="38" rx="3" fill="#a3e635" stroke="#3f6212" strokeWidth="2" />
      <text x="258" y="99" fontSize="17" fontWeight="700" fill="#1a2e05" textAnchor="middle" fontFamily="monospace">
        012345,6
      </text>
      <text x="312" y="108" fontSize="8" fill="#1a2e05" textAnchor="middle" fontFamily={FONT}>
        kWh
      </text>
      <circle cx="214" cy="128" r="4" fill="#ef4444" />
      <text x="224" y="131" fontSize="8" fill="#e2e8f0" fontFamily={FONT}>
        10000 imp/kWh
      </text>
      <rect x="210" y="142" width="110" height="20" rx="2" fill="#475569" />
      <text x="265" y="156" fontSize="9" fill="#e2e8f0" textAnchor="middle" fontFamily={FONT}>
        Zähler 1.8.0
      </text>
      <rect x="230" y="176" width="70" height="18" rx="2" fill="#1e293b" />
      {[238, 292].map((x) => (
        <g key={x}>
          <circle cx={x} cy="185" r="4" fill="#dc2626" />
          <path d={`M${x} 189v8`} stroke="#dc2626" strokeWidth="1.5" />
        </g>
      ))}

      {/* House connection terminals (supply side) */}
      <rect x="92" y="70" width="80" height="110" rx="4" fill="#cbd5e1" stroke={DEV_S} strokeWidth="1.5" />
      {[104, 122, 140, 158].map((x, i) => (
        <rect key={x} x={x - 6} y="96" width="12" height="40" rx="2" fill={[BROWN, BLACK, GREY, BLUE][i]} />
      ))}
      <path d="M100 150h64" stroke="#ef4444" strokeWidth="2" strokeDasharray="4 3" />
      <path d="M118 158l14 0M125 152v12" stroke={INK} strokeWidth="1.5" />

      {/* Circuit list (Stromkreisliste) */}
      <rect x="380" y="60" width="150" height="140" rx="4" fill="#ffffff" stroke={INK} strokeWidth="1.5" />
      <rect x="380" y="60" width="150" height="20" rx="4" fill="#0ea5e9" />
      <text x="455" y="74" fontSize="10" fontWeight="800" fill="#ffffff" textAnchor="middle" fontFamily={FONT}>
        Stromkreisliste
      </text>
      {['F1 Küche', 'F2 Bad', 'F3 Flur', 'F4 Büro', 'F5 Herd', 'F6 Außen'].map((t, i) => (
        <g key={t}>
          <text x="390" y={96 + i * 17} fontSize="9" fill={INK} fontFamily={FONT}>
            {t}
          </text>
          <path d={`M460 ${93 + i * 17}h60`} stroke="#cbd5e1" strokeWidth="1.5" />
        </g>
      ))}

      {/* DIN rails */}
      {[260, 350].map((y) => (
        <rect key={y} x="80" y={y - 4} width="460" height="8" fill="#9ca3af" />
      ))}

      {/* Row 1: main switch (locked out), RCD, MCBs */}
      <rect x="86" y="225" width="78" height="70" rx="3" fill={DEV} stroke={DEV_S} strokeWidth="1.5" />
      <text x="125" y="238" fontSize="8" fontWeight="700" fill={INK} textAnchor="middle" fontFamily={FONT}>
        Hauptschalter
      </text>
      <rect x="98" y="256" width="54" height="16" rx="3" fill="#dc2626" />
      <text x="125" y="268" fontSize="9" fontWeight="800" fill="#ffffff" textAnchor="middle" fontFamily={FONT}>
        0 / AUS
      </text>
      <circle cx="125" cy="284" r="4" fill="#475569" />
      <Rcd x={176} y={225} />
      {row1.map((l, i) => (
        <Mcb key={i} x={262 + i * 30} y={225} label={l} on={i !== 4} />
      ))}

      {/* Padlock and "Nicht schalten" tag hanging from the main switch */}
      <path d="M118 296v-10a7 7 0 0 1 14 0v10" stroke="#475569" strokeWidth="3.5" fill="none" />
      <rect x="112" y="296" width="26" height="22" rx="4" fill="#dc2626" stroke="#7f1d1d" strokeWidth="1.5" />
      <circle cx="125" cy="306" r="2.5" fill="#1e293b" />
      <path d="M125 318v10" stroke="#475569" strokeWidth="1.5" />
      <rect x="72" y="328" width="108" height="66" rx="5" fill="#ffffff" stroke="#dc2626" strokeWidth="3" />
      <rect x="72" y="328" width="108" height="16" rx="4" fill="#dc2626" />
      <text x="126" y="340" fontSize="9" fontWeight="800" fill="#ffffff" textAnchor="middle" fontFamily={FONT}>
        Nicht schalten!
      </text>
      <text x="126" y="358" fontSize="9" fontWeight="700" fill={INK} textAnchor="middle" fontFamily={FONT}>
        Es wird gearbeitet
      </text>
      <text x="126" y="372" fontSize="7.5" fill="#475569" textAnchor="middle" fontFamily={FONT}>
        Ort: UV 1 · Name: ____
      </text>
      <text x="126" y="386" fontSize="7.5" fill="#475569" textAnchor="middle" fontFamily={FONT}>
        Entfernen nur durch: ____
      </text>

      {/* Row 2: second RCD and MCBs */}
      <Rcd x={190} y={315} />
      {row2.map((l, i) => (
        <Mcb key={i} x={276 + i * 30} y={315} label={l} />
      ))}

      {/* Insulating cover clipped over neighbouring live parts */}
      <path d="M436 302h108v98H436z" fill="#f97316" opacity="0.82" />
      <path d="M436 302h108v98H436z" fill="none" stroke="#9a3412" strokeWidth="2" strokeDasharray="6 4" />
      {[452, 490, 528].map((x) => (
        <rect key={x} x={x - 6} y="296" width="12" height="12" rx="2" fill="#1e293b" />
      ))}
      <path d="M470 330l10 10M480 330l-10 10M500 360l10 10M510 360l-10 10" stroke="#fff7ed" strokeWidth="2" />

      {/* Wires from the devices down to the terminal blocks */}
      {[
        [285, 200, BROWN],
        [315, 220, BLACK],
        [345, 240, GREY],
        [375, 260, BROWN],
        [405, 280, BLACK],
      ].map(([x0, x1, c]) => (
        <path key={x0 as number} d={`M${x0} 385v30q0 12 -12 16L${x1} 450v6`} stroke={c as string} strokeWidth="5" fill="none" strokeLinecap="round" />
      ))}
      {[
        [226, 322],
        [244, 338],
        [420, 354],
      ].map(([x0, x1]) => (
        <path key={x0} d={`M${x0} 385v26q0 14 ${x1 > x0 ? 10 : -10} 18L${x1} 450v6`} stroke={BLUE} strokeWidth="5" fill="none" strokeLinecap="round" />
      ))}
      <PeWire d="M520 408v22q0 10 -10 12L470 450v6" />
      <PeWire d="M500 408v18q0 10 -10 12L440 450v6" />
      <PeWire d="M480 408v14q0 10 -10 12L410 450v6" />
      {/* Cables leaving the cabinet at the bottom */}
      <path d="M205 495v45M300 495v45M390 495v45M500 495v45" stroke="#cbd5e1" strokeWidth="9" />
      <path d="M205 495v45M300 495v45M390 495v45M500 495v45" stroke="#e2e8f0" strokeWidth="5" />

      {/* Terminal blocks: L (grey), N (blue), PE (green-yellow) */}
      <rect x="190" y="482" width="320" height="8" fill="#9ca3af" />
      {[200, 220, 240, 260, 280].map((x) => (
        <rect key={x} x={x - 8} y="454" width="16" height="34" rx="2" fill="#9ca3af" stroke="#4b5563" strokeWidth="1.5" />
      ))}
      {[322, 338, 354].map((x) => (
        <rect key={x} x={x - 7} y="454" width="14" height="34" rx="2" fill="#60a5fa" stroke="#1d4ed8" strokeWidth="1.5" />
      ))}
      {[410, 440, 470].map((x) => (
        <g key={x}>
          <rect x={x - 8} y="454" width="16" height="34" rx="2" fill={GREEN} stroke="#14532d" strokeWidth="1.5" />
          <path d={`M${x - 8} 462h16M${x - 8} 474h16`} stroke={YELLOW} strokeWidth="5" />
        </g>
      ))}
      <text x="240" y="508" fontSize="11" fontWeight="800" fill={INK} textAnchor="middle" fontFamily={FONT}>
        L1 L2 L3
      </text>
      <text x="338" y="508" fontSize="11" fontWeight="800" fill={BLUE} textAnchor="middle" fontFamily={FONT}>
        N
      </text>
      <text x="440" y="508" fontSize="11" fontWeight="800" fill="#15803d" textAnchor="middle" fontFamily={FONT}>
        PE
      </text>

      {/* Earthing and short-circuiting set on a wall hook */}
      <path d="M660 46h20M670 46v14q0 8 -8 8" stroke="#475569" strokeWidth="4" fill="none" />
      {[0, 1, 2, 3].map((k) => (
        <ellipse key={k} cx="670" cy={120 + k * 6} rx={42 - k * 3} ry="46" fill="none" stroke="url(#ep-copper)" strokeWidth="5" opacity="0.9" />
      ))}
      {[0, 1, 2, 3].map((k) => (
        <ellipse key={`s${k}`} cx="670" cy={120 + k * 6} rx={42 - k * 3} ry="46" fill="none" stroke="#fde68a" strokeWidth="1.5" opacity="0.6" />
      ))}
      {[628, 656, 684].map((x) => (
        <g key={x}>
          <path d={`M${x} 166v34`} stroke="url(#ep-copper)" strokeWidth="4" />
          <rect x={x - 7} y="200" width="14" height="22" rx="3" fill="#dc2626" />
          <path d={`M${x - 5} 222l-2 10M${x + 5} 222l2 10`} stroke="#475569" strokeWidth="3" />
        </g>
      ))}
      <path d="M712 166v30" stroke="url(#ep-copper)" strokeWidth="4" />
      <rect x="700" y="196" width="24" height="18" rx="3" fill={GREEN} />
      <path d="M700 205h24" stroke={YELLOW} strokeWidth="5" />
      <path d="M712 214v14" stroke="#475569" strokeWidth="4" />

      {/* IP44 outdoor socket and IP67 junction box */}
      <rect x="776" y="80" width="88" height="96" rx="8" fill="#94a3b8" stroke="#475569" strokeWidth="2" />
      <path d="M780 84h80l-6 30h-68z" fill="#cbd5e1" stroke="#475569" strokeWidth="2" />
      <circle cx="820" cy="140" r="22" fill="#e2e8f0" stroke="#475569" strokeWidth="2" />
      <circle cx="812" cy="140" r="3.5" fill="#1e293b" />
      <circle cx="828" cy="140" r="3.5" fill="#1e293b" />
      <path d="M820 118v6M820 156v6" stroke="#64748b" strokeWidth="3" />
      <rect x="796" y="182" width="48" height="18" rx="3" fill="#1e293b" />
      <text x="820" y="195" fontSize="11" fontWeight="800" fill="#ffffff" textAnchor="middle" fontFamily={FONT}>
        IP44
      </text>
      <rect x="892" y="96" width="76" height="66" rx="6" fill="#cbd5e1" stroke="#475569" strokeWidth="2" />
      {[904, 956].map((x) => (
        <circle key={x} cx={x} cy="108" r="3" fill="#475569" />
      ))}
      <path d="M930 162v24" stroke="#475569" strokeWidth="9" />
      <rect x="920" y="160" width="20" height="8" rx="2" fill="#1e293b" />
      <text x="930" y="136" fontSize="13" fontWeight="800" fill={INK} textAnchor="middle" fontFamily={FONT}>
        IP67
      </text>
      {/* water drops */}
      {[[880, 72], [960, 70], [870, 196]].map(([x, y]) => (
        <path key={x} d={`M${x} ${y}q-5 8 0 10q5 -2 0 -10z`} fill="#38bdf8" />
      ))}

      {/* Tool board with VDE-insulated tools */}
      <rect x="596" y="246" width="176" height="104" rx="4" fill="url(#ep-perf)" stroke="#8b6f47" strokeWidth="2" />
      {/* VDE screwdriver */}
      <rect x="622" y="258" width="20" height="56" rx="6" fill="#dc2626" stroke="#7f1d1d" strokeWidth="1.5" />
      <rect x="622" y="290" width="20" height="24" rx="4" fill="#facc15" />
      <text x="632" y="276" fontSize="7" fontWeight="800" fill="#ffffff" textAnchor="middle" fontFamily={FONT}>
        VDE
      </text>
      <path d="M626 296l6 -8 6 8zM626 298l6 8 6 -8z" fill="#1e293b" />
      <rect x="628" y="314" width="8" height="26" fill="#dc2626" />
      <path d="M630 340h4v6h-4z" fill="#94a3b8" />
      {/* VDE pliers */}
      <path d="M668 260l14 50M700 260l-14 50" stroke="#dc2626" strokeWidth="10" strokeLinecap="round" />
      <path d="M668 260l14 50M700 260l-14 50" stroke="#facc15" strokeWidth="10" strokeLinecap="round" strokeDasharray="0 34 14 40" />
      <path d="M682 310l2 26M686 310l-2 26" stroke="#64748b" strokeWidth="6" strokeLinecap="round" />
      {/* cable stripper */}
      <rect x="724" y="262" width="22" height="60" rx="5" fill="#2563eb" />
      <rect x="728" y="322" width="14" height="18" rx="2" fill="#94a3b8" />

      {/* Workbench */}
      <rect x="592" y="420" width="400" height="20" rx="3" fill="#a16207" />
      <rect x="592" y="440" width="400" height="10" fill="#854d0e" />
      <rect x="610" y="450" width="14" height="106" fill="#78350f" />
      <rect x="960" y="450" width="14" height="106" fill="#78350f" />
      <rect x="624" y="520" width="336" height="8" fill="#78350f" />
      {/* tool case under the bench */}
      <rect x="700" y="486" width="120" height="34" rx="4" fill="#dc2626" />
      <rect x="745" y="480" width="30" height="8" rx="2" fill="#7f1d1d" />

      {/* Two-pole voltage tester lying on the bench */}
      <rect x="608" y="380" width="64" height="34" rx="8" fill="#facc15" stroke="#a16207" strokeWidth="2" />
      <rect x="616" y="386" width="30" height="20" rx="2" fill="#0f172a" />
      <text x="631" y="400" fontSize="9" fill="#4ade80" textAnchor="middle" fontFamily="monospace">
        0 V
      </text>
      {[654, 664].map((x) => (
        <circle key={x} cx={x} cy="388" r="2.5" fill="#dc2626" />
      ))}
      <path d="M672 398h10" stroke="#475569" strokeWidth="4" />
      <path d="M612 412q-14 6 -4 10 40 -2 90 -8" stroke="#1e293b" strokeWidth="3" fill="none" />
      <rect x="696" y="398" width="54" height="16" rx="6" fill="#facc15" stroke="#a16207" strokeWidth="2" />
      <path d="M750 406h12" stroke="#475569" strokeWidth="3" />

      {/* Single-pole phase tester (screwdriver) */}
      <rect x="784" y="398" width="54" height="14" rx="6" fill="#fca5a5" stroke="#b91c1c" strokeWidth="1.5" opacity="0.9" />
      <rect x="796" y="401" width="16" height="8" rx="3" fill="#fde047" />
      <circle cx="783" cy="405" r="5" fill="#94a3b8" stroke="#475569" strokeWidth="1.5" />
      <path d="M838 405h34" stroke="#64748b" strokeWidth="4" />
      <path d="M872 402h5v6h-5z" fill="#94a3b8" />

      {/* Drill with protection class II rating plate */}
      <path d="M886 336h76q16 0 16 16v8q0 10 -12 10h-34l-6 46h-28l4 -46h-16z" fill="#15803d" stroke="#14532d" strokeWidth="2" />
      <rect x="850" y="344" width="36" height="14" rx="3" fill="#475569" />
      <path d="M834 351h16" stroke="#94a3b8" strokeWidth="4" />
      <rect x="904" y="412" width="32" height="8" rx="2" fill="#1e293b" />
      <rect x="912" y="344" width="48" height="22" rx="2" fill="#ffffff" stroke="#475569" strokeWidth="1" />
      <rect x="917" y="348" width="14" height="14" fill="none" stroke={INK} strokeWidth="1.5" />
      <rect x="920.5" y="351.5" width="7" height="7" fill="none" stroke={INK} strokeWidth="1.5" />
      <text x="946" y="353" fontSize="5.5" fill={INK} textAnchor="middle" fontFamily={FONT}>
        230 V~
      </text>
      <text x="946" y="361" fontSize="5.5" fill={INK} textAnchor="middle" fontFamily={FONT}>
        600 W
      </text>
    </svg>
  );
}
