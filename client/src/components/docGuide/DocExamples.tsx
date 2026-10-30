import type { ReactNode } from 'react';
import { Svg } from '@/components/illustrations/Svg';

/**
 * Built-in "Necə çəkməli?" example pictures: a GOOD and a BAD photo of each main document type, drawn as stylised
 * inline SVG (never a real person's document; no text, so one drawing serves every language). Painted with the
 * illustration tokens (.f-* / .s-*, light + dark theme); the flaws of the BAD picture (glare, fingers, cut-off
 * corner, tilt, shadow, busy background …) use fixed colours so they read on both themes.
 * Admins can replace them per requirement key (Admin → Sənəd bələdçiləri → "Necə çəkməli?").
 */

export type ExampleKind = 'passport' | 'card' | 'photo' | 'diploma' | 'certificate' | 'cv' | 'translation' | 'form';
export const EXAMPLE_KINDS: ExampleKind[] = ['passport', 'card', 'photo', 'diploma', 'certificate', 'cv', 'translation', 'form'];

const KIND_BY_KEY: Record<string, ExampleKind> = {
  PASSPORT: 'passport',
  DRIVING_LICENCE: 'card',
  ID_CARD: 'card',
  PHOTO: 'photo',
  PHOTO_2: 'photo',
  DIPLOMA: 'diploma',
  TRANSCRIPT: 'diploma',
  CV: 'cv',
  VIDEX: 'form',
  SIGNED_CONTRACT: 'form',
  HEALTH_INSURANCE: 'form',
  ACCOMMODATION: 'form',
  PARENT_CONSENT: 'form',
};

/** Which illustrated example a requirement key gets (unknown keys: the generic certificate). */
export const exampleKindOf = (key: string | null | undefined): ExampleKind => {
  const k = (key ?? '').toUpperCase();
  if (KIND_BY_KEY[k]) return KIND_BY_KEY[k];
  if (k.includes('TRANSLATION')) return 'translation';
  if (k.startsWith('PHOTO')) return 'photo';
  if (k.includes('DIPLOMA') || k.includes('TRANSCRIPT')) return 'diploma';
  return 'certificate';
};

const VB = '0 0 200 140';
const GLARE = '#ffffff';
const SHADOW = '#000000';

/** Wooden table / backdrop every photo lies on. */
const Table = () => <rect className="f-sand" x="0" y="0" width="200" height="140" rx="10" />;

/** Text lines on a document (rounded bars). */
const Lines = ({ x, y, w, n, gap = 7, cls = 'f-line' }: { x: number; y: number; w: number; n: number; gap?: number; cls?: string }) => (
  <g>
    {Array.from({ length: n }, (_, i) => (
      <rect key={i} className={cls} x={x} y={y + i * gap} width={i % 3 === 2 ? w * 0.6 : w} height="3" rx="1.5" />
    ))}
  </g>
);

const Mrz = ({ x, y, w }: { x: number; y: number; w: number }) => (
  <g>
    {[0, 6].map((dy) => (
      <g key={dy}>
        {Array.from({ length: Math.floor(w / 5) }, (_, i) => (
          <rect key={i} className="f-ink" x={x + i * 5} y={y + dy} width="3.4" height="3.6" rx=".6" opacity=".75" />
        ))}
      </g>
    ))}
  </g>
);

const Face = ({ cx, cy, r }: { cx: number; cy: number; r: number }) => (
  <g>
    <path className="f-ink" d={`M${cx - r * 1.5} ${cy + r * 2.6} q${r * 1.5} ${-r * 1.6} ${r * 3} 0 v${r * 0.6} h${-r * 3} z`} opacity=".85" />
    <rect className="f-skin" x={cx - r * 0.32} y={cy + r * 0.7} width={r * 0.64} height={r * 0.7} />
    <ellipse className="f-skin" cx={cx} cy={cy} rx={r * 0.82} ry={r} />
    <path className="f-hair" d={`M${cx - r * 0.85} ${cy - r * 0.15} q0 ${-r * 1.05} ${r * 0.85} ${-r * 1.0} q${r * 0.85} ${-r * 0.05} ${r * 0.85} ${r * 1.0} q${-r * 0.3} ${-r * 0.55} ${-r * 0.85} ${-r * 0.55} q${-r * 0.55} 0 ${-r * 0.85} ${r * 0.55} z`} />
  </g>
);

/** Passport data page (photo, lines, MRZ). */
const PassportPage = () => (
  <g>
    <rect className="f-paper" x="0" y="0" width="128" height="88" rx="6" />
    <rect className="f-sky" x="0" y="0" width="128" height="12" rx="6" />
    <rect className="f-sky" x="8" y="18" width="32" height="40" rx="3" />
    <Face cx={24} cy={34} r={7} />
    <Lines x={48} y={20} w={70} n={5} />
    <Mrz x={8} y={68} w={114} />
  </g>
);

const CardFace = () => (
  <g>
    <rect className="f-sky" x="0" y="0" width="112" height="70" rx="8" />
    <rect className="f-paper" x="8" y="14" width="26" height="34" rx="3" />
    <Face cx={21} cy={28} r={6} />
    <Lines x={42} y={16} w={60} n={4} cls="f-ink" />
    <rect className="f-amber" x="8" y="56" width="20" height="8" rx="2" />
  </g>
);

const Seal = ({ x, y, r = 9 }: { x: number; y: number; r?: number }) => (
  <g>
    <circle className="s-ink" cx={x} cy={y} r={r} strokeWidth="1.6" opacity=".7" />
    <circle className="s-ink" cx={x} cy={y} r={r * 0.62} strokeWidth="1" opacity=".55" />
  </g>
);

const Signature = ({ x, y }: { x: number; y: number }) => (
  <path className="s-ink" d={`M${x} ${y} c6 -8 9 6 14 -2 s7 -6 10 2 s6 2 10 -4`} strokeWidth="1.6" strokeLinecap="round" />
);

const DiplomaSheet = () => (
  <g>
    <rect className="f-paper" x="0" y="0" width="136" height="96" rx="4" />
    <rect className="s-amber" x="5" y="5" width="126" height="86" rx="3" strokeWidth="2" />
    <rect className="f-ink" x="38" y="16" width="60" height="6" rx="3" opacity=".8" />
    <Lines x={24} y={32} w={88} n={4} />
    <Seal x={30} y={74} />
    <Signature x={86} y={76} />
  </g>
);

const CertSheet = ({ withStamp = true }: { withStamp?: boolean }) => (
  <g>
    <rect className="f-paper" x="0" y="0" width="84" height="112" rx="4" />
    <rect className="f-ink" x="14" y="10" width="56" height="5" rx="2.5" opacity=".75" />
    <Lines x={12} y={24} w={60} n={8} />
    {withStamp && <Seal x={24} y={94} />}
    <Signature x={46} y={96} />
  </g>
);

/** Red / white flaw overlays. */
const Glare = ({ x, y, rx = 18, ry = 10 }: { x: number; y: number; rx?: number; ry?: number }) => (
  <g>
    <ellipse fill={GLARE} cx={x} cy={y} rx={rx} ry={ry} opacity=".85" />
    <ellipse fill={GLARE} cx={x} cy={y} rx={rx * 1.7} ry={ry * 1.7} opacity=".35" />
  </g>
);

const Finger = ({ x, y, angle = -30 }: { x: number; y: number; angle?: number }) => (
  <g transform={`translate(${x} ${y}) rotate(${angle})`}>
    <rect className="f-skin" x="-9" y="-4" width="18" height="46" rx="9" />
    <rect fill={GLARE} x="-5" y="0" width="10" height="9" rx="4" opacity=".55" />
  </g>
);

const Example = ({ title, className, children }: { title?: string; className?: string; children: ReactNode }) => (
  <Svg viewBox={VB} className={className} title={title}>
    {children}
  </Svg>
);

// ─── Per kind ─────────────────────────────────────────────────────────

const Passport = ({ bad }: { bad: boolean }) =>
  bad ? (
    <>
      <Table />
      <g transform="translate(92 26) rotate(14)">
        <PassportPage />
      </g>
      <Glare x={118} y={60} />
      <Finger x={60} y={92} angle={-40} />
    </>
  ) : (
    <>
      <Table />
      <g transform="translate(36 26)">
        <PassportPage />
      </g>
    </>
  );

const Card = ({ bad }: { bad: boolean }) =>
  bad ? (
    <>
      <Table />
      <g transform="translate(70 40) rotate(-12)">
        <CardFace />
      </g>
      <Glare x={110} y={62} rx={22} ry={12} />
      <rect fill={SHADOW} x="0" y="0" width="200" height="140" rx="10" opacity=".28" />
      <Finger x={156} y={102} angle={30} />
    </>
  ) : (
    <>
      <Table />
      <g transform="translate(44 35)">
        <CardFace />
      </g>
    </>
  );

const Photo = ({ bad }: { bad: boolean }) =>
  bad ? (
    <>
      <rect className="f-sage" x="0" y="0" width="200" height="140" rx="10" />
      {Array.from({ length: 9 }, (_, i) => (
        <path key={i} className="s-amber" d={`M${i * 26 - 30} 0 l60 140`} strokeWidth="7" opacity=".45" />
      ))}
      <g transform="rotate(-10 100 78)">
        <Face cx={112} cy={62} r={24} />
        <g className="s-ink" strokeWidth="2.4">
          <circle cx={102} cy={60} r={8} />
          <circle cx={124} cy={60} r={8} />
          <path d="M110 60h6" />
        </g>
        <ellipse fill={GLARE} cx={101} cy={58} rx={5} ry={4} opacity=".95" />
        <ellipse fill={GLARE} cx={123} cy={58} rx={5} ry={4} opacity=".95" />
      </g>
      <path fill={SHADOW} d="M128 30 q30 40 6 108 h60 V30 z" opacity=".3" />
    </>
  ) : (
    <>
      <rect className="f-sand" x="0" y="0" width="200" height="140" rx="10" />
      <rect className="f-paper" x="70" y="10" width="60" height="120" rx="3" />
      <rect className="f-sky" x="73" y="13" width="54" height="114" rx="2" opacity=".35" />
      <Face cx={100} cy={62} r={19} />
      <path className="s-line" d="M64 10v120M136 10v120" strokeWidth="1" strokeDasharray="3 3" />
    </>
  );

const Diploma = ({ bad }: { bad: boolean }) =>
  bad ? (
    <>
      <Table />
      <g transform="translate(40 30) skewX(-16) rotate(6)">
        <DiplomaSheet />
      </g>
      <rect fill={SHADOW} x="0" y="0" width="200" height="140" rx="10" opacity=".38" />
      <g opacity=".5" transform="translate(3 2)">
        <g transform="translate(40 30) skewX(-16) rotate(6)">
          <Lines x={24} y={32} w={88} n={4} />
        </g>
      </g>
      <path className="f-sand" d="M150 92 L200 70 V140 H140 z" />
    </>
  ) : (
    <>
      <Table />
      <g transform="translate(32 22)">
        <DiplomaSheet />
      </g>
    </>
  );

const Certificate = ({ bad }: { bad: boolean }) =>
  bad ? (
    <>
      <Table />
      <g transform="translate(70 40) rotate(-9)">
        <CertSheet />
      </g>
      <path fill={SHADOW} d="M0 0 H120 L60 140 H0 z" opacity=".35" />
      <Glare x={120} y={70} rx={14} ry={9} />
    </>
  ) : (
    <>
      <Table />
      <g transform="translate(58 14)">
        <CertSheet />
      </g>
    </>
  );

const PdfBadge = ({ x, y }: { x: number; y: number }) => (
  <g transform={`translate(${x} ${y})`}>
    <rect className="f-amber" x="0" y="0" width="34" height="16" rx="4" />
    <text x="17" y="11.5" textAnchor="middle" fontSize="10" fontWeight="700" fontFamily="system-ui, sans-serif" className="f-ink">
      PDF
    </text>
  </g>
);

const Cv = ({ bad }: { bad: boolean }) =>
  bad ? (
    <>
      <rect className="f-hair" x="0" y="0" width="200" height="140" rx="10" opacity=".85" />
      <g transform="translate(34 18) skewY(6)">
        <rect className="f-ink" x="0" y="0" width="132" height="92" rx="5" />
        <rect className="f-paper" x="5" y="5" width="122" height="78" rx="2" />
        <rect className="f-sky" x="12" y="12" width="20" height="24" rx="2" />
        <Lines x={40} y={14} w={76} n={8} />
        {Array.from({ length: 12 }, (_, i) => (
          <path key={i} className="s-ink" d={`M5 ${10 + i * 6.5} h122`} strokeWidth=".8" opacity=".25" />
        ))}
      </g>
      <Glare x={130} y={44} rx={20} ry={9} />
    </>
  ) : (
    <>
      <Table />
      <g transform="translate(58 10)">
        <rect className="f-paper" x="0" y="0" width="84" height="118" rx="4" />
        <rect className="f-sky" x="8" y="8" width="20" height="24" rx="2" />
        <rect className="f-ink" x="34" y="10" width="40" height="5" rx="2.5" opacity=".8" />
        <Lines x={34} y={20} w={40} n={2} />
        <Lines x={8} y={40} w={68} n={10} />
      </g>
      <PdfBadge x={124} y={98} />
    </>
  );

const Translation = ({ bad }: { bad: boolean }) =>
  bad ? (
    <>
      <Table />
      <g transform="translate(66 22) rotate(-6)">
        <CertSheet withStamp={false} />
      </g>
      <path className="f-sand" d="M118 110 L160 96 V140 H110 z" />
      <circle cx="152" cy="34" r="14" fill="none" stroke="#dc2626" strokeWidth="2.5" strokeDasharray="4 3" />
    </>
  ) : (
    <>
      <Table />
      <g transform="translate(14 14)">
        <CertSheet />
      </g>
      <path className="s-ink" d="M104 70h12m-4 -4 4 4 -4 4" strokeWidth="2" strokeLinecap="round" />
      <g transform="translate(102 14)">
        <CertSheet />
        <Seal x={62} y={20} r={10} />
      </g>
    </>
  );

const Form = ({ bad }: { bad: boolean }) =>
  bad ? (
    <>
      <Table />
      <g transform="translate(60 22) rotate(10)">
        <rect className="f-paper" x="0" y="0" width="84" height="112" rx="4" />
        <Lines x={10} y={12} w={64} n={10} />
        <path className="s-line" d="M44 100h30" strokeWidth="1.4" />
      </g>
      <rect fill={SHADOW} x="0" y="0" width="200" height="140" rx="10" opacity=".3" />
      <Finger x={142} y={34} angle={150} />
    </>
  ) : (
    <>
      <Table />
      {[12, 6, 0].map((d) => (
        <g key={d} transform={`translate(${58 + d} ${12 + d})`}>
          <rect className="f-paper" x="0" y="0" width="84" height="112" rx="4" />
          <rect className="s-line" x="0" y="0" width="84" height="112" rx="4" strokeWidth=".8" />
        </g>
      ))}
      <g transform="translate(58 12)">
        <Lines x={10} y={12} w={64} n={10} />
        <path className="s-line" d="M44 100h30" strokeWidth="1.4" />
        <Signature x={46} y={98} />
      </g>
      <PdfBadge x={130} y={108} />
    </>
  );

const DRAW: Record<ExampleKind, (p: { bad: boolean }) => ReactNode> = {
  passport: Passport,
  card: Card,
  photo: Photo,
  diploma: Diploma,
  certificate: Certificate,
  cv: Cv,
  translation: Translation,
  form: Form,
};

/** The built-in GOOD or BAD example picture of a document kind. */
export const DocExample = ({ kind, bad, title, className }: { kind: ExampleKind; bad: boolean; title?: string; className?: string }) => {
  const Draw = DRAW[kind];
  return (
    <Example title={title} className={className}>
      <Draw bad={bad} />
    </Example>
  );
};
