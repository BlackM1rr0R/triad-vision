import { describe, expect, it } from 'vitest';
import { cropRect, faceHint, FRAME, outputSize, PHOTO_H_MM, PHOTO_RATIO } from './photoFrame';

describe('biometric photo frame', () => {
  it('the crown band gives a 32–36 mm head above the chin line (71–80 % of 45 mm)', () => {
    expect(FRAME.chinY - FRAME.crownMinY).toBe(36);
    expect(FRAME.chinY - FRAME.crownMaxY).toBe(32);
    expect((FRAME.chinY - FRAME.crownMaxY) / PHOTO_H_MM).toBeGreaterThan(0.7);
    expect((FRAME.chinY - FRAME.crownMinY) / PHOTO_H_MM).toBeLessThanOrEqual(0.8);
  });

  it('crops a landscape frame to the centred 35:45 strip and a tall frame vertically', () => {
    const land = cropRect(1920, 1080);
    expect(land.sh).toBe(1080);
    expect(land.sw).toBe(Math.round(1080 * PHOTO_RATIO));
    expect(land.sx).toBe(Math.round((1920 - land.sw) / 2));
    const tall = cropRect(1080, 1920);
    expect(tall).toMatchObject({ sx: 0, sw: 1080 });
    expect(tall.sh).toBe(Math.round(1080 / PHOTO_RATIO));
    expect(cropRect(0, 0)).toEqual({ sx: 0, sy: 0, sw: 0, sh: 0 });
  });

  it('never upscales, caps very large crops', () => {
    expect(outputSize(840, 1080)).toEqual({ width: 840, height: 1080 });
    const big = outputSize(2333, 3000);
    expect(big.height).toBe(2126);
    expect(big.width / big.height).toBeCloseTo(PHOTO_RATIO, 2);
  });

  it('face hints: centre first, then distance', () => {
    const crop = { sx: 0, sy: 0, sw: 700, sh: 900 };
    expect(faceHint({ x: 250, y: 200, width: 200, height: 500 }, crop)).toBe('ok');
    expect(faceHint({ x: 50, y: 200, width: 200, height: 500 }, crop)).toBe('center');
    expect(faceHint({ x: 300, y: 300, width: 100, height: 200 }, crop)).toBe('closer');
    expect(faceHint({ x: 150, y: 50, width: 400, height: 800 }, crop)).toBe('further');
  });
});
