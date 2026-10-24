import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { analyzePhoto, isPhotoRequirement, type PhotoCheckKey, type PhotoCheckResult } from '../../src/lib/photoCheck/index.js';
import { photoJpeg, photoPng, photoWebp } from '../helpers/syntheticPhotos';

const check = (r: PhotoCheckResult, key: PhotoCheckKey) => {
  const c = r.checks.find((x) => x.key === key);
  if (!c) throw new Error(`check ${key} missing: ${JSON.stringify(r.checks.map((x) => x.key))}`);
  return c;
};
const failed = (r: PhotoCheckResult) => r.checks.filter((c) => !c.ok).map((c) => c.key);

describe('biometric photo check (synthetic photos)', () => {
  it('a good 35×45 photo at 600 dpi passes every rule', async () => {
    const r = await analyzePhoto(await photoJpeg());
    expect(failed(r)).toEqual([]);
    expect(r).toMatchObject({ ok: true, level: 'OK', width: 827, height: 1063 });
    expect(check(r, 'FILE_TYPE').value).toBe('JPEG');
    expect(check(r, 'HEAD_SIZE')).toMatchObject({ ok: true, approximate: true });
    expect(check(r, 'HEAD_CENTERED').ok).toBe(true);
    expect(new Date(r.checkedAt).getTime()).toBeGreaterThan(0);
    // PNG works the same way
    expect((await analyzePhoto(await photoPng())).ok).toBe(true);
  });

  it('rejects other formats and unreadable files', async () => {
    const webp = await analyzePhoto(await photoWebp());
    expect(webp.ok).toBe(false);
    expect(check(webp, 'FILE_TYPE')).toMatchObject({ ok: false, value: 'WEBP', severity: 'error' });
    const junk = await analyzePhoto(Buffer.from('not an image at all'), 'image/jpeg');
    expect(junk).toMatchObject({ ok: false, level: 'BAD', width: null });
    expect(junk.checks.map((c) => c.key)).toEqual(['FILE_TYPE']);
  });

  it('resolution: below 600 dpi warns, below 300 dpi fails', async () => {
    const mid = await analyzePhoto(await photoJpeg({ width: 500, height: 643 }));
    expect(check(mid, 'RESOLUTION')).toMatchObject({ ok: false, severity: 'warning', value: '500×643' });
    expect(mid.ok).toBe(true);
    expect(mid.level).toBe('WARN');
    const tiny = await analyzePhoto(await photoJpeg({ width: 300, height: 386 }));
    expect(check(tiny, 'RESOLUTION')).toMatchObject({ ok: false, severity: 'error' });
    expect(tiny.ok).toBe(false);
  });

  it('aspect ratio must be 35:45 ± 2 %', async () => {
    const square = await analyzePhoto(await photoJpeg({ width: 1400, height: 1400 }));
    expect(check(square, 'ASPECT_RATIO')).toMatchObject({ ok: false, value: 1, severity: 'error' });
    const slightly = await analyzePhoto(await photoJpeg({ width: 860, height: 1063 }));
    expect(check(slightly, 'ASPECT_RATIO')).toMatchObject({ ok: false, severity: 'warning' });
    const within = await analyzePhoto(await photoJpeg({ width: 835, height: 1063 }));
    expect(check(within, 'ASPECT_RATIO').ok).toBe(true);
  });

  it('background: coloured, busy, shaded and blown-out walls are reported', async () => {
    const blue = await analyzePhoto(await photoJpeg({ bg: [110, 160, 235] }));
    expect(check(blue, 'BG_NEUTRAL')).toMatchObject({ ok: false, severity: 'error' });
    const busy = await analyzePhoto(await photoJpeg({ bgNoise: 90 }));
    expect(check(busy, 'BG_UNIFORM')).toMatchObject({ ok: false, severity: 'error' });
    const shaded = await analyzePhoto(await photoJpeg({ bgGradient: 0.45 }));
    expect(check(shaded, 'BG_UNIFORM').ok).toBe(false);
    const dark = await analyzePhoto(await photoJpeg({ bg: [90, 90, 92] }));
    expect(check(dark, 'BG_LIGHT')).toMatchObject({ ok: false, severity: 'error' });
    const white = await analyzePhoto(await photoJpeg({ bg: [255, 255, 255] }));
    expect(check(white, 'BG_OVEREXPOSED')).toMatchObject({ ok: false, severity: 'warning' });
    expect(white.ok).toBe(true);
  });

  it('a dark, low-contrast photo fails brightness / contrast', async () => {
    const r = await analyzePhoto(await photoJpeg({ gain: 0.3 }));
    expect(check(r, 'BRIGHTNESS').ok).toBe(false);
    expect(check(r, 'BG_LIGHT')).toMatchObject({ ok: false, severity: 'error' });
    expect(check(r, 'CONTRAST').ok).toBe(false);
    expect(r.ok).toBe(false);
  });

  it('a blurred photo fails the sharpness rule (Laplacian variance)', async () => {
    const sharpR = await analyzePhoto(await photoJpeg());
    const blurred = await analyzePhoto(await photoJpeg({ blur: 4 }));
    expect(Number(check(blurred, 'SHARPNESS').value)).toBeLessThan(Number(check(sharpR, 'SHARPNESS').value) / 10);
    expect(check(blurred, 'SHARPNESS')).toMatchObject({ ok: false, severity: 'error' });
  });

  it('approximate head geometry: too small, off-centre, touching the top', async () => {
    const small = await analyzePhoto(await photoJpeg({ head: 0.45 }));
    expect(check(small, 'HEAD_SIZE')).toMatchObject({ ok: false, severity: 'warning', approximate: true });
    expect(small.ok).toBe(true); // a hint, never a blocker
    const off = await analyzePhoto(await photoJpeg({ centerX: 0.3, head: 0.6 }));
    expect(check(off, 'HEAD_CENTERED').ok).toBe(false);
    const touching = await analyzePhoto(await photoJpeg({ top: 0, head: 0.75 }));
    expect(check(touching, 'HEAD_TOP_MARGIN').ok).toBe(false);
  });

  it('EXIF rotation is applied before measuring', async () => {
    const upright = await photoJpeg();
    // stored landscape with orientation 6 ("rotate 90° clockwise to view")
    const rotated = await sharp(upright).rotate(-90).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const r = await analyzePhoto(rotated);
    expect(r.width).toBe(827);
    expect(r.height).toBe(1063);
    expect(check(r, 'ASPECT_RATIO').ok).toBe(true);
  });

  it('knows the photo requirement keys', () => {
    expect(isPhotoRequirement('PHOTO')).toBe(true);
    expect(isPhotoRequirement('PHOTO_2')).toBe(true);
    expect(isPhotoRequirement('PASSPORT')).toBe(false);
    expect(isPhotoRequirement(null)).toBe(false);
  });
});
