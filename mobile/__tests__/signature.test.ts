import { appendPoint, isSignatureEmpty, strokeLength, strokesToSvg, strokeToPath } from '@/lib/signature';

describe('signature path → SVG', () => {
  it('returns an empty path for no points', () => {
    expect(strokeToPath([])).toBe('');
  });

  it('turns a tap into a tiny visible dot', () => {
    expect(strokeToPath([{ x: 10, y: 20 }])).toBe('M10 20L10.1 20.1');
  });

  it('draws a straight line for two points', () => {
    expect(strokeToPath([{ x: 0, y: 0 }, { x: 5, y: 5 }])).toBe('M0 0L5 5');
  });

  it('smooths longer strokes with quadratic curves through midpoints', () => {
    const d = strokeToPath([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 10 },
    ]);
    expect(d).toBe('M0 0Q10 0 10 5Q10 10 15 10L20 10');
  });

  it('rounds coordinates to one decimal', () => {
    expect(strokeToPath([{ x: 1.234, y: 5.678 }, { x: 2.25, y: 3.33 }])).toBe('M1.2 5.7L2.3 3.3');
  });

  it('builds a standalone SVG document with one path per stroke', () => {
    const svg = strokesToSvg(
      [
        [{ x: 0, y: 0 }, { x: 10, y: 10 }],
        [],
        [{ x: 5, y: 5 }, { x: 6, y: 6 }],
      ],
      { width: 300, height: 120 },
    );
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="120" viewBox="0 0 300 120">')).toBe(true);
    expect(svg.match(/<path /g)).toHaveLength(2);
    expect(svg).toContain('d="M0 0L10 10"');
    expect(svg).toContain('stroke-linecap="round"');
  });

  it('measures ink and rejects stray taps as empty', () => {
    expect(strokeLength([{ x: 0, y: 0 }, { x: 3, y: 4 }])).toBe(5);
    expect(isSignatureEmpty([])).toBe(true);
    expect(isSignatureEmpty([[{ x: 1, y: 1 }]])).toBe(true);
    expect(isSignatureEmpty([[{ x: 0, y: 0 }, { x: 30, y: 40 }]])).toBe(false);
  });

  it('skips points closer than the minimum distance', () => {
    const s = [{ x: 0, y: 0 }];
    expect(appendPoint(s, { x: 0.5, y: 0.5 })).toBe(s);
    expect(appendPoint(s, { x: 5, y: 0 })).toEqual([{ x: 0, y: 0 }, { x: 5, y: 0 }]);
  });
});
