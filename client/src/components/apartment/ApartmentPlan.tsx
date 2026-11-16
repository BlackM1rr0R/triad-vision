import type { Room } from '@/lib/apartment/hotspots';
import { APARTMENT_H, APARTMENT_W } from '@/lib/apartment/hotspots';

/**
 * Self-drawn floor plan of a typical German rental flat (top view) with the house entrance, cellar and yard
 * underneath. Decorative only (aria-hidden): the hotspots on top are real buttons (pages/tools/GermanApartment).
 * Fixed illustration colours, readable in light and dark mode (the plan sits on its own light "paper").
 */

const WALL = '#334155';
const INK = '#1e293b';

const RoomLabel = ({ x, y, text }: { x: number; y: number; text: string }) => (
  <text x={x} y={y} fontSize="17" fontWeight="700" fill={INK} opacity="0.75" fontFamily="system-ui, sans-serif">
    {text}
  </text>
);

export function ApartmentPlan({ rooms, highlight }: { rooms: Record<Room, string>; highlight: Room | null }) {
  const dim = (r: Room) => (highlight && highlight !== r ? 0.35 : 1);
  return (
    <svg viewBox={`0 0 ${APARTMENT_W} ${APARTMENT_H}`} className="block h-auto w-full select-none" aria-hidden>
      <defs>
        <pattern id="apt-wood" width="24" height="24" patternUnits="userSpaceOnUse">
          <rect width="24" height="24" fill="#fde7c8" />
          <path d="M0 12h24M12 0v12M0 24v-12" stroke="#f3cf9f" strokeWidth="1.5" />
        </pattern>
        <pattern id="apt-tiles" width="20" height="20" patternUnits="userSpaceOnUse">
          <rect width="20" height="20" fill="#d6f0fb" />
          <path d="M20 0H0V20" fill="none" stroke="#b5e0f2" strokeWidth="1.5" />
        </pattern>
        <pattern id="apt-deck" width="16" height="16" patternUnits="userSpaceOnUse">
          <rect width="16" height="16" fill="#e7f5c8" />
          <path d="M0 8h16" stroke="#c9e69a" strokeWidth="3" />
        </pattern>
        <pattern id="apt-concrete" width="18" height="18" patternUnits="userSpaceOnUse">
          <rect width="18" height="18" fill="#e5e7eb" />
          <circle cx="4" cy="5" r="1" fill="#cbd5e1" />
          <circle cx="13" cy="12" r="1.2" fill="#cbd5e1" />
        </pattern>
      </defs>
      <rect width={APARTMENT_W} height={APARTMENT_H} rx="18" fill="#f8fafc" />

      {/* Kitchen */}
      <g opacity={dim('kitchen')}>
        <rect x="20" y="20" width="240" height="280" fill="url(#apt-tiles)" />
        <rect x="30" y="30" width="62" height="66" rx="6" fill="#ffffff" stroke={WALL} strokeWidth="2" />
        <path d="M35 62h52" stroke={WALL} strokeWidth="1.5" />
        <rect x="104" y="30" width="96" height="56" rx="4" fill="#475569" />
        {[124, 172].map((cx) => [46, 70].map((cy) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="9" fill="none" stroke="#fca5a5" strokeWidth="3" />))}
        <rect x="206" y="104" width="46" height="74" rx="6" fill="#e2e8f0" stroke={WALL} strokeWidth="2" />
        <rect x="214" y="114" width="30" height="54" rx="10" fill="#bae6fd" />
        <rect x="70" y="170" width="100" height="70" rx="8" fill="#fcd34d" stroke="#b45309" strokeWidth="2" />
        {[60, 180].map((x) => <circle key={x} cx={x} cy="205" r="11" fill="#fef3c7" stroke="#b45309" strokeWidth="2" />)}
        {['#facc15', '#60a5fa', '#a16207', '#64748b'].map((c, i) => <rect key={c} x={176 + i * 18} y="262" width="14" height="22" rx="3" fill={c} />)}
        <RoomLabel x={34} y={292} text={rooms.kitchen} />
      </g>

      {/* Hallway */}
      <g opacity={dim('hallway')}>
        <rect x="20" y="300" width="240" height="220" fill="url(#apt-wood)" />
        <rect x="30" y="356" width="28" height="44" rx="3" fill="#ffffff" stroke={WALL} strokeWidth="2" />
        <path d="M37 368h14M37 378h14M37 388h14" stroke={WALL} strokeWidth="2" />
        <rect x="196" y="430" width="52" height="30" rx="5" fill="#1e293b" />
        <circle cx="210" cy="445" r="3" fill="#4ade80" />
        <circle cx="222" cy="445" r="3" fill="#4ade80" />
        <path d="M206 430l-6-14M238 430l6-14" stroke="#1e293b" strokeWidth="3" strokeLinecap="round" />
        <rect x="150" y="320" width="90" height="16" rx="4" fill="#a16207" />
        {[162, 186, 210].map((x) => <circle key={x} cx={x} cy="344" r="6" fill="#7c3aed" />)}
        {/* front door with swing */}
        <path d="M70 520 A 70 70 0 0 1 140 450" fill="none" stroke={WALL} strokeWidth="1.5" strokeDasharray="5 5" />
        <path d="M70 520 L140 450" stroke="#b45309" strokeWidth="6" strokeLinecap="round" />
        <RoomLabel x={34} y={440} text={rooms.hallway} />
      </g>

      {/* Bathroom */}
      <g opacity={dim('bathroom')}>
        <rect x="260" y="300" width="180" height="220" fill="url(#apt-tiles)" />
        <rect x="272" y="312" width="78" height="78" rx="6" fill="#ffffff" stroke={WALL} strokeWidth="2" />
        <circle cx="311" cy="351" r="6" fill="#94a3b8" />
        <path d="M290 330 q 10 -8 20 0 t 20 0" stroke="#7dd3fc" strokeWidth="3" fill="none" />
        <rect x="396" y="310" width="38" height="50" rx="6" fill="#f1f5f9" stroke={WALL} strokeWidth="2" />
        <circle cx="415" cy="345" r="5" fill="#f97316" />
        <ellipse cx="300" cy="470" rx="22" ry="30" fill="#ffffff" stroke={WALL} strokeWidth="2" />
        <rect x="360" y="420" width="60" height="34" rx="12" fill="#ffffff" stroke={WALL} strokeWidth="2" />
        {[404, 428].map((cx) => <circle key={cx} cx={cx} cy="496" r="10" fill="#ffffff" stroke={cx === 404 ? '#3b82f6' : '#ef4444'} strokeWidth="3" />)}
        <RoomLabel x={272} y={410} text={rooms.bathroom} />
      </g>

      {/* Living room */}
      <g opacity={dim('living')}>
        <rect x="260" y="20" width="500" height="280" fill="url(#apt-wood)" />
        <rect x="360" y="24" width="64" height="16" rx="3" fill="#e2e8f0" stroke={WALL} strokeWidth="2" />
        {[368, 380, 392, 404, 416].map((x) => <path key={x} d={`M${x} 26v12`} stroke={WALL} strokeWidth="1.5" />)}
        <rect x="282" y="186" width="140" height="62" rx="16" fill="#f472b6" />
        <rect x="290" y="194" width="124" height="20" rx="8" fill="#f9a8d4" />
        <rect x="314" y="110" width="88" height="54" rx="10" fill="#fbbf24" opacity="0.8" />
        <rect x="470" y="258" width="104" height="14" rx="3" fill="#0f172a" />
        <rect x="486" y="240" width="72" height="20" rx="2" fill="#1e293b" />
        <rect x="660" y="36" width="88" height="30" rx="3" fill="#a16207" />
        {['#ef4444', '#3b82f6', '#22c55e', '#eab308'].map((c, i) => <rect key={c} x={668 + i * 18} y="70" width="14" height="70" rx="2" fill={c} />)}
        <circle cx="290" cy="56" r="22" fill="#4ade80" />
        <circle cx="290" cy="56" r="10" fill="#16a34a" />
        <RoomLabel x={540} y={170} text={rooms.living} />
      </g>

      {/* Bedroom */}
      <g opacity={dim('bedroom')}>
        <rect x="440" y="300" width="320" height="220" fill="#fef9c3" />
        <rect x="560" y="400" width="140" height="104" rx="10" fill="#93c5fd" />
        <rect x="570" y="408" width="54" height="26" rx="8" fill="#ffffff" />
        <rect x="636" y="408" width="54" height="26" rx="8" fill="#ffffff" />
        <rect x="452" y="312" width="96" height="40" rx="4" fill="#d6d3d1" stroke={WALL} strokeWidth="2" />
        <circle cx="600" cy="330" r="13" fill="#ffffff" stroke="#ef4444" strokeWidth="3" />
        <circle cx="600" cy="330" r="3" fill="#ef4444" />
        <path d="M728 470 q 12 10 6 26 q -14 -4 -16 -16 z" fill="#1e293b" opacity="0.55" />
        <circle cx="744" cy="500" r="5" fill="#1e293b" opacity="0.45" />
        <RoomLabel x={452} y={500} text={rooms.bedroom} />
      </g>

      {/* Balcony */}
      <g opacity={dim('balcony')}>
        <rect x="770" y="30" width="200" height="270" rx="6" fill="url(#apt-deck)" />
        <rect x="770" y="30" width="200" height="270" rx="6" fill="none" stroke="#65a30d" strokeWidth="4" strokeDasharray="2 8" />
        <circle cx="860" cy="96" r="24" fill="#334155" />
        <path d="M842 96h36M848 86h24M848 106h24" stroke="#f97316" strokeWidth="3" />
        <rect x="900" y="200" width="56" height="84" rx="6" fill="#a16207" />
        {[214, 236, 258].map((y) => <circle key={y} cx="928" cy={y} r="8" fill={y === 236 ? '#f472b6' : '#facc15'} />)}
        <circle cx="810" cy="200" r="16" fill="#fde68a" stroke="#b45309" strokeWidth="2" />
        <RoomLabel x={784} y={160} text={rooms.balcony} />
      </g>

      {/* Walls of the flat */}
      <path d="M20 20H760V520H20Z M260 20V300 M20 300H175 M215 300H440 M440 300V520 M260 300V520 M440 300H760" fill="none" stroke={WALL} strokeWidth="6" strokeLinejoin="round" />
      <path d="M760 60V260" stroke="#7dd3fc" strokeWidth="6" />
      <path d="M440 20H700" stroke="#7dd3fc" strokeWidth="4" opacity="0.7" />

      {/* Ground floor strip: entrance, cellar, yard */}
      <text x="24" y="550" fontSize="13" fill={INK} opacity="0.55" fontFamily="system-ui, sans-serif">
        ▼ EG / Keller / Hof
      </text>
      <g opacity={dim('entrance')}>
        <rect x="20" y="560" width="240" height="140" rx="8" fill="#ede9fe" />
        <rect x="40" y="580" width="40" height="40" rx="4" fill="#ffffff" stroke={WALL} strokeWidth="2" />
        {[590, 600, 610].map((y) => <circle key={y} cx="52" cy={y} r="3" fill={WALL} />)}
        {[590, 600, 610].map((y) => <rect key={y} x="58" y={y - 3} width="16" height="6" rx="1" fill="#cbd5e1" />)}
        {[0, 1, 2].map((c) => [0, 1].map((r) => <rect key={`${c}${r}`} x={110 + c * 28} y={630 + r * 26} width="24" height="22" rx="3" fill="#fbbf24" stroke="#b45309" strokeWidth="1.5" />))}
        <rect x="196" y="578" width="52" height="46" rx="3" fill="#fef3c7" stroke="#b45309" strokeWidth="2" />
        <path d="M204 590h36M204 600h28M204 610h32" stroke="#b45309" strokeWidth="2" />
        <RoomLabel x={34} y={690} text={rooms.entrance} />
      </g>
      <g opacity={dim('cellar')}>
        <rect x="270" y="560" width="440" height="140" rx="8" fill="url(#apt-concrete)" />
        {[300, 350].map((x) => (
          <g key={x}>
            <rect x={x} y="616" width="42" height="48" rx="5" fill="#ffffff" stroke={WALL} strokeWidth="2" />
            <circle cx={x + 21} cy="642" r="13" fill="#bfdbfe" stroke={WALL} strokeWidth="2" />
          </g>
        ))}
        <rect x="436" y="580" width="54" height="56" rx="4" fill="#ffffff" stroke={WALL} strokeWidth="2" />
        <rect x="444" y="590" width="38" height="14" rx="2" fill="#0f172a" />
        <text x="463" y="601" fontSize="10" fill="#4ade80" textAnchor="middle" fontFamily="monospace">
          04217
        </text>
        {[540, 600, 660].map((x) => (
          <g key={x}>
            <rect x={x} y="612" width="50" height="76" fill="none" stroke="#a16207" strokeWidth="2" />
            {[0, 1, 2, 3, 4].map((i) => <path key={i} d={`M${x + 5 + i * 10} 612v76`} stroke="#a16207" strokeWidth="1.5" />)}
          </g>
        ))}
        <RoomLabel x={284} y={590} text={rooms.cellar} />
      </g>
      <g opacity={dim('yard')}>
        <rect x="720" y="560" width="250" height="140" rx="8" fill="#dcfce7" />
        {[
          ['#475569', 'R'],
          ['#92400e', 'B'],
          ['#2563eb', 'P'],
          ['#eab308', 'G'],
        ].map(([c, l], i) => (
          <g key={l}>
            <rect x={742 + i * 54} y="606" width="44" height="62" rx="6" fill={c} />
            <rect x={738 + i * 54} y="598" width="52" height="12" rx="4" fill={c} opacity="0.8" />
            <text x={764 + i * 54} y="646" fontSize="16" fontWeight="700" fill="#ffffff" textAnchor="middle" fontFamily="system-ui, sans-serif">
              {l}
            </text>
          </g>
        ))}
        <RoomLabel x={734} y={590} text={rooms.yard} />
      </g>
    </svg>
  );
}
