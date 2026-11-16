/**
 * Result card of the learning games as a 1080×1350 PNG (Instagram portrait), drawn on a canvas in the browser
 * (nothing is uploaded). Same look as the /which-city card: navy gradient, German flag stripe, brand footer.
 */
export interface ResultCard {
  /** Small line on top, e.g. the game name. */
  lead: string;
  /** The big result, e.g. "87 %" or "1 240 points". */
  big: string;
  /** Line under the big result, e.g. "9 of 10 correct". */
  sub?: string;
  /** Up to 5 bullet lines. */
  lines?: string[];
  /** Footer, e.g. "Play at triad-vision.de/price-game". */
  footer: string;
  /** File name without extension. */
  filename: string;
}

const wrap = (ctx: CanvasRenderingContext2D, text: string, max: number) => {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > max && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
};

/** Draws the card and downloads it; throws when canvas is unavailable (callers show a toast). */
export const downloadResultCard = async (card: ResultCard) => {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('NO_CANVAS');
  if (document.fonts?.ready) await document.fonts.ready;
  const font = (weight: number, size: number) => `${weight} ${size}px Onest, system-ui, -apple-system, "Segoe UI", sans-serif`;
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#0f2742');
  g.addColorStop(1, '#1f4f7d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ['#111111', '#dd0000', '#ffce00'].forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(0, i * 18, W, 18);
  });
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.beginPath();
  ctx.arc(W - 120, 320, 320, 0, Math.PI * 2);
  ctx.fill();
  const x = 96;
  ctx.fillStyle = '#f5b544';
  ctx.font = font(600, 48);
  let y = 210;
  for (const l of wrap(ctx, card.lead, W - 2 * x)) {
    ctx.fillText(l, x, y);
    y += 60;
  }
  ctx.fillStyle = '#ffffff';
  let size = 190;
  ctx.font = font(700, size);
  while (ctx.measureText(card.big).width > W - 2 * x && size > 70) {
    size -= 6;
    ctx.font = font(700, size);
  }
  y += size;
  ctx.fillText(card.big, x, y);
  y += 90;
  if (card.sub) {
    ctx.font = font(600, 44);
    ctx.fillStyle = '#9fd3a8';
    for (const l of wrap(ctx, card.sub, W - 2 * x)) {
      ctx.fillText(l, x, y);
      y += 56;
    }
    y += 40;
  }
  ctx.font = font(400, 38);
  for (const r of (card.lines ?? []).slice(0, 5)) {
    const lines = wrap(ctx, r, W - 2 * x - 60);
    ctx.fillStyle = '#f5b544';
    ctx.beginPath();
    ctx.arc(x + 12, y - 12, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    for (const l of lines) {
      ctx.fillText(l, x + 50, y);
      y += 50;
    }
    y += 22;
    if (y > H - 220) break;
  }
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = font(500, 32);
  for (const [i, l] of wrap(ctx, card.footer, W - 2 * x).entries()) ctx.fillText(l, x, H - 110 + i * 44);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('NO_BLOB');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${card.filename}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

/** Copies `url` to the clipboard; true on success. */
export const copyLink = async (url: string) => {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
};
