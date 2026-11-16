import { buildBlocks, layoutWallpaper, THEMES, type Layout, type ThemeId, type WallpaperFields } from './layout';

/** Canvas drawing of the emergency wallpaper (browser only). */

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const font = (size: number, bold: boolean) => `${bold ? '700' : '400'} ${size}px ${FONT}`;

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

/** Draws the wallpaper at the canvas' own size (canvas.width × canvas.height) and returns the layout. */
export const drawWallpaper = (canvas: HTMLCanvasElement, fields: WallpaperFields, themeId: ThemeId): Layout | null => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const { width, height } = canvas;
  const theme = THEMES[themeId];
  const measure = (text: string, size: number, bold: boolean) => {
    ctx.font = font(size, bold);
    return ctx.measureText(text).width;
  };
  const layout = layoutWallpaper(buildBlocks(fields), width, height, measure);

  const g = ctx.createLinearGradient(0, 0, 0, height);
  g.addColorStop(0, theme.bg[0]);
  g.addColorStop(1, theme.bg[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);

  // A faint cross in the (free) clock area keeps the picture recognisable without competing with the clock.
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = theme.text;
  const c = Math.round(width * 0.16);
  const cx = width / 2;
  const cy = layout.clockArea * 0.62;
  ctx.fillRect(cx - c / 6, cy - c / 2, c / 3, c);
  ctx.fillRect(cx - c / 2, cy - c / 6, c, c / 3);
  ctx.restore();

  const p = layout.panel;
  ctx.fillStyle = theme.panel;
  roundRect(ctx, p.x, p.y, p.w, p.h, p.r);
  ctx.fill();

  ctx.textBaseline = 'alphabetic';
  const left = p.x + layout.padding;
  const right = p.x + p.w - layout.padding;
  for (const l of layout.lines) {
    ctx.font = font(l.size, l.bold);
    ctx.textAlign = 'left';
    ctx.fillStyle = l.kind === 'title' ? theme.accent : l.kind === 'label' ? theme.muted : theme.text;
    ctx.fillText(l.text, left, l.y);
    if (l.number) {
      ctx.textAlign = 'right';
      ctx.fillStyle = theme.accent;
      ctx.fillText(l.number, right, l.y);
    }
  }
  return layout;
};

/** PNG blob of the canvas. */
export const canvasPng = (canvas: HTMLCanvasElement) =>
  new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/png');
  });
