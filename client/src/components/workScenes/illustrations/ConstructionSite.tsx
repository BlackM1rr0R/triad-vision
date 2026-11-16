/**
 * Self-drawn construction site (side view): building shell with a façade scaffold (green release tag, side
 * protection), a ladder, a tower crane with a suspended load and a signaller, an excavator with its marked swing
 * zone, the construction site sign at the fence, the site container (first-aid box, site diary) and a worker in
 * full PPE wet-cutting concrete in the foreground. Decorative (aria-hidden): the hotspots on top are real
 * buttons. viewBox 1000 × 640, marker coordinates: lib/workScenes/scenes/constructionSite.ts. Fixed colours on
 * its own light "paper".
 */

const INK = '#1e293b';
const CONCRETE = '#cbd5e1';
const CONCRETE_D = '#94a3b8';
const SCAFFOLD = '#64748b';
const CRANE = '#f59e0b';
const CRANE_D = '#b45309';
const VEST = '#f97316';
const REFLECT = '#e2e8f0';
const HELMET = '#facc15';

export function ConstructionSiteArt() {
  return (
    <svg viewBox="0 0 1000 640" className="block h-auto w-full select-none" aria-hidden>
      <defs>
        <linearGradient id="cs-sky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#bae6fd" />
          <stop offset="1" stopColor="#f0f9ff" />
        </linearGradient>
        <pattern id="cs-ground" width="40" height="40" patternUnits="userSpaceOnUse">
          <rect width="40" height="40" fill="#e7d9bd" />
          <circle cx="8" cy="10" r="2" fill="#cdb98f" />
          <circle cx="28" cy="24" r="2.5" fill="#cdb98f" />
          <circle cx="16" cy="34" r="1.5" fill="#bfa877" />
        </pattern>
        <pattern id="cs-hatch" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="20" height="20" fill="#ffffff" />
          <rect width="10" height="20" fill="#ef4444" />
        </pattern>
        <pattern id="cs-brick" width="24" height="12" patternUnits="userSpaceOnUse">
          <rect width="24" height="12" fill="#e2b8a0" />
          <path d="M0 0H24M0 6H24M12 0V6M0 6V12M24 6V12" stroke="#c99a80" strokeWidth="1" />
        </pattern>
        <pattern id="cs-mesh" width="10" height="10" patternUnits="userSpaceOnUse">
          <path d="M0 0L10 10M10 0L0 10" stroke="#94a3b8" strokeWidth="0.8" />
        </pattern>
      </defs>

      {/* Sky, clouds and ground */}
      <rect width="1000" height="445" fill="url(#cs-sky)" />
      <g fill="#ffffff" opacity="0.9">
        <ellipse cx="520" cy="130" rx="46" ry="14" />
        <ellipse cx="548" cy="120" rx="30" ry="14" />
        <ellipse cx="900" cy="80" rx="52" ry="14" />
        <ellipse cx="930" cy="70" rx="28" ry="12" />
      </g>
      <rect y="440" width="1000" height="200" fill="url(#cs-ground)" />
      <rect y="438" width="1000" height="5" fill="#bfa877" />

      {/* Building shell (Rohbau): slabs, columns, brick infill on the ground floor */}
      <rect x="40" y="350" width="250" height="92" fill="url(#cs-brick)" />
      <rect x="110" y="380" width="44" height="60" fill="#475569" />
      {[150, 250, 350].map((y) => (
        <rect key={y} x="34" y={y} width="262" height="12" fill={CONCRETE} stroke={CONCRETE_D} strokeWidth="2" />
      ))}
      {[40, 150, 274].map((x) => (
        <rect key={x} x={x} y="150" width="16" height="292" fill={CONCRETE} stroke={CONCRETE_D} strokeWidth="2" />
      ))}
      {[0, 1, 2, 3].map((i) => (
        <path key={i} d={`M${60 + i * 60} 150v-18`} stroke="#78716c" strokeWidth="3" />
      ))}

      {/* Façade scaffold: standards, decks, side protection (guardrail, mid rail, toe board) */}
      {[24, 114, 204, 294].map((x) => (
        <rect key={x} x={x} y="98" width="6" height="344" fill={SCAFFOLD} />
      ))}
      {[150, 250, 350].map((y) => (
        <g key={y}>
          <rect x="20" y={y - 8} width="282" height="8" fill="#a16207" stroke="#713f12" strokeWidth="1.5" />
          {/* toe board */}
          <rect x="20" y={y - 20} width="282" height="12" fill="#facc15" stroke="#a16207" strokeWidth="1" />
          {/* guardrail and mid rail */}
          <path d={`M20 ${y - 58}H302M20 ${y - 36}H302`} stroke={SCAFFOLD} strokeWidth="4" />
        </g>
      ))}
      {[0, 1, 2].map((i) => (
        <path key={i} d={`M${30 + i * 90} 442L${114 + i * 90} 350`} stroke={SCAFFOLD} strokeWidth="2.5" opacity="0.7" />
      ))}
      {/* scaffold release tag (Gerüstkennzeichnung) */}
      <rect x="32" y="372" width="34" height="46" rx="4" fill="#16a34a" stroke="#14532d" strokeWidth="2" />
      <path d="M40 388l6 6 12-12" stroke="#ffffff" strokeWidth="4" fill="none" strokeLinecap="round" />
      <text x="49" y="411" fontSize="9" fontWeight="800" fill="#ffffff" textAnchor="middle" fontFamily="system-ui, sans-serif">
        FREI
      </text>

      {/* Ladder leaning on the scaffold, extending above the landing */}
      <path d="M318 442L288 196M342 442L312 196" stroke="#64748b" strokeWidth="5" strokeLinecap="round" />
      {Array.from({ length: 10 }, (_, i) => {
        const y = 424 - i * 24;
        const dx = ((442 - y) * 30) / 246;
        return <path key={i} d={`M${318 - dx} ${y}H${342 - dx}`} stroke="#64748b" strokeWidth="3.5" />;
      })}

      {/* Tower crane: mast, jib, counter-jib, cab, trolley, hook and suspended load */}
      <rect x="410" y="70" width="22" height="372" fill="none" stroke={CRANE} strokeWidth="4" />
      {Array.from({ length: 15 }, (_, i) => (
        <path key={i} d={`M410 ${70 + i * 24.8}l22 24.8`} stroke={CRANE} strokeWidth="2.5" />
      ))}
      <rect x="400" y="436" width="42" height="10" fill="#57534e" />
      <path d="M421 70V22" stroke={CRANE_D} strokeWidth="5" />
      <path d="M421 22L330 62M421 22L840 62" stroke={CRANE_D} strokeWidth="1.5" />
      <rect x="330" y="60" width="510" height="14" fill="none" stroke={CRANE} strokeWidth="3.5" />
      {Array.from({ length: 34 }, (_, i) => (
        <path key={i} d={`M${330 + i * 15} 74l7.5 -14l7.5 14`} stroke={CRANE} strokeWidth="2" fill="none" />
      ))}
      <rect x="334" y="74" width="40" height="30" fill="#78716c" stroke="#44403c" strokeWidth="2" />
      <rect x="432" y="76" width="32" height="26" rx="3" fill="#fde68a" stroke={CRANE_D} strokeWidth="2" />
      <rect x="440" y="81" width="18" height="12" fill="#7dd3fc" />
      <rect x="588" y="74" width="24" height="8" fill="#334155" />
      <path d="M596 82V212M604 82V212" stroke="#334155" strokeWidth="1.5" />
      <path d="M592 212h16l-4 12h-8z" fill="#334155" />
      <path d="M600 224v6" stroke="#334155" strokeWidth="3" />
      <path d="M600 230L566 242M600 230L634 242" stroke="#475569" strokeWidth="2" />
      <rect x="562" y="242" width="76" height="8" fill="#a16207" />
      <rect x="566" y="250" width="68" height="22" fill="#e2b8a0" stroke="#9a3412" strokeWidth="1.5" />
      <path d="M566 261H634M583 250v11M600 261v11M617 250v11" stroke="#9a3412" strokeWidth="1.2" />
      <rect x="562" y="272" width="76" height="6" fill="#a16207" />
      {/* "no one below" zone under the load */}
      <path d="M560 446l80 0" stroke="#ef4444" strokeWidth="3" strokeDasharray="8 6" />

      {/* Signaller (Einweiser) with raised right arm */}
      <g>
        <path d="M512 440v-36M528 440v-36" stroke="#1e3a8a" strokeWidth="9" strokeLinecap="round" />
        <rect x="506" y="440" width="12" height="6" rx="2" fill="#1e293b" />
        <rect x="522" y="440" width="12" height="6" rx="2" fill="#1e293b" />
        <rect x="503" y="372" width="34" height="36" rx="8" fill={VEST} />
        <path d="M503 388h34M503 398h34" stroke={REFLECT} strokeWidth="3" />
        <path d="M535 378L548 344" stroke={VEST} strokeWidth="8" strokeLinecap="round" />
        <circle cx="549" cy="340" r="5" fill="#f2c9a0" />
        <path d="M505 380L494 404" stroke={VEST} strokeWidth="8" strokeLinecap="round" />
        <circle cx="520" cy="360" r="11" fill="#f2c9a0" />
        <path d="M507 357a13 12 0 0 1 26 0z" fill="#ffffff" stroke="#94a3b8" strokeWidth="1.5" />
        <rect x="504" y="355" width="32" height="4" rx="2" fill="#ffffff" stroke="#94a3b8" strokeWidth="1" />
      </g>

      {/* Excavator with the marked swing zone (danger zone) */}
      <ellipse cx="720" cy="458" rx="140" ry="32" fill="url(#cs-hatch)" opacity="0.45" />
      <ellipse cx="720" cy="458" rx="140" ry="32" fill="none" stroke="#dc2626" strokeWidth="3" strokeDasharray="12 8" />
      <rect x="640" y="436" width="160" height="30" rx="15" fill="#334155" />
      {[660, 690, 720, 750, 780].map((x) => (
        <circle key={x} cx={x} cy="451" r="9" fill="#64748b" stroke="#1e293b" strokeWidth="2" />
      ))}
      <rect x="652" y="396" width="122" height="40" rx="6" fill="#eab308" stroke="#a16207" strokeWidth="2" />
      <rect x="640" y="404" width="20" height="28" rx="4" fill="#a16207" />
      <path d="M704 396v-42h40l10 42z" fill="#eab308" stroke="#a16207" strokeWidth="2" />
      <path d="M710 392v-32h30l7 32z" fill="#7dd3fc" />
      <rect x="664" y="384" width="8" height="14" fill="#1e293b" />
      <path d="M760 404L812 336" stroke="#eab308" strokeWidth="14" strokeLinecap="round" />
      <path d="M812 336L852 404" stroke="#eab308" strokeWidth="11" strokeLinecap="round" />
      <path d="M768 392L806 344" stroke="#a16207" strokeWidth="4" />
      <path d="M838 398l26 10l-6 26h-26z" fill="#475569" stroke="#1e293b" strokeWidth="2" />
      <path d="M832 434l-4 6M842 434l-2 6M852 434v6" stroke="#1e293b" strokeWidth="2" />
      <rect x="742" y="376" width="22" height="8" rx="3" fill="#f97316" />

      {/* Site fence and construction site sign (Baustellenschild) */}
      <rect x="856" y="378" width="144" height="64" fill="url(#cs-mesh)" stroke="#64748b" strokeWidth="2" />
      {[868, 980].map((x) => (
        <g key={x}>
          <rect x={x - 3} y="244" width="6" height="200" fill="#475569" />
          <rect x={x - 14} y="436" width="28" height="10" rx="2" fill="#94a3b8" />
        </g>
      ))}
      <rect x="856" y="250" width="136" height="104" rx="4" fill="#ffffff" stroke={INK} strokeWidth="2.5" />
      <rect x="856" y="250" width="136" height="22" rx="4" fill="#1d4ed8" />
      <text x="924" y="266" fontSize="13" fontWeight="800" fill="#ffffff" textAnchor="middle" fontFamily="system-ui, sans-serif">
        BAUSTELLE
      </text>
      {[284, 298, 312, 326].map((y, i) => (
        <path key={y} d={`M866 ${y}h${[70, 96, 82, 60][i]}`} stroke="#94a3b8" strokeWidth="3" />
      ))}
      <circle cx="966" cy="334" r="12" fill="#ffffff" stroke="#dc2626" strokeWidth="4" />
      <path d="M958 342l16-16" stroke="#dc2626" strokeWidth="4" />
      <path d="M966 326v8" stroke={INK} strokeWidth="2" />

      {/* Site container with first-aid box and site diary on the table */}
      <rect x="738" y="498" width="252" height="132" rx="3" fill="#2563eb" stroke="#1e3a8a" strokeWidth="3" />
      {Array.from({ length: 12 }, (_, i) => (
        <path key={i} d={`M${748 + i * 20} 502v124`} stroke="#1d4ed8" strokeWidth="3" />
      ))}
      <rect x="766" y="512" width="198" height="114" fill="#f8fafc" stroke="#1e3a8a" strokeWidth="2" />
      <path d="M964 512l22 8v100l-22 6z" fill="#3b82f6" stroke="#1e3a8a" strokeWidth="2" />
      {/* first-aid box */}
      <rect x="788" y="526" width="44" height="38" rx="4" fill="#ffffff" stroke="#16a34a" strokeWidth="3" />
      <path d="M810 534v22M799 545h22" stroke="#16a34a" strokeWidth="6" />
      {/* safety notice */}
      <rect x="846" y="524" width="30" height="40" rx="2" fill="#dcfce7" stroke="#16a34a" strokeWidth="1.5" />
      <path d="M852 534h18M852 542h14M852 550h18" stroke="#16a34a" strokeWidth="2" />
      {/* table with the site diary and a helmet */}
      <rect x="850" y="590" width="104" height="8" fill="#a16207" />
      <path d="M858 598v28M946 598v28" stroke="#713f12" strokeWidth="5" />
      <rect x="872" y="574" width="52" height="16" rx="2" fill="#0f766e" stroke="#134e4a" strokeWidth="1.5" />
      <rect x="876" y="578" width="44" height="3" fill="#99f6e4" />
      <path d="M878 585h30" stroke="#ccfbf1" strokeWidth="1.5" />
      <path d="M930 590a12 10 0 0 1 22 0z" fill="#ffffff" stroke="#94a3b8" strokeWidth="1.5" />

      {/* Foreground worker in full PPE wet-cutting concrete */}
      <g>
        {/* concrete slab with water spray */}
        <rect x="236" y="598" width="150" height="30" rx="2" fill={CONCRETE} stroke={CONCRETE_D} strokeWidth="2" />
        <path d="M296 598v14" stroke="#64748b" strokeWidth="3" />
        {[[300, 588], [308, 582], [314, 592], [320, 584], [306, 574]].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="2.5" fill="#38bdf8" />
        ))}
        {/* legs and S3 boots */}
        <path d="M166 545l-6 58M196 545l6 58" stroke="#1e3a8a" strokeWidth="20" strokeLinecap="round" />
        <path d="M144 602h30a6 6 0 0 1 6 6v12h-40v-10z" fill="#292524" />
        <path d="M188 602h30a8 8 0 0 1 8 8v10h-38z" fill="#292524" />
        <path d="M140 618h40M188 618h38" stroke="#facc15" strokeWidth="3" />
        {/* torso with hi-vis vest */}
        <rect x="146" y="458" width="68" height="92" rx="16" fill="#1e3a8a" />
        <path d="M150 466h60v80h-60z" fill={VEST} />
        <path d="M150 498h60M150 520h60M168 466v32M192 466v32" stroke={REFLECT} strokeWidth="5" />
        {/* arms holding the cut-off saw */}
        <path d="M208 476Q246 500 252 556" stroke="#1e3a8a" strokeWidth="14" fill="none" strokeLinecap="round" />
        <path d="M156 480Q170 530 232 560" stroke="#1e3a8a" strokeWidth="14" fill="none" strokeLinecap="round" />
        <circle cx="252" cy="558" r="8" fill="#9ca3af" />
        <circle cx="232" cy="562" r="8" fill="#9ca3af" />
        {/* cut-off saw (Trennschleifer) with water hose */}
        <rect x="224" y="552" width="48" height="30" rx="6" fill="#f97316" stroke="#9a3412" strokeWidth="2" />
        <path d="M272 566l14 10" stroke="#475569" strokeWidth="5" />
        <circle cx="290" cy="584" r="20" fill="#e5e7eb" stroke="#475569" strokeWidth="3" />
        <path d="M270 584a20 20 0 0 1 40 0" fill="#f97316" stroke="#9a3412" strokeWidth="2" />
        <circle cx="290" cy="584" r="4" fill="#475569" />
        <path d="M226 580Q200 620 250 634" stroke="#0ea5e9" strokeWidth="3" fill="none" />
        {/* head: face, FFP2 mask, ear defenders, helmet */}
        <rect x="170" y="444" width="20" height="16" fill="#f2c9a0" />
        <circle cx="180" cy="422" r="30" fill="#f2c9a0" />
        <circle cx="194" cy="416" r="3" fill={INK} />
        <path d="M178 436q14 22 30 4v10q-14 14-30 2z" fill="#ffffff" stroke="#94a3b8" strokeWidth="1.5" />
        <path d="M178 446q12 6 30-4" stroke="#cbd5e1" strokeWidth="1.5" fill="none" />
        <path d="M178 440l-26 -8" stroke="#ffffff" strokeWidth="2" />
        <path d="M150 402q0-20 6 -10" stroke="#dc2626" strokeWidth="4" fill="none" />
        <rect x="140" y="410" width="20" height="30" rx="9" fill="#dc2626" stroke="#7f1d1d" strokeWidth="2" />
        <path d="M144 396a36 34 0 0 1 72 0z" fill={HELMET} stroke="#a16207" strokeWidth="2" />
        <rect x="140" y="394" width="84" height="8" rx="4" fill={HELMET} stroke="#a16207" strokeWidth="2" />
        <path d="M180 364v30" stroke="#eab308" strokeWidth="5" />
      </g>
    </svg>
  );
}
