import { describe, expect, it } from 'vitest';
import { placementsOf, toPdfBox } from './UploadDialog';

describe('case contract upload: signature places', () => {
  it('converts a box drawn on the preview (CSS px, top-left) to PDF points (bottom-left)', () => {
    // A4 page shown at 1 px per 0.5 pt (scale 2 px/pt), media box at the origin.
    expect(toPdfBox({ left: 120, top: 1484, width: 400, height: 100 }, 2, { width: 595, height: 842, x: 0, y: 0 })).toEqual({ x: 60, y: 50, w: 200, h: 50 });
    // A shifted media box keeps its offset.
    expect(toPdfBox({ left: 0, top: 0, width: 10, height: 10 }, 1, { width: 100, height: 200, x: 5, y: 7 })).toEqual({ x: 5, y: 197, w: 10, h: 10 });
  });

  it('mapped form fields and drawn boxes become one list', () => {
    const out = placementsOf({
      info: {
        pageCount: 1,
        pages: [{ width: 595, height: 842, x: 0, y: 0 }],
        fields: [
          { name: 'sig_client', type: 'signature', page: 1, x: 50, y: 60, w: 150, h: 40 },
          { name: 'unused', type: 'text', page: 1, x: 0, y: 0, w: 10, h: 10 },
        ],
      },
      fields: { sig_client: 'CANDIDATE', unused: '' },
      boxes: [{ role: 'STAFF', page: 1, x: 300, y: 60, w: 150, h: 40 }],
    });
    expect(out).toEqual([
      { role: 'CANDIDATE', page: 1, x: 50, y: 60, w: 150, h: 40, field: 'sig_client' },
      { role: 'STAFF', page: 1, x: 300, y: 60, w: 150, h: 40 },
    ]);
  });
});
