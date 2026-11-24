import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, MapPin, MousePointerClick } from 'lucide-react';

/**
 * Office map on /contact. The OpenStreetMap embed (a cross-origin iframe with its own map engine, scripts and
 * dozens of tile requests per office) made the contact page slow — up to ~8 s on desktop, with "GPU stall due to
 * ReadPixels" warnings — so the page now shows a static poster: the few raster tiles around the office (plain
 * lazy <img>, no JS, no WebGL) with a pin. The interactive embed loads only when the visitor asks for it.
 */
const Z = 16;
const TILE = 256;
const HALF_W = 360; // covers panels up to 720 px wide
const HALF_H = 112; // h-56

const worldPx = (lat: number, lng: number) => {
  const n = 2 ** Z * TILE;
  const rad = (lat * Math.PI) / 180;
  return { x: ((lng + 180) / 360) * n, y: ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n };
};

export const OfficeMap = ({ lat, lng, title }: { lat: number; lng: number; title: string }) => {
  const { t } = useTranslation();
  const [live, setLive] = useState(false);
  const osmLink = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=${Z}/${lat}/${lng}`;

  if (live) {
    return (
      <iframe
        title={title}
        className="h-56 w-full border-0 grayscale-[40%]"
        src={`https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.012}%2C${lat - 0.006}%2C${lng + 0.012}%2C${lat + 0.006}&layer=mapnik&marker=${lat}%2C${lng}`}
      />
    );
  }

  const p = worldPx(lat, lng);
  const max = 2 ** Z;
  const tiles: { x: number; y: number; left: number; top: number }[] = [];
  for (let ty = Math.floor((p.y - HALF_H) / TILE); ty <= Math.floor((p.y + HALF_H) / TILE); ty++) {
    for (let tx = Math.floor((p.x - HALF_W) / TILE); tx <= Math.floor((p.x + HALF_W) / TILE); tx++) {
      if (ty < 0 || ty >= max) continue;
      tiles.push({ x: ((tx % max) + max) % max, y: ty, left: tx * TILE - p.x, top: ty * TILE - p.y });
    }
  }

  return (
    <div className="relative h-56 w-full overflow-hidden bg-sunken" data-testid="office-map">
      <div className="absolute top-1/2 left-1/2 grayscale-[40%]" aria-hidden>
        {tiles.map((tl) => (
          <img
            key={`${tl.x}-${tl.y}`}
            src={`https://tile.openstreetmap.org/${Z}/${tl.x}/${tl.y}.png`}
            alt=""
            width={TILE}
            height={TILE}
            loading="lazy"
            decoding="async"
            draggable={false}
            className="absolute max-w-none select-none"
            style={{ left: tl.left, top: tl.top }}
          />
        ))}
      </div>
      <MapPin className="absolute top-1/2 left-1/2 size-8 -translate-x-1/2 -translate-y-full fill-primary text-white drop-shadow" aria-hidden />
      <div className="absolute inset-x-2 bottom-2 flex flex-wrap items-end justify-between gap-2">
        <button
          type="button"
          onClick={() => setLive(true)}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-card/95 px-3 text-xs font-semibold text-ink shadow-[var(--tv-shadow-card)] hover:bg-card focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
        >
          <MousePointerClick className="size-4" aria-hidden />
          {t('contact.mapLoad')}
        </button>
        <a
          href={osmLink}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-9 items-center gap-1 rounded-full bg-card/95 px-3 text-xs font-semibold text-link shadow-[var(--tv-shadow-card)] hover:underline"
        >
          {t('contact.mapOpen')} <ExternalLink className="size-3.5" aria-hidden />
        </a>
      </div>
      <span className="absolute top-1 right-2 rounded bg-card/80 px-1 text-[10px] text-muted">© OpenStreetMap</span>
    </div>
  );
};
