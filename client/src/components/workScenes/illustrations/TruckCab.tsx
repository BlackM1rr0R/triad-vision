/**
 * Self-drawn truck cab (driver's view, left-hand drive): windscreen with the Autobahn ahead, toll OBU and AEBS
 * camera at the top of the windscreen, front mirror, left main + wide-angle mirror, right ramp mirror + main
 * mirror, instrument cluster (tyre pressure, emergency-brake warning), steering wheel with retarder stalk,
 * digital tachograph with driver card and activity buttons, hi-vis vest in the door pocket, warning triangle and
 * ratchet strap on the floor, the sleeping bunk and an AdBlue filler inset. Decorative (aria-hidden): the
 * hotspots on top are real buttons. viewBox 1000 × 640, marker coordinates: lib/workScenes/scenes/truckCab.ts.
 * Fixed colours on its own light background.
 */

const INK = '#1e293b';
const DASH = '#475569';
const DASH_D = '#334155';
const MIRROR = 'url(#tc-mirror)';

export function TruckCabArt() {
  return (
    <svg viewBox="0 0 1000 640" className="block h-auto w-full select-none" aria-hidden>
      <defs>
        <linearGradient id="tc-sky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#7dd3fc" />
          <stop offset="1" stopColor="#e0f2fe" />
        </linearGradient>
        <linearGradient id="tc-mirror" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#e0f2fe" />
          <stop offset="0.5" stopColor="#bae6fd" />
          <stop offset="1" stopColor="#94a3b8" />
        </linearGradient>
        <linearGradient id="tc-dash" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#64748b" />
          <stop offset="1" stopColor="#3b4a5e" />
        </linearGradient>
        <linearGradient id="tc-floor" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#cbd5e1" />
          <stop offset="1" stopColor="#94a3b8" />
        </linearGradient>
        <pattern id="tc-quilt" width="24" height="24" patternUnits="userSpaceOnUse">
          <rect width="24" height="24" fill="#60a5fa" />
          <path d="M0 12H24M12 0V24" stroke="#3b82f6" strokeWidth="2" />
        </pattern>
      </defs>

      {/* Background: cab interior */}
      <rect width="1000" height="640" fill="#e2e8f0" />
      <rect y="470" width="1000" height="170" fill="url(#tc-floor)" />

      {/* Cab roof / headliner */}
      <rect width="1000" height="34" fill="#94a3b8" />

      {/* Windscreen: sky, hills, Autobahn */}
      <path d="M140 34H860L884 304H116Z" fill="url(#tc-sky)" />
      <path d="M128 180q90-40 180-10t180-16 190 10 200-6l6 70H122Z" fill="#86efac" />
      <path d="M124 196q120-24 240-4t260-8 254 6l4 112H118Z" fill="#4ade80" />
      <path d="M470 172H530L820 304H180Z" fill="#64748b" />
      {[
        [182, 186],
        [214, 226],
        [252, 274],
      ].map(([a, b]) => (
        <g key={a}>
          <path d={`M${500 - (a - 172) * 1.1} ${a}L${500 - (b - 172) * 1.1} ${b}`} stroke="#f8fafc" strokeWidth="3" />
          <path d={`M${500 + (a - 172) * 1.1} ${a}L${500 + (b - 172) * 1.1} ${b}`} stroke="#f8fafc" strokeWidth="3" />
        </g>
      ))}
      <path d="M474 172L190 304M526 172L810 304" stroke="#f8fafc" strokeWidth="3" />
      {/* car ahead */}
      <rect x="532" y="206" width="40" height="24" rx="5" fill="#dc2626" />
      <rect x="538" y="210" width="28" height="9" rx="2" fill="#1e293b" />
      <rect x="534" y="224" width="8" height="4" fill="#fde68a" />
      <rect x="562" y="224" width="8" height="4" fill="#fde68a" />
      {/* sun visor strip */}
      <rect x="140" y="34" width="720" height="14" fill="#64748b" />

      {/* Toll OBU on the windscreen */}
      <rect x="400" y="46" width="62" height="30" rx="4" fill={INK} />
      <rect x="406" y="52" width="34" height="14" rx="2" fill="#0f172a" stroke="#38bdf8" strokeWidth="1" />
      <text x="423" y="63" fontSize="9" fill="#38bdf8" textAnchor="middle" fontFamily="monospace">
        OBU
      </text>
      <circle cx="451" cy="59" r="5" fill="#22c55e" />
      <path d="M408 70h30" stroke="#64748b" strokeWidth="2" />

      {/* AEBS camera module behind the mirror area */}
      <rect x="505" y="46" width="44" height="22" rx="6" fill={DASH_D} />
      <circle cx="527" cy="57" r="7" fill="#0f172a" stroke="#94a3b8" strokeWidth="2" />
      <circle cx="529" cy="55" r="2" fill="#7dd3fc" />

      {/* Front mirror (class VI) seen at the top right of the windscreen */}
      <path d="M842 34v18" stroke={INK} strokeWidth="4" />
      <rect x="770" y="50" width="76" height="34" rx="8" fill={MIRROR} stroke={INK} strokeWidth="3" />
      <path d="M782 76h20l6-12" stroke="#64748b" strokeWidth="2" fill="none" />

      {/* A-pillars */}
      <path d="M116 34H140L116 304H96Z" fill={DASH} />
      <path d="M860 34H884L904 304H884Z" fill={DASH} />

      {/* Left side window: main mirror + wide-angle mirror */}
      <path d="M0 34H116L96 304H0Z" fill="#bae6fd" />
      <path d="M0 140h18" stroke={INK} strokeWidth="5" />
      <path d="M18 100v180" stroke={INK} strokeWidth="4" />
      <rect x="28" y="62" width="58" height="118" rx="6" fill={MIRROR} stroke={INK} strokeWidth="4" />
      <path d="M40 150l30-40M48 168l30-40" stroke="#f8fafc" strokeWidth="3" opacity="0.7" />
      <rect x="30" y="198" width="62" height="72" rx="14" fill={MIRROR} stroke={INK} strokeWidth="4" />
      <ellipse cx="61" cy="234" rx="18" ry="22" fill="none" stroke="#f8fafc" strokeWidth="2" opacity="0.7" />
      <path d="M18 160h12M18 234h12" stroke={INK} strokeWidth="4" />

      {/* Right side window: ramp mirror (top) + main mirror */}
      <path d="M884 34H1000V304H904Z" fill="#bae6fd" />
      <path d="M1000 54h-20" stroke={INK} strokeWidth="5" />
      <rect x="900" y="44" width="80" height="56" rx="8" fill={MIRROR} stroke={INK} strokeWidth="4" />
      <path d="M918 88l18-30M934 92l18-30" stroke="#f8fafc" strokeWidth="3" opacity="0.7" />
      <path d="M984 120v160" stroke={INK} strokeWidth="4" />
      <rect x="922" y="128" width="54" height="110" rx="6" fill={MIRROR} stroke={INK} strokeWidth="4" />
      <path d="M934 210l26-40" stroke="#f8fafc" strokeWidth="3" opacity="0.7" />

      {/* Dashboard */}
      <path d="M0 304H1000V470H0Z" fill="url(#tc-dash)" />
      <path d="M0 304Q500 284 1000 304V316Q500 298 0 316Z" fill={DASH_D} />

      {/* Left door with hi-vis vest in the pocket */}
      <rect x="0" y="320" width="160" height="150" fill="#64748b" />
      <path d="M38 340l18-8h28l18 8 6 84H32Z" fill="#facc15" stroke="#a16207" strokeWidth="2" />
      <path d="M56 332l14 30 14-30" fill="#e2e8f0" stroke="#a16207" strokeWidth="2" />
      <path d="M34 382h72M33 402h74" stroke="#cbd5e1" strokeWidth="7" />
      <path d="M34 382h72M33 402h74" stroke="#f8fafc" strokeWidth="2" />
      <rect x="10" y="420" width="140" height="44" rx="6" fill={DASH_D} opacity="0.85" />

      {/* Instrument cluster */}
      <rect x="225" y="318" width="220" height="66" rx="14" fill="#0f172a" stroke="#1e293b" strokeWidth="3" />
      <circle cx="260" cy="351" r="26" fill="#1e293b" stroke="#94a3b8" strokeWidth="2" />
      <path d="M260 351l14-16" stroke="#f97316" strokeWidth="3" strokeLinecap="round" />
      <text x="260" y="370" fontSize="8" fill="#cbd5e1" textAnchor="middle" fontFamily="monospace">
        km/h
      </text>
      {/* tyre pressure display: truck seen from above with tyre values */}
      <rect x="296" y="324" width="70" height="54" rx="4" fill="#020617" stroke="#334155" strokeWidth="1.5" />
      <rect x="323" y="330" width="16" height="42" rx="3" fill="none" stroke="#e2e8f0" strokeWidth="1.5" />
      {[
        [318, 334, '#22c55e'],
        [340, 334, '#22c55e'],
        [318, 362, '#f59e0b'],
        [340, 362, '#22c55e'],
      ].map(([x, y, c]) => (
        <rect key={`${x}-${y}`} x={x as number} y={y as number} width="5" height="8" rx="1" fill={c as string} />
      ))}
      <text x="306" y="340" fontSize="7" fill="#22c55e" textAnchor="middle" fontFamily="monospace">
        8,5
      </text>
      <text x="357" y="340" fontSize="7" fill="#22c55e" textAnchor="middle" fontFamily="monospace">
        8,5
      </text>
      <text x="306" y="370" fontSize="7" fill="#f59e0b" textAnchor="middle" fontFamily="monospace">
        6,9
      </text>
      <text x="357" y="370" fontSize="7" fill="#22c55e" textAnchor="middle" fontFamily="monospace">
        8,4
      </text>
      <text x="331" y="355" fontSize="6" fill="#94a3b8" textAnchor="middle" fontFamily="monospace">
        bar
      </text>
      {/* AEBS warning icon: two vehicles with an impact star */}
      <rect x="376" y="326" width="58" height="50" rx="6" fill="#1c1917" />
      <rect x="382" y="350" width="16" height="10" rx="2" fill="#f59e0b" />
      <rect x="412" y="350" width="16" height="10" rx="2" fill="#f59e0b" />
      <path d="M405 334l3 8 7-3-4 7 7 3-8 2 1 7-6-5-6 5 1-7-8-2 7-3-4-7 7 3z" fill="#f59e0b" />
      <path d="M384 368h44" stroke="#f59e0b" strokeWidth="2" strokeDasharray="4 3" />

      {/* Tachograph in the centre console (DIN slot) */}
      <rect x="470" y="365" width="250" height="100" rx="6" fill="#1e293b" stroke="#0f172a" strokeWidth="3" />
      <rect x="482" y="376" width="118" height="34" rx="3" fill="#bef264" />
      <text x="490" y="391" fontSize="11" fill="#1a2e05" fontFamily="monospace">
        08:42 D
      </text>
      {/* small steering-wheel symbol + driving time */}
      <circle cx="497" cy="401" r="5" fill="none" stroke="#1a2e05" strokeWidth="1.5" />
      <text x="508" y="404" fontSize="9" fill="#1a2e05" fontFamily="monospace">
        3h15
      </text>
      {/* activity buttons: steering wheel, crossed hammers, availability, bed */}
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={482 + i * 30} y="424" width="26" height="30" rx="4" fill="#334155" stroke="#64748b" strokeWidth="1.5" />
      ))}
      <circle cx="495" cy="439" r="8" fill="none" stroke="#f8fafc" strokeWidth="2" />
      <circle cx="495" cy="439" r="2" fill="#f8fafc" />
      <path d="M487 439h16M495 439v8" stroke="#f8fafc" strokeWidth="1.5" />
      <path d="M518 431l14 14M532 431l-14 14" stroke="#f8fafc" strokeWidth="2.5" />
      <path d="M516 433h6M528 433h6" stroke="#f8fafc" strokeWidth="3" />
      <rect x="546" y="432" width="14" height="14" fill="none" stroke="#f8fafc" strokeWidth="2" />
      <path d="M546 446l14-14" stroke="#f8fafc" strokeWidth="2" />
      <path d="M574 445v-10M574 441h18v4M576 438h6" stroke="#f8fafc" strokeWidth="2" fill="none" />
      {/* card slots; driver card sticking out of slot 1 */}
      <rect x="614" y="398" width="96" height="6" rx="2" fill="#020617" />
      <rect x="614" y="436" width="96" height="6" rx="2" fill="#020617" />
      <text x="620" y="458" fontSize="9" fill="#94a3b8" fontFamily="monospace">
        1      2
      </text>
      <rect x="626" y="340" width="72" height="62" rx="6" fill="#f8fafc" stroke="#1e3a8a" strokeWidth="2" />
      <rect x="626" y="340" width="72" height="14" rx="6" fill="#1d4ed8" />
      <circle cx="642" cy="347" r="4" fill="none" stroke="#facc15" strokeWidth="1.5" strokeDasharray="1.5 1.5" />
      <rect x="634" y="360" width="20" height="24" rx="2" fill="#cbd5e1" />
      <circle cx="644" cy="368" r="5" fill="#64748b" />
      <path d="M636 384q8-10 16 0" fill="#64748b" />
      <rect x="660" y="362" width="16" height="12" rx="2" fill="#eab308" />
      <path d="M660 382h30M660 390h22" stroke="#94a3b8" strokeWidth="2" />

      {/* Steering wheel with column and retarder stalk */}
      <rect x="318" y="460" width="24" height="60" fill={DASH_D} />
      <path d="M352 470L452 446" stroke="#1e293b" strokeWidth="10" strokeLinecap="round" />
      <rect x="436" y="436" width="30" height="18" rx="7" fill="#0f172a" transform="rotate(-13 451 445)" />
      <path d="M440 444l6-4 6 4 6-4" stroke="#facc15" strokeWidth="1.5" fill="none" transform="rotate(-13 451 445)" />
      <path d="M352 486L420 486" stroke="#1e293b" strokeWidth="8" strokeLinecap="round" />
      <circle cx="330" cy="520" r="110" fill="none" stroke="#0f172a" strokeWidth="22" />
      <circle cx="330" cy="520" r="110" fill="none" stroke="#334155" strokeWidth="6" />
      <path d="M232 540Q330 560 428 540M330 560V626" stroke="#0f172a" strokeWidth="18" fill="none" />
      <circle cx="330" cy="520" r="40" fill="#1e293b" stroke="#475569" strokeWidth="3" />
      <circle cx="330" cy="520" r="14" fill="#475569" />
      <rect x="282" y="524" width="14" height="10" rx="2" fill="#64748b" />
      <rect x="364" y="524" width="14" height="10" rx="2" fill="#64748b" />

      {/* Warning triangle in its case on the floor */}
      <rect x="490" y="510" width="110" height="96" rx="10" fill="#cbd5e1" stroke="#64748b" strokeWidth="3" />
      <path d="M545 522L590 598H500Z" fill="#dc2626" stroke="#7f1d1d" strokeWidth="3" />
      <path d="M545 546L569 586H521Z" fill="#cbd5e1" />
      <path d="M500 604h90" stroke="#475569" strokeWidth="3" />

      {/* Ratchet strap: rolled webbing, ratchet and label */}
      <circle cx="660" cy="560" r="40" fill="#f97316" stroke="#c2410c" strokeWidth="3" />
      <circle cx="660" cy="560" r="28" fill="none" stroke="#c2410c" strokeWidth="2" />
      <circle cx="660" cy="560" r="16" fill="none" stroke="#c2410c" strokeWidth="2" />
      <circle cx="660" cy="560" r="6" fill="#7c2d12" />
      <path d="M698 552h20v18h-20" fill="#f97316" stroke="#c2410c" strokeWidth="2" />
      <rect x="712" y="540" width="26" height="42" rx="4" fill="#94a3b8" stroke="#334155" strokeWidth="2" />
      <path d="M716 548h18M716 556h18M716 564h18M716 572h18" stroke="#334155" strokeWidth="2" />
      <rect x="640" y="604" width="40" height="22" rx="2" fill="#2563eb" />
      <text x="660" y="618" fontSize="9" fill="#ffffff" textAnchor="middle" fontWeight="700" fontFamily="system-ui, sans-serif">
        LC
      </text>

      {/* Sleeping bunk behind the seats */}
      <rect x="760" y="478" width="240" height="162" fill="#cbd5e1" />
      <path d="M760 478h40v162h-40z" fill="#7c3aed" opacity="0.85" />
      <path d="M770 478v162M785 478v162" stroke="#5b21b6" strokeWidth="2" />
      <rect x="806" y="540" width="190" height="60" rx="10" fill="url(#tc-quilt)" stroke="#1d4ed8" strokeWidth="2" />
      <rect x="930" y="520" width="60" height="30" rx="12" fill="#f8fafc" stroke="#94a3b8" strokeWidth="2" />
      <rect x="806" y="596" width="190" height="16" rx="4" fill="#64748b" />
      <rect x="820" y="490" width="36" height="26" rx="4" fill="#0f172a" />
      <text x="838" y="507" fontSize="9" fill="#fb923c" textAnchor="middle" fontFamily="monospace">
        18°
      </text>

      {/* AdBlue filler inset (outside the cab) */}
      <circle cx="85" cy="555" r="66" fill="#f8fafc" stroke={INK} strokeWidth="3" />
      <rect x="35" y="530" width="100" height="62" rx="10" fill="#e2e8f0" stroke="#64748b" strokeWidth="2" />
      <rect x="71" y="510" width="28" height="22" rx="4" fill="#2563eb" stroke="#1e3a8a" strokeWidth="2" />
      <path d="M75 518h20M75 524h20" stroke="#93c5fd" strokeWidth="2" />
      <text x="85" y="566" fontSize="13" fontWeight="800" fill="#1d4ed8" textAnchor="middle" fontFamily="system-ui, sans-serif">
        AdBlue
      </text>
      <path d="M50 578h70" stroke="#94a3b8" strokeWidth="2" />
    </svg>
  );
}
