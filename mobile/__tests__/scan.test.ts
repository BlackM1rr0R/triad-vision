import { fitLongEdge, normaliseRotation, rotatedSize, scanFileName } from '@/lib/scan';

describe('scanner sizing', () => {
  it('shrinks the long edge to 1600 and never upscales', () => {
    expect(fitLongEdge({ width: 4000, height: 3000 })).toEqual({ width: 1600 });
    expect(fitLongEdge({ width: 3000, height: 4000 })).toEqual({ height: 1600 });
    expect(fitLongEdge({ width: 1200, height: 900 })).toBeNull();
    expect(fitLongEdge({ width: 1600, height: 1600 })).toBeNull();
    expect(fitLongEdge({ width: 0, height: 10 })).toBeNull();
  });

  it('swaps dimensions for quarter turns', () => {
    expect(rotatedSize({ width: 4000, height: 3000 }, 90)).toEqual({ width: 3000, height: 4000 });
    expect(rotatedSize({ width: 4000, height: 3000 }, 180)).toEqual({ width: 4000, height: 3000 });
    expect(rotatedSize({ width: 4000, height: 3000 }, 270)).toEqual({ width: 3000, height: 4000 });
    expect(rotatedSize({ width: 4000, height: 3000 }, -90)).toEqual({ width: 3000, height: 4000 });
  });

  it('normalises rotations', () => {
    expect(normaliseRotation(0)).toBe(0);
    expect(normaliseRotation(360)).toBe(0);
    expect(normaliseRotation(450)).toBe(90);
    expect(normaliseRotation(-90)).toBe(270);
  });

  it('names pages so they sort in order', () => {
    const now = new Date(Date.UTC(2026, 9, 15, 9, 30, 0));
    expect(scanFileName(1, 1, now)).toBe('scan-2026-10-15-09-30-00.jpg');
    expect(scanFileName(2, 3, now)).toBe('scan-2026-10-15-09-30-00-p2.jpg');
  });
});
