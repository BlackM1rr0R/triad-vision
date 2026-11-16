import { CARD_H, CARD_W, PERMITS, SPECIMEN, type CardSide, type PermitKey } from '@/lib/residenceCard/card';

/**
 * Self-drawn SPECIMEN of the German electronic residence permit (eAT), front or back. Deliberately not mistakable
 * for a real card: pastel colours, no eagle / federal emblems, no hologram, guilloche or other security features,
 * a large "MUSTER · SPECIMEN" watermark and a red specimen band. Decorative (aria-hidden): the page overlays
 * numbered hotspot buttons and explains every field in text.
 */

const INK = '#1f2937';
const LABEL = '#64748b';
const FONT = 'system-ui, -apple-system, Segoe UI, sans-serif';

const Field = ({ x, y, label, value, size = 20, w }: { x: number; y: number; label: string; value: string; size?: number; w?: number }) => (
  <g>
    <text x={x} y={y} fontSize="11" fill={LABEL} fontFamily={FONT} letterSpacing="0.5">
      {label}
    </text>
    <text x={x} y={y + size + 4} fontSize={size} fontWeight="700" fill={INK} fontFamily={FONT} textLength={w} lengthAdjust={w ? 'spacingAndGlyphs' : undefined}>
      {value}
    </text>
  </g>
);

const Watermark = ({ specimen }: { specimen: string }) => (
  <>
    <text x={CARD_W / 2} y={CARD_H / 2 + 30} textAnchor="middle" fontSize="92" fontWeight="900" fill="#dc2626" opacity="0.16" fontFamily={FONT} transform={`rotate(-18 ${CARD_W / 2} ${CARD_H / 2})`}>
      MUSTER · SPECIMEN
    </text>
    <rect x="0" y={CARD_H - 30} width={CARD_W} height="30" fill="#dc2626" opacity="0.9" />
    <text x={CARD_W / 2} y={CARD_H - 10} textAnchor="middle" fontSize="15" fontWeight="800" fill="#ffffff" fontFamily={FONT} letterSpacing="1">
      {specimen}
    </text>
  </>
);

export function SpecimenCard({ side, permit, specimen }: { side: CardSide; permit: PermitKey; specimen: string }) {
  const p = PERMITS[permit];
  return (
    <svg viewBox={`0 0 ${CARD_W} ${CARD_H}`} className="block h-auto w-full" aria-hidden>
      <defs>
        <linearGradient id={`eat-bg-${side}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={side === 'front' ? '#e0f2fe' : '#ecfccb'} />
          <stop offset="1" stopColor={side === 'front' ? '#f5d0fe' : '#e0e7ff'} />
        </linearGradient>
        <clipPath id={`eat-clip-${side}`}>
          <rect width={CARD_W} height={CARD_H} rx="34" />
        </clipPath>
      </defs>
      <g clipPath={`url(#eat-clip-${side})`}>
        <rect width={CARD_W} height={CARD_H} fill={`url(#eat-bg-${side})`} />
        {/* soft decorative waves (not a guilloche) */}
        {[0, 1, 2].map((i) => (
          <path key={i} d={`M0 ${120 + i * 40} C 220 ${60 + i * 40}, 520 ${200 + i * 40}, ${CARD_W} ${110 + i * 40}`} fill="none" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="10" />
        ))}

        {side === 'front' ? (
          <>
            <text x="40" y="58" fontSize="28" fontWeight="800" fill={INK} fontFamily={FONT} letterSpacing="2">
              AUFENTHALTSTITEL
            </text>
            <text x="40" y="80" fontSize="11" fill={LABEL} fontFamily={FONT}>
              {SPECIMEN.cardNumber}
            </text>
            <text x="816" y="58" textAnchor="end" fontSize="24" fontWeight="800" fill="#b91c1c" fontFamily="ui-monospace, monospace">
              {SPECIMEN.cardNumber}
            </text>
            {/* photo placeholder with silhouette */}
            <rect x="40" y="100" width="200" height="250" rx="12" fill="#ffffff" stroke="#94a3b8" strokeWidth="2" />
            <circle cx="140" cy="195" r="48" fill="#cbd5e1" />
            <path d="M62 340 C 70 270, 210 270, 218 340 Z" fill="#cbd5e1" />
            <text x="140" y="372" textAnchor="middle" fontSize="11" fill={LABEL} fontFamily={FONT}>
              MUSTER
            </text>

            <Field x={270} y={104} label="NAME / SURNAME" value={SPECIMEN.surname} size={24} />
            <Field x={270} y={160} label="VORNAMEN / GIVEN NAMES" value={SPECIMEN.givenNames} />
            <Field x={270} y={210} label="GESCHLECHT / SEX" value={SPECIMEN.sex} size={18} />
            <Field x={400} y={210} label="STAATSANGEHÖRIGKEIT" value={SPECIMEN.nationality} size={18} />
            <Field x={560} y={210} label="GEBURTSDATUM" value={SPECIMEN.birthDate} size={18} />
            <text x="270" y="270" fontSize="11" fill={LABEL} fontFamily={FONT}>
              ART DES TITELS / TYPE OF PERMIT
            </text>
            <text x="270" y="294" fontSize="22" fontWeight="800" fill="#1d4ed8" fontFamily={FONT}>
              {p.type}
            </text>
            <text x="270" y="322" fontSize="16" fontWeight="700" fill={INK} fontFamily={FONT}>
              {p.basis}
            </text>
            <text x="270" y="356" fontSize="11" fill={LABEL} fontFamily={FONT}>
              ANMERKUNGEN / REMARKS
            </text>
            {p.remarks.map((r, i) => (
              <text key={r} x="270" y={378 + i * 22} fontSize="15" fontWeight="700" fill={INK} fontFamily={FONT}>
                {r}
              </text>
            ))}
            {/* chip contact (generic symbol) */}
            <rect x="690" y="150" width="92" height="72" rx="12" fill="#facc15" stroke="#a16207" strokeWidth="2" />
            <path d="M690 186h92M736 150v72M712 150v20M760 150v20M712 202v20M760 202v20" stroke="#a16207" strokeWidth="2" />
            <Field x={270} y={436} label="GÜLTIG BIS / DATE OF EXPIRY" value={p.validUntil} size={20} />
            {/* signature */}
            <path d="M480 492 c 20 -30, 40 10, 60 -12 s 30 18, 50 -8 s 20 6, 40 -4" fill="none" stroke="#1e3a8a" strokeWidth="2.5" strokeLinecap="round" />
            <text x="540" y="505" textAnchor="middle" fontSize="10" fill={LABEL} fontFamily={FONT}>
              UNTERSCHRIFT
            </text>
            <text x="700" y="450" fontSize="11" fill={LABEL} fontFamily={FONT}>
              CAN
            </text>
            <text x="700" y="478" fontSize="24" fontWeight="800" fill={INK} fontFamily="ui-monospace, monospace">
              {SPECIMEN.can}
            </text>
          </>
        ) : (
          <>
            <Field x={40} y={44} label="GEBURTSORT / PLACE OF BIRTH" value={SPECIMEN.birthPlace} />
            <Field x={40} y={100} label="AUGENFARBE / EYES" value={SPECIMEN.eyes} size={18} />
            <Field x={250} y={100} label="GRÖSSE / HEIGHT" value={SPECIMEN.height} size={18} />
            <text x="40" y="162" fontSize="11" fill={LABEL} fontFamily={FONT}>
              ANSCHRIFT / ADDRESS
            </text>
            <text x="40" y="186" fontSize="18" fontWeight="700" fill={INK} fontFamily={FONT}>
              {SPECIMEN.street}
            </text>
            <text x="40" y="210" fontSize="18" fontWeight="700" fill={INK} fontFamily={FONT}>
              {SPECIMEN.city}
            </text>
            <rect x="40" y="222" width="320" height="36" rx="6" fill="#ffffff" fillOpacity="0.6" stroke="#94a3b8" strokeDasharray="6 5" />
            <text x="200" y="245" textAnchor="middle" fontSize="11" fill={LABEL} fontFamily={FONT}>
              (Platz für Adress-Aufkleber)
            </text>
            <Field x={40} y={286} label="AUSSTELLENDE BEHÖRDE / AUTHORITY" value={SPECIMEN.authority} size={16} />
            <Field x={40} y={336} label="AUSGESTELLT AM / DATE OF ISSUE" value={SPECIMEN.issued} size={16} />
            <text x="480" y="62" fontSize="11" fill={LABEL} fontFamily={FONT}>
              ANMERKUNGEN / REMARKS
            </text>
            <text x="480" y="88" fontSize="15" fontWeight="700" fill={INK} fontFamily={FONT}>
              {permit === 'ne' ? '—' : 'SIEHE ZUSATZBLATT'}
            </text>
            {/* MRZ */}
            <rect x="0" y="384" width={CARD_W} height="126" fill="#ffffff" fillOpacity="0.85" />
            {SPECIMEN.mrz.map((line, i) => (
              <text key={line} x="40" y={420 + i * 34} fontSize="27" fill={INK} fontFamily="ui-monospace, 'Courier New', monospace" textLength={776} lengthAdjust="spacingAndGlyphs">
                {line}
              </text>
            ))}
          </>
        )}
        <Watermark specimen={specimen} />
      </g>
      <rect x="1" y="1" width={CARD_W - 2} height={CARD_H - 2} rx="34" fill="none" stroke="#94a3b8" strokeWidth="2" />
    </svg>
  );
}
