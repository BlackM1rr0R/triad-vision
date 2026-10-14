#!/usr/bin/env node
/**
 * Renders the Triad Vision triangle mark (same geometry as client/src/components/ui/Logo.tsx)
 * into the PNGs Expo needs: app icon, Android adaptive icon (+ monochrome), splash, notification icon, favicon.
 *
 * Run: npm run generate-assets   (uses sharp, a devDependency)
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets/images');
await mkdir(out, { recursive: true });

const NAVY = '#0b1f44';
const NAVY_DEEP = '#050f24';

/** The 64×56 mark, placed so that it is `scale` × canvas wide and centred. */
const mark = ({ size, scale, inner = '#ffffff', mono = false, dy = 0 }) => {
  const w = size * scale;
  const k = w / 64;
  const x = (size - w) / 2;
  const y = (size - 56 * k) / 2 + dy * size;
  const outerFill = mono ? '#ffffff' : 'url(#g)';
  const innerFill = mono ? 'none' : inner;
  return `
  <g transform="translate(${x} ${y}) scale(${k})">
    <path d="M32 2 62 54H44L32 32 20 54H2Z" fill="${outerFill}"/>
    ${mono ? '' : `<path d="M32 32 44 54H20Z" fill="${innerFill}"/>`}
    ${mono ? '' : '<path d="M14 46h36" stroke="#fff" stroke-width="3" opacity=".55"/>'}
  </g>`;
};

const defs = `<defs>
  <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5c9bff"/><stop offset="1" stop-color="#1565e8"/></linearGradient>
  <radialGradient id="bg" cx="0.3" cy="0.2" r="1"><stop offset="0" stop-color="#16326b"/><stop offset="0.55" stop-color="${NAVY}"/><stop offset="1" stop-color="${NAVY_DEEP}"/></radialGradient>
</defs>`;

const svg = (size, body, background = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${defs}${background}${body}</svg>`;

const render = async (name, svgText) => {
  await sharp(Buffer.from(svgText)).png().toFile(path.join(out, name));
  console.log('wrote', name);
};

// iOS / generic icon: full-bleed navy square (iOS rounds the corners itself).
await render('icon.png', svg(1024, mark({ size: 1024, scale: 0.58, inner: '#ffffff', dy: -0.01 }), `<rect width="1024" height="1024" fill="url(#bg)"/>`));
// Android adaptive foreground: transparent, mark inside the 66% safe zone. Background colour comes from app config.
await render('adaptive-icon.png', svg(1024, mark({ size: 1024, scale: 0.42, inner: '#ffffff' })));
await render('adaptive-icon-monochrome.png', svg(1024, mark({ size: 1024, scale: 0.42, mono: true })));
// Splash image (shown centred on the navy splash background).
await render('splash-icon.png', svg(512, mark({ size: 512, scale: 0.9, inner: '#ffffff' })));
// Android notification icon: white silhouette on transparent, 96×96.
await render('notification-icon.png', svg(96, mark({ size: 96, scale: 0.8, mono: true })));
await render('favicon.png', svg(48, mark({ size: 48, scale: 0.8, inner: '#ffffff' }), `<rect width="48" height="48" rx="10" fill="${NAVY}"/>`));
