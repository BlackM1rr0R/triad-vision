/**
 * Self-drawn patient room on a German hospital ward (front view): electric bed with positioning cushion, call
 * button and the vital-sign chart ("Kurve") at the foot end, infusion stand with syringe pump, wall blood
 * pressure monitor, PPE station and hand-rub dispenser by the door, medication trolley with documentation tablet
 * and sharps container, a floor mat with non-slip socks (fall prevention) and the red emergency trolley in the
 * corridor. Decorative (aria-hidden): the hotspots on top are real buttons. viewBox 1000 × 640, coordinates of
 * the markers: lib/workScenes/scenes/hospitalWard.ts. Fixed colours on its own light "paper".
 */

const INK = '#1e293b';
const STEEL = '#cbd5e1';
const STEEL_D = '#94a3b8';

export function HospitalWardArt() {
  return (
    <svg viewBox="0 0 1000 640" className="block h-auto w-full select-none" aria-hidden>
      <defs>
        <pattern id="hw-floor" width="40" height="40" patternUnits="userSpaceOnUse">
          <rect width="40" height="40" fill="#e2e8f0" />
          <circle cx="10" cy="12" r="1.5" fill="#cbd5e1" />
          <circle cx="28" cy="30" r="1.5" fill="#cbd5e1" />
          <circle cx="32" cy="8" r="1" fill="#cbd5e1" />
        </pattern>
        <linearGradient id="hw-wall" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#ecf6f3" />
          <stop offset="1" stopColor="#d9ece7" />
        </linearGradient>
        <linearGradient id="hw-sky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#bae6fd" />
          <stop offset="1" stopColor="#e0f2fe" />
        </linearGradient>
        <linearGradient id="hw-steel" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#f1f5f9" />
          <stop offset="1" stopColor="#b6c2d1" />
        </linearGradient>
        <linearGradient id="hw-bag" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#f8fafc" stopOpacity="0.9" />
          <stop offset="0.35" stopColor="#e0f2fe" />
          <stop offset="1" stopColor="#bae6fd" />
        </linearGradient>
      </defs>

      {/* Wall and floor */}
      <rect width="1000" height="440" fill="url(#hw-wall)" />
      <rect y="440" width="1000" height="200" fill="url(#hw-floor)" />
      <rect y="432" width="1000" height="10" fill="#94a3b8" />
      {/* wall protection rail */}
      <rect y="300" width="230" height="10" rx="3" fill="#a7c4bc" />

      {/* Window */}
      <rect x="20" y="60" width="125" height="170" rx="6" fill="url(#hw-sky)" stroke="#64748b" strokeWidth="4" />
      <path d="M82 60v170M20 145h125" stroke="#64748b" strokeWidth="3" />
      <path d="M30 210q20-26 40-6q16-18 36 0q14-12 30 2v24H30z" fill="#86efac" opacity="0.7" />

      {/* Medical supply rail behind the bed (oxygen, sockets, reading lamp) */}
      <rect x="230" y="188" width="390" height="28" rx="6" fill="#f8fafc" stroke={STEEL_D} strokeWidth="2" />
      <circle cx="262" cy="202" r="8" fill="#16a34a" stroke="#14532d" strokeWidth="2" />
      <circle cx="292" cy="202" r="8" fill="#e2e8f0" stroke="#475569" strokeWidth="2" />
      {[350, 380, 520, 550].map((x) => (
        <g key={x}>
          <rect x={x - 10} y="194" width="20" height="16" rx="3" fill="#ffffff" stroke="#64748b" strokeWidth="1.5" />
          <path d={`M${x - 3} 199v6M${x + 3} 199v6`} stroke="#334155" strokeWidth="2" />
        </g>
      ))}
      <path d="M455 188v-22h40" stroke="#64748b" strokeWidth="4" fill="none" />
      <path d="M480 166h36l-6 14h-24z" fill="#fde68a" stroke="#a16207" strokeWidth="1.5" />

      {/* Wall blood pressure monitor with cuff basket */}
      <rect x="388" y="66" width="64" height="94" rx="8" fill="#ffffff" stroke={INK} strokeWidth="2" />
      <circle cx="420" cy="100" r="24" fill="#f8fafc" stroke="#334155" strokeWidth="3" />
      {Array.from({ length: 9 }, (_, i) => {
        const a = (-220 + i * 32.5) * (Math.PI / 180);
        return (
          <path
            key={i}
            d={`M${420 + Math.cos(a) * 17} ${100 + Math.sin(a) * 17}L${420 + Math.cos(a) * 21} ${100 + Math.sin(a) * 21}`}
            stroke="#475569"
            strokeWidth="2"
          />
        );
      })}
      <path d="M420 100l11-10" stroke="#dc2626" strokeWidth="3" strokeLinecap="round" />
      <circle cx="420" cy="100" r="3" fill="#1e293b" />
      <rect x="396" y="132" width="48" height="22" rx="4" fill="#cbd5e1" stroke="#64748b" strokeWidth="1.5" />
      <rect x="402" y="128" width="36" height="14" rx="3" fill="#1d4ed8" />
      <path d="M444 140q14 4 8 16t8 18q10 6 4 14" stroke="#334155" strokeWidth="2.5" fill="none" />

      {/* PPE station: glove boxes, masks, gown on a hook */}
      <rect x="640" y="128" width="120" height="86" rx="6" fill="#f8fafc" stroke={STEEL_D} strokeWidth="2" />
      {[
        [652, '#60a5fa', 'S'],
        [690, '#3b82f6', 'M'],
        [728, '#1d4ed8', 'L'],
      ].map(([x, c, s]) => (
        <g key={s as string}>
          <rect x={x as number} y="136" width="32" height="30" rx="3" fill="#ffffff" stroke={c as string} strokeWidth="2.5" />
          <ellipse cx={(x as number) + 16} cy="144" rx="9" ry="4" fill={c as string} />
          <text x={(x as number) + 16} y="161" fontSize="11" fontWeight="800" fill={c as string} textAnchor="middle" fontFamily="system-ui, sans-serif">
            {s}
          </text>
        </g>
      ))}
      <rect x="652" y="174" width="96" height="30" rx="3" fill="#ffffff" stroke="#0d9488" strokeWidth="2" />
      <path d="M668 186q12-8 24 0v8q-12 6-24 0zM704 186q12-8 24 0v8q-12 6-24 0z" fill="#99f6e4" stroke="#0f766e" strokeWidth="1.5" />
      <circle cx="700" cy="226" r="5" fill="#475569" />
      <path d="M700 226l-34 18v74h68v-74z" fill="#fde047" stroke="#a16207" strokeWidth="2" strokeLinejoin="round" />
      <path d="M666 244l-14 52M734 244l14 52" stroke="#a16207" strokeWidth="10" strokeLinecap="round" />
      <path d="M666 244l-14 52M734 244l14 52" stroke="#fde047" strokeWidth="6" strokeLinecap="round" />
      <path d="M684 236q16 10 32 0" stroke="#a16207" strokeWidth="2" fill="none" />

      {/* Hand-rub dispenser by the door */}
      <rect x="784" y="170" width="34" height="74" rx="6" fill="#ffffff" stroke={INK} strokeWidth="2" />
      <rect x="790" y="182" width="22" height="36" rx="3" fill="#bfdbfe" />
      <path d="M801 190q-6 8 0 14q6-6 0-14z" fill="#2563eb" />
      <rect x="806" y="228" width="16" height="8" rx="2" fill="#475569" />
      <path d="M786 246h30v8h-30z" fill="#94a3b8" />
      <circle cx="801" cy="268" r="9" fill="#ffffff" stroke="#0d9488" strokeWidth="2" />
      <text x="801" y="272" fontSize="11" fontWeight="800" fill="#0d9488" textAnchor="middle" fontFamily="system-ui, sans-serif">
        5
      </text>

      {/* Door to the corridor with the emergency trolley */}
      <rect x="836" y="78" width="144" height="362" fill="#f1f5f9" />
      <rect x="836" y="78" width="144" height="250" fill="#e2e8f0" />
      <path d="M836 300h144" stroke="#94a3b8" strokeWidth="6" />
      <path d="M836 400l144-14v54H836z" fill="#cbd5e1" />
      <rect x="836" y="78" width="144" height="362" fill="none" stroke="#475569" strokeWidth="8" />
      <rect x="980" y="78" width="20" height="362" fill="url(#hw-wall)" />
      {/* Notfallwagen */}
      <rect x="862" y="300" width="96" height="116" rx="5" fill="#dc2626" stroke="#7f1d1d" strokeWidth="2" />
      {[318, 342, 366, 390].map((y) => (
        <g key={y}>
          <path d={`M866 ${y + 20}h88`} stroke="#991b1b" strokeWidth="2" />
          <rect x="896" y={y + 6} width="28" height="5" rx="2" fill="#fecaca" />
        </g>
      ))}
      <rect x="870" y="270" width="54" height="32" rx="4" fill="#475569" stroke="#1e293b" strokeWidth="2" />
      <path d="M884 282q4-6 8 0q4-6 8 0q0 6-8 12q-8-6-8-12z" fill="#ef4444" />
      <path d="M908 278l-4 8h6l-4 8" stroke="#facc15" strokeWidth="2.5" fill="none" />
      <rect x="932" y="250" width="14" height="52" rx="6" fill="#ffffff" stroke="#475569" strokeWidth="2" />
      <rect x="932" y="250" width="14" height="10" rx="4" fill="#16a34a" />
      {[872, 948].map((x) => (
        <circle key={x} cx={x} cy="424" r="7" fill="#1e293b" />
      ))}

      {/* Infusion stand with bag and syringe pump (Perfusor) */}
      <path d="M180 62v420" stroke="#64748b" strokeWidth="6" strokeLinecap="round" />
      <path d="M156 66h48" stroke="#64748b" strokeWidth="4" strokeLinecap="round" />
      <path d="M140 494l40-12 40 12M152 504l28-22 28 22" stroke="#64748b" strokeWidth="5" fill="none" strokeLinecap="round" />
      {[140, 152, 208, 220].map((x) => (
        <circle key={x} cx={x} cy={x === 152 || x === 208 ? 506 : 496} r="5" fill="#1e293b" />
      ))}
      <path d="M160 66v12M200 66v12" stroke="#64748b" strokeWidth="2" />
      <rect x="152" y="78" width="56" height="72" rx="8" fill="url(#hw-bag)" stroke="#64748b" strokeWidth="2" />
      <rect x="162" y="92" width="36" height="22" rx="2" fill="#ffffff" stroke="#94a3b8" strokeWidth="1" />
      <path d="M166 99h28M166 106h20" stroke="#64748b" strokeWidth="1.5" />
      <path d="M180 150v8" stroke="#64748b" strokeWidth="3" />
      <rect x="174" y="158" width="12" height="22" rx="4" fill="#e0f2fe" stroke="#64748b" strokeWidth="1.5" />
      <circle cx="180" cy="168" r="2" fill="#0ea5e9" />
      <path d="M180 180q-6 40 30 70q60 60 130 92" stroke="#94a3b8" strokeWidth="2.5" fill="none" />
      {/* syringe pump */}
      <rect x="138" y="250" width="84" height="48" rx="6" fill="#f8fafc" stroke={INK} strokeWidth="2" />
      <rect x="144" y="240" width="70" height="12" rx="3" fill="#e2e8f0" stroke="#64748b" strokeWidth="1.5" />
      <path d="M148 246h46" stroke="#fef3c7" strokeWidth="6" />
      <rect x="194" y="242" width="14" height="8" rx="2" fill="#64748b" />
      <rect x="146" y="260" width="44" height="22" rx="3" fill="#0f172a" />
      <text x="168" y="276" fontSize="11" fill="#4ade80" textAnchor="middle" fontFamily="monospace">
        2.0
      </text>
      <circle cx="204" cy="266" r="5" fill="#16a34a" />
      <circle cx="204" cy="284" r="5" fill="#f59e0b" />
      <path d="M144 246q-24 10-6 60q16 30 120 46" stroke="#f59e0b" strokeWidth="2" fill="none" strokeDasharray="5 3" />

      {/* Patient bed (low position) */}
      <rect x="226" y="270" width="16" height="190" rx="5" fill="#94a3b8" stroke="#475569" strokeWidth="2" />
      <rect x="600" y="316" width="16" height="144" rx="5" fill="#94a3b8" stroke="#475569" strokeWidth="2" />
      <rect x="240" y="388" width="362" height="16" rx="4" fill="#475569" />
      <rect x="296" y="404" width="20" height="62" fill={STEEL_D} />
      <rect x="530" y="404" width="20" height="62" fill={STEEL_D} />
      <rect x="250" y="464" width="350" height="12" rx="4" fill="#64748b" />
      {[264, 586].map((x) => (
        <g key={x}>
          <circle cx={x} cy="490" r="12" fill="#1e293b" />
          <circle cx={x} cy="490" r="4" fill="#94a3b8" />
        </g>
      ))}
      <rect x="560" y="478" width="18" height="8" rx="2" fill="#dc2626" />
      {/* lowered side rail */}
      <rect x="270" y="410" width="140" height="8" rx="3" fill="#cbd5e1" stroke="#64748b" strokeWidth="1.5" />
      {[290, 320, 350, 380].map((x) => (
        <path key={x} d={`M${x} 404v6`} stroke="#64748b" strokeWidth="3" />
      ))}
      {/* mattress with raised backrest */}
      <path d="M242 296l96 62h262v30H242z" fill="#e0f2fe" stroke="#64748b" strokeWidth="2" strokeLinejoin="round" />
      <path d="M242 296l96 62" stroke="#94a3b8" strokeWidth="2" />
      {/* pillow and patient */}
      <path d="M248 300q-2-26 22-24l38 22q14 14-4 24l-34-6q-20-4-22-16z" fill="#ffffff" stroke="#94a3b8" strokeWidth="2" />
      <circle cx="292" cy="300" r="20" fill="#f1c7a6" stroke="#b45309" strokeWidth="1.5" />
      <path d="M273 296q4-22 26-20q14 4 13 16q-10-8-22-6q-10 2-17 10z" fill="#78350f" />
      {/* positioning cushion under the lower legs */}
      <ellipse cx="520" cy="348" rx="52" ry="13" fill="#93c5fd" stroke="#1d4ed8" strokeWidth="2" />
      <path d="M478 348q42 8 84 0" stroke="#1d4ed8" strokeWidth="1.5" fill="none" />
      {/* blanket */}
      <path d="M306 312q30-4 60 14q50 22 110 18q40-6 70-2q44 4 54 14v32H330q-24-10-30-34z" fill="#a5b4fc" stroke="#4338ca" strokeWidth="2" strokeLinejoin="round" />
      <path d="M380 340q60 12 120 6M420 362q80 6 160-4" stroke="#6366f1" strokeWidth="1.5" fill="none" />
      {/* arm with venous access */}
      <path d="M318 330q20 10 30 8" stroke="#f1c7a6" strokeWidth="10" strokeLinecap="round" fill="none" />
      <rect x="336" y="332" width="12" height="8" rx="2" fill="#ffffff" stroke="#64748b" strokeWidth="1" />
      {/* call button on a cord from the supply rail */}
      <path d="M380 216q-16 60 -12 100q2 14 -6 22" stroke="#334155" strokeWidth="2.5" fill="none" />
      <rect x="352" y="334" width="22" height="34" rx="8" fill="#f8fafc" stroke="#334155" strokeWidth="2" />
      <circle cx="363" cy="346" r="6" fill="#dc2626" />
      <path d="M357 360h12" stroke="#94a3b8" strokeWidth="2" />
      {/* chart (Kurve) clipped to the footboard */}
      <rect x="590" y="336" width="44" height="58" rx="3" fill="#ffffff" stroke={INK} strokeWidth="2" />
      <rect x="602" y="330" width="20" height="10" rx="2" fill="#475569" />
      {[350, 362, 374, 386].map((y) => (
        <path key={y} d={`M594 ${y}h36`} stroke="#e2e8f0" strokeWidth="1" />
      ))}
      <path d="M594 372l8-10 8 6 8-14 8 8" stroke="#dc2626" strokeWidth="2" fill="none" />
      <path d="M594 360l8 4 8-6 8 2 8-4" stroke="#2563eb" strokeWidth="2" fill="none" />

      {/* Fall prevention: floor mat and non-slip socks */}
      <path d="M296 524h264l24 44H272z" fill="#5eead4" stroke="#0f766e" strokeWidth="2" strokeLinejoin="round" />
      <path d="M300 532h256" stroke="#0f766e" strokeWidth="1" strokeDasharray="4 4" />
      {[388, 444].map((x) => (
        <g key={x}>
          <path d={`M${x} 534v16q0 10 10 10h22q8 0 8-6t-8-6h-14v-14z`} fill="#fda4af" stroke="#9f1239" strokeWidth="1.5" />
          {[0, 1, 2].map((k) => (
            <circle key={k} cx={x + 6 + k * 8} cy="556" r="1.8" fill="#ffffff" />
          ))}
        </g>
      ))}

      {/* Medication trolley with tablet and sharps container */}
      <rect x="650" y="404" width="150" height="14" rx="4" fill="#475569" />
      <rect x="656" y="418" width="138" height="178" rx="6" fill="url(#hw-steel)" stroke={STEEL_D} strokeWidth="2" />
      {[430, 474, 518, 552].map((y, i) => (
        <g key={y}>
          <rect x="664" y={y} width="122" height={i === 3 ? 34 : 38} rx="4" fill="#ffffff" stroke="#94a3b8" strokeWidth="1.5" />
          <rect x="710" y={y + 6} width="30" height="5" rx="2" fill="#64748b" />
        </g>
      ))}
      {/* pulled-out drawer with a dose dispenser */}
      <path d="M660 474h130l10 30H650z" fill="#f8fafc" stroke="#64748b" strokeWidth="1.5" />
      {Array.from({ length: 4 }, (_, i) => (
        <g key={i}>
          <rect x={666 + i * 32} y="480" width="28" height="18" rx="2" fill={['#fef3c7', '#dbeafe', '#dcfce7', '#fce7f3'][i]} stroke="#64748b" strokeWidth="1" />
          <circle cx={674 + i * 32} cy="489" r="3" fill="#f97316" />
          <circle cx={684 + i * 32} cy="489" r="3" fill={i % 2 ? '#2563eb' : '#ffffff'} stroke="#64748b" strokeWidth="0.8" />
        </g>
      ))}
      {[664, 786].map((x) => (
        <circle key={x} cx={x} cy="606" r="9" fill="#1e293b" />
      ))}
      {/* tablet with nursing documentation */}
      <path d="M690 404l6-16" stroke="#334155" strokeWidth="4" />
      <rect x="660" y="352" width="66" height="44" rx="5" fill="#1e293b" />
      <rect x="665" y="357" width="56" height="34" rx="2" fill="#e0f2fe" />
      <path d="M670 364h30M670 372h44M670 380h36" stroke="#64748b" strokeWidth="2" />
      <circle cx="712" cy="364" r="3" fill="#16a34a" />
      {/* sharps container */}
      <path d="M744 404l4-38h30l4 38z" fill="#facc15" stroke="#a16207" strokeWidth="2" strokeLinejoin="round" />
      <rect x="744" y="356" width="38" height="12" rx="3" fill="#dc2626" stroke="#7f1d1d" strokeWidth="1.5" />
      <path d="M756 362h14" stroke="#7f1d1d" strokeWidth="3" />
      <path d="M750 384h26" stroke="#a16207" strokeWidth="1.5" strokeDasharray="3 2" />
      <path d="M758 392l4-6 4 6z" fill="#1e293b" />

      {/* outline accents */}
      <path d="M0 440h836" stroke={STEEL} strokeWidth="1" />
    </svg>
  );
}
