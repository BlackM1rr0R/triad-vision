import type { Shape } from '@/lib/games/supermarket/items';

/** Self-drawn product package by shape and colour (decorative; the button around it carries the name). */
export function ProductIcon({ shape, colour, className }: { shape: Shape; colour: string; className?: string }) {
  const stroke = '#334155';
  let body;
  switch (shape) {
    case 'fruit':
      body = (
        <g>
          <circle cx="24" cy="38" r="13" fill={colour} stroke={stroke} strokeWidth="1.5" />
          <circle cx="40" cy="36" r="13" fill={colour} stroke={stroke} strokeWidth="1.5" />
          <circle cx="32" cy="24" r="12" fill={colour} stroke={stroke} strokeWidth="1.5" />
          <path d="M32 12q4 -6 9 -5" stroke="#15803d" strokeWidth="3" fill="none" />
        </g>
      );
      break;
    case 'bag':
      body = (
        <g>
          <path d="M14 18h36l4 38H10Z" fill={colour} stroke={stroke} strokeWidth="1.5" />
          <path d="M14 18l4 -8h28l4 8" fill="#e2e8f0" stroke={stroke} strokeWidth="1.5" />
          <rect x="20" y="30" width="24" height="14" rx="2" fill="#fff" opacity="0.85" />
        </g>
      );
      break;
    case 'loaf':
      body = (
        <g>
          <ellipse cx="32" cy="38" rx="24" ry="14" fill={colour} stroke={stroke} strokeWidth="1.5" />
          {[22, 32, 42].map((x) => (
            <path key={x} d={`M${x - 4} 30l8 8`} stroke="#fef3c7" strokeWidth="2.5" />
          ))}
        </g>
      );
      break;
    case 'carton':
      body = (
        <g>
          <path d="M18 18l6 -10h16l6 10v38H18Z" fill={colour} stroke={stroke} strokeWidth="1.5" />
          <rect x="22" y="28" width="20" height="16" rx="2" fill="#fff" opacity="0.85" />
        </g>
      );
      break;
    case 'tub':
      body = (
        <g>
          <path d="M12 26h40l-4 28H16Z" fill={colour} stroke={stroke} strokeWidth="1.5" />
          <rect x="10" y="20" width="44" height="7" rx="2" fill="#f8fafc" stroke={stroke} strokeWidth="1.5" />
          <rect x="20" y="34" width="24" height="10" rx="2" fill="#fff" opacity="0.85" />
        </g>
      );
      break;
    case 'pack':
      body = (
        <g>
          <rect x="10" y="20" width="44" height="32" rx="4" fill={colour} stroke={stroke} strokeWidth="1.5" />
          <rect x="16" y="26" width="32" height="12" rx="2" fill="#fff" opacity="0.8" />
        </g>
      );
      break;
    case 'bottle':
      body = (
        <g>
          <rect x="27" y="6" width="10" height="8" rx="2" fill="#475569" />
          <path d="M26 14h12l4 10v32a3 3 0 0 1 -3 3H25a3 3 0 0 1 -3 -3V24Z" fill={colour} stroke={stroke} strokeWidth="1.5" opacity="0.9" />
          <rect x="22" y="32" width="20" height="12" fill="#fff" opacity="0.85" />
        </g>
      );
      break;
    case 'glass':
      body = (
        <g>
          <rect x="28" y="6" width="8" height="6" rx="1" fill="#facc15" />
          <path d="M28 12h8v10l5 8v26a3 3 0 0 1 -3 3H26a3 3 0 0 1 -3 -3V30l5 -8Z" fill={colour} stroke={stroke} strokeWidth="1.5" />
          <rect x="24" y="36" width="16" height="10" fill="#fef3c7" />
        </g>
      );
      break;
    case 'can':
      body = (
        <g>
          <rect x="20" y="14" width="24" height="42" rx="4" fill={colour} stroke={stroke} strokeWidth="1.5" />
          <ellipse cx="32" cy="14" rx="12" ry="3" fill="#cbd5e1" stroke={stroke} />
          <rect x="20" y="30" width="24" height="8" fill="#fff" opacity="0.8" />
        </g>
      );
      break;
    case 'box':
      body = (
        <g>
          <rect x="14" y="12" width="36" height="44" rx="2" fill={colour} stroke={stroke} strokeWidth="1.5" />
          <rect x="19" y="22" width="26" height="16" rx="2" fill="#fff" opacity="0.85" />
        </g>
      );
      break;
    case 'roll':
      body = (
        <g>
          {[18, 32, 46].map((x) => (
            <g key={x}>
              <rect x={x - 7} y="20" width="14" height="34" rx="3" fill={colour} stroke={stroke} strokeWidth="1.5" />
              <ellipse cx={x} cy="20" rx="7" ry="3" fill="#fff" stroke={stroke} />
            </g>
          ))}
        </g>
      );
      break;
    case 'jar':
      body = (
        <g>
          <rect x="18" y="12" width="28" height="8" rx="2" fill="#94a3b8" stroke={stroke} />
          <rect x="16" y="20" width="32" height="36" rx="6" fill={colour} stroke={stroke} strokeWidth="1.5" opacity="0.85" />
        </g>
      );
      break;
    case 'tube':
    default:
      body = (
        <g>
          <path d="M14 22h30l8 10l-8 10H14Z" fill={colour} stroke={stroke} strokeWidth="1.5" />
          <rect x="52" y="28" width="6" height="8" fill="#f8fafc" stroke={stroke} />
        </g>
      );
  }
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      {body}
    </svg>
  );
}
